const API_BASE = "/api";

const form = document.getElementById("formCadastro");
const campoSetor = document.getElementById("setorID");
const mensagem = document.getElementById("mensagem");
const botao = document.getElementById("btnCadastrar");

function mostrarMensagem(texto, tipo = "erro") {
    mensagem.textContent = texto;
    mensagem.className = `mensagem ${tipo}`;
}

async function carregarSetores() {
    campoSetor.disabled = true;

    try {
        const resposta = await fetch(`${API_BASE}/setores-disponiveis`, {
            credentials: "include",
        });

        const dados = await resposta.json();

        if (!resposta.ok || !dados.sucesso) {
            throw new Error(
                dados.mensagem || "Não foi possível carregar os setores.",
            );
        }

        campoSetor.replaceChildren();

        const inicial = document.createElement("option");
        inicial.value = "";
        inicial.textContent = dados.setores.length
            ? "Selecione um setor"
            : "Nenhum setor disponível";
        campoSetor.appendChild(inicial);

        dados.setores.forEach((setor) => {
            const opcao = document.createElement("option");
            opcao.value = setor.setorID;
            opcao.textContent = `${setor.nome} (${setor.setorID})`;
            campoSetor.appendChild(opcao);
        });

        if (!dados.setores.length) {
            mostrarMensagem("Não há setores ativos sem responsável.", "erro");
        }

        campoSetor.disabled = dados.setores.length === 0;
    } catch (erro) {
        campoSetor.replaceChildren();

        const opcao = document.createElement("option");
        opcao.value = "";
        opcao.textContent = "Erro ao carregar setores";
        campoSetor.appendChild(opcao);

        mostrarMensagem(erro.message);
    }
}

form.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const dados = {
        nome: document.getElementById("nome").value.trim(),
        email: document.getElementById("email").value.trim(),
        setorID: campoSetor.value,
        senha: document.getElementById("senha").value,
        confirmacaoSenha: document.getElementById("confirmacaoSenha").value,
    };

    if (dados.senha !== dados.confirmacaoSenha) {
        mostrarMensagem("As senhas não coincidem.");
        return;
    }

    botao.disabled = true;
    mostrarMensagem("Cadastrando...");

    try {
        const resposta = await fetch(`${API_BASE}/cadastro-responsavel`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(dados),
        });

        const resultado = await resposta.json();

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(
                resultado.mensagem ||
                    "Não foi possível cadastrar o responsável.",
            );
        }

        mostrarMensagem(
            `${resultado.mensagem} ID: ${resultado.usuario.id}`,
            "sucesso",
        );

        form.reset();
        await carregarSetores();
    } catch (erro) {
        mostrarMensagem(erro.message);
    } finally {
        botao.disabled = false;
    }
});

carregarSetores();
