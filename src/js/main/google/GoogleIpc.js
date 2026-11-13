/* ──────────────────────────────  GoogleIpc.js  ─────────────────────────── */
const { ipcMain } = require("electron");
const GoogleAuth = require("./GoogleAuth");
const GoogleCalendarSync = require("./GoogleCalendarSync");
const { log, warn } = require("../../Logger");

const SYNC_INTERVAL_MS = 15 * 60 * 1000;
// Folga mínima entre o fim de uma sincronização e uma nova sincronização
// automática (abrir o widget, iniciar o app). Evita disparar uma atrás da outra
// se o widget for aberto e fechado várias vezes seguidas.
const MIN_AUTO_SYNC_GAP_MS = 100;

function criar({ obterDados, salvar, obterJanelas }) {
    let syncInFlight = null;
    let syncQueued = null;
    let lastSyncEndedAt = 0;

    function avisarJanelas() {
        const data = obterDados();
        const { widget, settings } = obterJanelas();
        widget?.webContents.send("events-updated", data.events);
        widget?.webContents.send("birthdays-updated", data.birthdays);
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

    // Pedido explícito (Salvar, excluir, botão nas Configurações): sempre roda.
    // Se já houver uma em andamento, ela pode ter começado antes da edição que
    // motivou o pedido — então agenda UMA rodada a mais logo depois dela (vários
    // pedidos nesse meio-tempo compartilham essa mesma rodada).
    function sincronizar() {
        if (syncInFlight) {
            if (!syncQueued) {
                log("[GOOGLE] Sincronização em andamento — outra rodada fica na fila.");
                syncQueued = syncInFlight.catch(() => {}).then(() => { syncQueued = null; return sincronizar(); });
            }
            return syncQueued;
        }
        syncInFlight = doSync().finally(() => {
            syncInFlight = null;
            lastSyncEndedAt = Date.now();
        });
        return syncInFlight;
    }

    function sincronizarSeConectado() {
        if (GoogleAuth.isConnected()) sincronizar();
    }

    // Gatilho automático (abrir o widget, iniciar o app): ignora se já está
    // sincronizando ou se a última terminou há menos de MIN_AUTO_SYNC_GAP_MS.
    function sincronizarAutomatico(motivo) {
        if (!GoogleAuth.isConnected()) return;
        if (syncInFlight) return;
        const desde = Date.now() - lastSyncEndedAt;
        if (desde < MIN_AUTO_SYNC_GAP_MS) {
            log(`[GOOGLE] Sincronização (${motivo}) ignorada — a última terminou há ${desde} ms.`);
            return;
        }
        log(`[GOOGLE] Sincronizando (${motivo}).`);
        sincronizar();
    }

    // A sessão salva é lida de forma assíncrona (safeStorage). Tudo que depende
    // dela espera esta promise — senão a tela poderia mostrar "desconectado" no
    // começo, ou uma leitura atrasada sobrescreveria um login recém-feito.
    let sessaoCarregada = Promise.resolve();

    function iniciar() {
        sessaoCarregada = GoogleAuth.loadStoredToken();
        sessaoCarregada.then(() => sincronizarAutomatico("início do app"));
        setInterval(sincronizarSeConectado, SYNC_INTERVAL_MS);
    }

    /* ──────────────────  Botões da tela de configurações  ─────────── */

    ipcMain.handle("google-auth-status", async () => {
        await sessaoCarregada;
        return {
            configured: GoogleAuth.isConfigured(),
            connected: GoogleAuth.isConnected(),
            email: GoogleAuth.getEmail(),
            lastSyncAt: obterDados().googleSync.lastSyncAt
        };
    });

    ipcMain.handle("google-auth-start", async () => {
        await sessaoCarregada;
        const result = await GoogleAuth.startOAuthFlow(); // rejeita a promise no invoke se falhar/cancelar
        sincronizar(); // primeira sincronização logo após conectar, sem esperar o usuário abrir/fechar o widget
        return { connected: true, email: result.email };
    });

    ipcMain.handle("google-disconnect", async () => {
        await sessaoCarregada;
        await GoogleAuth.disconnect();
        return { connected: false };
    });

    ipcMain.handle("google-sync-now", async () => {
        await sessaoCarregada;
        return sincronizar();
    });

    return { iniciar, sincronizar, sincronizarSeConectado, sincronizarAutomatico };
}

module.exports = { criar };
