const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("rotas de debug não são carregadas pelo servidor", () => {
  const server = read("backend/server.js");
  assert.doesNotMatch(server, /require\(["']\.\/routes\/debug["']\)/);
  assert.doesNotMatch(server, /app\.use\(["']\/api["'],\s*debugRoutes\)/);
});

test("servidor exige segredo de sessão e restringe CORS em produção", () => {
  const server = read("backend/server.js");
  assert.match(server, /if\s*\(!process\.env\.SESSION_SECRET\)/);
  assert.match(server, /NODE_ENV\s*===\s*["']production["'][\s\S]{0,180}FRONTEND_ORIGIN/);
  assert.match(server, /httpOnly:\s*true/);
  assert.match(server, /secure:\s*process\.env\.NODE_ENV\s*===\s*["']production["']/);
});

test("login limita tentativas e regenera sessão após autenticar", () => {
  const server = read("backend/server.js");
  const auth = read("backend/routes/auth.js");
  assert.match(server, /\\/api\\/login[\\s\\S]{0,100}rateLimit\\(/);
  assert.match(auth, /req\.session\.regenerate\(/);
  assert.match(auth, /req\.session\.save\(/);
});

test("cadastro e criação de contas usam scrypt e validam tamanho da senha", () => {
  const cadastro = read("backend/routes/cadastro.js");
  const secretaria = read("backend/routes/secretaria.js");
  assert.match(cadastro, /crypto\.scryptSync\(/);
  assert.match(cadastro, /senha\.length\s*<\s*12/);
  assert.match(secretaria, /crypto\.scryptSync\(/);
  assert.match(secretaria, /senha\.length\s*<\s*12/);
});

test("consultas de empréstimos e reservas verificam sessão, identidade e perfil", () => {
  const emprestimos = read("backend/routes/emprestimos.js");
  const reservas = read("backend/routes/reservas.js");
  assert.match(emprestimos, /if\s*\(!sessao\?\.id\)/);
  assert.match(emprestimos, /texto\(sessao\.id\)\s*!==\s*usuarioID/);
  assert.match(emprestimos, /normalizar\(sessao\.tipoUsuario\)\s*!==\s*tipoEsperado/);
  assert.match(reservas, /String\(sessao\.id\)\.trim\(\)\s*!==\s*usuarioID/);
  assert.match(reservas, /normalizar\(sessao\.tipoUsuario\)\s*!==\s*["']ALUNO["']/);
});

test("rotas sensíveis da Secretaria exigem middleware de autorização", () => {
  const secretaria = read("backend/routes/secretaria.js");
  assert.match(secretaria, /router\.use\(exigirSecretaria\)/);
  assert.match(secretaria, /function exigirSecretaria\(/);
});

test("catálogo de aluno e professor exige o perfil correspondente", () => {
  const aluno = read("backend/routes/produtos.js");
  const professor = read("backend/routes/professorItens.js");
  assert.match(aluno, /router\.get\(["']\/aluno\/itens["'],\s*exigirAluno/);
  assert.match(professor, /router\.get\(["']\/professor\/itens["'],\s*exigirProfessor/);
  assert.match(professor, /router\.get\(["']\/professor\/calendario["'],\s*exigirProfessor/);
});
