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
    throw new Error(
        "Credencial do Google não encontrada. " +
            "Verifique o google-credentials.json localmente " +
            "ou o Secret File no Render.",
    );
}

const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({
    version: "v4",
    auth,
});

module.exports = sheets;
