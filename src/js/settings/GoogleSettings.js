/* ────────────────────────────  GoogleSettings.js  ───────────────────────── */
(function (factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        window.GoogleSettings = factory();
    }
})(function () {

    function formatSyncTime(ts) {
        if (!ts) return "Nunca sincronizado.";
        return "Última sincronização: " + new Date(ts).toLocaleString("pt-BR", {
            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
        });
    }

    function criar() {
        const statusText    = document.getElementById("google-status-text");
        const connectBtn    = document.getElementById("google-connect-btn");
        const connectedBox  = document.getElementById("google-connected-box");
        const syncBtn       = document.getElementById("google-sync-btn");
        const syncHint      = document.getElementById("google-sync-hint");
        const disconnectBtn = document.getElementById("google-disconnect-btn");
        const securityRow   = document.getElementById("google-security-row");
        const securityHint  = document.getElementById("google-security-hint");
        const reconnectBtn  = document.getElementById("google-reconnect-btn");

        // Avisos de segurança da sessão. Só um aparece por vez: sessão que não
        // fica salva tem prioridade (afeta o uso), escopo amplo vem depois.
        function aplicarAvisoDeSeguranca(status) {
            let texto = "";
            let oferecerReconexao = false;
            if (status.connected && status.sessaoTemporaria) {
                texto = "O Windows não ofereceu criptografia para guardar a sessão, então ela não foi salva no disco: ao fechar o app, será preciso conectar de novo.";
            } else if (status.connected && status.escopoAmplo) {
                texto = "Esta conexão tem permissão para gerenciar a agenda inteira. O app só precisa dos eventos: reconecte para reduzir a permissão.";
                oferecerReconexao = true;
            }
            securityHint.textContent = texto;
            securityRow.classList.toggle("hidden", !texto);
            reconnectBtn.classList.toggle("hidden", !oferecerReconexao);
        }

        function aplicarStatus(status) {
            aplicarAvisoDeSeguranca(status);
            if (!status.configured) {
                statusText.textContent = "Não configurado (falta GoogleAuthConfig.js).";
                connectBtn.classList.add("hidden");
                connectedBox.classList.add("hidden");
                return;
            }
            if (status.connected) {
                statusText.textContent = "Conectado" + (status.email ? ` como ${status.email}` : "");
                connectBtn.classList.add("hidden");
                connectedBox.classList.remove("hidden");
                syncHint.textContent = formatSyncTime(status.lastSyncAt);
            } else {
                statusText.textContent = "Não conectado.";
                connectBtn.classList.remove("hidden");
                connectedBox.classList.add("hidden");
            }
        }

        connectBtn.addEventListener("click", async () => {
            connectBtn.disabled = true;
            connectBtn.textContent = "Abrindo navegador...";
            try {
                const status = await window.api.invoke("google-auth-start");
                aplicarStatus({ configured: true, ...status, lastSyncAt: null });
            } catch (e) {
                const motivo = e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
                statusText.textContent = "Falha ao conectar: " + motivo;
            } finally {
                connectBtn.disabled = false;
                connectBtn.textContent = "Conectar";
            }
        });

        // Reconectar = o processo principal revoga a sessão atual e abre o login
        // de novo (ver google-auth-start em GoogleIpc.js).
        reconnectBtn.addEventListener("click", async () => {
            reconnectBtn.disabled = true;
            reconnectBtn.textContent = "Abrindo navegador...";
            try {
                const status = await window.api.invoke("google-auth-start");
                aplicarStatus({ configured: true, ...status, lastSyncAt: null });
            } catch (e) {
                const motivo = e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
                // A sessão antiga já foi revogada: a tela volta para "não conectado".
                aplicarStatus({ configured: true, connected: false });
                statusText.textContent = "Falha ao reconectar: " + motivo;
            } finally {
                reconnectBtn.disabled = false;
                reconnectBtn.textContent = "Reconectar";
            }
        });

        disconnectBtn.addEventListener("click", async () => {
            disconnectBtn.disabled = true;
            try {
                const status = await window.api.invoke("google-disconnect");
                aplicarStatus({ configured: true, ...status });
            } catch (e) {
                statusText.textContent = "Falha ao desconectar: " + e.message;
                Log.error("[GOOGLE] Desconectar falhou:", e.message);
            } finally {
                disconnectBtn.disabled = false;
            }
        });

        syncBtn.addEventListener("click", async () => {
            syncBtn.disabled = true;
            syncBtn.textContent = "Sincronizando...";
            try {
                const result = await window.api.invoke("google-sync-now");
                syncHint.textContent = result.ok
                    ? formatSyncTime(Date.now())
                    : "Falha na sincronização: " + (result.error || "erro desconhecido");
            } catch (e) {
                syncHint.textContent = "Falha na sincronização: " + e.message;
                Log.error("[GOOGLE] Sincronizar agora falhou:", e.message);
            } finally {
                syncBtn.disabled = false;
                syncBtn.innerHTML = `${Icons.svg("refresh-cw", 14)} Sincronizar agora`;
            }
        });

        window.api.invoke("google-auth-status")
            .then(aplicarStatus)
            .catch(e => {
                statusText.textContent = "Não foi possível ler o estado da conexão.";
                Log.error("[GOOGLE] google-auth-status falhou:", e.message);
            });

        return { aplicarStatus };
    }

    return { criar };
});
