const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

const pool = connectionString
    ? new Pool({
          connectionString,
          max: 5,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
      })
    : null;

async function testarConexao() {
    if (!pool) {
        const erro = new Error("DATABASE_URL não configurada.");
        erro.code = "DATABASE_URL_MISSING";
        throw erro;
    }

    const resultado = await pool.query("SELECT 1 AS conectado");
    return resultado.rows[0]?.conectado === 1;
}

module.exports = {
    pool,
    testarConexao,
};
