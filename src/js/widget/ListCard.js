/* ──────────────────────────────  ListCard.js  ───────────────────────────── */
(function (factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        window.ListCard = factory();
    }
})(function () {

    const TITULO_PADRAO = "Nova lista";

    function criar({ obterDados, salvar, renderBoard, board, expanded, base }) {
        const { newId, escapeHtml, armDeleteConfirm } = UiUtils;
        const now = () => Date.now();

        function removerLista(id) {
            const data = obterDados();
            data.lists = data.lists.filter(l => l.id !== id);
            expanded.delete(id);
            salvar();
            if (data.lists.length === 0) renderBoard();
        }

        function criarNode(list) {
            const card = document.createElement("div");
            card.className = "card" + (expanded.has(list.id) ? " expanded" : "");
            card.dataset.id = list.id;

            card.innerHTML = `
                <div class="card-delete" draggable="false" title="Excluir lista">${Icons.svg("x", 12)}</div>
                <div class="card-header">
                    <span class="card-title" spellcheck="false" draggable="false">${escapeHtml(list.title)}</span>
                    <div class="card-tags">${base.cardTagsInnerHtml(list.tagIds)}</div>
                </div>
                <div class="card-preview"></div>
                <div class="card-body">
                    <div class="item-list"></div>
                    <input class="item-add" type="text" placeholder="+ Adicionar item e pressionar Enter" draggable="false" />
                    <div class="tag-picker"></div>
                </div>
            `;

            base.renderTagPicker(card.querySelector(".tag-picker"), list);

            function refreshPreview() {
                const done = list.items.filter(i => i.done).length;
                const allDone = list.items.length > 0 && done === list.items.length;
                card.classList.toggle("list-done", allDone);
                card.querySelector(".card-preview").innerHTML =
                    (allDone ? `<span class="event-badge done">Concluída</span>` : "") +
                    `${done}/${list.items.length} concluídos`;
            }
            refreshPreview();

            base.montarChecklist(list, card.querySelector(".item-list"), card.querySelector(".item-add"), refreshPreview);

            const title = card.querySelector(".card-title");

            function expandList(focusAddInput) {
                card.classList.add("expanded");
                expanded.add(list.id);
                if (focusAddInput) card.querySelector(".item-add")?.focus();
            }

            function collapseList() {
                if (!card.classList.contains("expanded")) return;
                card.classList.remove("expanded");
                expanded.delete(list.id);
                if (title.isContentEditable) commitTitle();
                // lista nunca editada (título padrão e sem itens) — some sozinha.
                if (list.title === TITULO_PADRAO && list.items.length === 0) {
                    card.remove();
                    removerLista(list.id);
                }
            }

            base.attachHeaderToggle(card, title, expandList, collapseList);

            function commitTitle() {
                title.contentEditable = "false";
                list.title = title.textContent.trim() || "Sem título";
                title.textContent = list.title;
                list.updatedAt = now();
                salvar();
            }

            title.addEventListener("blur", commitTitle);
            title.addEventListener("keydown", (e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                e.stopPropagation();
                title.blur();
            });

            card.querySelector(".card-delete").addEventListener("click", (e) => {
                e.stopPropagation();
                armDeleteConfirm(e.currentTarget, () => {
                    card.remove();
                    removerLista(list.id);
                });
            });

            base.attachCardDrag(card, list.id, () => obterDados().lists);
            return card;
        }

        function criarNovo() {
            const list = { id: newId(), title: TITULO_PADRAO, items: [], createdAt: now(), updatedAt: now() };
            obterDados().lists.unshift(list);
            salvar();
            renderBoard();
            expanded.add(list.id);
            const card = board.querySelector(`.card[data-id="${list.id}"]`);
            if (card) {
                card.classList.add("expanded");
                card.querySelector(".item-add")?.focus();
            }
        }

        return { criarNode, criarNovo };
    }

    return { criar };
});
