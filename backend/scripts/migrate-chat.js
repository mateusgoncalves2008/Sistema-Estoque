const fs = require("node:fs");
const path = require("node:path");
const postgres = require("../database/postgres");

async function executarMigracao() {
    if (!postgres.pool) {
        throw new Error("DATABASE_URL não configurada.");
    }

    const arquivo = path.join(__dirname, "../database/migrations/001_chat_schema.sql");
    const sql = fs.readFileSync(arquivo, "utf8");
    const client = await postgres.pool.connect();

    try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("COMMIT");
        console.log("Estrutura inicial do chat criada/verificada com sucesso.");
    } catch (erro) {
        await client.query("ROLLBACK");
        throw erro;
    } finally {
        client.release();
        await postgres.pool.end();
    }
}

executarMigracao().catch((erro) => {
    console.error("Falha ao preparar as tabelas do chat:", erro.message);
    process.exitCode = 1;
});
