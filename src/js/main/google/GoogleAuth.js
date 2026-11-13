/* ─────────────────────────────  GoogleAuth.js  ─────────────────────────── */

const { shell, safeStorage } = require("electron");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const PATHS = require("../../Paths");
const { log, warn } = require("../../Logger");

let config = null;
try {
    config = require("./GoogleAuthConfig");
} catch {
}

const TOKEN_PATH = path.join(PATHS.userData, "google-auth.enc");

// Escopo mínimo: o app só lê e grava EVENTOS da agenda principal
// (/calendars/primary/events). O escopo "calendar" completo, usado antes,
// permitia também apagar agendas inteiras e mudar com quem elas são
// compartilhadas — poder que um token vazado não deve ter.
const ESCOPO_EVENTOS = "https://www.googleapis.com/auth/calendar.events";
const ESCOPO_AGENDA_COMPLETA = "https://www.googleapis.com/auth/calendar";
const ESCOPO_EMAIL = "https://www.googleapis.com/auth/userinfo.email";
const SCOPES = [ESCOPO_EVENTOS, ESCOPO_EMAIL].join(" ");
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

let refreshToken = null;
let accessToken = null;
let accessTokenExpiry = 0;
let userEmail = null;
// Escopos concedidos ao refresh token atual (texto, separados por espaço).
// Sessões salvas antes desta versão não têm o campo: foram obtidas com o
// escopo completo, então null conta como "amplo" até a próxima renovação dizer.
let escoposConcedidos = null;
// true quando o sistema não oferece criptografia: a sessão vale só até fechar.
let sessaoSoNaMemoria = false;

function base64url(buf) {
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function isConfigured() {
    return !!config;
}

function isConnected() {
    return !!refreshToken;
}

function getEmail() {
    return userEmail;
}

/** O token atual pode mais do que o app precisa (escopo de agenda completo). */
function temEscopoAmplo() {
    if (!refreshToken) return false;
    if (escoposConcedidos === null) return true;
    return escoposConcedidos.split(" ").includes(ESCOPO_AGENDA_COMPLETA);
}

function getSessaoSoNaMemoria() {
    return sessaoSoNaMemoria;
}

/* ═══════════════════════════  GUARDA DO TOKEN  ═══════════════════════════ */
// Regra: o refresh token NUNCA vai para o disco sem criptografia do sistema
// (safeStorage → DPAPI no Windows). Se a criptografia não estiver disponível,
// a sessão fica só na memória e acaba quando o app fecha — reconectar é um
// incômodo; um token legível no disco é acesso à agenda para quem copiar o
// arquivo.
//
// Formatos do arquivo:
//   "v10..."  cifrado pelo safeStorage (prefixo de versão do cofre do Chromium)
//   "{..."    JSON puro, gravado por versões antigas quando não havia
//             criptografia — é migrado (cifrado) ou apagado ao ser lido.

const PRIMEIRO_BYTE_JSON = 0x7b; // "{"

async function apagarArquivoDoToken() {
    try { await fs.promises.rm(TOKEN_PATH, { force: true }); }
    catch (e) { warn("[GOOGLE] Falha ao remover token salvo:", e.message); }
}

function aplicarSessao(parsed) {
    refreshToken = typeof parsed.refreshToken === "string" && parsed.refreshToken ? parsed.refreshToken : null;
    userEmail = typeof parsed.email === "string" ? parsed.email : null;
    escoposConcedidos = typeof parsed.scope === "string" ? parsed.scope : null;
}

// safeStorage: API assíncrona (a síncrona ficou obsoleta no Electron 45 e sai
// no 46). Lê o mesmo formato gravado pela síncrona, então sessões já salvas
// continuam valendo.
async function loadStoredToken() {
    try {
        if (!fs.existsSync(TOKEN_PATH)) return;
        const raw = await fs.promises.readFile(TOKEN_PATH);
        const cifrado = await safeStorage.isAsyncEncryptionAvailable();

        if (raw[0] === PRIMEIRO_BYTE_JSON) {
            // Formato antigo, sem criptografia: aproveita a sessão, mas não
            // deixa o arquivo legível no disco nem mais um instante.
            aplicarSessao(JSON.parse(raw.toString("utf8")));
            warn("[SECURITY] [GOOGLE] Sessão salva SEM criptografia encontrada — migrando.");
            if (cifrado) {
                await persistToken(); // sobrescreve com a versão cifrada
            } else {
                sessaoSoNaMemoria = true;
                await apagarArquivoDoToken();
                warn("[GOOGLE] Criptografia do sistema indisponível: arquivo apagado, sessão vale só até fechar o app.");
            }
        } else {
            if (!cifrado) {
                warn("[GOOGLE] Criptografia do sistema indisponível: a sessão salva não pode ser lida agora.");
                return;
            }
            const r = await safeStorage.decryptStringAsync(raw);
            aplicarSessao(JSON.parse(r.result));
            if (r.shouldReEncrypt && refreshToken) {
                log("[GOOGLE] Chave de criptografia do sistema mudou — regravando a sessão.");
                await persistToken();
            }
        }

        if (refreshToken) log("[GOOGLE] Sessão restaurada:", userEmail || "(sem e-mail salvo)");
        if (temEscopoAmplo()) warn("[GOOGLE] A sessão salva tem permissão de agenda completa; reconectar reduz para só eventos.");
    } catch (e) {
        warn("[GOOGLE] Falha ao carregar sessão salva:", e.message);
    }
}

async function persistToken() {
    try {
        if (!(await safeStorage.isAsyncEncryptionAvailable())) {
            sessaoSoNaMemoria = true;
            await apagarArquivoDoToken();
            warn("[GOOGLE] Criptografia do sistema indisponível: sessão NÃO foi salva no disco e vale só até fechar o app.");
            return;
        }
        sessaoSoNaMemoria = false;
        const payload = JSON.stringify({ refreshToken, email: userEmail, scope: escoposConcedidos });
        const cifrado = await safeStorage.encryptStringAsync(payload);

        // Grava num temporário e troca de nome: uma queda no meio da gravação
        // não deixa o arquivo pela metade (e a sessão perdida).
        const tmp = `${TOKEN_PATH}.tmp`;
        await fs.promises.writeFile(tmp, cifrado);
        await fs.promises.rename(tmp, TOKEN_PATH);
    } catch (e) {
        warn("[GOOGLE] Falha ao salvar sessão:", e.message);
    }
}

function clearToken() {
    refreshToken = null;
    accessToken = null;
    accessTokenExpiry = 0;
    userEmail = null;
    escoposConcedidos = null;
    sessaoSoNaMemoria = false;
    try { fs.rmSync(TOKEN_PATH, { force: true }); } catch (e) { warn("[GOOGLE] Falha ao remover token salvo:", e.message); }
}

function callbackPageHtml(error) {
    const msg = error
        ? "Algo deu errado na autorização. Pode fechar esta aba e tentar de novo no Note-Chan."
        : "Pronto! Pode fechar esta aba e voltar pro Note-Chan.";
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Note-Chan</title>
<style>body{font-family:'Segoe UI',sans-serif;background:#1e1e1e;color:#ffd700;display:flex;
align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px;
font-size:1.1em}</style></head><body><div>${msg}</div></body></html>`;
}

async function exchangeCode(code, codeVerifier, redirectUri) {
    const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: config.CLIENT_ID,
            client_secret: config.CLIENT_SECRET,
            code,
            code_verifier: codeVerifier,
            redirect_uri: redirectUri,
            grant_type: "authorization_code"
        })
    });
    if (!res.ok) throw new Error(`Falha ao trocar código por token (${res.status}): ${await res.text()}`);
    return res.json();
}

async function fetchUserEmail(token) {
    try {
        const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return null;
        const info = await res.json();
        return info.email || null;
    } catch {
        return null;
    }
}

function startOAuthFlow() {
    return new Promise((resolve, reject) => {
        if (!config) { reject(new Error("Google não configurado (GoogleAuthConfig.js ausente).")); return; }

        const codeVerifier = base64url(crypto.randomBytes(32));
        const codeChallenge = base64url(crypto.createHash("sha256").update(codeVerifier).digest());
        const state = base64url(crypto.randomBytes(16));

        let settled = false;
        let redirectUri = null;
        const timeoutHandle = setTimeout(() => {
            if (settled) return;
            settled = true;
            try { server.close(); } catch (e) { /* já fechado */ }
            reject(new Error("Tempo esgotado esperando a autorização no navegador."));
        }, OAUTH_TIMEOUT_MS);

        const server = http.createServer((req, res) => {
            (async () => {
                const url = new URL(req.url, "http://127.0.0.1");
                if (url.pathname !== "/") { res.writeHead(404); res.end(); return; }

                const returnedState = url.searchParams.get("state");
                const code = url.searchParams.get("code");
                const error = url.searchParams.get("error");

                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(callbackPageHtml(error));
                server.close();

                if (settled) return;

                if (error) { settled = true; clearTimeout(timeoutHandle); reject(new Error(`Google negou a autorização: ${error}`)); return; }
                if (returnedState !== state || !code) { settled = true; clearTimeout(timeoutHandle); reject(new Error("Resposta OAuth inválida (state não confere).")); return; }

                try {
                    const tokens = await exchangeCode(code, codeVerifier, redirectUri);
                    const granted = (tokens.scope || "").split(" ");
                    // Aceita o escopo completo também: uma conta que já o tinha
                    // concedido antes pode recebê-lo de volta. Fica registrado,
                    // e a tela oferece reconectar.
                    if (!granted.includes(ESCOPO_EVENTOS) && !granted.includes(ESCOPO_AGENDA_COMPLETA)) {
                        revokeQuietly(tokens.refresh_token || tokens.access_token);
                        throw new Error("A permissão da agenda não foi concedida. Conecte de novo e marque a opção do Google Agenda na tela do Google.");
                    }
                    // Sem refresh token novo, a sessão ficaria presa ao antigo
                    // (que pode ter outro escopo). Com prompt=consent ele sempre vem.
                    if (!tokens.refresh_token) {
                        revokeQuietly(tokens.access_token);
                        throw new Error("O Google não devolveu um token de sessão. Tente conectar de novo.");
                    }
                    refreshToken = tokens.refresh_token;
                    escoposConcedidos = granted.join(" ");
                    accessToken = tokens.access_token;
                    accessTokenExpiry = Date.now() + tokens.expires_in * 1000;
                    userEmail = await fetchUserEmail(accessToken);
                    await persistToken();
                    settled = true;
                    clearTimeout(timeoutHandle);
                    log("[GOOGLE] Conectado:", userEmail || "(e-mail não obtido)");
                    resolve({ email: userEmail });
                } catch (e) {
                    settled = true;
                    clearTimeout(timeoutHandle);
                    reject(e);
                }
            })();
        });

        server.on("error", (e) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeoutHandle);
            reject(e);
        });

        server.listen(0, "127.0.0.1", () => {
            redirectUri = `http://127.0.0.1:${server.address().port}`;
            const params = new URLSearchParams({
                client_id: config.CLIENT_ID,
                redirect_uri: redirectUri,
                response_type: "code",
                scope: SCOPES,
                access_type: "offline",
                prompt: "consent",
                code_challenge: codeChallenge,
                code_challenge_method: "S256",
                state
            });
            shell.openExternal(`${AUTH_URL}?${params.toString()}`);
        });
    });
}

async function refreshAccessToken() {
    if (!refreshToken) throw new Error("Não conectado ao Google.");
    const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: config.CLIENT_ID,
            client_secret: config.CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: "refresh_token"
        })
    });
    if (!res.ok) {
        const text = await res.text();
        if (res.status === 400 || res.status === 401) {
            warn("[GOOGLE] Token de renovação inválido, desconectando:", text);
            clearToken();
        }
        throw new Error(`Falha ao renovar token (${res.status}): ${text}`);
    }
    const tokens = await res.json();
    accessToken = tokens.access_token;
    accessTokenExpiry = Date.now() + tokens.expires_in * 1000;

    // A renovação informa os escopos do token: corrige o que estava salvo
    // (sessões antigas não tinham esse dado).
    if (typeof tokens.scope === "string" && tokens.scope && tokens.scope !== escoposConcedidos) {
        escoposConcedidos = tokens.scope;
        await persistToken();
    }
    return accessToken;
}

async function getValidAccessToken() {
    if (!refreshToken) throw new Error("Não conectado ao Google.");
    if (accessToken && Date.now() < accessTokenExpiry - 60000) return accessToken;
    return refreshAccessToken();
}

async function revokeQuietly(token) {
    if (!token) return;
    try {
        // Token no corpo, não na URL: URLs costumam parar em logs de proxy e
        // de ferramentas de rede.
        await fetch(REVOKE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token })
        });
    } catch (e) {
        warn("[GOOGLE] Falha ao revogar token no Google (ignorado):", e.message);
    }
}

async function disconnect() {
    const tokenToRevoke = refreshToken || accessToken;
    clearToken();
    await revokeQuietly(tokenToRevoke);
    log("[GOOGLE] Desconectado.");
}

module.exports = {
    isConfigured, isConnected, getEmail, startOAuthFlow, disconnect, getValidAccessToken,
    loadStoredToken, temEscopoAmplo, getSessaoSoNaMemoria
};
