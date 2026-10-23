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
const cadastroRoutes = require("./routes/cadastro");
const produtosRoutes = require("./routes/produtos");
const reservasRoutes = require("./routes/reservas");

const secretariaRoutes = require("./routes/secretaria");
const responsavelRoutes = require("./routes/responsavel");
const bloqueiosDenunciasRoutes = require("./routes/bloqueios-denuncias");
const emprestimosRoutes = require("./routes/emprestimos");
const professorItensRoutes = require("./routes/professorItens");
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
        let tabela = "";
        if (caminho.includes("/login") || caminho.includes("/cadastro")) tabela = "01_USUARIOS";
        else if (caminho.includes("reserva")) tabela = "08_RESERVAS";
        else if (caminho.includes("emprestimo") || caminho.includes("devolu")) tabela = "09_EMPRESTIMOS";
        else if (caminho.includes("produto") || caminho.includes("acervo") || caminho.includes("estoque")) tabela = "02_PRODUTOS";
        else if (caminho.includes("bloqueio")) tabela = "22_BLOQUEIOS_SETOR";
        else if (caminho.includes("denuncia")) tabela = "23_DENUNCIAS_SECRETARIA";
        else if (caminho.includes("calendario") || caminho.includes("evento")) tabela = "18_CALENDARIO_ESCOLAR";
        else if (caminho.includes("turma")) tabela = "19_TURMAS";
        else if (caminho.includes("disciplina")) tabela = "20_DISCIPLINAS";
        else if (caminho.includes("setor")) tabela = "12_SETORES";
        else if (caminho.includes("aviso") || caminho.includes("comunicacao")) tabela = "15_COMUNICACOES_ESTOQUE";
        else if (caminho.includes("usuario") || caminho.includes("perfil")) tabela = "01_USUARIOS";
        else tabela = rota.toUpperCase();

        const acao = caminho.endsWith("/login") ? "LOGIN"
            : caminho.endsWith("/logout") ? "LOGOUT"
            : (metodo === "POST" ? "CRIAR_" : metodo === "DELETE" ? "EXCLUIR_" : "ALTERAR_") + rota.replace(/[^a-z0-9]/gi, "_").toUpperCase();
        const registroID = corpoResposta?.registroID || corpoResposta?.reservaID || corpoResposta?.emprestimoID || corpoResposta?.produtoID || corpoResposta?.usuarioID || corpoResposta?.id || req.params?.id || req.body?.registroID || req.body?.reservaID || req.body?.emprestimoID || req.body?.produtoID || req.body?.usuarioID || "";
        const descricao = metodo + " " + caminho + " — HTTP " + statusHTTP;
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
        console.log("Rotas de reservas: CONECTADAS");
        console.log("==========================================");
        console.log("");
    });
}

module.exports = app;
