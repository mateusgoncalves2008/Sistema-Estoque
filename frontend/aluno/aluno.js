const API_URL = "http://localhost:3000/api";

// ======================================================
// SESSÃO DO USUÁRIO
// ======================================================

const usuarioLogado = JSON.parse(sessionStorage.getItem("usuarioLogado"));

// ======================================================
// VERIFICAR LOGIN
// ======================================================

if (!usuarioLogado) {
    window.location.href = "../login/index.html";
}

// ======================================================
// VERIFICAR SE É ALUNO
// ======================================================

if (
    usuarioLogado &&
    String(usuarioLogado.tipoUsuario || "").toUpperCase() !== "ALUNO"
) {
    alert("Acesso não autorizado.");
    window.location.href = "../login/index.html";
}

// ======================================================
// ELEMENTOS
// ======================================================

const nomeAlunoInicio = document.getElementById("nomeAlunoInicio");

const perfilNome = document.getElementById("perfilNome");

const perfilTipo = document.getElementById("perfilTipo");

const perfilNomeCompleto = document.getElementById("perfilNomeCompleto");

const perfilMatricula = document.getElementById("perfilMatricula");

const perfilIdade = document.getElementById("perfilIdade");

const perfilAno = document.getElementById("perfilAno");

const perfilTurma = document.getElementById("perfilTurma");

const perfilTurno = document.getElementById("perfilTurno");

const perfilEmail = document.getElementById("perfilEmail");

const perfilStatus = document.getElementById("perfilStatus");

const avatarInicial = document.getElementById("avatarInicial");

// ======================================================
// CARREGAR PERFIL
// ======================================================

async function carregarPerfil() {
    try {
        const usuarioID = usuarioLogado.id;

        const resposta = await fetch(
            `${API_URL}/aluno/perfil/${encodeURIComponent(usuarioID)}`,
        );

        const dados = await resposta.json();

        if (!resposta.ok || !dados.sucesso) {
            throw new Error(
                dados.mensagem || "Não foi possível carregar o perfil.",
            );
        }

        const aluno = dados.aluno;

        // Nome no início
        nomeAlunoInicio.textContent = aluno.nome || "Aluno";

        // Cabeçalho do perfil
        perfilNome.textContent = aluno.nome || "Aluno";

        perfilTipo.textContent = aluno.tipoUsuario || "Aluno";

        // Dados
        perfilNomeCompleto.textContent = aluno.nome || "-";

        perfilMatricula.textContent = aluno.matricula || "-";

        perfilIdade.textContent = aluno.idade || "-";

        perfilAno.textContent = aluno.ano || "-";

        perfilTurma.textContent = aluno.turma || "-";

        perfilTurno.textContent = aluno.turno || "-";

        perfilEmail.textContent = aluno.email || "-";

        perfilStatus.textContent = aluno.status || "-";

        // Avatar
        if (aluno.nome) {
            avatarInicial.textContent = aluno.nome
                .trim()
                .charAt(0)
                .toUpperCase();
        }
    } catch (erro) {
        console.error("Erro ao carregar perfil:", erro);

        perfilNome.textContent = "Erro ao carregar";

        alert("Não foi possível carregar seus dados.");
    }
}

// ======================================================
// NAVEGAÇÃO
// ======================================================

const botoesMenu = document.querySelectorAll(".menu-item");

const secoes = document.querySelectorAll(".section");

botoesMenu.forEach((botao) => {
    botao.addEventListener("click", () => {
        const secaoDestino = botao.dataset.section;

        // Remove ativo dos botões
        botoesMenu.forEach((item) => {
            item.classList.remove("active");
        });

        botao.classList.add("active");

        // Esconde todas as seções
        secoes.forEach((secao) => {
            secao.classList.remove("active");
        });

        // Mostra a escolhida
        const secao = document.getElementById(secaoDestino);

        if (secao) {
            secao.classList.add("active");
        }
    });
});

// ======================================================
// SAIR
// ======================================================

document.getElementById("btnSair").addEventListener("click", () => {
    sessionStorage.removeItem("usuario");

    window.location.href = "../login/index.html";
});

// ======================================================
// INICIAR
// ======================================================

carregarPerfil();
