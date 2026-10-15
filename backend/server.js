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
const debugRoutes = require("./routes/debug");
const rateLimit = require("express-rate-limit");
const sheets = require("./database/googleSheets");
const cadastroRoutes = require("./routes/cadastro");
const produtosRoutes = require("./routes/produtos");
const reservasRoutes = require("./routes/reservas");

const secretariaRoutes = require("./routes/secretaria");
const responsavelRoutes = require("./routes/responsavel");
const emprestimosRoutes = require("./routes/emprestimos");
const professorItensRoutes = require("./routes/professorItens");

const app = express();

if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ============================================================
// MIDDLEWARES
// ============================================================

app.disable("x-powered-by");

app.use(helmet());

app.use(
    cors({
        origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000",
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
// ROTAS
// ============================================================

app.use("/api", authRoutes);
app.use("/api", cadastroRoutes);
app.use("/api", produtosRoutes);
app.use("/api", reservasRoutes);
app.use("/api", secretariaRoutes);
app.use("/api", emprestimosRoutes);
app.use("/api", responsavelRoutes);
app.use("/api", professorItensRoutes);
app.use("/api", debugRoutes);

// ============================================================
// TESTE DO GOOGLE SHEETS
// ============================================================

app.get("/api/teste-planilha", async (req, res) => {
    console.log("Rota /api/teste-planilha acessada");

    try {
        if (!SPREADSHEET_ID) {
            return res.status(500).json({
                sucesso: false,
                erro: "SPREADSHEET_ID não foi encontrado no arquivo .env",
            });
        }

        const resposta = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "01_USUARIOS!A1:K5",
        });

        res.json({
            sucesso: true,
            mensagem: "Conexão com o Google Sheets funcionando!",
            aba: "01_USUARIOS",
            dados: resposta.data.values || [],
        });
    } catch (erro) {
        console.error("Erro ao acessar o Google Sheets:");
        console.error(erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
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
