/* ──────────────────────────────  QuickEvent.js  ──────────────────────────── */

Log.iniciar("evento-rapido");

const titleEl      = document.getElementById("qe-title");
const dateEl       = document.getElementById("qe-date");
const startEl      = document.getElementById("qe-start");
const endEl        = document.getElementById("qe-end");
const recurrenceEl = document.getElementById("qe-recurrence");
const fields       = [titleEl, dateEl, startEl, endEl, recurrenceEl];

document.getElementById("qe-icon").innerHTML = Icons.svg("calendar", 16);

function applySettings(settings) {
    if (!settings) return;
    document.documentElement.dataset.theme = settings.theme || "gold";
}

function reset() {
    titleEl.value = "";
    titleEl.classList.remove("invalid");
    dateEl.value = EventUtils.todayISO();
    startEl.value = "";
    endEl.value = "";
    recurrenceEl.value = "none";
    titleEl.focus();
}

function submit() {
    const title = titleEl.value.trim();
    if (!title) {
        titleEl.classList.add("invalid");
        titleEl.focus();
        return;
    }
    window.api.send("quick-event-submit", {
        title,
        date: dateEl.value || EventUtils.todayISO(),
        startTime: startEl.value || null,
        endTime: endEl.value || null,
        recurrence: recurrenceEl.value
    });
}

RichEditor.ligarSetas(titleEl);
titleEl.addEventListener("input", () => titleEl.classList.remove("invalid"));

fields.forEach(field => {
    field.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            submit();
        } else if (e.key === "Escape") {
            e.preventDefault();
            window.api.send("quick-event-cancel");
        }
    });
});

window.api.on("reset", reset);
window.api.on("apply-settings", applySettings);

window.api.invoke("get-data")
    .then(loaded => applySettings(loaded.settings))
    .catch(e => Log.error("[BOOT] get-data falhou, tema fica no padrão:", e.message));

reset();
