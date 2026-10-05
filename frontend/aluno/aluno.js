javascript;
const API_URL = "http://localhost:3000/api";

/* =========================================================
   USUÁRIO LOGADO
========================================================= */

let usuarioLogado = null;

try {
    usuarioLogado = JSON.parse(sessionStorage.getItem("usuarioLogado"));
} catch (erro) {
    console.error("Erro ao ler usuário:", erro);
}

if (!usuarioLogado) {
    window.location.href = "../login/index.html";
}

/* =========================================================
   PROTEÇÃO DO PAINEL
========================================================= */

if (
    usuarioLogado &&
    String(usuarioLogado.tipoUsuario || "").toUpperCase() !== "ALUNO"
) {
    alert("Acesso não autorizado.");
    window.location.href = "../login/index.html";
}

/* =========================================================
   ELEMENTOS
========================================================= */

const nav = document.getElementById("nav");
const view = document.getElementById("v");

const sidebar = document.getElementById("sidebar");
const toggleSidebar = document.getElementById("toggleSidebar");
const mobileMenu = document.getElementById("mobileMenu");
const sidebarOverlay = document.getElementById("sidebarOverlay");

const logoutButton = document.getElementById("logoutButton");

const sidebarNome = document.getElementById("sidebarNome");
const avatarInicial = document.getElementById("avatarInicial");

/* =========================================================
   ÍCONES
========================================================= */

const IC = {
    inicio: "⌂",

    reservas: "▣",

    emprestimos: "▤",

    historico: "▥",

    perfil: "◉",

    calendario: "□",

    cardapio: "♨",
};

/* =========================================================
   MENU
========================================================= */

const MENU = [
    ["inicio", "Início"],

    ["reservas", "Minhas Reservas"],

    ["emprestimos", "Meus Empréstimos"],

    ["historico", "Histórico"],

    ["perfil", "Meu Perfil"],

    ["calendario", "Calendário"],

    ["cardapio", "Cardápio"],
];

/* =========================================================
   ESTADO
========================================================= */

let page = "inicio";

const today = new Date();

const cal = {
    view: "Mês",

    cur: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
};

/* =========================================================
   DADOS
========================================================= */

let ALUNO = {
    nome: "Aluno",

    idade: "",

    ano: "",

    turma: "",

    turno: "",

    email: "",

    matricula: "",

    status: "",
};

let reservas = [];

let emprestimos = [];

let moves = [];

let hist = {
    Livro: 0,

    Computador: 0,
};

/* =========================================================
   DADOS TEMPORÁRIOS
   SERÃO SUBSTITUÍDOS PELA API
========================================================= */

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

    feriado: ["Feriado", "#c65a32"],

    recesso: ["Recesso", "#8a6bbe"],

    evento: ["Evento escolar", "#2f6fb5"],

    reuniao: ["Reunião", "#7a8b2e"],

    prova: ["Prova", "#d9a441"],

    escola: ["Evento da escola", "#e07b39"],
};

const EV = {
    "2026-10-08": ["prova", "Prova de Matemática"],

    "2026-10-12": ["feriado", "Nossa Senhora Aparecida"],

    "2026-10-15": ["evento", "Dia do Professor"],

    "2026-10-20": ["reuniao", "Reunião de pais"],

    "2026-10-24": ["escola", "Feira de Ciências"],

    "2026-10-28": ["recesso", "Dia do Servidor Público"],

    "2026-11-02": ["feriado", "Finados"],

    "2026-11-05": ["prova", "Prova de História"],

    "2026-11-20": ["feriado", "Consciência Negra"],

    "2026-12-18": ["escola", "Formatura do 3º Ano"],
};

/* =========================================================
   UTILITÁRIOS
========================================================= */

const pad = (n) => String(n).padStart(2, "0");

const key = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const $ = (selector) => document.querySelector(selector);

function toast(message) {
    const element = document.getElementById("toast");

    if (!element) return;

    element.textContent = message;

    element.classList.add("show");

    clearTimeout(toast.timeout);

    toast.timeout = setTimeout(() => {
        element.classList.remove("show");
    }, 2600);
}

/* =========================================================
   CARREGAR PERFIL REAL
========================================================= */

async function carregarPerfil() {
    if (!usuarioLogado || !usuarioLogado.id) {
        return;
    }

    try {
        const resposta = await fetch(
            `${API_URL}/aluno/perfil/${encodeURIComponent(usuarioLogado.id)}`,
        );

        const dados = await resposta.json();

        if (!resposta.ok || !dados.sucesso) {
            throw new Error(
                dados.mensagem || "Não foi possível carregar o perfil.",
            );
        }

        const aluno = dados.aluno;

        ALUNO = {
            nome: aluno.nome || "Aluno",

            idade: aluno.idade || "",

            ano: aluno.ano || "",

            turma: aluno.turma || "",

            turno: aluno.turno || "",

            email: aluno.email || "",

            matricula: aluno.matricula || "",

            status: aluno.status || "",
        };

        if (sidebarNome) {
            sidebarNome.textContent = ALUNO.nome;
        }

        if (avatarInicial && ALUNO.nome) {
            avatarInicial.textContent = ALUNO.nome
                .trim()
                .charAt(0)
                .toUpperCase();
        }

        atualizarInterface();
    } catch (erro) {
        console.error("Erro ao carregar perfil:", erro);

        toast("Não foi possível carregar seus dados.");
    }
}

/* =========================================================
   MENU
========================================================= */

function desenharMenu() {
    if (!nav) return;

    nav.innerHTML = MENU.map((item) => {
        const codigo = item[0];
        const nome = item[1];

        return `
            <button
                class="nav-button ${codigo === page ? "active" : ""}"
                onclick="go('${codigo}')"
                title="${nome}"
            >

                <span class="nav-icon">
                    ${IC[codigo]}
                </span>

                <span class="nav-text">
                    ${nome}
                </span>

            </button>
        `;
    }).join("");
}

/* =========================================================
   NAVEGAÇÃO
========================================================= */

function go(p) {
    page = p;

    atualizarInterface();

    fecharMenuMobile();
}

function atualizarInterface() {
    desenharMenu();

    if (view && VIEWS[page]) {
        view.innerHTML = VIEWS[page]();
    }

    if (page === "reservas") {
        fillItens();
    }

    const main = document.getElementById("main");

    if (main) {
        main.scrollTop = 0;
    }
}

/* =========================================================
   SIDEBAR DESKTOP
========================================================= */

function carregarEstadoSidebar() {
    const estado = localStorage.getItem("painelAlunoSidebar");

    if (estado === "collapsed") {
        document.body.classList.add("sidebar-collapsed");
    }
}

if (toggleSidebar) {
    toggleSidebar.addEventListener("click", () => {
        document.body.classList.toggle("sidebar-collapsed");

        const recolhida = document.body.classList.contains("sidebar-collapsed");

        localStorage.setItem(
            "painelAlunoSidebar",
            recolhida ? "collapsed" : "expanded",
        );
    });
}

/* =========================================================
   MENU MOBILE
========================================================= */

function abrirMenuMobile() {
    document.body.classList.add("mobile-menu-open");
}

function fecharMenuMobile() {
    document.body.classList.remove("mobile-menu-open");
}

if (mobileMenu) {
    mobileMenu.addEventListener("click", abrirMenuMobile);
}

if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", fecharMenuMobile);
}

/* =========================================================
   LOGOUT
========================================================= */

if (logoutButton) {
    logoutButton.addEventListener("click", () => {
        sessionStorage.removeItem("usuarioLogado");

        window.location.href = "../login/index.html";
    });
}

/* =========================================================
   INÍCIO
========================================================= */

function schoolMenuDay() {
    const w = today.getDay();

    return w >= 1 && w <= 5 ? w : 1;
}

function viewInicio() {
    const w = schoolMenuDay();

    const reservasAtivas = reservas.length;

    const emprestimosAtivos = emprestimos.length;

    return `

        <div class="hero">

            <div class="hero-content">

                <h1>
                    Olá, ${ALUNO.nome.split(" ")[0]}
                </h1>

                <p>
                    ${ALUNO.ano || "Aluno"}
                    ${ALUNO.turma ? ` • Turma ${ALUNO.turma}` : ""}
                    ${ALUNO.turno ? ` • ${ALUNO.turno}` : ""}
                </p>

            </div>


            <div class="stats">

                <div class="stat">

                    <b>
                        ${hist.Livro}
                    </b>

                    <span>
                        Livros lidos
                    </span>

                </div>


                <div class="stat">

                    <b>
                        ${hist.Computador}
                    </b>

                    <span>
                        Computadores
                    </span>

                </div>

            </div>

        </div>


        <div class="grid">

            <div class="card">

                <div class="card-label">
                    ${IC.reservas}
                    Minhas reservas
                </div>

                <div class="card-big">
                    ${reservasAtivas}
                    ${reservasAtivas === 1 ? "ativa" : "ativas"}
                </div>

                <p>
                    Livros e computadores reservados.
                </p>

            </div>


            <div class="card">

                <div class="card-label">
                    ${IC.emprestimos}
                    Meus empréstimos
                </div>

                <div class="card-big">
                    ${emprestimosAtivos}
                    ${emprestimosAtivos === 1 ? "ativo" : "ativos"}
                </div>

                <p>
                    Itens atualmente emprestados.
                </p>

            </div>


            <div class="card">

                <div class="card-label">
                    ${IC.calendario}
                    Calendário
                </div>

                <div class="card-big">
                    ${MESES[today.getMonth()]}
                </div>

                <p>
                    Consulte as datas e eventos escolares.
                </p>

            </div>


            <div class="card">

                <div class="card-label">
                    ${IC.cardapio}
                    Cardápio
                </div>

                <div class="card-big">
                    ${DIAS[w]}
                </div>

                <p>
                    Consulte o cardápio da escola.
                </p>

            </div>

        </div>

    `;
}

/* =========================================================
   RESERVAS
========================================================= */

function viewReservas() {
    const rows = reservas
        .map(
            (reserva) => `

            <tr>

                <td>
                    ${reserva.t}
                </td>

                <td>
                    <b>
                        ${reserva.n}
                    </b>
                </td>

                <td>
                    ${reserva.d}
                </td>

                <td>
                    <span class="tag">
                        Ativa
                    </span>
                </td>

            </tr>

        `,
        )
        .join("");

    return `

        <div class="page-head">

            <h1>
                Minhas Reservas
            </h1>

            <p class="sub">
                Consulte suas reservas e reserve itens permitidos.
            </p>

        </div>


        <div class="two">

            <div class="card">

                <h2>
                    Reservas ativas
                </h2>

                <div class="scroll">

                    <table>

                        <thead>

                            <tr>

                                <th>
                                    Tipo
                                </th>

                                <th>
                                    Item
                                </th>

                                <th>
                                    Data
                                </th>

                                <th>
                                    Situação
                                </th>

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

                <h2>
                    Nova reserva
                </h2>

                <div
                    class="form"
                    style="margin-top:16px"
                >

                    <div>

                        <label>
                            Tipo
                        </label>

                        <select
                            id="rt"
                            onchange="fillItens()"
                        >

                            <option>
                                Livro
                            </option>

                            <option>
                                Computador
                            </option>

                        </select>

                    </div>


                    <div>

                        <label>
                            Item
                        </label>

                        <select id="ri"></select>

                    </div>


                    <div>

                        <label>
                            Data
                        </label>

                        <input
                            id="rd"
                            type="date"
                        >

                    </div>


                    <button
                        class="btn"
                        onclick="reservar()"
                    >
                        Reservar
                    </button>

                </div>


                <div class="note">

                    Alunos podem reservar apenas
                    livros da Biblioteca e
                    computadores do Laboratório
                    de Informática.

                </div>

            </div>

        </div>

    `;
}

function fillItens() {
    const tipo = document.getElementById("rt");

    const itens = document.getElementById("ri");

    if (!tipo || !itens) return;

    itens.innerHTML = CAT[tipo.value]
        .map((item) => `<option>${item}</option>`)
        .join("");
}

function reservar() {
    const data = document.getElementById("rd");

    const tipo = document.getElementById("rt");

    const item = document.getElementById("ri");

    if (!data || !data.value) {
        toast("Escolha a data da reserva.");

        return;
    }

    const [y, m, d] = data.value.split("-");

    reservas.push({
        t: tipo.value,

        n: item.value,

        d: `${d}/${m}/${y}`,
    });

    toast("Reserva realizada.");

    atualizarInterface();
}

/* =========================================================
   EMPRÉSTIMOS
========================================================= */

function viewEmprestimos() {
    const rows = emprestimos
        .map(
            (r) => `

            <tr>

                <td>
                    ${r.t}
                </td>

                <td>
                    <b>
                        ${r.n}
                    </b>
                </td>

                <td>
                    ${r.s}
                </td>

                <td>
                    ${r.p}
                </td>

                <td>
                    <span class="tag orange">
                        Em andamento
                    </span>
                </td>

            </tr>

        `,
        )
        .join("");

    return `

        <div class="page-head">

            <h1>
                Meus Empréstimos
            </h1>

            <p class="sub">
                Itens que estão com você neste momento.
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
                                    Você não tem empréstimos ativos.
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

/* =========================================================
   HISTÓRICO
========================================================= */

function viewHistorico() {
    return `

        <div class="page-head">

            <h1>
                Histórico
            </h1>

            <p class="sub">
                Consulte seu histórico de utilização.
            </p>

        </div>


        <div
            class="grid"
            style="margin-bottom:24px"
        >

            <div class="card">

                <div class="card-label">
                    ${IC.reservas}
                    Livros
                </div>

                <div class="card-big">
                    Você leu
                    ${hist.Livro}
                    livros
                </div>

            </div>


            <div class="card">

                <div class="card-label">
                    ${IC.perfil}
                    Computadores
                </div>

                <div class="card-big">
                    Você utilizou
                    ${hist.Computador}
                    computadores
                </div>

            </div>

        </div>


        <div class="card">

            <h2>
                Últimas movimentações
            </h2>

            <div style="margin-top:8px">

                ${
                    moves.length
                        ? moves
                              .map(
                                  (m) => `

                            <div class="move">

                                <div>
                                    <b>
                                        ${m[0]}:
                                    </b>

                                    ${m[1]}
                                </div>

                                <span>
                                    ${m[2]}
                                </span>

                            </div>

                        `,
                              )
                              .join("")
                        : `
                        <p class="sub">
                            Nenhuma movimentação registrada.
                        </p>
                        `
                }

            </div>

        </div>

    `;
}

/* =========================================================
   PERFIL
========================================================= */

function viewPerfil() {
    const f = (nome, valor) => `

        <div class="field">

            <small>
                ${nome}
            </small>

            <b>
                ${valor || "-"}
            </b>

        </div>

    `;

    return `

        <div class="page-head">

            <h1>
                Meu Perfil
            </h1>

            <p class="sub">
                Seus dados cadastrados.
                Para alterar seus dados,
                procure a Secretaria.
            </p>

        </div>


        <div class="prof">

            ${f("Nome completo", ALUNO.nome)}

            ${f("Matrícula", ALUNO.matricula)}

            ${f("Idade", ALUNO.idade)}

            ${f("Ano", ALUNO.ano)}

            ${f("Turma", ALUNO.turma)}

            ${f("Turno", ALUNO.turno)}

            ${f("E-mail", ALUNO.email)}

            ${f("Status", ALUNO.status)}

            <div class="field">

                <small>
                    Senha
                </small>

                <b style="letter-spacing:.2em">
                    ••••••••••••
                </b>

            </div>

        </div>


        <div class="note">

            Por segurança, sua senha não é exibida.
            O sistema armazena apenas uma versão protegida
            da senha.

        </div>

    `;
}

/* =========================================================
   CALENDÁRIO
========================================================= */

function evOf(d) {
    const evento = EV[key(d)];

    if (evento) {
        return evento;
    }

    const w = d.getDay();

    return w > 0 && w < 6 ? ["letivo", "Dia letivo"] : null;
}

function viewCalendario() {
    const c = cal.cur;

    const v = cal.view;

    const tabs = ["Ano", "Mês", "Semana", "Dia"]
        .map(
            (x) => `

                <button
                    class="${x === v ? "on" : ""}"
                    onclick="setView('${x}')"
                >
                    ${x}
                </button>

            `,
        )
        .join("");

    const yrs = [2026, 2027]
        .map(
            (y) => `

                <option
                    ${y === c.getFullYear() ? "selected" : ""}
                >
                    ${y}
                </option>

            `,
        )
        .join("");

    const mons = MESES.map(
        (m, i) => `

                <option
                    value="${i}"
                    ${i === c.getMonth() ? "selected" : ""}
                >
                    ${m}
                </option>

            `,
    ).join("");

    let body = "";

    if (v === "Mês") {
        body = monthGrid(c.getFullYear(), c.getMonth());
    } else if (v === "Ano") {
        body = `

            <div class="yr">

                ${MESES.map((m, i) => miniMonth(c.getFullYear(), i)).join("")}

            </div>

        `;
    } else if (v === "Semana") {
        const s = new Date(c);

        s.setDate(c.getDate() - ((c.getDay() + 6) % 7));

        body = `

            <div class="card" style="padding:0">

                ${[...Array(7)]
                    .map((_, i) => {
                        const d = new Date(s);

                        d.setDate(s.getDate() + i);

                        return dayRow(d);
                    })
                    .join("")}

            </div>

        `;
    } else {
        body = `

            <div class="card" style="padding:0">

                ${dayRow(c)}

            </div>

        `;
    }

    const legend = Object.values(TIPOS)
        .map(
            (t) => `

                <span>

                    <i
                        class="dot"
                        style="--c:${t[1]}"
                    ></i>

                    ${t[0]}

                </span>

            `,
        )
        .join("");

    return `

        <div class="page-head">

            <h1>
                Calendário escolar
            </h1>

            <p class="sub">
                Consulte as datas e eventos escolares.
            </p>

        </div>


        <div class="bar">

            <div class="seg">
                ${tabs}
            </div>

            <div class="sp"></div>

            <button
                class="btn sm"
                onclick="shift(-1)"
            >
                Anterior
            </button>


            <select
                id="cm"
                onchange="pick()"
            >
                ${mons}
            </select>


            <select
                id="cy"
                onchange="pick()"
            >
                ${yrs}
            </select>


            <button
                class="btn sm"
                onclick="shift(1)"
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

function monthGrid(y, m) {
    const first = new Date(y, m, 1);

    const off = (first.getDay() + 6) % 7;

    const n = new Date(y, m + 1, 0).getDate();

    let html = `

        <div class="cal">

            ${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
                .map((d) => `<div class="dh">${d}</div>`)
                .join("")}

    `;

    for (let i = 0; i < off; i++) {
        html += `<div class="c out"></div>`;
    }

    for (let d = 1; d <= n; d++) {
        const dt = new Date(y, m, d);

        const e = evOf(dt);

        const we = dt.getDay() % 6 === 0;

        const isT = key(dt) === key(today);

        const show = e && e[0] !== "letivo";

        html += `

            <div
                class="c
                    ${we ? "we" : ""}
                    ${isT ? "today" : ""}
                "
            >

                <b>
                    ${d}
                </b>

                ${
                    show
                        ? `
                            <div class="ev">

                                <i
                                    class="dot"
                                    style="--c:${TIPOS[e[0]][1]}"
                                ></i>

                                <span>
                                    ${e[1]}
                                </span>

                            </div>
                        `
                        : ""
                }

            </div>

        `;
    }

    return html + "</div>";
}

function miniMonth(y, m) {
    const off = (new Date(y, m, 1).getDay() + 6) % 7;

    const n = new Date(y, m + 1, 0).getDate();

    let html = `

        <div
            class="mini"
            onclick="
                cal.view='Mês';
                cal.cur=new Date(${y},${m},1);
                atualizarInterface();
            "
        >

            <h2>
                ${MESES[m]}
            </h2>

            <div class="mg">

    `;

    for (let i = 0; i < off; i++) {
        html += "<i></i>";
    }

    for (let d = 1; d <= n; d++) {
        const e = evOf(new Date(y, m, d));

        html +=
            e && e[0] !== "letivo"
                ? `

                <i
                    class="e"
                    style="--c:${TIPOS[e[0]][1]}"
                >
                    ${d}
                </i>

            `
                : `<i>${d}</i>`;
    }

    return html + "</div></div>";
}

function dayRow(d) {
    const e = evOf(d) || ["recesso", "Fim de semana"];

    const t = TIPOS[e[0]];

    return `

        <div class="move">

            <div>

                <b>
                    ${DIAS[d.getDay()]},
                    ${d.getDate()}/${pad(d.getMonth() + 1)}
                </b>

            </div>

            <div>
                ${e[1]}
            </div>

            <span>

                <i
                    class="dot"
                    style="--c:${t[1]}"
                ></i>

                ${e[1] === "Fim de semana" ? "Sem aula" : t[0]}

            </span>

        </div>

    `;
}

function setView(x) {
    cal.view = x;

    atualizarInterface();
}

function pick() {
    cal.cur = new Date(
        Number(document.getElementById("cy").value),
        Number(document.getElementById("cm").value),
        1,
    );

    atualizarInterface();
}

function shift(n) {
    const c = cal.cur;

    const v = cal.view;

    if (v === "Mês") {
        cal.cur = new Date(c.getFullYear(), c.getMonth() + n, 1);
    } else if (v === "Ano") {
        cal.cur = new Date(c.getFullYear() + n, c.getMonth(), 1);
    } else {
        cal.cur = new Date(
            c.getFullYear(),
            c.getMonth(),
            c.getDate() + n * (v === "Semana" ? 7 : 1),
        );
    }

    atualizarInterface();
}

/* =========================================================
   CARDÁPIO
========================================================= */

function viewCardapio() {
    const w = today.getDay();

    return `

        <div class="page-head">

            <h1>
                Cardápio da semana
            </h1>

            <p class="sub">
                Consulte a merenda de cada dia.
            </p>

        </div>


        <div class="menu">

            ${[1, 2, 3, 4, 5]
                .map(
                    (d) => `

                        <div
                            class="day
                                ${d === w ? "hoje" : ""}
                            "
                        >

                            <h2>

                                ${DIAS[d]}

                                ${
                                    d === w
                                        ? `
                                            <span class="tag orange">
                                                Hoje
                                            </span>
                                        `
                                        : ""
                                }

                            </h2>


                            <ul>

                                ${CARD[d]
                                    .map((item) => `<li>${item}</li>`)
                                    .join("")}

                            </ul>

                        </div>

                    `,
                )
                .join("")}

        </div>

    `;
}

/* =========================================================
   VIEWS
========================================================= */

const VIEWS = {
    inicio: viewInicio,

    reservas: viewReservas,

    emprestimos: viewEmprestimos,

    historico: viewHistorico,

    perfil: viewPerfil,

    calendario: viewCalendario,

    cardapio: viewCardapio,
};

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

carregarEstadoSidebar();

desenharMenu();

atualizarInterface();

carregarPerfil();
