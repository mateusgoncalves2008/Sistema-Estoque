const express = require("express");
const router = express.Router();
const sheets = require("../database/googleSheets");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const ABA_BLOQUEIOS = "22_BLOQUEIOS_SETOR";
const ABA_DENUNCIAS = "23_DENUNCIAS_SECRETARIA";

function normalizar(valor) {
    return String(valor ?? "").trim().toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function texto(valor) { return String(valor ?? "").trim(); }
function dataHora() {
    return UtilitiesDataHora();
}
function UtilitiesDataHora() {
    return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function erro(status, mensagem) {
    const e = new Error(mensagem);
    e.status = status;
    return e;
}
function exigirResponsavel(req, res, next) {
    const u = req.session?.usuario;
    if (!u) return res.status(401).json({ sucesso:false, mensagem:"Faça login novamente." });
    if (normalizar(u.tipoUsuario) !== "RESPONSAVEL" ||
        normalizar(u.perfil) !== "RESPONSAVEL" || !u.setorID) {
        return res.status(403).json({ sucesso:false, mensagem:"Acesso permitido somente ao responsável do setor." });
    }
    next();
}
function exigirSecretaria(req, res, next) {
    const u = req.session?.usuario;
    if (!u) return res.status(401).json({ sucesso:false, mensagem:"Faça login novamente." });
    if (!["FUNCIONARIO", "SECRETARIA"].includes(normalizar(u.tipoUsuario)) &&
        normalizar(u.perfil) !== "SECRETARIA") {
        return res.status(403).json({ sucesso:false, mensagem:"Acesso permitido somente à Secretaria." });
    }
    next();
}
async function garantirAbas() {
    const meta = await sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
        fields: "sheets.properties.title"
    });
    const existentes = new Set((meta.data.sheets || []).map(s => s.properties.title));
    const novas = [
        { nome: ABA_BLOQUEIOS, cabecalho: ["BloqueioID","DataHora","ResponsavelID","ResponsavelNome","SetorID","SetorNome","UsuarioBloqueadoID","UsuarioBloqueadoNome","Motivo","Status"] },
        { nome: ABA_DENUNCIAS, cabecalho: ["DenunciaID","DataHora","DenuncianteID","DenuncianteNome","SetorID","SetorNome","DenunciadoID","DenunciadoNome","Motivo","Descricao","Status","RespostaSecretaria","DataAnalise"] }
    ];
    for (const aba of novas) {
        if (!existentes.has(aba.nome)) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: SPREADSHEET_ID,
                requestBody: { requests: [{ addSheet: { properties: { title: aba.nome } } }] }
            });
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `'${aba.nome}'!A1:${String.fromCharCode(64 + aba.cabecalho.length)}1`,
                valueInputOption: "RAW",
                requestBody: { values: [aba.cabecalho] }
            });
        } else {
            const lidas = await sheets.spreadsheets.values.get({
                spreadsheetId: SPREADSHEET_ID, range: `'${aba.nome}'!A1:Z1`
            });
            if (!(lidas.data.values || []).length) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `'${aba.nome}'!A1:${String.fromCharCode(64 + aba.cabecalho.length)}1`,
                    valueInputOption: "RAW",
                    requestBody: { values: [aba.cabecalho] }
                });
            }
        }
    }
}
async function ler(intervalo) {
    await garantirAbas();
    const r = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: intervalo });
    return r.data.values || [];
}
async function proximoID(aba, prefixo) {
    const linhas = await ler(`'${aba}'!A:A`);
    let maior = 0;
    for (const l of linhas.slice(1)) {
        const n = Number(String(l[0] || "").match(/(\\d+)$/)?.[1] || 0);
        maior = Math.max(maior, n);
    }
    return `${prefixo}-${String(maior + 1).padStart(5, "0")}`;
}
async function carregarVinculo(usuarioSessao) {
    const [usuarios, setores, locais] = await Promise.all([
        ler("01_USUARIOS!A:K"), ler("12_SETORES!A:E"), ler("05_LOCAIS!A:G")
    ]);
    const usuario = usuarios.slice(1).find(l => texto(l[0]) === texto(usuarioSessao.id));
    if (!usuario || normalizar(usuario[8]) !== "ATIVO") throw erro(403, "Conta inativa ou não encontrada.");
    const setor = setores.slice(1).find(l =>
        texto(l[0]) === texto(usuario[7]) &&
        texto(l[0]) === texto(usuarioSessao.setorID) &&
        texto(l[2]) === texto(usuario[0]) && normalizar(l[4]) === "ATIVO"
    );
    if (!setor) throw erro(403, "Não existe setor ativo vinculado a esta conta.");
    const local = locais.slice(1).find(l => texto(l[4]) === texto(usuario[0]) &&
        normalizar(l[2]) === normalizar(setor[1]));
    if (!local) throw erro(403, "Local do setor não encontrado.");
    return {
        usuario: { id:texto(usuario[0]), nome:texto(usuario[1]) },
        setor: { id:texto(setor[0]), nome:texto(setor[1]) },
        local: { id:texto(local[0]), nome:texto(local[2]) }
    };
}
async function nomeUsuario(id) {
    const usuarios = await ler("01_USUARIOS!A:K");
    const u = usuarios.slice(1).find(l => texto(l[0]) === texto(id));
    if (!u || normalizar(u[8]) !== "ATIVO") throw erro(404, "Usuário não encontrado ou inativo.");
    return { id:texto(u[0]), nome:texto(u[1]), tipo:normalizar(u[5]), setorID:texto(u[7]) };
}
function respostaErro(res, e, mensagem) {
    console.error(mensagem, e.message);
    return res.status(e.status || 500).json({ sucesso:false, mensagem:e.status ? e.message : mensagem });
}

// Responsável vê apenas os registros do próprio setor.
router.get("/responsavel/bloqueios-denuncias", exigirResponsavel, async (req, res) => {
    try {
        const v = await carregarVinculo(req.session.usuario);
        const [bloqueios, denuncias] = await Promise.all([
            ler(`'${ABA_BLOQUEIOS}'!A:J`), ler(`'${ABA_DENUNCIAS}'!A:M`)
        ]);
        return res.json({
            sucesso:true,
            bloqueios:bloqueios.slice(1).filter(l => texto(l[4]) === v.setor.id),
            denuncias:denuncias.slice(1).filter(l => texto(l[4]) === v.setor.id),
            setor:v.setor
        });
    } catch(e) { return respostaErro(res, e, "Não foi possível carregar bloqueios e denúncias."); }
});

// Bloqueio vale somente para o setor do responsável; não bloqueia a conta na escola inteira.
router.post("/responsavel/bloqueios", exigirResponsavel, async (req, res) => {
    try {
        const v = await carregarVinculo(req.session.usuario);
        const usuarioID = texto(req.body?.usuarioBloqueadoID);
        const motivo = texto(req.body?.motivo);
        if (!usuarioID || motivo.length < 5) throw erro(400, "Informe o usuário e um motivo com pelo menos 5 caracteres.");
        if (usuarioID === v.usuario.id) throw erro(400, "Você não pode bloquear a própria conta.");
        const alvo = await nomeUsuario(usuarioID);
        if (["ADM", "ADMIN", "SECRETARIA", "FUNCIONARIO"].includes(alvo.tipo)) {
            throw erro(403, "Esse perfil não pode ser bloqueado pelo responsável do setor.");
        }
        const linhas = await ler(`'${ABA_BLOQUEIOS}'!A:J`);
        const existente = linhas.slice(1).find(l => texto(l[4]) === v.setor.id &&
            texto(l[6]) === alvo.id && normalizar(l[9]) === "ATIVO");
        if (existente) throw erro(409, "Esse usuário já está bloqueado neste setor.");
        const id = await proximoID(ABA_BLOQUEIOS, "BLQ");
        const linha = [id, dataHora(), v.usuario.id, v.usuario.nome, v.setor.id,
            v.setor.nome, alvo.id, alvo.nome, motivo, "ATIVO"];
        await sheets.spreadsheets.values.append({
            spreadsheetId:SPREADSHEET_ID, range:`'${ABA_BLOQUEIOS}'!A:J`,
            valueInputOption:"USER_ENTERED", insertDataOption:"INSERT_ROWS",
            requestBody:{ values:[linha] }
        });
        return res.status(201).json({ sucesso:true, mensagem:"Bloqueio registrado para este setor.", bloqueioID:id });
    } catch(e) { return respostaErro(res, e, "Não foi possível registrar o bloqueio."); }
});

// Desbloqueia um usuário somente no setor do responsável autenticado.
router.patch("/responsavel/bloqueios/:id/desbloquear", exigirResponsavel, async (req, res) => {
    try {
        const v = await carregarVinculo(req.session.usuario);
        const id = texto(req.params.id);
        if (!id) throw erro(400, "ID do bloqueio não informado.");

        const linhas = await ler(`'${ABA_BLOQUEIOS}'!A:J`);
        const indice = linhas.findIndex((l, i) =>
            i > 0 && texto(l[0]) === id && texto(l[4]) === v.setor.id
        );

        if (indice < 1) throw erro(404, "Bloqueio não encontrado neste setor.");
        if (normalizar(linhas[indice][9]) !== "ATIVO") {
            throw erro(409, "Este bloqueio já está inativo.");
        }

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `'${ABA_BLOQUEIOS}'!J${indice + 1}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [["INATIVO"]] }
        });

        return res.json({ sucesso: true, mensagem: "Usuário desbloqueado neste setor.", bloqueioID: id });
    } catch (e) {
        return respostaErro(res, e, "Não foi possível desbloquear o usuário.");
    }
});

// Denúncias ficam disponíveis para análise pela Secretaria.
router.post("/responsavel/denuncias", exigirResponsavel, async (req, res) => {
    try {
        const v = await carregarVinculo(req.session.usuario);
        const denunciadoID = texto(req.body?.denunciadoID);
        const motivo = texto(req.body?.motivo);
        const descricao = texto(req.body?.descricao);
        if (!denunciadoID || motivo.length < 3 || descricao.length < 10)
            throw erro(400, "Informe o usuário, o motivo e uma descrição com pelo menos 10 caracteres.");
        const alvo = await nomeUsuario(denunciadoID);
        if (alvo.id === v.usuario.id) throw erro(400, "Você não pode denunciar a própria conta por esta tela.");
        const id = await proximoID(ABA_DENUNCIAS, "DEN");
        const linha = [id, dataHora(), v.usuario.id, v.usuario.nome, v.setor.id,
            v.setor.nome, alvo.id, alvo.nome, motivo, descricao, "PENDENTE", "", ""];
        await sheets.spreadsheets.values.append({
            spreadsheetId:SPREADSHEET_ID, range:`'${ABA_DENUNCIAS}'!A:M`,
            valueInputOption:"USER_ENTERED", insertDataOption:"INSERT_ROWS",
            requestBody:{ values:[linha] }
        });
        return res.status(201).json({ sucesso:true, mensagem:"Denúncia enviada à Secretaria para análise.", denunciaID:id });
    } catch(e) { return respostaErro(res, e, "Não foi possível enviar a denúncia."); }
});

// Secretaria consulta todas as denúncias.
router.get("/secretaria/denuncias", exigirSecretaria, async (req, res) => {
    try {
        const linhas = await ler(`'${ABA_DENUNCIAS}'!A:M`);
        return res.json({ sucesso:true, denuncias:linhas.slice(1).map(l => ({
            denunciaID:l[0]||"", dataHora:l[1]||"", denuncianteID:l[2]||"",
            denuncianteNome:l[3]||"", setorID:l[4]||"", setorNome:l[5]||"",
            denunciadoID:l[6]||"", denunciadoNome:l[7]||"", motivo:l[8]||"",
            descricao:l[9]||"", status:l[10]||"", resposta:l[11]||"", dataAnalise:l[12]||""
        })) });
    } catch(e) { return respostaErro(res, e, "Não foi possível carregar as denúncias."); }
});

router.patch("/secretaria/denuncias/:id", exigirSecretaria, async (req, res) => {
    try {
        const id = texto(req.params.id);
        const status = normalizar(req.body?.status);
        const resposta = texto(req.body?.resposta);
        if (!["EM_ANALISE", "PROCEDENTE", "IMPROCEDENTE", "ARQUIVADA"].includes(status))
            throw erro(400, "Status inválido para análise.");
        const linhas = await ler(`'${ABA_DENUNCIAS}'!A:M`);
        const indice = linhas.findIndex((l,i) => i > 0 && texto(l[0]) === id);
        if (indice < 1) throw erro(404, "Denúncia não encontrada.");
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId:SPREADSHEET_ID,
            requestBody:{ valueInputOption:"USER_ENTERED", data:[
                { range:`'${ABA_DENUNCIAS}'!K${indice+1}:M${indice+1}`,
                  values:[[status, resposta, dataHora()]] }
            ]}
        });
        return res.json({ sucesso:true, mensagem:"Análise da denúncia atualizada." });
    } catch(e) { return respostaErro(res, e, "Não foi possível atualizar a denúncia."); }
});

module.exports = router;
