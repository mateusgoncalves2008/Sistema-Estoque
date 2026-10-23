const express = require("express");
const sheets = require("../database/googleSheets");

const router = express.Router();
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

function ehAdmin(usuario) {
    const tipo = String(usuario?.tipoUsuario || "").trim().toUpperCase();
    const perfil = String(usuario?.perfil || "").trim().toUpperCase();
    const permitidos = ["ADM", "ADMIN", "ADMINISTRADOR"];
    return permitidos.includes(tipo) || permitidos.includes(perfil);
}

function linhasDeDados(valores) {
    return (Array.isArray(valores) ? valores : []).slice(1).filter((linha) =>
        Array.isArray(linha) && String(linha[0] || "").trim() !== ""
    );
}

function contarPorTipo(usuarios) {
    const contagem = { alunos: 0, professores: 0, responsaveis: 0, secretaria: 0, administradores: 0, outros: 0 };

    for (const usuario of usuarios) {
        const tipo = String(usuario[5] || "").trim().toUpperCase();
        const perfil = String(usuario[6] || "").trim().toUpperCase();
        if (tipo === "ALUNO" || perfil === "ALUNO") contagem.alunos++;
        else if (tipo === "PROFESSOR" || perfil === "PROFESSOR") contagem.professores++;
        else if (["RESPONSAVEL", "RESPONSÁVEL", "LIDER"].includes(tipo) || ["RESPONSAVEL", "RESPONSÁVEL", "LIDER"].includes(perfil)) contagem.responsaveis++;
        else if (["SECRETARIA", "FUNCIONARIO", "FUNCIONÁRIO"].includes(tipo) || ["SECRETARIA", "FUNCIONARIO", "FUNCIONÁRIO"].includes(perfil)) contagem.secretaria++;
        else if (["ADM", "ADMIN", "ADMINISTRADOR"].includes(tipo) || ["ADM", "ADMIN", "ADMINISTRADOR"].includes(perfil)) contagem.administradores++;
        else contagem.outros++;
    }
    return contagem;
}

router.get("/admin/dashboard", async (req, res) => {
    const usuarioSessao = req.session?.usuario;

    if (!usuarioSessao) {
        return res.status(401).json({ sucesso: false, mensagem: "Faça login para acessar o Painel ADM." });
    }
    if (!ehAdmin(usuarioSessao)) {
        return res.status(403).json({ sucesso: false, mensagem: "Acesso permitido somente ao ADM." });
    }
    if (!SPREADSHEET_ID) {
        return res.status(500).json({ sucesso: false, mensagem: "A planilha não está configurada no servidor." });
    }

    const ranges = [
        "01_USUARIOS!A:K",
        "02_PRODUTOS!A:K",
        "05_LOCAIS!A:G",
        "06_ESTOQUE_LOCAIS!A:I",
        "07_MOVIMENTACOES!A:L",
        "08_RESERVAS!A:L",
        "09_EMPRESTIMOS!A:L",
        "10_DEVOLUCOES!A:K",
        "12_SETORES!A:F",
        "13_LOGS!A:H",
        "24_AVISOS_SISTEMA!A:H",
    ];

    try {
        const resposta = await sheets.spreadsheets.values.batchGet({
            spreadsheetId: SPREADSHEET_ID,
            ranges,
        });
        const valueRanges = resposta.data.valueRanges || [];
        const dados = {};
        ranges.forEach((range, indice) => {
            dados[range.split("!")[0]] = valueRanges[indice]?.values || [];
        });

        const usuarios = linhasDeDados(dados["01_USUARIOS"]);
        const usuariosAtivos = usuarios.filter((linha) => String(linha[8] || "").trim().toUpperCase() === "ATIVO");
        const produtos = linhasDeDados(dados["02_PRODUTOS"]);
        const locais = linhasDeDados(dados["05_LOCAIS"]);
        const estoque = linhasDeDados(dados["06_ESTOQUE_LOCAIS"]);
        const movimentacoes = linhasDeDados(dados["07_MOVIMENTACOES"]);
        const reservas = linhasDeDados(dados["08_RESERVAS"]);
        const emprestimos = linhasDeDados(dados["09_EMPRESTIMOS"]);
        const devolucoes = linhasDeDados(dados["10_DEVOLUCOES"]);
        const setores = linhasDeDados(dados["12_SETORES"]);
        const logs = linhasDeDados(dados["13_LOGS"]);
        const avisos = linhasDeDados(dados["24_AVISOS_SISTEMA"]);

        const estoqueNumerico = estoque.reduce((total, linha) => {
            const quantidade = Number(String(linha[3] || "0").replace(",", "."));
            return total + (Number.isFinite(quantidade) ? quantidade : 0);
        }, 0);
        const quantidadeDisponivel = estoque.reduce((total, linha) => {
            const quantidade = Number(String(linha[5] || "0").replace(",", "."));
            return total + (Number.isFinite(quantidade) ? quantidade : 0);
        }, 0);

        const usuariosSeguros = usuarios.map((linha) => ({
            usuarioID: String(linha[0] || ""),
            nome: String(linha[1] || ""),
            email: String(linha[2] || ""),
            tipoUsuario: String(linha[5] || ""),
            perfil: String(linha[6] || ""),
            setorID: String(linha[7] || ""),
            status: String(linha[8] || ""),
            dataCadastro: String(linha[9] || ""),
            ultimoLogin: String(linha[10] || ""),
        })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

        const cabecalhosLogs = Array.isArray(dados["13_LOGS"][0]) ? dados["13_LOGS"][0] : [];
        const atividadesRecentes = logs.slice(-8).reverse().map((linha) => {
            const registro = {};
            cabecalhosLogs.forEach((cabecalho, indice) => {
                const chave = String(cabecalho || `coluna${indice + 1}`).trim();
                registro[chave] = String(linha[indice] || "");
            });
            return registro;
        });

        return res.json({
            sucesso: true,
            atualizadoEm: new Date().toISOString(),
            administrador: { usuarioID: String(usuarioSessao.id || ""), nome: String(usuarioSessao.nome || ""), perfil: String(usuarioSessao.perfil || "") },
            resumo: {
                totalUsuarios: usuarios.length,
                usuariosAtivos: usuariosAtivos.length,
                usuariosPorTipo: contarPorTipo(usuarios),
                produtosCadastrados: produtos.length,
                locaisCadastrados: locais.length,
                registrosDeEstoque: estoque.length,
                quantidadeTotalEstoque: estoqueNumerico,
                quantidadeDisponivel,
                movimentacoes: movimentacoes.length,
                reservas: reservas.length,
                emprestimos: emprestimos.length,
                devolucoes: devolucoes.length,
                setores: setores.length,
                registrosDeAuditoria: logs.length,
                avisosPublicados: avisos.filter((linha) => String(linha[7] || "").trim().toUpperCase() === "PUBLICADO").length,
            },
            usuarios: usuariosSeguros,
            atividadesRecentes,
        });
    } catch (erro) {
        console.error("Erro ao carregar resumo do Painel ADM:", erro.message);
        return res.status(500).json({ sucesso: false, mensagem: "Não foi possível carregar os dados administrativos da planilha." });
    }
});


// ============================================================
// ADMINISTRAÇÃO DE USUÁRIOS
// Somente ADM. Não retorna nem modifica hash/salt de senha.
// ============================================================

function exigirAdmin(req, res) {
    const usuario = req.session?.usuario;
    if (!usuario) {
        res.status(401).json({ sucesso: false, mensagem: "Faça login novamente." });
        return false;
    }
    if (!ehAdmin(usuario)) {
        res.status(403).json({ sucesso: false, mensagem: "Operação permitida somente ao ADM." });
        return false;
    }
    if (!SPREADSHEET_ID) {
        res.status(500).json({ sucesso: false, mensagem: "A planilha não está configurada no servidor." });
        return false;
    }
    return true;
}

function textoAdmin(valor) {
    return String(valor ?? "").trim();
}

async function lerUsuariosAdmin() {
    const resposta = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "01_USUARIOS!A:K",
    });
    return resposta.data.values || [];
}

function indiceUsuarioAdmin(linhas, usuarioID) {
    return linhas.findIndex((linha, indice) =>
        indice > 0 && textoAdmin(linha[0]) === textoAdmin(usuarioID)
    );
}

function ehPropriaContaAdmin(req, usuarioID) {
    return textoAdmin(req.session?.usuario?.id) === textoAdmin(usuarioID);
}

// Edita nome, e-mail e setor; tipo/perfil e credenciais não são alterados aqui.
router.patch("/admin/usuarios/:usuarioID", async (req, res) => {
    if (!exigirAdmin(req, res)) return;
    try {
        const usuarioID = textoAdmin(req.params.usuarioID);
        const nome = textoAdmin(req.body?.nome);
        const email = textoAdmin(req.body?.email).toLowerCase();
        const setorID = textoAdmin(req.body?.setorID);

        if (!usuarioID || !nome || !email) {
            return res.status(400).json({ sucesso: false, mensagem: "ID, nome e e-mail são obrigatórios." });
        }
        if (nome.length > 150 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ sucesso: false, mensagem: "Confira o nome e o formato do e-mail." });
        }

        const linhas = await lerUsuariosAdmin();
        const indice = indiceUsuarioAdmin(linhas, usuarioID);
        if (indice < 0) return res.status(404).json({ sucesso: false, mensagem: "Usuário não encontrado." });

        const emailEmUso = linhas.some((linha, i) =>
            i > 0 && i !== indice && textoAdmin(linha[2]).toLowerCase() === email
        );
        if (emailEmUso) return res.status(409).json({ sucesso: false, mensagem: "Este e-mail já está sendo usado por outra conta." });

        const linhaPlanilha = indice + 1;
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                valueInputOption: "RAW",
                data: [
                    { range: `01_USUARIOS!B${linhaPlanilha}:C${linhaPlanilha}`, values: [[nome, email]] },
                    { range: `01_USUARIOS!H${linhaPlanilha}`, values: [[setorID]] },
                ],
            },
        });

        return res.json({ sucesso: true, mensagem: "Dados do usuário atualizados na planilha." });
    } catch (erro) {
        console.error("Erro ao editar usuário pelo ADM:", erro.message);
        return res.status(500).json({ sucesso: false, mensagem: "Não foi possível atualizar os dados do usuário." });
    }
});

// ATIVO permite login; INATIVO impede login. BLOQUEADO não é usado porque o login
// existente reconhece ATIVO como único status permitido.
router.patch("/admin/usuarios/:usuarioID/status", async (req, res) => {
    if (!exigirAdmin(req, res)) return;
    try {
        const usuarioID = textoAdmin(req.params.usuarioID);
        const status = textoAdmin(req.body?.status).toUpperCase();
        if (!usuarioID || !["ATIVO", "INATIVO"].includes(status)) {
            return res.status(400).json({ sucesso: false, mensagem: "Informe um status válido: ATIVO ou INATIVO." });
        }
        if (ehPropriaContaAdmin(req, usuarioID)) {
            return res.status(400).json({ sucesso: false, mensagem: "Você não pode alterar o status da própria conta." });
        }

        const linhas = await lerUsuariosAdmin();
        const indice = indiceUsuarioAdmin(linhas, usuarioID);
        if (indice < 0) return res.status(404).json({ sucesso: false, mensagem: "Usuário não encontrado." });

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `01_USUARIOS!I${indice + 1}`,
            valueInputOption: "RAW",
            requestBody: { values: [[status]] },
        });
        return res.json({
            sucesso: true,
            mensagem: status === "ATIVO" ? "Conta reativada." : "Conta desativada; o histórico foi preservado.",
        });
    } catch (erro) {
        console.error("Erro ao alterar status de usuário pelo ADM:", erro.message);
        return res.status(500).json({ sucesso: false, mensagem: "Não foi possível alterar o status do usuário." });
    }
});

// Exclusão lógica: preserva os vínculos com reservas, empréstimos e auditoria.
router.delete("/admin/usuarios/:usuarioID", async (req, res) => {
    if (!exigirAdmin(req, res)) return;
    try {
        const usuarioID = textoAdmin(req.params.usuarioID);
        if (!usuarioID) return res.status(400).json({ sucesso: false, mensagem: "ID do usuário não informado." });
        if (ehPropriaContaAdmin(req, usuarioID)) {
            return res.status(400).json({ sucesso: false, mensagem: "Você não pode desativar a própria conta." });
        }

        const linhas = await lerUsuariosAdmin();
        const indice = indiceUsuarioAdmin(linhas, usuarioID);
        if (indice < 0) return res.status(404).json({ sucesso: false, mensagem: "Usuário não encontrado." });
        if (textoAdmin(linhas[indice][8]).toUpperCase() === "INATIVO") {
            return res.json({ sucesso: true, mensagem: "A conta já está desativada." });
        }

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `01_USUARIOS!I${indice + 1}`,
            valueInputOption: "RAW",
            requestBody: { values: [["INATIVO"]] },
        });
        return res.json({ sucesso: true, mensagem: "Conta desativada. O histórico foi preservado." });
    } catch (erro) {
        console.error("Erro ao desativar usuário pelo ADM:", erro.message);
        return res.status(500).json({ sucesso: false, mensagem: "Não foi possível desativar o usuário." });
    }
});


// ============================================================
// OPERAÇÕES GERAIS: reservas, empréstimos, bloqueios e denúncias
// ============================================================

router.get("/admin/operacoes", async (req, res) => {
    if (!exigirAdmin(req, res)) return;
    try {
        const ranges = [
            "08_RESERVAS!A:L",
            "09_EMPRESTIMOS!A:L",
            "01_USUARIOS!A:K",
            "02_PRODUTOS!A:K",
        ];
        const resposta = await sheets.spreadsheets.values.batchGet({ spreadsheetId: SPREADSHEET_ID, ranges });
        const dados = {};
        ranges.forEach((range, i) => { dados[range.split("!")[0]] = resposta.data.valueRanges?.[i]?.values || []; });
        const usuarios = new Map((dados["01_USUARIOS"] || []).slice(1).map(l => [textoAdmin(l[0]), textoAdmin(l[1])]));
        const produtos = new Map((dados["02_PRODUTOS"] || []).slice(1).map(l => [textoAdmin(l[0]), textoAdmin(l[2])]));
        const reservas = (dados["08_RESERVAS"] || []).slice(1).filter(l => textoAdmin(l[0])).map(l => ({
            reservaID: textoAdmin(l[0]), dataSolicitacao: textoAdmin(l[1]),
            usuarioID: textoAdmin(l[2]), usuario: usuarios.get(textoAdmin(l[2])) || "",
            produtoID: textoAdmin(l[3]), produto: produtos.get(textoAdmin(l[3])) || "",
            localID: textoAdmin(l[4]), quantidade: textoAdmin(l[5]),
            dataInicio: textoAdmin(l[6]), dataFim: textoAdmin(l[7]),
            motivo: textoAdmin(l[8]), status: textoAdmin(l[9]),
            aprovadoPor: textoAdmin(l[10]), observacao: textoAdmin(l[11]),
        }));
        const emprestimos = (dados["09_EMPRESTIMOS"] || []).slice(1).filter(l => textoAdmin(l[0])).map(l => ({
            emprestimoID: textoAdmin(l[0]), dataRetirada: textoAdmin(l[1]),
            usuarioID: textoAdmin(l[2]), usuario: usuarios.get(textoAdmin(l[2])) || "",
            produtoID: textoAdmin(l[3]), produto: produtos.get(textoAdmin(l[3])) || "",
            localID: textoAdmin(l[4]), quantidade: textoAdmin(l[5]),
            dataPrevistaDevolucao: textoAdmin(l[6]), dataDevolucao: textoAdmin(l[7]),
            status: textoAdmin(l[8]), reservaID: textoAdmin(l[9]),
            observacao: textoAdmin(l[10]), responsavel: textoAdmin(l[11]),
        }));
        return res.json({ sucesso: true, reservas, emprestimos });
    } catch (erro) {
        console.error("Erro ao carregar operações do ADM:", erro.message);
        return res.status(500).json({ sucesso: false, mensagem: "Não foi possível carregar reservas e empréstimos." });
    }
});

// O ADM pode decidir reservas pendentes. Empréstimos concluídos exigem o fluxo
// de devolução existente para que estoque e histórico permaneçam consistentes.
router.patch("/admin/reservas/:reservaID/status", async (req, res) => {
    if (!exigirAdmin(req, res)) return;
    try {
        const reservaID = textoAdmin(req.params.reservaID);
        const statusNovo = textoAdmin(req.body?.status).toUpperCase();
        if (!reservaID || !["APROVADA", "RECUSADA", "CANCELADA"].includes(statusNovo)) {
            return res.status(400).json({ sucesso: false, mensagem: "Status de reserva inválido." });
        }
        const resposta = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "08_RESERVAS!A:L" });
        const linhas = resposta.data.values || [];
        const indice = linhas.findIndex((l, i) => i > 0 && textoAdmin(l[0]) === reservaID);
        if (indice < 0) return res.status(404).json({ sucesso: false, mensagem: "Reserva não encontrada." });
        const atual = textoAdmin(linhas[indice][9]).toUpperCase();
        if (atual !== "PENDENTE" && !(statusNovo === "CANCELADA" && atual === "APROVADA")) {
            return res.status(409).json({ sucesso: false, mensagem: "Só é possível decidir reservas pendentes ou cancelar uma reserva aprovada." });
        }
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `08_RESERVAS!J${indice + 1}:K${indice + 1}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [[statusNovo, textoAdmin(req.session.usuario.id)]] },
        });
        return res.json({ sucesso: true, mensagem: `Reserva ${statusNovo.toLowerCase()}.` });
    } catch (erro) {
        console.error("Erro ao alterar reserva pelo ADM:", erro.message);
        return res.status(500).json({ sucesso: false, mensagem: "Não foi possível atualizar a reserva." });
    }
});

router.get("/admin/denuncias-bloqueios", async (req, res) => {
    if (!exigirAdmin(req, res)) return;
    try {
        const [d, b] = await Promise.all([
            sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "23_DENUNCIAS_SECRETARIA!A:M" }),
            sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "22_BLOQUEIOS_SETOR!A:J" }),
        ]);
        const denuncias = (d.data.values || []).slice(1).filter(l => textoAdmin(l[0])).map(l => ({
            denunciaID: textoAdmin(l[0]), dataHora: textoAdmin(l[1]),
            denuncianteID: textoAdmin(l[2]), denuncianteNome: textoAdmin(l[3]),
            setorID: textoAdmin(l[4]), setorNome: textoAdmin(l[5]),
            denunciadoID: textoAdmin(l[6]), denunciadoNome: textoAdmin(l[7]),
            motivo: textoAdmin(l[8]), descricao: textoAdmin(l[9]),
            status: textoAdmin(l[10]), resposta: textoAdmin(l[11]), dataAnalise: textoAdmin(l[12]),
        }));
        const bloqueios = (b.data.values || []).slice(1).filter(l => textoAdmin(l[0])).map(l => ({
            bloqueioID: textoAdmin(l[0]), dataHora: textoAdmin(l[1]),
            responsavelID: textoAdmin(l[2]), responsavelNome: textoAdmin(l[3]),
            setorID: textoAdmin(l[4]), setorNome: textoAdmin(l[5]),
            usuarioBloqueadoID: textoAdmin(l[6]), usuarioBloqueadoNome: textoAdmin(l[7]),
            motivo: textoAdmin(l[8]), status: textoAdmin(l[9]),
        }));
        return res.json({ sucesso: true, denuncias, bloqueios });
    } catch (erro) {
        console.error("Erro ao carregar denúncias e bloqueios do ADM:", erro.message);
        return res.status(500).json({ sucesso: false, mensagem: "Não foi possível carregar denúncias e bloqueios." });
    }
});

router.patch("/admin/denuncias/:denunciaID/resposta", async (req, res) => {
    if (!exigirAdmin(req, res)) return;
    try {
        const denunciaID = textoAdmin(req.params.denunciaID);
        const respostaTexto = textoAdmin(req.body?.resposta);
        const status = textoAdmin(req.body?.status || "ANALISADA").toUpperCase();
        if (!denunciaID || respostaTexto.length < 3 || respostaTexto.length > 2000) {
            return res.status(400).json({ sucesso: false, mensagem: "Informe uma resposta entre 3 e 2000 caracteres." });
        }
        if (!["ANALISADA", "RESOLVIDA", "ARQUIVADA"].includes(status)) {
            return res.status(400).json({ sucesso: false, mensagem: "Status de análise inválido." });
        }
        const leitura = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "23_DENUNCIAS_SECRETARIA!A:M" });
        const linhas = leitura.data.values || [];
        const indice = linhas.findIndex((l, i) => i > 0 && textoAdmin(l[0]) === denunciaID);
        if (indice < 0) return res.status(404).json({ sucesso: false, mensagem: "Denúncia não encontrada." });
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                valueInputOption: "USER_ENTERED",
                data: [
                    { range: `23_DENUNCIAS_SECRETARIA!K${indice + 1}:M${indice + 1}`, values: [[status, respostaTexto, new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })]] },
                ],
            },
        });
        return res.json({ sucesso: true, mensagem: "Análise da denúncia registrada." });
    } catch (erro) {
        console.error("Erro ao responder denúncia pelo ADM:", erro.message);
        return res.status(500).json({ sucesso: false, mensagem: "Não foi possível registrar a resposta da denúncia." });
    }
});


router.get("/admin/estoque", async (req, res) => {
    if (!exigirAdmin(req, res)) return;
    try {
        const ranges = [
            "02_PRODUTOS!A:K",
            "03_CATEGORIAS!A:D",
            "04_SUBCATEGORIAS!A:E",
            "05_LOCAIS!A:G",
            "06_ESTOQUE_LOCAIS!A:I",
        ];
        const resposta = await sheets.spreadsheets.values.batchGet({ spreadsheetId: SPREADSHEET_ID, ranges });
        const dados = {};
        ranges.forEach((range, i) => { dados[range.split("!")[0]] = resposta.data.valueRanges?.[i]?.values || []; });
        const categorias = new Map((dados["03_CATEGORIAS"] || []).slice(1).map(l => [textoAdmin(l[0]), textoAdmin(l[1])]));
        const subcategorias = new Map((dados["04_SUBCATEGORIAS"] || []).slice(1).map(l => [textoAdmin(l[0]), textoAdmin(l[2])]));
        const locais = (dados["05_LOCAIS"] || []).slice(1).filter(l => textoAdmin(l[0])).map(l => ({
            localID: textoAdmin(l[0]), codigo: textoAdmin(l[1]), nome: textoAdmin(l[2]),
            tipo: textoAdmin(l[3]), responsavelID: textoAdmin(l[4]), descricao: textoAdmin(l[5]), status: textoAdmin(l[6]),
        }));
        const estoque = (dados["06_ESTOQUE_LOCAIS"] || []).slice(1).filter(l => textoAdmin(l[0])).map(l => ({
            estoqueID: textoAdmin(l[0]), produtoID: textoAdmin(l[1]), localID: textoAdmin(l[2]),
            quantidade: textoAdmin(l[3]), reservado: textoAdmin(l[4]), disponivel: textoAdmin(l[5]),
            indisponivel: textoAdmin(l[6]), ultimaAtualizacao: textoAdmin(l[7]), status: textoAdmin(l[8]),
        }));
        const produtos = (dados["02_PRODUTOS"] || []).slice(1).filter(l => textoAdmin(l[0])).map(l => ({
            produtoID: textoAdmin(l[0]), codigo: textoAdmin(l[1]), nome: textoAdmin(l[2]), autor: textoAdmin(l[3]),
            categoriaID: textoAdmin(l[4]), categoria: categorias.get(textoAdmin(l[4])) || "",
            subcategoriaID: textoAdmin(l[5]), subcategoria: subcategorias.get(textoAdmin(l[5])) || "",
            estoqueMinimo: textoAdmin(l[6]), estado: textoAdmin(l[7]), status: textoAdmin(l[8]),
            dataCadastro: textoAdmin(l[9]), observacao: textoAdmin(l[10]),
        }));
        return res.json({ sucesso: true, produtos, locais, estoque });
    } catch (erro) {
        console.error("Erro ao carregar estoque do ADM:", erro.message);
        return res.status(500).json({ sucesso: false, mensagem: "Não foi possível carregar o estoque e os locais." });
    }
});

module.exports = router;
