/* ─────────────────────────  AppearanceSettings.js  ──────────────────────── */
(function (factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        window.AppearanceSettings = factory();
    }
})(function () {

    const ALARM_SOUND_ICONS = { sininho: "bell", caixinha: "music", passarinho: "bird", classico: "alarm-clock" };
    const TAMANHOS_EDITOR = [12, 13, 14, 15, 16, 18, 20, 22];
    const INDENTS_EDITOR = [2, 4, 8];
    const SLIDER_SAVE_DELAY_MS = 200;
    const PREVIEW_MS = 2600;

    function preencherSelect(el, valores, rotulo) {
        el.innerHTML = "";
        for (const valor of valores) {
            const op = document.createElement("option");
            op.value = String(valor);
            op.textContent = rotulo(valor);
            el.appendChild(op);
        }
    }

    function criar({ obterSettings, salvar }) {
        const themeButtons       = document.querySelectorAll(".theme-swatch");
        const slider             = document.getElementById("transparency-slider");
        const sliderValue        = document.getElementById("transparency-value");
        const alarmEnabledToggle = document.getElementById("alarm-enabled-toggle");
        const alarmVolumeSlider  = document.getElementById("alarm-volume-slider");
        const alarmVolumeValue   = document.getElementById("alarm-volume-value");
        const alarmSoundList     = document.getElementById("alarm-sound-list");
        const editorFontSize     = document.getElementById("editor-font-size");
        const editorIndent       = document.getElementById("editor-indent");

        /* ─────────────────────────  Temas  ────────────────────────────── */

        themeButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                document.documentElement.dataset.theme = btn.dataset.theme;
                themeButtons.forEach(b => b.classList.toggle("selected", b === btn));
                salvar({ theme: btn.dataset.theme });
            });
        });

        /* ─────────────────────  Transparência  ────────────────────────── */

        let sliderTimer = null;
        slider.addEventListener("input", () => {
            sliderValue.textContent = `${slider.value}%`;
            clearTimeout(sliderTimer);
            sliderTimer = setTimeout(() => salvar({ transparency: Number(slider.value) }), SLIDER_SAVE_DELAY_MS);
        });

        /* ─────────────────────────  Alarme  ───────────────────────────── */

        alarmEnabledToggle.addEventListener("change", () => {
            salvar({ alarm: { enabled: alarmEnabledToggle.checked } });
        });

        let alarmVolumeTimer = null;
        alarmVolumeSlider.addEventListener("input", () => {
            alarmVolumeValue.textContent = `${alarmVolumeSlider.value}%`;
            clearTimeout(alarmVolumeTimer);
            alarmVolumeTimer = setTimeout(() => salvar({ alarm: { volume: Number(alarmVolumeSlider.value) } }), SLIDER_SAVE_DELAY_MS);
        });

        let stopAlarmPreview = null;
        let renderedAlarmSound = null;

        function pararPrevia() {
            if (stopAlarmPreview) { stopAlarmPreview(); stopAlarmPreview = null; }
        }

        function renderAlarmSoundList() {
            const atual = obterSettings().alarm?.sound ?? null;
            renderedAlarmSound = atual;
            alarmSoundList.innerHTML = "";
            Object.entries(AlarmSounds.SOUNDS).forEach(([key, sound]) => {
                const row = document.createElement("div");
                row.className = "alarm-sound-row" + (atual === key ? " selected" : "");
                row.innerHTML = `
                    <span class="alarm-sound-label">${Icons.svg(ALARM_SOUND_ICONS[key], 13)} ${sound.label}</span>
                    <button type="button" class="alarm-sound-preview" title="Testar">${Icons.svg("play", 10)}</button>
                `;
                row.addEventListener("click", () => {
                    salvar({ alarm: { sound: key } });
                    renderAlarmSoundList();
                });
                row.querySelector(".alarm-sound-preview").addEventListener("click", (e) => {
                    e.stopPropagation();
                    pararPrevia();
                    stopAlarmPreview = AlarmSounds.play(key, Number(alarmVolumeSlider.value));
                    setTimeout(pararPrevia, PREVIEW_MS);
                });
                alarmSoundList.appendChild(row);
            });
        }

        /* ─────────────────────  Editor de texto  ──────────────────────── */

        preencherSelect(editorFontSize, TAMANHOS_EDITOR, v => v + " px");
        preencherSelect(editorIndent, INDENTS_EDITOR, v => v + (v === 1 ? " espaço" : " espaços"));

        editorFontSize.addEventListener("change", () => {
            salvar({ editor: { fontSize: Number(editorFontSize.value) } });
        });

        editorIndent.addEventListener("change", () => {
            salvar({ editor: { indentSize: Number(editorIndent.value) } });
        });

        /* ─────────────────────────  API  ──────────────────────────────── */

        function aplicar(s) {
            document.documentElement.dataset.theme = s.theme;
            themeButtons.forEach(btn => btn.classList.toggle("selected", btn.dataset.theme === s.theme));

            if (document.activeElement !== slider) {
                slider.value = s.transparency;
                sliderValue.textContent = `${s.transparency}%`;
            }

            alarmEnabledToggle.checked = !!s.alarm?.enabled;
            if (document.activeElement !== alarmVolumeSlider) {
                alarmVolumeSlider.value = s.alarm?.volume ?? 70;
                alarmVolumeValue.textContent = `${alarmVolumeSlider.value}%`;
            }
            if (renderedAlarmSound !== (s.alarm?.sound ?? null)) renderAlarmSoundList();

            if (document.activeElement !== editorFontSize) editorFontSize.value = String(s.editor?.fontSize ?? 15);
            if (document.activeElement !== editorIndent) editorIndent.value = String(s.editor?.indentSize ?? 4);
        }

        return { aplicar };
    }

    return { criar };
});
