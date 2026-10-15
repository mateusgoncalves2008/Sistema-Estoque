const express = require("express");
const router = express.Router();
const sheets = require("../database/googleSheets");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const cacheAbas = new Map();
const TEMPO_CACHE = 30 * 1000;

function normalizar(valor) {
    return String(valor ?? "")
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

async function lerAba(intervalo) {
    const resposta = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: intervalo,
    });
    return resposta.data.values || [];
}

async function carregarVinculo(usuarioSessao) {
    const [usuarios, setores, locais] = await Promise.all([
        lerAba("01_USUARIOS!A:K"),
        lerAba("12_SETORES!A:E"),
        lerAba("05_LOCAIS!A:G"),
    ]);

    const usuario = usuarios
        .slice(1)
        .find(
            (linha) =>
                String(linha[0] || "").trim() ===
                String(usuarioSessao.id || "").trim(),
        );

    if (!usuario || normalizar(usuario[8]) !== "ATIVO") {
        const erro = new Error("A conta não está ativa.");
        erro.status = 403;
        throw erro;
    }

    const setor = setores
        .slice(1)
        .find(
            (linha) =>
                String(linha[0] || "").trim() ===
                    String(usuario[7] || "").trim() &&
                String(linha[0] || "").trim() ===
                    String(usuarioSessao.setorID || "").trim() &&
                String(linha[2] || "").trim() ===
                    String(usuario[0] || "").trim() &&
                normalizar(linha[4]) === "ATIVO",
        );

    if (!setor) {
        const erro = new Error(
            "Não foi encontrado um setor ativo vinculado a esta conta.",
        );
        erro.status = 403;
        throw erro;
    }

    const local = locais
        .slice(1)
        .find(
            (linha) =>
                String(linha[4] || "").trim() ===
                    String(usuario[0] || "").trim() &&
                normalizar(linha[2]) === normalizar(setor[1]),
        );

    if (!local) {
        const erro = new Error(
            "Não foi encontrado um local vinculado ao responsável deste setor.",
        );
        erro.status = 403;
        throw erro;
    }

    return {
        usuario: {
            id: usuario[0],
            nome: usuario[1] || "",
            email: usuario[2] || "",
            tipoUsuario: usuario[5] || "",
            perfil: usuario[6] || "",
        },
        setor: {
            id: setor[0],
            nome: setor[1] || "",
            status: setor[4] || "",
        },
        local: {
            id: local[0],
            nome: local[2] || "",
            status: local[6] || "",
        },
    };
}

async function carregarDashboard(vinculo) {
    const [estoques, produtos, categorias, movimentacoes, reservas, usuarios] =
        await Promise.all([
            lerAba("06_ESTOQUE_LOCAIS!A:H"),
            lerAba("02_PRODUTOS!A:K"),
            lerAba("03_CATEGORIAS!A:D"),
            lerAba("07_MOVIMENTACOES!A:L"),
            lerAba("08_RESERVAS!A:L"),
            lerAba("01_USUARIOS!A:K"),
        ]);

    const localID = String(vinculo.local.id);
    const mapaProdutos = new Map(
        produtos.slice(1).map((linha) => [
            String(linha[0] || "").trim(),
            {
                nome: linha[2] || "Item sem nome",
                categoriaID: String(linha[4] || "").trim(),
                status: linha[8] || "",
            },
        ]),
    );

    const mapaCategorias = new Map(
        categorias
            .slice(1)
            .map((linha) => [
                String(linha[0] || "").trim(),
                linha[1] || "Sem categoria",
            ]),
    );

    const mapaUsuarios = new Map(
        usuarios
            .slice(1)
            .map((linha) => [
                String(linha[0] || "").trim(),
                linha[1] || "Usuário não identificado",
            ]),
    );

    const estoque = estoques
        .slice(1)
        .filter((linha) => String(linha[2] || "").trim() === localID)
        .map((linha) => {
            const produto = mapaProdutos.get(String(linha[1] || "").trim());

            return {
                estoqueID: linha[0] || "",
                produtoID: linha[1] || "",
                produto: produto?.nome || "Item não identificado",
                categoria:
                    mapaCategorias.get(produto?.categoriaID) || "Sem categoria",
                quantidade: Number(linha[3]) || 0,
                reservado: Number(linha[4]) || 0,
                disponivel: Number(linha[5]) || 0,
                indisponivel: Number(linha[6]) || 0,
                status: produto?.status || "—",
            };
        });

    const movimentos = movimentacoes
        .slice(1)
        .filter(
            (linha) =>
                String(linha[5] || "").trim() === localID ||
                String(linha[6] || "").trim() === localID,
        )
        .map((linha) => ({
            movimentacaoID: linha[0] || "",
            data: linha[1] || "",
            tipo: linha[2] || "",
            produto:
                mapaProdutos.get(String(linha[3] || "").trim())?.nome ||
                "Item não identificado",
            quantidade: Number(linha[4]) || 0,
            origemID: linha[5] || "",
            destinoID: linha[6] || "",
            observacao: linha[11] || linha[9] || "",
            status: linha[10] || "",
        }));

    const solicitacoes = reservas
        .slice(1)
        .filter((linha) => String(linha[4] || "").trim() === localID)
        .map((linha) => ({
            reservaID: linha[0] || "",
            dataSolicitacao: linha[1] || "",
            solicitante:
                mapaUsuarios.get(String(linha[2] || "").trim()) ||
                "Usuário não identificado",
            produto:
                mapaProdutos.get(String(linha[3] || "").trim())?.nome ||
                "Item não identificado",
            quantidade: Number(linha[5]) || 0,
            status: linha[9] || "",
            observacao: linha[11] || "",
        }));

    return {
        setor: vinculo.setor,
        local: vinculo.local,
        estoque,
        movimentacoes: movimentos,
        solicitacoes,
    };
}

function exigirResponsavel(req, res, next) {
    const usuario = req.session?.usuario;

    if (!usuario) {
        return res.status(401).json({
            sucesso: false,
            mensagem: "Faça login para acessar este painel.",
        });
    }

    if (
        normalizar(usuario.tipoUsuario) !== "RESPONSAVEL" ||
        normalizar(usuario.perfil) !== "RESPONSAVEL" ||
        !usuario.setorID
    ) {
        return res.status(403).json({
            sucesso: false,
            mensagem: "Esta conta não tem acesso ao painel do responsável.",
        });
    }

    next();
}

router.get("/responsavel/dashboard", exigirResponsavel, async (req, res) => {
    try {
        const vinculo = await carregarVinculo(req.session.usuario);
        const dados = await carregarDashboard(vinculo);

        return res.json({
            sucesso: true,
            usuario: req.session.usuario,
            ...dados,
        });
    } catch (erro) {
        console.error("Erro ao carregar painel do responsável:", erro.message);
        return res.status(erro.status || 500).json({
            sucesso: false,
            mensagem: erro.status ? erro.message : "Erro ao carregar o painel.",
        });
    }
});

module.exports = router;
