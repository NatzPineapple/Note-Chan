/* ──────────────────────────────  Validacao.js  ───────────────────────────── */
// Confere o CONTEÚDO do que as telas mandam ao processo principal.
//
// IpcSeguro.js garante QUEM pode chamar cada canal; este módulo garante O QUE
// pode chegar. Tudo aqui é lista do que é permitido: chave desconhecida, tipo
// errado ou valor fora da faixa é descartado e registrado no log, e o resto
// do pedido segue normalmente (uma configuração inválida não derruba as
// válidas que vieram junto).

const { warn } = require("../Logger");

// Limites contra uma tela que tente encher o disco ou a memória.
const MAX_TEXTO = 1_000_000;          // caracteres de uma nota / captura
const MAX_PAYLOAD = 20 * 1024 * 1024; // save-data inteiro, serializado
const MAX_ITENS = 10_000;             // por lista (notas, eventos, ...)
const MAX_ID = 100;

const LISTAS = ["notes", "lists", "habits", "birthdays", "events", "tags"];

function ehObjeto(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

function inteiroEntre(min, max) {
    return v => Number.isInteger(v) && v >= min && v <= max;
}

const nomeSimples = v => typeof v === "string" && /^[a-z][a-z0-9-]{0,29}$/.test(v);

/* ═══════════════════════════════  ATALHOS  ═════════════════════════════ */

const MODIFICADORES = new Set([
    "Control", "Ctrl", "CommandOrControl", "CmdOrCtrl", "Command", "Cmd",
    "Alt", "Option", "AltGr", "Shift", "Super", "Meta"
]);
// Sem um destes, o atalho global "sequestraria" uma tecla de digitação comum
// no Windows inteiro (ex.: Shift+A deixaria de escrever "A" em qualquer app).
const MODIFICADORES_FORTES = new Set([
    "Control", "Ctrl", "CommandOrControl", "CmdOrCtrl", "Command", "Cmd",
    "Alt", "Option", "AltGr", "Super", "Meta"
]);

function analisarAtalho(v) {
    if (typeof v !== "string" || v.length === 0 || v.length > 60) return null;
    const partes = v.split("+");
    if (partes.length < 2) return null;
    const tecla = partes.pop();
    // tecla final: um caractere visível, ou nome de tecla (F5, Enter, Space, Up...)
    if (!/^(\S|[A-Za-z][A-Za-z0-9]{1,19})$/.test(tecla) || MODIFICADORES.has(tecla)) return null;
    if (partes.some(p => !MODIFICADORES.has(p))) return null;
    if (new Set(partes).size !== partes.length) return null;
    return partes;
}

/** Atalho global (vale no Windows inteiro). "" desliga o atalho. */
function atalhoGlobal(v) {
    if (v === "") return true;
    const mods = analisarAtalho(v);
    return !!mods && mods.some(m => MODIFICADORES_FORTES.has(m));
}

/** Atalho do editor (só vale dentro do app): basta um modificador. */
function atalhoLocal(v) {
    return v === "" || !!analisarAtalho(v);
}

/* ═════════════════════════════  CONFIGURAÇÕES  ═════════════════════════ */

const ESQUEMA_CONFIG = {
    theme: nomeSimples,
    transparency: inteiroEntre(20, 100),
    shortcuts: {
        toggleWidget: atalhoGlobal,
        quickCapture: atalhoGlobal,
        quickEvent: atalhoGlobal,
        newNoteWindow: atalhoGlobal
    },
    editor: {
        fontSize: inteiroEntre(8, 40),
        indentSize: inteiroEntre(1, 16)
    },
    editorShortcuts: {
        negrito: atalhoLocal,
        italico: atalhoLocal,
        sublinhado: atalhoLocal,
        lista: atalhoLocal,
        listaNumerada: atalhoLocal
    },
    alarm: {
        enabled: v => typeof v === "boolean",
        volume: inteiroEntre(0, 100),
        sound: nomeSimples
    }
};

function filtrarPorEsquema(entrada, esquema, caminho, recusados) {
    const saida = {};
    for (const [chave, valor] of Object.entries(entrada)) {
        const regra = Object.hasOwn(esquema, chave) ? esquema[chave] : undefined;
        const onde = caminho ? `${caminho}.${chave}` : chave;
        if (!regra) { recusados.push(`${onde} (desconhecida)`); continue; }

        if (typeof regra === "function") {
            if (regra(valor)) saida[chave] = valor;
            else recusados.push(`${onde}=${JSON.stringify(valor)?.slice(0, 60)}`);
            continue;
        }
        if (!ehObjeto(valor)) { recusados.push(`${onde} (não é objeto)`); continue; }
        const sub = filtrarPorEsquema(valor, regra, onde, recusados);
        if (Object.keys(sub).length) saida[chave] = sub;
    }
    return saida;
}

/** save-settings: devolve só os campos válidos, ou null se nada sobrar. */
function configuracoes(bruto) {
    if (!ehObjeto(bruto)) { warn("[SECURITY] save-settings recusado: não é objeto"); return null; }
    const recusados = [];
    const limpo = filtrarPorEsquema(bruto, ESQUEMA_CONFIG, "", recusados);
    if (recusados.length) warn("[SECURITY] save-settings: campos descartados:", recusados.join(", "));
    return Object.keys(limpo).length ? limpo : null;
}

/* ════════════════════════════════  DADOS  ══════════════════════════════ */

function listaValida(nome, lista) {
    if (!Array.isArray(lista)) return `${nome} não é lista`;
    if (lista.length > MAX_ITENS) return `${nome} tem ${lista.length} itens (máx. ${MAX_ITENS})`;
    const ids = new Set();
    for (const item of lista) {
        if (!ehObjeto(item)) return `${nome} tem item que não é objeto`;
        if (typeof item.id !== "string" || !item.id || item.id.length > MAX_ID) return `${nome} tem item com id inválido`;
        if (ids.has(item.id)) return `${nome} tem id repetido (${item.id.slice(0, 40)})`;
        ids.add(item.id);
    }
    return null;
}

/**
 * save-data: confere tamanho total e a estrutura de cada lista. Uma lista
 * inválida é descartada inteira (fica a versão que já estava salva) — gravar
 * metade dela deixaria referências quebradas entre itens.
 */
function payloadDeDados(bruto) {
    if (!ehObjeto(bruto)) { warn("[SECURITY] save-data recusado: não é objeto"); return null; }

    let tamanho;
    try { tamanho = JSON.stringify(bruto).length; } catch { tamanho = Infinity; }
    if (tamanho > MAX_PAYLOAD) {
        warn("[SECURITY] save-data recusado: tamanho", tamanho, "acima do limite", MAX_PAYLOAD);
        return null;
    }

    const limpo = {};
    for (const nome of LISTAS) {
        if (bruto[nome] === undefined) continue;
        const erro = listaValida(nome, bruto[nome]);
        if (erro) { warn("[SECURITY] save-data: lista descartada —", erro); continue; }
        limpo[nome] = bruto[nome];
    }
    if (ehObjeto(bruto.widget)) limpo.widget = bruto.widget;
    if (ehObjeto(bruto.tamagotchi)) limpo.tamagotchi = bruto.tamagotchi;
    return limpo;
}

/**
 * Mescla só as chaves que já existem em `atual` e com o mesmo tipo primitivo.
 * Impede a tela de criar campos novos ou trocar número por objeto.
 */
function camposConhecidos(atual, novo, rotulo) {
    const saida = {};
    const recusados = [];
    for (const [chave, valor] of Object.entries(novo)) {
        const conhecido = Object.hasOwn(atual, chave);
        const primitivo = valor === null || ["number", "string", "boolean"].includes(typeof valor);
        if (conhecido && primitivo && typeof valor === typeof atual[chave]) saida[chave] = valor;
        else recusados.push(chave);
    }
    if (recusados.length) warn(`[SECURITY] ${rotulo}: campos descartados:`, recusados.join(", ").slice(0, 200));
    return saida;
}

module.exports = {
    configuracoes, payloadDeDados, camposConhecidos,
    ehNomeSimples: nomeSimples, atalhoGlobal, atalhoLocal,
    MAX_TEXTO
};
