const express = require("express");
const router = express.Router();
const sheets = require("../database/googleSheets");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

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

function numero(valor) {
    const n = Number(String(valor ?? "0").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
}

function texto(valor) {
    return String(valor ?? "").trim();
}

function dataAtual() {
    return new Date().toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
    });
}

function dataHojeBR() {
    return dataAtual();
}

function dataPlanilhaParaISO(valor) {
    const textoValor = String(valor || "").trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(textoValor)) {
        return textoValor;
    }

    const br = textoValor.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

    return br ? `${br[3]}-${br[2]}-${br[1]}` : "";
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

async function carregarVinculo(usuarioSessao) {
    const [usuarios, setores, locais] = await Promise.all([
        lerAba("01_USUARIOS!A:K"),
        lerAba("12_SETORES!A:E"),
        lerAba("05_LOCAIS!A:G"),
    ]);

    const usuario = usuarios
        .slice(1)
        .find((linha) => texto(linha[0]) === texto(usuarioSessao.id));

    if (!usuario || normalizar(usuario[8]) !== "ATIVO") {
        const erro = new Error("A conta não está ativa.");
        erro.status = 403;
        throw erro;
    }

    const setor = setores
        .slice(1)
        .find(
            (linha) =>
                texto(linha[0]) === texto(usuario[7]) &&
                texto(linha[0]) === texto(usuarioSessao.setorID) &&
                texto(linha[2]) === texto(usuario[0]) &&
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
                texto(linha[4]) === texto(usuario[0]) &&
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

    const localID = texto(vinculo.local.id);

    const mapaProdutos = new Map(
        produtos.slice(1).map((linha) => [
            texto(linha[0]),
            {
                nome: linha[2] || "Item sem nome",
                categoriaID: texto(linha[4]),
                status: linha[8] || "",
            },
        ]),
    );

    const mapaCategorias = new Map(
        categorias
            .slice(1)
            .map((linha) => [texto(linha[0]), linha[1] || "Sem categoria"]),
    );

    const mapaUsuarios = new Map(
        usuarios
            .slice(1)
            .map((linha) => [
                texto(linha[0]),
                linha[1] || "Usuário não identificado",
            ]),
    );

    const estoque = estoques
        .slice(1)
        .filter((linha) => texto(linha[2]) === localID)
        .map((linha) => {
            const produto = mapaProdutos.get(texto(linha[1]));

            return {
                estoqueID: linha[0] || "",
                produtoID: linha[1] || "",
                produto: produto?.nome || "Item não identificado",
                categoria:
                    mapaCategorias.get(produto?.categoriaID) || "Sem categoria",
                quantidade: numero(linha[3]),
                reservado: numero(linha[4]),
                disponivel: numero(linha[5]),
                indisponivel: numero(linha[6]),
                status: produto?.status || "—",
            };
        });

    const movimentos = movimentacoes
        .slice(1)
        .filter(
            (linha) =>
                texto(linha[5]) === localID || texto(linha[6]) === localID,
        )
        .map((linha) => ({
            movimentacaoID: linha[0] || "",
            data: linha[1] || "",
            tipo: linha[2] || "",
            produto:
                mapaProdutos.get(texto(linha[3]))?.nome ||
                "Item não identificado",
            quantidade: numero(linha[4]),
            origemID: linha[5] || "",
            destinoID: linha[6] || "",
            observacao: linha[11] || linha[9] || "",
            status: linha[10] || "",
        }));

    const solicitacoes = reservas
        .slice(1)
        .filter((linha) => texto(linha[4]) === localID)
        .map((linha) => ({
            reservaID: linha[0] || "",
            dataSolicitacao: linha[1] || "",
            solicitante:
                mapaUsuarios.get(texto(linha[2])) || "Usuário não identificado",
            produto:
                mapaProdutos.get(texto(linha[3]))?.nome ||
                "Item não identificado",
            quantidade: numero(linha[5]),
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

function gerarEmprestimoID(emprestimos) {
    const maior = emprestimos.slice(1).reduce((max, linha) => {
        const numeroID = Number(texto(linha[0]).match(/(\d+)$/)?.[1] || 0);

        return Math.max(max, numeroID);
    }, 0);

    return `EMP-${String(maior + 1).padStart(5, "0")}`;
}

async function atualizarReserva(reservaID, acao, usuario) {
    const resposta = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: SPREADSHEET_ID,
        ranges: [
            "08_RESERVAS!A:L",
            "06_ESTOQUE_LOCAIS!A:H",
            "05_LOCAIS!A:G",
            "09_EMPRESTIMOS!A:L",
        ],
    });

    const reservas = resposta.data.valueRanges[0].values || [];
    const estoques = resposta.data.valueRanges[1].values || [];
    const locais = resposta.data.valueRanges[2].values || [];
    const emprestimos = resposta.data.valueRanges[3].values || [];

    const indice = reservas.findIndex(
        (linha, i) => i > 0 && texto(linha[0]) === texto(reservaID),
    );

    if (indice < 1) {
        const erro = new Error("Reserva não encontrada.");
        erro.status = 404;
        throw erro;
    }

    const reserva = reservas[indice];
    const status = normalizar(reserva[9]);
    const produtoID = texto(reserva[3]);
    const localID = texto(reserva[4]);
    const quantidade = numero(reserva[5]);

    const localResponsavel = locais
        .slice(1)
        .find(
            (linha) =>
                texto(linha[0]) === texto(usuario.localID) &&
                texto(linha[4]) === texto(usuario.id),
        );

    if (!localResponsavel || texto(localResponsavel[0]) !== localID) {
        const erro = new Error("Esta reserva não pertence ao seu setor.");
        erro.status = 403;
        throw erro;
    }

    if (quantidade <= 0) {
        const erro = new Error("Quantidade da reserva inválida.");
        erro.status = 400;
        throw erro;
    }

    const indiceEstoque = estoques.findIndex(
        (linha, i) =>
            i > 0 &&
            texto(linha[1]) === produtoID &&
            texto(linha[2]) === localID,
    );

    if (indiceEstoque < 1) {
        const erro = new Error("Estoque do produto não encontrado.");
        erro.status = 404;
        throw erro;
    }

    const estoque = estoques[indiceEstoque];
    let reservado = numero(estoque[4]);
    let disponivel = numero(estoque[5]);

    const linhaReserva = indice + 1;
    const linhaEstoque = indiceEstoque + 1;
    let novoStatus = "";
    const atualizacoes = [];
    let novoEmprestimo = null;

    if (acao === "aprovar") {
        if (status !== "PENDENTE") {
            const erro = new Error(
                "Somente reservas pendentes podem ser aprovadas.",
            );
            erro.status = 409;
            throw erro;
        }

        if (disponivel < quantidade) {
            const erro = new Error("Estoque disponível insuficiente.");
            erro.status = 409;
            throw erro;
        }

        const reservaJaConvertida = emprestimos
            .slice(1)
            .some((linha) => texto(linha[11]) === texto(reservaID));

        if (reservaJaConvertida) {
            const erro = new Error(
                "Esta reserva já possui um empréstimo registrado.",
            );
            erro.status = 409;
            throw erro;
        }

        reservado += quantidade;
        disponivel -= quantidade;
        novoStatus = "APROVADA";

        novoEmprestimo = [
            gerarEmprestimoID(emprestimos),
            dataAtual(),
            texto(reserva[2]),
            produtoID,
            localID,
            quantidade,
            texto(reserva[7]),
            "",
            "ABERTO",
            texto(usuario.id),
            texto(reserva[11] || reserva[8]),
            texto(reservaID),
        ];
    } else if (acao === "recusar") {
        if (status !== "PENDENTE") {
            const erro = new Error(
                "Somente reservas pendentes podem ser recusadas.",
            );
            erro.status = 409;
            throw erro;
        }

        novoStatus = "RECUSADA";
    } else if (acao === "cancelar") {
        if (!["PENDENTE", "APROVADA"].includes(status)) {
            const erro = new Error(
                "Esta reserva não pode ser cancelada neste status.",
            );
            erro.status = 409;
            throw erro;
        }

        if (status === "APROVADA") {
            if (reservado < quantidade) {
                const erro = new Error(
                    "Quantidade reservada inconsistente no estoque.",
                );
                erro.status = 409;
                throw erro;
            }

            reservado -= quantidade;
            disponivel += quantidade;
        }

        novoStatus = "CANCELADA";
    } else if (acao === "concluir") {
        if (status !== "APROVADA") {
            const erro = new Error(
                "Somente reservas aprovadas podem ser concluídas.",
            );
            erro.status = 409;
            throw erro;
        }

        if (reservado < quantidade) {
            const erro = new Error(
                `Estoque inconsistente: reserva pede ${quantidade}, mas há ${reservado} reservado.`,
            );
            erro.status = 409;
            throw erro;
        }

        const emprestimosDaReserva = emprestimos
            .slice(1)
            .map((linha, i) => ({
                linha,
                numeroLinha: i + 2,
            }))
            .filter((item) => texto(item.linha[11]) === texto(reservaID));

        if (emprestimosDaReserva.length !== 1) {
            const erro = new Error(
                emprestimosDaReserva.length === 0
                    ? "Empréstimo desta reserva não encontrado. Verifique a coluna L (ReservaID) na aba 09_EMPRESTIMOS."
                    : "Há mais de um empréstimo vinculado a esta reserva. Verifique a planilha antes de concluir.",
            );
            erro.status = 409;
            throw erro;
        }

        const emprestimo = emprestimosDaReserva[0];
        const statusEmprestimo = normalizar(emprestimo.linha[8]);

        if (!["ABERTO", "ATRASADO"].includes(statusEmprestimo)) {
            const erro = new Error(
                `O empréstimo não pode ser devolvido porque está com status ${statusEmprestimo}.`,
            );
            erro.status = 409;
            throw erro;
        }

        atualizacoes.push({
            range: `09_EMPRESTIMOS!H${emprestimo.numeroLinha}:I${emprestimo.numeroLinha}`,
            values: [[dataAtual(), "DEVOLVIDO"]],
        });

        reservado -= quantidade;
        disponivel += quantidade;
        novoStatus = "CONCLUIDO";
    } else {
        const erro = new Error("Ação inválida.");
        erro.status = 400;
        throw erro;
    }

    if (["aprovar", "cancelar", "concluir"].includes(acao)) {
        atualizacoes.push({
            range: `06_ESTOQUE_LOCAIS!E${linhaEstoque}:F${linhaEstoque}`,
            values: [[reservado, disponivel]],
        });

        atualizacoes.push({
            range: `06_ESTOQUE_LOCAIS!H${linhaEstoque}`,
            values: [[dataAtual()]],
        });
    }

    atualizacoes.push({
        range: `08_RESERVAS!J${linhaReserva}`,
        values: [[novoStatus]],
    });

    if (novoEmprestimo) {
        const linhaNova = emprestimos.length + 1;

        atualizacoes.push({
            range: `09_EMPRESTIMOS!A${linhaNova}:L${linhaNova}`,
            values: [novoEmprestimo],
        });
    }

    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
            valueInputOption: "USER_ENTERED",
            data: atualizacoes,
        },
    });

    return { reservaID, status: novoStatus };
}

for (const acao of ["aprovar", "recusar", "cancelar", "concluir"]) {
    router.patch(
        `/responsavel/solicitacoes/:reservaID/${acao}`,
        exigirResponsavel,
        async (req, res) => {
            try {
                const vinculo = await carregarVinculo(req.session.usuario);

                const resultado = await atualizarReserva(
                    req.params.reservaID,
                    acao,
                    {
                        id: vinculo.usuario.id,
                        localID: vinculo.local.id,
                    },
                );

                return res.json({
                    sucesso: true,
                    mensagem: `Reserva ${resultado.status.toLowerCase()} com sucesso.`,
                    ...resultado,
                });
            } catch (erro) {
                console.error(`Erro ao ${acao} reserva:`, erro.message);

                return res.status(erro.status || 500).json({
                    sucesso: false,
                    mensagem: erro.status
                        ? erro.message
                        : "Não foi possível atualizar a reserva.",
                });
            }
        },
    );
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

/* =====================================================
   MEU PERFIL DO RESPONSÁVEL
===================================================== */

const PERFIS_RESPONSAVEIS = "23_PERFIS_RESPONSAVEIS";

const CABECALHO_PERFIS = [
    "PerfilID",
    "UsuarioID",
    "DataNascimento",
    "CPF",
    "Telefone",
    "DataAtualizacao",
];

async function garantirAbaPerfis() {
    const metadata = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
        fields: "sheets.properties.title",
    });

    const existe = (metadata.data.sheets || []).some(
        (aba) => aba.properties?.title === PERFIS_RESPONSAVEIS,
    );

    if (!existe) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                requests: [
                    {
                        addSheet: {
                            properties: {
                                title: PERFIS_RESPONSAVEIS,
                            },
                        },
                    },
                ],
            },
        });
    }

    const atual = await lerAba(`${PERFIS_RESPONSAVEIS}!A1:F1`);

    if (!atual.length || !atual[0]?.some(Boolean)) {
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${PERFIS_RESPONSAVEIS}!A1:F1`,
            valueInputOption: "RAW",
            requestBody: {
                values: [CABECALHO_PERFIS],
            },
        });
    }
}

router.get("/responsavel/perfil", exigirResponsavel, async (req, res) => {
    try {
        const usuarioID = texto(req.session.usuario.id);

        const [usuarios, setores] = await Promise.all([
            lerAba("01_USUARIOS!A:K"),
            lerAba("12_SETORES!A:E"),
            garantirAbaPerfis(),
        ]);

        const usuario = usuarios
            .slice(1)
            .find((linha) => texto(linha[0]) === usuarioID);

        if (!usuario || normalizar(usuario[8]) !== "ATIVO") {
            return res.status(403).json({
                sucesso: false,
                mensagem: "A conta não está ativa.",
            });
        }

        const setor = setores
            .slice(1)
            .find((linha) => texto(linha[0]) === texto(usuario[7]));

        const perfis = await lerAba(`${PERFIS_RESPONSAVEIS}!A:F`);

        const registro =
            perfis.slice(1).find((linha) => texto(linha[1]) === usuarioID) ||
            [];

        return res.json({
            sucesso: true,
            perfil: {
                usuarioID: usuario[0] || "",
                nome: usuario[1] || "",
                email: usuario[2] || "",
                tipoUsuario: usuario[5] || "",
                perfil: usuario[6] || "",
                setor: setor?.[1] || "",
                status: usuario[8] || "",
                dataCadastro: usuario[9] || "",
                ultimoLogin: usuario[10] || "",
                dataNascimento: dataPlanilhaParaISO(registro[2]),
                cpf: registro[3] || "",
                telefone: registro[4] || "",
            },
        });
    } catch (erro) {
        console.error("Erro ao carregar perfil do responsável:", erro.message);

        return res.status(500).json({
            sucesso: false,
            mensagem:
                "Erro ao carregar o perfil. Verifique a conexão com a planilha.",
        });
    }
});

router.patch("/responsavel/perfil", exigirResponsavel, async (req, res) => {
    try {
        const usuarioID = texto(req.session.usuario.id);
        const { dataNascimento, cpf, telefone } = req.body || {};

        const cpfLimpo = String(cpf || "").replace(/\D/g, "");
        const telefoneLimpo = String(telefone || "").replace(/\D/g, "");

        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(String(dataNascimento || "")) ||
            Number.isNaN(Date.parse(dataNascimento)) ||
            new Date(dataNascimento + "T00:00:00") > new Date()
        ) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Informe uma data de nascimento válida.",
            });
        }

        if (!/^\d{11}$/.test(cpfLimpo)) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "O CPF deve conter 11 números.",
            });
        }

        if (!/^\d{10,11}$/.test(telefoneLimpo)) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "O telefone deve conter DDD e 10 ou 11 números.",
            });
        }

        await garantirAbaPerfis();

        const usuarios = await lerAba("01_USUARIOS!A:K");

        const usuario = usuarios
            .slice(1)
            .find((linha) => texto(linha[0]) === usuarioID);

        if (!usuario || normalizar(usuario[8]) !== "ATIVO") {
            return res.status(403).json({
                sucesso: false,
                mensagem: "A conta não está ativa.",
            });
        }

        const perfis = await lerAba(`${PERFIS_RESPONSAVEIS}!A:F`);

        const indice = perfis.findIndex(
            (linha, i) => i > 0 && texto(linha[1]) === usuarioID,
        );

        const linhaPlanilha =
            indice > 0 ? indice + 1 : Math.max(perfis.length + 1, 2);

        const perfilID =
            indice > 0
                ? perfis[indice][0]
                : `PER-${String(linhaPlanilha - 1).padStart(5, "0")}`;

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${PERFIS_RESPONSAVEIS}!A${linhaPlanilha}:F${linhaPlanilha}`,
            valueInputOption: "USER_ENTERED",
            requestBody: {
                values: [
                    [
                        perfilID,
                        usuarioID,
                        dataNascimento,
                        cpfLimpo,
                        telefoneLimpo,
                        dataHojeBR(),
                    ],
                ],
            },
        });

        return res.json({
            sucesso: true,
            mensagem: "Perfil atualizado com sucesso.",
        });
    } catch (erro) {
        console.error("Erro ao salvar perfil do responsável:", erro.message);

        return res.status(500).json({
            sucesso: false,
            mensagem: "Não foi possível salvar o perfil na planilha.",
        });
    }
});

module.exports = router;
