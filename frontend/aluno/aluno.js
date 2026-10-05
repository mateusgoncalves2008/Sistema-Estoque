const API_URL = "http://localhost:3000/api";

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

let reservas = [
    { tipo: "Livro", item: "Física", data: "06/10/2026" },
    { tipo: "Computador", item: "PC-014", data: "07/10/2026" },
];

const emprestimos = [
    {
        tipo: "Livro",
        item: "Matemática",
        retirada: "28/09/2026",
        devolucao: "12/10/2026",
    },
];

const movimentos = [
    ["Livro", "Matemática", "28/09/2026"],
    ["Computador", "PC-014", "25/09/2026"],
    ["Livro", "História", "20/09/2026"],
];

const CAT = {
    Livro: ["Matemática", "História", "Geografia", "Física", "Dom Casmurro"],
    Computador: ["PC-003", "PC-008", "PC-014", "PC-021"],
};

const CARD = {
    1: ["Arroz", "Feijão", "Frango", "Salada", "Fruta"],
    2: ["Macarrão", "Carne", "Salada", "Banana"],
    3: ["Arroz", "Feijão", "Peixe", "Legumes", "Laranja"],
    4: ["Arroz", "Feijão", "Carne moída", "Salada", "Melancia"],
    5: ["Arroz", "Feijão", "Frango assado", "Purê", "Maçã"],
};

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
    Exemplos de eventos.
    Depois vamos trocar isso pelos dados vindos da aba
    do calendário da planilha.
*/
const EV = {
    "2026-10-08": ["feriado", "Feriado"],
    "2026-10-12": ["feriado", "Nossa Senhora Aparecida"],
    "2026-10-15": ["evento", "Dia do Professor"],
    "2026-10-20": ["reuniao", "Reunião de pais"],
    "2026-10-24": ["escola", "Feira de Ciências"],
    "2026-10-28": ["recesso", "Dia do Servidor Público"],
    "2026-11-02": ["feriado", "Finados"],
    "2026-11-05": ["prova", "Prova de História"],
    "2026-11-20": ["feriado", "Consciência Negra"],
    "2026-12-18": ["escola", "Formatura do 3º Ano"],
    "2027-01-01": ["feriado", "Confraternização Universal"],
};

const MENU = [
    ["inicio", "Início", "house"],
    ["reservas", "Reservas", "bookmark"],
    ["emprestimos", "Empréstimos", "book-open"],
    ["historico", "Histórico", "history"],
    ["perfil", "Meu Perfil", "user-round"],
    ["calendario", "Calendário", "calendar-days"],
    ["cardapio", "Cardápio", "utensils"],
];

const today = new Date();

const cal = {
    view: "Mês",
    cur: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
};

let page = "inicio";

const $ = (selector) => document.querySelector(selector);

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
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
        lucide.createIcons();
    }
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

async function carregarPerfilAluno() {
    usuarioLogado = obterUsuarioLogado();

    if (!usuarioLogado) {
        window.location.href = "../login/index.html";
        return false;
    }

    if (
        String(usuarioLogado.tipoUsuario || "").toUpperCase() !== "ALUNO" &&
        String(usuarioLogado.perfil || "").toUpperCase() !== "ALUNO"
    ) {
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

        showToast("Perfil carregado com dados disponíveis no login.");

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

function fazerLogout() {
    sessionStorage.removeItem("usuarioLogado");
    window.location.href = "../login/index.html";
}

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

function viewInicio() {
    const primeiroNome = (ALUNO.nome || "Aluno").trim().split(/\s+/)[0];

    const w = hojeLetivo();

    const proximosEventos = Object.keys(EV)
        .map((data) => [new Date(`${data}T12:00:00`), EV[data]])
        .filter((item) => item[0] >= new Date(today.toDateString()))
        .sort((a, b) => a[0] - b[0]);

    const proximo = proximosEventos[0];

    return `
        <div class="hero">
            <div>
                <h1>Olá, ${escapeHtml(primeiroNome)}</h1>
                <p>
                    ${escapeHtml(ALUNO.ano || "Ano não informado")}
                    · Turma ${escapeHtml(ALUNO.turma || "Não informada")}
                    · ${escapeHtml(ALUNO.turno || "Turno não informado")}
                </p>
            </div>

            <div class="stats">
                <div class="stat">
                    <b>12</b>
                    <span>Livros lidos</span>
                </div>

                <div class="stat">
                    <b>8</b>
                    <span>Computadores</span>
                </div>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <div class="lab">
                    ${icon("bookmark")}
                    Minhas reservas
                </div>

                <div class="big">
                    ${reservas.length} ativa${reservas.length === 1 ? "" : "s"}
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
                    ${emprestimos.length} ativo${emprestimos.length === 1 ? "" : "s"}
                </div>

                <p>
                    ${
                        emprestimos.length
                            ? `Devolução prevista em ${escapeHtml(emprestimos[0].devolucao)}.`
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
                            ? `${proximo[0].getDate()} de ${MESES[proximo[0].getMonth()].toLowerCase()}`
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
    const day = today.getDay();
    return day;
}

function viewReservas() {
    const rows = reservas
        .map(
            (r) => `
                <tr>
                    <td>${escapeHtml(r.tipo)}</td>
                    <td><b>${escapeHtml(r.item)}</b></td>
                    <td>${escapeHtml(r.data)}</td>
                    <td><span class="tag">Ativa</span></td>
                </tr>
            `,
        )
        .join("");

    return `
        <div class="head">
            <h1>Minhas Reservas</h1>
            <p class="sub">
                Consulte suas reservas e reserve apenas os itens permitidos.
            </p>
        </div>

        <div class="two">
            <div class="card">
                <h2>Reservas ativas</h2>

                <div class="scroll">
                    <table>
                        <thead>
                            <tr>
                                <th>Tipo</th>
                                <th>Item</th>
                                <th>Data</th>
                                <th>Situação</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${
                                rows ||
                                `
                                <tr>
                                    <td colspan="4">
                                        Nenhuma reserva ativa.
                                    </td>
                                </tr>
                                `
                            }
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card">
                <h2>Nova reserva</h2>

                <div class="form">
                    <div>
                        <label for="reserveType">Tipo</label>

                        <select id="reserveType" onchange="fillReserveItems()">
                            <option value="Livro">Livro</option>
                            <option value="Computador">Computador</option>
                        </select>
                    </div>

                    <div>
                        <label for="reserveItem">Item</label>
                        <select id="reserveItem"></select>
                    </div>

                    <div>
                        <label for="reserveDate">Data</label>
                        <input id="reserveDate" type="date">
                    </div>

                    <button class="btn" type="button" onclick="reservar()">
                        Reservar
                    </button>
                </div>

                <div class="note">
                    ${icon("info")}
                    <span>
                        Alunos podem reservar somente livros da Biblioteca
                        e computadores do Laboratório de Informática.
                    </span>
                </div>
            </div>
        </div>
    `;
}

function fillReserveItems() {
    const type = $("#reserveType");
    const select = $("#reserveItem");

    if (!type || !select) return;

    select.innerHTML = (CAT[type.value] || [])
        .map((item) => `<option>${escapeHtml(item)}</option>`)
        .join("");
}

function reservar() {
    const type = $("#reserveType")?.value;
    const item = $("#reserveItem")?.value;
    const date = $("#reserveDate")?.value;

    if (!date) {
        showToast("Escolha a data da reserva.");
        return;
    }

    const [year, month, day] = date.split("-");

    reservas.push({
        tipo: type,
        item: item,
        data: `${day}/${month}/${year}`,
    });

    showToast("Reserva registrada.");

    draw();
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
                    <td><span class="tag">Em andamento</span></td>
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

function viewHistorico() {
    return `
        <div class="head">
            <h1>Histórico</h1>
            <p class="sub">
                Veja o resumo das suas atividades.
            </p>
        </div>

        <div class="grid">
            <div class="card">
                <div class="lab">
                    ${icon("book-open")}
                    Livros
                </div>

                <div class="big">
                    Você leu 12 livros
                </div>
            </div>

            <div class="card">
                <div class="lab">
                    ${icon("monitor")}
                    Computadores
                </div>

                <div class="big">
                    Você utilizou 8 computadores
                </div>
            </div>
        </div>

        <div class="card" style="margin-top:18px">
            <h2>Últimas movimentações</h2>

            <div style="margin-top:8px">
                ${movimentos
                    .map(
                        (m) => `
                            <div class="row">
                                <div class="d">
                                    ${escapeHtml(m[0])}
                                </div>

                                <div class="t">
                                    ${escapeHtml(m[1])}
                                </div>

                                <span class="tag">
                                    ${escapeHtml(m[2])}
                                </span>
                            </div>
                        `,
                    )
                    .join("")}
            </div>
        </div>
    `;
}

function viewPerfil() {
    const field = (label, value) => `
        <div class="field">
            <small>${escapeHtml(label)}</small>
            <b>${escapeHtml(value || "Não informado")}</b>
        </div>
    `;

    return `
        <div class="head">
            <h1>Meu Perfil</h1>
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
                <small>Senha</small>
                <b style="letter-spacing:.18em">
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
    if (tipo === "fimSemana") return "Fim de semana";

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
                class="c ${weekend ? "we" : ""} ${isToday ? "today" : ""} ${isSpecial ? "event-day" : ""}"
                ${isSpecial ? `title="${escapeHtml(tooltip)}"` : ""}
                aria-label="${escapeHtml(tooltip)}"
            >
                <b>${day}</b>

                ${
                    isSpecial
                        ? `
                            <div class="ev">
                                <i
                                    class="dot"
                                    style="--c:${corEvento(evento[0])}"
                                ></i>
                                <span>${escapeHtml(evento[1])}</span>
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
            onclick="cal.view='Mês';cal.cur=new Date(${year},${month},1);draw()"
        >
            <h2>${MESES[month]}</h2>

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
                        ? `class="e" style="--c:${corEvento(evento[0])}" title="${escapeHtml(tooltipEvento(evento))}"`
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
                ${DIAS[date.getDay()]}, ${date.getDate()}/${pad(date.getMonth() + 1)}
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
                    onclick="setView('${item}')"
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
            <div class="card" style="padding:0">
                ${Array.from({ length: 7 }, (_, index) => {
                    const date = new Date(start);
                    date.setDate(start.getDate() + index);
                    return dayRow(date);
                }).join("")}
            </div>
        `;
    } else {
        body = `
            <div class="card" style="padding:0">
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
            <h1>Calendário escolar</h1>
            <p class="sub">
                Passe o mouse sobre uma data marcada para ver o que acontece.
            </p>
        </div>

        <div class="bar">
            <div class="seg">
                ${tabs}
            </div>

            <div class="sp"></div>

            <button
                class="btn sm"
                type="button"
                onclick="shiftCalendar(-1)"
            >
                Anterior
            </button>

            <select id="calendarMonth" onchange="pickCalendar()">
                ${months}
            </select>

            <select id="calendarYear" onchange="pickCalendar()">
                ${years}
            </select>

            <button
                class="btn sm"
                type="button"
                onclick="shiftCalendar(1)"
            >
                Próximo
            </button>
        </div>

        ${body}

        <div class="legend">
            ${legend}
        </div>
    `;
}

function viewCardapio() {
    const todayDay = today.getDay();

    return `
        <div class="head">
            <h1>Cardápio da semana</h1>
            <p class="sub">
                Consulte a merenda prevista para cada dia.
            </p>
        </div>

        <div class="menu">
            ${[1, 2, 3, 4, 5]
                .map(
                    (day) => `
                        <div class="day ${day === todayDay ? "hoje" : ""}">
                            <h2>
                                ${DIAS[day]}

                                ${
                                    day === todayDay
                                        ? `<span class="tag orange">Hoje</span>`
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

function draw() {
    const nav = $("#nav");
    const content = $("#pageContent");

    if (!nav || !content) return;

    nav.innerHTML = MENU.map(
        ([id, label, iconName]) => `
                <button
                    type="button"
                    class="nav-item ${id === page ? "active" : ""}"
                    onclick="go('${id}')"
                >
                    ${icon(iconName)}
                    <span>${label}</span>
                </button>
            `,
    ).join("");

    const views = {
        inicio: viewInicio,
        reservas: viewReservas,
        emprestimos: viewEmprestimos,
        historico: viewHistorico,
        perfil: viewPerfil,
        calendario: viewCalendario,
        cardapio: viewCardapio,
    };

    content.innerHTML = views[page]();

    if (page === "reservas") {
        fillReserveItems();
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

async function iniciarPainel() {
    configurarSidebar();

    await carregarPerfilAluno();

    atualizarUsuarioLateral();

    draw();

    inicializarIcones();
}

document.addEventListener("DOMContentLoaded", iniciarPainel);
