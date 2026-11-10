/* ──────────────────────────  ShortcutRecorder.js  ───────────────────────── */
(function (factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        window.ShortcutRecorder = factory();
    }
})(function () {

    const KEY_MAP = {
        " ": "Space", "ArrowUp": "Up", "ArrowDown": "Down", "ArrowLeft": "Left", "ArrowRight": "Right",
        "Escape": "Escape"
    };

    const DICA_PADRAO = "Clique num atalho e pressione a combinação desejada (precisa de Ctrl, Alt ou Shift).";

    const GRUPOS_ATALHO = {
        shortcuts: {
            toggleWidget: "rec-toggleWidget",
            quickCapture: "rec-quickCapture",
            quickEvent: "rec-quickEvent",
            newNoteWindow: "rec-newNoteWindow"
        },
        editorShortcuts: {
            negrito: "rec-negrito",
            italico: "rec-italico",
            sublinhado: "rec-sublinhado",
            lista: "rec-lista",
            listaNumerada: "rec-listaNumerada"
        }
    };

    function eventToAccelerator(e) {
        const parts = [];
        if (e.ctrlKey) parts.push("Control");
        if (e.altKey) parts.push("Alt");
        if (e.shiftKey) parts.push("Shift");
        if (e.metaKey) parts.push("Super");

        if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null;

        const keyName = KEY_MAP[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key);
        parts.push(keyName);
        return parts;
    }

    function criar({ obterSettings, salvar }) {
        const hint = document.getElementById("shortcut-hint");

        const recorders = {};
        const grupoDaAcao = {};
        for (const [grupo, mapa] of Object.entries(GRUPOS_ATALHO)) {
            for (const [acao, id] of Object.entries(mapa)) {
                recorders[acao] = document.getElementById(id);
                grupoDaAcao[acao] = grupo;
            }
        }

        let recordingAction = null;

        function rotuloAtual(acao, s = obterSettings()) {
            return (s[grupoDaAcao[acao]] || {})[acao] || "(nenhum)";
        }

        function mostrarDica(texto, erro = false) {
            hint.textContent = texto;
            hint.classList.toggle("error", erro);
        }

        function startRecording(action, btn) {
            if (recordingAction) stopRecording(false);
            recordingAction = action;
            btn.classList.add("recording");
            btn.textContent = "Pressione a combinação...";
            mostrarDica("Pressione Ctrl/Alt/Shift + uma tecla. Esc para cancelar.");
        }

        function stopRecording(restoreLabel = true) {
            if (!recordingAction) return;
            const btn = recorders[recordingAction];
            btn.classList.remove("recording");
            if (restoreLabel) btn.textContent = rotuloAtual(recordingAction);
            recordingAction = null;
        }

        Object.entries(recorders).forEach(([action, btn]) => {
            btn.addEventListener("click", () => startRecording(action, btn));
        });

        window.addEventListener("keydown", (e) => {
            if (!recordingAction) return;
            e.preventDefault();

            if (e.key === "Escape") {
                stopRecording();
                mostrarDica(DICA_PADRAO);
                return;
            }

            const parts = eventToAccelerator(e);
            if (!parts) return;

            if (parts.length < 2) {
                mostrarDica("Use pelo menos um modificador (Ctrl, Alt ou Shift).", true);
                return;
            }

            const accelerator = parts.join("+");
            const action = recordingAction;
            recorders[action].textContent = accelerator;
            stopRecording(false);
            mostrarDica(DICA_PADRAO);
            salvar({ [grupoDaAcao[action]]: { [action]: accelerator } });
        });

        function aplicar(s) {
            Object.keys(recorders).forEach(action => {
                recorders[action].textContent = rotuloAtual(action, s);
            });
        }

        return { aplicar, estaGravando: () => recordingAction !== null };
    }

    return { criar, eventToAccelerator };
});
