/* ────────────────────────────────  Widget.js  ───────────────────────────── */

Log.iniciar("widget");

let data = {
    notes: [], lists: [], events: [], tags: [], habits: [],
    tamagotchi: {
        level: 1, xp: 0, vida: 100, fome: 100, carencia: 100, higiene: 100,
        lastUpdate: Date.now(), lastInteraction: Date.now(), lastCarenciaUpdate: Date.now()
    },
    widget: { collapsed: true, activeTab: "notas" }
};
let activeTab = "notas";
const expanded = new Set();

const container   = document.getElementById("container");
const board       = document.getElementById("board");
const newBtn      = document.getElementById("new-btn");
const tabButtons  = document.querySelectorAll(".tab-btn");

const { newId, escapeHtml } = UiUtils;
const obterDados = () => data;

/* ══════════════════════════════  PERSISTÊNCIA  ══════════════════════════ */

let booted = false;

let saveTimer = null;
function scheduleSave() {
    if (!booted) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        window.api.send("save-data", {
            notes: data.notes,
            lists: data.lists,
            events: data.events,
            habits: data.habits,
            widget: { activeTab }
        });
    }, 400);
}

/* ═══════════════════════════════  MÓDULOS  ═══════════════════════════════ */

const extras = ExtraTools.criar({
    obterDados,
    renderBoard: () => renderBoard(),
    aoAbrir: () => { tama.fechar(); habits.fechar(); }
});

const tama = TamaPet.criar({
    obterDados,
    container,
    estaPronto: () => booted,
    aoAbrir: () => { extras.fecharTudo(); habits.fechar(); }
});

const habits = HabitTracker.criar({
    obterDados,
    container,
    salvar: scheduleSave,
    aoAbrir: () => { extras.fecharTudo(); tama.fechar(); },
    aoCompletar: () => tama.aoCompletarTarefa(8, 4)
});

const cardCtx = {
    obterDados,
    salvar: scheduleSave,
    renderBoard: () => renderBoard(),
    board,
    expanded,
    aoCompletarTarefa: (fome, xp) => tama.aoCompletarTarefa(fome, xp)
};
cardCtx.base = CardBase.criar({ ...cardCtx, estaEditando: () => isEditingContext() });

const CARDS_DA_ABA = {
    notas: NoteCard.criar(cardCtx),
    listas: ListCard.criar(cardCtx),
    eventos: EventCard.criar(cardCtx)
};

/* ═══════════════════════════════  ABAS  ══════════════════════════════════ */

const NEW_BTN_LABELS = { notas: "+ Nova nota", listas: "+ Nova lista", eventos: "+ Novo evento" };

function setActiveTab(tab) {
    activeTab = tab;
    tabButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
    newBtn.textContent = NEW_BTN_LABELS[tab] || NEW_BTN_LABELS.notas;
    scheduleSave();
    renderBoard();
}

tabButtons.forEach(btn => {
    btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
});

newBtn.addEventListener("click", () => CARDS_DA_ABA[activeTab].criarNovo());

/* ═══════════════════════  DICA DE ATALHOS NAS ABAS  ═══════════════════════ */

const ATALHOS_DA_ABA = {
    notas: [["Captura rápida", "quickCapture"], ["Nova nota em janela", "newNoteWindow"]],
    eventos: [["Evento rápido", "quickEvent"]]
};
const DICA_DELAY_MS = 350;

const dicaEl = document.createElement("div");
dicaEl.id = "shortcut-tip";
container.appendChild(dicaEl);
let dicaTimer = null;

function teclasHtml(acelerador) {
    if (!acelerador) return `<span class="tip-none">sem atalho</span>`;
    return acelerador
        .replace("Control", "Ctrl").replace("Super", "Win")
        .split("+")
        .map(tecla => `<kbd>${escapeHtml(tecla)}</kbd>`)
        .join("");
}

function mostrarDica(btn) {
    const atalhos = data.settings?.shortcuts || {};
    dicaEl.innerHTML = `<div class="tip-title">Atalhos globais</div>` + ATALHOS_DA_ABA[btn.dataset.tab]
        .map(([rotulo, chave]) => `<div class="tip-row"><span>${rotulo}</span><span class="tip-keys">${teclasHtml(atalhos[chave])}</span></div>`)
        .join("");

    dicaEl.classList.add("visible");
    const alvo = btn.getBoundingClientRect();
    const caixa = container.getBoundingClientRect();
    const largura = dicaEl.offsetWidth;
    const centro = alvo.left - caixa.left + alvo.width / 2;
    dicaEl.style.left = `${Math.max(6, Math.min(centro - largura / 2, caixa.width - largura - 6))}px`;
    dicaEl.style.top = `${alvo.bottom - caixa.top + 6}px`;
    dicaEl.style.setProperty("--seta-x", `${centro - parseFloat(dicaEl.style.left)}px`);
}

function esconderDica() {
    clearTimeout(dicaTimer);
    dicaEl.classList.remove("visible");
}

tabButtons.forEach(btn => {
    if (!ATALHOS_DA_ABA[btn.dataset.tab]) return;
    btn.addEventListener("mouseenter", () => {
        clearTimeout(dicaTimer);
        dicaTimer = setTimeout(() => mostrarDica(btn), DICA_DELAY_MS);
    });
    btn.addEventListener("mouseleave", esconderDica);
    btn.addEventListener("mousedown", esconderDica);
});

/* ═══════════════════════════════  RENDER  ════════════════════════════════ */

const EMPTY_MESSAGES = {
    notas: "Nenhuma nota ainda. Crie a primeira acima.",
    listas: "Nenhuma lista ainda. Crie a primeira acima.",
    eventos: "Nenhum evento ainda. Crie o primeiro acima."
};

function itensDaAba() {
    if (activeTab === "notas") return data.notes;
    if (activeTab === "listas") return data.lists;
    return [...data.events].sort(EventUtils.compareByOccurrence);
}

function renderBoard() {
    board.innerHTML = "";
    const items = extras.filtrarPorBusca(itensDaAba());

    if (items.length === 0) {
        const msg = document.createElement("div");
        msg.className = "empty-msg";
        msg.textContent = extras.temBusca() ? "Nenhum card encontrado." : (EMPTY_MESSAGES[activeTab] || EMPTY_MESSAGES.notas);
        board.appendChild(msg);
        return;
    }

    const cards = CARDS_DA_ABA[activeTab];
    const frag = document.createDocumentFragment();
    items.forEach(item => frag.appendChild(cards.criarNode(item)));
    board.appendChild(frag);
}

/* ══════════════════════════════  DOCK / PAINEL  ═══════════════════════════ */

const dragbarIcon = document.getElementById("dragbar-icon");

function setContainerMode(collapsed) {
    const wasCollapsed = container.classList.contains("collapsed");
    if (wasCollapsed && !collapsed) tama.aoAbrirApp();
    container.classList.toggle("collapsed", collapsed);
    container.classList.toggle("expanded", !collapsed);
    dragbarIcon.innerHTML = Icons.svg(collapsed ? "chevron-up" : "chevron-down", 13);
}

document.getElementById("dragbar").addEventListener("click", () => {
    window.api.send(container.classList.contains("collapsed") ? "expand-widget" : "collapse-widget");
});

document.getElementById("minbtn").addEventListener("click", (e) => {
    e.stopPropagation();
    window.api.send("collapse-widget");
});
document.getElementById("closebtn").addEventListener("click", (e) => {
    e.stopPropagation();
    window.api.send("close-widget");
});
document.getElementById("settingsbtn").addEventListener("click", (e) => {
    e.stopPropagation();
    window.api.send("open-settings");
});

window.api.on("set-mode", (mode) => setContainerMode(mode === "collapsed"));

/* ══════════════════════════════  NAVEGAÇÃO POR TECLADO  ══════════════════ */

let selectedIndex = -1;

function isEditingContext() {
    const el = document.activeElement;
    if (!el) return false;
    const isField = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
    if (!isField) return false;
    return el.offsetParent !== null;
}

function getNavItems() {
    return [newBtn, ...board.querySelectorAll(".card")];
}

function clearKeyboardSelection() {
    document.querySelectorAll(".kb-selected").forEach(el => el.classList.remove("kb-selected"));
}

function applyKeyboardSelection() {
    clearKeyboardSelection();
    const items = getNavItems();
    if (items.length === 0) { selectedIndex = -1; return; }
    selectedIndex = Math.max(0, Math.min(items.length - 1, selectedIndex));
    const el = items[selectedIndex];
    el.classList.add("kb-selected");
    el.scrollIntoView({ block: "nearest" });
}

function moveSelection(delta) {
    const items = getNavItems();
    if (items.length === 0) return;
    selectedIndex = selectedIndex === -1 ? 0 : Math.max(0, Math.min(items.length - 1, selectedIndex + delta));
    applyKeyboardSelection();
}

function openSelected() {
    const items = getNavItems();
    if (selectedIndex < 0 || selectedIndex >= items.length) return;
    const el = items[selectedIndex];
    if (el === newBtn) { newBtn.click(); return; }
    (el.querySelector(".card-header") || el).click();
}

function deleteSelected() {
    const items = getNavItems();
    if (selectedIndex < 0 || selectedIndex >= items.length) return;
    const el = items[selectedIndex];
    if (el === newBtn) return;
    el.querySelector(".card-delete")?.click();
}

function cycleTab(delta) {
    const tabs = Array.from(tabButtons);
    const currentIndex = tabs.findIndex(btn => btn.dataset.tab === activeTab);
    const nextIndex = (currentIndex + delta + tabs.length) % tabs.length;
    setActiveTab(tabs[nextIndex].dataset.tab);
    selectedIndex = -1;
    clearKeyboardSelection();
}

document.addEventListener("keydown", (e) => {
    if (container.classList.contains("collapsed")) return;

    if (e.key === "Escape") {
        e.preventDefault();
        if (extras.fecharAberto()) return;
        if (tama.estaAberto()) { tama.fechar(); return; }
        if (habits.estaAberto()) { habits.fechar(); return; }
        window.api.send("close-widget");
        return;
    }

    if (habits.estaAberto()) return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        extras.abrirBusca();
        return;
    }

    if (isEditingContext()) return;

    switch (e.key) {
        case "ArrowLeft":  e.preventDefault(); cycleTab(-1); break;
        case "ArrowRight": e.preventDefault(); cycleTab(1); break;
        case "ArrowUp":    e.preventDefault(); moveSelection(-1); break;
        case "ArrowDown":  e.preventDefault(); moveSelection(1); break;
        case "Enter":      e.preventDefault(); openSelected(); break;
        case "Delete":     e.preventDefault(); deleteSelected(); break;
    }
});

/* ══════════════════════════════  TEMA / TRANSPARÊNCIA  ═══════════════════ */

function applySettings(settings) {
    if (!settings) return;
    data.settings = settings;
    RichEditor.aplicarFonte(settings.editor?.fontSize);
    document.documentElement.dataset.theme = settings.theme || "gold";
    const alpha = Math.min(100, Math.max(20, settings.transparency ?? 60)) / 100;
    document.documentElement.style.setProperty("--bg-alpha", alpha);
}

window.api.on("apply-settings", applySettings);

window.api.on("tags-updated", (tags) => {
    applyRemoteUpdate(() => { data.tags = tags; });
});

/* ══════════════════════════  ARQUIVO SOLTO VIRA NOTA  ═════════════════════ */

const panel = document.getElementById("panel");
const TEXT_FILE_RE = /\.(txt|md|markdown|csv|json|log|ini|cfg|conf|yaml|yml|xml|js|ts|py|java|c|cpp|h|css|html)$/i;
const MAX_TEXT_READ_BYTES = 2_000_000;

let dragEnterDepth = 0;

function hasFiles(e) {
    return Array.from(e.dataTransfer?.types || []).includes("Files");
}

panel.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    dragEnterDepth++;
    container.classList.add("file-drop-active");
});
panel.addEventListener("dragover", (e) => {
    if (hasFiles(e)) e.preventDefault();
});
panel.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    dragEnterDepth = Math.max(0, dragEnterDepth - 1);
    if (dragEnterDepth === 0) container.classList.remove("file-drop-active");
});

panel.addEventListener("drop", async (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragEnterDepth = 0;
    container.classList.remove("file-drop-active");

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    for (const file of files) {
        const looksLikeText = file.type.startsWith("text/") || file.type === "application/json" || TEXT_FILE_RE.test(file.name);
        let content;
        if (looksLikeText && file.size <= MAX_TEXT_READ_BYTES) {
            try { content = await file.text(); } catch { content = ""; }
        } else {
            const filePath = window.api.getFilePath(file);
            content = `Arquivo: ${filePath || file.name}`;
        }
        const title = (file.name.replace(/\.[^.]+$/, "") || file.name).slice(0, 60);
        data.notes.unshift({ id: newId(), title, content: RichText.fromPlainText(content), createdAt: Date.now(), updatedAt: Date.now() });
    }

    setActiveTab("notas");
    scheduleSave();
});

/* ══════════════════════════════  TRAY: CRIAÇÃO RÁPIDA  ═══════════════════ */

const ABA_DO_TIPO = { nota: "notas", lista: "listas", evento: "eventos" };

function runQuickCreate(type) {
    const tab = ABA_DO_TIPO[type] || "notas";
    setActiveTab(tab);
    CARDS_DA_ABA[tab].criarNovo();
}

let pendingQuickCreate = null;

window.api.on("quick-create", (type) => {
    if (!booted) { pendingQuickCreate = type; return; }
    runQuickCreate(type);
});

/* ═══════════  ATUALIZAÇÕES DO MAIN SEM ATROPELAR A EDIÇÃO  ════════════════ */

let pendingRemoteUpdates = [];

function isEditingInBoard() {
    return board.contains(document.activeElement) && isEditingContext();
}

function applyRemoteUpdate(fn) {
    if (isEditingInBoard()) { pendingRemoteUpdates.push(fn); return; }
    fn();
    renderBoard();
}

function flushRemoteUpdates() {
    if (pendingRemoteUpdates.length === 0 || isEditingInBoard()) return;
    const updates = pendingRemoteUpdates;
    pendingRemoteUpdates = [];
    updates.forEach(fn => fn());
    renderBoard();
}

document.addEventListener("focusout", () => setTimeout(flushRemoteUpdates, 0));

function mergeFromMain(local, incoming) {
    const localById = new Map(local.map(item => [item.id, item]));
    return incoming.map(inc => {
        const mine = localById.get(inc.id);
        return mine && (mine.updatedAt || 0) > (inc.updatedAt || 0) ? mine : inc;
    });
}

window.api.on("notes-updated", (notes) => {
    applyRemoteUpdate(() => { data.notes = mergeFromMain(data.notes, notes); });
});

window.api.on("events-updated", (events) => {
    applyRemoteUpdate(() => { data.events = mergeFromMain(data.events, events); });
});

/* ═══════════════════════════════  BOOT  ══════════════════════════════════ */

const VALID_TABS = new Set(["notas", "listas", "eventos"]);

window.api.invoke("get-data").then(loaded => {
    data = {
        notes: [], lists: [], events: [], tags: [], habits: [],
        tamagotchi: {
            level: 1, xp: 0, vida: 100, fome: 100, carencia: 100, higiene: 100,
            lastUpdate: Date.now(), lastInteraction: Date.now(), lastCarenciaUpdate: Date.now()
        },
        ...loaded
    };
    booted = true;
    applySettings(data.settings);
    setContainerMode(data.widget?.collapsed !== false);
    const savedTab = data.widget?.activeTab;
    setActiveTab(VALID_TABS.has(savedTab) ? savedTab : "notas");
    tama.iniciar();
    habits.atualizarAviso();

    if (pendingQuickCreate) {
        const type = pendingQuickCreate;
        pendingQuickCreate = null;
        runQuickCreate(type);
    }
}).catch(e => Log.error("[BOOT] get-data falhou, widget fica vazio e não grava:", e.message));
