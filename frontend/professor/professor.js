const API_URL = "/api";
let reservas = [];
let emprestimos = [];
let historicoProfessor = [];

let ITENS_PESQUISA = [];


function aviso(texto) {
    const toast = document.getElementById("toast");
    toast.textContent = texto;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
}

function abrirPagina(nome) {
    document
        .querySelectorAll(".page")
        .forEach((p) => p.classList.remove("active"));

    document.getElementById("page-" + nome)?.classList.add("active");

    document.querySelectorAll("#menu button").forEach((b) => {
        b.classList.toggle("active", b.dataset.page === nome);
    });

    document.getElementById("sidebar")?.classList.remove("open");

    window.scrollTo({ top: 0, behavior: "smooth" });

    if (nome === "pesquisar") {
        iniciarPesquisa();
    }

    if (nome === "reservas") {
        carregarReservasProfessor();
    }

    if (nome === "emprestimos") {
        carregarEmprestimosProfessor();
    }

    if (nome === "historico") {
        carregarHistoricoProfessor();
    }
}

document.getElementById("menu").addEventListener("click", (e) => {
    const botao = e.target.closest("[data-page]");
    if (botao) abrirPagina(botao.dataset.page);
});

document.addEventListener("click", (e) => {
    const botao = e.target.closest("[data-go]");
    if (botao) abrirPagina(botao.dataset.go);
});

document.getElementById("mobileToggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
});

function atualizarRelogio() {
    document.getElementById("clock").textContent =
        new Date().toLocaleTimeString("pt-BR", { hour12: false });
}

atualizarRelogio();
setInterval(atualizarRelogio, 1000);

function atualizarTabelas() {
    console.log("ITENS_PESQUISA:", typeof ITENS_PESQUISA, ITENS_PESQUISA);
    console.log("tabelaItens:", document.getElementById("tabelaItens"));
    console.log("listaReservas:", document.getElementById("listaReservas"));

    const campoBusca = document.getElementById("busca");
    const tabelaItens = document.getElementById("tabelaItens");
    const totalReservas = document.getElementById("totalReservas");
    const reservasAtivas = document.getElementById("reservasAtivas");
    const totalEmprestimos = document.getElementById("totalEmprestimos");
    const emprestimosAtivos = document.getElementById("emprestimosAtivos");
    const listaReservas = document.getElementById("listaReservas");

    const busca = (campoBusca?.value || "").trim().toLowerCase();

    // PESQUISAR ITENS
    const itens =
        typeof ITENS_PESQUISA !== "undefined" && Array.isArray(ITENS_PESQUISA)
            ? ITENS_PESQUISA
            : [];

    const itensFiltrados = itens.filter((item) => {
        const nome = String(item.nome || "").toLowerCase();
        const tipo = String(item.tipo || "").toLowerCase();

        return nome.includes(busca) || tipo.includes(busca);
    });

    if (tabelaItens) {
        tabelaItens.innerHTML = itensFiltrados.length
            ? itensFiltrados
                  .map(
                      (item) => `
                        <tr>
                            <td>${item.nome || ""}</td>
                            <td>${item.tipo || ""}</td>
                            <td>Consulte o responsável</td>
                        </tr>
                    `,
                  )
                  .join("")
            : `
                <tr>
                    <td colspan="3">
                        ${
                            itens.length
                                ? "Nenhum item corresponde à pesquisa."
                                : "Nenhum item carregado."
                        }
                    </td>
                </tr>
            `;
    }

    // CONTADORES DE RESERVAS
    const listaReservasDados = Array.isArray(reservas) ? reservas : [];

    const pendentes = listaReservasDados.filter(
        (reserva) => String(reserva.status || "").toLowerCase() === "pendente",
    ).length;

    if (totalReservas) {
        totalReservas.textContent = pendentes;
    }

    if (reservasAtivas) {
        reservasAtivas.textContent = `${listaReservasDados.length} ativas`;
    }

    // CONTADORES DE EMPRÉSTIMOS
    const listaEmprestimosDados = Array.isArray(emprestimos) ? emprestimos : [];

    if (totalEmprestimos) {
        totalEmprestimos.textContent = listaEmprestimosDados.length;
    }

    if (emprestimosAtivos) {
        emprestimosAtivos.textContent = `${listaEmprestimosDados.length} ativos`;
    }

    // LISTA DE RESERVAS
    if (listaReservas) {
        listaReservas.innerHTML = listaReservasDados.length
            ? listaReservasDados
                  .map(
                      (reserva) => `
                        <tr>
                            <td>${reserva.item || ""}</td>
                            <td>${reserva.data || ""}</td>
                            <td>${reserva.horario || ""}</td>
                            <td>
                                <span class="status">
                                    ${reserva.status || ""}
                                </span>
                            </td>
                        </tr>
                    `,
                  )
                  .join("")
            : `
                <tr>
                    <td colspan="4">
                        Nenhuma reserva cadastrada.
                    </td>
                </tr>
            `;
    }
}

const campoBusca = document.getElementById("busca");

if (campoBusca) {
    campoBusca.addEventListener("input", atualizarTabelas);
}
document.getElementById("formPerfil").addEventListener("submit", (e) => {
    e.preventDefault();

    const nome = document.getElementById("nome").value.trim() || "Professor";
    document.getElementById("nomeUsuario").textContent = nome;
    document.getElementById("nomeHero").textContent = nome;
    document.getElementById("avatar").textContent = nome
        .charAt(0)
        .toUpperCase();

    aviso("Nome atualizado nesta tela.");
});

document.getElementById("sair").addEventListener("click", () => {
    aviso("Para sair de verdade, conectaremos ao login existente.");
});
atualizarTabelas();

if (window.lucide) lucide.createIcons();

async function carregarReservasProfessor() {
    if (!usuarioLogado?.id) {
        reservas = [];
        showToast("Não foi possível identificar o usuário logado.");
        return false;
    }

    try {
        const resposta = await fetch(
            `${API_URL}/professor/reservas/${encodeURIComponent(usuarioLogado.id)}`,
        );

        const resultado = await resposta.json();

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(resultado.mensagem || "Erro ao carregar reservas.");
        }

        reservas = Array.isArray(resultado.reservas) ? resultado.reservas : [];

        return true;
    } catch (erro) {
        console.error("Erro ao carregar reservas do professor:", erro);
        showToast("Não foi possível carregar suas reservas.");
        return false;
    }
}

async function carregarEmprestimosProfessor() {
    const usuario = JSON.parse(
        sessionStorage.getItem("usuarioLogado") || "null",
    );

    if (!usuario?.id) {
        console.error("Usuário logado não encontrado.");
        return;
    }

    try {
        const resposta = await fetch(
            `${API_URL}/professor/emprestimos/${encodeURIComponent(usuario.id)}`,
        );

        const resultado = await resposta.json();

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(
                resultado.mensagem || "Erro ao carregar empréstimos.",
            );
        }

        emprestimos = resultado.emprestimos || [];
        atualizarTabelaEmprestimos();
    } catch (erro) {
        console.error("Erro ao carregar empréstimos:", erro);
    }
}

function atualizarTabelaEmprestimos() {
    const tabela = document.querySelector("#tabelaEmprestimos");

    if (tabela) {
        tabela.innerHTML = viewEmprestimos();
    }
}

function viewEmprestimos() {
    const rows = emprestimos
        .map(
            (r) => `
        <tr>
            <td>${escapeHtml(r.tipo)}</td>
            <td><b>${escapeHtml(r.item)}</b></td>
            <td>${escapeHtml(r.retirada)}</td>
            <td>${escapeHtml(r.devolucao)}</td>
            <td><span class="tag">${escapeHtml(r.status)}</span></td>
        </tr>
    `,
        )
        .join("");

    return `
        <div class="head">
            <h1>Meus Empréstimos</h1>
            <p class="sub">Itens que estão atualmente com você.</p>
        </div>
        <div class="card">
            <div class="scroll">
                <table>
                    <thead>
                        <tr>
                            <th>Tipo</th>
                            <th>Item</th>
                            <th>Retirada</th>
                            <th>Devolução prevista</th>
                            <th>Situação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${
                            rows ||
                            `
                            <tr>
                                <td colspan="5">
                                    Você não possui empréstimos ativos.
                                </td>
                            </tr>
                        `
                        }
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

async function carregarHistoricoProfessor() {
    const area = document.getElementById("conteudoHistorico");
    const usuario = JSON.parse(
        sessionStorage.getItem("usuarioLogado") || "null",
    );

    if (!area) return;

    if (!usuario?.id) {
        area.innerHTML =
            '<p class="empty">Não foi possível identificar o usuário logado.</p>';
        return;
    }

    area.innerHTML = '<p class="empty">Carregando histórico...</p>';

    try {
        const resposta = await fetch(
            `${API_URL}/professor/historico/${encodeURIComponent(usuario.id)}`,
        );

        const resultado = await resposta.json();

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(
                resultado.mensagem || "Erro ao carregar histórico.",
            );
        }

        historicoProfessor = Array.isArray(resultado.historicoProfessor)
            ? resultado.historicoProfessor
            : [];

        const escapado = (valor) =>
            String(valor ?? "").replace(
                /[&<>"']/g,
                (c) =>
                    ({
                        "&": "&amp;",
                        "<": "&lt;",
                        ">": "&gt;",
                        '"': "&quot;",
                        "'": "&#39;",
                    })[c],
            );

        const devolvidos = historicoProfessor.filter(
            (m) => m.status === "DEVOLVIDO",
        ).length;

        area.innerHTML = `
            <div class="head">
                <h1>Histórico</h1>
                <p class="sub">Veja o resumo das suas atividades.</p>
            </div>

            <div class="grid">
                <div class="card">
                    <div class="lab">Movimentações</div>
                    <div class="big">${historicoProfessor.length}</div>
                </div>

                <div class="card">
                    <div class="lab">Itens devolvidos</div>
                    <div class="big">${devolvidos}</div>
                </div>
            </div>

            <select id="filtroHistorico">
                <option value="Todos">Todos os itens</option>
                <option value="Livro">Livros</option>
                <option value="Computador">Computadores</option>
                <option value="Equipamento">Equipamentos</option>
                <option value="Material">Materiais</option>
            </select>

            <div class="card" style="margin-top:18px">
                <h2>Últimas movimentações</h2>

                ${
                    historicoProfessor.length
                        ? historicoProfessor
                              .map(
                                  (m) => `
                            <div class="row">
                                <div class="d">${escapado(m.tipo)}</div>
                                <div class="t">${escapado(m.item)}</div>
                                <span class="tag">${escapado(m.status)}</span>
                                <span>${escapado(m.data)}</span>
                            </div>
                        `,
                              )
                              .join("")
                        : '<div class="row">Nenhuma movimentação encontrada.</div>'
                }
            </div>
        `;
    } catch (erro) {
        console.error("Erro ao carregar histórico:", erro);
        area.innerHTML =
            '<p class="empty">Não foi possível carregar o histórico.</p>';
    }
}


// ============================================================
// TELA PESQUISAR
// ============================================================
