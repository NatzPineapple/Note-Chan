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

        function aplicarStatus(status) {
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
