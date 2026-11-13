/* ─────────────────────────────  AppProtocol.js  ─────────────────────────── */
// Serve as telas do app pelo protocolo próprio app://notechan/ em vez de file://.
//
// Por quê: uma página file:// enxerga o disco inteiro como "mesma origem" e
// qualquer .html solto no computador também é file://. Com um protocolo próprio,
// só o que este módulo entrega existe para as telas, e a origem das telas
// (app://notechan) não pode ser imitada por nenhum arquivo de fora.
//
// O layout das URLs espelha a raiz do app, então os caminhos relativos das
// telas (../js/x.js, ../../../assets/fonts/...) continuam valendo sem mudança.

const { protocol } = require("electron");
const path = require("path");
const fs = require("fs");
const { warn } = require("../Logger");

const SCHEME = "app";
const HOST = "notechan";
const ORIGIN = `${SCHEME}://${HOST}`;

// src/js/main -> raiz do app (dentro do app.asar quando empacotado)
const RAIZ = path.resolve(__dirname, "..", "..", "..");

// Só estas pastas são servidas. Tudo o mais (package.json, node_modules,
// código do processo principal) responde 404.
const PASTAS_PERMITIDAS = ["src/html/", "src/js/", "assets/fonts/"];

// Código que só roda no processo principal: as telas nunca precisam dele, e
// alguns guardam dado sensível (ex.: GoogleAuthConfig.js).
const PASTAS_NEGADAS = ["src/js/main/"];
const ARQUIVOS_NEGADOS = new Set([
    "src/js/Main.js",
    "src/js/preload.js",
    "src/js/DataManager.js",
    "src/js/Paths.js",
    "src/js/UpdateChecker.js"
]);

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".woff2": "font/woff2"
};

// Mesma política das <meta> das telas, mais as diretivas que só valem em
// cabeçalho (frame-ancestors) ou que fecham brechas de injeção de HTML.
const CSP = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'"
].join("; ");

/**
 * Precisa rodar ANTES do app ficar pronto (exigência do Electron).
 *  - standard: URLs relativas e origem própria funcionam como em http
 *  - secure:   conta como contexto seguro (crypto.randomUUID depende disso)
 *  - sem supportFetchAPI/corsEnabled: as telas não precisam de fetch, e a CSP
 *    já bloqueia connect-src.
 */
function registrarEsquema() {
    protocol.registerSchemesAsPrivileged([{
        scheme: SCHEME,
        privileges: { standard: true, secure: true, supportFetchAPI: false, corsEnabled: false, codeCache: true }
    }]);
}

// Comparação sempre em minúsculas: o disco do Windows não diferencia
// maiúsculas, então "src/js/MAIN.JS" abriria o mesmo arquivo que "Main.js".
const NEGADOS_MINUSC = new Set([...ARQUIVOS_NEGADOS].map(a => a.toLowerCase()));

function permitido(relativo) {
    const r = relativo.toLowerCase();
    if (!MIME[path.posix.extname(r)]) return false;
    if (NEGADOS_MINUSC.has(r)) return false;
    if (PASTAS_NEGADAS.some(p => r.startsWith(p.toLowerCase()))) return false;
    return PASTAS_PERMITIDAS.some(p => r.startsWith(p.toLowerCase()));
}

// Devolve o caminho no disco ou null. Defesa em camadas contra travessia de
// pasta: o parser de URL já normaliza "..", mas conferimos de novo depois de
// decodificar, porque %2e%2e e barras invertidas chegam aqui crus.
function resolverCaminho(urlTexto) {
    let url;
    try { url = new URL(urlTexto); } catch { return null; }
    if (url.protocol !== `${SCHEME}:` || url.host !== HOST) return null;

    let relativo;
    try { relativo = decodeURIComponent(url.pathname); } catch { return null; }
    if (relativo.includes("\0") || relativo.includes("\\")) return null;
    relativo = relativo.replace(/^\/+/, "");

    const absoluto = path.resolve(RAIZ, relativo);
    const deVolta = path.relative(RAIZ, absoluto);
    if (!deVolta || deVolta.startsWith("..") || path.isAbsolute(deVolta)) return null;

    const normalizado = deVolta.split(path.sep).join("/");
    return permitido(normalizado) ? { absoluto, normalizado } : null;
}

function negar(status, motivo, url) {
    warn("[SECURITY] app:// recusado:", motivo, url);
    return new Response(null, { status });
}

async function atender(request) {
    if (request.method !== "GET") return negar(405, "método", request.url);

    const alvo = resolverCaminho(request.url);
    if (!alvo) return negar(404, "fora da lista permitida", request.url);

    let corpo;
    try {
        corpo = await fs.promises.readFile(alvo.absoluto);
    } catch {
        return negar(404, "arquivo inexistente", request.url);
    }

    const headers = {
        "Content-Type": MIME[path.extname(alvo.absoluto).toLowerCase()],
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store"
    };
    if (alvo.normalizado.endsWith(".html")) headers["Content-Security-Policy"] = CSP;

    return new Response(corpo, { status: 200, headers });
}

/** Chamar depois de app.whenReady(). */
function instalar() {
    protocol.handle(SCHEME, atender);

    // O app não usa mais file:// nas telas. Recusar tudo fecha a porta para
    // qualquer página ou recurso local de fora do app ser carregado numa janela.
    protocol.handle("file", (request) => negar(403, "file:// desativado", request.url));
}

/** URL de uma tela: paginaDoApp("note.html", { id }) */
function paginaDoApp(arquivo, query) {
    const url = new URL(`${ORIGIN}/src/html/${arquivo}`);
    for (const [chave, valor] of Object.entries(query || {})) url.searchParams.set(chave, valor);
    return url.href;
}

/** true quando a URL é uma tela do próprio app (para conferir remetentes de IPC). */
function ehDoApp(urlTexto) {
    try {
        const url = new URL(urlTexto);
        return url.protocol === `${SCHEME}:` && url.host === HOST && url.pathname.startsWith("/src/html/");
    } catch {
        return false;
    }
}

module.exports = { registrarEsquema, instalar, paginaDoApp, ehDoApp, ORIGIN, _resolverCaminho: resolverCaminho };
