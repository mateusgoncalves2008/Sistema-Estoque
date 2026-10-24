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

// Cache curto para compartilhar leituras idênticas entre rotas e painéis.
// Isso evita que várias requisições simultâneas leiam a mesma aba repetidamente.
const CACHE_LEITURAS_MS = 10000;
const cacheLeituras = new Map();
const leiturasEmAndamento = new Map();
let versaoCacheLeituras = 0;

function invalidarCacheLeituras() {
    versaoCacheLeituras += 1;
    cacheLeituras.clear();
    leiturasEmAndamento.clear();
}

const valores = sheets.spreadsheets.values;
const obterValoresOriginal = valores.get.bind(valores);

valores.get = async function (params, options) {
    const chave = JSON.stringify(params || {});
    const agora = Date.now();
    const cacheado = cacheLeituras.get(chave);

    if (cacheado && cacheado.expiraEm > agora) {
        return cacheado.resposta;
    }

    if (cacheado) {
        cacheLeituras.delete(chave);
    }

    const leituraExistente = leiturasEmAndamento.get(chave);
    if (leituraExistente) {
        return leituraExistente;
    }

    const versaoDaRequisicao = versaoCacheLeituras;
    const requisicao = obterValoresOriginal(params, options)
        .then((resposta) => {
            // Uma gravação pode ocorrer enquanto a leitura está em andamento.
            // Nesse caso, não guardamos uma resposta potencialmente antiga.
            if (versaoDaRequisicao === versaoCacheLeituras) {
                cacheLeituras.set(chave, {
                    resposta,
                    expiraEm: Date.now() + CACHE_LEITURAS_MS,
                });
            }

            return resposta;
        })
        .finally(() => {
            if (leiturasEmAndamento.get(chave) === requisicao) {
                leiturasEmAndamento.delete(chave);
            }
        });

    leiturasEmAndamento.set(chave, requisicao);
    return requisicao;
};

// Toda gravação bem-sucedida invalida as leituras em cache para que os painéis
// consultem os dados atualizados após alterações no estoque, reservas ou avisos.
for (const metodo of ["append", "update", "batchUpdate", "clear", "batchClear"]) {
    const metodoOriginal = valores[metodo];

    if (typeof metodoOriginal !== "function") continue;

    valores[metodo] = function (...args) {
        const resultado = metodoOriginal.apply(this, args);

        if (resultado && typeof resultado.then === "function") {
            return resultado.then((resposta) => {
                invalidarCacheLeituras();
                return resposta;
            });
        }

        return resultado;
    };
}

module.exports = sheets;