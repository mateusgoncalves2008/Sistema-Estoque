const express = require("express");
const crypto = require("crypto");

const router = express.Router();

const sheets = require("../database/googleSheets");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ======================================================
// FUNÇÃO PARA GERAR O HASH DA SENHA
// ======================================================

const SCRYPT_OPCOES = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function gerarHashSenha(senha, salt) {
    const derivada = crypto.scryptSync(senha, salt, 64, SCRYPT_OPCOES).toString("hex");
    return `scrypt$16384$8$1${derivada}`;
}

function verificarHashSenha(senha, salt, hashArmazenado) {
    if (String(hashArmazenado).startsWith("scrypt$")) {
        const partes = String(hashArmazenado).split("$");
        if (partes.length !== 5 || partes[1] !== "16384" || partes[2] !== "8" || partes[3] !== "1") {
            return false;
        }

        const hashBuffer = Buffer.from(partes[4], "hex");
        const hashDigitado = crypto.scryptSync(senha, salt, 64, SCRYPT_OPCOES);
        return hashBuffer.length === hashDigitado.length &&
            crypto.timingSafeEqual(hashBuffer, hashDigitado);
    }

    // Compatibilidade temporária com contas antigas; elas são migradas após login válido.
    const hashLegado = crypto.createHash("sha256").update(`${salt}:${senha}`).digest("hex");
    const legadoBuffer = Buffer.from(hashLegado, "hex");
    const armazenadoBuffer = Buffer.from(String(hashArmazenado), "hex");
    return legadoBuffer.length === armazenadoBuffer.length &&
        legadoBuffer.length > 0 &&
        crypto.timingSafeEqual(legadoBuffer, armazenadoBuffer);
}

// ======================================================
// POST /api/login
// ======================================================

router.post("/login", async (req, res) => {
    try {
        const { email, senha } = req.body || {};

        if (
            typeof email !== "string" ||
            typeof senha !== "string" ||
            !email.trim() ||
            !senha
        ) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "E-mail e senha são obrigatórios.",
            });
        }

        if (!SPREADSHEET_ID) {
            return res.status(500).json({
                sucesso: false,
                mensagem: "Planilha não configurada no servidor.",
            });
        }

        const resposta = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "01_USUARIOS!A2:K",
        });

        const usuarios = resposta.data.values || [];
        const emailNormalizado = email.trim().toLowerCase();

        const usuario = usuarios.find((linha) => {
            const emailPlanilha = String(linha[2] || "")
                .trim()
                .toLowerCase();

            return emailPlanilha === emailNormalizado;
        });

        if (!usuario) {
            return res.status(401).json({
                sucesso: false,
                mensagem: "E-mail ou senha incorretos.",
            });
        }

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
        ] = usuario;

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

        if (!senhaHash || !salt) {
            return res.status(401).json({
                sucesso: false,
                mensagem: "E-mail ou senha incorretos.",
            });
        }

        const senhaHashValida = verificarHashSenha(senha, salt, senhaHash);

        if (!senhaHashValida) {
            return res.status(401).json({
                sucesso: false,
                mensagem: "E-mail ou senha incorretos.",
            });
        }

        // Migra contas antigas para scrypt após um login válido, sem exigir redefinição de senha.
        if (!String(senhaHash).startsWith("scrypt$")) {
            try {
                const novoHash = gerarHashSenha(senha, salt);
                const linhaPlanilha = usuarios.findIndex((linha) => linha === usuario) + 2;
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `01_USUARIOS!D${linhaPlanilha}:E${linhaPlanilha}`,
                    valueInputOption: "RAW",
                    requestBody: { values: [[novoHash, salt]] },
                });
            } catch (erroMigracao) {
                console.error("Não foi possível atualizar o hash legado da senha.");
            }
        }

        // Cria uma sessão nova após validar as credenciais.
        await new Promise((resolve, reject) => {
            req.session.regenerate((erro) => {
                if (erro) return reject(erro);
                resolve();
            });
        });

        req.session.usuario = {
            id: String(usuarioID),
            nome: nome || "",
            email: emailUsuario || "",
            tipoUsuario: tipoUsuario || "",
            perfil: perfil || "",
            setorID: setorID || null,
        };

        // Garante que a sessão seja salva antes de responder.
        await new Promise((resolve, reject) => {
            req.session.save((erro) => {
                if (erro) return reject(erro);
                resolve();
            });
        });

        return res.json({
            sucesso: true,
            mensagem: "Login realizado com sucesso.",
            usuario: req.session.usuario,
        });
    } catch (erro) {
        console.error("Erro no login:", erro.message);

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
        const sessao = req.session?.usuario;

        if (!sessao) {
            return res.status(401).json({
                sucesso: false,
                mensagem: "Faça login para consultar seu perfil.",
            });
        }

        if (!usuarioID) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "UsuarioID não informado.",
            });
        }

        if (String(sessao.id || "").trim() !== String(usuarioID).trim()) {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Você só pode consultar o próprio perfil.",
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

/* GET /api/professor/perfil/:usuarioID */
router.get("/professor/perfil/:usuarioID", async (req, res) => {
    try {
        const { usuarioID } = req.params;
        const sessao = req.session?.usuario;

        if (!sessao) {
            return res.status(401).json({
                sucesso: false,
                mensagem: "Faça login para consultar seu perfil.",
            });
        }

        if (!usuarioID) {
            return res.status(400).json({
                sucesso: false,
                mensagem: "UsuarioID não informado.",
            });
        }

        if (String(sessao.id || "").trim() !== String(usuarioID).trim()) {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Você só pode consultar o próprio perfil.",
            });
        }

        // Buscar usuário
        const respostaUsuarios = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "01_USUARIOS!A2:K",
        });

        const usuarios = respostaUsuarios.data.values || [];

        const usuario = usuarios.find(
            (linha) =>
                String(linha[0] || "").trim() === String(usuarioID).trim(),
        );

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
        ] = usuario;

        if (
            String(tipoUsuario || "")
                .trim()
                .toUpperCase() !== "PROFESSOR"
        ) {
            return res.status(403).json({
                sucesso: false,
                mensagem: "Este usuário não é um professor.",
            });
        }

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

        // Buscar cadastro autorizado
        const respostaCadastros = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "17_CADASTROS_AUTORIZADOS!A2:J",
        });

        const cadastros = respostaCadastros.data.values || [];

        const cadastro = cadastros.find(
            (linha) =>
                String(linha[3] || "").trim() === String(usuarioID).trim() &&
                String(linha[1] || "")
                    .trim()
                    .toUpperCase() === "PROFESSOR" &&
                String(linha[9] || "")
                    .trim()
                    .toUpperCase() === "CADASTRADO",
        );

        if (!cadastro) {
            return res.status(404).json({
                sucesso: false,
                mensagem: "Cadastro autorizado do professor não encontrado.",
            });
        }

        return res.json({
            sucesso: true,
            professor: {
                usuarioID: id || "",
                nome: nome || cadastro[4] || "",
                idade: cadastro[8] || "",
                masp: cadastro[2] || "",
                email: email || "",
            },
        });
    } catch (erro) {
        console.error("Erro ao buscar perfil do professor:", erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: "Erro interno ao buscar perfil do professor.",
        });
    }
});

router.post("/logout", (req, res) => {
    if (!req.session) {
        return res.json({ sucesso: true });
    }

    req.session.destroy((erro) => {
        if (erro) {
            return res.status(500).json({
                sucesso: false,
                mensagem: "Não foi possível encerrar a sessão.",
            });
        }

        res.clearCookie("hauy.sid", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
        });

        return res.json({
            sucesso: true,
            mensagem: "Logout realizado com sucesso.",
        });
    });
});

module.exports = router;
