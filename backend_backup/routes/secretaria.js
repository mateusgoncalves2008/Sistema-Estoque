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
        .trim()
        .toLowerCase();
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
    return crypto.createHash("sha256").update(`${salt}:${senha}`).digest("hex");
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
    ];

    console.log("📊 Carregando dados da Secretaria...");

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

    console.log("✅ Dados da Secretaria carregados com uma única requisição.");

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

    return (
        tipo === "funcionario" ||
        tipo === "secretaria" ||
        perfil === "secretaria"
    );
}

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

        const mapaAutorizados = new Map();

        for (const linha of autorizados.slice(1)) {
            const usuarioID = texto(linha[3]);

            if (usuarioID) {
                mapaAutorizados.set(usuarioID, {
                    autorizacaoID: linha[0] || "",
                    tipo: linha[1] || "",
                    identificador: linha[2] || "",
                    nome: linha[4] || "",
                    ano: linha[5] || "",
                    turma: linha[6] || "",
                    turno: linha[7] || "",
                    idade: linha[8] || "",
                    status: linha[9] || "",
                });
            }
        }

        const lista = usuarios.slice(1).map((linha) => {
            const usuarioID = linha[0] || "";

            const cadastro = mapaAutorizados.get(usuarioID);

            return {
                usuarioID,

                nome: linha[1] || "",

                email: linha[2] || "",

                tipoUsuario: linha[5] || "",

                perfil: linha[6] || "",

                setorID: linha[7] || "",

                status: linha[8] || "",

                dataCadastro: linha[9] || "",

                ultimoLogin: linha[10] || "",

                matricula: cadastro?.identificador || "",

                ano: cadastro?.ano || "",

                turma: cadastro?.turma || "",

                turno: cadastro?.turno || "",

                idade: cadastro?.idade || "",

                statusCadastro: cadastro?.status || "",
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
 CADASTRAR USUÁRIO
==========================================================
*/

router.post("/secretaria/usuarios", async (req, res) => {
    try {
        const { nome, email, senha, tipoUsuario, perfil, setorID } = req.body;

        if (!nome || !email || !senha || !tipoUsuario) {
            return res.status(400).json({
                sucesso: false,
                erro: "Nome, e-mail, senha e tipo de usuário são obrigatórios.",
            });
        }

        const dados = await carregarDadosSecretaria();

        const usuarios = dados["01_USUARIOS"] || [];

        const emailNormalizado = normalizar(email);

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
 ALTERAR STATUS DO USUÁRIO
==========================================================
*/

router.patch("/secretaria/usuarios/:usuarioID/status", async (req, res) => {
    try {
        const usuarioID = texto(req.params.usuarioID);

        const status = texto(req.body.status);

        if (!usuarioID || !status) {
            return res.status(400).json({
                sucesso: false,
                erro: "UsuarioID e status são obrigatórios.",
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

        const usuarios = dados["01_USUARIOS"] || [];

        const alunos = usuarios
            .slice(1)
            .filter(
                (linha) =>
                    normalizar(linha[5]) === "aluno" &&
                    normalizar(linha[8]) === "ativo",
            );

        const autorizados = dados["17_CADASTROS_AUTORIZADOS"] || [];

        const mapaAlunos = new Map();

        for (const linha of autorizados.slice(1)) {
            const id = texto(linha[3]);

            if (id) {
                mapaAlunos.set(id, {
                    ano: linha[5] || "",
                    turma: linha[6] || "",
                    turno: linha[7] || "",
                });
            }
        }

        const contagem = new Map();

        for (const aluno of alunos) {
            const cadastro = mapaAlunos.get(texto(aluno[0]));

            if (!cadastro) continue;

            const chave = `${cadastro.ano}|${cadastro.turma}|${cadastro.turno}`;

            contagem.set(chave, (contagem.get(chave) || 0) + 1);
        }

        const lista = turmas.slice(1).map((linha) => {
            const id = linha[0] || "";

            const nome = linha[1] || "";

            const serie = linha[2] || "";

            const turno = linha[3] || "";

            const capacidade = numero(linha[4]);

            const chave = `${serie}|${nome}|${turno}`;

            return {
                turmaID: id,

                nome,

                serie,

                turno,

                capacidade,

                alunosAtivos: contagem.get(chave) || 0,

                status: linha[6] || "",
            };
        });

        res.json({
            sucesso: true,
            turmas: lista,
        });
    } catch (erro) {
        console.error("❌ Erro ao carregar turmas:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

router.post("/secretaria/turmas", async (req, res) => {
    try {
        const { nome, serie, turno, capacidade } = req.body;

        if (!nome || !serie || !turno) {
            return res.status(400).json({
                sucesso: false,
                erro: "Nome, série e turno são obrigatórios.",
            });
        }

        const dados = await carregarDadosSecretaria();

        const turmas = dados["19_TURMAS"] || [];

        const turmaID = gerarID("TRM", turmas, 0);

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,

            range: "19_TURMAS!A:G",

            valueInputOption: "USER_ENTERED",

            requestBody: {
                values: [
                    [turmaID, nome, serie, turno, capacidade || 0, 0, "ATIVO"],
                ],
            },
        });

        limparCache();

        res.json({
            sucesso: true,
            turmaID,
        });
    } catch (erro) {
        console.error("❌ Erro ao cadastrar turma:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
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

router.post("/secretaria/professores", async (req, res) => {
    try {
        const { nome, email, senha, masp } = req.body;

        if (!nome || !email || !senha) {
            return res.status(400).json({
                sucesso: false,
                erro: "Nome, e-mail e senha são obrigatórios.",
            });
        }

        const dados = await carregarDadosSecretaria();

        const usuarios = dados["01_USUARIOS"] || [];

        const autorizados = dados["17_CADASTROS_AUTORIZADOS"] || [];

        const usuarioID = gerarID("USR", usuarios, 0);

        const autorizacaoID = gerarID("AUT", autorizados, 0);

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
                        normalizar(email),
                        senhaHash,
                        salt,
                        "PROFESSOR",
                        "CONSULTA",
                        "",
                        "ATIVO",
                        agora(),
                        "",
                    ],
                ],
            },
        });

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,

            range: "17_CADASTROS_AUTORIZADOS!A:J",

            valueInputOption: "USER_ENTERED",

            requestBody: {
                values: [
                    [
                        autorizacaoID,
                        "PROFESSOR",
                        masp || "",
                        usuarioID,
                        nome,
                        "",
                        "",
                        "",
                        "",
                        "CADASTRADO",
                    ],
                ],
            },
        });

        limparCache();

        res.json({
            sucesso: true,
            usuarioID,
            autorizacaoID,
        });
    } catch (erro) {
        console.error("❌ Erro ao cadastrar professor:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
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

        console.log("");
        console.log("==========================================");
        console.log("🔗 NOVO VÍNCULO PROFESSOR/TURMA");
        console.log("==========================================");
        console.log("Professor:", professorID);
        console.log("Turma:", turmaID);
        console.log("Disciplina:", disciplinaID);
        console.log("Aulas:", aulasSemanais);

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

        console.log("📊 Dados carregados.");
        console.log("Professores:", usuarios.length);
        console.log("Turmas:", turmas.length);
        console.log("Disciplinas:", disciplinas.length);
        console.log("Vínculos atuais:", vinculos.length);

        const professor = usuarios
            .slice(1)
            .find(
                (linha) =>
                    texto(linha[0]) === texto(professorID) &&
                    normalizar(linha[5]) === "professor" &&
                    normalizar(linha[8]) === "ativo",
            );

        if (!professor) {
            console.log("❌ Professor não encontrado.");
            return res.status(404).json({
                sucesso: false,
                erro: "Professor não encontrado ou está inativo.",
            });
        }

        console.log("✅ Professor encontrado:", professor[0]);

        const cadastroProfessor = autorizados
            .slice(1)
            .find(
                (linha) =>
                    texto(linha[3]) === texto(professorID) &&
                    normalizar(linha[1]) === "professor" &&
                    normalizar(linha[9]) === "cadastrado",
            );

        if (!cadastroProfessor) {
            console.log("⚠️ Cadastro autorizado não encontrado.");
        } else {
            console.log("✅ Cadastro autorizado:", cadastroProfessor[0]);
        }

        const turma = turmas
            .slice(1)
            .find(
                (linha) =>
                    texto(linha[0]) === texto(turmaID) &&
                    ["aberta", "ativo"].includes(normalizar(linha[6])),
            );

        if (!turma) {
            console.log("❌ Turma não encontrada:", turmaID);

            return res.status(404).json({
                sucesso: false,
                erro: "Turma não encontrada ou está inativa.",
            });
        }

        console.log("✅ Turma encontrada:", turma[0], turma[1]);

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
            console.log("❌ Disciplina não encontrada:", disciplinaID);

            return res.status(404).json({
                sucesso: false,
                erro: "Disciplina não encontrada ou está inativa.",
            });
        }

        console.log("✅ Disciplina encontrada:", disciplina[0], disciplina[1]);

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
            console.log("⚠️ Este vínculo já existe.");

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

        console.log("");
        console.log("🚀 GRAVANDO NA 21_PROFESSOR_TURMAS");
        console.log("ID:", vinculoID);
        console.log("Dados:", dadosParaGravar);

        const resultado = await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "21_PROFESSOR_TURMAS!A:F",
            valueInputOption: "USER_ENTERED",
            insertDataOption: "INSERT_ROWS",
            requestBody: {
                values: [dadosParaGravar],
            },
        });

        console.log("✅ GRAVAÇÃO REALIZADA!");
        console.log("Range gravado:", resultado.data?.updates?.updatedRange);

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

        const produtos = dados["02_PRODUTOS"] || [];

        const categorias = dados["03_CATEGORIAS"] || [];

        const subcategorias = dados["04_SUBCATEGORIAS"] || [];

        const locais = dados["05_LOCAIS"] || [];

        const estoque = dados["06_ESTOQUE_LOCAIS"] || [];

        const mapaCategorias = new Map();

        for (const linha of categorias.slice(1)) {
            mapaCategorias.set(texto(linha[0]), linha[1] || "");
        }

        const mapaSubcategorias = new Map();

        for (const linha of subcategorias.slice(1)) {
            mapaSubcategorias.set(texto(linha[0]), linha[1] || "");
        }

        const mapaLocais = new Map();

        for (const linha of locais.slice(1)) {
            mapaLocais.set(texto(linha[0]), linha[1] || "");
        }

        const estoquePorProduto = new Map();

        for (const linha of estoque.slice(1)) {
            const produtoID = texto(linha[1]);

            if (!produtoID) continue;

            const atual = estoquePorProduto.get(produtoID) || 0;

            estoquePorProduto.set(produtoID, atual + numero(linha[4]));
        }

        const lista = produtos.slice(1).map((linha) => {
            const produtoID = linha[0] || "";

            const categoriaID = linha[4] || "";

            const subcategoriaID = linha[5] || "";

            return {
                produtoID,

                codigo: linha[1] || "",

                nome: linha[2] || "",

                autor: linha[3] || "",

                categoriaID,

                categoria: mapaCategorias.get(texto(categoriaID)) || "",

                subcategoriaID,

                subcategoria:
                    mapaSubcategorias.get(texto(subcategoriaID)) || "",

                local: mapaLocais.get(texto(linha[6])) || "",

                estado: linha[7] || "",

                status: linha[8] || "",

                observacao: linha[9] || "",

                estoque: estoquePorProduto.get(produtoID) || 0,
            };
        });

        res.json({
            sucesso: true,
            produtos: lista,
            categorias: categorias.slice(1),
            subcategorias: subcategorias.slice(1),
            locais: locais.slice(1),
        });
    } catch (erro) {
        console.error("❌ Erro ao carregar acervo:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
        });
    }
});

/*
==========================================================
 RESERVAS
==========================================================
*/

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
        console.log("✅ APPEND REALIZADO COM SUCESSO!");

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

        const avisos = dados["15_COMUNICACOES_ESTOQUE"] || [];

        const lista = avisos.slice(1).map((linha) => ({
            id: linha[0] || "",

            titulo: linha[1] || "",

            mensagem: linha[2] || "",

            tipo: linha[3] || "",

            destinatario: linha[4] || "",

            data: linha[5] || "",

            status: linha[6] || "",

            observacao: linha[7] || "",
        }));

        res.json({
            sucesso: true,
            avisos: lista,
        });
    } catch (erro) {
        console.error("❌ Erro ao carregar avisos:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message,
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
