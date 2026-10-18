const API_URL = "/api";
let usuarioLogado = null;

let ALUNO = {
    nome: "Aluno",
    idade: "Não informado",
    ano: "Não informado",
    turma: "Não informado",
    turno: "Não informado",
    email: "Não informado",
    matricula: "Não informado",
};

// ============================================================
// DADOS REAIS DO ESTOQUE
// ============================================================

let reservas = [];
let movimentos = [];
let emprestimos = [];
let ITENS_PESQUISA = [];
let emprestimosHistorico = [];
let reservaItemSelecionado = null;
let reservasCarregadas = false;

// ============================================================
// CALENDÁRIO
// ============================================================

const DIAS = [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
];

const MESES = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
];

const TIPOS = {
    letivo: ["Dia letivo", "#4f6b43"],
    feriado: ["Feriado", "#c2452d"],
    recesso: ["Recesso", "#8a6bbe"],
    evento: ["Evento escolar", "#2f6fb5"],
    reuniao: ["Reunião", "#7a8b2e"],
    prova: ["Prova", "#d9a441"],
    escola: ["Evento da escola", "#e07b39"],
};

/*
    Eventos provisórios.

    Depois podemos trocar esta parte pela aba
    18_CALENDARIO_ESCOLAR.
*/

const EV = {
    "2026-10-08": ["feriado", "Feriado"],
    "2026-10-12": ["feriado", "Nossa Senhora Aparecida"],
    "2026-10-15": ["evento", "Dia do Professor"],
    "2026-10-01": ["reuniao", "Reunião de pais"],
    "2026-10-24": ["escola", "Feira de Ciências"],
    "2026-10-28": ["recesso", "Dia do Servidor Público"],
    "2026-11-02": ["feriado", "Finados"],
    "2026-11-05": ["prova", "Prova de História"],
    "2026-11-20": ["evento", "Feira de Ciência"],
    "2026-12-18": ["escola", "Formatura do 3º Ano"],
    "2027-01-01": ["feriado", "Confraternização Universal"],
};

// ============================================================
// MENU
// ============================================================

const MENU = [
    ["inicio", "Início", "house"],
    ["reservas", "Reservas", "bookmark"],
    ["emprestimos", "Empréstimos", "book-open"],
    ["historico", "Histórico", "history"],
    ["pesquisar", "Pesquisar item", "search"],
    ["perfil", "Meu Perfil", "user-round"],
    ["calendario", "Calendário", "calendar-days"],
    ["cardapio", "Cardápio", "utensils"],
];

// ============================================================
// CARDÁPIO
// ============================================================

const CARD = {
    1: ["Arroz", "Feijão", "Frango", "Salada", "Fruta"],
    2: ["Macarrão", "Carne", "Salada", "Banana"],
    3: ["Arroz", "Feijão", "Peixe", "Legumes", "Laranja"],
    4: ["Arroz", "Feijão", "Carne moída", "Salada", "Melancia"],
    5: ["Arroz", "Feijão", "Frango assado", "Purê", "Maçã"],
};

// ============================================================
// CALENDÁRIO
// ============================================================

const today = new Date();

const cal = {
    view: "Mês",
    cur: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
};

let page = "inicio";

const $ = (selector) => document.querySelector(selector);

// ============================================================
// UTILITÁRIOS
// ============================================================

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function pad(n) {
    return String(n).padStart(2, "0");
}

function key(date) {
    return `${date.getFullYear()}-${pad(
        date.getMonth() + 1,
    )}-${pad(date.getDate())}`;
}

function showToast(message) {
    const toast = $("#toast");

    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2600);
}

function inicializarIcones() {
    if (window.lucide) {
        window.lucide.createIcons();
    } else {
        console.error("Lucide não foi carregado.");
    }
}

// ============================================================
// LOGIN
// ============================================================

function obterUsuarioLogado() {
    const salvo = sessionStorage.getItem("usuarioLogado");

    if (!salvo) {
        return null;
    }

    try {
        return JSON.parse(salvo);
    } catch (erro) {
        console.error("Erro ao ler usuarioLogado:", erro);

        sessionStorage.removeItem("usuarioLogado");

        return null;
    }
}

// ============================================================
// PERFIL
// ============================================================

async function carregarPerfilAluno() {
    usuarioLogado = obterUsuarioLogado();

    if (!usuarioLogado) {
        window.location.href = "/";
        return false;
    }

    const tipoUsuario = String(usuarioLogado.tipoUsuario || "").toUpperCase();

    const perfil = String(usuarioLogado.perfil || "").toUpperCase();

    if (tipoUsuario !== "ALUNO" && perfil !== "ALUNO") {
        showToast("Este painel é exclusivo para alunos.");

        return false;
    }

    const usuarioID = usuarioLogado.id;

    if (!usuarioID) {
        console.error("UsuarioID não encontrado no login.");

        return false;
    }

    try {
        const resposta = await fetch(
            `${API_URL}/aluno/perfil/${encodeURIComponent(usuarioID)}`,
        );

        const resultado = await resposta.json();

        if (!resposta.ok || !resultado.sucesso || !resultado.aluno) {
            throw new Error(
                resultado.mensagem || "Não foi possível carregar o perfil.",
            );
        }

        ALUNO = {
            ...ALUNO,
            ...resultado.aluno,
        };

        atualizarUsuarioLateral();

        return true;
    } catch (erro) {
        console.error("Erro ao carregar perfil do aluno:", erro);

        ALUNO = {
            ...ALUNO,
            nome: usuarioLogado.nome || "Aluno",
            email: usuarioLogado.email || "Não informado",
        };

        atualizarUsuarioLateral();

        showToast("Perfil carregado com os dados disponíveis.");

        return true;
    }
}

function atualizarUsuarioLateral() {
    const nome = ALUNO.nome || usuarioLogado?.nome || "Aluno";

    const nomeEl = $("#sidebarUserName");

    const avatarEl = $("#userAvatar");

    if (nomeEl) {
        nomeEl.textContent = nome;
        nomeEl.title = nome;
    }

    if (avatarEl) {
        avatarEl.textContent = nome.trim().charAt(0).toUpperCase() || "A";
    }
}

async function fazerLogout() {
    const botao = document.getElementById("logoutBtn");
    if (botao) botao.disabled = true;

    try {
        const resposta = await fetch("/api/logout", {
            method: "POST",
            credentials: "include",
        });

        const resultado = await resposta.json();

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error("Não foi possível sair.");
        }

        sessionStorage.removeItem("usuarioLogado");
        window.location.replace("/");
    } catch (erro) {
        alert("Erro ao sair. Tente novamente.");
        if (botao) botao.disabled = false;
    }
}

// ============================================================
// SIDEBAR
// ============================================================

function configurarSidebar() {
    const saved = localStorage.getItem("painelAlunoSidebar");

    if (saved === "collapsed") {
        document.body.classList.add("sidebar-collapsed");

        atualizarIconeSidebar();
    }

    const toggle = $("#sidebarToggle");

    if (toggle) {
        toggle.addEventListener("click", () => {
            document.body.classList.toggle("sidebar-collapsed");

            const collapsed =
                document.body.classList.contains("sidebar-collapsed");

            localStorage.setItem(
                "painelAlunoSidebar",
                collapsed ? "collapsed" : "expanded",
            );

            atualizarIconeSidebar();
        });
    }

    const mobileBtn = $("#mobileMenuBtn");

    const overlay = $("#mobileOverlay");

    if (mobileBtn) {
        mobileBtn.addEventListener("click", () => {
            document.body.classList.add("mobile-menu-open");
        });
    }

    if (overlay) {
        overlay.addEventListener("click", fecharMenuMobile);
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            fecharMenuMobile();
        }
    });

    const logout = $("#logoutBtn");

    if (logout) {
        logout.addEventListener("click", fazerLogout);
    }
}

function atualizarIconeSidebar() {
    const button = $("#sidebarToggle");

    if (!button) return;

    const collapsed = document.body.classList.contains("sidebar-collapsed");

    button.innerHTML = collapsed
        ? '<i data-lucide="panel-left-open"></i>'
        : '<i data-lucide="panel-left-close"></i>';

    button.setAttribute(
        "aria-label",
        collapsed ? "Expandir menu" : "Recolher menu",
    );

    button.setAttribute("title", collapsed ? "Expandir menu" : "Recolher menu");

    inicializarIcones();
}

function fecharMenuMobile() {
    document.body.classList.remove("mobile-menu-open");
}

function icon(name) {
    return `<i data-lucide="${name}"></i>`;
}

function go(nextPage) {
    page = nextPage;

    fecharMenuMobile();

    draw();
}

// ============================================================
// INÍCIO
// ============================================================

function viewInicio() {
    const primeiroNome = (ALUNO.nome || "Aluno").trim().split(/\s+/)[0];

    const w = hojeLetivo();

    const proximosEventos = Object.keys(EV)
        .map((data) => [new Date(`${data}T12:00:00`), EV[data]])
        .filter((item) => item[0] >= new Date(today.toDateString()))
        .sort((a, b) => a[0] - b[0]);

    const proximo = proximosEventos[0];

    const livrosLidos = movimentos.filter(
        (movimento) =>
            String(movimento.tipo || movimento[0] || "").toLowerCase() ===
            "livro",
    ).length;

    const computadoresUsados = movimentos.filter(
        (movimento) =>
            String(movimento.tipo || movimento[0] || "").toLowerCase() ===
            "computador",
    ).length;

    return `
        
<div class="hero">
    <div class="hero-info">
        <h1>Olá, ${escapeHtml(primeiroNome)}</h1>

        <p>
            ${escapeHtml(ALUNO.ano || "Ano não informado")}
            · Turma ${escapeHtml(ALUNO.turma || "Não informada")}
            · ${escapeHtml(ALUNO.turno || "Turno não informado")}
        </p>
    </div>

    <div class="hero-direita">
        <div class="stats">
            <div class="stat">
                <b>${livrosLidos}</b>
                <span>Livros lidos</span>
            </div>

            <div class="stat">
                <b>${computadoresUsados}</b>
                <span>Computadores</span>
            </div>
        </div>

        <div class="hero-relogio" id="relogioAluno">00:00:00</div>
    </div>
</div>


        <div class="grid">

            <div class="card">
                <div class="lab">
                    ${icon("bookmark")}
                    Minhas reservas
                </div>

                <div class="big">
                    ${reservas.length}
                    ${reservas.length === 1 ? "ativa" : "ativas"}
                </div>

                <p>
                    Livros e computadores reservados.
                </p>
            </div>

            <div class="card">
                <div class="lab">
                    ${icon("book-open")}
                    Meus empréstimos
                </div>

                <div class="big">
                    ${emprestimos.length}
                    ${emprestimos.length === 1 ? "ativo" : "ativos"}
                </div>

                <p>
                    ${
                        emprestimos.length
                            ? `Devolução prevista em ${escapeHtml(
                                  emprestimos[0].devolucao || "",
                              )}.`
                            : "Você não possui empréstimos ativos."
                    }
                </p>
            </div>

            <div class="card">
                <div class="lab">
                    ${icon("calendar-days")}
                    Próximo evento
                </div>

                <div class="big">
                    ${proximo ? escapeHtml(proximo[1][1]) : "Sem eventos"}
                </div>

                <p>
                    ${
                        proximo
                            ? `${proximo[0].getDate()} de ${MESES[
                                  proximo[0].getMonth()
                              ].toLowerCase()}`
                            : "Nenhum evento cadastrado."
                    }
                </p>
            </div>

            <div class="card">
                <div class="lab">
                    ${icon("utensils")}
                    Cardápio ${w >= 1 && w <= 5 ? "de hoje" : "da semana"}
                </div>

                <div class="big">
                    ${
                        w >= 1 && w <= 5
                            ? escapeHtml(CARD[w].slice(0, 2).join(" e "))
                            : "Consulte o cardápio"
                    }
                </div>

                <p>
                    ${
                        w >= 1 && w <= 5
                            ? escapeHtml(CARD[w].join(", "))
                            : "Veja o cardápio completo no menu."
                    }
                </p>
            </div>

        </div>
    `;
}

function hojeLetivo() {
    return today.getDay();
}

// ============================================================
// RESERVAS
// ============================================================

async function carregarReservas() {
    if (!usuarioLogado?.id) {
        reservas = [];
        reservasCarregadas = false;
        return false;
    }

    try {
        const resposta = await fetch(
            `${API_URL}/aluno/reservas/${encodeURIComponent(usuarioLogado.id)}`,
        );

        const resultado = await resposta.json();

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(
                resultado.mensagem ||
                    "Não foi possível carregar suas reservas.",
            );
        }

        reservas = Array.isArray(resultado.reservas) ? resultado.reservas : [];

        reservasCarregadas = true;

        console.log("Reservas carregadas:", reservas);

        return true;
    } catch (erro) {
        console.error("Erro ao carregar reservas:", erro);

        reservas = [];
        reservasCarregadas = false;

        showToast("Não foi possível carregar suas reservas.");

        return false;
    }
}

async function carregarEmprestimos() {
    const usuarioID = usuarioLogado?.id;

    if (!usuarioID) {
        emprestimos = [];
        return;
    }

    try {
        const resposta = await fetch(
            `${API_URL}/aluno/emprestimos/${encodeURIComponent(usuarioID)}`,
            {
                credentials: "include",
            },
        );

        const resultado = await resposta.json();

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(
                resultado.mensagem ||
                    "Não foi possível carregar os empréstimos.",
            );
        }

        emprestimos = resultado.emprestimos || [];
    } catch (erro) {
        console.error("Erro ao carregar empréstimos:", erro);
        emprestimos = [];
    }
}

async function carregarEmprestimosHistorico() {
    const usuarioID = usuarioLogado?.id;

    if (!usuarioID) {
        emprestimosHistorico = [];
        return;
    }

    try {
        const resposta = await fetch(
            `${API_URL}/aluno/historico-emprestimos/${encodeURIComponent(usuarioID)}`,
            { credentials: "include" },
        );

        const resultado = await resposta.json();

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(
                resultado.mensagem || "Erro ao carregar histórico.",
            );
        }

        emprestimosHistorico = Array.isArray(resultado.emprestimos)
            ? resultado.emprestimos
            : [];
    } catch (erro) {
        console.error("Erro ao carregar histórico:", erro);
        emprestimosHistorico = [];
        showToast("Não foi possível carregar os empréstimos do histórico.");
    }
}

function formatarDataHoraReserva(valor) {
    if (!valor) {
        return "Não informado";
    }

    const texto = String(valor).trim();

    const match = texto.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);

    if (!match) {
        return escapeHtml(texto);
    }

    return `${match[3]}/${match[2]}/${match[1]} às ${match[4]}:${match[5]}`;
}

function classeStatusReserva(status) {
    const valor = String(status || "")
        .trim()
        .toUpperCase();

    if (valor === "PENDENTE") {
        return "pending";
    }

    if (
        valor === "APROVADA" ||
        valor === "APROVADO" ||
        valor === "CONFIRMADA" ||
        valor === "CONFIRMADO"
    ) {
        return "approved";
    }

    if (
        valor === "CANCELADA" ||
        valor === "CANCELADO" ||
        valor === "REJEITADA" ||
        valor === "REJEITADO"
    ) {
        return "cancelled";
    }

    if (
        valor === "CONCLUIDA" ||
        valor === "CONCLUÍDA" ||
        valor === "FINALIZADA" ||
        valor === "FINALIZADO"
    ) {
        return "finished";
    }

    return "";
}

function textoStatusReserva(status) {
    const valor = String(status || "")
        .trim()
        .toUpperCase();

    const mapa = {
        PENDENTE: "Pendente",
        APROVADA: "Aprovada",
        APROVADO: "Aprovada",
        CONFIRMADA: "Confirmada",
        CONFIRMADO: "Confirmada",
        CANCELADA: "Cancelada",
        CANCELADO: "Cancelada",
        REJEITADA: "Rejeitada",
        REJEITADO: "Rejeitada",
        CONCLUIDA: "Concluída",
        CONCLUÍDA: "Concluída",
        FINALIZADA: "Finalizada",
        FINALIZADO: "Finalizada",
    };

    return mapa[valor] || status || "Não informado";
}

function viewReservas() {
    const rows = reservas
        .map(
            (r) => `
                <tr>
                    <td>
                        ${escapeHtml(r.tipo || "Item")}
                    </td>

                    <td>
                        <b>
                            ${escapeHtml(
                                r.nome || r.item || r.produtoID || "Item",
                            )}
                        </b>
                    </td>

                    <td>
                        ${escapeHtml(formatarDataHoraReserva(r.dataInicio))}
                    </td>

                    <td>
                        ${escapeHtml(formatarDataHoraReserva(r.dataFim))}
                    </td>

                    <td>
                        <span class="tag ${classeStatusReserva(r.status)}">
                            ${escapeHtml(textoStatusReserva(r.status))}
                        </span>
                    </td>
                </tr>
            `,
        )
        .join("");

    return `
        <div class="head">

            <h1>
                Minhas Reservas
            </h1>

            <p class="sub">
                Consulte as reservas vinculadas à sua conta.
            </p>

        </div>

        <div class="card">

            <div class="scroll">

                <table>

                    <thead>
                        <tr>
                            <th>Tipo</th>
                            <th>Item</th>
                            <th>Retirada</th>
                            <th>Devolução</th>
                            <th>Situação</th>
                        </tr>
                    </thead>

                    <tbody>

                        ${
                            rows ||
                            `
                            <tr>
                                <td colspan="5">
                                    Você ainda não possui reservas.
                                </td>
                            </tr>
                            `
                        }

                    </tbody>

                </table>

            </div>

        </div>

        <div class="note">

            ${icon("search")}

            <span>
                Para fazer uma reserva, acesse "Pesquisar item",
                encontre um livro ou computador disponível e clique nele.
            </span>

        </div>
    `;
}

// ============================================================
// MODAL DE RESERVA
// ============================================================

function criarModalReserva() {
    if ($("#reservaModal")) {
        return;
    }

    const modal = document.createElement("div");

    modal.id = "reservaModal";

    modal.innerHTML = `
       <div class="reserva-overlay">

              <div class="reserva-modal">

                <div class="reserva-modal-header">

                    <div>
                        <span class="item-type" id="reservaTipo">
                            Item
                        </span>

                        <h2 id="reservaNome">
                            Reserva
                        </h2>

                        <p id="reservaDetalhes">
                            Escolha o período da reserva.
                        </p>
                    </div>

                    <button
                        type="button"
                        class="reserva-close"
                        aria-label="Fechar"
                    >
                        ${icon("x")}
                    </button>

                </div>

                <div class="reserva-modal-body">

                    <div class="reserva-info">

                        <div>
                            ${icon("hash")}

                            <span>
                                Código
                            </span>

                            <b id="reservaCodigo">
                                -
                            </b>
                        </div>

                        <div>
                            ${icon("map-pin")}

                            <span>
                                Local
                            </span>

                            <b id="reservaLocal">
                                -
                            </b>
                        </div>

                        <div>
                            ${icon("package")}

                            <span>
                                Disponível
                            </span>

                            <b id="reservaDisponivel">
                                -
                            </b>
                        </div>

                    </div>

                    <div class="reserva-section-title">
                        <h3>
                            Período da reserva
                        </h3>

                        <p>
                            Informe quando você irá retirar e devolver o item.
                        </p>
                    </div>

                    <div class="reserva-fields">

                        <div class="reserva-field">

                            <label for="reservaDataRetirada">
                                Data da retirada
                            </label>

                            <input
                                id="reservaDataRetirada"
                                type="date"
                            >

                        </div>

                        <div class="reserva-field">

                            <label for="reservaHoraRetirada">
                                Hora da retirada
                            </label>

                            <input
                                id="reservaHoraRetirada"
                                type="time"
                            >

                        </div>

                        <div class="reserva-field">

                            <label for="reservaDataDevolucao">
                                Data da devolução
                            </label>

                            <input
                                id="reservaDataDevolucao"
                                type="date"
                            >

                        </div>

                        <div class="reserva-field">

                            <label for="reservaHoraDevolucao">
                                Hora da devolução
                            </label>

                            <input
                                id="reservaHoraDevolucao"
                                type="time"
                            >

                        </div>

                    </div>

                    <div class="reserva-field">

                        <label for="reservaMotivo">
                            Motivo da reserva
                        </label>

                        <textarea
                            id="reservaMotivo"
                            rows="3"
                            maxlength="500"
                            placeholder="Informe o motivo da utilização..."
                        ></textarea>

                    </div>

                    <div class="reserva-field">

                        <label for="reservaObservacao">
                            Observação
                        </label>

                        <textarea
                            id="reservaObservacao"
                            rows="2"
                            maxlength="500"
                            placeholder="Alguma observação? Opcional."
                        ></textarea>

                    </div>

                    <div class="reserva-alert">

                        ${icon("info")}

                        <span>
                            A reserva será enviada para o sistema e ficará
                            registrada na planilha.
                        </span>

                    </div>

                </div>

                <div class="reserva-modal-footer">

                    <button type="button" class="btn secondary reserva-cancelar">
    Cancelar
</button>

                    <button type="button" class="btn" id="confirmarReservaBtn">
    ${icon("bookmark-check")}
    Confirmar reserva
</button>

                </div>

            </div>

        </div>
    `;

    document.body.appendChild(modal);
    const overlay = modal.querySelector(".reserva-overlay");
    const caixa = modal.querySelector(".reserva-modal");

    overlay.addEventListener("click", fecharReserva);

    caixa.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    modal
        .querySelector(".reserva-close")
        .addEventListener("click", () => fecharReserva());

    modal
        .querySelector(".reserva-cancelar")
        .addEventListener("click", () => fecharReserva());

    modal
        .querySelector("#confirmarReservaBtn")
        .addEventListener("click", confirmarReserva);

    inicializarIcones();
}

function abrirReserva(produtoID) {
    const item = ITENS_PESQUISA.find(
        (produto) => String(produto.produtoID) === String(produtoID),
    );

    if (!item) {
        showToast("Item não encontrado.");
        return;
    }

    if (!item.podeReservar) {
        showToast("Este item não está disponível para reserva.");
        return;
    }

    if (!item.localID) {
        showToast("O local deste item não foi identificado.");
        return;
    }

    reservaItemSelecionado = item;

    criarModalReserva();

    const modal = $("#reservaModal");

    if (!modal) {
        return;
    }

    $("#reservaTipo").textContent = item.tipo || "Item";

    $("#reservaNome").textContent = item.nome || "Item";

    $("#reservaDetalhes").textContent = item.autor
        ? `Autor: ${item.autor}`
        : "Informe o período da reserva.";

    $("#reservaCodigo").textContent = item.codigo || item.produtoID || "-";

    $("#reservaLocal").textContent = item.local || "Não informado";

    $("#reservaDisponivel").textContent = String(item.disponivel ?? 0);

    const hoje = new Date();

    const ano = hoje.getFullYear();

    const mes = pad(hoje.getMonth() + 1);

    const dia = pad(hoje.getDate());

    const dataMinima = `${ano}-${mes}-${dia}`;

    const dataRetirada = $("#reservaDataRetirada");

    const dataDevolucao = $("#reservaDataDevolucao");

    const horaRetirada = $("#reservaHoraRetirada");

    const horaDevolucao = $("#reservaHoraDevolucao");

    if (dataRetirada) {
        dataRetirada.min = dataMinima;
        dataRetirada.value = "";
    }

    if (dataDevolucao) {
        dataDevolucao.min = dataMinima;
        dataDevolucao.value = "";
    }

    if (horaRetirada) {
        horaRetirada.value = "";
    }

    if (horaDevolucao) {
        horaDevolucao.value = "";
    }

    const motivo = $("#reservaMotivo");
    const observacao = $("#reservaObservacao");

    if (motivo) {
        motivo.value = "";
    }

    if (observacao) {
        observacao.value = "";
    }

    if (dataRetirada) {
        dataRetirada.onchange = () => {
            if (dataDevolucao) {
                dataDevolucao.min = dataRetirada.value || dataMinima;

                if (
                    dataDevolucao.value &&
                    dataDevolucao.value < dataDevolucao.min
                ) {
                    dataDevolucao.value = dataDevolucao.min;
                }
            }
        };
    }

    modal.classList.add("open");

    document.body.classList.add("reserva-modal-open");

    setTimeout(() => {
        dataRetirada?.focus();
    }, 100);

    inicializarIcones();
}

function fecharReserva(event) {
    if (
        event &&
        event.target &&
        event.target.id !== "reservaModal" &&
        !event.target.classList.contains("reserva-overlay")
    ) {
        return;
    }

    const modal = $("#reservaModal");

    if (modal) {
        modal.classList.remove("open");
    }

    document.body.classList.remove("reserva-modal-open");

    reservaItemSelecionado = null;
}

async function confirmarReserva() {
    if (!reservaItemSelecionado) {
        showToast("Nenhum item foi selecionado.");
        return;
    }

    if (!usuarioLogado?.id) {
        showToast("Usuário não identificado.");
        return;
    }

    const dataRetirada = $("#reservaDataRetirada")?.value;

    const horaRetirada = $("#reservaHoraRetirada")?.value;

    const dataDevolucao = $("#reservaDataDevolucao")?.value;

    const horaDevolucao = $("#reservaHoraDevolucao")?.value;

    const motivo = $("#reservaMotivo")?.value.trim() || "";

    const observacao = $("#reservaObservacao")?.value.trim() || "";

    if (!dataRetirada || !horaRetirada || !dataDevolucao || !horaDevolucao) {
        showToast("Preencha a data e a hora da retirada e da devolução.");
        return;
    }

    const inicio = new Date(`${dataRetirada}T${horaRetirada}:00`);

    const fim = new Date(`${dataDevolucao}T${horaDevolucao}:00`);

    const agora = new Date();

    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
        showToast("Informe datas e horários válidos.");
        return;
    }

    if (inicio <= agora) {
        showToast("A retirada precisa ser em uma data e horário futuros.");
        return;
    }

    if (fim <= inicio) {
        showToast("A devolução precisa acontecer depois da retirada.");
        return;
    }

    const botao = $("#confirmarReservaBtn");

    if (botao) {
        botao.disabled = true;
        botao.innerHTML = `
            ${icon("loader-circle")}
            Enviando...
        `;

        inicializarIcones();
    }

    try {
        const resposta = await fetch(`${API_URL}/aluno/reservas`, {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
            },

            body: JSON.stringify({
                usuarioID: usuarioLogado.id,

                produtoID: reservaItemSelecionado.produtoID,

                localID: reservaItemSelecionado.localID,

                dataRetirada,
                horaRetirada,

                dataDevolucao,
                horaDevolucao,

                motivo,
                observacao,
            }),
        });

        const resultado = await resposta.json();

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(
                resultado.mensagem ||
                    resultado.erro ||
                    "Não foi possível criar a reserva.",
            );
        }

        showToast("Reserva criada com sucesso.");

        fecharReserva();

        await carregarReservas();

        await carregarItensPesquisa();

        go("reservas");
    } catch (erro) {
        console.error("Erro ao criar reserva:", erro);

        showToast(erro.message || "Não foi possível criar a reserva.");
    } finally {
        if (botao) {
            botao.disabled = false;

            botao.innerHTML = `
                ${icon("bookmark-check")}
                Confirmar reserva
            `;

            inicializarIcones();
        }
    }
}

function viewEmprestimos() {
    const rows = emprestimos
        .map(
            (r) => `
                <tr>
                    <td>${escapeHtml(r.tipo)}</td>

                    <td>
                        <b>${escapeHtml(r.item)}</b>
                    </td>

                    <td>${escapeHtml(r.retirada)}</td>

                    <td>${escapeHtml(r.devolucao)}</td>

                    <td>
                        <span class="tag">
                            Em andamento
                        </span>
                    </td>
                </tr>
            `,
        )
        .join("");

    return `
        <div class="head">
            <h1>Meus Empréstimos</h1>

            <p class="sub">
                Itens que estão atualmente com você.
            </p>
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

// ============================================================
// HISTÓRICO
// ============================================================

function viewHistorico() {
    const todos = [
        ...reservas.map((r) => ({
            registro: "Reserva",
            id: r.reservaID || r.id || "",
            item: r.nome || r.item || r.produtoID || "Item não identificado",
            tipo:
                r.categoriaNome || r.nomeCategoria || r.tipo || "Não informado",
            local: r.local || r.localID || "Não informado",
            quantidade: r.quantidade || "1",
            data: r.dataInicio || "",
            devolucao: r.dataFim || "",
            status: r.status || "SEM STATUS",
        })),

        ...emprestimosHistorico.map((e) => ({
            registro: "Empréstimo",
            id: e.emprestimoID || e.id || "",
            item: e.item || e.nome || e.produtoID || "Item não identificado",
            tipo: e.tipo || "Item",
            local: e.local || e.localID || "Não informado",
            quantidade: e.quantidade || "1",
            data: e.retirada || "",
            devolucao: e.devolucao || "",
            dataDevolucao: e.dataDevolucao || "",
            status: e.status || "SEM STATUS",
        })),
    ];

    const registrosFiltrados = todos.filter((r) => {
        const tipoCorresponde =
            filtroHistoricoTipo === "todos" ||
            (filtroHistoricoTipo === "reservas" && r.registro === "Reserva") ||
            (filtroHistoricoTipo === "emprestimos" &&
                r.registro === "Empréstimo");

        const categoria = categoriaHistorico(r);

        const categoriaCorresponde =
            filtroHistoricoCategoria === "todas" ||
            categoria === filtroHistoricoCategoria;

        return tipoCorresponde && categoriaCorresponde;
    });

    registrosFiltrados.sort((a, b) =>
        String(b.data).localeCompare(String(a.data)),
    );

    registrosFiltrados.sort((a, b) =>
        String(b.data).localeCompare(String(a.data)),
    );

    todos.sort((a, b) => String(b.data).localeCompare(String(a.data)));

    const cards = registrosFiltrados
        .map((r) => {
            const status = String(r.status).trim().toUpperCase();

            let classe = "historico-pendente";

            if (
                ["APROVADA", "APROVADO", "ABERTO", "EM ANDAMENTO"].includes(
                    status,
                )
            ) {
                classe = "historico-aprovada";
            } else if (["ATRASADO"].includes(status)) {
                classe = "historico-atrasado";
            } else if (
                [
                    "CANCELADA",
                    "CANCELADO",
                    "RECUSADA",
                    "RECUSADO",
                    "REJEITADA",
                    "REJEITADO",
                ].includes(status)
            ) {
                classe = "historico-recusada";
            } else if (
                [
                    "DEVOLVIDO",
                    "DEVOLVIDA",
                    "CONCLUIDO",
                    "CONCLUÍDO",
                    "CONCLUIDA",
                    "CONCLUÍDA",
                    "FINALIZADO",
                    "FINALIZADA",
                ].includes(status)
            ) {
                classe = "historico-concluido";
            }

            return `
            <div class="historico-card">
                <div class="historico-card-topo">
                    
<span class="historico-tipo ${r.registro === "Reserva" ? "tipo-reserva" : "tipo-emprestimo"}">
    ${icon(r.registro === "Reserva" ? "calendar-check" : "book-open")}
    ${escapeHtml(r.registro)}
</span>

                    <span class="historico-status ${classe}">
                        ${escapeHtml(status.replace(/_/g, " "))}
                    </span>
                </div>

                
<h3>
    ${icon(
        /computador|desktop/i.test(r.item)
            ? "monitor"
            : /livro/i.test(r.tipo)
              ? "book-open"
              : "package",
    )}
    ${escapeHtml(r.item)}
</h3>

<div class="historico-dados">
    <p>
        ${icon("layers")}
        <span><b>Tipo</b>${escapeHtml(r.tipo)}</span>
    </p>

    <p>
        ${icon("hash")}
        <span><b>ID do registro</b>${escapeHtml(r.id || "Não informado")}</span>
    </p>

    <p>
        ${icon("map-pin")}
        <span><b>Local</b>${escapeHtml(r.local)}</span>
    </p>

    <p>
        ${icon("package")}
        <span><b>Quantidade</b>${escapeHtml(r.quantidade)}</span>
    </p>

    <p>
        ${icon("calendar")}
        <span><b>Data</b>${escapeHtml(formatarDataHoraReserva(r.data))}</span>
    </p>

    <p>
        ${icon("calendar-clock")}
        <span><b>Devolução prevista</b>${escapeHtml(formatarDataHoraReserva(r.devolucao))}</span>
    </p>

    ${
        r.dataDevolucao
            ? `
        <p>
            ${icon("check-circle")}
            <span>
                <b>Devolvido em</b>
                ${escapeHtml(formatarDataHoraReserva(r.dataDevolucao))}
            </span>
        </p>
    `
            : ""
    }
</div>

            </div>
        `;
        })
        .join("");

    return `
        <div class="head">
            <h1>Histórico</h1>
            <p class="sub">Consulte todas as suas reservas e empréstimos.</p>
        </div>

        <div class="grid">
            <div class="card">
                <div class="lab">${icon("bookmark")} Reservas</div>
                <div class="big">${reservas.length}</div>
                <p>Registros de reservas.</p>
            </div>

            <div class="card">
                <div class="lab">${icon("book-open")} Empréstimos</div>
                <div class="big">${emprestimosHistorico.length}</div>
                <p>Registros de empréstimos, incluindo devolvidos.</p>
            </div>
        </div>

        

<div class="historico-filtros">
    <div class="historico-filtro-grupo">
        <span>Tipo de registro</span>
        <div class="historico-botoes">
            <button type="button" data-filtro-tipo="todos"
                class="${filtroHistoricoTipo === "todos" ? "ativo" : ""}">Todos</button>

            <button type="button" data-filtro-tipo="reservas"
                class="${filtroHistoricoTipo === "reservas" ? "ativo" : ""}">Reservas</button>

            <button type="button" data-filtro-tipo="emprestimos"
                class="${filtroHistoricoTipo === "emprestimos" ? "ativo" : ""}">Empréstimos</button>
        </div>
    </div>

    <div class="historico-filtro-grupo">
        <span>Categoria</span>
        
<div class="historico-filtro-grupo">

    <div class="historico-botoes">
        <button type="button"
            data-filtro-categoria="todas"
            class="${filtroHistoricoCategoria === "todas" ? "ativo" : ""}">
            Todos
        </button>

        <button type="button"
            data-filtro-categoria="biblioteca"
            class="${filtroHistoricoCategoria === "biblioteca" ? "ativo" : ""}">
            Biblioteca
        </button>

        <button type="button"
            data-filtro-categoria="informatica"
            class="${filtroHistoricoCategoria === "informatica" ? "ativo" : ""}">
            Informática
        </button>
    </div>
</div>

    </div>
</div>



        <div class="historico-lista">
            ${
                cards ||
                `
                <div class="historico-vazio">
                   Nenhum registro encontrado para os filtros selecionados.
                </div>
            `
            }
        </div>
    `;
}

function configurarEventosFiltroHistorico() {
    const pagina = document.getElementById("pageContent");

    if (!pagina || pagina.dataset.filtroHistoricoConfigurado === "sim") {
        return;
    }

    pagina.dataset.filtroHistoricoConfigurado = "sim";

    pagina.addEventListener("click", (evento) => {
        const botao = evento.target.closest(
            "[data-filtro-tipo], [data-filtro-categoria]",
        );

        if (!botao || !pagina.contains(botao)) return;

        if (botao.dataset.filtroTipo) {
            filtroHistoricoTipo = botao.dataset.filtroTipo;
        }

        if (botao.dataset.filtroCategoria) {
            filtroHistoricoCategoria = botao.dataset.filtroCategoria;
        }

        pagina.innerHTML = viewHistorico();
    });
}

let filtroHistoricoTipo = "todos";
let filtroHistoricoCategoria = "todas";

function aplicarFiltroHistorico(tipo, categoria) {
    if (tipo) filtroHistoricoTipo = tipo;
    if (categoria) filtroHistoricoCategoria = categoria;

    const pagina = document.getElementById("pageContent");

    if (pagina) {
        pagina.innerHTML = viewHistorico();

        if (typeof inicializarIcones === "function") {
            inicializarIcones();
        }
    }
}

function categoriaHistorico(registro) {
    const texto = [
        registro.item || "",
        registro.tipo || "",
        registro.local || "",
    ]
        .join(" ")
        .toLowerCase();

    if (texto.includes("biblioteca") || texto.includes("livro")) {
        return "biblioteca";
    }

    if (
        texto.includes("informática") ||
        texto.includes("informatica") ||
        texto.includes("computador") ||
        texto.includes("desktop")
    ) {
        return "informatica";
    }

    return "outros";
}

// ============================================================
// STATUS
// ============================================================

function statusClasse(status) {
    const valor = String(status || "").toLowerCase();

    if (valor === "disponível") {
        return "available";
    }

    if (valor === "emprestado / em uso") {
        return "in-use";
    }

    if (valor === "em manutenção") {
        return "maintenance";
    }

    return "";
}

// ============================================================
// PESQUISA DE ITENS
// ============================================================

function pesquisarItens() {
    const input = $("#itemSearch");
    const tipo = $("#itemType");
    const status = $("#itemStatus");
    const resultados = $("#itemResults");
    const quantidade = $("#itemCount");

    if (!input || !tipo || !status || !resultados) {
        return;
    }

    const termo = input.value.trim().toLowerCase();
    const tipoSelecionado = tipo.value;
    const statusSelecionado = status.value;

    const filtrados = ITENS_PESQUISA.filter((item) => {
        const textoBusca = [
            item.nome,
            item.codigo,
            item.tipo,
            item.local,
            item.detalhe,
            item.autor,
            item.categoria,
            item.subcategoria,
        ]
            .join(" ")
            .toLowerCase();

        // Pesquisa por nome/código/local
        const bateTexto = !termo || textoBusca.includes(termo);

        // Filtro por tipo
        const bateTipo = !tipoSelecionado || item.tipo === tipoSelecionado;

        // Filtro por situação
        const bateStatus =
            !statusSelecionado || item.situacaoTexto === statusSelecionado;

        return bateTexto && bateTipo && bateStatus;
    });

    if (quantidade) {
        quantidade.textContent = `${filtrados.length} ${
            filtrados.length === 1 ? "item encontrado" : "itens encontrados"
        }`;
    }

    resultados.innerHTML = filtrados.length
        ? filtrados
              .map(
                  (item) => `
             <article
    class="item-result-card ${item.podeReservar ? "reservable" : ""}"
    ${
        item.podeReservar
            ? `data-produto-id="${escapeHtml(item.produtoID)}"
           role="button" tabindex="0" title="Clique para reservar"`
            : ""
    }
>

                        <div class="item-result-icon">
                            ${icon(
                                item.tipo === "Livro" ? "book-open" : "monitor",
                            )}
                        </div>

                        <div class="item-result-main">

                            <div class="item-result-top">

                                <div>
                                    <span class="item-type">
                                        ${escapeHtml(item.tipo)}
                                    </span>

                                    <h3>
                                        ${escapeHtml(item.nome)}
                                    </h3>
                                </div>

                                <span
                                    class="item-status ${statusClasse(
                                        item.situacaoTexto,
                                    )}"
                                >
                                    ${escapeHtml(item.situacaoTexto)}
                                </span>

                            </div>

                            <p>
                                ${escapeHtml(
                                    item.detalhe ||
                                        "Sem informações adicionais.",
                                )}
                            </p>

                            <div class="item-result-meta">

                                <span>
                                    ${icon("hash")}
                                    ${escapeHtml(
                                        item.codigo ||
                                            item.produtoID ||
                                            "Sem código",
                                    )}
                                </span>

                                <span>
                                    ${icon("map-pin")}
                                    ${escapeHtml(item.local || "Não informado")}
                                </span>

                                <span>
                                    ${icon("package")}
                                    ${escapeHtml(String(item.disponivel ?? 0))}
                                    disponível
                                </span>

                            </div>

                        </div>

                    </article>
                `,
              )
              .join("")
        : `
            <div class="search-empty">

                ${icon("search-x")}

                <strong>
                    Nenhum item encontrado
                </strong>

                <p>
                    Não existem itens com essa situação.
                </p>

            </div>
        `;
    resultados.addEventListener("click", (event) => {
        const card = event.target.closest("[data-produto-id]");

        if (card && resultados.contains(card)) {
            abrirReserva(card.dataset.produtoId);
        }
    });

    inicializarIcones();
}

function limparPesquisaItens() {
    const input = $("#itemSearch");

    const tipo = $("#itemType");

    const status = $("#itemStatus");

    if (input) {
        input.value = "";
    }

    if (tipo) {
        tipo.value = "";
    }

    if (status) {
        status.value = "";
    }

    pesquisarItens();
}

// ============================================================
// TELA PESQUISAR
// ============================================================

function viewPesquisar() {
    return `
        <div class="head">

            <h1>
                Pesquisar item
            </h1>

            <p class="sub">
                Encontre livros da Biblioteca e computadores do Laboratório de Informática.
            </p>

        </div>

        <div class="card search-panel">

            <div class="search-main-field">

                <label for="itemSearch">
                    O que você está procurando?
                </label>

                <div class="search-input-wrap">

                    ${icon("search")}

                    <input
                        id="itemSearch"
                        type="search"
                        placeholder="Digite o nome, código ou palavra-chave..."
                        autocomplete="off"
                    >

                </div>

            </div>

            <div class="search-filters">

                <div>

                    <label for="itemType">
                        Tipo
                    </label>

                    <select
                        id="itemType"
                    >

                        <option value="">
                            Todos
                        </option>

                        <option value="Livro">
                            Livros
                        </option>

                        <option value="Computador">
                            Computadores
                        </option>

                    </select>

                </div>

                <div>

                    <label for="itemStatus">
                        Situação
                    </label>

                    <select
                        id="itemStatus"
                    >

                        <option value="">
                            Todas
                        </option>

                        <option value="Disponível">
                            Disponíveis
                        </option>

                        <option value="Emprestado / Em uso">
                            Emprestados / Em uso
                        </option>

                        <option value="Em manutenção">
                            Em manutenção
                        </option>

                    </select>

                </div>

                <button
                    class="btn sm search-clear"
                    type="button"
                >
                    ${icon("rotate-ccw")}
                    Limpar
                </button>

            </div>

        </div>

        <div class="search-results-head">

            <div>

                <h2>
                    Itens encontrados
                </h2>

                <span id="itemCount">
                    ${ITENS_PESQUISA.length}
                    ${
                        ITENS_PESQUISA.length === 1
                            ? "item encontrado"
                            : "itens encontrados"
                    }
                </span>

            </div>

        </div>

        <div
            id="itemResults"
            class="item-results"
        ></div>

        <div class="note search-note">

            ${icon("info")}

            <span>
               Nesta área o aluno pode consultar livros e computadores.
Clique em um item disponível para iniciar uma reserva.
            </span>

        </div>
    `;
}

// ============================================================
// PERFIL
// ============================================================

function viewPerfil() {
    const field = (label, value) => `
        <div class="field">

            <small>
                ${escapeHtml(label)}
            </small>

            <b>
                ${escapeHtml(value || "Não informado")}
            </b>

        </div>
    `;

    return `
        <div class="head">

            <h1>
                Meu Perfil
            </h1>

            <p class="sub">
                Seus dados cadastrados. Para alterações, procure a Secretaria.
            </p>

        </div>

        <div class="prof">

            ${field("Nome completo", ALUNO.nome)}

            ${field("Idade", ALUNO.idade)}

            ${field("Ano", ALUNO.ano)}

            ${field("Turma", ALUNO.turma)}

            ${field("Turno", ALUNO.turno)}

            ${field("E-mail", ALUNO.email)}

            ${field("Matrícula", ALUNO.matricula)}

            <div class="field">

                <small>
                    Senha
                </small>

                <b
                    style="letter-spacing:.18em"
                >
                    ••••••••••••
                </b>

            </div>

        </div>

        <div class="note">

            ${icon("lock")}

            <span>
                Por segurança, a senha é armazenada de forma protegida
                e não pode ser exibida.
            </span>

        </div>
    `;
}

// ============================================================
// CALENDÁRIO
// ============================================================

function eventoDoDia(date) {
    const evento = EV[key(date)];

    if (evento) {
        return evento;
    }

    const day = date.getDay();

    if (day >= 1 && day <= 5) {
        return ["letivo", "Dia letivo"];
    }

    return ["fimSemana", "Fim de semana"];
}

function corEvento(tipo) {
    if (tipo === "fimSemana") {
        return "#9a8b82";
    }

    return TIPOS[tipo]?.[1] || "#9a8b82";
}

function nomeTipoEvento(tipo) {
    if (tipo === "fimSemana") {
        return "Fim de semana";
    }

    return TIPOS[tipo]?.[0] || "Evento";
}

function tooltipEvento(evento) {
    return `${nomeTipoEvento(evento[0])}: ${evento[1]}`;
}

function monthGrid(year, month) {
    const first = new Date(year, month, 1);

    const offset = (first.getDay() + 6) % 7;

    const totalDays = new Date(year, month + 1, 0).getDate();

    let html = `
        <div class="cal">

            ${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
                .map((day) => `<div class="dh">${day}</div>`)
                .join("")}
    `;

    for (let i = 0; i < offset; i++) {
        html += `<div class="c out"></div>`;
    }

    for (let day = 1; day <= totalDays; day++) {
        const date = new Date(year, month, day);

        const evento = eventoDoDia(date);

        const weekend = date.getDay() === 0 || date.getDay() === 6;

        const isToday = key(date) === key(today);

        const isSpecial = evento[0] !== "letivo" && evento[0] !== "fimSemana";

        const tooltip = tooltipEvento(evento);

        html += `
            <div
                class="c ${weekend ? "we" : ""} ${isToday ? "today" : ""} ${
                    isSpecial ? "event-day" : ""
                }"
                ${isSpecial ? `title="${escapeHtml(tooltip)}"` : ""}
                aria-label="${escapeHtml(tooltip)}"
            >

                <b>
                    ${day}
                </b>

                ${
                    isSpecial
                        ? `
                        <div class="ev">

                            <i
                                class="dot"
                                style="--c:${corEvento(evento[0])}"
                            ></i>

                            <span>
                                ${escapeHtml(evento[1])}
                            </span>

                        </div>
                        `
                        : ""
                }

            </div>
        `;
    }

    html += `</div>`;

    return html;
}

function miniMonth(year, month) {
    const offset = (new Date(year, month, 1).getDay() + 6) % 7;

    const totalDays = new Date(year, month + 1, 0).getDate();

    let html = `
        <div
    class="mini"
    data-calendar-month="${month}"
    data-calendar-year="${year}"
    role="button"
    tabindex="0"
>

            <h2>
                ${MESES[month]}
            </h2>

            <div class="mg">
    `;

    for (let i = 0; i < offset; i++) {
        html += "<i></i>";
    }

    for (let day = 1; day <= totalDays; day++) {
        const date = new Date(year, month, day);

        const evento = eventoDoDia(date);

        const special = evento[0] !== "letivo" && evento[0] !== "fimSemana";

        html += `
            <i
                ${
                    special
                        ? `class="e" style="--c:${corEvento(
                              evento[0],
                          )}" title="${escapeHtml(tooltipEvento(evento))}"`
                        : ""
                }
            >
                ${day}
            </i>
        `;
    }

    html += `
            </div>

        </div>
    `;

    return html;
}

function dayRow(date) {
    const evento = eventoDoDia(date);

    return `
        <div class="row">

            <div class="d">
                ${DIAS[date.getDay()]},
                ${date.getDate()}/${pad(date.getMonth() + 1)}
            </div>

            <div class="t">
                ${escapeHtml(evento[1])}
            </div>

            <span
                class="ev"
                title="${escapeHtml(tooltipEvento(evento))}"
            >

                <i
                    class="dot"
                    style="--c:${corEvento(evento[0])}"
                ></i>

                ${escapeHtml(nomeTipoEvento(evento[0]))}

            </span>

        </div>
    `;
}

function viewCalendario() {
    const c = cal.cur;
    const v = cal.view;

    const tabs = ["Ano", "Mês", "Semana", "Dia"]
        .map(
            (item) => `
                <button
    class="${item === v ? "on" : ""}"
    data-calendar-view="${item}"
    type="button"
>
    ${item}
</button>
            `,
        )
        .join("");

    const years = [2026, 2027]
        .map(
            (year) => `
                <option
                    value="${year}"
                    ${year === c.getFullYear() ? "selected" : ""}
                >
                    ${year}
                </option>
            `,
        )
        .join("");

    const months = MESES.map(
        (month, index) => `
                <option
                    value="${index}"
                    ${index === c.getMonth() ? "selected" : ""}
                >
                    ${month}
                </option>
            `,
    ).join("");

    let body = "";

    if (v === "Mês") {
        body = monthGrid(c.getFullYear(), c.getMonth());
    } else if (v === "Ano") {
        body = `
            <div class="yr">
                ${MESES.map((_, index) =>
                    miniMonth(c.getFullYear(), index),
                ).join("")}
            </div>
        `;
    } else if (v === "Semana") {
        const start = new Date(c);

        start.setDate(c.getDate() - ((c.getDay() + 6) % 7));

        body = `
            <div
                class="card"
                style="padding:0"
            >
                ${Array.from(
                    {
                        length: 7,
                    },
                    (_, index) => {
                        const date = new Date(start);

                        date.setDate(start.getDate() + index);

                        return dayRow(date);
                    },
                ).join("")}
            </div>
        `;
    } else {
        body = `
            <div
                class="card"
                style="padding:0"
            >
                ${dayRow(c)}
            </div>
        `;
    }

    const legend = [
        ["feriado", "Feriado"],
        ["recesso", "Recesso"],
        ["evento", "Evento escolar"],
        ["reuniao", "Reunião"],
        ["prova", "Prova"],
        ["escola", "Evento da escola"],
        ["letivo", "Dia letivo"],
    ]
        .map(
            ([type, label]) => `
                <span>

                    <i
                        class="dot"
                        style="--c:${corEvento(type)}"
                    ></i>

                    ${label}

                </span>
            `,
        )
        .join("");

    return `
        <div class="head">

            <h1>
                Calendário escolar
            </h1>

            <p class="sub">
                Passe o mouse sobre uma data marcada para ver o que acontece.
            </p>

        </div>

        <div class="bar">

            <div class="seg">
                ${tabs}
            </div>

            <div class="sp"></div>

            <button class="btn sm" type="button" data-calendar-shift="-1">
    Anterior
</button>

            
<select id="calendarMonth">
    ${months}
</select>

<select id="calendarYear">
    ${years}
</select>


            <button class="btn sm" type="button" data-calendar-shift="1">
    Próximo
</button>

        </div>

        ${body}

        <div class="legend">
            ${legend}
        </div>
    `;
}

// ============================================================
// CARDÁPIO
// ============================================================

function viewCardapio() {
    const todayDay = today.getDay();

    return `
        <div class="head">

            <h1>
                Cardápio da semana
            </h1>

            <p class="sub">
                Consulte a merenda prevista para cada dia.
            </p>

        </div>

        <div class="menu">

            ${[1, 2, 3, 4, 5]
                .map(
                    (day) => `
                        <div
                            class="day ${day === todayDay ? "hoje" : ""}"
                        >

                            <h2>

                                ${DIAS[day]}

                                ${
                                    day === todayDay
                                        ? `
                                        <span class="tag orange">
                                            Hoje
                                        </span>
                                        `
                                        : ""
                                }

                            </h2>

                            <ul>

                                ${CARD[day]
                                    .map(
                                        (item) =>
                                            `<li>${escapeHtml(item)}</li>`,
                                    )
                                    .join("")}

                            </ul>

                        </div>
                    `,
                )
                .join("")}

        </div>
    `;
}

// ============================================================
// CALENDÁRIO CONTROLES
// ============================================================

function setView(view) {
    cal.view = view;
    draw();
}

function pickCalendar() {
    const month = Number($("#calendarMonth").value);

    const year = Number($("#calendarYear").value);

    cal.cur = new Date(year, month, 1);

    draw();
}

function shiftCalendar(amount) {
    const c = cal.cur;

    if (cal.view === "Mês") {
        cal.cur = new Date(c.getFullYear(), c.getMonth() + amount, 1);
    } else if (cal.view === "Ano") {
        cal.cur = new Date(c.getFullYear() + amount, c.getMonth(), 1);
    } else if (cal.view === "Semana") {
        cal.cur = new Date(
            c.getFullYear(),
            c.getMonth(),
            c.getDate() + amount * 7,
        );
    } else {
        cal.cur = new Date(c.getFullYear(), c.getMonth(), c.getDate() + amount);
    }

    draw();
}

// ============================================================
// DESENHAR PAINEL
// ============================================================

function draw() {
    const nav = $("#nav");

    const content = $("#pageContent");

    if (!nav || !content) {
        return;
    }

    nav.innerHTML = MENU.map(
        ([id, label, iconName]) => `
                <button
                    type="button"
                    class="nav-item ${id === page ? "active" : ""}"
                    data-page="${id}"
                >
                    ${icon(iconName)}

                    <span>
                        ${label}
                    </span>
                </button>
            `,
    ).join("");

    const views = {
        inicio: viewInicio,

        reservas: viewReservas,

        emprestimos: viewEmprestimos,

        historico: viewHistorico,

        pesquisar: viewPesquisar,

        perfil: viewPerfil,

        calendario: viewCalendario,

        cardapio: viewCardapio,
    };

    if (!views[page]) {
        page = "inicio";
    }

    content.innerHTML = views[page]();

    if (page === "pesquisar") {
        conectarEventosPesquisa();
        pesquisarItens();
    }

    inicializarIcones();

    const main = document.querySelector(".main-content");

    if (main) {
        main.scrollTop = 0;
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth",
    });
}

// ============================================================
// CARREGAR ITENS REAIS
// ============================================================

async function carregarItensPesquisa() {
    try {
        const resposta = await fetch(`${API_URL}/aluno/itens`);

        const resultado = await resposta.json();

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(
                resultado.mensagem || "Não foi possível carregar os itens.",
            );
        }

        ITENS_PESQUISA = Array.isArray(resultado.itens) ? resultado.itens : [];

        console.log("Itens carregados da planilha:", ITENS_PESQUISA);

        return true;
    } catch (erro) {
        console.error("Erro ao carregar itens:", erro);

        ITENS_PESQUISA = [];

        showToast("Não foi possível carregar os itens do estoque.");

        return false;
    }
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

async function iniciarPainel() {
    try {
        configurarSidebar();

        const perfilCarregado = await carregarPerfilAluno();

        if (!perfilCarregado) return;

        await Promise.all([
            carregarItensPesquisa(),
            carregarReservas(),
            carregarEmprestimos(),
            carregarEmprestimosHistorico(),
        ]);

        atualizarUsuarioLateral();
        conectarEventosMenu();
        conectarEventosCalendario();
        draw();
        inicializarIcones();
    } catch (erro) {
        console.error("Erro ao carregar o painel:", erro);
    } finally {
        esconderCarregamento();
    }
}

function atualizarRelogioAluno() {
    const relogio = document.getElementById("relogioAluno");
    if (!relogio) return;

    const agora = new Date();

    relogio.textContent = [
        String(agora.getHours()).padStart(2, "0"),
        String(agora.getMinutes()).padStart(2, "0"),
        String(agora.getSeconds()).padStart(2, "0"),
    ].join(":");
}

atualizarRelogioAluno();
setInterval(atualizarRelogioAluno, 1000);

document.addEventListener("DOMContentLoaded", iniciarPainel);

function conectarEventosPesquisa() {
    $("#itemSearch")?.addEventListener("input", pesquisarItens);
    $("#itemType")?.addEventListener("change", pesquisarItens);
    $("#itemStatus")?.addEventListener("change", pesquisarItens);

    document
        .querySelector(".search-clear")
        ?.addEventListener("click", limparPesquisaItens);
}

function conectarEventosMenu() {
    const nav = $("#nav");

    if (!nav || nav.dataset.eventosConectados) return;

    nav.dataset.eventosConectados = "true";

    nav.addEventListener("click", (event) => {
        const botao = event.target.closest(".nav-item");

        if (!botao || !nav.contains(botao)) return;

        go(botao.dataset.page);
    });
}

function conectarEventosCalendario() {
    const content = document.querySelector("#pageContent");

    if (!content || content.dataset.calendarioConectado) return;

    content.dataset.calendarioConectado = "true";

    content.addEventListener("click", (event) => {
        const tab = event.target.closest("[data-calendar-view]");
        if (tab) {
            setView(tab.dataset.calendarView);
            return;
        }

        const shift = event.target.closest("[data-calendar-shift]");
        if (shift) {
            shiftCalendar(Number(shift.dataset.calendarShift));
            return;
        }

        const mini = event.target.closest("[data-calendar-month]");
        if (mini) {
            cal.view = "Mês";
            cal.cur = new Date(
                Number(mini.dataset.calendarYear),
                Number(mini.dataset.calendarMonth),
                1,
            );
            draw();
        }
    });

    content.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;

        const mini = event.target.closest("[data-calendar-month]");
        if (!mini) return;

        event.preventDefault();
        cal.view = "Mês";
        cal.cur = new Date(
            Number(mini.dataset.calendarYear),
            Number(mini.dataset.calendarMonth),
            1,
        );
        draw();
    });

    content.addEventListener("change", (event) => {
        if (event.target.matches("#calendarMonth, #calendarYear")) {
            pickCalendar();
        }
    });
}

configurarEventosFiltroHistorico();
