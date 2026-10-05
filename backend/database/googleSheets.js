const { google } = require("googleapis");
const path = require("path");

const credentialsPath = path.join(__dirname, "..", "google-credentials.json");

const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({
    version: "v4",
    auth,
});

module.exports = sheets;
