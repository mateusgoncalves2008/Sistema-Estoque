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
/**
 * Verifica bloqueio ativo do usuário no setor correspondente ao local.
 */
async function verificarBloqueioSetor(usuarioID, local) {
    const [bloqueiosResposta, setoresResposta] = await Promise.all([
        sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "'22_BLOQUEIOS_SETOR'!A:J",
        }),
        sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "12_SETORES!A:E",
        }),
    ]);

    const bloqueios = bloqueiosResposta.data.values || [];
    const setores = setoresResposta.data.values || [];

    const setor = setores
        .slice(1)
        .find((linha) => normalizar(linha[1]) === normalizar(local.nome));

    if (!setor) return null;

    const bloqueio = bloqueios
        .slice(1)
        .find(
            (linha) =>
                String(linha[4] || "").trim() ===
                    String(setor[0] || "").trim() &&
                String(linha[6] || "").trim() === String(usuarioID).trim() &&
                normalizar(linha[9]) === "ATIVO",
        );

    return bloqueio
        ? {
              setorNome: String(bloqueio[5] || setor[1] || "").trim(),
              motivo: String(bloqueio[8] || "").trim(),
          }
        : null;
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
        range: "06_ESTOQUE_LOCAIS!A:I",
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
                statusLocal: normalizar(linha[8] || "ATIVO"),
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

router.get("/aluno/reservas/:usuarioID", async (req, res) => {
    try {
        const sessao = req.session?.usuario;
        if (!sessao?.id) {
            return res.status(401).json({
                sucesso: false,
                mensagem: "Faça login para consultar suas reservas.",
            });
        }

        const usuarioID = String(req.params.usuarioID || "").trim();
        if (String(sessao.id).trim() !== usuarioID) {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Você só pode consultar suas próprias reservas.",
            });
        }
        if (normalizar(sessao.tipoUsuario) !== "ALUNO") {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Esta rota é exclusiva para alunos.",
            });
        }

        if (!usuarioID) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Usuário não informado.",
            });
        }

        const usuario = await buscarUsuario(usuarioID);

        if (!usuario) {
            return res.status(404).json({
                sucesso: false,
                mensagem: "Usuário não encontrado.",
            });
        }

        const tipo = normalizar(usuario.tipoUsuario);

        if (!["ALUNO", "PROFESSOR"].includes(tipo)) {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Perfil sem permissão para consultar reservas.",
            });
        }

        if (normalizar(usuario.status) !== "ATIVO") {
            return res.status(403).json({
                sucesso: false,
                mensagem: "O usuário não está ativo.",
            });
        }

        const [respostaReservas, respostaProdutos, respostaLocais, respostaCategorias] =
            await Promise.all([
                sheets.spreadsheets.values.get({
                    spreadsheetId: SPREADSHEET_ID,
                    range: "08_RESERVAS!A:L",
                }),
                sheets.spreadsheets.values.get({
                    spreadsheetId: SPREADSHEET_ID,
                    range: "02_PRODUTOS!A:K",
                }),
                sheets.spreadsheets.values.get({
                    spreadsheetId: SPREADSHEET_ID,
                    range: "05_LOCAIS!A:G",
                }),
                sheets.spreadsheets.values.get({
                    spreadsheetId: SPREADSHEET_ID,
                    range: "03_CATEGORIAS!A:D",
                }),
            ]);

        const linhasReservas = respostaReservas.data.values || [];
        const linhasProdutos = respostaProdutos.data.values || [];
        const linhasLocais = respostaLocais.data.values || [];
        const linhasCategorias = respostaCategorias.data.values || [];

        const categorias = new Map(
            linhasCategorias.slice(1).map((linha) => [
                String(linha[0] || "").trim(),
                linha[1] || "",
            ]),
        );

        const produtos = new Map(
            linhasProdutos.slice(1).map((linha) => {
                const categoriaID = String(linha[4] || "").trim();
                return [
                    String(linha[0] || "").trim(),
                    {
                        nome: linha[2] || "Item não identificado",
                        categoriaID,
                        categoriaNome: categorias.get(categoriaID) || "Categoria não identificada",
                    },
                ];
            }),
        );

        const locais = new Map(
            linhasLocais
                .slice(1)
                .map((linha) => [
                    String(linha[0] || "").trim(),
                    linha[2] || "Local não identificado",
                ]),
        );

        const minhasReservas = linhasReservas
            .slice(1)
            .filter((linha) => String(linha[2] || "").trim() === usuarioID)
            .map((linha) => {
                const produtoID = String(linha[3] || "").trim();
                const produto = produtos.get(produtoID);

                return {
                    reservaID: linha[0] || "",
                    usuarioID: linha[2] || "",
                    produtoID,
                    nome: produto?.nome || "Item não identificado",
                    tipo: produto?.categoriaNome || "Item",
                    categoriaID: produto?.categoriaID || "",
                    categoriaNome: produto?.categoriaNome || "Categoria não identificada",
                    localID: linha[4] || "",
                    local:
                        locais.get(String(linha[4] || "").trim()) ||
                        "Local não identificado",
                    quantidade: numero(linha[5]),
                    dataInicio: linha[6] || "",
                    dataFim: linha[7] || "",
                    motivo: linha[8] || "",
                    status: linha[9] || "",
                    aprovadoPor: linha[10] || "",
                    observacao: linha[11] || "",
                };
            })
            .reverse();

        return res.json({
            sucesso: true,
            total: minhasReservas.length,
            reservas: minhasReservas,
        });
    } catch (erro) {
        console.error("Erro ao buscar reservas:", erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: "Erro ao buscar reservas.",
            erro:
                process.env.NODE_ENV === "development"
                    ? erro.message
                    : undefined,
        });
    }
});

router.get("/professor/reservas/:usuarioID", async (req, res) => {
    try {
        const sessao = req.session?.usuario;
        if (!sessao?.id) {
            return res.status(401).json({
                sucesso: false,
                mensagem: "Faça login para consultar suas reservas.",
            });
        }

        const usuarioID = String(req.params.usuarioID || "").trim();
        if (String(sessao.id).trim() !== usuarioID) {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Você só pode consultar suas próprias reservas.",
            });
        }
        if (normalizar(sessao.tipoUsuario) !== "PROFESSOR") {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Esta rota é exclusiva para professores.",
            });
        }

        if (!usuarioID) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Usuário não informado.",
            });
        }

        const usuario = await buscarUsuario(usuarioID);

        if (!usuario) {
            return res.status(404).json({
                sucesso: false,
                mensagem: "Usuário não encontrado.",
            });
        }

        if (normalizar(usuario.tipoUsuario) !== "PROFESSOR") {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Esta rota é exclusiva para professores.",
            });
        }

        if (normalizar(usuario.status) !== "ATIVO") {
            return res.status(403).json({
                sucesso: false,
                mensagem: "O usuário não está ativo.",
            });
        }

        const [respostaReservas, respostaProdutos, respostaLocais] =
            await Promise.all([
                sheets.spreadsheets.values.get({
                    spreadsheetId: SPREADSHEET_ID,
                    range: "08_RESERVAS!A:L",
                }),
                sheets.spreadsheets.values.get({
                    spreadsheetId: SPREADSHEET_ID,
                    range: "02_PRODUTOS!A:K",
                }),
                sheets.spreadsheets.values.get({
                    spreadsheetId: SPREADSHEET_ID,
                    range: "05_LOCAIS!A:G",
                }),
            ]);

        const linhasReservas = respostaReservas.data.values || [];
        const linhasProdutos = respostaProdutos.data.values || [];
        const linhasLocais = respostaLocais.data.values || [];

        const produtos = new Map(
            linhasProdutos.slice(1).map((linha) => [
                String(linha[0] || "").trim(),
                {
                    nome: linha[2] || "Item não identificado",
                    categoriaID: linha[4] || "",
                },
            ]),
        );

        const locais = new Map(
            linhasLocais
                .slice(1)
                .map((linha) => [
                    String(linha[0] || "").trim(),
                    linha[2] || "Local não identificado",
                ]),
        );

        const minhasReservas = linhasReservas
            .slice(1)
            .filter((linha) => String(linha[2] || "").trim() === usuarioID)
            .map((linha) => {
                const produtoID = String(linha[3] || "").trim();
                const localID = String(linha[4] || "").trim();
                const produto = produtos.get(produtoID);

                return {
                    reservaID: linha[0] || "",
                    usuarioID,
                    produtoID,
                    nome: produto?.nome || "Item não identificado",
                    tipo: produto?.categoriaID || "Item",
                    localID,
                    local: locais.get(localID) || "Local não identificado",
                    quantidade: numero(linha[5]),
                    dataInicio: linha[6] || "",
                    dataFim: linha[7] || "",
                    motivo: linha[8] || "",
                    status: linha[9] || "",
                    aprovadoPor: linha[10] || "",
                    observacao: linha[11] || "",
                };
            })
            .reverse();

        return res.json({
            sucesso: true,
            total: minhasReservas.length,
            reservas: minhasReservas,
        });
    } catch (erro) {
        console.error("Erro ao buscar reservas do professor:", erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: "Erro ao buscar reservas do professor.",
        });
    }
});

// ============================================================
// POST /api/aluno/reservas
// CRIAR NOVA RESERVA
// ============================================================

router.post("/aluno/reservas", async (req, res) => {
    try {
        const sessao = req.session?.usuario;
        if (!sessao?.id) {
            return res.status(401).json({
                sucesso: false,
                mensagem: "Faça login para criar uma reserva.",
            });
        }
        if (normalizar(sessao.tipoUsuario) !== "ALUNO") {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Somente alunos podem fazer este tipo de reserva.",
            });
        }
        // Usa a identidade da sessão, nunca o usuarioID enviado pelo navegador.
        const usuarioID = String(sessao.id).trim();

        const {
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

        const bloqueioSetor = await verificarBloqueioSetor(usuarioID, local);
        if (bloqueioSetor) {
            return res.status(403).json({
                sucesso: false,
                mensagem: `Sua reserva foi impedida porque você está bloqueado no setor "${bloqueioSetor.setorNome}". Motivo: ${bloqueioSetor.motivo}`,
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

        if (estoque.statusLocal !== "ATIVO") {
            return res.status(409).json({
                sucesso: false,
                mensagem: "Este item está desativado neste setor e não pode ser reservado.",
            });
        }

        if (estoque.disponivel <= 0) {
            return res.status(409).json({
                sucesso: false,
                mensagem: "Este item não está disponível no momento.",
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

/*
 * POST /api/professor/reservas
 * Criar reserva de item para professor.
 * Adicione antes de: module.exports = router;
 */

router.post("/professor/reservas", async (req, res) => {
    try {
        const sessao = req.session?.usuario;
        if (!sessao?.id) {
            return res.status(401).json({
                sucesso: false,
                mensagem: "Faça login para criar uma reserva.",
            });
        }
        if (normalizar(sessao.tipoUsuario) !== "PROFESSOR") {
            return res.status(403).json({
                sucesso: false,
                mensagem:
                    "Somente professores podem fazer este tipo de reserva.",
            });
        }
        // Usa a identidade da sessão, nunca o usuarioID enviado pelo navegador.
        const usuarioID = String(sessao.id).trim();

        const {
            produtoID,
            localID,
            dataRetirada,
            horaRetirada,
            dataDevolucao,
            horaDevolucao,
            motivo,
            observacao,
        } = req.body;

        // 1. Validar os campos obrigatórios
        if (
            !usuarioID ||
            !produtoID ||
            !localID ||
            !dataRetirada ||
            !horaRetirada ||
            !dataDevolucao ||
            !horaDevolucao
        ) {
            return res.status(400).json({
                sucesso: false,
                mensagem:
                    "Informe o usuário, item, local, retirada e devolução.",
            });
        }

        // 2. Validar professor ativo
        const usuario = await buscarUsuario(usuarioID);

        if (!usuario) {
            return res.status(404).json({
                sucesso: false,
                mensagem: "Usuário não encontrado.",
            });
        }

        if (normalizar(usuario.tipoUsuario) !== "PROFESSOR") {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Somente professores podem usar esta rota.",
            });
        }

        if (normalizar(usuario.status) !== "ATIVO") {
            return res.status(403).json({
                sucesso: false,
                mensagem: "O usuário não está ativo.",
            });
        }

        // 3. Validar item ativo
        const produto = await buscarProduto(produtoID);

        if (!produto) {
            return res.status(404).json({
                sucesso: false,
                mensagem: "Item não encontrado.",
            });
        }

        if (normalizar(produto.status) !== "ATIVO") {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Este item não está ativo para reserva.",
            });
        }

        // 4. Validar categoria ativa
        const categoria = await buscarCategoria(produto.categoriaID);

        if (!categoria) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "A categoria deste item não foi encontrada.",
            });
        }

        if (normalizar(categoria.status) !== "ATIVO") {
            return res.status(400).json({
                sucesso: false,
                mensagem: "A categoria deste item não está ativa.",
            });
        }

        const categoriasPermitidas = [
            "INFORMATICA",
            "AUDIOVISUAL",
            "BIBLIOTECA",
            "LABORATORIO",
            "COZINHA",
            "MOBILIARIO",
            "ESPORTES",
            "JOGOS",
            "INFRAESTRUTURA",
        ];

        const categoriaNome = normalizar(categoria.nome);

        if (!categoriasPermitidas.includes(categoriaNome)) {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Esta categoria não está autorizada para reserva.",
            });
        }

        // 5. Validar local ativo
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

        const bloqueioSetor = await verificarBloqueioSetor(usuarioID, local);
        if (bloqueioSetor) {
            return res.status(403).json({
                sucesso: false,
                mensagem: `Sua reserva foi impedida porque você está bloqueado no setor "${bloqueioSetor.setorNome}". Motivo: ${bloqueioSetor.motivo}`,
            });
        }

        // 6. Conferir estoque do item no local escolhido
        const estoque = await buscarEstoque(produtoID, localID);

        if (!estoque) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Não existe estoque deste item neste local.",
            });
        }

        if (estoque.statusLocal !== "ATIVO") {
            return res.status(409).json({
                sucesso: false,
                mensagem: "Este item está desativado neste setor e não pode ser reservado.",
            });
        }

        // A coluna Disponivel já deve representar o saldo após reservas.
        const quantidadeDisponivel = estoque.disponivel;

        if (quantidadeDisponivel <= 0) {
            return res.status(409).json({
                sucesso: false,
                mensagem: "Este item não está disponível para reserva.",
            });
        }

        // 7. Validar datas e horários
        const inicio = gerarDataHora(dataRetirada, horaRetirada);
        const fim = gerarDataHora(dataDevolucao, horaDevolucao);

        if (!inicio || !fim) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "A data ou o horário informado é inválido.",
            });
        }

        if (fim <= inicio) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "A devolução deve ocorrer após a retirada.",
            });
        }

        if (inicio <= new Date()) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "A retirada deve ser em uma data futura.",
            });
        }

        // 8. Verificar conflito com outra reserva
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
                mensagem: "Este item já possui uma reserva nesse período.",
                reservaConflitante: conflito.reservaID,
            });
        }

        // 9. Gerar identificação da reserva
        const reservaID = gerarProximoID(reservas);

        const inicioFormatado = formatarDataHora(inicio);
        const fimFormatado = formatarDataHora(fim);
        const agoraFormatado = formatarDataHora(new Date());

        const motivoFinal =
            String(motivo || "").trim() ||
            `Reserva de ${categoria.nome} para uso pedagógico`;

        // 10. Registrar na aba 08_RESERVAS
        const novaLinha = [
            reservaID, // A - ReservaID
            agoraFormatado, // B - DataSolicitacao
            String(usuarioID), // C - UsuarioID
            String(produtoID), // D - ProdutoID
            String(localID), // E - LocalID
            1, // F - Quantidade
            inicioFormatado, // G - DataInicio
            fimFormatado, // H - DataFim
            motivoFinal, // I - Motivo
            "PENDENTE", // J - Status
            "", // K - AprovadoPor
            String(observacao || "").trim(), // L - Observacao
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

        return res.status(201).json({
            sucesso: true,
            mensagem: "Reserva solicitada com sucesso.",
            reserva: {
                reservaID,
                usuarioID,
                produtoID,
                nome: produto.nome,
                categoria: categoria.nome,
                localID,
                local: local.nome,
                quantidade: 1,
                dataInicio: inicioFormatado,
                dataFim: fimFormatado,
                motivo: motivoFinal,
                status: "PENDENTE",
            },
        });
    } catch (erro) {
        console.error("Erro ao criar reserva do professor:", erro);

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
