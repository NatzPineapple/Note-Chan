/* ──────────────────────────────  NoteCard.js  ───────────────────────────── */
(function (factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        window.NoteCard = factory();
    }
})(function () {

    const TITULO_PADRAO = "Nova nota";

    function criar({ obterDados, salvar, renderBoard, board, expanded, base }) {
        const { newId, escapeHtml, armDeleteConfirm } = UiUtils;
        const now = () => Date.now();

        function previa(note) {
            return RichText.toPlainText(note.content).slice(0, 80) || "(vazia)";
        }

        function removerNota(id) {
            const data = obterDados();
            data.notes = data.notes.filter(n => n.id !== id);
            expanded.delete(id);
            salvar();
            if (data.notes.length === 0) renderBoard();
        }

        function criarNode(note) {
            const card = document.createElement("div");
            card.className = "card note-card" + (expanded.has(note.id) ? " expanded" : "");
            card.dataset.id = note.id;

            card.innerHTML = `
                <div class="card-delete" draggable="false" title="Excluir nota">${Icons.svg("x", 12)}</div>
                <div class="card-window" draggable="false" title="Abrir em janela">${Icons.svg("maximize-2", 12)}</div>
                <div class="card-header">
                    <span class="card-title" spellcheck="false" draggable="false">${escapeHtml(note.title)}</span>
                    <div class="card-tags">${base.cardTagsInnerHtml(note.tagIds)}</div>
                </div>
                <div class="card-preview">${escapeHtml(previa(note))}</div>
                <div class="card-body">
                    <div class="nc-barra"></div>
                    <div class="note-editor nc-rico" contenteditable="true" spellcheck="false" draggable="false"
                         data-placeholder="Escreva aqui...">${RichText.sanitize(note.content)}</div>
                    <div class="card-meta">Atualizado em ${base.formatDate(note.updatedAt)}</div>
                    <div class="tag-picker"></div>
                </div>
            `;

            base.renderTagPicker(card.querySelector(".tag-picker"), note);

            const title = card.querySelector(".card-title");

            function expandNote(focusEditor) {
                card.classList.add("expanded");
                expanded.add(note.id);
                if (focusEditor) card.querySelector(".note-editor")?.focus();
            }

            function collapseNote() {
                if (!card.classList.contains("expanded")) return;
                card.classList.remove("expanded");
                expanded.delete(note.id);
                card.querySelector(".card-preview").textContent = previa(note);
                if (title.isContentEditable) commitTitle();
                if (note.title === TITULO_PADRAO && RichText.isEmpty(note.content)) {
                    card.remove();
                    removerNota(note.id);
                }
            }

            base.attachHeaderToggle(card, title, expandNote, collapseNote);

            function commitTitle() {
                title.contentEditable = "false";
                note.title = title.textContent.trim() || "Sem título";
                title.textContent = note.title;
                note.updatedAt = now();
                salvar();
            }

            title.addEventListener("blur", commitTitle);
            title.addEventListener("keydown", (e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                e.stopPropagation();
                title.blur();
            });

            const settings = () => obterDados().settings;
            const editor = card.querySelector(".note-editor");
            const editorApi = RichEditor.attach(editor, {
                jaHigienizado: true,
                onChange: () => {
                    note.content = editor.innerHTML;
                    note.updatedAt = now();
                    salvar();
                },
                onEscape: () => editor.blur(),
                indentSize: () => settings()?.editor?.indentSize,
                atalhos: () => settings()?.editorShortcuts
            });

            RichEditor.montarBarra(card.querySelector(".nc-barra"), editorApi, RichEditor.BARRA_BASICA, {
                atalhos: () => settings()?.editorShortcuts
            });

            card.querySelector(".card-window").addEventListener("click", (e) => {
                e.stopPropagation();
                window.api.send("open-note-window", note.id);
            });

            card.querySelector(".card-delete").addEventListener("click", (e) => {
                e.stopPropagation();
                armDeleteConfirm(e.currentTarget, () => {
                    card.remove();
                    removerNota(note.id);
                });
            });

            base.attachCardDrag(card, note.id, () => obterDados().notes);
            return card;
        }

        function criarNovo() {
            const note = { id: newId(), title: TITULO_PADRAO, content: "", createdAt: now(), updatedAt: now() };
            obterDados().notes.unshift(note);
            salvar();
            renderBoard();
            expanded.add(note.id);
            const card = board.querySelector(`.card[data-id="${note.id}"]`);
            if (card) {
                card.classList.add("expanded");
                card.querySelector(".note-editor")?.focus();
            }
        }

        return { criarNode, criarNovo };
    }

    return { criar };
});
