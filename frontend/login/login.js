// ============================================================
// LOGIN - SISTEMA DE ESTOQUE HAUY
// ============================================================

const API_URL = "http://localhost:3000/api";

// ============================================================
// QUANDO A PÁGINA CARREGAR
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
    inicializarLogin();
});

function inicializarLogin() {
    // Inicializa os ícones Lucide, caso estejam disponíveis
    if (window.lucide) {
        lucide.createIcons();
    }

    // Recupera o e-mail salvo, se "Lembrar de mim" estiver ativo
    const emailSalvo = localStorage.getItem("emailLembrado");

    if (emailSalvo) {
        const campoEmail = document.getElementById("email");
        const lembrar = document.getElementById("lembrar");

        if (campoEmail) {
            campoEmail.value = emailSalvo;
        }

        if (lembrar) {
            lembrar.checked = true;
        }
    }

    // Garante que a tela correta seja exibida
    mostrarLogin();
}

// ============================================================
// MOSTRAR LOGIN
// ============================================================

function mostrarLogin() {
    const loginView = document.getElementById("loginView");
    const registerView = document.getElementById("registerView");

    if (loginView) {
        loginView.style.display = "block";
    }

    if (registerView) {
        registerView.style.display = "none";
    }

    limparMensagem("loginMessage");
}

// ============================================================
// MOSTRAR CADASTRO
// ============================================================

function mostrarCadastro() {
    const loginView = document.getElementById("loginView");
    const registerView = document.getElementById("registerView");

    if (loginView) {
        loginView.style.display = "none";
    }

    if (registerView) {
        registerView.style.display = "block";
    }

    limparMensagem("loginMessage");

    if (window.lucide) {
        lucide.createIcons();
    }
}

// ============================================================
// LIMPAR MENSAGEM
// ============================================================

function limparMensagem(id) {
    const elemento = document.getElementById(id);

    if (!elemento) {
        return;
    }

    elemento.textContent = "";
    elemento.className = "message";
}

// ============================================================
// MOSTRAR MENSAGEM
// ============================================================

function mostrarMensagem(id, mensagem, tipo = "erro") {
    const elemento = document.getElementById(id);

    if (!elemento) {
        return;
    }

    elemento.textContent = mensagem;

    elemento.className = "message";

    if (tipo === "sucesso") {
        elemento.classList.add("success");
    } else if (tipo === "aviso") {
        elemento.classList.add("warning");
    } else {
        elemento.classList.add("error");
    }
}

// ============================================================
// ALTERAR ESTADO DO BOTÃO
// ============================================================

function carregarBotao(buttonId, carregando, textoOriginal = "Entrar") {
    const botao = document.getElementById(buttonId);

    if (!botao) {
        return;
    }

    const texto = botao.querySelector("#loginButtonText");

    if (carregando) {
        botao.disabled = true;

        if (texto) {
            texto.textContent = "Entrando...";
        } else {
            botao.textContent = "Entrando...";
        }
    } else {
        botao.disabled = false;

        if (texto) {
            texto.textContent = textoOriginal;
        } else {
            botao.textContent = textoOriginal;
        }
    }
}

// ============================================================
// MOSTRAR / OCULTAR SENHA
// ============================================================

function alternarSenha(idCampo, botao) {
    const campo = document.getElementById(idCampo);

    if (!campo) {
        return;
    }

    if (campo.type === "password") {
        campo.type = "text";

        if (botao) {
            botao.innerHTML = '<i data-lucide="eye-off"></i>';
        }
    } else {
        campo.type = "password";

        if (botao) {
            botao.innerHTML = '<i data-lucide="eye"></i>';
        }
    }

    if (window.lucide) {
        lucide.createIcons();
    }
}

// ============================================================
// LOGIN
// ============================================================

async function realizarLogin() {
    limparMensagem("loginMessage");

    const campoEmail = document.getElementById("email");
    const campoSenha = document.getElementById("senha");
    const lembrar = document.getElementById("lembrar");

    if (!campoEmail || !campoSenha) {
        console.error("Campos de login não encontrados.");
        return;
    }

    const email = campoEmail.value.trim().toLowerCase();
    const senha = campoSenha.value;

    // --------------------------------------------------------
    // VALIDAÇÃO
    // --------------------------------------------------------

    if (!email) {
        mostrarMensagem("loginMessage", "Digite seu e-mail.");

        campoEmail.focus();
        return;
    }

    if (!senha) {
        mostrarMensagem("loginMessage", "Digite sua senha.");

        campoSenha.focus();
        return;
    }

    // --------------------------------------------------------
    // LEMBRAR DE MIM
    // --------------------------------------------------------

    if (lembrar && lembrar.checked) {
        localStorage.setItem("emailLembrado", email);
    } else {
        localStorage.removeItem("emailLembrado");
    }

    // --------------------------------------------------------
    // BOTÃO
    // --------------------------------------------------------

    carregarBotao("loginButton", true, "Entrar");

    try {
        // ----------------------------------------------------
        // ENVIA LOGIN PARA O NODE.JS
        // ----------------------------------------------------

        const resposta = await fetch(`${API_URL}/login`, {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
            },

            body: JSON.stringify({
                email: email,
                senha: senha,
            }),
        });

        const resultado = await resposta.json();

        // ----------------------------------------------------
        // ERRO
        // ----------------------------------------------------

        if (!resposta.ok || !resultado.sucesso) {
            mostrarMensagem(
                "loginMessage",
                resultado.mensagem || "E-mail ou senha inválidos.",
            );

            carregarBotao("loginButton", false, "Entrar");

            return;
        }

        // ----------------------------------------------------
        // USUÁRIO LOGADO
        // ----------------------------------------------------

        const usuario = resultado.usuario;

        if (!usuario) {
            throw new Error("O servidor não retornou os dados do usuário.");
        }

        // Guarda os dados do usuário
        sessionStorage.setItem("usuarioLogado", JSON.stringify(usuario));

        // ----------------------------------------------------
        // REDIRECIONAMENTO
        // ----------------------------------------------------

        redirecionarUsuario(usuario);
    } catch (erro) {
        console.error("Erro ao realizar login:", erro);

        mostrarMensagem(
            "loginMessage",
            "Não foi possível conectar ao servidor. Verifique se o Node.js está funcionando.",
        );

        carregarBotao("loginButton", false, "Entrar");
    }
}

// ============================================================
// REDIRECIONAR USUÁRIO PARA O PAINEL CORRETO
// ============================================================

function redirecionarUsuario(usuario) {
    const tipoUsuario = String(usuario.tipoUsuario || "").toUpperCase();
    const perfil = String(usuario.perfil || "").toUpperCase();

    // ADMIN
    if (perfil === "ADMIN" || tipoUsuario === "ADMIN") {
        window.location.href = "./frontend/adm/index.html";
        return;
    }

    // RESPONSÁVEL PELO SETOR
    if (perfil === "LIDER" || tipoUsuario === "LIDER") {
        window.location.href = "./frontend/responsavel/index.html";
        return;
    }

    // PROFESSOR
    if (tipoUsuario === "PROFESSOR" || perfil === "PROFESSOR") {
        window.location.href = "./frontend/professor/index.html";
        return;
    }

    // ALUNO
    if (tipoUsuario === "ALUNO" || perfil === "ALUNO") {
        window.location.href = "./frontend/aluno/index.html";
        return;
    }

    // SECRETARIA
    if (tipoUsuario === "FUNCIONARIO") {
        window.location.href = "./frontend/secretaria/index.html";
        return;
    }

    console.error("Perfil de usuário não reconhecido:", usuario);

    mostrarMensagem(
        "loginMessage",
        "O perfil deste usuário não possui um painel configurado.",
    );

    sessionStorage.removeItem("usuarioLogado");

    carregarBotao("loginButton", false, "Entrar");
}

// ============================================================
// ENTER NO CAMPO DE SENHA
// ============================================================

document.addEventListener("keydown", function (event) {
    const elemento = document.activeElement;

    if (elemento && elemento.id === "senha" && event.key === "Enter") {
        event.preventDefault();

        realizarLogin();
    }
});

// ============================================================
// RECUPERAR USUÁRIO LOGADO
// ============================================================

function obterUsuarioLogado() {
    const usuario = sessionStorage.getItem("usuarioLogado");

    if (!usuario) {
        return null;
    }

    try {
        return JSON.parse(usuario);
    } catch (erro) {
        console.error("Erro ao ler usuário logado:", erro);

        sessionStorage.removeItem("usuarioLogado");

        return null;
    }
}

// ============================================================
// VERIFICAR SE EXISTE USUÁRIO LOGADO
// ============================================================

function verificarUsuarioLogado() {
    const usuario = obterUsuarioLogado();

    if (!usuario) {
        return false;
    }

    return true;
}

// ============================================================
// LOGOUT
// ============================================================

function fazerLogout() {
    sessionStorage.removeItem("usuarioLogado");

    window.location.href = "./index.html";
}

// ============================================================
// RECARREGAR ÍCONES
// ============================================================

function atualizarIcones() {
    if (window.lucide) {
        lucide.createIcons();
    }
}

// ============================================================
// CADASTRO - VERIFICAR MATRÍCULA / MASP
// ============================================================

async function verificarMatricula() {
    console.log(">>> INICIANDO VERIFICAÇÃO <<<");

    limparMensagem("registerMessage");

    const campoMatricula = document.getElementById("matricula");
    const botao = document.getElementById("verifyButton");

    if (!campoMatricula) {
        console.error("Campo matrícula não encontrado.");
        return;
    }

    const identificador = campoMatricula.value.trim();

    if (!identificador) {
        mostrarMensagem("registerMessage", "Digite sua matrícula ou MASP.");
        campoMatricula.focus();
        return;
    }

    const ehMatriculaAluno = /^\d{6,10}$/.test(identificador);
    const ehMASP = /^\d{7}-\d$/.test(identificador);

    if (!ehMatriculaAluno && !ehMASP) {
        mostrarMensagem(
            "registerMessage",
            "Digite uma matrícula válida ou um MASP no formato 1234567-8.",
        );
        campoMatricula.focus();
        return;
    }

    if (botao) {
        botao.disabled = true;

        const textoBotao = document.getElementById("verifyButtonText");

        if (textoBotao) {
            textoBotao.textContent = "Verificando...";
        }
    }

    try {
        const resposta = await fetch(`${API_URL}/verificar-matricula`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                matricula: identificador,
            }),
        });

        const resultado = await resposta.json();

        console.log("Resultado:", resultado);

        if (!resposta.ok || !resultado.sucesso) {
            mostrarMensagem(
                "registerMessage",
                resultado.mensagem || "Matrícula não autorizada.",
            );
            return;
        }

        const cadastro = resultado.cadastro;

        if (!cadastro) {
            mostrarMensagem(
                "registerMessage",
                "O servidor não retornou os dados do cadastro.",
            );
            return;
        }

        console.log("Cadastro autorizado:", cadastro);

        sessionStorage.setItem("cadastroAutorizacao", JSON.stringify(cadastro));

        sessionStorage.setItem("tipoCadastro", cadastro.tipo || "");

        // ==================================================
        // PREENCHER DADOS
        // ==================================================

        const campoNome = document.getElementById("nome");

        const campoAno = document.getElementById("ano");

        const campoTurma = document.getElementById("turma");

        const campoTurno = document.getElementById("turno");

        const campoIdade = document.getElementById("idade");

        if (campoNome) {
            campoNome.value = cadastro.nome || "";
        }

        if (campoAno) {
            campoAno.value = cadastro.ano || "";
        }

        if (campoTurma) {
            campoTurma.value = cadastro.turma || "";
        }

        if (campoTurno) {
            campoTurno.value = cadastro.turno || "";
        }

        if (campoIdade) {
            campoIdade.value = cadastro.idade || "";
        }

        // ==================================================
        // IDENTIFICAR TIPO
        // ==================================================

        const tipo = String(cadastro.tipo || "")
            .trim()
            .toUpperCase();

        console.log("Tipo do cadastro:", tipo);

        const camposAluno = document.querySelectorAll(".campo-aluno");

        if (tipo === "PROFESSOR") {
            camposAluno.forEach((campo) => {
                campo.style.display = "none";
            });

            console.log("Cadastro de PROFESSOR: campos de aluno ocultados.");
        } else {
            camposAluno.forEach((campo) => {
                campo.style.display = "";
            });

            console.log("Cadastro de ALUNO: campos acadêmicos exibidos.");
        }

        // ==================================================
        // TROCAR ETAPA
        // ==================================================

        const registerStep1 = document.getElementById("registerStep1");

        const registerStep2 = document.getElementById("registerStep2");

        if (registerStep1) {
            registerStep1.classList.remove("active");
        }

        if (registerStep2) {
            registerStep2.classList.add("active");
        }

        if (window.lucide) {
            lucide.createIcons();
        }

        console.log(">>> ETAPA 2 ATIVADA <<<");
    } catch (erro) {
        console.error("Erro ao verificar matrícula:", erro);

        mostrarMensagem(
            "registerMessage",
            "Não foi possível verificar a matrícula.",
        );
    } finally {
        if (botao) {
            botao.disabled = false;

            const textoBotao = document.getElementById("verifyButtonText");

            if (textoBotao) {
                textoBotao.textContent = "Verificar matrícula / MASP";
            }
        }
    }
}

// ============================================================
// CADASTRO - ENVIAR CADASTRO
// ============================================================

async function enviarCadastro() {
    console.log(">>> INICIANDO ENVIO DO CADASTRO <<<");

    limparMensagem("registerMessage");

    const cadastroSalvo = sessionStorage.getItem("cadastroAutorizacao");

    if (!cadastroSalvo) {
        mostrarMensagem(
            "registerMessage",
            "A autorização do cadastro não foi encontrada. Volte e verifique sua matrícula novamente.",
        );
        return;
    }

    let cadastro;

    try {
        cadastro = JSON.parse(cadastroSalvo);
    } catch (erro) {
        console.error("Erro ao ler autorização:", erro);

        mostrarMensagem(
            "registerMessage",
            "Os dados da autorização estão inválidos.",
        );

        return;
    }

    const nome = document.getElementById("nome")?.value.trim() || "";

    const ano = document.getElementById("ano")?.value.trim() || "";

    const turma = document.getElementById("turma")?.value.trim() || "";

    const turno = document.getElementById("turno")?.value || "";

    const idade = document.getElementById("idade")?.value.trim() || "";

    const email =
        document.getElementById("cadastroEmail")?.value.trim().toLowerCase() ||
        "";

    const senha = document.getElementById("cadastroSenha")?.value || "";

    const confirmarSenha =
        document.getElementById("confirmarSenha")?.value || "";

    const tipo = String(cadastro.tipo || "")
        .trim()
        .toUpperCase();

    // ==================================================
    // VALIDAÇÕES
    // ==================================================

    if (!nome) {
        mostrarMensagem("registerMessage", "Digite seu nome completo.");
        return;
    }

    if (!idade) {
        mostrarMensagem("registerMessage", "Digite sua idade.");
        return;
    }

    if (!email) {
        mostrarMensagem("registerMessage", "Digite seu e-mail.");
        return;
    }

    if (!senha) {
        mostrarMensagem("registerMessage", "Digite uma senha.");
        return;
    }

    if (senha.length < 6) {
        mostrarMensagem(
            "registerMessage",
            "A senha deve ter pelo menos 6 caracteres.",
        );
        return;
    }

    if (senha !== confirmarSenha) {
        mostrarMensagem("registerMessage", "As senhas não coincidem.");
        return;
    }

    // Aluno precisa dos dados acadêmicos
    if (tipo === "ALUNO") {
        if (!ano) {
            mostrarMensagem("registerMessage", "Digite o ano.");
            return;
        }

        if (!turma) {
            mostrarMensagem("registerMessage", "Digite a turma.");
            return;
        }

        if (!turno) {
            mostrarMensagem("registerMessage", "Selecione o turno.");
            return;
        }
    }

    // ==================================================
    // BOTÃO
    // ==================================================

    const botao = document.getElementById("registerButton");

    const textoBotao = document.getElementById("registerButtonText");

    if (botao) {
        botao.disabled = true;
    }

    if (textoBotao) {
        textoBotao.textContent = "Criando conta...";
    }

    // ==================================================
    // ENVIAR PARA O BACKEND
    // ==================================================

    try {
        const dados = {
            matricula: cadastro.identificador,
            nome,
            ano,
            turma,
            turno,
            idade,
            email,
            senha,
            tipo,
        };

        console.log("Dados enviados para /cadastro:", {
            ...dados,
            senha: "[OCULTA]",
        });

        const resposta = await fetch(`${API_URL}/cadastro`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(dados),
        });

        const resultado = await resposta.json();

        console.log("Resposta do cadastro:", resultado);

        if (!resposta.ok || !resultado.sucesso) {
            mostrarMensagem(
                "registerMessage",
                resultado.mensagem || "Não foi possível criar sua conta.",
            );
            return;
        }

        // ==================================================
        // CADASTRO CONCLUÍDO
        // ==================================================

        console.log(">>> CADASTRO CONCLUÍDO <<<");

        mostrarMensagem(
            "registerMessage",
            "Conta criada com sucesso! Agora você pode entrar no sistema.",
            "sucesso",
        );

        // Limpa autorização temporária
        sessionStorage.removeItem("cadastroAutorizacao");

        sessionStorage.removeItem("tipoCadastro");

        // Limpa campos
        document.getElementById("nome").value = "";
        document.getElementById("ano").value = "";
        document.getElementById("turma").value = "";
        document.getElementById("turno").value = "";
        document.getElementById("idade").value = "";
        document.getElementById("cadastroEmail").value = "";
        document.getElementById("cadastroSenha").value = "";
        document.getElementById("confirmarSenha").value = "";

        // Volta para o login depois de um pequeno intervalo
        setTimeout(() => {
            mostrarLogin();

            const emailLogin = document.getElementById("email");

            if (emailLogin && email) {
                emailLogin.value = email;
            }
        }, 1500);
    } catch (erro) {
        console.error("Erro ao enviar cadastro:", erro);

        mostrarMensagem(
            "registerMessage",
            "Não foi possível conectar ao servidor.",
        );
    } finally {
        if (botao) {
            botao.disabled = false;
        }

        if (textoBotao) {
            textoBotao.textContent = "Criar minha conta";
        }
    }
}

// ============================================================
// VOLTAR PARA A ETAPA 1
// ============================================================

function voltarEtapaCadastro() {
    const registerStep1 = document.getElementById("registerStep1");
    const registerStep2 = document.getElementById("registerStep2");

    if (registerStep2) {
        registerStep2.classList.remove("active");
    }

    if (registerStep1) {
        registerStep1.classList.add("active");
    }

    limparMensagem("registerMessage");
}
