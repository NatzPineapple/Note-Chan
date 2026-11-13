/* ───────────────────────────  StartupSettings.js  ────────────────────────── */
(function (factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        window.StartupSettings = factory();
    }
})(function () {

    function criar() {
        const toggle = document.getElementById("auto-start-toggle");
        const hintEl = document.getElementById("auto-start-hint");

        function aplicar(estado) {
            toggle.checked = estado.ativo;
            toggle.disabled = !estado.disponivel;
            if (!estado.disponivel) {
                hintEl.textContent = "Disponível só na versão instalada — em desenvolvimento o Windows abriria o Electron, não o Note-Chan.";
            }
        }

        toggle.addEventListener("change", async () => {
            const pedido = toggle.checked;
            toggle.disabled = true;
            try {
                aplicar(await window.api.invoke("set-auto-start", pedido));
            } catch (e) {
                toggle.checked = !pedido;
                toggle.disabled = false;
                Log.error("[INICIO] Não foi possível mudar o início automático:", e.message);
            }
        });

        window.api.invoke("get-auto-start")
            .then(aplicar)
            .catch(e => Log.error("[INICIO] get-auto-start falhou:", e.message));
    }

    return { criar };
});
