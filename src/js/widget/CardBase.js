/* ──────────────────────────────  CardBase.js  ───────────────────────────── */
(function (factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        window.CardBase = factory();
    }
})(function () {

    function criar({ obterDados, salvar, renderBoard, board, estaEditando, aoCompletarTarefa }) {
        const { newId, escapeHtml, clickStartedInside } = UiUtils;
        const now = () => Date.now();

        function formatDate(ts) {
            if (!ts) return "";
            return new Date(ts).toLocaleString("pt-BR", {
                day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
            });
        }

        /* ─────────────────────────  Tags  ─────────────────────────────── */

        function cardTagsInnerHtml(tagIds) {
            if (!tagIds || tagIds.length === 0) return "";
            return tagIds
                .map(id => TagUtils.findTag(obterDados().tags, id))
                .filter(Boolean)
                .map(tag => `<span class="tag-pill" style="${TagUtils.pillStyle(tag.color)}">${escapeHtml(tag.name)}</span>`)
                .join("");
        }

        function refreshCardTagsHeader(card, item) {
            const slot = card?.querySelector(".card-tags");
            if (slot) slot.innerHTML = cardTagsInnerHtml(item.tagIds);
        }

        function renderTagPicker(pickerEl, item) {
            const tags = obterDados().tags;
            pickerEl.innerHTML = "";
            if (tags.length === 0) {
                pickerEl.innerHTML = `<span class="tag-picker-hint">Crie tags em Configurações → Tags</span>`;
                return;
            }
            item.tagIds = item.tagIds || [];
            tags.forEach(tag => {
                const active = item.tagIds.includes(tag.id);
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "tag-toggle" + (active ? " active" : "");
                btn.textContent = tag.name;
                if (active) btn.setAttribute("style", TagUtils.pillStyle(tag.color));
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    item.tagIds = item.tagIds.includes(tag.id)
                        ? item.tagIds.filter(id => id !== tag.id)
                        : [...item.tagIds, tag.id];
                    item.updatedAt = now();
                    salvar();
                    renderTagPicker(pickerEl, item);
                    refreshCardTagsHeader(pickerEl.closest(".card"), item);
                });
                pickerEl.appendChild(btn);
            });
        }

        /* ──────────────────  Arrastar-e-soltar de cards  ─────────────── */

        let dragCardId = null;

        function attachCardDrag(card, id, obterLista) {
            card.draggable = true;

            card.addEventListener("dragstart", (e) => {
                if (estaEditando()) { e.preventDefault(); return; }
                dragCardId = id;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", id);
                card.classList.add("dragging");
            });
            card.addEventListener("dragend", () => {
                card.classList.remove("dragging");
                board.querySelectorAll(".card").forEach(el =>
                    el.classList.remove("drag-over-top", "drag-over-bottom"));
                dragCardId = null;
            });
            card.addEventListener("dragover", (e) => {
                if (!dragCardId || dragCardId === id) return;
                e.preventDefault();
                const before = (e.clientY - card.getBoundingClientRect().top) < card.offsetHeight / 2;
                card.classList.toggle("drag-over-top", before);
                card.classList.toggle("drag-over-bottom", !before);
            });
            card.addEventListener("dragleave", () => {
                card.classList.remove("drag-over-top", "drag-over-bottom");
            });
            card.addEventListener("drop", (e) => {
                e.preventDefault();
                card.classList.remove("drag-over-top", "drag-over-bottom");
                if (!dragCardId || dragCardId === id) return;

                const itemsArray = obterLista();
                const fromIdx = itemsArray.findIndex(x => x.id === dragCardId);
                if (fromIdx === -1) return; // veio de outra aba — ignora

                const [moved] = itemsArray.splice(fromIdx, 1);
                const before = (e.clientY - card.getBoundingClientRect().top) < card.offsetHeight / 2;
                let toIdx = itemsArray.findIndex(x => x.id === id);
                if (!before) toIdx += 1;
                itemsArray.splice(toIdx, 0, moved);
                salvar();
                renderBoard();
            });
        }

        /* ─────────────  Cabeçalho: abrir, fechar e renomear  ─────────── */

        function attachHeaderToggle(card, title, expand, collapse) {
            RichEditor.ligarSetas(title);

            function beginTitleEdit() {
                if (!card.classList.contains("expanded")) expand(false);
                title.contentEditable = "true";
                title.focus();
                document.execCommand("selectAll", false, null);
            }

            card.querySelector(".card-header").addEventListener("click", (e) => {
                if (e.detail > 1) return; // 2º clique do duplo-clique — quem trata é o dblclick
                if (!card.classList.contains("expanded")) { expand(true); return; }
                collapse();
            });

            card.addEventListener("focusout", () => {
                setTimeout(() => {
                    if (card.contains(document.activeElement)) return;
                    if (clickStartedInside(card)) return;
                    collapse();
                }, 0);
            });

            title.addEventListener("dblclick", (e) => {
                e.stopPropagation();
                beginTitleEdit();
            });

            title.addEventListener("click", (e) => { if (title.isContentEditable) e.stopPropagation(); });

            return { beginTitleEdit };
        }

        /* ──────────────  Checklist (itens de listas e eventos)  ──────── */

        let dragItemId = null;

        function listItemNode(list, item, refreshPreview, insertItemAfter) {
            const li = document.createElement("div");
            li.className = "list-item" + (item.done ? " done" : "");
            li.dataset.id = item.id;
            li.draggable = true;

            li.innerHTML = `
                <input type="checkbox" draggable="false" ${item.done ? "checked" : ""} />
                <span class="item-text" contenteditable="true" spellcheck="false" draggable="false">${escapeHtml(item.text)}</span>
                <div class="item-delete" draggable="false" title="Excluir item">${Icons.svg("x", 10)}</div>
            `;

            li.addEventListener("dragstart", (e) => {
                dragItemId = item.id;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", item.id);
                li.classList.add("dragging");
            });
            li.addEventListener("dragend", () => {
                li.classList.remove("dragging");
                li.parentElement?.querySelectorAll(".list-item").forEach(el =>
                    el.classList.remove("drag-over-top", "drag-over-bottom"));
                dragItemId = null;
            });
            li.addEventListener("dragover", (e) => {
                if (!dragItemId || dragItemId === item.id) return;
                e.preventDefault();
                const before = (e.clientY - li.getBoundingClientRect().top) < li.offsetHeight / 2;
                li.classList.toggle("drag-over-top", before);
                li.classList.toggle("drag-over-bottom", !before);
            });
            li.addEventListener("dragleave", () => {
                li.classList.remove("drag-over-top", "drag-over-bottom");
            });
            li.addEventListener("drop", (e) => {
                e.preventDefault();
                li.classList.remove("drag-over-top", "drag-over-bottom");
                if (!dragItemId || dragItemId === item.id) return;

                const fromIdx = list.items.findIndex(i => i.id === dragItemId);
                if (fromIdx === -1) return; // veio de outra lista — ignora

                const [moved] = list.items.splice(fromIdx, 1);
                const before = (e.clientY - li.getBoundingClientRect().top) < li.offsetHeight / 2;
                let toIdx = list.items.findIndex(i => i.id === item.id);
                if (!before) toIdx += 1;
                list.items.splice(toIdx, 0, moved);
                list.updatedAt = now();
                salvar();

                const listEl = li.parentElement;
                listEl.innerHTML = "";
                list.items.forEach(it => listEl.appendChild(listItemNode(list, it, refreshPreview, insertItemAfter)));
            });

            li.querySelector('input[type="checkbox"]').addEventListener("change", (e) => {
                item.done = e.target.checked;
                li.classList.toggle("done", item.done);
                list.updatedAt = now();
                refreshPreview();
                salvar();
                if (item.done) aoCompletarTarefa(6, 3);
            });

            const text = li.querySelector(".item-text");
            RichEditor.ligarSetas(text);
            text.addEventListener("blur", () => {
                item.text = text.textContent.trim();
                if (!item.text) {
                    list.items = list.items.filter(i => i.id !== item.id);
                    li.remove();
                }
                list.updatedAt = now();
                refreshPreview();
                salvar();
            });
            text.addEventListener("keydown", (e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                e.stopPropagation();
                if (!text.textContent.trim()) {
                    list.items = list.items.filter(i => i.id !== item.id);
                    list.updatedAt = now();
                    refreshPreview();
                    salvar();
                    li.remove();
                } else {
                    insertItemAfter(item.id); // continua a lista com um item novo logo abaixo
                }
            });

            li.querySelector(".item-delete").addEventListener("click", () => {
                list.items = list.items.filter(i => i.id !== item.id);
                list.updatedAt = now();
                refreshPreview();
                salvar();
                li.remove();
            });

            return li;
        }

        function montarChecklist(dono, listaEl, addInput, refreshPreview) {
            function insertItemAfter(afterId) {
                const idx = dono.items.findIndex(i => i.id === afterId);
                const newItem = { id: newId(), text: "", done: false };
                dono.items.splice(idx === -1 ? dono.items.length : idx + 1, 0, newItem);
                dono.updatedAt = now();
                refreshPreview();
                salvar();

                const afterLi = listaEl.querySelector(`.list-item[data-id="${afterId}"]`);
                const newLi = listItemNode(dono, newItem, refreshPreview, insertItemAfter);
                if (afterLi && afterLi.nextSibling) listaEl.insertBefore(newLi, afterLi.nextSibling);
                else listaEl.appendChild(newLi);
                newLi.querySelector(".item-text").focus();
            }

            dono.items.forEach(item => listaEl.appendChild(listItemNode(dono, item, refreshPreview, insertItemAfter)));

            RichEditor.ligarSetas(addInput);
            addInput.addEventListener("keydown", (e) => {
                if (e.key !== "Enter") return;
                e.stopPropagation();
                const text = addInput.value.trim();
                if (!text) return;
                const item = { id: newId(), text, done: false };
                dono.items.push(item);
                dono.updatedAt = now();
                listaEl.appendChild(listItemNode(dono, item, refreshPreview, insertItemAfter));
                refreshPreview();
                addInput.value = "";
                salvar();
            });
        }

        return {
            formatDate, cardTagsInnerHtml, refreshCardTagsHeader, renderTagPicker,
            attachCardDrag, attachHeaderToggle, montarChecklist
        };
    }

    return { criar };
});
