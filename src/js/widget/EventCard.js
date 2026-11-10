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
        if (occDate < today) return { text: `Atrasado · ${formatBR(occDate)}`, cls: "overdue" };
        return { text: formatBR(occDate), cls: "" };
    }

    function criar({ obterDados, salvar, renderBoard, board, expanded, base, aoCompletarTarefa }) {
        const { newId, escapeHtml, armDeleteConfirm } = UiUtils;
        const now = () => Date.now();

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
                    <button class="event-done-btn"></button>
                </div>
            `;

            const preview   = card.querySelector(".card-preview");
            const doneBtn   = card.querySelector(".event-done-btn");
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

                const isDone = !occ;
                doneBtn.innerHTML = isDone
                    ? `${Icons.svg("rotate-ccw", 13)} Desfazer`
                    : `${Icons.svg("check", 13)} Marcar como feito`;
                doneBtn.classList.toggle("is-done", isDone);
                doneBtn.dataset.occ = occ || "";
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

            doneBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const occ = doneBtn.dataset.occ;
                if (occ) {
                    if (!event.completedDates.includes(occ)) event.completedDates.push(occ);
                    aoCompletarTarefa(15, 8);
                } else {
                    event.completedDates = event.completedDates.filter(d => d !== event.date);
                }
                event.updatedAt = now();
                salvar();
                renderBoard();
            });

            card.querySelector(".card-delete").addEventListener("click", (e) => {
                e.stopPropagation();
                armDeleteConfirm(e.currentTarget, () => {
                    const data = obterDados();
                    data.events = data.events.filter(ev => ev.id !== event.id);
                    expanded.delete(event.id);
                    salvar();
                    card.remove();
                    if (data.events.length === 0) renderBoard();
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

        return { criarNode, criarNovo };
    }

    return { criar };
});
