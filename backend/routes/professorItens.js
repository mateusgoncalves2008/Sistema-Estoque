const express = require("express");
const router = express.Router();

const { buscarCatalogo } = require("../services/catalogoItens");

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

module.exports = router;
