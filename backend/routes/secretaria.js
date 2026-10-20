const express = require("express");
const crypto = require("crypto");

const sheets = require("../database/googleSheets");

const router = express.Router();

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

/*
==========================================================
 CONFIGURAÇÕES
==========================================================
*/

const CACHE_TEMPO = 15000;

let cacheSecretaria = {
    dados: null,
    atualizadoEm: 0,
};

/*
==========================================================
 FUNÇÕES AUXILIARES
==========================================================
*/

function normalizar(valor) {
    return String(valor || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[º°]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

function normalizarSerie(valor) {
    const textoSerie = String(valor || "").trim();
    const match = textoSerie.match(/^(\d+)\s*(?:[º°o]?\s*ano)?$/i);
    return match ? `${match[1]}° ano` : normalizar(textoSerie);
}

function normalizarTurma(valor) {
    const textoTurma = String(valor || "").trim();
    const match = textoTurma.match(/^(?:turma\s*)?(\d+)$/i);
    return match ? `turma ${match[1]}` : normalizar(textoTurma);
}

function numero(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
}

function texto(valor) {
    return String(valor || "").trim();
}

function agora() {
    const data = new Date();

    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const dia = String(data.getDate()).padStart(2, "0");

    const hora = String(data.getHours()).padStart(2, "0");
    const minuto = String(data.getMinutes()).padStart(2, "0");
    const segundo = String(data.getSeconds()).padStart(2, "0");

    return `${ano}-${mes}-${dia} ${hora}:${minuto}:${segundo}`;
}

function gerarID(prefixo, linhas, coluna = 0) {
    let maior = 0;

    for (const linha of linhas.slice(1)) {
        const valor = texto(linha[coluna]);

        const match = valor.match(new RegExp(`^${prefixo}-(\\d+)$`));

        if (match) {
            maior = Math.max(maior, Number(match[1]));
        }
    }

    return `${prefixo}-${String(maior + 1).padStart(5, "0")}`;
}

function hashSenha(senha, salt) {
    const derivada = crypto.scryptSync(senha, salt, 64, {
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 64 * 1024 * 1024,
    }).toString("hex");
    return "scrypt$16384$8$1$" + derivada;
}

/*
==========================================================
 LEITURA CENTRALIZADA DA PLANILHA
==========================================================

Em vez de fazer:

Promise.all([
    lerAba(),
    lerAba(),
    lerAba(),
    ...
])

usamos uma única chamada batchGet.

Isso reduz drasticamente as requisições para a API.
*/

async function carregarDadosSecretaria() {
    const agoraMs = Date.now();

    if (
        cacheSecretaria.dados &&
        agoraMs - cacheSecretaria.atualizadoEm < CACHE_TEMPO
    ) {
        return cacheSecretaria.dados;
    }

    const ranges = [
        "01_USUARIOS!A:K",
        "02_PRODUTOS!A:K",
        "03_CATEGORIAS!A:D",
        "04_SUBCATEGORIAS!A:D",
        "05_LOCAIS!A:F",
        "06_ESTOQUE_LOCAIS!A:H",
        "07_MOVIMENTACOES!A:L",
        "08_RESERVAS!A:L",
        "09_EMPRESTIMOS!A:K",
        "10_DEVOLUCOES!A:K",
        "12_SETORES!A:F",
        "13_LOGS!A:H",
        "14_CONFIGURACOES!A:F",
        "15_COMUNICACOES_ESTOQUE!A:H",
        "17_CADASTROS_AUTORIZADOS!A:J",
        "18_CALENDARIO_ESCOLAR!A:G",
        "19_TURMAS!A:G",
        "20_DISCIPLINAS!A:D",
        "21_PROFESSOR_TURMAS!A:F",
        "22_BLOQUEIOS_SETOR!A:Z",
        "23_DENUNCIAS_SECRETARIA!A:Z",
        "24_AVISOS_SISTEMA!A:H",
    ];

    

    const resposta = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: SPREADSHEET_ID,
        ranges,
    });

    const valores = resposta.data.valueRanges || [];

    const dados = {};

    for (let i = 0; i < ranges.length; i++) {
        const nomeAba = ranges[i].split("!")[0];

        dados[nomeAba] = valores[i]?.values || [];
    }

    cacheSecretaria = {
        dados,
        atualizadoEm: Date.now(),
    };

    

    return dados;
}

/*
==========================================================
 LIMPAR CACHE
==========================================================
*/

function limparCache() {
    cacheSecretaria = {
        dados: null,
        atualizadoEm: 0,
    };
}

/*
==========================================================
 VERIFICAR PERMISSÃO
==========================================================
*/

function usuarioTemPermissao(usuario) {
    if (!usuario) {
        return false;
    }

    const tipo = normalizar(usuario.tipoUsuario);
    const perfil = normalizar(usuario.perfil);

    const perfisAdministrativos = ["adm", "admin", "administrador"];

    // Um funcionário comum não recebe acesso administrativo só pelo tipo.
    // Acesso à Secretaria exige perfil explícito de Secretaria ou perfil/tipo ADM.
    return (
        tipo === "secretaria" ||
        perfil === "secretaria" ||
        perfisAdministrativos.includes(tipo) ||
        perfisAdministrativos.includes(perfil)
    );
}

function exigirSecretaria(req, res, next) {
    const usuario = req.session?.usuario;

    if (!usuario) {
        return res.status(401).json({
            sucesso: false,
            mensagem: "Faça login para acessar este painel.",
        });
    }

    if (!usuarioTemPermissao(usuario)) {
        return res.status(403).json({
            sucesso: false,
            mensagem: "Sua conta não tem permissão para acessar o painel da Secretaria.",
        });
    }

    next();
}

// Somente as rotas da Secretaria exigem perfil administrativo/Secretaria.
// Este roteador é montado em /api; limitar o middleware a /secretaria
// evita bloquear as rotas de Professor, Aluno e outros módulos da API.
router.use("/secretaria", exigirSecretaria);

/*
==========================================================
 DASHBOARD
==========================================================
*/

router.get("/secretaria/dashboard", async (req, res) => {
    try {
        const dados = await carregarDadosSecretaria();

        const usuarios = dados["01_USUARIOS"] || [];

        const estoque = dados["06_ESTOQUE_LOCAIS"] || [];

        const reservas = dados["08_RESERVAS"] || [];

        const emprestimos = dados["09_EMPRESTIMOS"] || [];

        const devolucoes = dados["10_DEVOLUCOES"] || [];

        const calendario = dados["18_CALENDARIO_ESCOLAR"] || [];

        const hoje = new Date().toISOString().slice(0, 10);

        const alunos = usuarios
            .slice(1)
            .filter((linha) => normalizar(linha[5]) === "aluno");

        const professores = usuarios
            .slice(1)
            .filter((linha) => normalizar(linha[5]) === "professor");

        const reservasPendentes = reservas
            .slice(1)
            .filter((linha) => normalizar(linha[9]) === "pendente");

        const emprestimosAtivos = emprestimos.slice(1).filter((linha) => {
            const status = normalizar(linha[9] || linha[8]);

            return (
                status === "ativo" ||
                status === "em andamento" ||
                status === "aberto"
            );
        });

        const devolucoesPendentes = devolucoes.slice(1).filter((linha) => {
            const status = normalizar(linha[8] || linha[7]);

            return status === "pendente" || status === "aberto";
        });

        const estoqueBaixo = estoque.slice(1).filter((linha) => {
            const quantidade = numero(linha[5]);

            const minimo = numero(linha[6]);

            return minimo > 0 && quantidade <= minimo;
        });

        const proximosEventos = calendario
            .slice(1)
            .filter((linha) => {
                const data = texto(linha[1]);

                return data >= hoje;
            })
            .slice(0, 10);

        res.json({
            sucesso: true,

            indicadores: {
                alunos: alunos.length,
                professores: professores.length,
                reservasPendentes: reservasPendentes.length,
                emprestimosAtivos: emprestimosAtivos.length,
                devolucoesPendentes: devolucoesPendentes.length,
                estoqueBaixo: estoqueBaixo.length,
            },

            proximosEventos: proximosEventos.map((linha) => ({
                id: linha[0] || "",
                data: linha[1] || "",
                tipo: linha[2] || "",
                titulo: linha[3] || "",
                descricao: linha[4] || "",
                status: linha[5] || "",
            })),
        });
    } catch (erro) {
        console.error("❌ Erro no dashboard da Secretaria:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

/*
==========================================================
 USUÁRIOS
==========================================================
*/

router.get("/secretaria/usuarios", async (req, res) => {
    try {
        const dados = await carregarDadosSecretaria();

        const usuarios = dados["01_USUARIOS"] || [];
        const autorizados = dados["17_CADASTROS_AUTORIZADOS"] || [];

        const usuariosPorID = new Map();

        for (const linha of usuarios.slice(1)) {
            const usuarioID = texto(linha[0]);

            if (usuarioID) {
                usuariosPorID.set(usuarioID, {
                    usuarioID,
                    email: linha[2] || "",
                    status: texto(linha[8]).toUpperCase(),
                    tipoUsuario: linha[5] || "",
                    perfil: linha[6] || "",
                    dataCadastro: linha[9] || "",
                    ultimoLogin: linha[10] || "",
                });
            }
        }

        const lista = autorizados
            .slice(1)
            .filter((linha) => normalizar(linha[1]) === "aluno")
            .map((linha) => {
                const usuarioID = texto(linha[3]);
                const usuario = usuariosPorID.get(usuarioID);

                return {
                    usuarioID,
                    nome: linha[4] || "",
                    email: usuario?.email || "",
                    tipoUsuario: "ALUNO",
                    perfil: usuario?.perfil || "ALUNO",
                    status: usuario?.status || "INATIVO",
                    matricula: linha[2] || "",
                    ano: linha[5] || "",
                    turma: linha[6] || "",
                    turno: linha[7] || "",
                    idade: linha[8] || "",
                    statusCadastro: linha[9] || "",
                    dataCadastro: usuario?.dataCadastro || "",
                    ultimoLogin: usuario?.ultimoLogin || "",
                };
            });

        res.json({
            sucesso: true,
            usuarios: lista,
        });
    } catch (erro) {
        console.error("❌ Erro ao carregar usuários:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

/*
==========================================================
 AUTORIZAR MATRÍCULA PARA CADASTRO PRÓPRIO
==========================================================
*/

router.post("/secretaria/autorizar-matricula", async (req, res) => {
    try {
        const matricula = texto(req.body.matricula);

        if (!matricula) {
            return res.status(400).json({
                sucesso: false,
                erro: "Informe a matrícula do aluno.",
            });
        }

        if (matricula.length > 50) {
            return res.status(400).json({
                sucesso: false,
                erro: "A matrícula deve ter no máximo 50 caracteres.",
            });
        }

        const dados = await carregarDadosSecretaria();
        const autorizados = dados["17_CADASTROS_AUTORIZADOS"] || [];

        const matriculaNormalizada = normalizar(matricula);
        const jaExiste = autorizados.slice(1).some((linha) =>
            normalizar(linha[2]) === matriculaNormalizada
        );

        if (jaExiste) {
            return res.status(409).json({
                sucesso: false,
                erro: "Essa matrícula já consta na lista de cadastros autorizados.",
            });
        }

        const cadastradoID = gerarID("AUT", autorizados, 0);

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "17_CADASTROS_AUTORIZADOS!A:J",
            valueInputOption: "USER_ENTERED",
            requestBody: {
                values: [[
                    cadastradoID,
                    "ALUNO",
                    matricula,
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "PENDENTE",
                ]],
            },
        });

        limparCache();

        return res.json({
            sucesso: true,
            mensagem: "Matrícula autorizada para cadastro próprio.",
            cadastradoID,
            status: "PENDENTE",
        });
    } catch (erro) {
        console.error("Erro ao autorizar matrícula para cadastro próprio:", erro);

        return res.status(500).json({
            sucesso: false,
            erro: "Não foi possível salvar a autorização da matrícula.",
        });
    }
});

/*
==========================================================
 CADASTRAR USUÁRIO
==========================================================
*/

router.post("/secretaria/usuarios", async (req, res) => {
    try {
        const { nome, email, senha, tipoUsuario, perfil, setorID } = req.body;

        if (
            typeof nome !== "string" ||
            !nome.trim() ||
            typeof email !== "string" ||
            !email.trim() ||
            typeof senha !== "string" ||
            !senha ||
            typeof tipoUsuario !== "string" ||
            !tipoUsuario.trim()
        ) {
            return res.status(400).json({
                sucesso: false,
                erro: "Nome, e-mail, senha e tipo de usuário são obrigatórios.",
            });
        }

        const emailNormalizado = email.trim().toLowerCase();
        if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(emailNormalizado)) {
            return res.status(400).json({
                sucesso: false,
                erro: "Informe um e-mail válido.",
            });
        }

        if (senha.length < 6 || senha.length > 128) {
            return res.status(400).json({
                sucesso: false,
                erro: "A senha deve ter entre 6 e 128 caracteres.",
            });
        }

        // A conta da Secretaria pode cadastrar usuários comuns, mas não
        // conceder privilégios administrativos ou criar outras contas internas.
        const ator = req.session?.usuario;
        const tiposAdmin = ["adm", "admin", "administrador"];
        const atorEhAdmin =
            tiposAdmin.includes(normalizar(ator?.tipoUsuario)) ||
            tiposAdmin.includes(normalizar(ator?.perfil));
        const tipoNovo = normalizar(tipoUsuario);
        const perfilNovo = normalizar(perfil);

        if (
            !atorEhAdmin &&
            (!["aluno", "professor"].includes(tipoNovo) ||
                (perfilNovo && !["aluno", "professor", "consulta"].includes(perfilNovo)))
        ) {
            return res.status(403).json({
                sucesso: false,
                erro: "Somente um administrador pode criar contas privilegiadas.",
            });
        }

        const dados = await carregarDadosSecretaria();

        const usuarios = dados["01_USUARIOS"] || [];

        const existe = usuarios
            .slice(1)
            .some((linha) => normalizar(linha[2]) === emailNormalizado);

        if (existe) {
            return res.status(409).json({
                sucesso: false,
                erro: "Já existe um usuário com este e-mail.",
            });
        }

        const usuarioID = gerarID("USR", usuarios, 0);

        const salt = crypto.randomBytes(16).toString("hex");

        const senhaHash = hashSenha(senha, salt);

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,

            range: "01_USUARIOS!A:K",

            valueInputOption: "USER_ENTERED",

            requestBody: {
                values: [
                    [
                        usuarioID,
                        nome,
                        emailNormalizado,
                        senhaHash,
                        salt,
                        tipoUsuario,
                        perfil || "CONSULTA",
                        setorID || "",
                        "ATIVO",
                        agora(),
                        "",
                    ],
                ],
            },
        });

        limparCache();

        res.json({
            sucesso: true,
            mensagem: "Usuário cadastrado com sucesso.",
            usuarioID,
        });
    } catch (erro) {
        console.error("❌ Erro ao cadastrar usuário:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});


/*
==========================================================
 CADASTRAR ALUNO PELA SECRETARIA
==========================================================
*/
router.post("/secretaria/alunos", async (req, res) => {
    try {
        const identificador = texto(req.body.identificador);
        const nome = texto(req.body.nome);
        const email = texto(req.body.email).toLowerCase();
        const senha = String(req.body.senha || "");
        const ano = texto(req.body.ano);
        const turma = texto(req.body.turma);
        const turno = texto(req.body.turno);
        const idade = texto(req.body.idade);

        if (![identificador, nome, email, senha, ano, turma, turno, idade].every(Boolean)) {
            return res.status(400).json({ sucesso: false, erro: "Preencha todos os campos do aluno." });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ sucesso: false, erro: "Informe um e-mail válido." });
        }
        if (senha.length < 8 || senha.length > 128) {
            return res.status(400).json({ sucesso: false, erro: "A senha inicial deve ter entre 8 e 128 caracteres." });
        }
        if (!/^\d{1,2}$/.test(idade) || Number(idade) < 1 || Number(idade) > 120) {
            return res.status(400).json({ sucesso: false, erro: "Informe uma idade válida." });
        }

        const dados = await carregarDadosSecretaria();
        const usuarios = dados["01_USUARIOS"] || [];
        const autorizados = dados["17_CADASTROS_AUTORIZADOS"] || [];
        if (usuarios.slice(1).some(l => normalizar(l[2]) === normalizar(email))) {
            return res.status(409).json({ sucesso: false, erro: "Já existe uma conta com esse e-mail." });
        }
        if (autorizados.slice(1).some(l => normalizar(l[2]) === normalizar(identificador))) {
            return res.status(409).json({ sucesso: false, erro: "Esse identificador já está cadastrado ou autorizado." });
        }

        const usuarioID = gerarID("USR", usuarios, 0);
        const cadastradoID = gerarID("AUT", autorizados, 0);
        const salt = crypto.randomBytes(16).toString("hex");
        const senhaHash = hashSenha(senha, salt);

        const linhaUsuario = Math.max(2, usuarios.length + 1);
        const linhaAutorizado = Math.max(2, autorizados.length + 1);

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                valueInputOption: "USER_ENTERED",
                data: [
                    { range: `01_USUARIOS!A${linhaUsuario}:K${linhaUsuario}`, values: [[usuarioID, nome, email, senhaHash, salt, "ALUNO", "ALUNO", "", "ATIVO", agora(), ""]] },
                    { range: `17_CADASTROS_AUTORIZADOS!A${linhaAutorizado}:J${linhaAutorizado}`, values: [[cadastradoID, "ALUNO", identificador, usuarioID, nome, ano, turma, turno, idade, "CADASTRADO"]] }
                ]
            }
        });

        limparCache();
        return res.json({ sucesso: true, mensagem: "Aluno cadastrado nas duas abas.", usuarioID, cadastradoID });
    } catch (erro) {
        console.error("Erro ao cadastrar aluno pela Secretaria:", erro);
        return res.status(500).json({ sucesso: false, erro: "Não foi possível cadastrar o aluno." });
    }
});

/*
==========================================================
 ALTERAR ANO, TURMA E TURNO DO ALUNO
==========================================================
*/
router.patch("/secretaria/alunos/:usuarioID/turma", async (req, res) => {
    try {
        const usuarioID = texto(req.params.usuarioID);
        const ano = texto(req.body.ano);
        const turma = texto(req.body.turma);
        const turno = texto(req.body.turno);
        if (!usuarioID || !ano || !turma || !turno) {
            return res.status(400).json({ sucesso: false, erro: "Selecione o aluno e informe Ano, Turma e Turno." });
        }

        const dados = await carregarDadosSecretaria();
        const autorizados = dados["17_CADASTROS_AUTORIZADOS"] || [];
        const indice = autorizados.findIndex((linha, i) => i > 0 && texto(linha[3]) === usuarioID && normalizar(linha[1]) === "aluno");
        if (indice < 1) {
            return res.status(404).json({ sucesso: false, erro: "Não encontrei o cadastro escolar desse aluno." });
        }

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                valueInputOption: "USER_ENTERED",
                data: [
                    { range: `17_CADASTROS_AUTORIZADOS!F${indice + 1}:H${indice + 1}`, values: [[ano, turma, turno]] }
                ]
            }
        });
        limparCache();
        return res.json({ sucesso: true, mensagem: "Turma do aluno atualizada." });
    } catch (erro) {
        console.error("Erro ao mudar aluno de turma:", erro);
        return res.status(500).json({ sucesso: false, erro: "Não foi possível mudar o aluno de turma." });
    }
});

/*
==========================================================
 ALTERAR STATUS DO USUÁRIO
==========================================================
*/

router.patch("/secretaria/usuarios/:usuarioID/status", async (req, res) => {
    try {
        const usuarioID = texto(req.params.usuarioID);

        const status = texto(req.body.status).toUpperCase();

        if (!usuarioID || !status) {
            return res.status(400).json({
                sucesso: false,
                erro: "UsuarioID e status são obrigatórios.",
            });
        }

        if (!["ATIVO", "INATIVO"].includes(status)) {
            return res.status(400).json({
                sucesso: false,
                erro: "O status deve ser ATIVO ou INATIVO.",
            });
        }

        const dados = await carregarDadosSecretaria();

        const usuarios = dados["01_USUARIOS"] || [];

        const indice = usuarios.findIndex(
            (linha, index) => index > 0 && texto(linha[0]) === usuarioID,
        );

        if (indice === -1) {
            return res.status(404).json({
                sucesso: false,
                erro: "Usuário não encontrado.",
            });
        }

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,

            range: `01_USUARIOS!I${indice + 1}`,

            valueInputOption: "USER_ENTERED",

            requestBody: {
                values: [[status]],
            },
        });

        limparCache();

        res.json({
            sucesso: true,
            mensagem: "Status do usuário atualizado.",
        });
    } catch (erro) {
        console.error("❌ Erro ao alterar status:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

/*
==========================================================
 TURMAS
==========================================================
*/

router.get("/secretaria/turmas", async (req, res) => {
    try {
        const dados = await carregarDadosSecretaria();
        const turmas = dados["19_TURMAS"] || [];
        const autorizados = dados["17_CADASTROS_AUTORIZADOS"] || [];

        const chaveExata = (serie, turma, turno) =>
            [normalizarSerie(serie), normalizarTurma(turma), normalizar(turno)].join("|");
        const chaveNomeTurno = (turma, turno) =>
            [normalizarTurma(turma), normalizar(turno)].join("|");

        // Primeiro identifica as turmas cadastradas e quais nomes/turnos são únicos.
        const linhasTurmas = turmas.slice(1).map((linha) => ({
            id: texto(linha[0]),
            nome: texto(linha[1]),
            serie: texto(linha[2]),
            turno: texto(linha[3]),
            capacidade: numero(linha[4]),
            status: linha[5] || "",
        }));

        const turmasPorNomeTurno = new Map();
        for (const turma of linhasTurmas) {
            const chave = chaveNomeTurno(turma.nome, turma.turno);
            if (!turmasPorNomeTurno.has(chave)) turmasPorNomeTurno.set(chave, []);
            turmasPorNomeTurno.get(chave).push(turma);
        }

        const contagem = new Map();
        for (const turma of linhasTurmas) contagem.set(turma.id, 0);

        for (const linha of autorizados.slice(1)) {
            const tipo = normalizar(linha[1]);       // B: Tipo
            const serieAluno = texto(linha[5]);      // F: Ano
            const turmaAluno = texto(linha[6]);     // G: Turma
            const turnoAluno = texto(linha[7]);     // H: Turno
            const status = normalizar(linha[9]);    // J: Status

            if (
                tipo !== "aluno" ||
                !["cadastrado", "ativo", "autorizado"].includes(status) ||
                !turmaAluno ||
                !turnoAluno
            ) continue;

            // Correspondência exata é sempre preferida.
            const exatas = linhasTurmas.filter((turma) =>
                chaveExata(turma.serie, turma.nome, turma.turno) ===
                chaveExata(serieAluno, turmaAluno, turnoAluno)
            );

            if (exatas.length === 1) {
                contagem.set(exatas[0].id, (contagem.get(exatas[0].id) || 0) + 1);
                continue;
            }

            // Se a série estiver divergente, só usa nome+turno quando identifica
            // uma única turma; se houver ambiguidade, não atribui aluno errado.
            const candidatas = turmasPorNomeTurno.get(chaveNomeTurno(turmaAluno, turnoAluno)) || [];
            if (candidatas.length === 1) {
                contagem.set(candidatas[0].id, (contagem.get(candidatas[0].id) || 0) + 1);
            }
        }

        const lista = linhasTurmas.map((turma) => ({
            turmaID: turma.id,
            nome: turma.nome,
            serie: turma.serie,
            turno: turma.turno,
            capacidade: turma.capacidade,
            alunosAtivos: contagem.get(turma.id) || 0,
            status: turma.status,
        }));

        res.json({ sucesso: true, turmas: lista });
    } catch (erro) {
        console.error("❌ Erro ao carregar turmas:", erro);
        res.status(500).json({ sucesso: false, erro: erro.message });
    }
});

router.post("/secretaria/turmas", async (req, res) => {
    try {
        const nome = texto(req.body.nome);
        const serie = texto(req.body.serie);
        const turno = texto(req.body.turno);
        const capacidade = Number(req.body.capacidade);

        if (!nome || !serie || !turno) {
            return res.status(400).json({
                sucesso: false,
                erro: "Nome, série e turno são obrigatórios.",
            });
        }

        if (!["Manhã", "Tarde"].includes(turno)) {
            return res.status(400).json({
                sucesso: false,
                erro: "Selecione um turno válido.",
            });
        }

        if (!Number.isInteger(capacidade) || capacidade < 0 || capacidade > 500) {
            return res.status(400).json({
                sucesso: false,
                erro: "A capacidade deve ser um número inteiro entre 0 e 500.",
            });
        }

        const dados = await carregarDadosSecretaria();
        const turmas = dados["19_TURMAS"] || [];
        const duplicada = turmas.slice(1).some((linha) =>
            normalizar(linha[1]) === normalizar(nome) &&
            normalizar(linha[2]) === normalizar(serie) &&
            normalizar(linha[3]) === normalizar(turno)
        );

        if (duplicada) {
            return res.status(409).json({
                sucesso: false,
                erro: "Já existe uma turma com esse nome, série e turno.",
            });
        }

        const turmaID = gerarID("TRM", turmas, 0);

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "19_TURMAS!A:F",
            valueInputOption: "USER_ENTERED",
            requestBody: {
                values: [[turmaID, nome, serie, turno, capacidade, "ABERTO"]],
            },
        });

        limparCache();

        res.status(201).json({
            sucesso: true,
            turmaID,
        });
    } catch (erro) {
        console.error("Erro ao cadastrar turma:", erro);

        res.status(500).json({
            sucesso: false,
            erro: "Não foi possível cadastrar a turma.",
        });
    }
});

router.patch("/secretaria/turmas/:turmaID", async (req, res) => {
    try {
        const turmaID = texto(req.params.turmaID);
        const dados = await carregarDadosSecretaria();
        const turmas = dados["19_TURMAS"] || [];
        const indice = turmas.findIndex((linha, i) => i > 0 && texto(linha[0]) === turmaID);
        if (indice < 0) return res.status(404).json({ sucesso: false, erro: "Turma não encontrada." });

        const atual = turmas[indice];
        const turno = req.body.turno === undefined ? texto(atual[3]) : texto(req.body.turno);
        const capacidade = req.body.capacidade === undefined ? numero(atual[4]) : Number(req.body.capacidade);
        const status = req.body.status === undefined ? texto(atual[5]).toUpperCase() : texto(req.body.status).toUpperCase();

        if (!["Manhã", "Tarde"].includes(turno)) return res.status(400).json({ sucesso: false, erro: "Selecione Manhã ou Tarde." });
        if (!Number.isInteger(capacidade) || capacidade < 0 || capacidade > 500) return res.status(400).json({ sucesso: false, erro: "A capacidade deve ser um número inteiro entre 0 e 500." });
        if (!["ABERTO", "FECHADO"].includes(status)) return res.status(400).json({ sucesso: false, erro: "Situação inválida." });

        const autorizados = dados["17_CADASTROS_AUTORIZADOS"] || [];
        const usuarios = dados["01_USUARIOS"] || [];
        const cadastroPorUsuario = new Map(autorizados.slice(1).map((l) => [texto(l[3]), l]));
        const alunosAtivos = usuarios.slice(1).filter((u) => {
            const cadastro = cadastroPorUsuario.get(texto(u[0]));
            return normalizar(u[5]) === "aluno" && normalizar(u[8]) === "ativo" && cadastro &&
                texto(cadastro[5]) === texto(atual[2]) && texto(cadastro[6]) === texto(atual[1]) &&
                texto(cadastro[7]) === texto(atual[3]);
        }).length;
        if (capacidade < alunosAtivos) return res.status(400).json({ sucesso: false, erro: `O limite não pode ser menor que os ${alunosAtivos} alunos já matriculados.` });

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `19_TURMAS!D${indice + 1}:F${indice + 1}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [[turno, capacidade, status]] },
        });
        limparCache();
        res.json({ sucesso: true, mensagem: "Turma atualizada." });
    } catch (erro) {
        console.error("Erro ao atualizar turma:", erro);
        res.status(500).json({ sucesso: false, erro: "Não foi possível atualizar a turma." });
    }
});

/*
==========================================================
 DISCIPLINAS
==========================================================
*/

/*
==========================================================
 DISCIPLINAS
==========================================================
*/

router.get("/secretaria/disciplinas", async (req, res) => {
    try {
        const dados = await carregarDadosSecretaria();

        const disciplinas = dados["20_DISCIPLINAS"] || [];

        const lista = disciplinas
            .slice(1)
            .map((linha) => ({
                disciplinaID: linha[0] || "",
                nome: linha[1] || "",
                cargaHorariaPadrao: linha[2] || "",
                status: linha[3] || "",
            }))
            .filter(
                (disciplina) => normalizar(disciplina.status) !== "inativo",
            );

        res.json({
            sucesso: true,
            disciplinas: lista,
        });
    } catch (erro) {
        console.error("❌ Erro ao carregar disciplinas:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

/*
==========================================================
 PROFESSORES
==========================================================
*/

router.get("/secretaria/professores", async (req, res) => {
    try {
        const dados = await carregarDadosSecretaria();

        const usuarios = dados["01_USUARIOS"] || [];

        const autorizados = dados["17_CADASTROS_AUTORIZADOS"] || [];

        const vinculos = dados["21_PROFESSOR_TURMAS"] || [];

        const professores = usuarios
            .slice(1)
            .filter((linha) => normalizar(linha[5]) === "professor");

        const mapaAutorizados = new Map();

        for (const linha of autorizados.slice(1)) {
            const usuarioID = texto(linha[3]);

            if (usuarioID) {
                mapaAutorizados.set(usuarioID, linha);
            }
        }

        const mapaVinculos = new Map();

        for (const linha of vinculos.slice(1)) {
            const professorID = texto(linha[1]);

            if (!professorID) continue;

            if (!mapaVinculos.has(professorID)) {
                mapaVinculos.set(professorID, []);
            }

            mapaVinculos.get(professorID).push({
                vinculoID: linha[0] || "",
                turmaID: linha[2] || "",
                disciplinaID: linha[3] || "",
                aulasSemanais: linha[4] || "",
                status: linha[5] || "",
            });
        }

        const lista = professores.map((linha) => {
            const usuarioID = linha[0] || "";

            const cadastro = mapaAutorizados.get(usuarioID);

            return {
                usuarioID,

                nome: linha[1] || "",

                email: linha[2] || "",

                status: linha[8] || "",

                identificador: cadastro?.[2] || "",

                vinculos: mapaVinculos.get(usuarioID) || [],
            };
        });

        res.json({
            sucesso: true,
            professores: lista,
        });
    } catch (erro) {
        console.error("❌ Erro ao carregar professores:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

router.post("/secretaria/professores/cadastrar", async (req, res) => {
    try {
        const masp = texto(req.body?.masp).replace(/\s+/g, "");
        const nome = texto(req.body?.nome);
        const idade = Number(req.body?.idade);
        const email = texto(req.body?.email).toLowerCase();
        const senha = String(req.body?.senha || "");

        if (!/^\d{7}-\d$/.test(masp)) {
            return res.status(400).json({ sucesso: false, erro: "Informe um MASP válido no formato 1234567-8." });
        }
        if (!nome || !email || !Number.isInteger(idade) || idade < 18 || idade > 100 || senha.length < 12) {
            return res.status(400).json({ sucesso: false, erro: "Informe nome, e-mail válido, idade entre 18 e 100 anos e senha com pelo menos 12 caracteres." });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ sucesso: false, erro: "Informe um e-mail válido." });
        }

        const dados = await carregarDadosSecretaria();
        const autorizados = dados["17_CADASTROS_AUTORIZADOS"] || [];
        const usuarios = dados["01_USUARIOS"] || [];

        if (usuarios.slice(1).some((linha) => texto(linha[2]).toLowerCase() === email)) {
            return res.status(409).json({ sucesso: false, erro: "Este e-mail já está cadastrado." });
        }

        const indiceAutorizacao = autorizados.findIndex((linha, index) =>
            index > 0 && texto(linha[2]).replace(/\s+/g, "") === masp
        );
        let autorizacaoID = "";
        let numeroLinhaAutorizacao = 0;

        if (indiceAutorizacao >= 0) {
            const linhaAutorizacao = autorizados[indiceAutorizacao];
            const tipo = texto(linhaAutorizacao[1]).toUpperCase();
            const status = texto(linhaAutorizacao[9]).toUpperCase();
            if (tipo !== "PROFESSOR") {
                return res.status(409).json({ sucesso: false, erro: "Este MASP está registrado com outro tipo de cadastro." });
            }
            if (status === "CADASTRADO" || texto(linhaAutorizacao[3])) {
                return res.status(409).json({ sucesso: false, erro: "Este MASP já possui uma conta cadastrada." });
            }
            autorizacaoID = texto(linhaAutorizacao[0]);
            numeroLinhaAutorizacao = indiceAutorizacao + 1;
        } else {
            autorizacaoID = gerarID("AUT", autorizados, 0);
            await sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: "17_CADASTROS_AUTORIZADOS!A:J",
                valueInputOption: "RAW",
                insertDataOption: "INSERT_ROWS",
                requestBody: { values: [[autorizacaoID, "PROFESSOR", masp, "", "", "", "", "", "", "PENDENTE"]] },
            });
            numeroLinhaAutorizacao = autorizados.length + 1;
        }

        const ids = usuarios.slice(1).map((linha) => {
            const match = texto(linha[0]).match(/^USR-(\d+)$/);
            return match ? Number(match[1]) : 0;
        });
        const usuarioID = `USR-${String(Math.max(0, ...ids) + 1).padStart(5, "0")}`;
        const salt = crypto.randomBytes(16).toString("hex");
        const senhaHash = hashSenha(senha, salt);
        const dataCadastro = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "01_USUARIOS!A:K",
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            requestBody: { values: [[usuarioID, nome, email, senhaHash, salt, "PROFESSOR", "PROFESSOR", "", "ATIVO", dataCadastro, ""]] },
        });

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `17_CADASTROS_AUTORIZADOS!D${numeroLinhaAutorizacao}:J${numeroLinhaAutorizacao}`,
            valueInputOption: "RAW",
            requestBody: { values: [[usuarioID, nome, "", "", "", idade, "CADASTRADO"]] },
        });

        limparCache();
        return res.status(201).json({ sucesso: true, mensagem: "Professor cadastrado imediatamente.", usuarioID, autorizacaoID });
    } catch (erro) {
        console.error("Erro ao cadastrar professor pela Secretaria:", erro);
        return res.status(500).json({ sucesso: false, erro: "Não foi possível cadastrar o professor agora." });
    }
});

router.post("/secretaria/professores", async (req, res) => {
    try {
        const masp = texto(req.body?.masp).replace(/\s+/g, "");

        if (!/^\d{7}-\d$/.test(masp)) {
            return res.status(400).json({
                sucesso: false,
                erro: "Informe um MASP válido no formato 1234567-8.",
            });
        }

        const dados = await carregarDadosSecretaria();
        const autorizados = dados["17_CADASTROS_AUTORIZADOS"] || [];

        const duplicado = autorizados.slice(1).some((linha) =>
            texto(linha[2]).replace(/\s+/g, "") === masp
        );

        if (duplicado) {
            return res.status(409).json({
                sucesso: false,
                erro: "Este MASP já possui um registro de autorização.",
            });
        }

        // gerarID identifica o maior AUT existente e incrementa, sem reutilizar IDs apagados.
        const autorizacaoID = gerarID("AUT", autorizados, 0);

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "17_CADASTROS_AUTORIZADOS!A:J",
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            requestBody: {
                values: [[
                    autorizacaoID, // A - CadastradoID
                    "PROFESSOR",   // B - Tipo
                    masp,          // C - Identificador
                    "",            // D - UsuarioID (preenchido no cadastro)
                    "",            // E - Nome
                    "",            // F - Ano
                    "",            // G - Turma
                    "",            // H - Turno
                    "",            // I - Idade
                    "PENDENTE",    // J - Status
                ]],
            },
        });

        limparCache();

        return res.status(201).json({
            sucesso: true,
            mensagem: "MASP autorizado. O professor já pode criar a própria conta.",
            autorizacaoID,
            masp,
            status: "PENDENTE",
        });
    } catch (erro) {
        console.error("❌ Erro ao autorizar MASP do professor:", erro);
        return res.status(500).json({
            sucesso: false,
            erro: "Não foi possível autorizar o MASP do professor.",
        });
    }
});

/*
==========================================================
 VINCULAR PROFESSOR À TURMA
==========================================================
*/

router.post("/secretaria/professor-turmas", async (req, res) => {
    try {
        const { professorID, turmaID, disciplinaID, aulasSemanais } = req.body;

        
        
        
        
        
        
        
        

        if (!professorID) {
            return res.status(400).json({
                sucesso: false,
                erro: "Professor é obrigatório.",
            });
        }

        if (!turmaID) {
            return res.status(400).json({
                sucesso: false,
                erro: "Turma é obrigatória.",
            });
        }

        if (!disciplinaID) {
            return res.status(400).json({
                sucesso: false,
                erro: "Disciplina é obrigatória.",
            });
        }

        const aulas = Number(aulasSemanais);

        if (!aulas || aulas < 1) {
            return res.status(400).json({
                sucesso: false,
                erro: "Informe uma quantidade válida de aulas.",
            });
        }

        const dados = await carregarDadosSecretaria();

        const usuarios = dados["01_USUARIOS"] || [];

        const autorizados = dados["17_CADASTROS_AUTORIZADOS"] || [];

        const turmas = dados["19_TURMAS"] || [];

        const disciplinas = dados["20_DISCIPLINAS"] || [];

        const vinculos = dados["21_PROFESSOR_TURMAS"] || [];

        
        
        
        
        

        const professor = usuarios
            .slice(1)
            .find(
                (linha) =>
                    texto(linha[0]) === texto(professorID) &&
                    normalizar(linha[5]) === "professor" &&
                    normalizar(linha[8]) === "ativo",
            );

        if (!professor) {
            
            return res.status(404).json({
                sucesso: false,
                erro: "Professor não encontrado ou está inativo.",
            });
        }

        

        const cadastroProfessor = autorizados
            .slice(1)
            .find(
                (linha) =>
                    texto(linha[3]) === texto(professorID) &&
                    normalizar(linha[1]) === "professor" &&
                    normalizar(linha[9]) === "cadastrado",
            );

        if (!cadastroProfessor) {
            
        } else {
            
        }

        const turma = turmas
            .slice(1)
            .find(
                (linha) =>
                    texto(linha[0]) === texto(turmaID) &&
                    ["aberto", "ativo"].includes(normalizar(linha[5])),
            );

        if (!turma) {
            

            return res.status(404).json({
                sucesso: false,
                erro: "Turma não encontrada ou está inativa.",
            });
        }

        

        const disciplina = disciplinas
            .slice(1)
            .find(
                (linha) =>
                    texto(linha[0]) === texto(disciplinaID) &&
                    (!linha[3] ||
                        ["ativa", "ativo", "aberta"].includes(
                            normalizar(linha[3]),
                        )),
            );

        if (!disciplina) {
            

            return res.status(404).json({
                sucesso: false,
                erro: "Disciplina não encontrada ou está inativa.",
            });
        }

        

        const jaExiste = vinculos
            .slice(1)
            .some(
                (linha) =>
                    texto(linha[1]) === texto(professorID) &&
                    texto(linha[2]) === texto(turmaID) &&
                    texto(linha[3]) === texto(disciplinaID) &&
                    normalizar(linha[5]) === "ativo",
            );

        if (jaExiste) {
            

            return res.status(409).json({
                sucesso: false,
                erro: "Este professor já está vinculado a esta turma e disciplina.",
            });
        }

        const vinculoID = gerarID("VINC", vinculos, 0);

        const dadosParaGravar = [
            vinculoID,
            professorID,
            turmaID,
            disciplinaID,
            aulas,
            "ATIVO",
        ];

        
        
        
        

        const resultado = await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "21_PROFESSOR_TURMAS!A:F",
            valueInputOption: "USER_ENTERED",
            insertDataOption: "INSERT_ROWS",
            requestBody: {
                values: [dadosParaGravar],
            },
        });

        
        

        limparCache();

        return res.json({
            sucesso: true,
            mensagem: "Professor vinculado à turma com sucesso.",
            vinculoID,
            dados: dadosParaGravar,
            range: resultado.data?.updates?.updatedRange || "",
        });
    } catch (erro) {
        console.error("");
        console.error("❌ ERRO AO GRAVAR VÍNCULO:");
        console.error(erro);

        return res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

/*
==========================================================
 ACERVO
==========================================================
*/

router.get("/secretaria/acervo", async (req, res) => {
    try {
        const dados = await carregarDadosSecretaria();
        const produtos = dados["02_PRODUTOS"] || [], categorias = dados["03_CATEGORIAS"] || [];
        const subcategorias = dados["04_SUBCATEGORIAS"] || [], locais = dados["05_LOCAIS"] || [];
        const estoque = dados["06_ESTOQUE_LOCAIS"] || [];
        const mapaCategorias = new Map(categorias.slice(1).map(l => [texto(l[0]), l[1] || ""]));
        const mapaSubcategorias = new Map(subcategorias.slice(1).map(l => [texto(l[0]), l[2] || ""]));
        const mapaLocais = new Map(locais.slice(1).map(l => [texto(l[0]), {nome:l[2]||"",codigo:l[1]||"",tipo:l[3]||"",status:l[6]||""}]));
        const estoquePorProduto = new Map();
        for (const linha of estoque.slice(1)) {
            const produtoID = texto(linha[1]); if (!produtoID) continue;
            const local = mapaLocais.get(texto(linha[2]));
            const item = {estoqueID:texto(linha[0]),localID:texto(linha[2]),local:local?.nome||"Local não identificado",codigoLocal:local?.codigo||"",tipoLocal:local?.tipo||"",quantidade:numero(linha[3]),reservado:numero(linha[4]),disponivel:numero(linha[5]),indisponivel:numero(linha[6]),ultimaAtualizacao:linha[7]||"",statusLocal:linha[8]||""};
            if (!estoquePorProduto.has(produtoID)) estoquePorProduto.set(produtoID, []);
            estoquePorProduto.get(produtoID).push(item);
        }
        const lista = produtos.slice(1).filter(l=>texto(l[0])).map(linha=>{
            const produtoID=texto(linha[0]),categoriaID=texto(linha[4]),subcategoriaID=texto(linha[5]),estoques=estoquePorProduto.get(produtoID)||[];
            return {produtoID,codigo:linha[1]||"",nome:linha[2]||"",autor:linha[3]||"",categoriaID,categoria:mapaCategorias.get(categoriaID)||"Sem categoria",subcategoriaID,subcategoria:mapaSubcategorias.get(subcategoriaID)||"Sem subcategoria",estoqueMinimo:numero(linha[6]),estado:linha[7]||"",status:linha[8]||"",dataCadastro:linha[9]||"",observacao:linha[10]||"",quantidade:estoques.reduce((s,i)=>s+i.quantidade,0),reservado:estoques.reduce((s,i)=>s+i.reservado,0),disponivel:estoques.reduce((s,i)=>s+i.disponivel,0),indisponivel:estoques.reduce((s,i)=>s+i.indisponivel,0),estoques};
        });
        res.json({sucesso:true,produtos:lista,categorias:categorias.slice(1).filter(l=>texto(l[3]).toUpperCase()==="ATIVO").map(l=>({categoriaID:l[0],nome:l[1],descricao:l[2],status:l[3]})),subcategorias:subcategorias.slice(1).map(l=>({subcategoriaID:l[0],categoriaID:l[1],nome:l[2],descricao:l[3],status:l[4]})),locais:locais.slice(1).filter(l=>texto(l[6]).toUpperCase()==="ATIVO").map(l=>({localID:l[0],codigo:l[1],nome:l[2],tipo:l[3],responsavelID:l[4],descricao:l[5],status:l[6]}))});
    } catch (erro) {
        console.error("❌ Erro ao carregar acervo:", erro);
        res.status(500).json({sucesso:false,erro:erro.message});
    }
});

router.get("/secretaria/reservas", async (req, res) => {
    try {
        const dados = await carregarDadosSecretaria();

        const reservas = dados["08_RESERVAS"] || [];

        const usuarios = dados["01_USUARIOS"] || [];

        const produtos = dados["02_PRODUTOS"] || [];

        const mapaUsuarios = new Map();

        for (const linha of usuarios.slice(1)) {
            mapaUsuarios.set(texto(linha[0]), linha[1] || "");
        }

        const mapaProdutos = new Map();

        for (const linha of produtos.slice(1)) {
            mapaProdutos.set(texto(linha[0]), linha[2] || "");
        }

        const lista = reservas.slice(1).map((linha) => {
            const usuarioID = texto(linha[2]);

            const produtoID = texto(linha[3]);

            return {
                reservaID: linha[0] || "",

                dataSolicitacao: linha[1] || "",

                usuarioID,

                usuario: mapaUsuarios.get(usuarioID) || "",

                produtoID,

                produto: mapaProdutos.get(produtoID) || "",

                localID: linha[4] || "",

                quantidade: numero(linha[5]),

                dataInicio: linha[6] || "",

                dataFim: linha[7] || "",

                motivo: linha[8] || "",

                status: linha[9] || "",

                aprovadoPor: linha[10] || "",

                observacao: linha[11] || "",
            };
        });

        res.json({
            sucesso: true,
            reservas: lista,
        });
    } catch (erro) {
        console.error("❌ Erro ao carregar reservas:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

/*
==========================================================
 APROVAR RESERVA
==========================================================
*/

router.patch("/secretaria/reservas/:reservaID/aprovar", async (req, res) => {
    try {
        const reservaID = texto(req.params.reservaID);

        const aprovadoPor = texto(req.body.aprovadoPor);

        const dados = await carregarDadosSecretaria();

        const reservas = dados["08_RESERVAS"] || [];

        const indice = reservas.findIndex(
            (linha, index) => index > 0 && texto(linha[0]) === reservaID,
        );

        if (indice === -1) {
            return res.status(404).json({
                sucesso: false,
                erro: "Reserva não encontrada.",
            });
        }

        const linha = indice + 1;

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,

            range: `08_RESERVAS!J${linha}:K${linha}`,

            valueInputOption: "USER_ENTERED",

            requestBody: {
                values: [["APROVADA", aprovadoPor]],
            },
        });

        limparCache();

        res.json({
            sucesso: true,
            mensagem: "Reserva aprovada.",
        });
    } catch (erro) {
        console.error("❌ Erro ao aprovar reserva:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

/*
==========================================================
 CANCELAR RESERVA
==========================================================
*/

router.patch("/secretaria/reservas/:reservaID/cancelar", async (req, res) => {
    try {
        const reservaID = texto(req.params.reservaID);

        const dados = await carregarDadosSecretaria();

        const reservas = dados["08_RESERVAS"] || [];

        const indice = reservas.findIndex(
            (linha, index) => index > 0 && texto(linha[0]) === reservaID,
        );

        if (indice === -1) {
            return res.status(404).json({
                sucesso: false,
                erro: "Reserva não encontrada.",
            });
        }

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,

            range: `08_RESERVAS!J${indice + 1}`,

            valueInputOption: "USER_ENTERED",

            requestBody: {
                values: [["CANCELADA"]],
            },
        });

        limparCache();

        res.json({
            sucesso: true,
            mensagem: "Reserva cancelada.",
        });
    } catch (erro) {
        console.error("❌ Erro ao cancelar reserva:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

/*
==========================================================
 RECUSAR RESERVA
==========================================================
*/

router.patch("/secretaria/reservas/:reservaID/recusar", async (req, res) => {
    try {
        const reservaID = texto(req.params.reservaID);
        const dados = await carregarDadosSecretaria();
        const reservas = dados["08_RESERVAS"] || [];
        const indice = reservas.findIndex(
            (linha, index) => index > 0 && texto(linha[0]) === reservaID,
        );

        if (indice === -1) {
            return res.status(404).json({ sucesso: false, erro: "Reserva não encontrada." });
        }

        if (texto(reservas[indice][9]).toUpperCase() !== "PENDENTE") {
            return res.status(409).json({ sucesso: false, erro: "Somente reservas pendentes podem ser recusadas." });
        }

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `08_RESERVAS!J${indice + 1}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [["RECUSADA"]] },
        });

        limparCache();
        return res.json({ sucesso: true, mensagem: "Reserva recusada." });
    } catch (erro) {
        console.error("❌ Erro ao recusar reserva:", erro);
        return res.status(500).json({ sucesso: false, erro: erro.message });
    }
});

/*
==========================================================
 EMPRÉSTIMOS
==========================================================
*/

router.get("/secretaria/emprestimos", async (req, res) => {
    try {
        const dados = await carregarDadosSecretaria();

        const emprestimos = dados["09_EMPRESTIMOS"] || [];

        const usuarios = dados["01_USUARIOS"] || [];

        const produtos = dados["02_PRODUTOS"] || [];

        const mapaUsuarios = new Map();

        for (const linha of usuarios.slice(1)) {
            mapaUsuarios.set(texto(linha[0]), linha[1] || "");
        }

        const mapaProdutos = new Map();

        for (const linha of produtos.slice(1)) {
            mapaProdutos.set(texto(linha[0]), linha[2] || "");
        }

        const lista = emprestimos.slice(1).map((linha) => {
            const usuarioID = texto(linha[1]);

            const produtoID = texto(linha[2]);

            return {
                emprestimoID: linha[0] || "",

                usuarioID,

                usuario: mapaUsuarios.get(usuarioID) || "",

                produtoID,

                produto: mapaProdutos.get(produtoID) || "",

                dataRetirada: linha[3] || "",

                dataPrevista: linha[4] || "",

                dataDevolucao: linha[5] || "",

                quantidade: numero(linha[6]),

                status: linha[7] || "",

                observacao: linha[8] || "",
            };
        });

        res.json({
            sucesso: true,
            emprestimos: lista,
        });
    } catch (erro) {
        console.error("❌ Erro ao carregar empréstimos:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

/*
==========================================================
 DEVOLUÇÕES
==========================================================
*/

router.post("/secretaria/devolucoes", async (req, res) => {
    try {
        const {
            emprestimoID,
            usuarioID,
            produtoID,
            quantidade,
            observacao,
            estado,
        } = req.body;

        if (!emprestimoID) {
            return res.status(400).json({
                sucesso: false,
                erro: "EmprestimoID é obrigatório.",
            });
        }

        const dados = await carregarDadosSecretaria();

        const devolucoes = dados["10_DEVOLUCOES"] || [];

        const devolucaoID = gerarID("DEV", devolucoes, 0);

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,

            range: "10_DEVOLUCOES!A:K",

            valueInputOption: "USER_ENTERED",

            requestBody: {
                values: [
                    [
                        devolucaoID,
                        emprestimoID,
                        usuarioID || "",
                        produtoID || "",
                        quantidade || 1,
                        agora(),
                        estado || "BOM",
                        observacao || "",
                        "CONCLUIDA",
                        "",
                        "",
                    ],
                ],
            },
        });
        

        limparCache();

        res.json({
            sucesso: true,
            devolucaoID,
        });
    } catch (erro) {
        console.error("❌ Erro ao registrar devolução:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

/*
==========================================================
 MOVIMENTAÇÕES
==========================================================
*/

router.get("/secretaria/movimentacoes", async (req, res) => {
    try {
        const dados = await carregarDadosSecretaria();

        const movimentacoes = dados["07_MOVIMENTACOES"] || [];

        const usuarios = dados["01_USUARIOS"] || [];

        const produtos = dados["02_PRODUTOS"] || [];

        const mapaUsuarios = new Map();

        for (const linha of usuarios.slice(1)) {
            mapaUsuarios.set(texto(linha[0]), linha[1] || "");
        }

        const mapaProdutos = new Map();

        for (const linha of produtos.slice(1)) {
            mapaProdutos.set(texto(linha[0]), linha[2] || "");
        }

        const lista = movimentacoes.slice(1).map((linha) => {
            const usuarioID = texto(linha[1]);

            const produtoID = texto(linha[2]);

            return {
                movimentacaoID: linha[0] || "",

                usuarioID,

                usuario: mapaUsuarios.get(usuarioID) || "",

                produtoID,

                produto: mapaProdutos.get(produtoID) || "",

                tipo: linha[3] || "",

                quantidade: numero(linha[4]),

                data: linha[5] || "",

                localOrigem: linha[6] || "",

                localDestino: linha[7] || "",

                observacao: linha[8] || "",
            };
        });

        res.json({
            sucesso: true,
            movimentacoes: lista,
        });
    } catch (erro) {
        console.error("❌ Erro ao carregar movimentações:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});


/* =========================================================
   BLOQUEIOS DE SETOR E DENÚNCIAS DA SECRETARIA
   Retorna cabeçalhos e registros existentes nas abas.
========================================================= */

/* Bloquear ou desbloquear usuário a partir do modal da Secretaria. */
router.patch("/secretaria/bloqueios-setor/:bloqueioID/status", async (req, res) => {
    try {
        const bloqueioID = texto(req.params.bloqueioID);
        const acao = texto(req.body?.acao).toUpperCase();
        if (!bloqueioID || !["BLOQUEAR", "DESBLOQUEAR"].includes(acao)) {
            return res.status(400).json({ sucesso: false, erro: "Informe o registro e uma ação válida." });
        }
        const dados = await carregarDadosSecretaria();
        const bloqueios = dados["22_BLOQUEIOS_SETOR"] || [];
        const usuarios = dados["01_USUARIOS"] || [];
        if (!bloqueios.length || !usuarios.length) {
            return res.status(400).json({ sucesso: false, erro: "As abas de bloqueios ou usuários não possuem cabeçalhos." });
        }
        const normalizarCabecalho = (valor) => String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\s-]/g, "").trim().toLocaleLowerCase("pt-BR");
        const colunasBloqueio = bloqueios[0];
        const colunasUsuario = usuarios[0];
        const indiceID = colunasBloqueio.findIndex((c) => ["bloqueioid", "registroid", "id"].includes(normalizarCabecalho(c)));
        const indiceUsuarioID = colunasBloqueio.findIndex((c) => ["usuariobloqueadoid", "usuarioid", "userid", "idusuario"].includes(normalizarCabecalho(c)));
        const indiceStatus = colunasBloqueio.findIndex((c) => ["status", "situacao"].includes(normalizarCabecalho(c)));
        const indiceStatusUsuario = colunasUsuario.findIndex((c) => ["status", "situacao"].includes(normalizarCabecalho(c)));
        const indiceIDUsuario = colunasUsuario.findIndex((c) => ["usuarioid", "userid", "idusuario"].includes(normalizarCabecalho(c)));
        if (indiceID < 0 || indiceUsuarioID < 0 || indiceStatus < 0 || indiceStatusUsuario < 0 || indiceIDUsuario < 0) {
            return res.status(400).json({ sucesso: false, erro: "Confira os cabeçalhos BloqueioID, UsuarioID e Status nas abas 22_BLOQUEIOS_SETOR e 01_USUARIOS." });
        }
        const linhaBloqueio = bloqueios.findIndex((linha, i) => i > 0 && texto(linha[indiceID]) === bloqueioID);
        if (linhaBloqueio < 1) return res.status(404).json({ sucesso: false, erro: "Registro de bloqueio não encontrado." });
        const usuarioID = texto(bloqueios[linhaBloqueio][indiceUsuarioID]);
        if (!usuarioID) return res.status(400).json({ sucesso: false, erro: "O registro não possui UsuarioID vinculado." });
        const linhaUsuario = usuarios.findIndex((linha, i) => i > 0 && texto(linha[indiceIDUsuario]) === usuarioID);
        if (linhaUsuario < 1) return res.status(404).json({ sucesso: false, erro: "Usuário vinculado não encontrado." });
        const novoStatusBloqueio = acao === "BLOQUEAR" ? "BLOQUEADO" : "INATIVO";
        const novoStatusUsuario = acao === "BLOQUEAR" ? "INATIVO" : "ATIVO";
        const colunaA1 = (numero) => {
            let resultado = "";
            while (numero > 0) {
                const resto = (numero - 1) % 26;
                resultado = String.fromCharCode(65 + resto) + resultado;
                numero = Math.floor((numero - 1) / 26);
            }
            return resultado;
        };
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                valueInputOption: "USER_ENTERED",
                data: [
                    { range: "22_BLOQUEIOS_SETOR!" + colunaA1(indiceStatus + 1) + (linhaBloqueio + 1), values: [[novoStatusBloqueio]] },
                    { range: "01_USUARIOS!" + colunaA1(indiceStatusUsuario + 1) + (linhaUsuario + 1), values: [[novoStatusUsuario]] },
                ],
            },
        });
        limparCache();
        return res.json({ sucesso: true, statusBloqueio: novoStatusBloqueio, statusUsuario: novoStatusUsuario, mensagem: acao === "BLOQUEAR" ? "Usuário bloqueado." : "Usuário desbloqueado." });
    } catch (erro) {
        console.error("Erro ao alterar bloqueio do usuário:", erro);
        return res.status(500).json({ sucesso: false, erro: erro.message || "Não foi possível alterar o bloqueio." });
    }
});

router.get("/secretaria/bloqueios-setor", async (req, res) => {
    try {
        const dados = await carregarDadosSecretaria();
        const linhas = dados["22_BLOQUEIOS_SETOR"] || [];
        return res.json({
            sucesso: true,
            colunas: linhas[0] || [],
            registros: linhas.slice(1).filter((linha) => linha.some((valor) => texto(valor) !== "")),
        });
    } catch (erro) {
        console.error("Erro ao carregar bloqueios de setor:", erro);
        return res.status(500).json({ sucesso: false, erro: erro.message });
    }
});

router.get("/secretaria/denuncias", async (req, res) => {
    try {
        const dados = await carregarDadosSecretaria();
        const linhas = dados["23_DENUNCIAS_SECRETARIA"] || [];
        return res.json({
            sucesso: true,
            colunas: linhas[0] || [],
            registros: linhas.slice(1).filter((linha) => linha.some((valor) => texto(valor) !== "")),
        });
    } catch (erro) {
        console.error("Erro ao carregar denúncias da Secretaria:", erro);
        return res.status(500).json({ sucesso: false, erro: erro.message });
    }
});

router.patch("/secretaria/denuncias/:denunciaID/resposta", async (req, res) => {
    try {
        const denunciaID = texto(req.params.denunciaID);
        const respostaSecretaria = String(req.body?.respostaSecretaria || "").trim();
        if (!denunciaID) {
            return res.status(400).json({ sucesso: false, erro: "ID da denúncia não informado." });
        }
        if (!respostaSecretaria) {
            return res.status(400).json({ sucesso: false, erro: "Digite a resposta da Secretaria." });
        }

        const resposta = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "23_DENUNCIAS_SECRETARIA!A:Z",
        });
        const linhas = resposta.data.values || [];
        if (!linhas.length) {
            return res.status(400).json({ sucesso: false, erro: "A aba de denúncias está vazia ou não possui cabeçalhos." });
        }

        const normalizarCabecalho = (valor) => String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\s-]/g, "").trim().toLocaleLowerCase("pt-BR");
        const indiceID = linhas[0].findIndex((c) => normalizarCabecalho(c) === "denunciaid");
        let indiceResposta = linhas[0].findIndex((c) => normalizarCabecalho(c) === "respostasecretaria");
        const indiceDataAnalise = linhas[0].findIndex((c) => normalizarCabecalho(c) === "dataanalise");
        const indiceStatus = linhas[0].findIndex((c) => normalizarCabecalho(c) === "status");

        if (indiceID < 0) {
            return res.status(400).json({ sucesso: false, erro: "Adicione a coluna DenunciaID na aba 23_DENUNCIAS_SECRETARIA." });
        }
        if (indiceDataAnalise < 0) {
            return res.status(400).json({ sucesso: false, erro: "Não encontrei o cabeçalho DataAnalise na aba 23_DENUNCIAS_SECRETARIA. Confira a primeira linha da planilha." });
        }
        if (indiceResposta < 0) {
            // Cria o cabeçalho na primeira coluna livre, preservando a coluna M (DataAnalise).
            let ultimaColunaPreenchida = linhas[0].length - 1;
            while (ultimaColunaPreenchida >= 0 && !texto(linhas[0][ultimaColunaPreenchida])) {
                ultimaColunaPreenchida--;
            }
            indiceResposta = Math.max(ultimaColunaPreenchida + 1, 13);
            const colunaA1 = (numero) => {
                let resultado = "";
                while (numero > 0) {
                    const resto = (numero - 1) % 26;
                    resultado = String.fromCharCode(65 + resto) + resultado;
                    numero = Math.floor((numero - 1) / 26);
                }
                return resultado;
            };
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: "23_DENUNCIAS_SECRETARIA!" + colunaA1(indiceResposta + 1) + "1",
                valueInputOption: "RAW",
                requestBody: { values: [["RespostaSecretaria"]] },
            });
            linhas[0][indiceResposta] = "RespostaSecretaria";
        }
        if (indiceStatus < 0) {
            return res.status(400).json({ sucesso: false, erro: "Adicione a coluna Status na aba 23_DENUNCIAS_SECRETARIA." });
        }

        const indiceLinha = linhas.findIndex((linha, i) => i > 0 && texto(linha[indiceID]) === denunciaID);
        if (indiceLinha < 1) {
            return res.status(404).json({ sucesso: false, erro: "Denúncia não encontrada na planilha." });
        }

        const colunaA1 = (numero) => {
            let resultado = "";
            while (numero > 0) {
                const resto = (numero - 1) % 26;
                resultado = String.fromCharCode(65 + resto) + resultado;
                numero = Math.floor((numero - 1) / 26);
            }
            return resultado;
        };
        const numeroLinhaPlanilha = indiceLinha + 1;
        const celulaResposta = colunaA1(indiceResposta + 1) + numeroLinhaPlanilha;
        const celulaDataAnalise = colunaA1(indiceDataAnalise + 1) + numeroLinhaPlanilha;
        const celulaStatus = colunaA1(indiceStatus + 1) + numeroLinhaPlanilha;
        const dataAnalise = agora();

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                valueInputOption: "USER_ENTERED",
                data: [
                    {
                        range: "23_DENUNCIAS_SECRETARIA!" + celulaResposta,
                        values: [[respostaSecretaria]],
                    },
                    {
                        range: "23_DENUNCIAS_SECRETARIA!" + celulaDataAnalise,
                        values: [[dataAnalise]],
                    },
                    {
                        range: "23_DENUNCIAS_SECRETARIA!" + celulaStatus,
                        values: [["RESOLVIDO"]],
                    },
                ],
            },
        });
        limparCache();
        return res.json({ sucesso: true, mensagem: "Resposta da Secretaria salva." });
    } catch (erro) {
        console.error("Erro ao salvar resposta da denúncia:", erro);
        return res.status(500).json({ sucesso: false, erro: erro.message || "Não foi possível salvar a resposta." });
    }
});

/*
==========================================================
 CALENDÁRIO
==========================================================
*/

router.get("/secretaria/calendario", async (req, res) => {
    try {
        const dados = await carregarDadosSecretaria();

        const calendario = dados["18_CALENDARIO_ESCOLAR"] || [];

        const lista = calendario.slice(1).map((linha) => ({
            id: linha[0] || "",

            data: linha[1] || "",

            tipo: linha[2] || "",

            titulo: linha[3] || "",

            descricao: linha[4] || "",

            status: linha[5] || "",

            observacao: linha[6] || "",
        }));

        res.json({
            sucesso: true,
            eventos: lista,
        });
    } catch (erro) {
        console.error("❌ Erro ao carregar calendário:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

router.post("/secretaria/calendario", async (req, res) => {
    try {
        const { data, tipo, titulo, descricao, status } = req.body;

        if (!data || !titulo) {
            return res.status(400).json({
                sucesso: false,
                erro: "Data e título são obrigatórios.",
            });
        }

        const dados = await carregarDadosSecretaria();

        const calendario = dados["18_CALENDARIO_ESCOLAR"] || [];

        const id = gerarID("CAL", calendario, 0);

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,

            range: "18_CALENDARIO_ESCOLAR!A:G",

            valueInputOption: "USER_ENTERED",

            requestBody: {
                values: [
                    [
                        id,
                        data,
                        tipo || "EVENTO",
                        titulo,
                        descricao || "",
                        status || "ATIVO",
                        "",
                    ],
                ],
            },
        });

        limparCache();

        res.json({
            sucesso: true,
            id,
        });
    } catch (erro) {
        console.error("❌ Erro ao cadastrar evento:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

/*
==========================================================
 AVISOS / COMUNICADOS
==========================================================
*/

router.get("/secretaria/avisos", async (req, res) => {
    try {
        const dados = await carregarDadosSecretaria();
        const linhas = dados["24_AVISOS_SISTEMA"] || [];

        const avisos = linhas.slice(1)
            .filter((linha) => texto(linha[0]) && normalizar(linha[7]) === "publicado")
            .map((linha) => ({
                id: texto(linha[0]),
                titulo: texto(linha[1]),
                mensagem: texto(linha[2]),
                prioridade: texto(linha[3]),
                destinatarios: texto(linha[4]),
                autorID: texto(linha[5]),
                dataPublicacao: texto(linha[6]),
                status: texto(linha[7]),
            }))
            .reverse();

        return res.json({ sucesso: true, avisos });
    } catch (erro) {
        console.error("Erro ao carregar avisos:", erro);
        return res.status(500).json({
            sucesso: false,
            erro: "Não foi possível carregar os avisos.",
        });
    }
});

router.post("/secretaria/avisos", async (req, res) => {
    try {
        const usuario = req.session?.usuario;

        if (!usuario) {
            return res.status(401).json({
                sucesso: false,
                erro: "Faça login para publicar avisos.",
            });
        }

        if (!usuarioTemPermissao(usuario)) {
            return res.status(403).json({
                sucesso: false,
                erro: "Somente a Secretaria e o ADM podem publicar avisos.",
            });
        }

        const titulo = texto(req.body?.titulo);
        const mensagem = texto(req.body?.mensagem);
        const prioridade = normalizar(req.body?.prioridade || "NORMAL");
        const valorDestinatarios = req.body?.destinatarios ?? req.body?.destinatario;

        if (!titulo || titulo.length > 150) {
            return res.status(400).json({
                sucesso: false,
                erro: "Informe um título com até 150 caracteres.",
            });
        }

        if (!mensagem || mensagem.length > 10000) {
            return res.status(400).json({
                sucesso: false,
                erro: "Informe uma mensagem com até 10.000 caracteres.",
            });
        }

        if (!["normal", "urgente"].includes(prioridade)) {
            return res.status(400).json({
                sucesso: false,
                erro: "A prioridade deve ser Normal ou Urgente.",
            });
        }

        const permitidos = ["TODOS", "ALUNO", "PROFESSOR", "RESPONSAVEL", "SECRETARIA", "ADM"];
        const entrada = Array.isArray(valorDestinatarios)
            ? valorDestinatarios
            : [valorDestinatarios];

        const destinatarios = [...new Set(
            entrada
                .map((valor) => texto(valor).toUpperCase())
                .filter(Boolean)
        )];

        if (
            !destinatarios.length ||
            destinatarios.some((valor) => !permitidos.includes(valor)) ||
            (destinatarios.includes("TODOS") && destinatarios.length > 1)
        ) {
            return res.status(400).json({
                sucesso: false,
                erro: "Selecione destinatários válidos.",
            });
        }

        const resposta = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "24_AVISOS_SISTEMA!A:H",
        });

        const linhas = resposta.data.values || [];
        const cabecalhosEsperados = [
            "AvisoID", "Titulo", "Mensagem", "Prioridade",
            "Destinatarios", "AutorID", "DataPublicacao", "Status",
        ];

        if (
            !linhas.length ||
            cabecalhosEsperados.some((cabecalho, indice) =>
                texto(linhas[0][indice]) !== cabecalho
            )
        ) {
            return res.status(400).json({
                sucesso: false,
                erro: "Confira os cabeçalhos A:H da aba 24_AVISOS_SISTEMA.",
            });
        }

        const id = gerarID("AVI", linhas, 0);
        const autorID = texto(usuario.usuarioID || usuario.id || usuario.UsuarioID);

        const aviso = [
            id,
            titulo,
            mensagem,
            prioridade.toUpperCase(),
            destinatarios.join(","),
            autorID,
            agora(),
            "PUBLICADO",
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "24_AVISOS_SISTEMA!A:H",
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            requestBody: { values: [aviso] },
        });

        limparCache();

        return res.status(201).json({
            sucesso: true,
            mensagem: "Aviso publicado com sucesso.",
            aviso: {
                id,
                titulo,
                mensagem,
                prioridade: prioridade.toUpperCase(),
                destinatarios: destinatarios.join(","),
                autorID,
                dataPublicacao: aviso[6],
                status: "PUBLICADO",
            },
        });
    } catch (erro) {
        console.error("Erro ao publicar aviso:", erro);
        return res.status(500).json({
            sucesso: false,
            erro: "Não foi possível publicar o aviso.",
        });
    }
});

/*
==========================================================
 CARDÁPIO
==========================================================
*/

router.get("/secretaria/cardapio", async (req, res) => {
    try {
        /*
            A planilha atual fornecida não possui
            uma aba específica de CARDÁPIO.

            Portanto retornamos vazio até existir
            uma estrutura própria para isso.
            */

        res.json({
            sucesso: true,
            cardapio: [],
        });
    } catch (erro) {
        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

router.put("/secretaria/cardapio", async (req, res) => {
    res.status(501).json({
        sucesso: false,
        erro: "O cardápio ainda não possui uma aba própria configurada na planilha.",
    });
});

/*
==========================================================
 CONFIGURAÇÕES
==========================================================
*/

router.get("/secretaria/configuracoes", async (req, res) => {
    try {
        const dados = await carregarDadosSecretaria();

        const configuracoes = dados["14_CONFIGURACOES"] || [];

        const lista = configuracoes.slice(1).map((linha) => ({
            chave: linha[0] || "",

            valor: linha[1] || "",

            descricao: linha[2] || "",

            tipo: linha[3] || "",

            status: linha[4] || "",

            observacao: linha[5] || "",
        }));

        res.json({
            sucesso: true,
            configuracoes: lista,
        });
    } catch (erro) {
        console.error("❌ Erro ao carregar configurações:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

router.put("/secretaria/configuracoes", async (req, res) => {
    try {
        const { chave, valor } = req.body;

        if (!chave) {
            return res.status(400).json({
                sucesso: false,
                erro: "Chave da configuração é obrigatória.",
            });
        }

        const dados = await carregarDadosSecretaria();

        const configuracoes = dados["14_CONFIGURACOES"] || [];

        const indice = configuracoes.findIndex(
            (linha, index) =>
                index > 0 && normalizar(linha[0]) === normalizar(chave),
        );

        if (indice === -1) {
            return res.status(404).json({
                sucesso: false,
                erro: "Configuração não encontrada.",
            });
        }

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,

            range: `14_CONFIGURACOES!B${indice + 1}`,

            valueInputOption: "USER_ENTERED",

            requestBody: {
                values: [[valor ?? ""]],
            },
        });

        limparCache();

        res.json({
            sucesso: true,
            mensagem: "Configuração atualizada.",
        });
    } catch (erro) {
        console.error("❌ Erro ao alterar configuração:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

/*
==========================================================
 LOGS / AUDITORIA
==========================================================
*/

router.get("/secretaria/logs", async (req, res) => {
    try {
        const dados = await carregarDadosSecretaria();

        const logs = dados["13_LOGS"] || [];

        const lista = logs.slice(1).map((linha) => ({
            id: linha[0] || "",

            usuarioID: linha[1] || "",

            acao: linha[2] || "",

            entidade: linha[3] || "",

            registroID: linha[4] || "",

            data: linha[5] || "",

            detalhes: linha[6] || "",

            ip: linha[7] || "",
        }));

        res.json({
            sucesso: true,
            logs: lista,
        });
    } catch (erro) {
        console.error("❌ Erro ao carregar logs:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

/*
==========================================================
 ROTA DE TESTE
==========================================================
*/

router.get("/secretaria/teste", async (req, res) => {
    try {
        await carregarDadosSecretaria();

        res.json({
            sucesso: true,
            mensagem:
                "Rotas da Secretaria funcionando e Google Sheets conectado.",
        });
    } catch (erro) {
        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

/*
==========================================================
 EXPORTAÇÃO
==========================================================
*/

async function validarProfessor(usuarioID) {
    const resposta = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: "17_CADASTROS_AUTORIZADOS!A:J",
    });

    const linhas = resposta.data.values || [];

    const professor = linhas.slice(1).find((linha) => {
        const tipo = String(linha[1] || "")
            .trim()
            .toUpperCase();

        const usuario = String(linha[3] || "").trim();

        const status = String(linha[9] || "")
            .trim()
            .toUpperCase();

        return (
            tipo === "PROFESSOR" &&
            usuario === usuarioID &&
            status === "CADASTRADO"
        );
    });

    if (!professor) {
        return null;
    }

    return {
        cadastradoID: professor[0] || "",
        tipo: professor[1] || "",
        identificador: professor[2] || "",
        usuarioID: professor[3] || "",
        nome: professor[4] || "",
        status: professor[9] || "",
    };
}

module.exports = router;
