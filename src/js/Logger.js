/* ─────────────────────────────  Logger.js  ──────────────────────────────── */
(function (factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory(true);
    } else {
        window.Log = factory(false);
    }
})(function (noProcessoPrincipal) {

    const NIVEIS = { INFO: "INFO ", WARN: "WARN ", ERROR: "ERROR" };

    function formatArgs(args) {
        return args.map(arg => {
            if (arg instanceof Error) return arg.stack || String(arg);
            if (typeof arg === "object" && arg !== null) {
                try { return JSON.stringify(arg); } catch { return "[objeto circular]"; }
            }
            return String(arg);
        }).join(" ");
    }

    /* ══════════════════════════════  RENDERER  ══════════════════════════════ */

    if (!noProcessoPrincipal) {
        let origem = "renderer";

        function enviar(nivel, args) {
            try {
                window.api.send("log-entry", { nivel, origem, mensagem: formatArgs(args) });
            } catch {
            }
        }

        function log(...args)  { console.log(...args);   enviar("INFO", args); }
        function warn(...args) { console.warn(...args);  enviar("WARN", args); }
        function error(...args){ console.error(...args); enviar("ERROR", args); }

        function capturarFalhas() {
            window.addEventListener("error", (e) => {
                const detalhe = e.error && e.error.stack
                    ? e.error.stack
                    : `${e.message} (${e.filename || "?"}:${e.lineno || 0})`;
                error("[FALHA] Exceção não tratada:", detalhe);
            });

            window.addEventListener("unhandledrejection", (e) => {
                const motivo = e.reason && e.reason.stack ? e.reason.stack : String(e.reason);
                error("[FALHA] Promessa rejeitada sem tratamento:", motivo);
            });
        }

        return {
            iniciar(nome) {
                origem = nome || "renderer";
                capturarFalhas();
                log("[JANELA] Iniciada.");
            },
            log, warn, error
        };
    }

    /* ════════════════════════════════  MAIN  ═══════════════════════════════ */

    const fs  = require("fs");
    const fsp = fs.promises;
    const PATHS = require("./Paths");
    const logFile = PATHS.logFile;

    const MAX_LOG_BYTES = 2 * 1024 * 1024;
    const MAX_QUEUE     = 5000;

    /* ─────────────────────  Higienização (rede de segurança)  ─────────────── */
    // Política do log: registrar O QUE aconteceu, não o CONTEÚDO do usuário.
    // O código chama o log com ids (de nota, evento, ...) em vez de títulos e
    // nomes. Esta etapa é a rede de segurança para o que escapar — mensagens de
    // exceção, pilhas de chamada, linhas vindas das telas:
    //   - pasta do usuário (C:\Users\<nome>)  → %USERPROFILE%
    //   - endereços de e-mail                 → <e-mail>
    //   - tokens do Google / "Bearer ..."     → <token>
    // E impede que uma mensagem forje linhas: toda linha de continuação começa
    // recuada, então só uma entrada de verdade começa com "[".
    const os = require("os");

    function escaparRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

    const PASTA_USUARIO = (() => {
        const home = os.homedir();
        // Qualquer X:\Users\<nome> (inclui o nome curto 8.3, como DESENV~1, que
        // o Windows usa em caminhos temporários e não bate com homedir()), e
        // também a pasta pessoal exata, onde quer que ela esteja.
        const variantes = ["[A-Za-z]:[\\\\/]Users[\\\\/][^\\\\/\\s\"'<>|:*?]+"];
        if (home) variantes.push(...[home, home.replace(/\\/g, "/")].map(escaparRegex));
        return new RegExp(variantes.join("|"), "gi");
    })();

    const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/g;
    const RE_TOKENS = /\b(ya29\.[\w-]+|1\/\/[\w-]{10,}|Bearer\s+[\w.~+\/-]+=*)/g;

    function higienizar(texto) {
        let t = String(texto);
        if (PASTA_USUARIO) t = t.replace(PASTA_USUARIO, "%USERPROFILE%");
        t = t.replace(RE_TOKENS, "<token>");
        t = t.replace(RE_EMAIL, "<e-mail>");
        return t.replace(/\r\n|\r|\n/g, "\n    ");
    }

    let queue = [];
    let flushing = false;
    let ultimoCorpo = null;
    let repetidas = 0;

    function agora() {
        return new Date().toISOString();
    }

    function enfileirar(linha) {
        if (queue.length > MAX_QUEUE) return;
        queue.push(linha + "\n");
        if (!flushing) flush();
    }

    function despejarRepetidas() {
        if (repetidas === 0) return;
        const n = repetidas;
        repetidas = 0;
        enfileirar(`[${agora()}] [${NIVEIS.INFO}] [logger] (mensagem anterior repetida ${n}x)`);
    }

    function append(nivel, origem, texto) {
        const corpo = `[${nivel}] [${origem}] ${higienizar(texto)}`;
        if (corpo === ultimoCorpo) { repetidas++; return; }
        despejarRepetidas();
        ultimoCorpo = corpo;
        enfileirar(`[${agora()}] ${corpo}`);
    }

    async function rotateIfNeeded() {
        try {
            const stat = await fsp.stat(logFile);
            if (stat.size < MAX_LOG_BYTES) return;

            const archive = `${logFile}.1`;
            try {
                await fsp.unlink(archive);
            } catch (e) {
                if (e.code !== "ENOENT") throw e;
            }
            await fsp.rename(logFile, archive);
        } catch (e) {
            if (e.code !== "ENOENT") console.error("[LOGGER] Falha ao rotacionar log:", e.message);
        }
    }

    // As linhas só saem da fila DEPOIS de gravadas. Antes saíam antes, e o
    // flushSync() da saída do app encontrava a fila vazia: o que estava sendo
    // gravado em segundo plano se perdia com o processo (por isso "=== Note-Chan
    // encerrado ===" e avisos dos últimos instantes nunca chegavam ao arquivo).
    // Se o app fechar no meio de uma gravação, o pior caso agora é uma linha
    // duplicada — melhor do que uma linha a menos num registro de auditoria.
    // geracao muda a cada flushSync(): se ele esvaziou a fila enquanto uma
    // gravação assíncrona estava em andamento, essa gravação não pode tirar
    // nada da fila depois — o que estiver lá agora são linhas novas.
    let geracao = 0;

    async function flush() {
        flushing = true;
        while (queue.length) {
            const n = queue.length;
            const minhaGeracao = geracao;
            try {
                await rotateIfNeeded();
                await fsp.appendFile(logFile, queue.slice(0, n).join(""), "utf8");
            } catch (e) {
                console.error("[LOGGER] Falha ao gravar log:", e.message);
            }
            if (minhaGeracao === geracao) queue.splice(0, n);
        }
        flushing = false;
    }

    function flushSync() {
        despejarRepetidas();
        geracao++;
        if (!queue.length) return;
        try {
            fs.appendFileSync(logFile, queue.splice(0, queue.length).join(""), "utf8");
        } catch (e) {
            console.error("[LOGGER] Falha ao gravar log na saída:", e.message);
        }
    }

    const ORIGENS = new Set(["widget", "configuracoes", "nota", "captura", "evento", "alarme", "renderer"]);
    const MAX_MENSAGEM = 4000;

    function registrarDeRenderer(entrada) {
        if (!entrada || typeof entrada !== "object") return;
        const nivel = NIVEIS[entrada.nivel] || NIVEIS.INFO;
        const origem = ORIGENS.has(entrada.origem) ? entrada.origem : "renderer";
        const mensagem = String(entrada.mensagem ?? "").slice(0, MAX_MENSAGEM);
        append(nivel, origem, mensagem);
    }

    function log(...args)   { console.log(...args);   append(NIVEIS.INFO,  "main", formatArgs(args)); }
    function warn(...args)  { console.warn(...args);  append(NIVEIS.WARN,  "main", formatArgs(args)); }
    function error(...args) { console.error(...args); append(NIVEIS.ERROR, "main", formatArgs(args)); }

    function capturarFalhasDoProcesso() {
        process.on("uncaughtException", (e) => {
            error("[FALHA] Exceção não tratada no processo principal:", e);
            flushSync();
        });
        process.on("unhandledRejection", (motivo) => {
            error("[FALHA] Promessa rejeitada sem tratamento:", motivo);
        });
    }

    return { log, warn, error, flushSync, registrarDeRenderer, capturarFalhasDoProcesso };
});
