const dotenv = require("dotenv");
const path = require("path");

dotenv.config({
    path: path.join(__dirname, ".env"),
});

const cors = require("cors");
const express = require("express");

const helmet = require("helmet");
const session = require("express-session");
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const rateLimit = require("express-rate-limit");
const sheets = require("./database/googleSheets");
const postgres = require("./database/postgres");
const cadastroRoutes = require("./routes/cadastro");
const produtosRoutes = require("./routes/produtos");
const reservasRoutes = require("./routes/reservas");

const secretariaRoutes = require("./routes/secretaria");
const responsavelRoutes = require("./routes/responsavel");
const bloqueiosDenunciasRoutes = require("./routes/bloqueios-denuncias");
const emprestimosRoutes = require("./routes/emprestimos");
const professorItensRoutes = require("./routes/professorItens");
const chatRoutes = require("./routes/chat");
const { registrarAuditoria } = require("./services/auditoria");

const app = express();

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ============================================================
// MIDDLEWARES
// ============================================================

app.disable("x-powered-by");

app.use(helmet());

const frontendOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

if (process.env.NODE_ENV === "production" && !process.env.FRONTEND_ORIGIN) {
    throw new Error("FRONTEND_ORIGIN precisa estar configurado em produção.");
}

app.use(
    cors({
        origin: frontendOrigin,
        credentials: true,
    }),
);

app.use(express.json({ limit: "100kb" }));

if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET não configurado no .env");
}

app.use(
    session({
        name: "hauy.sid",
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 30 * 60 * 1000,
        },
    }),
);

// Mede o tempo das consultas usadas pelo painel do Professor.
// Os caminhos são normalizados para não registrar IDs de usuários nos logs.
app.use((req, res, next) => {
    const caminho = String(req.path || "").split("?")[0];
    const metodo = String(req.method || "").toUpperCase();
    const acompanhar =
        metodo === "GET" &&
        (
            caminho.startsWith("/api/professor/") ||
            caminho === "/api/avisos" ||
            caminho === "/api/avisos/leituras"
        );

    if (!acompanhar) return next();

    const inicio = process.hrtime.bigint();
    const rota = caminho
        .replace(/\/api\/professor\/reservas\/[^/]+/, "/api/professor/reservas/:usuarioID")
        .replace(/\/api\/professor\/emprestimos\/[^/]+/, "/api/professor/emprestimos/:usuarioID")
        .replace(/\/api\/professor\/historico(?:-emprestimos)?\/[^/]+/, "/api/professor/historico/:usuarioID")
        .replace(/\/api\/professor\/perfil\/[^/]+/, "/api/professor/perfil/:usuarioID");

    res.on("finish", () => {
        const duracaoMs = Number(process.hrtime.bigint() - inicio) / 1e6;
        console.info(
            `[TEMPO PROFESSOR] ${metodo} ${rota} status=${res.statusCode} duracao=${duracaoMs.toFixed(0)}ms`,
        );
    });

    next();
});

// ============================================================
// AUDITORIA AUTOMÁTICA DAS OPERAÇÕES
// ============================================================

app.use((req, res, next) => {
    const metodo = String(req.method || "").toUpperCase();
    const caminho = String(req.path || "").split("?")[0];
    const registrar = ["POST", "PUT", "PATCH", "DELETE"].includes(metodo);
    if (!registrar || !caminho.startsWith("/api/")) return next();
    if (caminho.includes("/verificar-matricula") || caminho.endsWith("/teste") || caminho.endsWith("/teste-planilha")) return next();

    const usuarioAntes = req.session?.usuario || null;
    let corpoResposta = null;
    const jsonOriginal = res.json.bind(res);
    res.json = (corpo) => { corpoResposta = corpo; return jsonOriginal(corpo); };

    res.on("finish", () => {
        const usuarioDepois = req.session?.usuario || corpoResposta?.usuario || null;
        const statusHTTP = Number(res.statusCode || 500);
        const resultado = statusHTTP >= 200 && statusHTTP < 400 ? "SUCESSO" : "ERRO";
        const segmentos = caminho.replace("/api/", "").split("/").filter(Boolean);
        const rota = segmentos[0] || "sistema";
        const recurso = rota === "secretaria" ? (segmentos[1] || rota) : rota;
        let tabela = "";
        if (caminho.endsWith("/login") || caminho.includes("/cadastro") || caminho.includes("/usuarios") || caminho.includes("/alunos") || caminho.includes("/professores") || caminho.includes("/perfil")) tabela = "01_USUARIOS";
        else if (caminho.includes("autorizar-matricula")) tabela = "17_CADASTROS_AUTORIZADOS";
        else if (caminho.includes("autorizar-responsavel")) tabela = "18_AUTORIZACOES_RESPONSAVEIS";
        else if (caminho.includes("professor-turmas")) tabela = "21_PROFESSOR_TURMAS";
        else if (caminho.includes("reserva")) tabela = "08_RESERVAS";
        else if (caminho.includes("devolu")) tabela = "10_DEVOLUCOES";
        else if (caminho.includes("emprestimo")) tabela = "09_EMPRESTIMOS";
        else if (caminho.includes("/responsavel/itens")) tabela = "02_PRODUTOS + 06_ESTOQUE_LOCAIS";
        else if (caminho.includes("produto") || caminho.includes("acervo") || caminho.includes("estoque") || caminho.includes("/itens")) tabela = "02_PRODUTOS";
        else if (caminho.includes("bloqueio")) tabela = "22_BLOQUEIOS_SETOR";
        else if (caminho.includes("denuncia")) tabela = "23_DENUNCIAS_SECRETARIA";
        else if (caminho.includes("calendario") || caminho.includes("evento")) tabela = "18_CALENDARIO_ESCOLAR";
        else if (caminho.includes("turma")) tabela = "19_TURMAS";
        else if (caminho.includes("disciplina")) tabela = "20_DISCIPLINAS";
        else if (caminho.includes("setor")) tabela = "12_SETORES";
        else if (caminho.includes("aviso") || caminho.includes("comunicacao")) tabela = "24_AVISOS_SISTEMA";
        else tabela = rota.toUpperCase();

        let acao;
        if (caminho.endsWith("/login")) acao = "LOGIN";
        else if (caminho.endsWith("/logout")) acao = "LOGOUT";
        else if (caminho.includes("reservas") && caminho.endsWith("/aprovar")) acao = "APROVAR_RESERVA";
        else if (caminho.includes("reservas") && caminho.endsWith("/cancelar")) acao = "CANCELAR_RESERVA";
        else if (caminho.includes("reservas") && caminho.endsWith("/recusar")) acao = "RECUSAR_RESERVA";
        else if (caminho.includes("reservas") && metodo === "POST") acao = "CRIAR_RESERVA";
        else if (caminho.includes("cadastro") || caminho.includes("usuarios") || caminho.includes("alunos") || caminho.includes("professores")) acao = "CRIAR_USUARIO";
        else if (caminho.includes("status")) acao = "ALTERAR_STATUS";
        else if (caminho.includes("bloqueio")) acao = caminho.includes("desbloquear") ? "DESBLOQUEAR_SETOR" : metodo === "POST" ? "CRIAR_BLOQUEIO" : "ALTERAR_BLOQUEIO";
        else if (caminho.includes("denuncia")) acao = metodo === "POST" ? "CRIAR_DENUNCIA" : "RESPONDER_DENUNCIA";
        else if (caminho.includes("calendario")) acao = metodo === "POST" ? "CRIAR_EVENTO_CALENDARIO" : "ALTERAR_EVENTO_CALENDARIO";
        else if (caminho.includes("emprestimo")) acao = metodo === "POST" ? "CRIAR_EMPRESTIMO" : "ALTERAR_EMPRESTIMO";
        else if (caminho.includes("devolu")) acao = metodo === "POST" ? "REGISTRAR_DEVOLUCAO" : "ALTERAR_DEVOLUCAO";
        else acao = (metodo === "POST" ? "CRIAR_" : metodo === "DELETE" ? "EXCLUIR_" : "ALTERAR_") + recurso.replace(/[^a-z0-9]/gi, "_").toUpperCase();
        const registroID = corpoResposta?.registroID || corpoResposta?.reservaID || corpoResposta?.emprestimoID || corpoResposta?.produtoID || corpoResposta?.usuarioID || corpoResposta?.usuario?.id || corpoResposta?.produto?.produtoID || corpoResposta?.id || usuarioDepois?.id || req.params?.id || req.params?.usuarioID || req.params?.reservaID || req.params?.turmaID || req.body?.registroID || req.body?.reservaID || req.body?.emprestimoID || req.body?.produtoID || req.body?.usuarioID || "";
        const nomeUsuario = String(usuarioDepois?.nome || usuarioAntes?.nome || "").trim();
        const descricao = caminho.endsWith("/login")
            ? (resultado === "SUCESSO" && nomeUsuario ? "Login realizado por " + nomeUsuario : "Tentativa de login sem sucesso")
            : caminho.endsWith("/logout")
                ? (nomeUsuario ? "Logout realizado por " + nomeUsuario : "Sessão encerrada")
                : nomeUsuario
                    ? nomeUsuario + " realizou a ação " + acao.replace(/_/g, " ").toLowerCase()
                    : "Ação " + acao.replace(/_/g, " ").toLowerCase() + (resultado === "SUCESSO" ? " realizada com sucesso" : " não realizada");
        void registrarAuditoria({ usuarioID: usuarioDepois?.id || usuarioAntes?.id || "", acao, tabela, registroID, descricao, resultado });
    });
    next();
});

// ============================================================
// SITE (FRONTEND)
// ============================================================
// Telas do site (pasta frontend)
app.use("/frontend", express.static(path.join(__dirname, "../frontend")));

app.use(
    "/icons",
    express.static(path.join(__dirname, "../node_modules/lucide-static/font")),
);

app.use(
    "/lucide",
    express.static(path.join(__dirname, "../node_modules/lucide/dist/umd")),
);

// Página inicial (index.html da raiz do projeto)
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../index.html"));
});

// ============================================================
// LIMITAR TENTATIVAS DE LOGIN
// ============================================================

app.use(
    "/api/login",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: {
            sucesso: false,
            mensagem: "Muitas tentativas de login. Aguarde 15 minutos e tente novamente.",
        },
    }),
);

// Limita tentativas de verificação/cadastro para reduzir enumeração e abuso.
const cadastroLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        sucesso: false,
        mensagem: "Muitas tentativas. Aguarde 15 minutos e tente novamente.",
    },
});

app.use("/api/verificar-matricula", cadastroLimiter);
app.use("/api/cadastro", cadastroLimiter);

// ============================================================
// ROTAS
// ============================================================

app.use("/api", authRoutes);
app.use("/api", adminRoutes);
app.use("/api", cadastroRoutes);
app.use("/api", produtosRoutes);
app.use("/api", reservasRoutes);
app.use("/api", secretariaRoutes);
app.use("/api", emprestimosRoutes);
app.use("/api", responsavelRoutes);
app.use("/api", bloqueiosDenunciasRoutes);
app.use("/api", professorItensRoutes);
app.use("/api", chatRoutes);

// ============================================================
// TESTE DO GOOGLE SHEETS
// ============================================================

app.get("/api/teste-planilha", async (req, res) => {
    const usuario = req.session?.usuario;
    const tipo = String(usuario?.tipoUsuario || "").trim().toUpperCase();
    const perfil = String(usuario?.perfil || "").trim().toUpperCase();
    const administradores = ["ADM", "ADMIN", "ADMINISTRADOR"];

    if (
        !usuario ||
        (!administradores.includes(tipo) && !administradores.includes(perfil))
    ) {
        return res.status(usuario ? 403 : 401).json({
            sucesso: false,
            mensagem: usuario
                ? "Acesso permitido somente ao administrador."
                : "Faça login para testar a conexão com a planilha.",
        });
    }

    try {
        if (!SPREADSHEET_ID) {
            return res.status(500).json({
                sucesso: false,
                mensagem: "A planilha não está configurada no servidor.",
            });
        }

        // Lê apenas uma célula para testar a conexão. Nunca devolve
        // dados pessoais, hashes de senha ou salts da aba de usuários.
        await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "01_USUARIOS!A1",
        });

        return res.json({
            sucesso: true,
            mensagem: "Conexão com o Google Sheets funcionando.",
        });
    } catch (erro) {
        console.error("Erro ao testar conexão com o Google Sheets:", erro.message);

        return res.status(500).json({
            sucesso: false,
            mensagem: "Não foi possível acessar a planilha.",
        });
    }
});

// ============================================================
// TESTE DO POSTGRESQL (NEON)
// ============================================================

app.get("/api/teste-banco", async (req, res) => {
    const usuario = req.session?.usuario;
    const tipo = String(usuario?.tipoUsuario || "").trim().toUpperCase();
    const perfil = String(usuario?.perfil || "").trim().toUpperCase();
    const administradores = ["ADM", "ADMIN", "ADMINISTRADOR"];

    if (
        !usuario ||
        (!administradores.includes(tipo) && !administradores.includes(perfil))
    ) {
        return res.status(usuario ? 403 : 401).json({
            sucesso: false,
            mensagem: usuario
                ? "Acesso permitido somente ao administrador."
                : "Faça login para testar a conexão com o banco.",
        });
    }

    try {
        const conectado = await postgres.testarConexao();

        if (!conectado) {
            return res.status(500).json({
                sucesso: false,
                mensagem: "O banco respondeu, mas o teste não foi confirmado.",
            });
        }

        return res.json({
            sucesso: true,
            mensagem: "Conexão com o PostgreSQL funcionando.",
        });
    } catch (erro) {
        const semConfiguracao = erro.code === "DATABASE_URL_MISSING";
        console.error(
            "Erro ao testar PostgreSQL:",
            semConfiguracao ? "DATABASE_URL ausente." : (erro.code || "falha de conexão"),
        );

        return res.status(semConfiguracao ? 503 : 500).json({
            sucesso: false,
            mensagem: semConfiguracao
                ? "O banco de dados não está configurado no servidor."
                : "Não foi possível conectar ao PostgreSQL.",
        });
    }
});

// ============================================================
// TESTE DO SERVIDOR
// ============================================================

app.get("/api/teste", (req, res) => {
    res.json({
        sucesso: true,
        mensagem: "Servidor Express funcionando corretamente!",
    });
});

// ============================================================
// INICIAR SERVIDOR
// ============================================================

// Só abre a porta quando o arquivo é executado diretamente
// (local ou Render). Na Vercel, o app é apenas exportado.
if (require.main === module) {
    app.listen(PORT, () => {
        console.log("");
        console.log("==========================================");
        console.log(" SISTEMA DE ESTOQUE HAUY");
        console.log("==========================================");
        console.log(`Servidor: http://localhost:${PORT}`);
        console.log(`Planilha configurada: ${SPREADSHEET_ID ? "SIM" : "NÃO"}`);
        console.log(`PostgreSQL configurado: ${process.env.DATABASE_URL ? "SIM" : "NÃO"}`);
        console.log("Rotas de reservas: CONECTADAS");
        console.log("==========================================");
        console.log("");
    });
}

module.exports = app;
