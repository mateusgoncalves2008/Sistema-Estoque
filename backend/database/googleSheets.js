const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");

const caminhoLocal = path.join(__dirname, "..", "google-credentials.json");

const caminhoRender = "/etc/secrets/google-credentials.json";

let credentialsPath;

if (fs.existsSync(caminhoRender)) {
    credentialsPath = caminhoRender;
} else if (fs.existsSync(caminhoLocal)) {
    credentialsPath = caminhoLocal;
} else {
    throw new Error("Credencial do Google não encontrada.");
}

const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
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
