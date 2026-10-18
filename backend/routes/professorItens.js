const express = require("express");
const router = express.Router();

const { buscarCatalogo } = require("../services/catalogoItens");
const sheets = require("../database/googleSheets");
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ============================================================
// GET /api/professor/itens
//
// Retorna todos os itens ativos de todas as categorias,
// incluindo as salas (categoria Laboratório) reserváveis.
// ============================================================

router.get("/professor/itens", async (req, res) => {
    try {
        const { itens, grupos } = await buscarCatalogo();

        return res.json({
            sucesso: true,
            total: itens.length,
            grupos,
            itens,
        });
    } catch (erro) {
        console.error("Erro ao buscar itens do professor:", erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: "Erro ao buscar os itens da planilha.",
        });
    }
});

router.get("/professor/calendario", async (req, res) => {
    try {
        const resposta = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "18_CALENDARIO_ESCOLAR!A2:G",
        });

        const linhas = resposta.data.values || [];

        const eventos = linhas
            .filter(
                (linha) =>
                    String(linha[6] || "")
                        .trim()
                        .toUpperCase() === "ATIVO",
            )
            .map((linha) => ({
                eventoID: linha[0] || "",
                data: linha[1] || "",
                dataFim: linha[2] || linha[1] || "",
                tipo: String(linha[3] || "")
                    .trim()
                    .toUpperCase(),
                titulo: linha[4] || "Evento escolar",
                descricao: linha[5] || "",
                status: linha[6] || "",
            }));

        return res.json({
            sucesso: true,
            total: eventos.length,
            eventos,
        });
    } catch (erro) {
        console.error("Erro ao carregar calendário escolar:", erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: "Não foi possível carregar o calendário escolar.",
        });
    }
});

module.exports = router;
