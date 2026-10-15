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

async function buscarDadosEmprestimos(usuarioID) {
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

    const categorias = new Map();
    const subcategorias = new Map();
    const produtos = new Map();

    for (const l of (catRes.data.values || []).slice(1)) {
        if (l[0]) categorias.set(texto(l[0]), texto(l[1]));
    }

    for (const l of (subRes.data.values || []).slice(1)) {
        if (l[0]) {
            subcategorias.set(texto(l[0]), {
                nome: texto(l[2]),
            });
        }
    }

    for (const l of (prodRes.data.values || []).slice(1)) {
        if (!l[0]) continue;

        const categoriaID = texto(l[4]);
        const subcategoriaID = texto(l[5]);
        const categoria = categorias.get(categoriaID) || "";
        const subcategoria = subcategorias.get(subcategoriaID)?.nome || "";

        produtos.set(texto(l[0]), {
            nome: texto(l[2]) || texto(l[1]) || texto(l[0]),
            categoria,
            subcategoria,
        });
    }

    return (empRes.data.values || [])
        .slice(1)
        .filter(
            (l) =>
                texto(l[2]) === texto(usuarioID) &&
                ["ABERTO", "ATRASADO"].includes(normalizar(l[8])),
        )
        .map((l) => {
            const produtoID = texto(l[3]);
            const produto = produtos.get(produtoID) || {
                nome: produtoID || "Item não identificado",
                categoria: "",
                subcategoria: "",
            };

            const classificacao = normalizar(
                `${produto.categoria} ${produto.subcategoria} ${produto.nome}`,
            );

            let tipo = "Outros";

            if (
                classificacao.includes("BIBLIOTECA") ||
                classificacao.includes("LIVRO")
            ) {
                tipo = "Livro";
            } else if (
                classificacao.includes("INFORMATICA") &&
                /DESKTOP|NOTEBOOK|COMPUTADOR|PC/.test(classificacao)
            ) {
                tipo = "Computador";
            } else if (
                /EQUIPAMENTO|PROJETOR|CAIXA DE SOM/.test(classificacao)
            ) {
                tipo = "Equipamento";
            } else if (/MATERIAL|TESOURA|COLA/.test(classificacao)) {
                tipo = "Material";
            }

            return {
                id: texto(l[0]),
                produtoID,
                item: produto.nome,
                tipo,
                retirada: texto(l[1]),
                devolucao: texto(l[6]),
                quantidade: texto(l[5]),
                status: normalizar(l[8]),
                observacao: texto(l[10]),
            };
        })
        .reverse();
}

// Rotas compartilhadas: aluno e professor.
async function responderEmprestimos(req, res) {
    try {
        const usuarioID = texto(req.params.usuarioID);

        if (!usuarioID) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "ID do usuário não informado.",
            });
        }

        const emprestimos = await buscarDadosEmprestimos(usuarioID);

        return res.json({
            sucesso: true,
            total: emprestimos.length,
            emprestimos,
        });
    } catch (erro) {
        console.error("Erro ao buscar empréstimos:", erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: "Erro ao consultar os empréstimos.",
        });
    }
}

router.get("/aluno/emprestimos/:usuarioID", responderEmprestimos);
router.get("/professor/emprestimos/:usuarioID", responderEmprestimos);

module.exports = router;
