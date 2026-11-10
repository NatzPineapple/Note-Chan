/* ────────────────────────────  HabitTracker.js  ─────────────────────────── */
(function (factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        window.HabitTracker = factory();
    }
})(function () {

    const SEMANAS_NO_HISTORICO = 18;
    const TICK_MS = 60 * 1000;

    const FREQUENCIAS = {
        daily:    { label: "Diário",    unidade: ["dia", "dias"],           pendente: "Pendente hoje",          volta: () => "volta amanhã" },
        weekly:   { label: "Semanal",   unidade: ["semana", "semanas"],     pendente: "Pendente esta semana",   volta: () => "volta na segunda" },
        biweekly: { label: "Quinzenal", unidade: ["quinzena", "quinzenas"], pendente: "Pendente esta quinzena", volta: (chave) => `volta em ${UiUtils.formatBR(EventUtils.addDays(chave, 14))}` },
        monthly:  { label: "Mensal",    unidade: ["mês", "meses"],          pendente: "Pendente este mês",      volta: () => "volta dia 1º" }
    };

    const DIAS_COMPACTO = 7;
    const LETRAS_DA_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

    const ANCORA_QUINZENA = "2024-01-01";

    /* ─────────────────────────  Períodos  ─────────────────────────── */

    function diaDaSemana(iso) {
        const [y, m, d] = iso.split("-").map(Number);
        return new Date(y, m - 1, d).getDay();
    }

    function segundaDaSemana(iso) {
        return EventUtils.addDays(iso, -((diaDaSemana(iso) + 6) % 7));
    }

    function chaveDoPeriodo(iso, freq) {
        if (freq === "weekly") return segundaDaSemana(iso);
        if (freq === "biweekly") {
            const segunda = segundaDaSemana(iso);
            const semanas = Math.floor(EventUtils.daysBetween(ANCORA_QUINZENA, segunda) / 7);
            return EventUtils.addDays(segunda, -(((semanas % 2) + 2) % 2) * 7);
        }
        if (freq === "monthly") return iso.slice(0, 7);
        return iso;
    }

    function periodoAnterior(chave, freq) {
        if (freq === "weekly") return EventUtils.addDays(chave, -7);
        if (freq === "biweekly") return EventUtils.addDays(chave, -14);
        if (freq === "monthly") {
            const [y, m] = chave.split("-").map(Number);
            return m === 1 ? `${y - 1}-12` : `${y}-${EventUtils.pad(m - 1)}`;
        }
        return EventUtils.addDays(chave, -1);
    }

    function periodosFeitos(habit) {
        return new Set(habit.doneDates.map(d => chaveDoPeriodo(d, habit.frequency)));
    }

    function feitoNoPeriodoAtual(habit, hoje) {
        return periodosFeitos(habit).has(chaveDoPeriodo(hoje, habit.frequency));
    }

    function sequencia(habit, hoje) {
        const feitos = periodosFeitos(habit);
        let chave = chaveDoPeriodo(hoje, habit.frequency);
        if (!feitos.has(chave)) chave = periodoAnterior(chave, habit.frequency);
        let total = 0;
        while (feitos.has(chave) && total < 5000) {
            total++;
            chave = periodoAnterior(chave, habit.frequency);
        }
        return total;
    }

    /* ─────────────────────────  Módulo  ───────────────────────────── */

    function criar({ obterDados, container, salvar, aoAbrir, aoCompletar }) {
        const fab      = document.getElementById("habits-fab");
        const backBtn  = document.getElementById("habits-back-btn");
        const resumoEl = document.getElementById("habits-summary");
        const nomeEl   = document.getElementById("habit-new-name");
        const freqEl   = document.getElementById("habit-new-frequency");
        const addBtn   = document.getElementById("habit-add-btn");
        const listaEl  = document.getElementById("habits-list");
        const avisoEl  = document.getElementById("habits-fab-alert");

        let ultimoDiaRenderizado = null;

        function habitos() {
            const data = obterDados();
            if (!Array.isArray(data.habits)) data.habits = [];
            return data.habits;
        }

        function registrarMudanca(habit) {
            habit.updatedAt = Date.now();
            salvar();
            render();
        }

        /* ───────────────────────  Ações  ────────────────────────────── */

        function criarHabito() {
            const name = nomeEl.value.trim();
            if (!name) { nomeEl.focus(); return; }
            habitos().push({
                id: UiUtils.newId(),
                name,
                frequency: FREQUENCIAS[freqEl.value] ? freqEl.value : "daily",
                doneDates: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
            nomeEl.value = "";
            salvar();
            render();
            nomeEl.focus();
        }

        function alternarPeriodoAtual(habit) {
            const hoje = EventUtils.todayISO();
            if (feitoNoPeriodoAtual(habit, hoje)) {
                const atual = chaveDoPeriodo(hoje, habit.frequency);
                habit.doneDates = habit.doneDates.filter(d => chaveDoPeriodo(d, habit.frequency) !== atual);
            } else {
                habit.doneDates.push(hoje);
                aoCompletar();
            }
            registrarMudanca(habit);
        }

        function alternarDia(habit, iso) {
            if (habit.doneDates.includes(iso)) {
                habit.doneDates = habit.doneDates.filter(d => d !== iso);
            } else {
                habit.doneDates.push(iso);
            }
            registrarMudanca(habit);
        }

        /* ───────────────────────  Tela  ─────────────────────────────── */

        function gradeHtml(habit, hoje) {
            const feitos = new Set(habit.doneDates);
            const periodos = periodosFeitos(habit);
            const inicio = EventUtils.addDays(hoje, -diaDaSemana(hoje) - (SEMANAS_NO_HISTORICO - 1) * 7);
            let html = "";
            for (let i = 0; i < SEMANAS_NO_HISTORICO * 7; i++) {
                const dia = EventUtils.addDays(inicio, i);
                if (dia > hoje) { html += `<span class="habit-cell future"></span>`; continue; }
                const cls = feitos.has(dia) ? " on"
                    : periodos.has(chaveDoPeriodo(dia, habit.frequency)) ? " covered" : "";
                html += `<span class="habit-cell${cls}${dia === hoje ? " today" : ""}" data-day="${dia}" title="${UiUtils.formatBR(dia)}"></span>`;
            }
            return html;
        }

        function gradeCompactaHtml(habit, hoje) {
            const feitos = new Set(habit.doneDates);
            const periodos = periodosFeitos(habit);
            let html = "";
            for (let i = DIAS_COMPACTO - 1; i >= 0; i--) {
                const dia = EventUtils.addDays(hoje, -i);
                const cls = feitos.has(dia) ? " on"
                    : periodos.has(chaveDoPeriodo(dia, habit.frequency)) ? " covered" : "";
                html += `<span class="habit-day">
                    <span class="habit-cell${cls}${dia === hoje ? " today" : ""}" data-day="${dia}" title="${UiUtils.formatBR(dia)}"></span>
                    <span class="habit-day-letter">${LETRAS_DA_SEMANA[diaDaSemana(dia)]}</span>
                </span>`;
            }
            return html;
        }

        function cardDoHabito(habit, hoje) {
            const freq = FREQUENCIAS[habit.frequency] || FREQUENCIAS.daily;
            const feito = feitoNoPeriodoAtual(habit, hoje);
            const seq = sequencia(habit, hoje);
            const meta = `${freq.label} · ${feito ? `Concluído, ${freq.volta(chaveDoPeriodo(hoje, habit.frequency))}` : freq.pendente}`;

            const card = document.createElement("div");
            card.className = "habit-card" + (feito ? " done" : "") + (habit.compact ? " compact" : "");
            card.dataset.id = habit.id;
            card.innerHTML = `
                <div class="habit-row">
                    <button type="button" class="habit-check" title="${feito ? "Desmarcar" : "Marcar como feito"}">${feito ? Icons.svg("check", 14) : ""}</button>
                    <div class="habit-info">
                        <div class="habit-name" spellcheck="false">${UiUtils.escapeHtml(habit.name)}</div>
                        <div class="habit-meta" title="${meta}">${meta}</div>
                    </div>
                    ${habit.compact ? `<div class="habit-grid">${gradeCompactaHtml(habit, hoje)}</div>` : ""}
                    <div class="habit-streak${seq ? "" : " zero"}" title="Sequência atual: ${seq} ${freq.unidade[seq === 1 ? 0 : 1]}">${Icons.svg("flame", 13)} ${seq}</div>
                    <div class="habit-size" title="${habit.compact ? "Mostrar histórico completo" : "Mostrar só os últimos 7 dias"}">${Icons.svg(habit.compact ? "chevrons-up-down" : "chevrons-down-up", 12)}</div>
                    <div class="habit-delete" title="Excluir hábito">${Icons.svg("x", 12)}</div>
                </div>
                ${habit.compact ? "" : `<div class="habit-grid">${gradeHtml(habit, hoje)}</div>`}
            `;

            card.querySelector(".habit-check").addEventListener("click", () => alternarPeriodoAtual(habit));

            card.querySelector(".habit-size").addEventListener("click", () => {
                habit.compact = !habit.compact;
                registrarMudanca(habit);
            });

            card.querySelector(".habit-grid").addEventListener("click", (e) => {
                const dia = e.target.dataset?.day;
                if (dia) alternarDia(habit, dia);
            });

            const nome = card.querySelector(".habit-name");
            nome.addEventListener("dblclick", () => {
                nome.contentEditable = "true";
                nome.focus();
                document.execCommand("selectAll", false, null);
            });
            nome.addEventListener("keydown", (e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                e.stopPropagation();
                nome.blur();
            });
            nome.addEventListener("blur", () => {
                if (!nome.isContentEditable) return;
                nome.contentEditable = "false";
                const novo = nome.textContent.trim();
                if (novo && novo !== habit.name) {
                    habit.name = novo;
                    registrarMudanca(habit);
                } else {
                    nome.textContent = habit.name;
                }
            });

            card.querySelector(".habit-delete").addEventListener("click", (e) => {
                UiUtils.armDeleteConfirm(e.currentTarget, () => {
                    obterDados().habits = habitos().filter(h => h.id !== habit.id);
                    salvar();
                    render();
                });
            });

            return card;
        }

        function render() {
            const hoje = EventUtils.todayISO();
            ultimoDiaRenderizado = hoje;
            const lista = habitos();

            listaEl.innerHTML = "";
            if (lista.length === 0) {
                listaEl.innerHTML = `<div class="habits-empty">Nenhum hábito ainda. Crie o primeiro acima.</div>`;
            }
            [...lista]
                .sort((a, b) => feitoNoPeriodoAtual(a, hoje) - feitoNoPeriodoAtual(b, hoje))
                .forEach(h => listaEl.appendChild(cardDoHabito(h, hoje)));

            const feitos = lista.filter(h => feitoNoPeriodoAtual(h, hoje)).length;
            resumoEl.textContent = lista.length ? `${feitos}/${lista.length} em dia` : "";
            atualizarAviso();
        }

        /* ────────────────────  Abrir e fechar  ──────────────────────── */

        function estaAberto() {
            return container.classList.contains("habits-open");
        }

        function abrir() {
            if (aoAbrir) aoAbrir();
            render();
            container.classList.add("habits-open");
        }

        function fechar() {
            if (!estaAberto()) return;
            if (document.activeElement && listaEl.parentElement.contains(document.activeElement)) {
                document.activeElement.blur();
            }
            container.classList.remove("habits-open");
        }

        /* ───────────────────────  Ligação  ──────────────────────────── */

        fab.addEventListener("click", (e) => {
            e.stopPropagation();
            abrir();
        });
        backBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            fechar();
        });
        addBtn.addEventListener("click", criarHabito);
        nomeEl.addEventListener("keydown", (e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            e.stopPropagation();
            criarHabito();
        });

        function atualizarAviso() {
            const hoje = EventUtils.todayISO();
            const pendentes = habitos().filter(h => !feitoNoPeriodoAtual(h, hoje)).length;
            avisoEl.hidden = pendentes === 0;
            fab.title = pendentes
                ? `Mapa de hábitos · ${pendentes} pendente${pendentes > 1 ? "s" : ""}`
                : "Mapa de hábitos";
        }

        setInterval(() => {
            if (EventUtils.todayISO() === ultimoDiaRenderizado) return;
            if (estaAberto()) render();
            else { ultimoDiaRenderizado = EventUtils.todayISO(); atualizarAviso(); }
        }, TICK_MS);

        return { abrir, fechar, estaAberto, atualizarAviso };
    }

    return { criar, chaveDoPeriodo, sequencia };
});
