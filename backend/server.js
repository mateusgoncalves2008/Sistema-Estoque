const dotenv = require("dotenv");
const path = require("path");

dotenv.config({
    path: path.join(__dirname, ".env"),
});

const express = require("express");
const cors = require("cors");

const sheets = require("./database/googleSheets");

const authRoutes = require("./routes/auth");
const cadastroRoutes = require("./routes/cadastro");
const produtosRoutes = require("./routes/produtos");
const reservasRoutes = require("./routes/reservas");
const secretariaRoutes = require("./routes/secretaria");

const app = express();

const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ============================================================
// MIDDLEWARES
// ============================================================

app.use(cors());
app.use(express.json());

// ============================================================
// SITE (FRONTEND)
// ============================================================

// Telas do site (pasta frontend)
app.use("/frontend", express.static(path.join(__dirname, "../frontend")));

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

// ============================================================
// TESTE DO GOOGLE SHEETS
// ============================================================

app.get("/api/teste-planilha", async (req, res) => {
    console.log("➡️ Rota /api/teste-planilha acessada");

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
        console.error("❌ Erro ao acessar o Google Sheets:");
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
