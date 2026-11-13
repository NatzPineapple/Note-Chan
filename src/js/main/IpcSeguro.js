/* ──────────────────────────────  IpcSeguro.js  ──────────────────────────── */
// Registro de canais IPC com conferência de QUEM está chamando.
//
// O preload já limita os canais que uma tela consegue usar, mas a lista é a
// mesma para todas as telas: a janela do alarme conseguia ligar o início
// automático, e a janela de uma nota conseguia ler e sobrescrever outra.
// Aqui cada canal declara quais janelas podem usá-lo, e o processo principal
// confere a identidade de quem enviou antes de executar qualquer coisa:
//
//   1. a janela foi criada e registrada por nós (registrarJanela)
//   2. a mensagem veio do frame principal, não de um frame embutido
//   3. o frame está numa página do app (app://notechan/src/html/...) e essa
//      página é a que aquela janela deveria estar mostrando
//
// Pedido recusado: em "send" é descartado; em "invoke" a promise da tela é
// rejeitada. Os dois casos ficam no log como [SECURITY].

const { ipcMain } = require("electron");
const AppProtocol = require("./AppProtocol");
const { warn } = require("../Logger");

const PAGINA_DO_PAPEL = {
    widget: "widget.html",
    settings: "settings.html",
    note: "note.html",
    quickcapture: "quickcapture.html",
    quickevent: "quickevent.html",
    alarm: "alarm.html"
};

const TODAS = Object.keys(PAGINA_DO_PAPEL);

// webContents.id -> { papel, contexto }
const janelas = new Map();

/**
 * Chamar logo após criar cada BrowserWindow.
 * contexto: dados fixos da janela (ex.: { noteId } da janela de nota), que o
 * handler recebe de volta e pode usar para restringir o que a janela acessa.
 */
function registrarJanela(win, papel, contexto = {}) {
    if (!PAGINA_DO_PAPEL[papel]) throw new Error(`Papel de janela desconhecido: ${papel}`);
    const wc = win.webContents;
    const id = wc.id;
    janelas.set(id, { papel, contexto: Object.freeze({ ...contexto }) });
    wc.once("destroyed", () => janelas.delete(id));
}

// Precisa rodar de forma síncrona, antes de qualquer await: a partir do
// Electron 33, event.senderFrame vira null depois de um await.
function identificar(event) {
    const reg = janelas.get(event.sender.id);
    if (!reg) return { erro: "janela não registrada" };

    const frame = event.senderFrame;
    if (!frame) return { erro: "frame já descartado" };
    if (frame.parent) return { erro: "veio de um frame embutido" };
    if (!AppProtocol.ehDoApp(frame.url)) return { erro: `origem fora do app (${frame.url.slice(0, 80)})` };

    const pagina = new URL(frame.url).pathname.split("/").pop();
    if (pagina !== PAGINA_DO_PAPEL[reg.papel]) return { erro: `página ${pagina} não é a da janela ${reg.papel}` };

    return { papel: reg.papel, contexto: reg.contexto };
}

function autorizar(canal, papeis, event) {
    const quem = identificar(event);
    if (quem.erro) {
        warn("[SECURITY] IPC recusado:", canal, "—", quem.erro);
        return null;
    }
    if (!papeis.includes(quem.papel)) {
        warn("[SECURITY] IPC recusado:", canal, "— a janela", quem.papel, "não tem acesso a este canal");
        return null;
    }
    return quem;
}

function validarPapeis(canal, papeis) {
    if (!Array.isArray(papeis) || papeis.length === 0 || papeis.some(p => !PAGINA_DO_PAPEL[p])) {
        throw new Error(`IPC ${canal}: lista de janelas inválida`);
    }
}

/** ipcMain.on com checagem. handler(event, payload, quem) */
function ouvir(canal, papeis, handler) {
    validarPapeis(canal, papeis);
    ipcMain.on(canal, (event, payload) => {
        const quem = autorizar(canal, papeis, event);
        if (!quem) return;
        handler(event, payload, quem);
    });
}

/** ipcMain.handle com checagem. handler(event, payload, quem) */
function atender(canal, papeis, handler) {
    validarPapeis(canal, papeis);
    ipcMain.handle(canal, (event, payload) => {
        const quem = autorizar(canal, papeis, event);
        if (!quem) throw new Error(`Acesso negado ao canal ${canal}`);
        return handler(event, payload, quem);
    });
}

module.exports = { registrarJanela, ouvir, atender, TODAS, _identificar: identificar };
