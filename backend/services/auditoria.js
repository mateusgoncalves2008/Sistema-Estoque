const sheets = require("../database/googleSheets");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

function dataHoraAtual() {
    return new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour12: false,
    });
}

function texto(valor) {
    return String(valor ?? "").trim();
}

function proximoLogID(linhas) {
    let maior = 0;

    for (const linha of (linhas || []).slice(1)) {
        const correspondencia = texto(linha[0]).match(/^LOG-(\d+)$/i);
        if (correspondencia) maior = Math.max(maior, Number(correspondencia[1]));
    }

    return "LOG-" + String(maior + 1).padStart(5, "0");
}

/**
 * Grava uma linha na 13_LOGS usando a estrutura oficial A:H.
 * A falha do registro de auditoria nunca deve cancelar a operação principal.
 */
async function registrarAuditoria({
    usuarioID = "",
    acao = "ACAO_NAO_IDENTIFICADA",
    tabela = "",
    registroID = "",
    descricao = "",
    resultado = "SUCESSO",
} = {}) {
    if (!SPREADSHEET_ID) return false;

    try {
        const resposta = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "13_LOGS!A:H",
        });

        const linhas = resposta.data.values || [];
        const logID = proximoLogID(linhas);

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "13_LOGS!A:H",
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            requestBody: {
                values: [[
                    logID,
                    dataHoraAtual(),
                    texto(usuarioID),
                    texto(acao).toUpperCase(),
                    texto(tabela),
                    texto(registroID),
                    texto(descricao).slice(0, 1000),
                    texto(resultado).toUpperCase() || "SUCESSO",
                ]],
            },
        });

        return true;
    } catch (erro) {
        // Auditoria é complementar: não pode quebrar login, cadastro ou operação.
        console.error("Não foi possível registrar a auditoria:", erro.message);
        return false;
    }
}

module.exports = { registrarAuditoria };
