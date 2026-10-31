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
    // Uma única chamada ao Google Sheets para carregar as três abas do vínculo.
    const resposta = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: SPREADSHEET_ID,
        ranges: [
            "01_USUARIOS!A:K",
            "12_SETORES!A:E",
            "05_LOCAIS!A:G",
        ],
    });
    const [usuariosRange, setoresRange, locaisRange] = resposta.data.valueRanges || [];
    const usuarios = usuariosRange?.values || [];
    const setores = setoresRange?.values || [];
    const locais = locaisRange?.values || [];

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
    // Carrega os dados do painel em uma única chamada de leitura, reduzindo
    // o consumo da cota da API sem alterar os dados exibidos.
    const resposta = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: SPREADSHEET_ID,
        ranges: [
            "06_ESTOQUE_LOCAIS!A:I",
            "02_PRODUTOS!A:K",
            "03_CATEGORIAS!A:D",
            "07_MOVIMENTACOES!A:L",
            "08_RESERVAS!A:L",
            "01_USUARIOS!A:K",
        ],
    });
    const intervalos = resposta.data.valueRanges || [];
    const estoques = intervalos[0]?.values || [];
    const produtos = intervalos[1]?.values || [];
    const categorias = intervalos[2]?.values || [];
    const movimentacoes = intervalos[3]?.values || [];
    const reservas = intervalos[4]?.values || [];
    const usuarios = intervalos[5]?.values || [];

    const localID = texto(vinculo.local.id);

    const mapaProdutos = new Map(
        produtos.slice(1).map((linha) => [
            texto(linha[0]),
            {
                nome: linha[2] || "Item sem nome",
                categoriaID: texto(linha[4]),
                estoqueMinimo: numero(linha[6]),
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
                estoqueMinimo: produto?.estoqueMinimo ?? 0,
                quantidade: numero(linha[3]),
                reservado: numero(linha[4]),
                disponivel: numero(linha[5]),
                indisponivel: numero(linha[6]),
                statusLocal: texto(linha[8]) || "ATIVO",
                status: texto(linha[8]) || "ATIVO",
                statusProduto: produto?.status || "—",
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

/* =====================================================
   GERENCIAMENTO DO ESTOQUE DO RESPONSÁVEL
   A coluna I da aba 06_ESTOQUE_LOCAIS é StatusLocal.
===================================================== */

function gerarMovimentacaoID(linhas) {
    const maior = linhas.slice(1).reduce((max, linha) => {
        const id = Number(texto(linha[0]).match(/^MOV-(\d+)$/i)?.[1] || 0);
        return Math.max(max, id);
    }, 0);
    return `MOV-${String(maior + 1).padStart(5, "0")}`;
}

router.post(
    "/responsavel/estoque/:estoqueID/ajustar",
    exigirResponsavel,
    async (req, res) => {
        try {
            const vinculo = await carregarVinculo(req.session.usuario);
            const operacao = normalizar(req.body.operacao);
            const quantidade = Number(req.body.quantidade);
            const motivo = texto(req.body.motivo);

            if (!["ENTRADA", "SAIDA"].includes(operacao)) {
                return res.status(400).json({ sucesso: false, mensagem: "Operação inválida." });
            }
            if (!Number.isSafeInteger(quantidade) || quantidade <= 0) {
                return res.status(400).json({ sucesso: false, mensagem: "Informe uma quantidade inteira maior que zero." });
            }
            if (!motivo) {
                return res.status(400).json({ sucesso: false, mensagem: "Informe o motivo da movimentação." });
            }

            const [estoques, produtos, movimentacoes] = await Promise.all([
                lerAba("06_ESTOQUE_LOCAIS!A:I"),
                lerAba("02_PRODUTOS!A:K"),
                lerAba("07_MOVIMENTACOES!A:L"),
            ]);

            const indice = estoques.findIndex((linha, i) =>
                i > 0 &&
                texto(linha[0]) === texto(req.params.estoqueID) &&
                texto(linha[2]) === texto(vinculo.local.id)
            );

            if (indice < 1) {
                return res.status(404).json({ sucesso: false, mensagem: "Item não encontrado no estoque do seu setor." });
            }

            const estoque = estoques[indice];
            if (normalizar(estoque[8] || "ATIVO") !== "ATIVO") {
                return res.status(409).json({ sucesso: false, mensagem: "Este item está inativo neste local." });
            }

            const total = numero(estoque[3]);
            const reservado = numero(estoque[4]);
            const disponivel = numero(estoque[5]);
            const indisponivel = numero(estoque[6]);
            let novoTotal = total;
            let novoDisponivel = disponivel;

            if (operacao === "ENTRADA") {
                novoTotal += quantidade;
                novoDisponivel += quantidade;
            } else {
                if (quantidade > disponivel) {
                    return res.status(409).json({ sucesso: false, mensagem: `Saída não permitida. Há somente ${disponivel} unidade(s) disponível(is), sem contar as reservadas.` });
                }
                novoTotal -= quantidade;
                novoDisponivel -= quantidade;
            }

            const produtoExiste = produtos.slice(1).some((linha) => texto(linha[0]) === texto(estoque[1]));
            if (!produtoExiste) {
                return res.status(409).json({ sucesso: false, mensagem: "O produto vinculado a este estoque não foi encontrado na aba 02_PRODUTOS." });
            }

            const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
            const movimentoID = gerarMovimentacaoID(movimentacoes);
            const linhaPlanilha = indice + 1;
            const linhaMovimento = movimentacoes.length + 1;
            const movimento = [
                movimentoID,
                dataHora,
                operacao,
                texto(estoque[1]),
                quantidade,
                operacao === "SAIDA" ? texto(vinculo.local.id) : "",
                operacao === "ENTRADA" ? texto(vinculo.local.id) : "",
                texto(vinculo.usuario.id),
                texto(vinculo.usuario.id),
                motivo,
                "CONCLUIDA",
                "",
            ];

            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                requestBody: {
                    valueInputOption: "USER_ENTERED",
                    data: [
                        {
                            range: `06_ESTOQUE_LOCAIS!D${linhaPlanilha}:H${linhaPlanilha}`,
                            values: [[novoTotal, reservado, novoDisponivel, indisponivel, dataAtual()]],
                        },
                        {
                            range: `07_MOVIMENTACOES!A${linhaMovimento}:L${linhaMovimento}`,
                            values: [movimento],
                        },
                    ],
                },
            });

            return res.json({
                sucesso: true,
                mensagem: operacao === "ENTRADA" ? "Entrada registrada e estoque atualizado." : "Saída registrada e estoque atualizado.",
                movimentacaoID: movimentoID,
                quantidade: novoTotal,
                reservado,
                disponivel: novoDisponivel,
            });
        } catch (erro) {
            console.error("Erro ao ajustar estoque do responsável:", erro);
            return res.status(erro.status || 500).json({
                sucesso: false,
                mensagem: erro.status ? erro.message : "Não foi possível atualizar o estoque.",
            });
        }
    },
);

router.patch(
    "/responsavel/estoque/:estoqueID/desativar",
    exigirResponsavel,
    async (req, res) => {
        try {
            const vinculo = await carregarVinculo(req.session.usuario);
            const estoques = await lerAba("06_ESTOQUE_LOCAIS!A:I");
            const indice = estoques.findIndex((linha, i) =>
                i > 0 &&
                texto(linha[0]) === texto(req.params.estoqueID) &&
                texto(linha[2]) === texto(vinculo.local.id)
            );

            if (indice < 1) {
                return res.status(404).json({ sucesso: false, mensagem: "Item não encontrado no estoque do seu setor." });
            }

            const linha = estoques[indice];
            if (normalizar(linha[8]) === "INATIVO") {
                return res.status(409).json({ sucesso: false, mensagem: "Este item já está inativo neste local." });
            }

            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `06_ESTOQUE_LOCAIS!I${indice + 1}`,
                valueInputOption: "USER_ENTERED",
                requestBody: { values: [["INATIVO"]] },
            });

            return res.json({ sucesso: true, mensagem: "Item desativado somente neste local. As quantidades foram preservadas." });
        } catch (erro) {
            console.error("Erro ao desativar item do estoque:", erro);
            return res.status(erro.status || 500).json({
                sucesso: false,
                mensagem: erro.status ? erro.message : "Não foi possível desativar o item.",
            });
        }
    },
);

function gerarEmprestimoID(emprestimos) {
    const maior = emprestimos.slice(1).reduce((max, linha) => {
        const numeroID = Number(texto(linha[0]).match(/(\d+)$/)?.[1] || 0);

        return Math.max(max, numeroID);
    }, 0);

    return `EMP-${String(maior + 1).padStart(5, "0")}`;
}

function gerarDevolucaoID(devolucoes) {
    const maior = devolucoes.slice(1).reduce((max, linha) => {
        const numeroID = Number(texto(linha[0]).match(/(\d+)$/)?.[1] || 0);
        return Math.max(max, numeroID);
    }, 0);

    return `DEV-${String(maior + 1).padStart(5, "0")}`;
}

async function atualizarReserva(reservaID, acao, usuario) {
    const resposta = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: SPREADSHEET_ID,
        ranges: [
            "08_RESERVAS!A:L",
            "06_ESTOQUE_LOCAIS!A:I",
            "05_LOCAIS!A:G",
            "09_EMPRESTIMOS!A:L",
            "10_DEVOLUCOES!A:H",
        ],
    });

    const reservas = resposta.data.valueRanges[0].values || [];
    const estoques = resposta.data.valueRanges[1].values || [];
    const locais = resposta.data.valueRanges[2].values || [];
    const emprestimos = resposta.data.valueRanges[3].values || [];
    const devolucoes = resposta.data.valueRanges[4].values || [];

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
    if (acao === "aprovar" && normalizar(estoque[8] || "ATIVO") !== "ATIVO") {
        const erro = new Error("Este item foi desativado neste local e não pode ter novas reservas aprovadas.");
        erro.status = 409;
        throw erro;
    }

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

        const devolucaoExistente = devolucoes
            .slice(1)
            .some((linha) => texto(linha[1]) === texto(emprestimo.linha[0]));

        if (devolucaoExistente) {
            const erro = new Error("Este empréstimo já possui uma devolução registrada.");
            erro.status = 409;
            throw erro;
        }

        atualizacoes.push({
            range: `09_EMPRESTIMOS!H${emprestimo.numeroLinha}:I${emprestimo.numeroLinha}`,
            values: [[dataAtual(), "DEVOLVIDO"]],
        });

        const dataHoraDevolucao = new Date().toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
        });
        const devolucaoID = gerarDevolucaoID(devolucoes);
        const linhaNovaDevolucao = devolucoes.length + 1;

        atualizacoes.push({
            range: `10_DEVOLUCOES!A${linhaNovaDevolucao}:H${linhaNovaDevolucao}`,
            values: [[
                devolucaoID,
                texto(emprestimo.linha[0]),
                dataHoraDevolucao,
                quantidade,
                "BOM",
                texto(reserva[2]),
                texto(usuario.id),
                `Devolução da reserva ${texto(reservaID)}`,
            ]],
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

/* CADASTRO DE ITEM: grava produto e estoque vinculados ao local do responsável. */
function gerarIDSequencial(linhas, prefixo) {
 const maior = linhas.slice(1).reduce((max, linha) => Math.max(max, Number(texto(linha[0]).match(/(\d+)$/)?.[1] || 0)), 0);
 return prefixo + String(maior + 1).padStart(5, "0");
}
function gerarCodigoProduto(produtos, codigoLocal) {
 const codigo = texto(codigoLocal).toUpperCase().replace(/-\d+$/, "").replace(/-+$/, "");
 const mapaPrefixos = {
  "LAB-INFO": "IT-TI",
  "LABORATORIO-INFORMATICA": "IT-TI",
  "LAB-INFORMATICA": "IT-TI",
  "INFORMATICA": "IT-TI",
  "LAB-CIENCIA": "IT-CIE",
  "LABORATORIO-CIENCIA": "IT-CIE",
  "BIBLIOTECA": "IT-BIB",
  "CANTINA": "IT-CAN",
 };
 const chave = codigo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9-]/g, "-").replace(/-+/g, "-");
 const prefixo = mapaPrefixos[chave] || (chave.startsWith("IT-") ? chave : "IT-" + (chave.replace(/^LAB-?/, "").replace(/-/g, "").slice(0, 6) || "SETOR"));
 const regex = new RegExp("^" + prefixo + "-(\\d+)$", "i");
 const maior = produtos.slice(1).reduce((max, linha) => Math.max(max, Number(texto(linha[1]).match(regex)?.[1] || 0)), 0);
 return prefixo + "-" + String(maior + 1).padStart(4, "0");
}
router.get("/responsavel/itens/opcoes", exigirResponsavel, async (req, res) => {
    try {
        await carregarVinculo(req.session.usuario);

        const [categorias, subcategorias] = await Promise.all([
            lerAba("'03_CATEGORIAS'!A:D"),
            lerAba("'04_SUBCATEGORIAS'!A:E"),
        ]);

        const categoriasAtivas = categorias.slice(1)
            .filter((linha) => texto(linha[0]) && texto(linha[1]))
            .filter((linha) => !texto(linha[3]) || normalizar(linha[3]) === "ATIVO")
            .map((linha) => ({ id: texto(linha[0]), nome: texto(linha[1]) }));

        const subcategoriasAtivas = subcategorias.slice(1)
            .filter((linha) => texto(linha[0]) && texto(linha[1]) && texto(linha[2]))
            .filter((linha) => !texto(linha[4]) || normalizar(linha[4]) === "ATIVO")
            .map((linha) => ({
                id: texto(linha[0]),
                categoriaID: texto(linha[1]),
                nome: texto(linha[2]),
            }));

        return res.json({
            sucesso: true,
            categorias: categoriasAtivas,
            subcategorias: subcategoriasAtivas,
        });
    } catch (erro) {
        console.error("Erro ao carregar opções do cadastro:", erro);
        return res.status(erro.status || 500).json({
            sucesso: false,
            mensagem: erro.status
                ? erro.message
                : "Não foi possível ler as abas 03_CATEGORIAS e 04_SUBCATEGORIAS. Confira o acesso à planilha e os nomes das abas.",
        });
    }
});

router.post("/responsavel/itens", exigirResponsavel, async (req, res) => {
 try {
  const vinculo = await carregarVinculo(req.session.usuario);
  const nome=texto(req.body.nome), categoriaID=texto(req.body.categoriaID), subcategoriaID=texto(req.body.subcategoriaID);
  const estoqueMinimo=Number(req.body.estoqueMinimo), quantidade=Number(req.body.quantidade), estado=normalizar(req.body.estado), statusProduto=normalizar(req.body.status || "ATIVO"), observacao=texto(req.body.observacao);
  if (!nome) return res.status(400).json({sucesso:false,mensagem:"Informe o nome do item."});
  if (!categoriaID || !subcategoriaID) return res.status(400).json({sucesso:false,mensagem:"Selecione categoria e subcategoria."});
  if (!Number.isSafeInteger(estoqueMinimo) || estoqueMinimo<0) return res.status(400).json({sucesso:false,mensagem:"O estoque mínimo deve ser inteiro e maior ou igual a zero."});
  if (!Number.isSafeInteger(quantidade) || quantidade<0) return res.status(400).json({sucesso:false,mensagem:"A quantidade inicial deve ser inteira e maior ou igual a zero."});
  if (!["NOVO","BOM","DANIFICADO","INCOMPLETO"].includes(estado)) return res.status(400).json({sucesso:false,mensagem:"Selecione um estado válido."});
  if (!["ATIVO","INATIVO"].includes(statusProduto)) return res.status(400).json({sucesso:false,mensagem:"Selecione um status válido."});
  const [produtos,estoques,categorias,subcategorias,locais]=await Promise.all([lerAba("02_PRODUTOS!A:K"),lerAba("06_ESTOQUE_LOCAIS!A:I"),lerAba("03_CATEGORIAS!A:D"),lerAba("04_SUBCATEGORIAS!A:E"),lerAba("05_LOCAIS!A:G")]);
  const categoria=categorias.slice(1).find(l=>texto(l[0])===categoriaID && normalizar(l[3]||"ATIVO")==="ATIVO");
  if(!categoria) return res.status(400).json({sucesso:false,mensagem:"A categoria selecionada não está ativa."});

  // Padroniza automaticamente livros e computadores pela subcategoria correspondente.
  const nomeNormalizado=normalizar(nome);
  const tipoAutomatico=nomeNormalizado.includes("LIVRO") ? "LIVRO" : /COMPUTADOR|\bPC\b/.test(nomeNormalizado) ? "COMPUTADOR" : "";
  let subcategoriaEscolhida=subcategorias.slice(1).find(l=>texto(l[0])===subcategoriaID && texto(l[1])===categoriaID && normalizar(l[4]||"ATIVO")==="ATIVO");

  if(tipoAutomatico){
   const subcategoriaAutomatica=subcategorias.slice(1).find(l=>texto(l[1])===categoriaID && normalizar(l[2])===tipoAutomatico && normalizar(l[4]||"ATIVO")==="ATIVO");
   if(!subcategoriaAutomatica) return res.status(400).json({sucesso:false,mensagem:'Cadastre/ative a subcategoria "'+(tipoAutomatico==="LIVRO"?"Livro":"Computador")+'" para esta categoria antes de cadastrar o item.'});
   subcategoriaEscolhida=subcategoriaAutomatica;
  }

  if(!subcategoriaEscolhida) return res.status(400).json({sucesso:false,mensagem:"A subcategoria não pertence à categoria ou está inativa."});
  const subcategoriaIDFinal=texto(subcategoriaEscolhida[0]);
  const local=locais.slice(1).find(l=>texto(l[0])===texto(vinculo.local.id)&&normalizar(l[6]||"ATIVO")==="ATIVO");
  if(!local) return res.status(403).json({sucesso:false,mensagem:"O local do seu setor não está ativo."});
  const produtoID=gerarIDSequencial(produtos,"PRD-"), estoqueID=gerarIDSequencial(estoques,"EST-"), codigo=gerarCodigoProduto(produtos,local[1]);
  const produto=[produtoID,codigo,nome,"",categoriaID,subcategoriaIDFinal,estoqueMinimo,estado,statusProduto,dataAtual(),observacao];
  const statusLocal=statusProduto==="ATIVO"?"ATIVO":"INATIVO";
  const estoque=[estoqueID,produtoID,texto(vinculo.local.id),quantidade,0,statusLocal==="ATIVO"?quantidade:0,0,new Date().toLocaleDateString("pt-BR",{timeZone:"America/Sao_Paulo"}),statusLocal];
  await sheets.spreadsheets.values.batchUpdate({spreadsheetId:SPREADSHEET_ID,requestBody:{valueInputOption:"USER_ENTERED",data:[{range:"02_PRODUTOS!A"+(produtos.length+1)+":K"+(produtos.length+1),values:[produto]},{range:"06_ESTOQUE_LOCAIS!A"+(estoques.length+1)+":I"+(estoques.length+1),values:[estoque]}]}});
  return res.status(201).json({sucesso:true,mensagem:"Item cadastrado e vinculado ao estoque do seu setor.",produto:{produtoID,codigo,nome},estoque:{estoqueID,localID:texto(vinculo.local.id),quantidade,reservado:0,disponivel:statusLocal==="ATIVO"?quantidade:0,indisponivel:0,statusLocal}});
 } catch(erro) { console.error("Erro ao cadastrar item do responsável:",erro); return res.status(erro.status||500).json({sucesso:false,mensagem:erro.status?erro.message:"Não foi possível cadastrar o item nas abas 02_PRODUTOS e 06_ESTOQUE_LOCAIS."}); }
});

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
    return res.status(403).json({
        sucesso: false,
        mensagem: "Somente o ADM pode alterar os dados pessoais do perfil.",
    });
});

module.exports = router;
