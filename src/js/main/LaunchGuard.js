/* ─────────────────────────────  LaunchGuard.js  ─────────────────────────── */
// Recusa abrir o app instalado com argumentos de linha de comando que ele não
// usa.
//
// Por quê: as fuses (package.json → electronFuses) desligam as portas do
// Node (--inspect, NODE_OPTIONS, ELECTRON_RUN_AS_NODE), mas as flags do
// Chromium continuam valendo. Sem esta guarda, qualquer programa rodando no
// computador poderia abrir o Note-Chan.exe com, por exemplo:
//   --remote-debugging-port=N  → controla as telas (e o window.api) por fora
//   --no-sandbox               → desliga o sandbox das telas
//   --disable-web-security     → desliga a política de mesma origem
//   --js-flags=...             → mexe no motor JavaScript
// e usar um executável confiável para isso.
//
// É uma lista do que é PERMITIDO, não do que é proibido: flag nova do Chromium
// não precisa ser lembrada aqui para ficar bloqueada.
// Em desenvolvimento (app não empacotado) nada é verificado.

const { app } = require("electron");

const PERMITIDOS = new Set([
    "--inicio-com-windows", // registrado por nós no início automático (Main.js → LOGIN_ITEM)
    "--updated"             // o instalador NSIS passa ao abrir o app depois de atualizar
]);

function argumentosEstranhos(argv) {
    // argv[0] é o próprio executável
    return argv.slice(1).filter(arg => !PERMITIDOS.has(arg));
}

/**
 * true: pode seguir. false: havia argumento fora da lista e o processo já
 * está sendo encerrado — quem chamou deve parar ali.
 */
function verificar() {
    if (!app.isPackaged) return true;

    const estranhos = argumentosEstranhos(process.argv);
    if (estranhos.length === 0) return true;

    // Registra para quem investigar depois. Gravação síncrona e direta no
    // arquivo: o Logger grava em segundo plano e o app.exit() logo abaixo
    // mataria o processo antes de a linha chegar ao disco.
    const texto = estranhos.map(a => a.slice(0, 80)).join(" ");
    console.error("[SECURITY] Abertura recusada — argumentos não permitidos:", texto);
    try {
        const fs = require("fs");
        const PATHS = require("../Paths");
        fs.appendFileSync(PATHS.logFile,
            `[${new Date().toISOString()}] [WARN ] [main] [SECURITY] Abertura recusada — argumentos não permitidos: ${texto}\n`, "utf8");
    } catch { /* sem log, mas recusa do mesmo jeito */ }

    // exit, não quit: não espera o ciclo de vida do app nem cria janela.
    app.exit(1);
    return false;
}

module.exports = { verificar, argumentosEstranhos, PERMITIDOS };
