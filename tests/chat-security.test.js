const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("rotas do chat estão conectadas ao servidor", () => {
    const server = read("backend/server.js");
    assert.match(server, /require\(["']\.\/routes\/chat["']\)/);
    assert.match(server, /app\.use\(["']\/api["'],\s*chatRoutes\)/);
});

test("chat valida sessão e conta ativa pelo Google Sheets", () => {
    const chat = read("backend/routes/chat.js");
    assert.match(chat, /req\.session\?\.usuario\?\.id/);
    assert.match(chat, /01_USUARIOS!A2:K/);
    assert.match(chat, /normalizar\(linha\[8\]\)\s*===\s*["']ATIVO["']/);
});

test("mensagens usam a identidade da sessão e possuem limite de tamanho", () => {
    const chat = read("backend/routes/chat.js");
    assert.match(chat, /const MAX_MENSAGEM = 2000/);
    assert.match(chat, /inserirMensagem\(db, conversa\.id, req\.chatUser\.id, corpo\)/);
    assert.doesNotMatch(chat, /req\.body\?\.remetenteID/);
});

test("modo restrito transforma a primeira mensagem ao ADM em solicitação", () => {
    const chat = read("backend/routes/chat.js");
    assert.match(chat, /adm_restricted_mode/);
    assert.match(chat, /conversation_type/);
    assert.match(chat, /ADM_REQUEST/);
    assert.match(chat, /chat_requests/);
    assert.match(chat, /Aguarde a resposta do ADM/);
});

test("solicitações do ADM podem ser aceitas ou recusadas", () => {
    const chat = read("backend/routes/chat.js");
    assert.match(chat, /router\.get\(["']\/chat\/solicitacoes["']/);
    assert.match(chat, /router\.patch\(["']\/chat\/solicitacoes\/:id["']/);
    assert.match(chat, /["']ACEITAR["'].*["']RECUSAR["']/);
});

test("bloqueios do ADM são verificados no servidor e encerram solicitações pendentes", () => {
    const chat = read("backend/routes/chat.js");
    assert.match(chat, /router\.post\(["']\/chat\/bloqueios["']/);
    assert.match(chat, /existeBloqueio\(/);
    assert.match(chat, /blocker_id = \$1 AND blocked_id = \$2/);
    assert.match(chat, /UPDATE chat_requests[\s\S]*status = 'REJECTED'/);
});

test("preferência de silenciar é individual por participante", () => {
    const chat = read("backend/routes/chat.js");
    assert.match(chat, /chat_conversation_preferences/);
    assert.match(chat, /notifications_muted/);
    assert.match(chat, /req\.chatUser\.id, req\.body\.silenciado/);
});
