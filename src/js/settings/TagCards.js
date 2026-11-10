/* ──────────────────────────────  TagCards.js  ───────────────────────────── */
(function (factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        window.TagCards = factory();
    }
})(function () {

    const NEW_TAG_NAME = "Nova tag";
    const SAVE_DELAY_MS = 400;

    function criar({ podeSalvar, antesDeCriar }) {
        const { newId, escapeHtml, armDeleteConfirm, clickStartedInside } = UiUtils;

        const board  = document.getElementById("tag-board");
        const newBtn = document.getElementById("tag-new-btn");

        let tags = [];
        let intocado = { id: null, color: null };

        /* ───────────────────────  Gravação  ──────────────────────────── */

        let saveTimer = null;
        function scheduleSave() {
            if (!podeSalvar()) return;
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                saveTimer = null;
                window.api.send("save-data", { tags });
            }, SAVE_DELAY_MS);
        }

        function salvarPendente() {
            if (!saveTimer) return;
            clearTimeout(saveTimer);
            saveTimer = null;
            window.api.send("save-data", { tags });
        }

        function descartarSeIntocado() {
            const { id, color } = intocado;
            if (!id) return;
            intocado = { id: null, color: null };

            const t = tags.find(x => x.id === id);
            if (!t) return;
            if (t.name !== NEW_TAG_NAME || t.color !== color) return;

            tags = tags.filter(x => x.id !== id);
            scheduleSave();
            render();
        }

        /* ─────────────────────────  Tela  ────────────────────────────── */

        function render() {
            board.innerHTML = "";
            if (tags.length === 0) {
                const msg = document.createElement("div");
                msg.className = "empty-msg";
                msg.textContent = "Nenhuma tag ainda. Crie a primeira acima.";
                board.appendChild(msg);
                return;
            }
            const frag = document.createDocumentFragment();
            tags.forEach(tag => frag.appendChild(cardNode(tag)));
            board.appendChild(frag);
        }

        function cardNode(tag) {
            const card = document.createElement("div");
            card.className = "card tag-item";
            card.dataset.id = tag.id;

            card.innerHTML = `
                <div class="card-delete" title="Excluir tag">${Icons.svg("x", 12)}</div>
                <div class="tag-name-row">
                    <span class="tag-color-dot" style="background:#${TagUtils.corSegura(tag.color)}"></span>
                    <span class="tag-name" contenteditable="false" spellcheck="false">${escapeHtml(tag.name)}</span>
                </div>
                <div class="tag-swatches">
                    ${TagUtils.PALETTE.map(hex =>
                        `<button type="button" class="tag-swatch ${hex === tag.color ? "selected" : ""}" data-hex="${hex}" style="background:#${hex}"></button>`
                    ).join("")}
                </div>
            `;

            card.addEventListener("focusout", () => {
                setTimeout(() => {
                    if (intocado.id !== tag.id) return;
                    if (card.contains(document.activeElement)) return;
                    if (clickStartedInside(card)) return;
                    descartarSeIntocado();
                }, 0);
            });

            const nameEl = card.querySelector(".tag-name");
            RichEditor.ligarSetas(nameEl);
            nameEl.addEventListener("click", (e) => {
                e.stopPropagation();
                if (nameEl.isContentEditable) return; // já editando -- deixa o clique só posicionar o cursor
                nameEl.contentEditable = "true";
                nameEl.focus();
                document.execCommand("selectAll", false, null);
            });
            nameEl.addEventListener("blur", () => {
                nameEl.contentEditable = "false";
                tag.name = nameEl.textContent.trim() || "Sem nome";
                nameEl.textContent = tag.name;
                scheduleSave();
            });
            nameEl.addEventListener("keydown", (e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                e.stopPropagation();
                nameEl.blur();
            });

            card.querySelectorAll(".tag-swatch").forEach(btn => {
                btn.addEventListener("click", () => {
                    tag.color = TagUtils.corSegura(btn.dataset.hex);
                    card.querySelector(".tag-color-dot").style.background = `#${tag.color}`;
                    card.querySelectorAll(".tag-swatch").forEach(b => b.classList.toggle("selected", b === btn));
                    scheduleSave();
                });
            });

            card.querySelector(".card-delete").addEventListener("click", (e) => {
                e.stopPropagation();
                armDeleteConfirm(e.currentTarget, () => {
                    tags = tags.filter(t => t.id !== tag.id);
                    scheduleSave();
                    card.remove();
                    if (tags.length === 0) render();
                });
            });

            return card;
        }

        function criarNovo() {
            antesDeCriar();
            const usedColors = tags.map(t => t.color);
            const color = TagUtils.PALETTE.find(hex => !usedColors.includes(hex))
                || TagUtils.PALETTE[tags.length % TagUtils.PALETTE.length];
            const tag = { id: newId(), name: NEW_TAG_NAME, color };
            tags.push(tag);
            intocado = { id: tag.id, color: tag.color };
            scheduleSave();
            render();
            const card = board.querySelector(`.card[data-id="${tag.id}"]`);
            if (card) {
                const nameEl = card.querySelector(".tag-name");
                nameEl.contentEditable = "true";
                nameEl.focus();
                document.execCommand("selectAll", false, null);
            }
        }

        newBtn.addEventListener("click", criarNovo);

        function carregar(lista) {
            tags = lista || [];
            render();
        }

        return { carregar, criarNovo, descartarSeIntocado, salvarPendente };
    }

    return { criar };
});
