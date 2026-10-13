
const express = require("express");
const router = express.Router();
const sheets = require("../database/googleSheets");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

function texto(valor) {
    return String(valor ?? "").trim();
}

function normalizar(valor) {
    return texto(valor)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
}

async function buscarDadosHistorico(usuarioID) {
    const [empRes, prodRes, catRes, subRes] = await Promise.all([
        sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "09_EMPRESTIMOS!A:K",
        }),
        sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "02_PRODUTOS!A:K",
        }),
        sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "03_CATEGORIAS!A:D",
        }),
        sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "04_SUBCATEGORIAS!A:E",
        }),
    ]);

    const produtos = new Map();
    const categorias = new Map();
    const subcategorias = new Map();

    for (const l of (catRes.data.values || []).slice(1)) {
        if (l[0]) categorias.set(texto(l[0]), texto(l[1]));
    }

    for (const l of (subRes.data.values || []).slice(1)) {
        if (l[0]) {
            subcategorias.set(texto(l[0]), {
                categoriaID: texto(l[1]),
                nome: texto(l[2]),
            });
        }
    }

    for (const l of (prodRes.data.values || []).slice(1)) {
        if (!l[0]) continue;

        const categoriaID = texto(l[4]);
        const sub = subcategorias.get(texto(l[5]));

        produtos.set(texto(l[0]), {
            id: texto(l[0]),
            nome: texto(l[2]) || texto(l[1]) || texto(l[0]),
            categoria: categorias.get(categoriaID) || "",
            subcategoria: sub?.nome || "",
        });
    }

    const movimentos = (empRes.data.values || [])
        .slice(1)
        .filter((l) =>
            texto(l[2]) === usuarioID &&
            ["ABERTO", "ATRASADO", "DEVOLVIDO"].includes(normalizar(l[8]))
        )
        .map((l) => {
            const produtoID = texto(l[3]);
            const produto = produtos.get(produtoID) || {
                nome: produtoID || "Item não identificado",
                categoria: "",
                subcategoria: "",
            };

            const classificacao = normalizar(
                `${produto.categoria} ${produto.subcategoria} ${produto.nome}`
            );

            let tipo = "Outros";

            if (
                classificacao.includes("BIBLIOTECA") ||
                classificacao.includes("LIVRO")
            ) {
                tipo = "Livro";
            } else if (
                classificacao.includes("INFORMATICA") &&
                (
                    classificacao.includes("DESKTOP") ||
                    classificacao.includes("NOTEBOOK") ||
                    classificacao.includes("COMPUTADOR") ||
                    classificacao.includes("PC")
                )
            ) {
                tipo = "Computador";
            } else if (
                classificacao.includes("EQUIPAMENTO") ||
                classificacao.includes("PROJETOR") ||
                classificacao.includes("CAIXA DE SOM")
            ) {
                tipo = "Equipamento";
            } else if (
                classificacao.includes("MATERIAL") ||
                classificacao.includes("TESOURA") ||
                classificacao.includes("COLA")
            ) {
                tipo = "Material";
            }

            return {
                id: texto(l[0]),
                item: produto.nome,
                produtoID,
                tipo,
                data: texto(l[1]),
                quantidade: texto(l[5]),
                devolucaoPrevista: texto(l[6]),
                dataDevolucao: texto(l[7]),
                status: normalizar(l[8]),
                observacao: texto(l[10]),
            };
        });

    return movimentos.reverse();
}

// Empréstimos ativos e atrasados
router.get("/professor/emprestimos/:usuarioID", async (req, res) => {
    try {
        const usuarioID = texto(req.params.usuarioID);

        if (!usuarioID) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "ID do usuário não informado.",
            });
        }

        const todos = await buscarDadosHistorico(usuarioID);
        const emprestimos = todos.filter((m) =>
            ["ABERTO", "ATRASADO"].includes(m.status)
        );

        return res.json({ sucesso: true, emprestimos });
    } catch (erro) {
        console.error("Erro ao buscar empréstimos:", erro);
        return res.status(500).json({
            sucesso: false,
            mensagem: "Erro ao consultar os empréstimos.",
        });
    }
});

// Histórico completo de empréstimos
router.get("/professor/historico/:usuarioID", async (req, res) => {
    try {
        const usuarioID = texto(req.params.usuarioID);

        if (!usuarioID) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "ID do usuário não informado.",
            });
        }

        const movimentos = await buscarDadosHistorico(usuarioID);

        return res.json({
            sucesso: true,
            movimentos,
        });
    } catch (erro) {
        console.error("Erro ao buscar histórico:", erro);
        return res.status(500).json({
            sucesso: false,
            mensagem: "Erro ao consultar o histórico.",
        });
    }
});

module.exports = router;