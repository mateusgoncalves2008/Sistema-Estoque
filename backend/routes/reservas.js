const express = require("express");
const router = express.Router();

const sheets = require("../database/googleSheets");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function normalizar(valor) {
    return String(valor ?? "")
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function numero(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
}

function gerarDataHora(data, hora) {
    if (!data || !hora) {
        return null;
    }

    // O navegador envia YYYY-MM-DD e HH:mm
    const resultado = new Date(`${data}T${hora}:00`);

    if (Number.isNaN(resultado.getTime())) {
        return null;
    }

    return resultado;
}

function formatarDataHora(data) {
    const pad = (valor) => String(valor).padStart(2, "0");

    return (
        `${data.getFullYear()}-` +
        `${pad(data.getMonth() + 1)}-` +
        `${pad(data.getDate())} ` +
        `${pad(data.getHours())}:` +
        `${pad(data.getMinutes())}`
    );
}

function gerarProximoID(linhas) {
    let maiorNumero = 0;

    for (const linha of linhas.slice(1)) {
        const id = String(linha[0] || "").trim();

        const match = id.match(/^RES-(\d+)$/i);

        if (match) {
            maiorNumero = Math.max(maiorNumero, Number(match[1]));
        }
    }

    return `RES-${String(maiorNumero + 1).padStart(5, "0")}`;
}

// ============================================================
// LER USUÁRIO
// ============================================================

async function buscarUsuario(usuarioID) {
    const resposta = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "01_USUARIOS!A:K",
    });

    const linhas = resposta.data.values || [];

    for (const linha of linhas.slice(1)) {
        if (String(linha[0] || "") === String(usuarioID)) {
            return {
                usuarioID: linha[0],
                nome: linha[1] || "",
                email: linha[2] || "",
                tipoUsuario: linha[5] || "",
                perfil: linha[6] || "",
                setorID: linha[7] || "",
                status: linha[8] || "",
            };
        }
    }

    return null;
}

// ============================================================
// LER PRODUTO
// ============================================================

async function buscarProduto(produtoID) {
    const resposta = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "02_PRODUTOS!A:K",
    });

    const linhas = resposta.data.values || [];

    for (const linha of linhas.slice(1)) {
        if (String(linha[0] || "") === String(produtoID)) {
            return {
                produtoID: linha[0],
                codigo: linha[1] || "",
                nome: linha[2] || "",
                autor: linha[3] || "",
                categoriaID: linha[4] || "",
                subcategoriaID: linha[5] || "",
                estoqueMinimo: numero(linha[6]),
                estado: linha[7] || "",
                status: linha[8] || "",
                dataCadastro: linha[9] || "",
                observacao: linha[10] || "",
            };
        }
    }

    return null;
}

// ============================================================
// LER LOCAL
// ============================================================

async function buscarLocal(localID) {
    const resposta = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "05_LOCAIS!A:G",
    });

    const linhas = resposta.data.values || [];

    for (const linha of linhas.slice(1)) {
        if (String(linha[0] || "") === String(localID)) {
            return {
                localID: linha[0],
                codigo: linha[1] || "",
                nome: linha[2] || "",
                tipo: linha[3] || "",
                responsavelID: linha[4] || "",
                descricao: linha[5] || "",
                status: linha[6] || "",
            };
        }
    }

    return null;
}

// ============================================================
// LER CATEGORIAS
// ============================================================

async function buscarCategoria(categoriaID) {
    const resposta = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "03_CATEGORIAS!A:D",
    });

    const linhas = resposta.data.values || [];

    for (const linha of linhas.slice(1)) {
        if (String(linha[0] || "") === String(categoriaID)) {
            return {
                categoriaID: linha[0],
                nome: linha[1] || "",
                descricao: linha[2] || "",
                status: linha[3] || "",
            };
        }
    }

    return null;
}

// ============================================================
// VERIFICAR DISPONIBILIDADE DO PRODUTO
// ============================================================

async function buscarEstoque(produtoID, localID) {
    const resposta = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "06_ESTOQUE_LOCAIS!A:H",
    });

    const linhas = resposta.data.values || [];

    for (const linha of linhas.slice(1)) {
        if (
            String(linha[1] || "") === String(produtoID) &&
            String(linha[2] || "") === String(localID)
        ) {
            return {
                estoqueID: linha[0],
                produtoID: linha[1],
                localID: linha[2],
                quantidade: numero(linha[3]),
                reservado: numero(linha[4]),
                disponivel: numero(linha[5]),
                indisponivel: numero(linha[6]),
                ultimaAtualizacao: linha[7] || "",
            };
        }
    }

    return null;
}

// ============================================================
// RESERVAS EXISTENTES
// ============================================================

async function buscarReservas() {
    const resposta = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "08_RESERVAS!A:L",
    });

    return resposta.data.values || [];
}

// ============================================================
// VERIFICAR CONFLITO DE HORÁRIO
// ============================================================

function existeConflito(reservas, produtoID, localID, inicio, fim) {
    for (const linha of reservas.slice(1)) {
        if (!linha[0]) {
            continue;
        }

        const reservaProdutoID = String(linha[3] || "");
        const reservaLocalID = String(linha[4] || "");

        if (
            reservaProdutoID !== String(produtoID) ||
            reservaLocalID !== String(localID)
        ) {
            continue;
        }

        const status = normalizar(linha[9]);

        // Reservas encerradas/canceladas não bloqueiam horário.
        if (
            status === "CANCELADA" ||
            status === "CONCLUIDA" ||
            status === "FINALIZADA" ||
            status === "REJEITADA"
        ) {
            continue;
        }

        if (!linha[6] || !linha[7]) {
            continue;
        }

        const reservaInicio = new Date(String(linha[6]).replace(" ", "T"));

        const reservaFim = new Date(String(linha[7]).replace(" ", "T"));

        if (
            Number.isNaN(reservaInicio.getTime()) ||
            Number.isNaN(reservaFim.getTime())
        ) {
            continue;
        }

        // Há conflito quando os intervalos se sobrepõem.
        if (inicio < reservaFim && fim > reservaInicio) {
            return {
                conflito: true,
                reservaID: linha[0],
                inicio: linha[6],
                fim: linha[7],
                status: linha[9],
            };
        }
    }

    return {
        conflito: false,
    };
}

// ============================================================
// GET /api/aluno/reservas/:usuarioID
// SOMENTE AS RESERVAS DO ALUNO
// ============================================================

// ============================================================
// GET /api/aluno/reservas/:usuarioID
// SOMENTE AS RESERVAS DO ALUNO
// ============================================================

router.get("/aluno/reservas/:usuarioID", async (req, res) => {
    try {
        const usuarioID = String(req.params.usuarioID || "").trim();

        if (!usuarioID) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Usuário não informado.",
            });
        }

        // ----------------------------------------------------
        // USUÁRIO
        // ----------------------------------------------------

        const usuario = await buscarUsuario(usuarioID);

        if (!usuario) {
            return res.status(404).json({
                sucesso: false,
                mensagem: "Usuário não encontrado.",
            });
        }

        if (normalizar(usuario.tipoUsuario) !== "ALUNO") {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Este usuário não é um aluno.",
            });
        }

        if (normalizar(usuario.status) !== "ATIVO") {
            return res.status(403).json({
                sucesso: false,
                mensagem: "O usuário não está ativo.",
            });
        }

        // ----------------------------------------------------
        // BUSCAR RESERVAS
        // ----------------------------------------------------

        const reservas = await buscarReservas();

        // ----------------------------------------------------
        // BUSCAR TODOS OS PRODUTOS
        // Para transformar ProdutoID em Nome do produto
        // ----------------------------------------------------

        const respostaProdutos = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "02_PRODUTOS!A:K",
        });

        const produtos = respostaProdutos.data.values || [];

        // ----------------------------------------------------
        // CRIAR MAPA:
        // ProdutoID -> informações do produto
        // ----------------------------------------------------

        const mapaProdutos = new Map();

        for (const linha of produtos.slice(1)) {
            const produtoID = String(linha[0] || "").trim();

            if (!produtoID) {
                continue;
            }

            mapaProdutos.set(produtoID, {
                produtoID: produtoID,
                codigo: linha[1] || "",
                nome: linha[2] || "",
                autor: linha[3] || "",
                categoriaID: linha[4] || "",
                subcategoriaID: linha[5] || "",
                estado: linha[7] || "",
                status: linha[8] || "",
                tipo:
                    String(linha[4] || "").trim() === "CAT-00003"
                        ? "Livro"
                        : String(linha[4] || "").trim() === "CAT-00001"
                          ? "Computador"
                          : "Item",
            });
        }

        // ----------------------------------------------------
        // FILTRAR RESERVAS DO ALUNO
        // E ADICIONAR DADOS DO PRODUTO
        // ----------------------------------------------------

        const minhasReservas = reservas
            .slice(1)
            .filter((linha) => {
                return String(linha[2] || "").trim() === usuarioID;
            })
            .map((linha) => {
                const produtoID = String(linha[3] || "").trim();

                const produto = mapaProdutos.get(produtoID);

                return {
                    reservaID: linha[0] || "",
                    dataSolicitacao: linha[1] || "",

                    usuarioID: linha[2] || "",

                    produtoID: produtoID,

                    nome: produto?.nome || "Produto não encontrado",

                    tipo: produto?.tipo || "Item",

                    codigo: produto?.codigo || "",
                    autor: produto?.autor || "",
                    categoriaID: produto?.categoriaID || "",
                    subcategoriaID: produto?.subcategoriaID || "",
                    estado: produto?.estado || "",

                    localID: linha[4] || "",
                    quantidade: numero(linha[5]),

                    dataInicio: linha[6] || "",
                    dataFim: linha[7] || "",

                    motivo: linha[8] || "",
                    status: linha[9] || "",
                    aprovadoPor: linha[10] || "",
                    observacao: linha[11] || "",
                };
            });

        // ----------------------------------------------------
        // MAIS RECENTES PRIMEIRO
        // ----------------------------------------------------

        minhasReservas.reverse();

        // ----------------------------------------------------
        // RESPOSTA
        // ----------------------------------------------------

        return res.json({
            sucesso: true,
            total: minhasReservas.length,
            reservas: minhasReservas,
        });
    } catch (erro) {
        console.error("Erro ao buscar reservas do aluno:", erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: "Erro ao buscar as reservas do aluno.",
            erro:
                process.env.NODE_ENV === "development"
                    ? erro.message
                    : undefined,
        });
    }
});

// ============================================================
// POST /api/aluno/reservas
// CRIAR NOVA RESERVA
// ============================================================

router.post("/aluno/reservas", async (req, res) => {
    try {
        const {
            usuarioID,
            produtoID,
            localID,
            dataRetirada,
            horaRetirada,
            dataDevolucao,
            horaDevolucao,
            motivo,
            observacao,
        } = req.body;

        // ----------------------------------------------------
        // VALIDAÇÃO BÁSICA
        // ----------------------------------------------------

        if (!usuarioID) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Usuário não informado.",
            });
        }

        if (!produtoID) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Produto não informado.",
            });
        }

        if (!localID) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Local não informado.",
            });
        }

        if (!dataRetirada || !horaRetirada) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Informe a data e a hora da retirada.",
            });
        }

        if (!dataDevolucao || !horaDevolucao) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Informe a data e a hora da devolução.",
            });
        }

        // ----------------------------------------------------
        // USUÁRIO
        // ----------------------------------------------------

        const usuario = await buscarUsuario(usuarioID);

        if (!usuario) {
            return res.status(404).json({
                sucesso: false,
                mensagem: "Usuário não encontrado.",
            });
        }

        if (normalizar(usuario.tipoUsuario) !== "ALUNO") {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Somente alunos podem fazer este tipo de reserva.",
            });
        }

        if (normalizar(usuario.status) !== "ATIVO") {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Seu usuário não está ativo.",
            });
        }

        // ----------------------------------------------------
        // PRODUTO
        // ----------------------------------------------------

        const produto = await buscarProduto(produtoID);

        if (!produto) {
            return res.status(404).json({
                sucesso: false,
                mensagem: "Produto não encontrado.",
            });
        }

        if (normalizar(produto.status) !== "ATIVO") {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Este item não está ativo para reserva.",
            });
        }

        // ----------------------------------------------------
        // CATEGORIA
        // ----------------------------------------------------

        const categoria = await buscarCategoria(produto.categoriaID);

        if (!categoria) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "A categoria deste item não foi encontrada.",
            });
        }

        const categoriaNome = normalizar(categoria.nome);

        const ehLivro = categoriaNome === "BIBLIOTECA";

        const ehComputador = categoriaNome === "INFORMATICA";

        if (!ehLivro && !ehComputador) {
            return res.status(403).json({
                sucesso: false,
                mensagem:
                    "Alunos podem reservar somente livros e computadores.",
            });
        }

        // ----------------------------------------------------
        // LOCAL
        // ----------------------------------------------------

        const local = await buscarLocal(localID);

        if (!local) {
            return res.status(404).json({
                sucesso: false,
                mensagem: "Local não encontrado.",
            });
        }

        if (normalizar(local.status) !== "ATIVO") {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Este local não está ativo.",
            });
        }

        const localNome = normalizar(local.nome);

        // Livro → Biblioteca
        if (ehLivro && localNome !== "BIBLIOTECA") {
            return res.status(403).json({
                sucesso: false,
                mensagem:
                    "Livros somente podem ser reservados pela Biblioteca.",
            });
        }

        // Computador → Laboratório de Informática
        if (ehComputador && localNome !== "LABORATORIO DE INFORMATICA") {
            return res.status(403).json({
                sucesso: false,
                mensagem:
                    "Computadores somente podem ser reservados pelo Laboratório de Informática.",
            });
        }

        // ----------------------------------------------------
        // ESTOQUE
        // ----------------------------------------------------

        const estoque = await buscarEstoque(produtoID, localID);

        if (!estoque) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Não existe estoque deste item neste local.",
            });
        }

        if (estoque.disponivel <= 0) {
            return res.status(409).json({
                sucesso: false,
                mensagem: "Este item não está disponível no momento.",
            });
        }

        if (estoque.disponivel <= estoque.reservado) {
            return res.status(409).json({
                sucesso: false,
                mensagem: "A quantidade disponível já está reservada.",
            });
        }

        // ----------------------------------------------------
        // DATA/HORA
        // ----------------------------------------------------

        const inicio = gerarDataHora(dataRetirada, horaRetirada);

        const fim = gerarDataHora(dataDevolucao, horaDevolucao);

        if (!inicio || !fim) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "A data ou horário informado é inválido.",
            });
        }

        if (fim <= inicio) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "A devolução deve acontecer depois da retirada.",
            });
        }

        // ----------------------------------------------------
        // NÃO PERMITIR RESERVA NO PASSADO
        // ----------------------------------------------------

        const agora = new Date();

        if (inicio <= agora) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "A data e hora da retirada precisam ser futuras.",
            });
        }

        // ----------------------------------------------------
        // CONFLITO
        // ----------------------------------------------------

        const reservas = await buscarReservas();

        const conflito = existeConflito(
            reservas,
            produtoID,
            localID,
            inicio,
            fim,
        );

        if (conflito.conflito) {
            return res.status(409).json({
                sucesso: false,
                mensagem: "Este item já possui uma reserva neste período.",
                reservaConflitante: conflito.reservaID,
            });
        }

        // ----------------------------------------------------
        // GERAR ID
        // ----------------------------------------------------

        const reservaID = gerarProximoID(reservas);

        const agoraFormatado = formatarDataHora(new Date());

        const inicioFormatado = formatarDataHora(inicio);

        const fimFormatado = formatarDataHora(fim);

        // ----------------------------------------------------
        // MOTIVO PADRÃO
        // ----------------------------------------------------

        const motivoFinal =
            String(motivo || "").trim() ||
            (ehLivro
                ? "Leitura / empréstimo de livro"
                : "Pesquisa / uso de computador");

        // ----------------------------------------------------
        // ADICIONAR NA PLANILHA
        // ----------------------------------------------------

        const novaLinha = [
            reservaID, // A ReservaID
            agoraFormatado, // B DataSolicitacao
            usuarioID, // C UsuarioID
            produtoID, // D ProdutoID
            localID, // E LocalID
            1, // F Quantidade
            inicioFormatado, // G DataInicio
            fimFormatado, // H DataFim
            motivoFinal, // I Motivo
            "PENDENTE", // J Status
            "", // K AprovadoPor
            String(observacao || "").trim(), // L Observacao
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "08_RESERVAS!A:L",
            valueInputOption: "USER_ENTERED",
            insertDataOption: "INSERT_ROWS",
            requestBody: {
                values: [novaLinha],
            },
        });

        // ----------------------------------------------------
        // RESPOSTA
        // ----------------------------------------------------

        return res.status(201).json({
            sucesso: true,
            mensagem: "Reserva criada com sucesso.",
            reserva: {
                reservaID,
                usuarioID,
                produtoID,
                localID,
                quantidade: 1,
                dataRetirada,
                horaRetirada,
                dataDevolucao,
                horaDevolucao,
                dataInicio: inicioFormatado,
                dataFim: fimFormatado,
                motivo: motivoFinal,
                status: "PENDENTE",
            },
        });
    } catch (erro) {
        console.error("Erro ao criar reserva:", erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: "Erro interno ao criar a reserva.",
            erro:
                process.env.NODE_ENV === "development"
                    ? erro.message
                    : undefined,
        });
    }
});

module.exports = router;
