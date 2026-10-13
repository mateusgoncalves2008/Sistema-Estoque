const express = require("express");
const crypto = require("crypto");

const router = express.Router();
const sheets = require("../database/googleSheets");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

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
    return crypto.createHash("sha256").update(`${salt}:${senha}`).digest("hex");
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
    console.log(">>> REQUISIÇÃO DE VERIFICAÇÃO RECEBIDA <<<");

    try {
        console.log("1. Lendo dados enviados pelo navegador...");

        const { matricula } = req.body;

        console.log("2. Matrícula recebida:", matricula);

        if (!matricula) {
            console.log("3. Matrícula não informada.");

            return res.status(400).json({
                sucesso: false,
                mensagem: "Matrícula é obrigatória.",
            });
        }

        const identificador = String(matricula).trim();

        console.log("4. Identificador normalizado:", identificador);
        console.log("5. SPREADSHEET_ID existe?", !!SPREADSHEET_ID);

        console.log("6. Consultando Google Sheets...");

        const resposta = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "17_CADASTROS_AUTORIZADOS!A2:J",
        });

        console.log("7. Google Sheets respondeu.");

        const autorizacoes = resposta.data.values || [];

        console.log(
            "8. Quantidade de registros encontrados:",
            autorizacoes.length,
        );

        const registro = autorizacoes.find((linha) => {
            const identificadorPlanilha = String(linha[2] || "").trim();

            return identificadorPlanilha === identificador;
        });

        console.log("9. Registro encontrado?", !!registro);

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

        console.log("11. Dados encontrados:", {
            autorizacaoID,
            tipo,
            identificadorEncontrado,
            status,
        });

        if (status === "CADASTRADO") {
            console.log("12. Matrícula já cadastrada.");

            return res.status(409).json({
                sucesso: false,
                mensagem: "Esta matrícula já possui uma conta cadastrada.",
            });
        }

        if (status !== "PENDENTE") {
            console.log("13. Status não permitido:", status);

            return res.status(403).json({
                sucesso: false,
                mensagem: "Esta matrícula não está disponível para cadastro.",
            });
        }

        console.log("14. Matrícula autorizada.");

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

        console.log("15. Enviando resposta para o navegador.");

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

        console.log(">>> INICIANDO CADASTRO <<<");
        console.log("Dados recebidos:", {
            matricula,
            nome,
            ano,
            turma,
            turno,
            idade,
            email,
            tipo,
        });

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
            if (!ano || !turma || !turno) {
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

        console.log("Nova linha 01_USUARIOS:", {
            usuarioID,
            nomeNormalizado,
            emailNormalizado,
            tipoNormalizado,
        });

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

        console.log("Usuário criado:", usuarioID);

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
                        ano || "", // F - Ano
                        turma || "", // G - Turma
                        turno || "", // H - Turno
                        idade || "", // I - Idade
                        "CADASTRADO", // J - Status
                    ],
                ],
            },
        });

        console.log(
            "Autorização atualizada:",
            autorizacaoID,
            "→",
            usuarioID,
            "→ CADASTRADO",
        );

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

console.log(">>> CADASTRO.JS FOI CARREGADO <<<");
console.log(">>> ROTA /verificar-matricula REGISTRADA <<<");

module.exports = router;
