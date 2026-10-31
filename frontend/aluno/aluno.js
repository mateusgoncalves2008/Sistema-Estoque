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
let ITENS_PESQUISA_FILTRADOS = [];
let PAGINA_ITENS_ALUNO = 1;
const ITENS_POR_PAGINA_ALUNO = 20;
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

// Eventos usados no cartão "Próximo evento", carregados da planilha escolar.
let eventosPlanilhaAluno = [];

function dataCalendarioAluno(valor) {
    const textoData = String(valor || "").trim();
    let ano, mes, dia;
    let match = textoData.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
        [, ano, mes, dia] = match;
    } else {
        match = textoData.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!match) return null;
        [, dia, mes, ano] = match;
    }

    const data = new Date(Number(ano), Number(mes) - 1, Number(dia));
    return Number.isNaN(data.getTime()) ? null : data;
}

async function carregarEventosPlanilhaAluno() {
    try {
        const resposta = await fetch(`${API_URL}/aluno/calendario`, {
            credentials: "same-origin",
        });
        if (!resposta.ok) throw new Error("Não foi possível consultar o calendário escolar.");

        const dados = await resposta.json();
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        eventosPlanilhaAluno = (dados.eventos || [])
            .filter((evento) => String(evento.status || "").trim().toUpperCase() === "ATIVO")
            .map((evento) => ({
                ...evento,
                dataConvertida: dataCalendarioAluno(evento.data),
                dataFimConvertida: dataCalendarioAluno(evento.dataFim || evento.data),
            }))
            .filter((evento) => evento.dataConvertida && evento.dataFimConvertida >= hoje)
            .sort((a, b) => a.dataConvertida - b.dataConvertida);
        return true;
    } catch (erro) {
        console.error("Erro ao carregar eventos do calendário escolar:", erro);
        eventosPlanilhaAluno = [];
        return false;
    }
}

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
    2: ["Sopa de macarrão com carne e legumes (cenoura e batata)"],
    3: ["Mexido"],
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

function atualizarTextoCarregamentoAluno() {
    const texto = document.getElementById("texto-carregamento-aluno");
    if (!texto) return;

    const nome = String(ALUNO.nome || usuarioLogado?.nome || "").trim();
    texto.textContent = nome && nome !== "Aluno" && nome !== "Não informado"
        ? `Carregando dados de ${nome} (usuário)...`
        : "Carregando dados do usuário...";
}

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
    atualizarTextoCarregamentoAluno();

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

        atualizarTextoCarregamentoAluno();
        atualizarUsuarioLateral();

        return true;
    } catch (erro) {
        console.error("Erro ao carregar perfil do aluno:", erro);

        ALUNO = {
            ...ALUNO,
            nome: usuarioLogado.nome || "Aluno",
            email: usuarioLogado.email || "Não informado",
        };

        atualizarTextoCarregamentoAluno();
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

    const toggle = $("#btnSidebarToggle");

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
    const button = $("#btnSidebarToggle");

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

function formatarAnoAluno(valor) {
    const texto = String(valor || "").trim();
    if (!texto || texto === "Não informado") return "Não informado";
    const numero = texto.match(/\d+/);
    return numero ? numero[0] + "° Ano" : texto;
}

function viewInicio() {
    const nomeCompleto = String(ALUNO.nome || usuarioLogado?.nome || "Aluno").trim();
    const anoAluno = formatarAnoAluno(ALUNO.ano);
    const turmaAluno = String(ALUNO.turma || "Não informado").trim();
    const turnoAluno = String(ALUNO.turno || "Não informado").trim();

    const w = hojeLetivo();

    const proximo = eventosPlanilhaAluno[0] || null;

    // O cartão deve contar apenas reservas pendentes, como a lista "Minhas reservas".
    const reservasAtivas = reservas.filter(
        (reserva) => String(reserva.status || "").trim().toUpperCase() === "PENDENTE",
    );

    // Conta somente reservas concluídas, conforme o Status da aba 08_RESERVAS.
    const reservasConcluidas = reservas.filter(
        (reserva) =>
            String(reserva.status || "").trim().toUpperCase() === "CONCLUIDO",
    );

    const livrosLidos = reservasConcluidas.filter((reserva) => {
        const tipo = String(
            reserva.categoriaNome ||
            reserva.nomeCategoria ||
            reserva.subcategoriaNome ||
            reserva.tipo ||
            reserva.itemTipo ||
            "",
        ).toLowerCase();

        return tipo.includes("livro") || tipo.includes("biblioteca");
    }).length;

    const computadoresUsados = reservasConcluidas.filter((reserva) => {
        const tipo = String(
            reserva.categoriaNome ||
            reserva.nomeCategoria ||
            reserva.subcategoriaNome ||
            reserva.tipo ||
            reserva.itemTipo ||
            "",
        ).toLowerCase();

        return tipo.includes("computador") || tipo.includes("informática");
    }).length;

    return `
        
<div class="hero">
    <img class="hero-photo" src="../img/fundo-login.png" alt="" />
    <div class="hero-shade"></div>

    <div class="hero-content">
        <small>PAINEL DO ALUNO</small>
        <h2>Olá, ${escapeHtml(nomeCompleto)}.</h2>
        <p class="hero-student-info">
            ${escapeHtml(anoAluno)} <span>•</span>
            Turma ${escapeHtml(turmaAluno)} <span>•</span>
            ${escapeHtml(turnoAluno)}
        </p>
    </div>

    <div class="hero-clock">
        <strong id="clockTime">--:--:--</strong>
        <small id="clockDate">Carregando data...</small>
    </div>
</div>


        <div class="grid">

            <div class="card dashboard-card" role="button" tabindex="0" data-dashboard-page="reservas" aria-label="Abrir Minhas reservas">
                <div class="lab">
                    ${icon("bookmark")}
                    Minhas reservas
                </div>

                <div class="big">
                    ${reservasAtivas.length}
                    ${reservasAtivas.length === 1 ? "ativa" : "ativas"}
                </div>

                <p>
                    Livros e computadores reservados.
                </p>
            </div>

            <div class="card dashboard-card" role="button" tabindex="0" data-dashboard-page="emprestimos" aria-label="Abrir Meus empréstimos">
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

            <div class="card dashboard-card" role="button" tabindex="0" data-dashboard-page="calendario" aria-label="Abrir Calendário escolar">
                <div class="lab">
                    ${icon("calendar-days")}
                    Próximo evento
                </div>

                <div class="big">
                    ${proximo ? escapeHtml(proximo.titulo || "Evento escolar") : "Sem eventos"}
                </div>

                <p>
                    ${
                        proximo
                            ? `${proximo.dataConvertida.getDate()} de ${MESES[
                                  proximo.dataConvertida.getMonth()
                              ].toLowerCase()}`
                            : "Nenhum evento futuro cadastrado na planilha."
                    }
                </p>
            </div>

            <div class="card dashboard-card" role="button" tabindex="0" data-dashboard-page="cardapio" aria-label="Abrir Cardápio da semana">
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

        // Preserva os dados anteriores caso a atualização falhe temporariamente.
        if (!atualizacaoAlunoEmAndamento) {
            showToast("Não foi possível carregar suas reservas.");
        }

        return false;
    }
}

async function carregarEmprestimos() {
    const usuarioID = usuarioLogado?.id;

    if (!usuarioID) {
        return false;
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
        return true;
    } catch (erro) {
        console.error("Erro ao carregar empréstimos:", erro);
        // Preserva os empréstimos já carregados se a API falhar temporariamente.
        return false;
    }
}

async function carregarEmprestimosHistorico() {
    const usuarioID = usuarioLogado?.id;

    if (!usuarioID) {
        return false;
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
        return true;
    } catch (erro) {
        console.error("Erro ao carregar histórico:", erro);
        // Preserva o histórico já carregado se a API falhar temporariamente.
        return false;
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
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    if (["PENDENTE", "AGUARDANDO"].includes(valor)) {
        return "pending";
    }

    if (
        ["APROVADA", "APROVADO", "CONFIRMADA", "CONFIRMADO", "ABERTO", "EM ANDAMENTO"].includes(valor)
    ) {
        return "approved";
    }

    if (["ATRASADO", "VENCIDO"].includes(valor)) {
        return "overdue";
    }

    if (["RECUSADA", "RECUSADO", "REJEITADA", "REJEITADO"].includes(valor)) {
        return "rejected";
    }

    if (["CANCELADA", "CANCELADO"].includes(valor)) {
        return "cancelled";
    }

    if (
        [
            "CONCLUIDO", "CONCLUIDA", "FINALIZADO", "FINALIZADA",
            "DEVOLVIDO", "DEVOLVIDA", "ENCERRADO", "ENCERRADA",
        ].includes(valor)
    ) {
        return "finished";
    }

    return "other";
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

function dataFinalReserva(valor) {
    const texto = String(valor || "").trim();
    if (!texto) return null;
    let match = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (match) {
        const [, ano, mes, dia, hora = "23", minuto = "59"] = match;
        const data = new Date(Number(ano), Number(mes) - 1, Number(dia), Number(hora), Number(minuto));
        return Number.isNaN(data.getTime()) ? null : data;
    }
    match = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (match) {
        const [, dia, mes, ano, hora = "23", minuto = "59"] = match;
        const data = new Date(Number(ano), Number(mes) - 1, Number(dia), Number(hora), Number(minuto));
        return Number.isNaN(data.getTime()) ? null : data;
    }
    return null;
}

function situacaoReservaAluno(reserva) {
    const status = String(reserva.status || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const dataFinal = dataFinalReserva(reserva.dataFim || reserva.dataInicio);
    if (["PENDENTE", "AGUARDANDO"].includes(status) && dataFinal && dataFinal < new Date()) {
        return { texto: "Expirada", classe: "overdue" };
    }
    return { texto: textoStatusReserva(reserva.status), classe: classeStatusReserva(reserva.status) };
}
function viewReservas() {
    const reservasPendentes = reservas.filter(
        (reserva) => String(reserva.status || "").trim().toUpperCase() === "PENDENTE",
    );
    const rows = reservasPendentes
        .map((r) => {
            const situacao = situacaoReservaAluno(r);
            return `
                <tr>
                    <td>
                        ${escapeHtml(r.categoriaNome || r.nomeCategoria || r.tipo || "Item")}
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
                        <span class="tag ${situacao.classe}">
                            ${escapeHtml(situacao.texto)}
                        </span>
                    </td>
                </tr>
            `;
        })
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

    if (motivo) {
        motivo.value = "";
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

function dataPrevistaEmprestimo(valor) {
    const texto = String(valor || "").trim();
    if (!texto) return null;

    let match = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) {
        const [, dia, mes, ano] = match;
        const data = new Date(Number(ano), Number(mes) - 1, Number(dia));
        return Number.isNaN(data.getTime()) ? null : data;
    }

    match = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (match) {
        const [, ano, mes, dia] = match;
        const data = new Date(Number(ano), Number(mes) - 1, Number(dia));
        return Number.isNaN(data.getTime()) ? null : data;
    }

    return null;
}

function situacaoEmprestimoAluno(emprestimo) {
    const status = String(emprestimo.status || "").trim().toUpperCase();

    if (["ATRASADO", "ATRASO", "VENCIDO"].includes(status)) {
        return { texto: "ATRASO", classe: "overdue" };
    }

    const dataPrevista = dataPrevistaEmprestimo(emprestimo.devolucao);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    if (dataPrevista) {
        dataPrevista.setHours(0, 0, 0, 0);

        if (dataPrevista < hoje) {
            return { texto: "ATRASO", classe: "overdue" };
        }
    }

    return { texto: "Em andamento", classe: "approved" };
}

function viewEmprestimos() {
    const rows = emprestimos
        .map((r) => {
            const situacao = situacaoEmprestimoAluno(r);

            return `
                <tr>
                    <td>${escapeHtml(r.tipo)}</td>

                    <td>
                        <b>${escapeHtml(r.item)}</b>
                    </td>

                    <td>${escapeHtml(r.retirada)}</td>

                    <td>${escapeHtml(r.devolucao)}</td>

                    <td>
                        <span class="tag ${situacao.classe}">
                            ${escapeHtml(situacao.texto)}
                        </span>
                    </td>
                </tr>
            `;
        })
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

    const totalPaginasHistorico = Math.ceil(registrosFiltrados.length / 20);
    paginaHistoricoAluno = Math.min(Math.max(paginaHistoricoAluno, 1), Math.max(totalPaginasHistorico, 1));
    const inicioHistorico = (paginaHistoricoAluno - 1) * 20;
    const cards = registrosFiltrados
        .slice(inicioHistorico, inicioHistorico + 20)
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
        ${renderizarPaginacaoHistoricoAluno(totalPaginasHistorico)}
    `;
}

function renderizarPaginacaoHistoricoAluno(total) {
    if (total <= 1) return "";
    const botoes = [];
    const primeira = Math.floor((paginaHistoricoAluno - 1) / 10) * 10 + 1;
    const ultima = Math.min(primeira + 9, total);
    if (paginaHistoricoAluno > 1) botoes.push(`<button type="button" data-pagina-historico="${paginaHistoricoAluno - 1}">Anterior</button>`);
    for (let n = primeira; n <= ultima; n++) botoes.push(`<button type="button" data-pagina-historico="${n}" class="${n === paginaHistoricoAluno ? "ativa" : ""}" ${n === paginaHistoricoAluno ? 'aria-current="page"' : ""}>${n}</button>`);
    if (paginaHistoricoAluno < total) botoes.push(`<button type="button" data-pagina-historico="${paginaHistoricoAluno + 1}">Seguinte ›</button>`);
    return `<div class="historico-paginacao">${botoes.join("")}</div>`;
}

function configurarEventosFiltroHistorico() {
    const pagina = document.getElementById("pageContent");

    if (!pagina || pagina.dataset.filtroHistoricoConfigurado === "sim") {
        return;
    }

    pagina.dataset.filtroHistoricoConfigurado = "sim";

    pagina.addEventListener("click", (evento) => {
        const botao = evento.target.closest(
            "[data-filtro-tipo], [data-filtro-categoria], [data-pagina-historico]",
        );

        if (!botao || !pagina.contains(botao)) return;

        if (botao.dataset.paginaHistorico) {
            paginaHistoricoAluno = Number(botao.dataset.paginaHistorico);
            pagina.innerHTML = viewHistorico();
            if (typeof inicializarIcones === "function") inicializarIcones();
            const main = document.querySelector(".main-content");
            if (main) main.scrollTo({ top: 0, behavior: "smooth" });
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }

        if (botao.dataset.filtroTipo) {
            paginaHistoricoAluno = 1;
            filtroHistoricoTipo = botao.dataset.filtroTipo;
        }

        if (botao.dataset.filtroCategoria) {
            paginaHistoricoAluno = 1;
            filtroHistoricoCategoria = botao.dataset.filtroCategoria;
        }

        pagina.innerHTML = viewHistorico();
    });
}

let paginaHistoricoAluno = 1;
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
    if (!input || !tipo || !status || !resultados) return;

    const termo = input.value.trim().toLowerCase();
    const tipoSelecionado = tipo.value;
    const statusSelecionado = status.value;

    ITENS_PESQUISA_FILTRADOS = ITENS_PESQUISA.filter((item) => {
        const textoBusca = [
            item.nome, item.codigo, item.tipo, item.local, item.detalhe,
            item.autor, item.categoria, item.subcategoria,
        ].join(" ").toLowerCase();
        return (!termo || textoBusca.includes(termo)) &&
            (!tipoSelecionado || item.tipo === tipoSelecionado) &&
            (!statusSelecionado || item.situacaoTexto === statusSelecionado);
    });

    if (quantidade) {
        quantidade.textContent = `${ITENS_PESQUISA_FILTRADOS.length} ${ITENS_PESQUISA_FILTRADOS.length === 1 ? "item encontrado" : "itens encontrados"}`;
    }

    PAGINA_ITENS_ALUNO = 1;
    renderizarPesquisaAluno();

    if (resultados.dataset.eventosConfigurados !== "sim") {
        resultados.dataset.eventosConfigurados = "sim";
        resultados.addEventListener("click", (event) => {
            const card = event.target.closest("[data-produto-id]");
            if (card && resultados.contains(card)) abrirReserva(card.dataset.produtoId);
        });
        resultados.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            const card = event.target.closest("[data-produto-id]");
            if (card && resultados.contains(card)) {
                event.preventDefault();
                abrirReserva(card.dataset.produtoId);
            }
        });
    }

    const paginacao = document.getElementById("itemPagination");
    if (paginacao && paginacao.dataset.eventosConfigurados !== "sim") {
        paginacao.dataset.eventosConfigurados = "sim";
        paginacao.addEventListener("click", (event) => {
            const botao = event.target.closest("[data-pagina-item]");
            if (!botao) return;
            PAGINA_ITENS_ALUNO = Number(botao.dataset.paginaItem);
            renderizarPesquisaAluno();
            const main = document.querySelector(".main-content");
            if (main) main.scrollTo({ top: 0, behavior: "smooth" });
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }
    inicializarIcones();
}

function renderizarPesquisaAluno() {
    const resultados = $("#itemResults");
    if (!resultados) return;
    const totalPaginas = Math.ceil(ITENS_PESQUISA_FILTRADOS.length / ITENS_POR_PAGINA_ALUNO);
    PAGINA_ITENS_ALUNO = Math.min(Math.max(PAGINA_ITENS_ALUNO, 1), Math.max(totalPaginas, 1));
    const inicio = (PAGINA_ITENS_ALUNO - 1) * ITENS_POR_PAGINA_ALUNO;
    const itensDaPagina = ITENS_PESQUISA_FILTRADOS.slice(inicio, inicio + ITENS_POR_PAGINA_ALUNO);

    resultados.innerHTML = itensDaPagina.length
        ? itensDaPagina.map((item) => `
            <article class="item-result-card ${item.podeReservar ? "reservable" : ""}"
                ${item.podeReservar ? `data-produto-id="${escapeHtml(item.produtoID)}" role="button" tabindex="0" title="Clique para reservar"` : ""}>
                <div class="item-result-icon">
                    ${icon(item.tipo === "Livro" ? "book-open" : "monitor")}
                </div>
                <div class="item-result-main">
                    <div class="item-result-top">
                        <div>
                            <span class="item-type">${escapeHtml(item.tipo)}</span>
                            <h3>${escapeHtml(item.nome)}</h3>
                        </div>
                        <span class="item-status ${statusClasse(item.situacaoTexto)}">${escapeHtml(item.situacaoTexto)}</span>
                    </div>
                    <p>${escapeHtml(item.detalhe || "Sem informações adicionais.")}</p>
                    <div class="item-result-meta">
                        <span>${icon("hash")} ${escapeHtml(item.codigo || item.produtoID || "Sem código")}</span>
                        <span>${icon("map-pin")} ${escapeHtml(item.local || "Não informado")}</span>
                        <span>${icon("package")} ${escapeHtml(String(item.disponivel ?? 0))} disponível</span>
                    </div>
                </div>
            </article>
        `).join("")
        : `<div class="search-empty">${icon("search-x")}<strong>Nenhum item encontrado</strong><p>Não existem itens com essa situação.</p></div>`;

    renderizarPaginacaoAluno(totalPaginas);
    inicializarIcones();
}

function renderizarPaginacaoAluno(totalPaginas) {
    const paginacao = document.getElementById("itemPagination");
    if (!paginacao) return;
    if (totalPaginas <= 1) {
        paginacao.innerHTML = "";
        paginacao.hidden = true;
        return;
    }
    paginacao.hidden = false;
    const inicioJanela = Math.floor((PAGINA_ITENS_ALUNO - 1) / 10) * 10 + 1;
    const fimJanela = Math.min(inicioJanela + 9, totalPaginas);
    let botoes = "";
    if (PAGINA_ITENS_ALUNO > 1) {
        botoes += `<button type="button" class="pagina-seta" data-pagina-item="${PAGINA_ITENS_ALUNO - 1}">Anterior</button>`;
    }
    for (let pagina = inicioJanela; pagina <= fimJanela; pagina++) {
        botoes += `<button type="button" class="pagina-numero ${pagina === PAGINA_ITENS_ALUNO ? "ativa" : ""}" data-pagina-item="${pagina}" ${pagina === PAGINA_ITENS_ALUNO ? 'aria-current="page"' : ""}>${pagina}</button>`;
    }
    if (PAGINA_ITENS_ALUNO < totalPaginas) {
        botoes += `<button type="button" class="pagina-seta" data-pagina-item="${PAGINA_ITENS_ALUNO + 1}">Seguinte <span aria-hidden="true">›</span></button>`;
    }
    paginacao.innerHTML = botoes;
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

        <div id="itemPagination" class="pesquisa-paginacao" aria-label="Paginação dos itens" hidden></div>

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
    const dataDia = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const evento = eventosPlanilhaAluno.find((item) => {
        const inicio = item.dataConvertida;
        const fim = item.dataFimConvertida || inicio;
        if (!inicio || !fim) return false;

        const dataInicio = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
        const dataFim = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
        return dataDia >= dataInicio && dataDia <= dataFim;
    });

    if (evento) {
        const tipoOriginal = String(evento.tipo || "evento")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
        const tiposValidos = Object.keys(TIPOS);
        const tipo = tiposValidos.includes(tipoOriginal) ? tipoOriginal : "evento";
        const titulo = String(evento.titulo || evento.nome || evento.descricao || nomeTipoEvento(tipo));
        return [tipo, titulo];
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

    if (page !== "inicio") {
        const tituloTela = content.querySelector(".head");
        const areaBotao = tituloTela || content.firstElementChild;

        if (areaBotao) {
            areaBotao.insertAdjacentHTML("beforebegin",
                '<div class="page-home-return"><button type="button" class="btn-home-return" data-return-home aria-label="Voltar ao início">' +
                icon("arrow-left") + '<span>Voltar ao início</span></button></div>'
            );
        }
    }

    // Preenche o relógio imediatamente após redesenhar a tela inicial.
    // Isso evita que o horário volte a 00:00:00 durante a atualização automática.
    if (page === "inicio") {
        atualizarRelogioAluno();
    }

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

        // Preserva os itens anteriores se a API falhar temporariamente.
        if (!atualizacaoAlunoEmAndamento) {
            showToast("Não foi possível carregar os itens do estoque.");
        }

        return false;
    }
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

// ============================================================
// ATUALIZACAO AUTOMATICA DO PAINEL
// ============================================================

let atualizacaoAlunoEmAndamento = false;
let intervaloAtualizacaoAluno = null;

async function atualizarDadosAutomaticamenteAluno() {
    const modalAberto = document.querySelector(
        '[role="dialog"]:not([hidden]), .modal.show, .modal.aberto'
    );
    const campoEmEdicao = document.activeElement?.matches("input, textarea, select");

    if (
        atualizacaoAlunoEmAndamento ||
        document.visibilityState !== "visible" ||
        !usuarioLogado?.id ||
        modalAberto ||
        campoEmEdicao
    ) {
        return;
    }

    atualizacaoAlunoEmAndamento = true;

    try {
        const resultados = await Promise.all([
            carregarAvisosAluno(),
            carregarItensPesquisa(),
            carregarReservas(),
            carregarEmprestimos(),
            carregarEmprestimosHistorico(),
            carregarEventosPlanilhaAluno(),
        ]);

        const atualizacaoCompleta = resultados.every((resultado) => resultado === true);

        if (atualizacaoCompleta) {
            const agora = new Date();
            const horario = [agora.getHours(), agora.getMinutes(), agora.getSeconds()]
                .map((parte) => String(parte).padStart(2, "0"))
                .join(":");
            console.info(`[ATUALIZAÇÃO AUTOMÁTICA] Painel atualizado às ${horario}`);
        }

        // Evita redesenhar telas com formularios ou controles em uso.
        // Na tela inicial, atualiza os contadores diretamente para evitar
        // redesenhar o hero e causar um breve piscar na imagem de fundo.
        if (page === "inicio") {
            atualizarContadoresInicioAluno();
        }

        const paginaPodeAtualizar =
            page === "reservas" ||
            page === "emprestimos" ||
            page === "historico";

        if (paginaPodeAtualizar) {
            const main = document.querySelector(".main-content");
            const scrollMainAnterior = main?.scrollTop ?? 0;
            const scrollPaginaAnterior = window.scrollY;

            draw();

            const mainAtualizado = document.querySelector(".main-content");
            if (mainAtualizado) mainAtualizado.scrollTop = scrollMainAnterior;
            window.scrollTo({ top: scrollPaginaAnterior, behavior: "instant" });
        }
    } catch (erro) {
        console.error("Erro na atualizacao automatica do painel Aluno:", erro);
    } finally {
        atualizacaoAlunoEmAndamento = false;
    }
}

function iniciarAtualizacaoAutomaticaAluno() {
    if (intervaloAtualizacaoAluno !== null) return;

    intervaloAtualizacaoAluno = window.setInterval(
        atualizarDadosAutomaticamenteAluno,
        60000,
    );
}

async function iniciarPainel() {
    let painelPronto = false;

    try {
        configurarSidebar();
        criarBotaoAvisos();

        const perfilCarregado = await carregarPerfilAluno();

        if (!perfilCarregado) return;

        const resultados = await Promise.all([
            carregarAvisosAluno(),
            carregarItensPesquisa(),
            carregarReservas(),
            carregarEmprestimos(),
            carregarEmprestimosHistorico(),
            carregarEventosPlanilhaAluno(),
        ]);

        if (!resultados.every((resultado) => resultado === true)) {
            throw new Error("Uma ou mais consultas necessárias não foram carregadas.");
        }

        atualizarUsuarioLateral();
        conectarEventosMenu();
        conectarEventosCalendario();
        draw();
        inicializarIcones();
        iniciarAtualizacaoAutomaticaAluno();
        painelPronto = true;
    } catch (erro) {
        console.error("Erro ao carregar o painel:", erro);
    } finally {
        if (painelPronto) {
            esconderCarregamento();
        }
    }
}

function atualizarContadoresInicioAluno() {
    const reservasConcluidas = reservas.filter(
        (reserva) =>
            String(reserva.status || "").trim().toUpperCase() === "CONCLUIDO",
    );

    const livrosLidos = reservasConcluidas.filter((reserva) => {
        const tipo = String(
            reserva.categoriaNome ||
                reserva.nomeCategoria ||
                reserva.subcategoriaNome ||
                reserva.tipo ||
                reserva.itemTipo ||
                "",
        ).toLowerCase();

        return tipo.includes("livro") || tipo.includes("biblioteca");
    }).length;

    const computadoresUsados = reservasConcluidas.filter((reserva) => {
        const tipo = String(
            reserva.categoriaNome ||
                reserva.nomeCategoria ||
                reserva.subcategoriaNome ||
                reserva.tipo ||
                reserva.itemTipo ||
                "",
        ).toLowerCase();

        return tipo.includes("computador") || tipo.includes("informática");
    }).length;

    const livrosEl = document.getElementById("livrosLidosAluno");
    const computadoresEl = document.getElementById("computadoresUsadosAluno");

    if (livrosEl) livrosEl.textContent = livrosLidos;
    if (computadoresEl) computadoresEl.textContent = computadoresUsados;
}

function atualizarRelogioAluno() {
    const agora = new Date();
    const relogio = document.getElementById("clockTime");
    const data = document.getElementById("clockDate");

    if (relogio) {
        relogio.textContent = agora.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    }

    if (data) {
        data.textContent = agora.toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
        });
    }
}

atualizarRelogioAluno();
setInterval(atualizarRelogioAluno, 1000);


/* ============================================================
   CENTRAL DE AVISOS DO ALUNO
   O estado de leitura fica salvo neste navegador por usuário.
============================================================ */

let avisosAluno = [];
let centralAvisosAberta = false;

function chaveAvisosLidos() {
    const usuarioID = usuarioLogado?.id || "aluno";
    return `avisosLidos_${usuarioID}`;
}

function obterAvisosLidos() {
    try {
        const dados = JSON.parse(localStorage.getItem(chaveAvisosLidos()) || "[]");
        return Array.isArray(dados) ? dados : [];
    } catch (erro) {
        console.error("Erro ao ler avisos já visualizados:", erro);
        return [];
    }
}

function salvarAvisosLidos(ids) {
    try {
        localStorage.setItem(chaveAvisosLidos(), JSON.stringify(ids));
    } catch (erro) {
        console.error("Não foi possível salvar a leitura dos avisos:", erro);
    }
}

async function carregarAvisosAluno() {
    try {
        const [respostaAvisos, respostaLeituras] = await Promise.all([
            fetch(`${API_URL}/avisos`, { credentials: "same-origin" }),
            fetch(`${API_URL}/avisos/leituras`, { credentials: "same-origin" }),
        ]);
        const resultadoAvisos = await respostaAvisos.json();
        const resultadoLeituras = await respostaLeituras.json();

        if (!respostaAvisos.ok || !resultadoAvisos.sucesso) {
            throw new Error(resultadoAvisos.erro || "Não foi possível carregar os avisos.");
        }
        if (!respostaLeituras.ok || !resultadoLeituras.sucesso) {
            throw new Error(resultadoLeituras.erro || "Não foi possível carregar as leituras.");
        }

        avisosAluno = Array.isArray(resultadoAvisos.avisos) ? resultadoAvisos.avisos : [];
        salvarAvisosLidos(Array.isArray(resultadoLeituras.avisosLidos) ? resultadoLeituras.avisosLidos : []);
        renderizarCentralAvisos();
        atualizarContadorAvisos();
        return true;
    } catch (erro) {
        console.error("Erro ao carregar avisos e leituras:", erro);
        atualizarContadorAvisos();
        return false;
    }
}

async function registrarAvisoComoLido(avisoID) {
    const resposta = await fetch(`${API_URL}/avisos/leituras`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avisoID }),
    });
    const resultado = await resposta.json();
    if (!resposta.ok || !resultado.sucesso) {
        throw new Error(resultado.erro || "Não foi possível registrar a leitura.");
    }

    const ids = obterAvisosLidos();
    if (!ids.includes(avisoID)) ids.push(avisoID);
    salvarAvisosLidos(ids);
}

function atualizarContadorAvisos() {
    const botao = document.getElementById("botaoAvisosAluno");
    const contador = document.getElementById("contadorAvisosAluno");
    if (!botao || !contador) return;

    const lidos = obterAvisosLidos();
    const naoLidos = avisosAluno.filter((aviso) => !lidos.includes(aviso.id)).length;

    contador.textContent = naoLidos > 99 ? "99+" : String(naoLidos);
    contador.hidden = naoLidos === 0;
    botao.setAttribute(
        "aria-label",
        naoLidos ? `Avisos. ${naoLidos} não lidos` : "Avisos",
    );
}

function criarBotaoAvisos() {
    if (document.getElementById("botaoAvisosAluno")) return;

    const botao = document.createElement("button");
    botao.type = "button";
    botao.id = "botaoAvisosAluno";
    botao.className = "botao-avisos-aluno";
    botao.setAttribute("aria-label", "Avisos");
    botao.title = "Avisos da escola";
    botao.innerHTML = '<i data-lucide="bell"></i><span id="contadorAvisosAluno" class="contador-avisos-aluno" hidden>0</span>';

    const central = document.createElement("section");
    central.id = "centralAvisosAluno";
    central.className = "central-avisos-aluno";
    central.hidden = true;
    central.setAttribute("aria-label", "Central de avisos");
    central.innerHTML = `
        <div class="cabecalho-avisos-aluno">
            <div><h2>Avisos da escola</h2><p>Comunicados destinados aos alunos</p></div>
            <button type="button" id="fecharAvisosAluno" class="fechar-avisos-aluno" aria-label="Fechar avisos">×</button>
        </div>
        <div class="acoes-avisos-aluno"><button type="button" id="marcarAvisosLidosAluno">Marcar todos como lidos</button></div>
        <div id="listaAvisosAluno" class="lista-avisos-aluno"><p class="avisos-vazio-aluno">Carregando avisos...</p></div>
    `;

    document.body.append(botao, central);
    botao.addEventListener("click", alternarCentralAvisos);
    central.querySelector("#fecharAvisosAluno").addEventListener("click", fecharCentralAvisos);
    central.querySelector("#marcarAvisosLidosAluno").addEventListener("click", marcarAvisosComoLidos);
    inicializarIcones();
    atualizarContadorAvisos();
}

function alternarCentralAvisos() {
    centralAvisosAberta = !centralAvisosAberta;
    const central = document.getElementById("centralAvisosAluno");
    if (!central) return;
    central.hidden = !centralAvisosAberta;
    if (centralAvisosAberta) renderizarCentralAvisos();
}

function fecharCentralAvisos() {
    centralAvisosAberta = false;
    const central = document.getElementById("centralAvisosAluno");
    if (central) central.hidden = true;
}

async function marcarAvisosComoLidos() {
    try {
        await Promise.all(avisosAluno.map((aviso) => registrarAvisoComoLido(aviso.id)));
        atualizarContadorAvisos();
        renderizarCentralAvisos();
    } catch (erro) {
        console.error("Erro ao marcar avisos como lidos:", erro);
        showToast("Não foi possível salvar a leitura dos avisos.");
    }
}

function renderizarCentralAvisos() {
    const lista = document.getElementById("listaAvisosAluno");
    if (!lista) return;

    if (!avisosAluno.length) {
        lista.innerHTML = '<p class="avisos-vazio-aluno">Nenhum aviso publicado para os alunos.</p>';
        return;
    }

    const lidos = obterAvisosLidos();
    lista.innerHTML = avisosAluno.map((aviso) => {
        const lido = lidos.includes(aviso.id);
        const prioridade = String(aviso.prioridade || "NORMAL").toUpperCase();
        const data = aviso.dataPublicacao ? new Date(aviso.dataPublicacao) : null;
        const dataTexto = data && !Number.isNaN(data.getTime())
            ? data.toLocaleString("pt-BR")
            : "";
        return `
            <article class="aviso-aluno ${lido ? "aviso-lido-aluno" : "aviso-nao-lido-aluno"}">
                <div class="aviso-aluno-topo">
                    <strong>${escapeHtml(aviso.titulo || "Aviso")}</strong>
                    <span class="prioridade-aviso-aluno ${prioridade === "URGENTE" ? "urgente" : ""}">${escapeHtml(prioridade)}</span>
                </div>
                <p>${escapeHtml(aviso.mensagem || "")}</p>
                <div class="aviso-aluno-rodape"><small>${escapeHtml(dataTexto)}</small>
                ${lido ? '<span class="estado-aviso-aluno">Lido</span>' : `<button type="button" data-aviso-lido="${escapeHtml(aviso.id)}">Marcar como lido</button>`}</div>
            </article>
        `;
    }).join("");

    lista.querySelectorAll("[data-aviso-lido]").forEach((botao) => {
        botao.addEventListener("click", async () => {
            try {
                await registrarAvisoComoLido(botao.dataset.avisoLido);
                atualizarContadorAvisos();
                renderizarCentralAvisos();
            } catch (erro) {
                console.error("Erro ao marcar aviso como lido:", erro);
                showToast("Não foi possível salvar a leitura do aviso.");
            }
        });
    });
}


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

    const content = $("#pageContent");
    if (content && !content.dataset.cardsInicioConectados) {
        content.dataset.cardsInicioConectados = "true";

        const abrirCard = (event) => {
            const voltar = event.target.closest("[data-return-home]");
            if (voltar && content.contains(voltar)) {
                go("inicio");
                return;
            }

            const card = event.target.closest("[data-dashboard-page]");
            if (!card || !content.contains(card)) return;

            if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
            if (event.type === "keydown") event.preventDefault();

            go(card.dataset.dashboardPage);
        };

        content.addEventListener("click", abrirCard);
        content.addEventListener("keydown", abrirCard);
    }
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
