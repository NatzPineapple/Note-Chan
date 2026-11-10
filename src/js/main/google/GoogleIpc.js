/* ──────────────────────────────  GoogleIpc.js  ─────────────────────────── */
const { ipcMain } = require("electron");
const GoogleAuth = require("./GoogleAuth");
const GoogleCalendarSync = require("./GoogleCalendarSync");
const { log, warn } = require("../../Logger");

const SYNC_INTERVAL_MS = 15 * 60 * 1000;

function criar({ obterDados, salvar, obterJanelas }) {
    let syncInFlight = null;

    function avisarJanelas() {
        const data = obterDados();
        const { widget, settings } = obterJanelas();
        widget?.webContents.send("events-updated", data.events);
        settings?.webContents.send("birthdays-updated", data.birthdays);
    }

    async function doSync() {
        const result = await GoogleCalendarSync.runSync(obterDados());
        if (result.ok) {
            log("[GOOGLE] Sincronização concluída —", result.count, "eventos processados");
            salvar();
            avisarJanelas();
        } else if (result.error !== "not-connected") {
            warn("[GOOGLE] Sincronização falhou:", result.error);
        }
        return result;
    }

    function sincronizar() {
        if (syncInFlight) {
            log("[GOOGLE] Sincronização já em andamento — reaproveitando a atual.");
            return syncInFlight;
        }
        syncInFlight = doSync().finally(() => { syncInFlight = null; });
        return syncInFlight;
    }

    function sincronizarSeConectado() {
        if (GoogleAuth.isConnected()) sincronizar();
    }

    function iniciar() {
        GoogleAuth.loadStoredToken();
        setInterval(sincronizarSeConectado, SYNC_INTERVAL_MS);
    }

    /* ──────────────────  Botões da tela de configurações  ─────────── */

    ipcMain.handle("google-auth-status", () => ({
        configured: GoogleAuth.isConfigured(),
        connected: GoogleAuth.isConnected(),
        email: GoogleAuth.getEmail(),
        lastSyncAt: obterDados().googleSync.lastSyncAt
    }));

    ipcMain.handle("google-auth-start", async () => {
        const result = await GoogleAuth.startOAuthFlow(); // rejeita a promise no invoke se falhar/cancelar
        sincronizar(); // primeira sincronização logo após conectar, sem esperar o usuário abrir/fechar o widget
        return { connected: true, email: result.email };
    });

    ipcMain.handle("google-disconnect", async () => {
        await GoogleAuth.disconnect();
        return { connected: false };
    });

    ipcMain.handle("google-sync-now", () => sincronizar());

    return { iniciar, sincronizar, sincronizarSeConectado };
}

module.exports = { criar };
