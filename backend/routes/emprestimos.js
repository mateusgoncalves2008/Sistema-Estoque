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


function converterDataPrazo(valor) {
    const dataTexto = texto(valor);
    if (!dataTexto) return null;

    const brasileira = dataTexto.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (brasileira) {
        const data = new Date(Number(brasileira[3]), Number(brasileira[2]) - 1, Number(brasileira[1]));
        return Number.isNaN(data.getTime()) ? null : data;
    }

    const iso = dataTexto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
        const data = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
        return Number.isNaN(data.getTime()) ? null : data;
    }

    return null;
}

async function atualizarEmprestimosAtrasados() {
    const resposta = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "09_EMPRESTIMOS!A:L",
    });
    const linhas = resposta.data.values || [];
    const agora = new Date();
    const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());

    for (let i = 1; i < linhas.length; i++) {
        const linha = linhas[i];
        const status = normalizar(linha[8]);
        if (texto(linha[7]) || ["DEVOLVIDO", "CONCLUIDO", "CANCELADO", "ENCERRADO"].includes(status)) continue;

        const prazo = converterDataPrazo(linha[6]);
        if (!prazo) continue;
        prazo.setHours(0, 0, 0, 0);

        if (prazo < hoje && !["ATRASO", "ATRASADO", "EM ATRASO"].includes(status)) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `09_EMPRESTIMOS!I${i + 1}`,
                valueInputOption: "USER_ENTERED",
                requestBody: { values: [["ATRASO"]] },
            });
        }
    }
}

async function buscarDadosEmprestimos(usuarioID, incluirTodos = false) {
    await atualizarEmprestimosAtrasados();
    const [empRes, prodRes, catRes, subRes] = await Promise.all([
        sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "09_EMPRESTIMOS!A:L",
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
        .filter((l) => {
            const pertenceAoUsuario = texto(l[2]) === texto(usuarioID);

            const status = normalizar(l[8]);

            return incluirTodos
                ? pertenceAoUsuario
                : pertenceAoUsuario && ["ABERTO", "ATRASADO"].includes(status);
        })
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
        const sessao = req.session?.usuario;
        if (!sessao?.id) {
            return res.status(401).json({
                sucesso: false,
                mensagem: "Faça login para consultar seus empréstimos.",
            });
        }

        const usuarioID = texto(req.params.usuarioID);
        const tipoEsperado = req.path.startsWith("/aluno/") ? "ALUNO" : "PROFESSOR";

        if (texto(sessao.id) !== usuarioID) {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Você só pode consultar seus próprios empréstimos.",
            });
        }

        if (normalizar(sessao.tipoUsuario) !== tipoEsperado) {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Seu perfil não tem acesso a esta consulta.",
            });
        }

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

async function responderHistoricoEmprestimos(req, res) {
    try {
        const sessao = req.session?.usuario;
        if (!sessao?.id) {
            return res.status(401).json({
                sucesso: false,
                mensagem: "Faça login para consultar o histórico.",
            });
        }

        const usuarioID = texto(req.params.usuarioID);
        const tipoEsperado = req.path.startsWith("/aluno/") ? "ALUNO" : "PROFESSOR";

        if (texto(sessao.id) !== usuarioID) {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Você só pode consultar seu próprio histórico.",
            });
        }

        if (normalizar(sessao.tipoUsuario) !== tipoEsperado) {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Seu perfil não tem acesso a este histórico.",
            });
        }

        if (!usuarioID) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "ID do usuário não informado.",
            });
        }

        const emprestimos = await buscarDadosEmprestimos(usuarioID, true);

        return res.json({
            sucesso: true,
            total: emprestimos.length,
            emprestimos,
        });
    } catch (erro) {
        console.error("Erro ao buscar histórico de empréstimos:", erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: "Erro ao consultar o histórico de empréstimos.",
        });
    }
}

router.get("/aluno/emprestimos/:usuarioID", responderEmprestimos);
router.get("/professor/emprestimos/:usuarioID", responderEmprestimos);

router.get(
    "/aluno/historico-emprestimos/:usuarioID",
    responderHistoricoEmprestimos,
);

router.get(
    "/professor/historico-emprestimos/:usuarioID",
    responderHistoricoEmprestimos,
);

router.get("/professor/historico/:usuarioID", responderHistoricoEmprestimos);

module.exports = router;
