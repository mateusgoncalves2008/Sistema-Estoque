const express = require("express");
const crypto = require("crypto");

const router = express.Router();

const sheets = require("../database/googleSheets");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ======================================================
// FUNÇÃO PARA GERAR O HASH DA SENHA
// ======================================================

function gerarHashSenha(senha, salt) {
    return crypto.createHash("sha256").update(`${salt}:${senha}`).digest("hex");
}

// ======================================================
// POST /api/login
// ======================================================

router.post("/login", async (req, res) => {
    try {
        const { email, senha } = req.body;

        // ----------------------------------------------
        // VALIDAÇÃO
        // ----------------------------------------------

        if (!email || !senha) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "E-mail e senha são obrigatórios.",
            });
        }

        // ----------------------------------------------
        // BUSCAR USUÁRIOS
        // ----------------------------------------------

        const resposta = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "01_USUARIOS!A2:K",
        });

        const usuarios = resposta.data.values || [];

        // ----------------------------------------------
        // PROCURAR USUÁRIO PELO E-MAIL
        // ----------------------------------------------

        const emailNormalizado = email.trim().toLowerCase();

        const usuario = usuarios.find((linha) => {
            const emailPlanilha = (linha[2] || "").trim().toLowerCase();

            return emailPlanilha === emailNormalizado;
        });

        // ----------------------------------------------
        // USUÁRIO NÃO ENCONTRADO
        // ----------------------------------------------

        if (!usuario) {
            return res.status(401).json({
                sucesso: false,
                mensagem: "E-mail ou senha inválidos.",
            });
        }

        // ----------------------------------------------
        // CAMPOS DA PLANILHA
        // ----------------------------------------------

        const [
            usuarioID,
            nome,
            emailUsuario,
            senhaHash,
            salt,
            tipoUsuario,
            perfil,
            setorID,
            status,
            dataCadastro,
            ultimoLogin,
        ] = usuario;

        // ----------------------------------------------
        // VERIFICAR STATUS
        // ----------------------------------------------

        if (status !== "ATIVO") {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Este usuário está inativo.",
            });
        }

        // ----------------------------------------------
        // GERAR HASH DA SENHA DIGITADA
        // ----------------------------------------------

        const hashDigitado = gerarHashSenha(senha, salt);

        // ----------------------------------------------
        // COMPARAR HASH
        // ----------------------------------------------

        if (hashDigitado !== senhaHash) {
            return res.status(401).json({
                sucesso: false,
                mensagem: "E-mail ou senha inválidos.",
            });
        }

        // ----------------------------------------------
        // LOGIN CORRETO
        // ----------------------------------------------

        return res.json({
            sucesso: true,

            mensagem: "Login realizado com sucesso.",

            usuario: {
                id: usuarioID,
                nome: nome,
                email: emailUsuario,
                tipoUsuario: tipoUsuario,
                perfil: perfil,
                setorID: setorID || null,
            },
        });
    } catch (erro) {
        console.error("Erro no login:");
        console.error(erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: "Erro interno no servidor.",
        });
    }
});

// ======================================================
// GET /api/aluno/perfil/:usuarioID
// ======================================================

router.get("/aluno/perfil/:usuarioID", async (req, res) => {
    try {
        const { usuarioID } = req.params;

        if (!usuarioID) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "UsuarioID não informado.",
            });
        }

        // ==================================================
        // BUSCAR USUÁRIO
        // ==================================================

        const respostaUsuarios = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "01_USUARIOS!A2:K",
        });

        const usuarios = respostaUsuarios.data.values || [];

        const usuario = usuarios.find((linha) => {
            return String(linha[0] || "").trim() === String(usuarioID).trim();
        });

        if (!usuario) {
            return res.status(404).json({
                sucesso: false,
                mensagem: "Usuário não encontrado.",
            });
        }

        const [
            id,
            nome,
            email,
            senhaHash,
            salt,
            tipoUsuario,
            perfil,
            setorID,
            status,
            dataCadastro,
            ultimoLogin,
        ] = usuario;

        // ==================================================
        // VERIFICAR SE É ALUNO
        // ==================================================

        if (
            String(tipoUsuario || "")
                .trim()
                .toUpperCase() !== "ALUNO"
        ) {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Este usuário não possui acesso ao perfil de aluno.",
            });
        }

        // ==================================================
        // VERIFICAR STATUS
        // ==================================================

        if (
            String(status || "")
                .trim()
                .toUpperCase() !== "ATIVO"
        ) {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Este usuário está inativo.",
            });
        }

        // ==================================================
        // BUSCAR DADOS ACADÊMICOS
        // ==================================================

        const respostaAutorizacoes = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "17_CADASTROS_AUTORIZADOS!A2:J",
        });

        const autorizacoes = respostaAutorizacoes.data.values || [];

        const autorizacao = autorizacoes.find((linha) => {
            const usuarioAutorizado = String(linha[3] || "").trim();

            return usuarioAutorizado === String(usuarioID).trim();
        });

        if (!autorizacao) {
            return res.status(404).json({
                sucesso: false,
                mensagem: "Dados acadêmicos do aluno não encontrados.",
            });
        }

        const [
            autorizacaoID,
            tipoAutorizacao,
            identificador,
            usuarioAutorizado,
            nomeAutorizado,
            ano,
            turma,
            turno,
            idade,
            statusAutorizacao,
        ] = autorizacao;

        // ==================================================
        // RESPOSTA
        // ==================================================

        return res.json({
            sucesso: true,

            aluno: {
                usuarioID: id || "",
                nome: nome || nomeAutorizado || "",
                idade: idade || "",
                ano: ano || "",
                turma: turma || "",
                turno: turno || "",
                email: email || "",
                tipoUsuario: tipoUsuario || "",
                perfil: perfil || "",
                matricula: identificador || "",
                status: status || "",
            },
        });
    } catch (erro) {
        console.error("Erro ao buscar perfil do aluno:");
        console.error(erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: "Erro interno ao buscar perfil do aluno.",
        });
    }
});

module.exports = router;
