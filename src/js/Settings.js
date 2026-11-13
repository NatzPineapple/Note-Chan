/* ──────────────────────────────  Settings.js  ────────────────────────────── */

Log.iniciar("configuracoes");

let settings = { theme: "gold", transparency: 60, shortcuts: {}, alarm: { enabled: true, volume: 70, sound: "sininho" } };
let booted = false;

const obterSettings = () => settings;

function saveSettings(partial) {
    settings = {
        ...settings,
        ...partial,
        shortcuts: { ...settings.shortcuts, ...partial.shortcuts },
        editor: { ...settings.editor, ...partial.editor },
        editorShortcuts: { ...settings.editorShortcuts, ...partial.editorShortcuts },
        alarm: { ...settings.alarm, ...partial.alarm }
    };
    window.api.send("save-settings", partial);
}

/* ═══════════════════════════════  MÓDULOS  ═══════════════════════════════ */

const aparencia = AppearanceSettings.criar({ obterSettings, salvar: saveSettings });
const atalhos = ShortcutRecorder.criar({ obterSettings, salvar: saveSettings });

const podeSalvar = () => booted;
const antesDeCriar = () => descartarIntocados();
const aniversarios = BirthdayCards.criar({ podeSalvar, antesDeCriar });
const tagCards = TagCards.criar({ podeSalvar, antesDeCriar });

GoogleSettings.criar();
UpdateSettings.criar();
StartupSettings.criar();

function applyToUI(s) {
    settings = s;
    aparencia.aplicar(s);
    atalhos.aplicar(s);
}

function descartarIntocados() {
    aniversarios.descartarSeIntocado();
    tagCards.descartarSeIntocado();
}

window.addEventListener("beforeunload", () => {
    descartarIntocados();
    aniversarios.salvarPendente();
    tagCards.salvarPendente();
});

/* ═════════════════════════════  BARRA DE TÍTULO  ══════════════════════════ */

document.getElementById("settings-minbtn").addEventListener("click", () => {
    window.api.send("settings-minimize");
});
document.getElementById("settings-closebtn").addEventListener("click", () => {
    window.api.send("close-settings");
});

window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault();
    document.activeElement?.blur();
    window.api.send("close-settings");
});

/* ══════════════════════════════  ABAS DO SETTINGS  ════════════════════════ */

const stabButtons = document.querySelectorAll(".stab-btn");

function setSettingsTab(tab) {
    descartarIntocados();
    stabButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.stab === tab));
    document.querySelectorAll(".stab-panel").forEach(panel =>
        panel.classList.toggle("active", panel.id === `stab-${tab}`));
}

stabButtons.forEach(btn => {
    btn.addEventListener("click", () => setSettingsTab(btn.dataset.stab));
});

/* ═════════════════════════  TRAY: NOVO ANIVERSARIANTE  ════════════════════ */

let pendingQuickCreate = false;

function novoAniversariante() {
    setSettingsTab("aniversarios");
    aniversarios.criarNovo();
}

window.api.on("show-settings-tab", (tab) => {
    if (document.getElementById(`stab-${tab}`)) setSettingsTab(tab);
});

window.api.on("quick-create", (type) => {
    if (type !== "aniversario") return;
    if (!booted) { pendingQuickCreate = true; return; }
    novoAniversariante();
});

/* ═══════════════════════════════  BOOT  ══════════════════════════════════ */

window.api.on("apply-settings", (s) => { if (!atalhos.estaGravando()) applyToUI(s); });

window.api.invoke("get-data").then(loaded => {
    booted = true;
    applyToUI(loaded.settings);
    aniversarios.carregar(loaded.birthdays);
    tagCards.carregar(loaded.tags);

    if (pendingQuickCreate) {
        pendingQuickCreate = false;
        novoAniversariante();
    }
}).catch(e => Log.error("[BOOT] get-data falhou, configurações não carregaram:", e.message));

window.api.invoke("get-app-version").then(version => {
    document.getElementById("app-version").textContent = `v${version}`;
    document.getElementById("app-version-inline").textContent = `v${version}`;
}).catch(e => Log.error("[BOOT] get-app-version falhou:", e.message));
