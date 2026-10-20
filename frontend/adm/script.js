const API_BASE = "/api";

const form = document.getElementById("formCadastro");
const campoSetor = document.getElementById("setorID");
const campoTipo = document.getElementById("tipoConta");
const grupoSetor = document.getElementById("grupoSetor");
const campoCPF = document.getElementById("cpf");
const campoTelefone = document.getElementById("telefone");
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
        tipoConta: campoTipo.value,
        nome: document.getElementById("nome").value.trim(),
        cpf: campoCPF.value.replace(/\D/g, ""),
        dataNascimento: document.getElementById("dataNascimento").value,
        telefone: campoTelefone.value.replace(/\D/g, ""),
        email: document.getElementById("email").value.trim(),
        setorID: campoTipo.value === "RESPONSAVEL" ? campoSetor.value : "",
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
        const resposta = await fetch(`${API_BASE}/${dados.tipoConta === "SECRETARIA" ? "cadastro-secretaria" : "cadastro-responsavel"}`, {
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


campoTipo.addEventListener("change", () => {
    const exigeSetor = campoTipo.value === "RESPONSAVEL";
    grupoSetor.hidden = !exigeSetor;
    campoSetor.required = exigeSetor;
    if (exigeSetor) carregarSetores();
});

campoCPF.addEventListener("input", () => {
    const v = campoCPF.value.replace(/\D/g, "").slice(0, 11);
    campoCPF.value = v.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
});

campoTelefone.addEventListener("input", () => {
    const v = campoTelefone.value.replace(/\D/g, "").slice(0, 11);
    campoTelefone.value = v.length > 10 ? v.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3") : v.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
});

campoTipo.dispatchEvent(new Event("change"));


/* ============================================================
   CENTRAL DE AVISOS DO ADM
   A rota atual do ADM abre esta tela de cadastro de contas.
============================================================ */
let avisosAdm = [];
let avisosLidosAdm = [];
let centralAvisosAdmAberta = false;

function escaparAvisoAdm(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, (caractere) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    })[caractere]);
}

async function carregarAvisosAdm() {
    try {
        const [respostaAvisos, respostaLeituras] = await Promise.all([
            fetch(`${API_BASE}/avisos`, { credentials: "include" }),
            fetch(`${API_BASE}/avisos/leituras`, { credentials: "include" }),
        ]);
        const dadosAvisos = await respostaAvisos.json();
        const dadosLeituras = await respostaLeituras.json();

        if (!respostaAvisos.ok || !dadosAvisos.sucesso) {
            throw new Error(dadosAvisos.erro || "Não foi possível carregar os avisos.");
        }
        if (!respostaLeituras.ok || !dadosLeituras.sucesso) {
            throw new Error(dadosLeituras.erro || "Não foi possível carregar as leituras.");
        }

        avisosAdm = Array.isArray(dadosAvisos.avisos) ? dadosAvisos.avisos : [];
        avisosLidosAdm = Array.isArray(dadosLeituras.avisosLidos) ? dadosLeituras.avisosLidos : [];
        renderizarAvisosAdm();
        atualizarContadorAvisosAdm();
    } catch (erro) {
        console.error("Erro ao carregar avisos do ADM:", erro);
        const lista = document.getElementById("listaAvisosAdm");
        if (lista) lista.innerHTML = '<p class="avisos-vazio-adm">Não foi possível carregar os avisos. Atualize a página e tente novamente.</p>';
    }
}

async function registrarLeituraAvisoAdm(avisoID) {
    const resposta = await fetch(`${API_BASE}/avisos/leituras`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avisoID }),
    });
    const dados = await resposta.json();
    if (!resposta.ok || !dados.sucesso) {
        throw new Error(dados.erro || "Não foi possível registrar a leitura.");
    }
    if (!avisosLidosAdm.includes(avisoID)) avisosLidosAdm.push(avisoID);
}

function atualizarContadorAvisosAdm() {
    const botao = document.getElementById("botaoAvisosAdm");
    const contador = document.getElementById("contadorAvisosAdm");
    if (!botao || !contador) return;
    const naoLidos = avisosAdm.filter((item) => !avisosLidosAdm.includes(item.id)).length;
    contador.textContent = naoLidos > 99 ? "99+" : String(naoLidos);
    contador.hidden = naoLidos === 0;
    botao.setAttribute("aria-label", naoLidos ? `Avisos. ${naoLidos} não lidos` : "Avisos");
}

function criarBotaoAvisosAdm() {
    if (document.getElementById("botaoAvisosAdm")) return;
    const botao = document.createElement("button");
    botao.type = "button";
    botao.id = "botaoAvisosAdm";
    botao.className = "botao-avisos-adm";
    botao.title = "Avisos da escola";
    botao.setAttribute("aria-label", "Avisos");
    botao.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10 20a2 2 0 0 0 4 0"></path></svg><span id="contadorAvisosAdm" class="contador-avisos-adm" hidden>0</span>';

    const central = document.createElement("section");
    central.id = "centralAvisosAdm";
    central.className = "central-avisos-adm";
    central.hidden = true;
    central.setAttribute("aria-label", "Central de avisos");
    central.innerHTML = `
        <div class="cabecalho-avisos-adm">
            <div><h2>Avisos da escola</h2><p>Comunicados destinados ao ADM</p></div>
            <button type="button" id="fecharAvisosAdm" class="fechar-avisos-adm" aria-label="Fechar avisos">&times;</button>
        </div>
        <div class="acoes-avisos-adm"><button type="button" id="marcarAvisosLidosAdm">Marcar todos como lidos</button></div>
        <div id="listaAvisosAdm" class="lista-avisos-adm"><p class="avisos-vazio-adm">Carregando avisos...</p></div>
    `;
    document.body.append(botao, central);
    botao.addEventListener("click", alternarCentralAvisosAdm);
    central.querySelector("#fecharAvisosAdm").addEventListener("click", fecharCentralAvisosAdm);
    central.querySelector("#marcarAvisosLidosAdm").addEventListener("click", marcarTodosAvisosAdmComoLidos);
}

function alternarCentralAvisosAdm() {
    centralAvisosAdmAberta = !centralAvisosAdmAberta;
    const central = document.getElementById("centralAvisosAdm");
    if (!central) return;
    central.hidden = !centralAvisosAdmAberta;
    if (centralAvisosAdmAberta) renderizarAvisosAdm();
}

function fecharCentralAvisosAdm() {
    centralAvisosAdmAberta = false;
    const central = document.getElementById("centralAvisosAdm");
    if (central) central.hidden = true;
}

async function marcarTodosAvisosAdmComoLidos() {
    const pendentes = avisosAdm.filter((item) => !avisosLidosAdm.includes(item.id));
    try {
        await Promise.all(pendentes.map((item) => registrarLeituraAvisoAdm(item.id)));
        atualizarContadorAvisosAdm();
        renderizarAvisosAdm();
    } catch (erro) {
        console.error("Erro ao marcar avisos do ADM como lidos:", erro);
        const lista = document.getElementById("listaAvisosAdm");
        if (lista) lista.insertAdjacentHTML("afterbegin", '<p class="avisos-erro-adm">Não foi possível salvar a leitura. Tente novamente.</p>');
    }
}

function renderizarAvisosAdm() {
    const lista = document.getElementById("listaAvisosAdm");
    if (!lista) return;
    if (!avisosAdm.length) {
        lista.innerHTML = '<p class="avisos-vazio-adm">Nenhum aviso publicado para o ADM.</p>';
        return;
    }

    lista.innerHTML = avisosAdm.map((item) => {
        const lido = avisosLidosAdm.includes(item.id);
        const prioridade = String(item.prioridade || "NORMAL").toUpperCase();
        const data = item.dataPublicacao ? new Date(item.dataPublicacao) : null;
        const dataTexto = data && !Number.isNaN(data.getTime()) ? data.toLocaleString("pt-BR") : "";
        return `
            <article class="aviso-adm ${lido ? "aviso-lido-adm" : "aviso-nao-lido-adm"}">
                <div class="aviso-adm-topo">
                    <strong>${escaparAvisoAdm(item.titulo || "Aviso")}</strong>
                    <span class="prioridade-aviso-adm ${prioridade === "URGENTE" ? "urgente" : ""}">${escaparAvisoAdm(prioridade)}</span>
                </div>
                <p>${escaparAvisoAdm(item.mensagem || "")}</p>
                <div class="aviso-adm-rodape">
                    <small>${escaparAvisoAdm(dataTexto)}</small>
                    ${lido ? '<span class="estado-aviso-adm">Lido</span>' : `<button type="button" data-aviso-lido-adm="${escaparAvisoAdm(item.id)}">Marcar como lido</button>`}
                </div>
            </article>
        `;
    }).join("");

    lista.querySelectorAll("[data-aviso-lido-adm]").forEach((botao) => {
        botao.addEventListener("click", async () => {
            botao.disabled = true;
            try {
                await registrarLeituraAvisoAdm(botao.dataset.avisoLidoAdm);
                atualizarContadorAvisosAdm();
                renderizarAvisosAdm();
            } catch (erro) {
                console.error("Erro ao marcar aviso como lido:", erro);
                botao.disabled = false;
                const lista = document.getElementById("listaAvisosAdm");
                if (lista) lista.insertAdjacentHTML("afterbegin", '<p class="avisos-erro-adm">Não foi possível salvar a leitura. Tente novamente.</p>');
            }
        });
    });
}

criarBotaoAvisosAdm();
carregarAvisosAdm();
