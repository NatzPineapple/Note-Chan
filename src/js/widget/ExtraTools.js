/* ─────────────────────────────  ExtraTools.js  ──────────────────────────── */
(function (factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        window.ExtraTools = factory();
    }
})(function () {

    function normalizeSearch(str) {
        return (str ?? "")
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase();
    }

    function formatTimerMs(ms) {
        const totalSec = Math.max(0, Math.round(ms / 1000));
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        const mm = String(m).padStart(2, "0");
        const ss = String(s).padStart(2, "0");
        return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    }

    function criar({ obterDados, renderBoard, aoAbrir }) {
        const searchBtn   = document.getElementById("searchbtn");
        const searchBar   = document.getElementById("search-bar");
        const searchInput = document.getElementById("search-input");

        const timerBtn         = document.getElementById("timerbtn");
        const timerPanel       = document.getElementById("timer-panel");
        const timerBadge       = document.getElementById("timer-badge");
        const timerDisplay     = document.getElementById("timer-display");
        const timerModeButtons = document.querySelectorAll(".timer-mode-btn");
        const timerDurationRow = document.getElementById("timer-duration-row");
        const timerMinutesEl   = document.getElementById("timer-minutes");
        const timerSecondsEl   = document.getElementById("timer-seconds");
        const timerStartBtn    = document.getElementById("timer-start-btn");
        const timerResetBtn    = document.getElementById("timer-reset-btn");

        /* ══════════════════════════════  BUSCA  ═══════════════════════════ */

        let searchQuery = "";

        function isSearchOpen() {
            return searchBar.classList.contains("open");
        }

        function openSearch() {
            closeTimerPanel();
            aoAbrir();
            searchBar.classList.add("open");
            searchInput.focus();
            searchInput.select();
        }

        function closeSearch() {
            searchBar.classList.remove("open");
            if (searchQuery) {
                searchInput.value = "";
                searchQuery = "";
                renderBoard();
            }
        }

        function filtrarPorBusca(items) {
            if (!searchQuery) return items;
            return items.filter(item => normalizeSearch(item.title).includes(searchQuery));
        }

        searchBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (isSearchOpen()) closeSearch();
            else openSearch();
        });

        searchInput.addEventListener("input", () => {
            searchQuery = normalizeSearch(searchInput.value);
            renderBoard();
        });

        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closeSearch();
            }
        });

        // Foco saiu do campo (clicou em outro lugar, trocou de aba, etc.) -> some
        // sozinha, mesmo padrão de recolher usado nos cards.
        searchInput.addEventListener("blur", () => {
            setTimeout(() => {
                if (document.activeElement === searchInput) return;
                closeSearch();
            }, 0);
        });

        /* ═════════════════════  CRONÔMETRO / TEMPORIZADOR  ════════════════ */

        let timerMode = "stopwatch";
        let timerRunning = false;
        let timerAccumulatedMs = 0;
        let timerRunStartTs = null;
        let timerDurationMs = 5 * 60000;
        let timerTickHandle = null;
        let stopTimerSound = null;

        function timerElapsedMs() {
            return timerAccumulatedMs + (timerRunning ? Date.now() - timerRunStartTs : 0);
        }

        function isTimerOpen() {
            return timerPanel.classList.contains("open");
        }

        function updateTimerDisplay() {
            const elapsed = timerElapsedMs();
            let currentMs = elapsed;
            let done = false;
            if (timerMode === "timer") {
                currentMs = timerDurationMs - elapsed;
                done = currentMs <= 0;
                if (done) currentMs = 0;
            }

            const text = formatTimerMs(currentMs);
            timerDisplay.textContent = text;
            timerDisplay.classList.toggle("timer-done", done);

            timerBadge.textContent = (timerRunning || elapsed > 0) ? text : "";
            timerBadge.classList.toggle("timer-done", done);

            return done;
        }

        function stopTimerTick() {
            if (timerTickHandle) { clearInterval(timerTickHandle); timerTickHandle = null; }
        }

        function stopSound() {
            if (stopTimerSound) { stopTimerSound(); stopTimerSound = null; }
        }

        function playTimerDoneSound() {
            stopSound();
            const alarm = obterDados().settings?.alarm || {};
            stopTimerSound = AlarmSounds.play(alarm.sound || "sininho", alarm.volume ?? 70);
            setTimeout(stopSound, 2600);
        }

        function timerFinished() {
            timerRunning = false;
            timerRunStartTs = null;
            timerAccumulatedMs = timerDurationMs;
            stopTimerTick();
            updateTimerDisplay();
            playTimerDoneSound();
            timerStartBtn.textContent = "▶ Iniciar";
            setTimeout(() => { if (!timerRunning) resetTimer(); }, 2600);
        }

        function startTimerTick() {
            stopTimerTick();
            timerTickHandle = setInterval(() => {
                const done = updateTimerDisplay();
                if (timerMode === "timer" && done) timerFinished();
            }, 250);
        }

        function isChoosingDuration() {
            return timerMode === "timer" && !timerRunning && timerAccumulatedMs === 0;
        }

        function timerHasProgress() {
            return timerRunning || timerAccumulatedMs > 0;
        }

        function updateDurationRowVisibility() {
            timerDurationRow.classList.toggle("visible", isChoosingDuration());
        }

        function durationInputMs() {
            const min = Math.max(0, Math.min(180, Number(timerMinutesEl.value) || 0));
            const sec = Math.max(0, Math.min(59, Number(timerSecondsEl.value) || 0));
            return (min * 60 + sec) * 1000;
        }

        function updateDurationPreview() {
            if (!isChoosingDuration()) return;
            timerDisplay.textContent = formatTimerMs(durationInputMs());
            timerDisplay.classList.remove("timer-done");
            timerBadge.textContent = "";
            timerBadge.classList.remove("timer-done");
        }

        function refreshTimerDisplay() {
            if (isChoosingDuration()) updateDurationPreview();
            else updateTimerDisplay();
        }

        timerMinutesEl.addEventListener("input", updateDurationPreview);
        timerSecondsEl.addEventListener("input", updateDurationPreview);

        function setTimerMode(mode) {
            if (timerHasProgress() || mode === timerMode) return;
            timerAccumulatedMs = 0;
            timerMode = mode;
            timerStartBtn.textContent = "▶ Iniciar";
            timerModeButtons.forEach(btn => btn.classList.toggle("active", btn.dataset.mode === mode));
            updateDurationRowVisibility();
            refreshTimerDisplay();
        }

        timerModeButtons.forEach(btn => {
            btn.addEventListener("click", () => setTimerMode(btn.dataset.mode));
        });

        function startPauseTimer() {
            if (timerRunning) {
                // pausa
                timerAccumulatedMs = timerElapsedMs();
                timerRunning = false;
                timerRunStartTs = null;
                stopTimerTick();
                timerStartBtn.textContent = "▶ Continuar";
            } else {
                if (timerMode === "timer" && timerAccumulatedMs === 0) {
                    timerDurationMs = durationInputMs();
                    if (timerDurationMs <= 0) return; // nada pra contar
                }
                timerRunning = true;
                timerRunStartTs = Date.now();
                startTimerTick();
                timerStartBtn.textContent = "⏸ Pausar";
            }
            timerModeButtons.forEach(btn => btn.disabled = timerHasProgress());
            updateDurationRowVisibility();
            refreshTimerDisplay();
        }

        function resetTimer() {
            timerRunning = false;
            timerRunStartTs = null;
            timerAccumulatedMs = 0;
            stopTimerTick();
            stopSound();
            timerStartBtn.textContent = "▶ Iniciar";
            timerModeButtons.forEach(btn => btn.disabled = false);
            updateDurationRowVisibility();
            refreshTimerDisplay();
        }

        timerStartBtn.addEventListener("click", startPauseTimer);
        timerResetBtn.addEventListener("click", resetTimer);

        function openTimerPanel() {
            closeSearch();
            aoAbrir();
            timerPanel.classList.add("open");
        }

        function closeTimerPanel() {
            timerPanel.classList.remove("open");
        }

        timerBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (isTimerOpen()) closeTimerPanel();
            else openTimerPanel();
        });

        // Clicar fora fecha o painel (não tem um único campo pra pendurar um
        // blur/focusout como a busca -- é um painel com vários controles).
        document.addEventListener("click", (e) => {
            if (!isTimerOpen()) return;
            if (timerPanel.contains(e.target) || timerBtn.contains(e.target)) return;
            closeTimerPanel();
        });

        updateDurationRowVisibility();
        refreshTimerDisplay();

        /* ══════════════════════════════  API  ═════════════════════════════ */

        function fecharAberto() {
            if (isSearchOpen()) { closeSearch(); return true; }
            if (isTimerOpen()) { closeTimerPanel(); return true; }
            return false;
        }

        function fecharTudo() {
            closeSearch();
            closeTimerPanel();
        }

        return {
            abrirBusca: openSearch,
            temBusca: () => searchQuery !== "",
            filtrarPorBusca,
            fecharAberto,
            fecharTudo
        };
    }

    return { criar, normalizeSearch, formatTimerMs };
});
