/* ────────────────────────────  BirthdayCards.js  ────────────────────────── */
(function (factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        window.BirthdayCards = factory();
    }
})(function () {

    const NEW_BIRTHDAY_NAME = "Novo aniversariante";
    const SAVE_DELAY_MS = 400;
    const CATEGORY_LABELS = { "": "Sem categoria", familia: "Família", amigo: "Amigo", trabalho: "Trabalho" };
    const CATEGORY_ICONS = { familia: "users", amigo: "user", trabalho: "briefcase" };

    function birthdayBadge(dateStr) {
        const occ = EventUtils.nextBirthdayOccurrence(dateStr);
        const today = EventUtils.todayISO();
        const cakeIcon = Icons.svg("cake", 11);
        if (occ === today) return { text: `${cakeIcon} Hoje!`, cls: "today" };
        if (occ === EventUtils.addInterval(today, "daily")) return { text: `${cakeIcon} Amanhã`, cls: "soon" };
        const diffDays = Math.round((new Date(occ) - new Date(today)) / 86400000);
        return { text: `${UiUtils.formatBR(occ)} · faltam ${diffDays}d`, cls: "" };
    }

    function criar({ podeSalvar, antesDeCriar }) {
        const { newId, escapeHtml, armDeleteConfirm, clickStartedInside } = UiUtils;
        const now = () => Date.now();

        const board  = document.getElementById("bday-board");
        const newBtn = document.getElementById("bday-new-btn");

        let birthdays = [];
        const expanded = new Set();
        let intocado = { id: null, date: null };

        /* ───────────────────────  Gravação  ──────────────────────────── */

        let saveTimer = null;
        function scheduleSave() {
            if (!podeSalvar()) return;
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                saveTimer = null;
                window.api.send("save-data", { birthdays });
            }, SAVE_DELAY_MS);
        }

        function salvarPendente() {
            if (!saveTimer) return;
            clearTimeout(saveTimer);
            saveTimer = null;
            window.api.send("save-data", { birthdays });
        }

        function descartarSeIntocado() {
            const { id, date } = intocado;
            if (!id) return;
            intocado = { id: null, date: null };

            const b = birthdays.find(x => x.id === id);
            if (!b) return;
            if (b.name !== NEW_BIRTHDAY_NAME || b.category || b.date !== date) return;

            birthdays = birthdays.filter(x => x.id !== id);
            expanded.delete(id);
            scheduleSave();
            render();
        }

        /* ─────────────────────────  Tela  ────────────────────────────── */

        function render() {
            board.innerHTML = "";
            const items = [...birthdays].sort((a, b) => {
                const occA = EventUtils.nextBirthdayOccurrence(a.date);
                const occB = EventUtils.nextBirthdayOccurrence(b.date);
                return occA < occB ? -1 : occA > occB ? 1 : 0;
            });

            if (items.length === 0) {
                const msg = document.createElement("div");
                msg.className = "empty-msg";
                msg.textContent = "Nenhum aniversariante ainda. Crie o primeiro acima.";
                board.appendChild(msg);
                return;
            }

            const frag = document.createDocumentFragment();
            items.forEach(b => frag.appendChild(cardNode(b)));
            board.appendChild(frag);
        }

        function cardNode(birthday) {
            const card = document.createElement("div");
            card.className = "card" + (expanded.has(birthday.id) ? " expanded" : "");
            card.dataset.id = birthday.id;

            card.innerHTML = `
                <div class="card-delete" title="Excluir aniversariante">${Icons.svg("x", 12)}</div>
                <div class="card-header">
                    <span class="card-title" spellcheck="false">${escapeHtml(birthday.name)}</span>
                </div>
                <div class="card-preview"></div>
                <div class="card-body">
                    <div class="event-fields">
                        <div class="event-row">
                            <label>Data de nascimento
                                <input type="date" class="bd-date" value="${birthday.date}" />
                            </label>
                            <label>Categoria
                                <select class="bd-category">
                                    ${Object.entries(CATEGORY_LABELS).map(([value, label]) =>
                                        `<option value="${value}" ${birthday.category === value ? "selected" : ""}>${label}</option>`
                                    ).join("")}
                                </select>
                            </label>
                        </div>
                    </div>
                </div>
            `;

            const preview = card.querySelector(".card-preview");

            function refreshPreview() {
                const badge = birthdayBadge(birthday.date);
                const age = EventUtils.ageAtOccurrence(birthday.date, EventUtils.nextBirthdayOccurrence(birthday.date));
                const catLabel = birthday.category
                    ? `${Icons.svg(CATEGORY_ICONS[birthday.category], 11)} ${CATEGORY_LABELS[birthday.category]}`
                    : "";
                preview.innerHTML =
                    `<span class="birthday-badge ${badge.cls}">${badge.text}</span>` +
                    (age ? ` faz ${age} anos` : "") +
                    (catLabel ? ` <span class="birthday-category">${catLabel}</span>` : "");
            }
            refreshPreview();

            card.addEventListener("focusout", () => {
                setTimeout(() => {
                    if (card.contains(document.activeElement)) return;
                    if (clickStartedInside(card)) return;

                    if (intocado.id === birthday.id) descartarSeIntocado();

                    if (birthdays.some(b => b.id === birthday.id)) {
                        card.classList.remove("expanded");
                        expanded.delete(birthday.id);
                    }
                }, 0);
            });

            card.querySelector(".card-header").addEventListener("click", (e) => {
                if (e.detail > 1) return;
                card.classList.toggle("expanded");
                if (card.classList.contains("expanded")) {
                    expanded.add(birthday.id);
                    card.querySelector(".bd-date")?.focus();
                } else {
                    expanded.delete(birthday.id);
                }
            });

            const title = card.querySelector(".card-title");
            RichEditor.ligarSetas(title);
            title.addEventListener("dblclick", (e) => {
                e.stopPropagation();
                if (!card.classList.contains("expanded")) {
                    card.classList.add("expanded");
                    expanded.add(birthday.id);
                }
                title.contentEditable = "true";
                title.focus();
                document.execCommand("selectAll", false, null);
            });
            title.addEventListener("click", (e) => { if (title.isContentEditable) e.stopPropagation(); });
            title.addEventListener("blur", () => {
                title.contentEditable = "false";
                birthday.name = title.textContent.trim() || "Sem nome";
                title.textContent = birthday.name;
                birthday.updatedAt = now();
                scheduleSave();
            });
            title.addEventListener("keydown", (e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                e.stopPropagation();
                title.blur();
            });

            card.querySelector(".bd-date").addEventListener("change", (e) => {
                birthday.date = e.target.value || EventUtils.todayISO();
                e.target.value = birthday.date;
                birthday.updatedAt = now();
                refreshPreview();
                scheduleSave();
            });

            card.querySelector(".bd-category").addEventListener("change", (e) => {
                birthday.category = e.target.value;
                birthday.updatedAt = now();
                refreshPreview();
                scheduleSave();
            });

            card.querySelector(".card-delete").addEventListener("click", (e) => {
                e.stopPropagation();
                armDeleteConfirm(e.currentTarget, () => {
                    birthdays = birthdays.filter(b => b.id !== birthday.id);
                    expanded.delete(birthday.id);
                    scheduleSave();
                    card.remove();
                    if (birthdays.length === 0) render();
                });
            });

            return card;
        }

        function criarNovo() {
            antesDeCriar();
            const birthday = {
                id: newId(), name: NEW_BIRTHDAY_NAME, date: EventUtils.todayISO(), category: "",
                createdAt: now(), updatedAt: now()
            };
            birthdays.push(birthday);
            intocado = { id: birthday.id, date: birthday.date };
            scheduleSave();
            render();
            expanded.add(birthday.id);
            const card = board.querySelector(`.card[data-id="${birthday.id}"]`);
            if (card) {
                card.classList.add("expanded");
                const title = card.querySelector(".card-title");
                title.contentEditable = "true";
                title.focus();
                document.execCommand("selectAll", false, null);
            }
        }

        newBtn.addEventListener("click", criarNovo);

        /* ──────────  Atualizações do Main sem atropelar a edição  ────── */

        let pendingUpdate = null;

        function estaEditando() {
            const el = document.activeElement;
            if (!el || !board.contains(el)) return false;
            return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "SELECT";
        }

        function aplicarAtualizacao(fn) {
            if (estaEditando()) { pendingUpdate = fn; return; }
            fn();
            render();
        }

        document.addEventListener("focusout", () => setTimeout(() => {
            if (!pendingUpdate || estaEditando()) return;
            const fn = pendingUpdate;
            pendingUpdate = null;
            fn();
            render();
        }, 0));

        window.api.on("birthdays-updated", (updated) => {
            aplicarAtualizacao(() => {
                const localById = new Map(birthdays.map(b => [b.id, b]));
                birthdays = updated.map(inc => {
                    const local = localById.get(inc.id);
                    return local && (local.updatedAt || 0) > (inc.updatedAt || 0) ? local : inc;
                });
            });
        });

        function carregar(lista) {
            birthdays = lista || [];
            render();
        }

        return { carregar, criarNovo, descartarSeIntocado, salvarPendente };
    }

    return { criar };
});
