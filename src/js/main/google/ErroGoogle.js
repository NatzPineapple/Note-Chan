/* ─────────────────────────────  ErroGoogle.js  ──────────────────────────── */
// Resume uma resposta de erro do Google para log e mensagem de erro.
//
// O corpo de um erro da API pode repetir trechos do pedido (título, descrição
// do evento, e-mail de convidados). O que importa para investigar é o status
// HTTP e o CÓDIGO do erro — "403 PERMISSION_DENIED/insufficientPermissions",
// "400 invalid_grant" —, então só isso sai daqui. Ver política em Logger.js.

async function resumoErroGoogle(res) {
    let codigo = "";
    try {
        const corpo = await res.json();
        const e = corpo && corpo.error;
        if (typeof e === "string") {
            codigo = e;                                   // OAuth: { error: "invalid_grant" }
        } else if (e && typeof e === "object") {
            const motivo = Array.isArray(e.errors) && e.errors[0] && e.errors[0].reason;
            codigo = [e.status, motivo].filter(Boolean).join("/"); // API: { error: { status, errors[] } }
        }
    } catch { /* corpo não é JSON: fica só o status */ }

    // Só caracteres de código (letras, números, _ / . -), no máximo 80.
    codigo = String(codigo).replace(/[^\w/.-]/g, "").slice(0, 80);
    return codigo ? `${res.status} ${codigo}` : String(res.status);
}

module.exports = { resumoErroGoogle };
