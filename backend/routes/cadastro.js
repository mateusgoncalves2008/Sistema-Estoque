const express = require("express");
const crypto = require("crypto");

const router = express.Router();
const sheets = require("../database/googleSheets");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Padroniza Ano e Turma para manter os dados consistentes na planilha.
function normalizarAnoEscolar(valor) {
    const texto = String(valor || "").trim();
    const numero = texto.match(/^(\d+)\s*(?:[º°o]?\s*ano)?$/i);
    return numero ? `${numero[1]}° Ano` : texto;
}

function normalizarNomeTurma(valor) {
    const texto = String(valor || "").trim();
    const numero = texto.match(/^(?:turma\s*)?(\d+)$/i);
    return numero ? `Turma ${numero[1]}` : texto;
}

// ============================================================
// GERAR SALT
// ============================================================

function gerarSalt() {
    return crypto.randomBytes(16).toString("hex");
}

// ============================================================
// GERAR HASH DA SENHA
// MESMA REGRA UTILIZADA NO LOGIN
// ============================================================

function gerarHashSenha(senha, salt) {
    const derivada = crypto.scryptSync(senha, salt, 64, {
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
    }).toString("hex");
    return `scrypt$16384$8$1${derivada}`;
}

// ============================================================
// VERIFICAR MATRÍCULA
// ============================================================
//
// IMPORTANTE:
// Antes de colocar esta função para valer, precisamos confirmar
// em qual aba/coluna da sua planilha ficam as matrículas
// autorizadas.
//
// Por enquanto esta rota está preparada para receber a matrícula.
// ============================================================

router.post("/verificar-matricula", async (req, res) => {

    try {

        const { matricula } = req.body;

        if (!matricula) {

            return res.status(400).json({
                sucesso: false,
                mensagem: "Matrícula é obrigatória.",
            });
        }

        const identificador = String(matricula).trim();

        const resposta = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "17_CADASTROS_AUTORIZADOS!A2:J",
        });

        const autorizacoes = resposta.data.values || [];

        const registro = autorizacoes.find((linha) => {
            const identificadorPlanilha = String(linha[2] || "").trim();

            return identificadorPlanilha === identificador;
        });

        if (!registro) {
            const ehMASP = /^\d{7}-\d$/.test(identificador);

            return res.status(404).json({
                sucesso: false,
                mensagem: ehMASP
                    ? "O MASP informado está incorreto."
                    : "A matrícula informada está incorreta.",
            });
        }

        const [
            autorizacaoID,
            tipo,
            identificadorEncontrado,
            usuarioID,
            nome,
            ano,
            turma,
            turno,
            idade,
            status,
        ] = registro;

        const statusNormalizado = String(status || "").trim().toUpperCase();

        if (statusNormalizado === "CADASTRADO") {

            return res.status(409).json({
                sucesso: false,
                mensagem: "Esta matrícula já possui uma conta cadastrada.",
            });
        }

        if (statusNormalizado !== "PENDENTE") {

            return res.status(403).json({
                sucesso: false,
                mensagem: "Esta matrícula não está disponível para cadastro.",
            });
        }

        const respostaFinal = {
            sucesso: true,
            mensagem: "Matrícula autorizada.",
            cadastro: {
                autorizacaoID: autorizacaoID || "",
                tipo: tipo || "",
                identificador: identificadorEncontrado || "",
                usuarioID: usuarioID || "",
                nome: nome || "",
                ano: ano || "",
                turma: turma || "",
                turno: turno || "",
                idade: idade || "",
                status: status || "",
            },
        };

        return res.json(respostaFinal);
    } catch (erro) {
        console.error("ERRO AO VERIFICAR MATRÍCULA:");
        console.error(erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: "Erro interno ao verificar matrícula.",
        });
    }
});

// ============================================================
// CADASTRAR USUÁRIO
// ============================================================

router.post("/cadastro", async (req, res) => {
    try {
        const {
            matricula,
            nome,
            ano,
            turma,
            turno,
            idade,
            email,
            senha,
            tipo,
        } = req.body;

        // ==================================================
        // VALIDAÇÕES BÁSICAS
        // ==================================================

        if (!matricula || !nome || !idade || !email || !senha) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Preencha todos os campos obrigatórios.",
            });
        }

        const matriculaNormalizada = String(matricula).trim();
        const nomeNormalizado = String(nome).trim();
        const emailNormalizado = String(email).trim().toLowerCase();
        const tipoNormalizado = String(tipo || "")
            .trim()
            .toUpperCase();

        const anoNormalizado = normalizarAnoEscolar(ano);
        const turmaNormalizada = normalizarNomeTurma(turma);

        // ==================================================
        // VALIDAR TIPO
        // ==================================================

        if (tipoNormalizado !== "ALUNO" && tipoNormalizado !== "PROFESSOR") {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Tipo de usuário inválido.",
            });
        }

        // ==================================================
        // REGRAS ESPECÍFICAS
        // ==================================================

        if (tipoNormalizado === "ALUNO") {
            if (!anoNormalizado || !turmaNormalizada || !turno) {
                return res.status(400).json({
                    sucesso: false,
                    mensagem:
                        "Para aluno, Ano, Turma e Turno são obrigatórios.",
                });
            }
        }

        // ==================================================
        // BUSCAR AUTORIZAÇÃO
        // ==================================================

        const respostaAutorizacoes = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "17_CADASTROS_AUTORIZADOS!A2:J",
        });

        const autorizacoes = respostaAutorizacoes.data.values || [];

        const indiceAutorizacao = autorizacoes.findIndex((linha) => {
            const identificadorPlanilha = String(linha[2] || "").trim();

            return identificadorPlanilha === matriculaNormalizada;
        });

        if (indiceAutorizacao === -1) {
            return res.status(404).json({
                sucesso: false,
                mensagem: "Matrícula/MASP não encontrada ou não autorizada.",
            });
        }

        const autorizacao = autorizacoes[indiceAutorizacao];

        const autorizacaoID = autorizacao[0] || "";
        const tipoAutorizado = String(autorizacao[1] || "")
            .trim()
            .toUpperCase();

        const statusAutorizacao = String(autorizacao[9] || "")
            .trim()
            .toUpperCase();

        // ==================================================
        // CONFIRMAR TIPO
        // ==================================================

        if (tipoAutorizado !== tipoNormalizado) {
            return res.status(400).json({
                sucesso: false,
                mensagem:
                    "O tipo de usuário informado não corresponde à autorização.",
            });
        }

        // ==================================================
        // VERIFICAR STATUS
        // ==================================================

        if (statusAutorizacao === "CADASTRADO") {
            return res.status(409).json({
                sucesso: false,
                mensagem: "Esta matrícula/MASP já possui uma conta cadastrada.",
            });
        }

        if (statusAutorizacao !== "PENDENTE") {
            return res.status(403).json({
                sucesso: false,
                mensagem:
                    "Esta matrícula/MASP não está disponível para cadastro.",
            });
        }

        // ==================================================
        // BUSCAR USUÁRIOS
        // ==================================================

        const respostaUsuarios = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "01_USUARIOS!A2:K",
        });

        const usuarios = respostaUsuarios.data.values || [];

        // VERIFICAR E-MAIL DUPLICADO

        const emailExiste = usuarios.some((linha) => {
            const emailExistente = String(linha[2] || "")
                .trim()
                .toLowerCase();

            return emailExistente === emailNormalizado;
        });

        if (emailExiste) {
            return res.status(409).json({
                sucesso: false,
                mensagem:
                    "Este e-mail já está cadastrado. Utilize outro e-mail para criar sua conta.",
            });
        }

        // ==================================================
        // GERAR USUARIOID
        // ==================================================

        const numerosExistentes = usuarios
            .map((linha) => {
                const id = String(linha[0] || "").trim();

                const correspondencia = id.match(/^USR-(\d+)$/);

                if (!correspondencia) {
                    return null;
                }

                return Number(correspondencia[1]);
            })
            .filter((numero) => Number.isInteger(numero));

        const maiorNumero =
            numerosExistentes.length > 0 ? Math.max(...numerosExistentes) : 0;

        const novoNumero = maiorNumero + 1;

        const usuarioID = `USR-${String(novoNumero).padStart(5, "0")}`;

        // ==================================================
        // SENHA
        // ==================================================

        const salt = gerarSalt();
        const senhaHash = gerarHashSenha(senha, salt);

        // ==================================================
        // DATA
        // ==================================================

        const agora = new Date();

        const dataCadastro = agora.toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
        });

        // ==================================================
        // CRIAR LINHA DA 01_USUARIOS
        // ==================================================

        const perfilNormalizado =
            tipoNormalizado === "ADMIN"
                ? "ADMIN"
                : tipoNormalizado === "LIDER"
                  ? "LIDER"
                  : tipoNormalizado === "PROFESSOR"
                    ? "PROFESSOR"
                    : tipoNormalizado === "ALUNO"
                      ? "ALUNO"
                      : "CONSULTA";

        const novaLinha = [
            usuarioID, // A - UsuarioID
            nomeNormalizado, // B - Nome
            emailNormalizado, // C - Email
            senhaHash, // D - SenhaHash
            salt, // E - Salt
            tipoNormalizado, // F - TipoUsuario
            perfilNormalizado, // G - Perfil
            "", // H - SetorID
            "ATIVO", // I - Status
            dataCadastro, // J - DataCadastro
            "", // K - UltimoLogin
        ];

        // ==================================================
        // GRAVAR NA 01_USUARIOS
        // ==================================================

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "01_USUARIOS!A:K",
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            requestBody: {
                values: [novaLinha],
            },
        });

        // ==================================================
        // ATUALIZAR 17_CADASTROS_AUTORIZADOS
        // ==================================================

        // indiceAutorizacao começa em 0 para A2.
        // Portanto:
        // A2 = linha 2
        // A3 = linha 3
        // etc.
        const numeroLinhaPlanilha = indiceAutorizacao + 2;

        // Coluna D = UsuarioID
        // Atualiza os dados completos da autorização
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `17_CADASTROS_AUTORIZADOS!D${numeroLinhaPlanilha}:J${numeroLinhaPlanilha}`,
            valueInputOption: "RAW",
            requestBody: {
                values: [
                    [
                        usuarioID, // D - UsuarioID
                        nomeNormalizado, // E - Nome
                        anoNormalizado, // F - Ano
                        turmaNormalizada, // G - Turma
                        turno || "", // H - Turno
                        idade || "", // I - Idade
                        "CADASTRADO", // J - Status
                    ],
                ],
            },
        });

        // ==================================================
        // RESPOSTA
        // ==================================================

        return res.json({
            sucesso: true,
            mensagem: "Cadastro realizado com sucesso.",
            usuario: {
                id: usuarioID,
                nome: nomeNormalizado,
                email: emailNormalizado,
                tipoUsuario: tipoNormalizado,
                perfil: perfilNormalizado,
            },
        });
    } catch (erro) {
        console.error("Erro ao cadastrar usuário:");
        console.error(erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: "Erro interno ao realizar o cadastro.",
        });
    }
});

/* =========================================================
   AUTORIZAR RESPONSÁVEL — SOMENTE ADM AUTENTICADO
   POST /api/autorizar-responsavel
========================================================= */

function somenteADM(req, res, next) {
    const usuario = req.session?.usuario;

    if (
        !usuario ||
        String(usuario.tipoUsuario || "").toUpperCase() !== "ADMIN" ||
        String(usuario.perfil || "").toUpperCase() !== "ADMIN"
    ) {
        return res.status(403).json({
            sucesso: false,
            mensagem: "Acesso permitido somente ao ADM.",
        });
    }

    next();
}

function normalizar(valor) {
    return String(valor || "").trim();
}

function gerarID(prefixo, linhas, expressao) {
    const numeros = linhas.map((linha) => {
        const match = normalizar(linha[0]).match(expressao);
        return match ? Number(match[1]) : 0;
    });

    return `${prefixo}${String(Math.max(0, ...numeros) + 1).padStart(5, "0")}`;
}

function dataAtual() {
    return new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
    });
}

router.post("/autorizar-responsavel", somenteADM, async (req, res) => {
    try {
        const setorID = normalizar(req.body?.setorID);
        const email = normalizar(req.body?.email).toLowerCase();

        if (!setorID || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Informe um SetorID e um e-mail válido.",
            });
        }

        const [setoresResp, usuariosResp, autorizacoesResp] = await Promise.all(
            [
                sheets.spreadsheets.values.get({
                    spreadsheetId: SPREADSHEET_ID,
                    range: "12_SETORES!A2:E",
                }),
                sheets.spreadsheets.values.get({
                    spreadsheetId: SPREADSHEET_ID,
                    range: "01_USUARIOS!A2:K",
                }),
                sheets.spreadsheets.values.get({
                    spreadsheetId: SPREADSHEET_ID,
                    range: "18_AUTORIZACOES_RESPONSAVEIS!A2:G",
                }),
            ],
        );

        const setores = setoresResp.data.values || [];
        const usuarios = usuariosResp.data.values || [];
        const autorizacoes = autorizacoesResp.data.values || [];

        const setor = setores.find((linha) => normalizar(linha[0]) === setorID);

        if (!setor || normalizar(setor[4]).toUpperCase() !== "ATIVO") {
            return res.status(404).json({
                sucesso: false,
                mensagem: "Setor não encontrado ou inativo.",
            });
        }

        if (normalizar(setor[2])) {
            return res.status(409).json({
                sucesso: false,
                mensagem: "Este setor já possui um responsável vinculado.",
            });
        }

        if (
            usuarios.some(
                (linha) => normalizar(linha[2]).toLowerCase() === email,
            )
        ) {
            return res.status(409).json({
                sucesso: false,
                mensagem: "Este e-mail já possui uma conta.",
            });
        }

        const autorizacaoExistente = autorizacoes.some(
            (linha) =>
                normalizar(linha[2]).toLowerCase() === email &&
                normalizar(linha[3]).toUpperCase() === "PENDENTE",
        );

        if (autorizacaoExistente) {
            return res.status(409).json({
                sucesso: false,
                mensagem: "Este e-mail já está autorizado para esse setor.",
            });
        }

        const autorizacaoID = gerarID("AUT-", autorizacoes, /^AUT-(\d+)$/);

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "18_AUTORIZACOES_RESPONSAVEIS!A:G",
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            requestBody: {
                values: [
                    [
                        autorizacaoID,
                        setorID,
                        email,
                        "PENDENTE",
                        dataAtual(),
                        normalizar(req.session.usuario.id),
                        "",
                    ],
                ],
            },
        });

        return res.status(201).json({
            sucesso: true,
            mensagem: "Responsável autorizado para criar a conta.",
            autorizacaoID,
            setorID,
            email,
        });
    } catch (erro) {
        console.error("Erro ao autorizar responsável:", erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: "Erro interno ao autorizar responsável.",
        });
    }
});

/* =========================================================
   CRIAR CONTA DO RESPONSÁVEL
   POST /api/cadastro-responsavel
========================================================= */

async function garantirAbaPerfilResponsaveis() {
    const nomeAba = "23_PERFIS_RESPONSAVEIS";
    const cabecalho = ["PerfilID", "UsuarioID", "DataNascimento", "CPF", "Telefone", "DataAtualizacao"];
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets(properties(sheetId,title))" });
    const aba = (meta.data.sheets || []).find(x => x.properties.title === nomeAba);
    if (!aba) await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: nomeAba } } }] } });
    const atual = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: nomeAba + "!A1:F1" });
    if (!(atual.data.values || []).length) await sheets.spreadsheets.values.update({ spreadsheetId: SPREADSHEET_ID, range: nomeAba + "!A1:F1", valueInputOption: "RAW", requestBody: { values: [cabecalho] } });
}
function validarDadosPessoais(body) {
    const cpf = String(body?.cpf || "").replace(/\D/g, "");
    const dataNascimento = normalizar(body?.dataNascimento);
    const telefone = String(body?.telefone || "").replace(/\D/g, "");
    if (cpf.length !== 11) return { erro: "Informe um CPF com 11 dígitos." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento) || dataNascimento > new Date().toISOString().slice(0, 10)) return { erro: "Informe uma data de nascimento válida." };
    if (telefone.length < 10 || telefone.length > 11) return { erro: "Informe um telefone com DDD." };
    return { cpf, dataNascimento, telefone };
}
async function salvarPerfilCadastro(usuarioID, dados) {
    const nomeAba = "23_PERFIS_RESPONSAVEIS";
    await garantirAbaPerfilResponsaveis();
    const resposta = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: nomeAba + "!A2:F" });
    const numero = (resposta.data.values || []).reduce((maior, linha) => {
        const match = String(linha[0] || "").match(/^PER-(\d+)$/);
        return Math.max(maior, match ? Number(match[1]) : 0);
    }, 0) + 1;
    await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID, range: nomeAba + "!A:F", valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
        requestBody: { values: [[ "PER-" + String(numero).padStart(5, "0"), usuarioID, dados.dataNascimento, dados.cpf, dados.telefone, dataAtual() ]] },
    });
}

router.post("/cadastro-responsavel", somenteADM, async (req, res) => {
    try {
        const nome = normalizar(req.body?.nome);
        const email = normalizar(req.body?.email).toLowerCase();
        const senha = req.body?.senha;
        const confirmacaoSenha = req.body?.confirmacaoSenha;
        const setorID = normalizar(req.body?.setorID);
        const dadosPessoais = validarDadosPessoais(req.body);
        if (dadosPessoais.erro) return res.status(400).json({ sucesso: false, mensagem: dadosPessoais.erro });

        if (
            !nome ||
            !email ||
            !setorID ||
            typeof senha !== "string" ||
            typeof confirmacaoSenha !== "string"
        ) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "Preencha nome, e-mail, senha, confirmação e setor.",
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "E-mail inválido.",
            });
        }

        if (senha.length < 12 || senha.length > 128) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "A senha deve ter entre 12 e 128 caracteres.",
            });
        }

        if (senha !== confirmacaoSenha) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "As senhas não coincidem.",
            });
        }

        const [usuariosResp, setoresResp] = await Promise.all([
            sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: "01_USUARIOS!A2:K",
            }),
            sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID,
                range: "12_SETORES!A2:E",
            }),
        ]);

        const usuarios = usuariosResp.data.values || [];
        const setores = setoresResp.data.values || [];

        if (
            usuarios.some(
                (linha) => normalizar(linha[2]).toLowerCase() === email,
            )
        ) {
            return res.status(409).json({
                sucesso: false,
                mensagem: "Este e-mail já possui uma conta.",
            });
        }

        const indiceSetor = setores.findIndex(
            (linha) => normalizar(linha[0]) === setorID,
        );

        if (indiceSetor === -1) {
            return res.status(404).json({
                sucesso: false,
                mensagem: "Setor não encontrado.",
            });
        }

        const setor = setores[indiceSetor];

        if (normalizar(setor[4]).toUpperCase() !== "ATIVO") {
            return res.status(403).json({
                sucesso: false,
                mensagem:
                    "Não é possível cadastrar responsável em setor inativo.",
            });
        }

        if (normalizar(setor[2])) {
            return res.status(409).json({
                sucesso: false,
                mensagem: "Este setor já possui um responsável.",
            });
        }

        const usuarioID = gerarID("USR-", usuarios, /^USR-(\d+)$/);

        const salt = crypto.randomBytes(16).toString("hex");
        const senhaHash = gerarHashSenha(senha, salt);

        const metadados = await sheets.spreadsheets.get({
            spreadsheetId: SPREADSHEET_ID,
            fields: "sheets(properties(sheetId,title))",
        });

        const idsAbas = Object.fromEntries(
            (metadados.data.sheets || []).map((aba) => [
                aba.properties.title,
                aba.properties.sheetId,
            ]),
        );

        for (const nomeAba of ["01_USUARIOS", "12_SETORES"]) {
            if (idsAbas[nomeAba] === undefined) {
                throw new Error(`Aba não encontrada: ${nomeAba}`);
            }
        }

        const paraCelulas = (valores) =>
            valores.map((valor) => ({
                userEnteredValue: {
                    stringValue: String(valor ?? ""),
                },
            }));

        const valoresUsuario = [
            usuarioID,
            nome,
            email,
            senhaHash,
            salt,
            "RESPONSAVEL",
            "RESPONSAVEL",
            setorID,
            "ATIVO",
            dataAtual(),
            "",
        ];

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                requests: [
                    {
                        appendCells: {
                            sheetId: idsAbas["01_USUARIOS"],
                            rows: [
                                {
                                    values: paraCelulas(valoresUsuario),
                                },
                            ],
                            fields: "userEnteredValue",
                        },
                    },
                    {
                        updateCells: {
                            range: {
                                sheetId: idsAbas["12_SETORES"],
                                startRowIndex: indiceSetor + 1,
                                startColumnIndex: 2,
                            },
                            rows: [
                                {
                                    values: paraCelulas([usuarioID]),
                                },
                            ],
                            fields: "userEnteredValue",
                        },
                    },
                ],
            },
        });

        await salvarPerfilCadastro(usuarioID, dadosPessoais);
        return res.status(201).json({
            sucesso: true,
            mensagem: "Responsável cadastrado e vinculado ao setor.",
            usuario: {
                id: usuarioID,
                nome,
                email,
                tipoUsuario: "RESPONSAVEL",
                perfil: "RESPONSAVEL",
                setorID,
            },
        });
    } catch (erro) {
        console.error("Erro no cadastro do responsável:", erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: "Erro interno ao cadastrar responsável.",
        });
    }
});

router.post("/cadastro-secretaria", somenteADM, async (req, res) => {
    try {
        const nome = normalizar(req.body?.nome);
        const email = normalizar(req.body?.email).toLowerCase();
        const senha = req.body?.senha;
        const confirmacaoSenha = req.body?.confirmacaoSenha;
        const dadosPessoais = validarDadosPessoais(req.body);
        if (dadosPessoais.erro) return res.status(400).json({ sucesso: false, mensagem: dadosPessoais.erro });
        if (!nome || !email || typeof senha !== "string" || typeof confirmacaoSenha !== "string") return res.status(400).json({ sucesso: false, mensagem: "Preencha nome, e-mail, senha e confirmação." });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ sucesso: false, mensagem: "E-mail inválido." });
        if (senha.length < 12 || senha.length > 128) return res.status(400).json({ sucesso: false, mensagem: "A senha deve ter entre 12 e 128 caracteres." });
        if (senha !== confirmacaoSenha) return res.status(400).json({ sucesso: false, mensagem: "As senhas não coincidem." });
        const resp = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "01_USUARIOS!A2:K" });
        const usuarios = resp.data.values || [];
        if (usuarios.some(linha => normalizar(linha[2]).toLowerCase() === email)) return res.status(409).json({ sucesso: false, mensagem: "Este e-mail já possui uma conta." });
        const usuarioID = gerarID("USR-", usuarios, /^USR-(\d+)$/);
        const salt = crypto.randomBytes(16).toString("hex");
        const senhaHash = gerarHashSenha(senha, salt);
        await sheets.spreadsheets.values.append({ spreadsheetId: SPREADSHEET_ID, range: "01_USUARIOS!A:K", valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: [[usuarioID, nome, email, senhaHash, salt, "SECRETARIA", "SECRETARIA", "", "ATIVO", dataAtual(), ""]] } });
        await salvarPerfilCadastro(usuarioID, dadosPessoais);
        return res.status(201).json({ sucesso: true, mensagem: "Conta da Secretaria cadastrada.", usuario: { id: usuarioID, nome, email, tipoUsuario: "SECRETARIA", perfil: "SECRETARIA" } });
    } catch (erro) {
        console.error("Erro no cadastro da Secretaria:", erro);
        return res.status(500).json({ sucesso: false, mensagem: "Erro interno ao cadastrar a Secretaria." });
    }
});

router.get("/setores-disponiveis", somenteADM, async (req, res) => {
    try {
        const resposta = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "12_SETORES!A2:E",
        });

        const setores = (resposta.data.values || [])
            .filter(
                (linha) =>
                    normalizar(linha[4]).toUpperCase() === "ATIVO" &&
                    !normalizar(linha[2]),
            )
            .map((linha) => ({
                setorID: linha[0],
                nome: linha[1],
            }));

        res.json({ sucesso: true, setores });
    } catch (erro) {
        console.error("Erro ao consultar setores:", erro.message);
        res.status(500).json({
            sucesso: false,
            mensagem: "Não foi possível carregar os setores.",
        });
    }
});

module.exports = router;
