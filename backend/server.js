const dotenv = require("dotenv");
const path = require("path");

dotenv.config({
    path: path.join(__dirname, ".env"),
});

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const cadastroRoutes = require("./routes/cadastro");

const sheets = require("./database/googleSheets");

const app = express();

const PORT = process.env.PORT || 3000;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

app.use(cors());
app.use(express.json());

app.use("/api", authRoutes);
app.use("/api", cadastroRoutes);

console.log(">>> ROTAS DE CADASTRO CONECTADAS AO EXPRESS <<<");

// ================================
// ROTA PRINCIPAL
// ================================

app.get("/", (req, res) => {
    res.json({
        sistema: "Sistema de Estoque - Escola Hauy Petruceli Mayrink",
        status: "online",
    });
});

// ================================
// TESTE DO GOOGLE SHEETS
// ================================

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

// ================================
// ROTA DE TESTE DO SERVIDOR
// ================================

app.get("/api/teste", (req, res) => {
    res.json({
        sucesso: true,
        mensagem: "Servidor Express funcionando corretamente!",
    });
});

// ================================
// INICIAR SERVIDOR
// ================================

app.listen(PORT, () => {
    console.log("");
    console.log("==========================================");
    console.log(" SISTEMA DE ESTOQUE HAUY");
    console.log("==========================================");
    console.log(`Servidor: http://localhost:${PORT}`);
    console.log(`Planilha configurada: ${SPREADSHEET_ID ? "SIM" : "NÃO"}`);
    console.log("==========================================");
    console.log("");
});
