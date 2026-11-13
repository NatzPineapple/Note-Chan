/* ─────────────────────────────  EventCard.js  ───────────────────────────── */
(function (factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        window.EventCard = factory();
    }
})(function () {

    const RECURRENCE_ICON = () => Icons.svg("repeat", 11);
    const RECURRENCE_LABELS = {
        none: "Não se repete",
        daily: "Diário",
        weekly: "Semanal",
        monthly: "Mensal",
        yearly: "Anual"
    };

    function recurrenceLabel(recurrence) {
        if (!RECURRENCE_LABELS[recurrence]) return "";
        return recurrence === "none" ? RECURRENCE_LABELS.none : `${RECURRENCE_ICON()} ${RECURRENCE_LABELS[recurrence]}`;
    }

    function occurrenceBadge(occDate) {
        const { formatBR } = UiUtils;
        if (!occDate) return { text: `${Icons.svg("check", 11)} Concluído`, cls: "done" };
        const today = EventUtils.todayISO();
        if (occDate === today) return { text: "Hoje", cls: "today" };
        if (occDate === EventUtils.addInterval(today, "daily")) return { text: "Amanhã", cls: "soon" };
        return { text: formatBR(occDate), cls: "" };
    }

    const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
    const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const DIAS_POR_PAGINA = 30;

    function horarioDoEvento(event) {
        if (!event.startTime) return "Dia inteiro";
        return event.endTime ? `${event.startTime} – ${event.endTime}` : event.startTime;
    }

    const FEEDBACK = {
        idle:    { cls: "",        icon: "check",      text: "Salvar" },
        saving:  { cls: "saving",  icon: "refresh-cw", text: "Salvando…" },
        synced:  { cls: "ok",      icon: "check",      text: "Salvo e sincronizado" },
        saved:   { cls: "ok",      icon: "check",      text: "Salvo" },
        failed:  { cls: "warn",    icon: "x",          text: "Salvo · falhou ao sincronizar" }
    };
    const FEEDBACK_MS = 2500;

    function aplicarFeedback(btn, estado = "idle") {
        const f = FEEDBACK[estado] || FEEDBACK.idle;
        btn.className = "event-save-btn" + (f.cls ? " " + f.cls : "");
        btn.innerHTML = `${Icons.svg(f.icon, 13)} ${f.text}`;
        btn.disabled = estado === "saving";
    }

    function criar({ obterDados, salvar, sincronizar, renderBoard, board, expanded, base, abrirNosCards }) {
        const { newId, escapeHtml, armDeleteConfirm } = UiUtils;
        const now = () => Date.now();

        // O board pode ser re-renderizado no meio da sincronização (events-updated),
        // então o estado do botão fica aqui fora, por id, e é reaplicado no card novo.
        const feedbackSalvar = new Map();
        const timersFeedback = new Map();

        function mostrarFeedback(id, estado) {
            clearTimeout(timersFeedback.get(id));
            if (estado === "idle") feedbackSalvar.delete(id);
            else feedbackSalvar.set(id, estado);
            const btn = board.querySelector(`.card[data-id="${id}"] .event-save-btn`);
            if (btn) aplicarFeedback(btn, estado);
            if (estado !== "idle" && estado !== "saving") {
                timersFeedback.set(id, setTimeout(() => mostrarFeedback(id, "idle"), FEEDBACK_MS));
            }
        }

        async function salvarESincronizar(id) {
            mostrarFeedback(id, "saving");
            const result = await sincronizar();
            if (result?.ok) mostrarFeedback(id, "synced");
            else if (!result || result.error === "not-connected") mostrarFeedback(id, "saved");
            else mostrarFeedback(id, "failed");
        }

        function criarNode(event) {
            const card = document.createElement("div");
            card.className = "card" + (expanded.has(event.id) ? " expanded" : "");
            card.dataset.id = event.id;

            card.innerHTML = `
                <div class="card-delete" title="Excluir evento">${Icons.svg("x", 12)}</div>
                <div class="card-header">
                    <span class="card-title" spellcheck="false">${escapeHtml(event.title)}</span>
                    <div class="card-tags">${base.cardTagsInnerHtml(event.tagIds)}</div>
                </div>
                <div class="card-preview"></div>
                <div class="card-body">
                    <div class="event-fields">
                        <div class="event-row">
                            <label>Data
                                <input type="date" class="ev-date" value="${event.date}" />
                            </label>
                            <label>Recorrência
                                <select class="ev-recurrence">
                                    <option value="none"    ${event.recurrence === "none" ? "selected" : ""}>Não se repete</option>
                                    <option value="daily"   ${event.recurrence === "daily" ? "selected" : ""}>Diariamente</option>
                                    <option value="weekly"  ${event.recurrence === "weekly" ? "selected" : ""}>Semanalmente</option>
                                    <option value="monthly" ${event.recurrence === "monthly" ? "selected" : ""}>Mensalmente</option>
                                    <option value="yearly"  ${event.recurrence === "yearly" ? "selected" : ""}>Anualmente</option>
                                </select>
                            </label>
                        </div>
                        <div class="event-row">
                            <label>Início (opcional)
                                <input type="time" class="ev-start" value="${event.startTime || ""}" />
                            </label>
                            <label>Fim (opcional)
                                <input type="time" class="ev-end" value="${event.endTime || ""}" />
                            </label>
                        </div>
                        <div class="event-link-row">
                            <label>Link (opcional)
                                <input type="text" class="ev-link" placeholder="https://..." value="${escapeHtml(event.link || "")}" />
                            </label>
                            <button class="event-open-link" title="Abrir link" ${event.link ? "" : "disabled"}>${Icons.svg("external-link", 12)} Abrir</button>
                        </div>
                    </div>
                    <div class="event-checklist-label">Checklist</div>
                    <div class="item-list"></div>
                    <input class="item-add" type="text" placeholder="+ Adicionar tarefa e pressionar Enter" draggable="false" />
                    <div class="tag-picker"></div>
                    <button class="event-save-btn"></button>
                </div>
            `;

            const preview   = card.querySelector(".card-preview");
            const saveBtn   = card.querySelector(".event-save-btn");
            aplicarFeedback(saveBtn, feedbackSalvar.get(event.id));
            const openLink  = card.querySelector(".event-open-link");
            if (!Array.isArray(event.items)) event.items = []; // eventos criados antes dessa versão não têm items
            base.renderTagPicker(card.querySelector(".tag-picker"), event);

            function refreshPreview() {
                const occ = EventUtils.getNextOccurrence(event);
                const badge = occurrenceBadge(occ);
                const timeLabel = event.startTime
                    ? ` · ${event.startTime}${event.endTime ? "–" + event.endTime : ""}`
                    : "";
                const checklistLabel = event.items.length
                    ? ` · ${event.items.filter(i => i.done).length}/${event.items.length} tarefas`
                    : "";
                preview.innerHTML =
                    `<span class="event-badge ${badge.cls}">${badge.text}</span>${recurrenceLabel(event.recurrence)}${timeLabel}${checklistLabel}`;
            }
            refreshPreview();

            base.montarChecklist(event, card.querySelector(".item-list"), card.querySelector(".item-add"), refreshPreview);

            const title = card.querySelector(".card-title");

            function expandEvent() {
                card.classList.add("expanded");
                expanded.add(event.id);
            }

            function collapseEvent() {
                if (!card.classList.contains("expanded")) return;
                card.classList.remove("expanded");
                expanded.delete(event.id);
                if (title.isContentEditable) commitTitle();
            }

            const cardHeader = base.attachHeaderToggle(card, title, expandEvent, collapseEvent);

            function commitTitle() {
                title.contentEditable = "false";
                event.title = title.textContent.trim() || "Sem título";
                title.textContent = event.title;
                event.updatedAt = now();
                salvar();
            }

            title.addEventListener("blur", commitTitle);
            const dateEl       = card.querySelector(".ev-date");
            const recurrenceEl = card.querySelector(".ev-recurrence");
            const startEl      = card.querySelector(".ev-start");
            const endEl        = card.querySelector(".ev-end");
            const linkEl       = card.querySelector(".ev-link");

            const fieldOrder = [title, dateEl, recurrenceEl, startEl, endEl, linkEl];

            function focusField(field) {
                if (field === title) {
                    cardHeader.beginTitleEdit();
                } else {
                    field.focus();
                    if (typeof field.select === "function") field.select();
                }
            }

            function focusNextField(current) {
                const idx = fieldOrder.indexOf(current);
                const next = idx === -1 ? null : fieldOrder[idx + 1];
                if (!next) { current.blur(); return; }
                focusField(next);
            }

            fieldOrder.forEach((field, idx) => {
                field.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        e.stopPropagation();
                        focusNextField(field);
                    } else if (e.key === "Tab") {
                        if (!e.shiftKey && idx === fieldOrder.length - 1) {
                            e.preventDefault();
                            focusField(fieldOrder[0]);
                        } else if (e.shiftKey && idx === 0) {
                            e.preventDefault();
                            focusField(fieldOrder[fieldOrder.length - 1]);
                        }
                    }
                });
            });

            function aoMudarCampo(aplicar) {
                return (e) => {
                    aplicar(e.target.value);
                    event.updatedAt = now();
                    refreshPreview();
                    salvar();
                };
            }

            dateEl.addEventListener("change", aoMudarCampo(valor => {
                event.date = valor || EventUtils.todayISO();
                dateEl.value = event.date;
            }));
            recurrenceEl.addEventListener("change", aoMudarCampo(valor => { event.recurrence = valor; }));
            startEl.addEventListener("change", aoMudarCampo(valor => { event.startTime = valor || null; }));
            endEl.addEventListener("change", aoMudarCampo(valor => { event.endTime = valor || null; }));

            linkEl.addEventListener("blur", (e) => {
                event.link = e.target.value.trim() || null;
                openLink.disabled = !event.link;
                event.updatedAt = now();
                salvar();
            });

            openLink.addEventListener("click", (e) => {
                e.stopPropagation();
                if (event.link) window.api.send("open-link", event.link);
            });

            saveBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (title.isContentEditable) commitTitle();
                salvarESincronizar(event.id);
            });

            card.querySelector(".card-delete").addEventListener("click", (e) => {
                e.stopPropagation();
                armDeleteConfirm(e.currentTarget, () => {
                    const data = obterDados();
                    data.events = data.events.filter(ev => ev.id !== event.id);
                    expanded.delete(event.id);
                    feedbackSalvar.delete(event.id);
                    card.remove();
                    if (data.events.length === 0) renderBoard();
                    sincronizar();
                });
            });

            return card;
        }

        function criarNovo() {
            const event = {
                id: newId(),
                title: "Novo evento",
                date: EventUtils.todayISO(),
                recurrence: "none",
                startTime: null,
                endTime: null,
                link: null,
                completedDates: [],
                items: [],
                createdAt: now(),
                updatedAt: now()
            };
            obterDados().events.push(event);
            salvar();
            renderBoard();
            expanded.add(event.id);
            const card = board.querySelector(`.card[data-id="${event.id}"]`);
            if (card) {
                card.classList.add("expanded");
                const title = card.querySelector(".card-title");
                title.contentEditable = "true";
                title.focus();
                document.execCommand("selectAll", false, null);
            }
        }

        /* ─────────────────────────────  Agenda  ───────────────────────────── */

        let diasNaAgenda = DIAS_POR_PAGINA;

        function tagDoEvento(event) {
            return (event.tagIds || [])
                .map(id => TagUtils.findTag(obterDados().tags, id))
                .find(Boolean) || null;
        }

        const COR_ANIVERSARIO = "#d9577f";

        function tingir(item, cor) {
            item.classList.add("tagged");
            item.style.setProperty("--ev-cor", cor);
        }

        function itemDaAgenda(event) {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "agenda-item";
            item.dataset.id = event.id;
            const tag = tagDoEvento(event);
            if (tag) tingir(item, `#${TagUtils.corSegura(tag.color)}`);
            const repete = event.recurrence && event.recurrence !== "none" ? Icons.svg("repeat", 10) : "";
            item.innerHTML =
                `<span class="agenda-title">${escapeHtml(event.title)}</span>` +
                `<span class="agenda-time">${horarioDoEvento(event)}${repete}</span>`;
            item.title = "Abrir o card" + (tag ? ` · tag ${tag.name}` : "");
            item.addEventListener("click", () => abrirNosCards(event.id));
            return item;
        }

        function itemDeAniversario(b, dia) {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "agenda-item birthday";
            tingir(item, COR_ANIVERSARIO);
            const idade = EventUtils.ageAtOccurrence(b.date, dia);
            item.innerHTML =
                `<span class="agenda-title">${Icons.svg("cake", 12)} ${escapeHtml(b.name)}</span>` +
                `<span class="agenda-time">Aniversário${idade ? ` · ${idade} anos` : ""}</span>`;
            item.title = "Abrir aniversariantes nas Configurações";
            item.addEventListener("click", () => window.api.send("open-settings", "aniversarios"));
            return item;
        }

        // Só o dia/mês importa (o ano guardado pode ser o de nascimento ou até
        // um ano futuro). nextBirthdayOccurrence já trata o 29/02.
        function diasDeAniversario(b, de, ate) {
            const dias = [];
            let dia = EventUtils.nextBirthdayOccurrence(b.date, de);
            while (dia <= ate && dias.length < 20) {
                dias.push(dia);
                dia = EventUtils.nextBirthdayOccurrence(b.date, EventUtils.addDays(dia, 1));
            }
            return dias;
        }

        function linhaDoDia({ classe, semana, numero, itens }) {
            const linha = document.createElement("div");
            linha.className = "agenda-day" + (classe ? " " + classe : "");
            linha.innerHTML =
                `<div class="agenda-date"><span class="agenda-weekday">${semana}</span><span class="agenda-daynum">${numero}</span></div>` +
                `<div class="agenda-items"></div>`;
            const lista = linha.querySelector(".agenda-items");
            itens.forEach(el => lista.appendChild(el));
            return linha;
        }

        function porHorario(a, b) {
            const ta = a.startTime || "";
            const tb = b.startTime || "";
            return ta < tb ? -1 : ta > tb ? 1 : 0;
        }

        function renderAgenda(eventos, aniversarios = []) {
            const hoje = EventUtils.todayISO();
            const ate = EventUtils.addDays(hoje, diasNaAgenda - 1);
            const porDia = new Map();
            const aniversariosPorDia = new Map();

            for (const ev of eventos) {
                for (const dia of EventUtils.occurrencesBetween(ev, hoje, ate)) {
                    if (!porDia.has(dia)) porDia.set(dia, []);
                    porDia.get(dia).push(ev);
                }
            }
            for (const b of aniversarios) {
                if (!b.date) continue;
                for (const dia of diasDeAniversario(b, hoje, ate)) {
                    if (!porDia.has(dia)) porDia.set(dia, []);
                    if (!aniversariosPorDia.has(dia)) aniversariosPorDia.set(dia, []);
                    aniversariosPorDia.get(dia).push(b);
                }
            }

            const frag = document.createDocumentFragment();

            let mesAnterior = null;
            [...porDia.keys()].sort().forEach(dia => {
                const [y, m, d] = dia.split("-").map(Number);
                const mes = `${y}-${m}`;
                if (mes !== mesAnterior) {
                    const cab = document.createElement("div");
                    cab.className = "agenda-month";
                    const anoAtual = Number(hoje.slice(0, 4));
                    cab.textContent = MESES[m - 1] + (y !== anoAtual ? ` ${y}` : "");
                    frag.appendChild(cab);
                    mesAnterior = mes;
                }
                frag.appendChild(linhaDoDia({
                    classe: dia === hoje ? "today" : "",
                    semana: DIAS_SEMANA[new Date(y, m - 1, d).getDay()],
                    numero: d,
                    itens: [
                        ...(aniversariosPorDia.get(dia) || []).map(b => itemDeAniversario(b, dia)),
                        ...porDia.get(dia).sort(porHorario).map(ev => itemDaAgenda(ev))
                    ]
                }));
            });

            if (porDia.size === 0) {
                const vazio = document.createElement("div");
                vazio.className = "agenda-empty";
                vazio.textContent = `Nada marcado nos próximos ${diasNaAgenda} dias.`;
                frag.appendChild(vazio);
            }

            const mais = document.createElement("button");
            mais.type = "button";
            mais.className = "agenda-more";
            mais.textContent = `Mostrar mais ${DIAS_POR_PAGINA} dias`;
            mais.addEventListener("click", () => {
                const rolagem = board.scrollTop;
                diasNaAgenda += DIAS_POR_PAGINA;
                renderBoard();
                board.scrollTop = rolagem;
            });
            frag.appendChild(mais);

            board.appendChild(frag);
        }

        return { criarNode, criarNovo, renderAgenda };
    }

    return { criar };
});
