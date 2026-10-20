const express = require("express");
const sheets = require("../database/googleSheets");

const router = express.Router();
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

function ehAdmin(usuario) {
    const tipo = String(usuario?.tipoUsuario || "").trim().toUpperCase();
    const perfil = String(usuario?.perfil || "").trim().toUpperCase();
    const permitidos = ["ADM", "ADMIN", "ADMINISTRADOR"];
    return permitidos.includes(tipo) || permitidos.includes(perfil);
}

function linhasDeDados(valores) {
    return (Array.isArray(valores) ? valores : []).slice(1).filter((linha) =>
        Array.isArray(linha) && String(linha[0] || "").trim() !== ""
    );
}

function contarPorTipo(usuarios) {
    const contagem = { alunos: 0, professores: 0, responsaveis: 0, secretaria: 0, administradores: 0, outros: 0 };

    for (const usuario of usuarios) {
        const tipo = String(usuario[5] || "").trim().toUpperCase();
        const perfil = String(usuario[6] || "").trim().toUpperCase();
        if (tipo === "ALUNO" || perfil === "ALUNO") contagem.alunos++;
        else if (tipo === "PROFESSOR" || perfil === "PROFESSOR") contagem.professores++;
        else if (["RESPONSAVEL", "RESPONSÁVEL", "LIDER"].includes(tipo) || ["RESPONSAVEL", "RESPONSÁVEL", "LIDER"].includes(perfil)) contagem.responsaveis++;
        else if (["SECRETARIA", "FUNCIONARIO", "FUNCIONÁRIO"].includes(tipo) || ["SECRETARIA", "FUNCIONARIO", "FUNCIONÁRIO"].includes(perfil)) contagem.secretaria++;
        else if (["ADM", "ADMIN", "ADMINISTRADOR"].includes(tipo) || ["ADM", "ADMIN", "ADMINISTRADOR"].includes(perfil)) contagem.administradores++;
        else contagem.outros++;
    }
    return contagem;
}

router.get("/admin/dashboard", async (req, res) => {
    const usuarioSessao = req.session?.usuario;

    if (!usuarioSessao) {
        return res.status(401).json({ sucesso: false, mensagem: "Faça login para acessar o Painel ADM." });
    }
    if (!ehAdmin(usuarioSessao)) {
        return res.status(403).json({ sucesso: false, mensagem: "Acesso permitido somente ao ADM." });
    }
    if (!SPREADSHEET_ID) {
        return res.status(500).json({ sucesso: false, mensagem: "A planilha não está configurada no servidor." });
    }

    const ranges = [
        "01_USUARIOS!A:K",
        "02_PRODUTOS!A:K",
        "05_LOCAIS!A:G",
        "06_ESTOQUE_LOCAIS!A:I",
        "07_MOVIMENTACOES!A:L",
        "08_RESERVAS!A:L",
        "09_EMPRESTIMOS!A:L",
        "10_DEVOLUCOES!A:K",
        "12_SETORES!A:F",
        "13_LOGS!A:H",
        "24_AVISOS_SISTEMA!A:H",
    ];

    try {
        const resposta = await sheets.spreadsheets.values.batchGet({
            spreadsheetId: SPREADSHEET_ID,
            ranges,
        });
        const valueRanges = resposta.data.valueRanges || [];
        const dados = {};
        ranges.forEach((range, indice) => {
            dados[range.split("!")[0]] = valueRanges[indice]?.values || [];
        });

        const usuarios = linhasDeDados(dados["01_USUARIOS"]);
        const usuariosAtivos = usuarios.filter((linha) => String(linha[8] || "").trim().toUpperCase() === "ATIVO");
        const produtos = linhasDeDados(dados["02_PRODUTOS"]);
        const locais = linhasDeDados(dados["05_LOCAIS"]);
        const estoque = linhasDeDados(dados["06_ESTOQUE_LOCAIS"]);
        const movimentacoes = linhasDeDados(dados["07_MOVIMENTACOES"]);
        const reservas = linhasDeDados(dados["08_RESERVAS"]);
        const emprestimos = linhasDeDados(dados["09_EMPRESTIMOS"]);
        const devolucoes = linhasDeDados(dados["10_DEVOLUCOES"]);
        const setores = linhasDeDados(dados["12_SETORES"]);
        const logs = linhasDeDados(dados["13_LOGS"]);
        const avisos = linhasDeDados(dados["24_AVISOS_SISTEMA"]);

        const estoqueNumerico = estoque.reduce((total, linha) => {
            const quantidade = Number(String(linha[3] || "0").replace(",", "."));
            return total + (Number.isFinite(quantidade) ? quantidade : 0);
        }, 0);
        const quantidadeDisponivel = estoque.reduce((total, linha) => {
            const quantidade = Number(String(linha[5] || "0").replace(",", "."));
            return total + (Number.isFinite(quantidade) ? quantidade : 0);
        }, 0);

        const usuariosSeguros = usuarios.map((linha) => ({
            usuarioID: String(linha[0] || ""),
            nome: String(linha[1] || ""),
            email: String(linha[2] || ""),
            tipoUsuario: String(linha[5] || ""),
            perfil: String(linha[6] || ""),
            setorID: String(linha[7] || ""),
            status: String(linha[8] || ""),
            dataCadastro: String(linha[9] || ""),
            ultimoLogin: String(linha[10] || ""),
        })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

        const cabecalhosLogs = Array.isArray(dados["13_LOGS"][0]) ? dados["13_LOGS"][0] : [];
        const atividadesRecentes = logs.slice(-8).reverse().map((linha) => {
            const registro = {};
            cabecalhosLogs.forEach((cabecalho, indice) => {
                const chave = String(cabecalho || `coluna${indice + 1}`).trim();
                registro[chave] = String(linha[indice] || "");
            });
            return registro;
        });

        return res.json({
            sucesso: true,
            atualizadoEm: new Date().toISOString(),
            administrador: { nome: String(usuarioSessao.nome || ""), perfil: String(usuarioSessao.perfil || "") },
            resumo: {
                totalUsuarios: usuarios.length,
                usuariosAtivos: usuariosAtivos.length,
                usuariosPorTipo: contarPorTipo(usuarios),
                produtosCadastrados: produtos.length,
                locaisCadastrados: locais.length,
                registrosDeEstoque: estoque.length,
                quantidadeTotalEstoque: estoqueNumerico,
                quantidadeDisponivel,
                movimentacoes: movimentacoes.length,
                reservas: reservas.length,
                emprestimos: emprestimos.length,
                devolucoes: devolucoes.length,
                setores: setores.length,
                registrosDeAuditoria: logs.length,
                avisosPublicados: avisos.slice(1).filter((linha) => String(linha[7] || "").trim().toUpperCase() === "PUBLICADO").length,
            },
            usuarios: usuariosSeguros,
            atividadesRecentes,
        });
    } catch (erro) {
        console.error("Erro ao carregar resumo do Painel ADM:", erro.message);
        return res.status(500).json({ sucesso: false, mensagem: "Não foi possível carregar os dados administrativos da planilha." });
    }
});

module.exports = router;
