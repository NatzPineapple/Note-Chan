/* ────────────────────────────  UpdateSettings.js  ───────────────────────── */
(function (factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        window.UpdateSettings = factory();
    }
})(function () {

    function criar() {
        const { escapeHtml } = UiUtils;

        const statusEl    = document.getElementById("update-status");
        const hintEl      = document.getElementById("update-hint");
        const checkBtn    = document.getElementById("update-check-btn");
        const downloadBtn = document.getElementById("update-download-btn");

        let updateUrl = null;

        function aplicarResultado(result) {
            if (!result.ok) {
                hintEl.textContent = "Não foi possível verificar agora: " + (result.error || "erro desconhecido")
                    + ". Sem internet ou atrás de um proxy, isso é esperado.";
                downloadBtn.classList.add("hidden");
                return;
            }
            if (result.noReleases) {
                hintEl.textContent = "Nenhuma versão publicada ainda no GitHub para comparar.";
                downloadBtn.classList.add("hidden");
                return;
            }
            if (result.updateAvailable) {
                statusEl.innerHTML = `Versão <b>${escapeHtml(result.latest)}</b> disponível — você está na v${escapeHtml(result.current)}`;
                hintEl.textContent = "O download é manual: o botão abaixo abre a página do release no navegador.";
                updateUrl = result.url;
                downloadBtn.classList.remove("hidden");
                return;
            }
            statusEl.textContent = `Versão instalada: v${result.current}`;
            hintEl.textContent = `Você já está na versão mais recente (${result.latest}).`;
            downloadBtn.classList.add("hidden");
        }

        checkBtn.addEventListener("click", async () => {
            checkBtn.disabled = true;
            checkBtn.textContent = "Verificando...";
            hintEl.textContent = "Consultando os releases no GitHub...";
            try {
                aplicarResultado(await window.api.invoke("check-update"));
            } catch (e) {
                aplicarResultado({ ok: false, error: e.message, current: "" });
                Log.error("[UPDATE] Verificação falhou:", e.message);
            } finally {
                checkBtn.disabled = false;
                checkBtn.textContent = "Verificar";
            }
        });

        downloadBtn.addEventListener("click", () => {
            if (updateUrl) window.api.send("open-link", updateUrl);
        });

        return { aplicarResultado };
    }

    return { criar };
});
