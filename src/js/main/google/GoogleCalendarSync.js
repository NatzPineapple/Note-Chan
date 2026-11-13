/* ─────────────────────────────  GoogleCalendarSync.js  ──────────────────── */
const crypto = require("crypto");
const GoogleAuth = require("./GoogleAuth");
const EventUtils = require("../../EventUtils");
const { warn } = require("../../Logger");

const CALENDAR_ID = "primary";
const API_BASE = "https://www.googleapis.com/calendar/v3";
const SYNC_PAST_DAYS = 30;
const SYNC_FUTURE_DAYS = 365;
// Sobe quando a importação passa a ler algo novo; força uma leitura completa.
// 2: aniversários do Google viram aniversariantes · 3: guarda o eventType (googleType)
const IMPORT_VERSION = 3;

function localTimeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

async function apiFetch(pathAndQuery, options = {}) {
    const token = await GoogleAuth.getValidAccessToken();
    return fetch(`${API_BASE}${pathAndQuery}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });
}

/* ═══════════════════════  MAPEAMENTO DE RECORRÊNCIA  ══════════════════════ */

const RECURRENCE_TO_FREQ = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY", yearly: "YEARLY" };
const FREQ_TO_RECURRENCE = { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" };

function extractFreq(recurrenceArr) {
    if (!Array.isArray(recurrenceArr)) return null;
    for (const rule of recurrenceArr) {
        const m = /FREQ=([A-Z]+)/.exec(rule);
        if (m) return m[1];
    }
    return null;
}

function addHour(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    const total = (h * 60 + m + 60) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/* ═════════════════════  NOTE-CHAN  ->  GOOGLE (payload)  ══════════════════ */

function eventToGooglePayload(evt) {
    const timeZone = localTimeZone();
    const body = {
        summary: evt.title || "(sem título)",
        extendedProperties: { private: { noteChanId: evt.id } }
    };
    if (evt.link) body.description = evt.link;

    if (evt.startTime) {
        body.start = { dateTime: `${evt.date}T${evt.startTime}:00`, timeZone };
        body.end = { dateTime: `${evt.date}T${evt.endTime || addHour(evt.startTime)}:00`, timeZone };
    } else {
        body.start = { date: evt.date };
        body.end = { date: EventUtils.addInterval(evt.date, "daily") };
    }

    if (evt.recurrence && RECURRENCE_TO_FREQ[evt.recurrence]) {
        body.recurrence = [`RRULE:FREQ=${RECURRENCE_TO_FREQ[evt.recurrence]}`];
    }
    return body;
}

// PATCH mescla start/end campo a campo: sem zerar o formato antigo, um evento que
// passa de "dia inteiro" para "com horário" (ou o contrário) fica com date e dateTime
// juntos e o Google responde 400 "Invalid start time".
function withExclusiveTime(t) {
    return t.dateTime ? { ...t, date: null } : { ...t, dateTime: null, timeZone: null };
}

function eventPatchPayload(evt) {
    const full = eventToGooglePayload(evt);
    full.start = withExclusiveTime(full.start);
    full.end = withExclusiveTime(full.end);
    if (evt.foreign === false) return full;
    return { summary: full.summary, start: full.start, end: full.end };
}

function birthdayToGooglePayload(b) {
    const [, mm, dd] = b.date.split("-");
    const y = b.date.split("-")[0];
    const start = `${y}-${mm}-${dd}`;
    return {
        summary: `Aniversário de ${b.name}`,
        start: { date: start },
        end: { date: EventUtils.addInterval(start, "daily") },
        recurrence: ["RRULE:FREQ=YEARLY"],
        extendedProperties: { private: { noteChanBirthdayId: b.id } }
    };
}

/* ═════════════════════  GOOGLE  ->  NOTE-CHAN (campos)  ═══════════════════ */

function localDateAndTime(isoWithOffset) {
    const dt = new Date(isoWithOffset);
    if (Number.isNaN(dt.getTime())) return { date: null, time: null };
    const p = n => String(n).padStart(2, "0");
    return {
        date: `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`,
        time: `${p(dt.getHours())}:${p(dt.getMinutes())}`
    };
}

function googleToEventFields(gEvt) {
    const isAllDay = !!gEvt.start?.date;
    if (!isAllDay && !gEvt.start?.dateTime) return null;

    const start = isAllDay ? { date: gEvt.start.date, time: null } : localDateAndTime(gEvt.start.dateTime);
    if (!start.date) return null;

    const date = start.date;
    const startTime = start.time;
    const endTime = isAllDay || !gEvt.end?.dateTime ? null : localDateAndTime(gEvt.end.dateTime).time;
    const freq = extractFreq(gEvt.recurrence);
    const recurrence = (freq && FREQ_TO_RECURRENCE[freq]) || "none";
    const desc = (gEvt.description || "").trim();
    return {
        title: gEvt.summary || "(sem título)",
        date,
        startTime,
        endTime,
        recurrence,
        link: /^https?:\/\//i.test(desc) ? desc : null,
        googleType: gEvt.eventType || "default"
    };
}

/* ════════════════════  GOOGLE  ->  NOTE-CHAN (aniversários)  ═════════════ */

const BIRTHDAY_TITLE = /^\s*(anivers[aá]rio|niver)\s+(d[eoa]s?\s+)?(.+?)\s*$/i;

// Aniversário vindo do Google: o tipo nativo (contatos / perfil, eventType
// "birthday") ou um evento anual de dia inteiro chamado "Aniversário de X".
function isGoogleBirthday(gEvt) {
    if (gEvt.eventType === "birthday") return true;
    return !!gEvt.start?.date && extractFreq(gEvt.recurrence) === "YEARLY" && BIRTHDAY_TITLE.test(gEvt.summary || "");
}

function googleToBirthdayFields(gEvt) {
    const date = gEvt.start?.date;
    if (!date) return null;
    const summary = (gEvt.summary || "").trim();
    const m = BIRTHDAY_TITLE.exec(summary);
    let name = m ? m[3] : summary;
    if (gEvt.birthdayProperties?.type === "self") name = "Meu aniversário";
    return { name: name || "(sem nome)", date };
}

const monthDay = date => date.slice(5);
const sameName = (a, b) => a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");

function applyGoogleBirthday(data, gEvt) {
    const existing = data.birthdays.find(b => b.googleEventId === gEvt.id);
    if (gEvt.status === "cancelled") {
        if (existing) data.birthdays = data.birthdays.filter(b => b.id !== existing.id);
        return;
    }
    const fields = googleToBirthdayFields(gEvt);
    if (!fields) return;

    // Já importado antes como evento comum: vira aniversariante.
    data.events = data.events.filter(e => e.googleEventId !== gEvt.id);

    const stamp = Date.now();
    if (existing) {
        Object.assign(existing, fields, { updatedAt: stamp, googleSyncedAt: stamp, foreign: true });
        return;
    }
    // Mesmo nome e mesmo dia de um aniversariante local ainda não sincronizado:
    // é a mesma pessoa — liga os dois em vez de duplicar (aqui e no Google).
    const twin = data.birthdays.find(b => !b.googleEventId
        && monthDay(b.date) === monthDay(fields.date) && sameName(b.name, fields.name));
    if (twin) {
        Object.assign(twin, { googleEventId: gEvt.id, googleSyncedAt: stamp, foreign: true });
        return;
    }
    data.birthdays.push({
        id: crypto.randomUUID(),
        ...fields,
        category: "",
        googleEventId: gEvt.id,
        foreign: true,
        createdAt: stamp,
        updatedAt: stamp,
        googleSyncedAt: stamp
    });
}

/* ═══════════════════════════════  SYNC  ════════════════════════════════ */

async function processPendingDeletes(data) {
    const ids = [...data.googleSync.pendingDeletes];
    if (ids.length === 0) return;

    const done = new Set();
    for (const id of ids) {
        try {
            const res = await apiFetch(`/calendars/${CALENDAR_ID}/events/${encodeURIComponent(id)}`, { method: "DELETE" });
            if (res.ok || res.status === 404 || res.status === 410) done.add(id);
            else if (res.status === 400 || res.status === 403) {
                // Recusa definitiva (ex.: aniversário de contato, que só o Google
                // Contatos apaga) — tentar de novo a cada sync não adianta.
                done.add(id);
                warn("[GOOGLE] Google recusou excluir o evento, removido da fila:", id, res.status, await res.text().catch(() => ""));
            } else warn("[GOOGLE] Falha ao excluir evento remoto (fica na fila)", id, res.status);
        } catch (e) {
            warn("[GOOGLE] Erro ao excluir evento remoto (fica na fila)", id, e.message);
        }
    }
    data.googleSync.pendingDeletes = data.googleSync.pendingDeletes.filter(id => !done.has(id));
}

async function listGoogleEvents(data) {
    const baseParams = { singleEvents: "false", maxResults: "2500", showDeleted: "true" };
    let usingSyncToken = !!data.googleSync.syncToken;

    async function fetchAll(params) {
        let items = [];
        let pageToken = null;
        let nextSyncToken = null;
        do {
            const query = new URLSearchParams(params);
            if (pageToken) query.set("pageToken", pageToken);
            const res = await apiFetch(`/calendars/${CALENDAR_ID}/events?${query.toString()}`);
            if (res.status === 410) {
                const err = new Error("SYNC_TOKEN_INVALID");
                err.code = "SYNC_TOKEN_INVALID";
                throw err;
            }
            if (!res.ok) throw new Error(`Falha ao listar eventos do Google (${res.status}): ${await res.text()}`);
            const json = await res.json();
            items = items.concat(json.items || []);
            pageToken = json.nextPageToken || null;
            nextSyncToken = json.nextSyncToken || nextSyncToken;
        } while (pageToken);
        return { items, nextSyncToken };
    }

    if (usingSyncToken) {
        try {
            return await fetchAll({ ...baseParams, syncToken: data.googleSync.syncToken });
        } catch (e) {
            if (e.code !== "SYNC_TOKEN_INVALID") throw e;
            data.googleSync.syncToken = null; 
        }
    }

    const now = Date.now();
    const timeMin = new Date(now - SYNC_PAST_DAYS * 86400000).toISOString();
    const timeMax = new Date(now + SYNC_FUTURE_DAYS * 86400000).toISOString();
    return fetchAll({ ...baseParams, timeMin, timeMax });
}

function applyGoogleEventsToLocal(data, googleItems) {
    for (const gEvt of googleItems) {
        const noteChanId = gEvt.extendedProperties?.private?.noteChanId;
        const birthdayId = gEvt.extendedProperties?.private?.noteChanBirthdayId;

        if (birthdayId) {
            const local = data.birthdays.find(b => b.id === birthdayId);
            if (gEvt.status === "cancelled") {
                data.birthdays = data.birthdays.filter(b => b.id !== birthdayId);
            } else if (local) {
                local.googleEventId = gEvt.id;
                local.googleSyncedAt = Date.now();
            } else {
                // Criado pelo Note-Chan mas sumiu daqui (outra máquina, dados
                // restaurados...): recria o aniversariante em vez de ignorar.
                const fields = googleToBirthdayFields(gEvt);
                if (fields) {
                    const stamp = Date.now();
                    data.birthdays.push({
                        id: birthdayId, ...fields, category: "",
                        googleEventId: gEvt.id, createdAt: stamp, updatedAt: stamp, googleSyncedAt: stamp
                    });
                }
            }
            continue;
        }

        if (!noteChanId && isGoogleBirthday(gEvt)) {
            applyGoogleBirthday(data, gEvt);
            continue;
        }

        if (noteChanId) {
            const local = data.events.find(e => e.id === noteChanId);
            if (!local) continue;
            if (gEvt.status === "cancelled") {
                data.events = data.events.filter(e => e.id !== noteChanId);
            } else {
                const fields = googleToEventFields(gEvt);
                if (!fields) { warn("[GOOGLE] Evento sem início utilizável, ignorado:", gEvt.id); continue; }
                Object.assign(local, fields);
                local.googleEventId = gEvt.id;
                local.foreign = false; 
                local.updatedAt = Date.now();
                local.googleSyncedAt = local.updatedAt;
            }
            continue;
        }

        // Evento "estrangeiro" (criado direto no Google, sem nossa tag).
        const existing = data.events.find(e => e.googleEventId === gEvt.id);
        if (gEvt.status === "cancelled") {
            // Excluído no Google: cancelados vêm só com id/status, sem dizer se era aniversário.
            if (existing) data.events = data.events.filter(e => e.id !== existing.id);
            data.birthdays = data.birthdays.filter(b => b.googleEventId !== gEvt.id);
            continue;
        }
        const fields = googleToEventFields(gEvt);
        if (!fields) { warn("[GOOGLE] Evento sem início utilizável, ignorado:", gEvt.id); continue; }
        if (existing) {
            Object.assign(existing, fields);
            existing.updatedAt = Date.now();
            existing.googleSyncedAt = existing.updatedAt;
            existing.foreign = true;
        } else {
            const stamp = Date.now();
            data.events.push({
                id: crypto.randomUUID(),
                ...fields,
                completedDates: [],
                items: [],
                googleEventId: gEvt.id,
                foreign: true,
                createdAt: stamp,
                updatedAt: stamp,
                googleSyncedAt: stamp
            });
        }
    }
}

async function pushNewLocalItems(data) {
    for (const evt of data.events) {
        if (evt.googleEventId) continue;
        try {
            const res = await apiFetch(`/calendars/${CALENDAR_ID}/events`, {
                method: "POST",
                body: JSON.stringify(eventToGooglePayload(evt))
            });
            if (!res.ok) { warn("[GOOGLE] Falha ao criar evento", evt.title, res.status); continue; }
            evt.googleEventId = (await res.json()).id;
            evt.googleSyncedAt = Date.now();
            evt.foreign = false; 
        } catch (e) {
            warn("[GOOGLE] Erro ao criar evento", evt.title, e.message);
        }
    }

    for (const b of data.birthdays) {
        if (b.googleEventId) continue;
        try {
            const res = await apiFetch(`/calendars/${CALENDAR_ID}/events`, {
                method: "POST",
                body: JSON.stringify(birthdayToGooglePayload(b))
            });
            if (!res.ok) { warn("[GOOGLE] Falha ao criar aniversário", b.name, res.status); continue; }
            b.googleEventId = (await res.json()).id;
            b.googleSyncedAt = Date.now();
        } catch (e) {
            warn("[GOOGLE] Erro ao criar aniversário", b.name, e.message);
        }
    }
}

async function patchItem(googleEventId, payload, label) {
    const res = await apiFetch(`/calendars/${CALENDAR_ID}/events/${encodeURIComponent(googleEventId)}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
    });
    if (res.ok) return true;
    if (res.status === 404 || res.status === 410) return null;
    warn("[GOOGLE] Falha ao atualizar", label, res.status, await res.text().catch(() => ""));
    return false;
}

function adoptLegacyItems(data) {
    const stamp = Date.now();
    for (const item of [...data.events, ...data.birthdays]) {
        if (item.googleEventId && item.googleSyncedAt === undefined) {
            item.googleSyncedAt = Math.max(item.updatedAt || 0, stamp);
        }
    }
}

async function pushLocalChanges(data) {
    const changed = item => item.googleEventId && (item.updatedAt || 0) > (item.googleSyncedAt || 0);

    for (const evt of data.events.filter(changed)) {
        // Tipos especiais do Google (fromGmail, focusTime, outOfOffice...) não
        // aceitam mudar título/horário pela API (400). Ficam só leitura de lá.
        if (evt.googleType && evt.googleType !== "default") { evt.googleSyncedAt = evt.updatedAt; continue; }
        try {
            const result = await patchItem(evt.googleEventId, eventPatchPayload(evt), evt.title);
            if (result === null) { evt.googleEventId = null; evt.googleSyncedAt = 0; }
            else if (result) evt.googleSyncedAt = Date.now();
        } catch (e) {
            warn("[GOOGLE] Erro ao atualizar evento", evt.title, e.message);
        }
    }

    for (const b of data.birthdays.filter(changed)) {
        // Aniversário que veio do Google (contatos, perfil ou criado lá) é só
        // leitura: os nativos não aceitam edição pela API, e renomear aqui não
        // deve reescrever o evento de lá.
        if (b.foreign) { b.googleSyncedAt = b.updatedAt; continue; }
        try {
            const result = await patchItem(b.googleEventId, birthdayToGooglePayload(b), b.name);
            if (result === null) { b.googleEventId = null; b.googleSyncedAt = 0; }
            else if (result) b.googleSyncedAt = Date.now();
        } catch (e) {
            warn("[GOOGLE] Erro ao atualizar aniversário", b.name, e.message);
        }
    }
}

async function runSync(data) {
    if (!GoogleAuth.isConnected()) return { ok: false, error: "not-connected" };
    data.googleSync = data.googleSync || { syncToken: null, lastSyncAt: null, pendingDeletes: [] };

    // Versões antigas importavam aniversários do Google como eventos comuns. Uma
    // leitura completa (sem syncToken) reaplica todos e converte os que já vieram.
    const precisaReimportar = (data.googleSync.importVersion || 0) < IMPORT_VERSION;
    if (precisaReimportar) data.googleSync.syncToken = null;

    try {
        adoptLegacyItems(data);
        await processPendingDeletes(data);
        await pushLocalChanges(data);   // sobe edições ANTES de ler (ver pushLocalChanges)
        const { items, nextSyncToken } = await listGoogleEvents(data);
        applyGoogleEventsToLocal(data, items);
        await pushNewLocalItems(data);

        if (precisaReimportar) data.googleSync.importVersion = IMPORT_VERSION;
        if (nextSyncToken) data.googleSync.syncToken = nextSyncToken;
        data.googleSync.lastSyncAt = Date.now();
        return { ok: true, count: items.length };
    } catch (e) {
        warn("[GOOGLE] Falha na sincronização:", e.message);
        return { ok: false, error: e.message };
    }
}

module.exports = { runSync };
