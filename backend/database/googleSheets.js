const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");

const caminhoLocal = path.join(__dirname, "..", "google-credentials.json");

const caminhoRender = "/etc/secrets/google-credentials.json";

let authConfig;

if (process.env.GOOGLE_CREDENTIALS) {
    // Vercel: a credencial vem de uma variável de ambiente
    let credentials;

    try {
        credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    } catch (erro) {
        throw new Error(
            "A variável GOOGLE_CREDENTIALS não é um JSON válido: " +
                erro.message,
        );
    }

    if (credentials.private_key) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }

    authConfig = { credentials };
} else if (fs.existsSync(caminhoRender)) {
    // Render: Secret File
    authConfig = { keyFile: caminhoRender };
} else if (fs.existsSync(caminhoLocal)) {
    // Seu computador
    authConfig = { keyFile: caminhoLocal };
} else {
    throw new Error("Credencial do Google não encontrada.");
}

const auth = new google.auth.GoogleAuth({
    ...authConfig,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

// TESTE DE AUTENTICAÇÃO
auth.getClient()
    .then(async (client) => {
        const token = await client.getAccessToken();

        console.log("======================================");
        console.log("GOOGLE AUTH");
        console.log("Credencial encontrada: SIM");
        console.log("Cliente autenticado:", !!client);
        console.log("Token obtido:", !!token?.token);
        console.log("======================================");
    })
    .catch((erro) => {
        console.error("======================================");
        console.error("ERRO NA AUTENTICAÇÃO DO GOOGLE");
        console.error(erro.message);
        console.error("======================================");
    });

const sheets = google.sheets({
    version: "v4",
    auth,
});

module.exports = sheets;
