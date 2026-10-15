const API_URL = "/api";
let reservas = [];
let emprestimos = [];
let historicoProfessor = [];
let eventosCalendarioProfessor = [];
let filtroCalendarioProfessor = "geral";
let calendarioProfessorCarregado = false;
let ITENS_PESQUISA = [];

let mesCalendarioProfessor = new Date().getMonth();
let anoCalendarioProfessor = new Date().getFullYear();

const CORES_CAL_PROF = {
    FERIADO: "#c94736",
    RECESSO: "#9860ce",
    EVENTO: "#3475bf",
    REUNIAO: "#788d32",
    PROVA: "#d9a441",
    ESCOLA: "#e77d36",
    LETIVO: "#52784c",
};

function escaparCalProf(valor) {
    return String(valor ?? "").replace(
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
}

function dataCalProf(valor) {
    const partes = String(valor || "").split("/");
    if (partes.length !== 3) return null;

    const dia = Number(partes[0]);
    const mes = Number(partes[1]);
    const ano = Number(partes[2]);

    const data = new Date(ano, mes - 1, dia);

    if (
        data.getFullYear() !== ano ||
        data.getMonth() !== mes - 1 ||
        data.getDate() !== dia
    )
        return null;

    data.setHours(0, 0, 0, 0);
    return data;
}

function chaveCalProf(data) {
    return [
        data.getFullYear(),
        String(data.getMonth() + 1).padStart(2, "0"),
        String(data.getDate()).padStart(2, "0"),
    ].join("-");
}

function eventosVisiveisCalProf() {
    const eventos = Array.isArray(eventosCalendarioProfessor)
        ? eventosCalendarioProfessor
        : [];

    if (filtroCalendarioProfessor === "reservas") {
        return [];
    }

    return eventos
        .filter(
            (e) =>
                filtroCalendarioProfessor === "geral" ||
                filtroCalendarioProfessor === "eventos",
        )
        .map((e) => {
            const tipo = String(e.tipo || "EVENTO").toUpperCase();
            return {
                data: dataCalProf(e.data),
                dataFim: dataCalProf(e.dataFim || e.data),
                titulo: e.titulo || "Evento escolar",
                descricao: e.descricao || "",
                tipo,
                cor: CORES_CAL_PROF[tipo] || CORES_CAL_PROF.EVENTO,
                categoria:
                    tipo === "FERIADO"
                        ? "Feriado"
                        : tipo === "REUNIAO"
                          ? "Reunião"
                          : tipo === "RECESSO"
                            ? "Recesso"
                            : tipo === "PROVA"
                              ? "Prova"
                              : "Evento escolar",
            };
        })
        .filter((e) => e.data);
}

function carregarCalendarioProfessor() {
    const area = document.getElementById("calendarioProfessor");
    if (!area) return;

    area.innerHTML = `
        <div class="cal-prof-loading">Carregando calendário escolar...</div>
    `;

    fetch(`${API_URL}/professor/calendario`)
        .then((resposta) =>
            resposta.json().then((dados) => {
                if (!resposta.ok || !dados.sucesso) {
                    throw new Error(
                        dados.mensagem || "Erro ao carregar calendário.",
                    );
                }
                return dados;
            }),
        )
        .then((dados) => {
            eventosCalendarioProfessor = dados.eventos || [];
            calendarioProfessorCarregado = true;
            renderizarCalendarioProfessor();
        })
        .catch((erro) => {
            console.error("Erro no calendário:", erro);
            area.innerHTML = `
                <div class="cal-prof-empty">
                    Não foi possível carregar os eventos da escola.
                    Verifique a conexão e tente abrir o calendário novamente.
                    <br><br>
                    <button class="primary-btn" onclick="carregarCalendarioProfessor()">
                        Tentar novamente
                    </button>
                </div>
            `;
        });
}

function renderizarCalendarioProfessor() {
    const area = document.getElementById("calendarioProfessor");
    if (!area) return;

    const eventos = eventosVisiveisCalProf();
    const primeiroDia = new Date(
        anoCalendarioProfessor,
        mesCalendarioProfessor,
        1,
    );
    const inicio = new Date(primeiroDia);
    inicio.setDate(1 - ((primeiroDia.getDay() + 6) % 7));

    const hoje = chaveCalProf(new Date());
    const meses = [
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

    const anos = Array.from(
        { length: 7 },
        (_, i) => new Date().getFullYear() - 2 + i,
    );

    let diasHTML = "";

    for (let i = 0; i < 42; i++) {
        const data = new Date(inicio);
        data.setDate(inicio.getDate() + i);

        const chave = chaveCalProf(data);
        const doMes = data.getMonth() === mesCalendarioProfessor;
        const doFimDeSemana = data.getDay() === 0 || data.getDay() === 6;

        const doDia = eventos.filter(
            (e) => e.data && e.data <= data && (e.dataFim || e.data) >= data,
        );

        diasHTML += `
            <button
                type="button"
                class="cal-prof-day
                    ${!doMes ? "outside" : ""}
                    ${doFimDeSemana ? "weekend" : ""}
                    ${chave === hoje ? "today" : ""}"
                aria-label="${escaparCalProf(
                    `${data.getDate()} de ${meses[data.getMonth()]}, ${doDia.map((e) => e.titulo).join(", ") || "sem eventos"}`,
                )}"
                title="${escaparCalProf(doDia.map((e) => `${e.categoria}: ${e.titulo}`).join(" | "))}"
            >
                <span class="cal-prof-number">${data.getDate()}</span>
                ${doDia
                    .slice(0, 3)
                    .map(
                        (e) => `
                    <span class="cal-prof-event" style="--event-color:${e.cor}">
                        <i class="cal-prof-dot"></i>
                        <span class="cal-prof-event-label">${escaparCalProf(e.titulo)}</span>
                    </span>
                `,
                    )
                    .join("")}
                ${doDia.length > 3 ? `<span class="cal-prof-event">+${doDia.length - 3} eventos</span>` : ""}
            </button>
        `;
    }

    const proximos = eventos
        .filter((e) => e.dataFim >= new Date(new Date().setHours(0, 0, 0, 0)))
        .sort((a, b) => a.data - b.data)
        .slice(0, 6);

    const listaHTML = proximos.length
        ? proximos
              .map(
                  (e) => `
        <div class="cal-prof-upcoming">
            <div class="cal-prof-datebox">
                <strong>${String(e.data.getDate()).padStart(2, "0")}</strong>
                <span>${meses[e.data.getMonth()].slice(0, 3)}</span>
            </div>
            <div class="cal-prof-upcoming-info">
                <strong>
                    <i class="cal-prof-dot" style="display:inline-block; background:${e.cor}"></i>
                    ${escaparCalProf(e.titulo)}
                </strong>
                <span>${escaparCalProf(e.categoria)}${e.descricao ? " · " + escaparCalProf(e.descricao) : ""}</span>
            </div>
        </div>
    `,
              )
              .join("")
        : `
        <div class="cal-prof-empty-list">
            ${
                filtroCalendarioProfessor === "reservas"
                    ? "As reservas aprovadas aparecerão aqui quando a aprovação estiver disponível."
                    : "Nenhum próximo evento cadastrado."
            }
        </div>
    `;

    const legenda = [
        ["LETIVO", "Dia letivo"],
        ["FERIADO", "Feriado"],
        ["RECESSO", "Recesso"],
        ["EVENTO", "Evento escolar"],
        ["REUNIAO", "Reunião"],
        ["PROVA", "Prova"],
        ["ESCOLA", "Evento da escola"],
    ]
        .map(
            ([tipo, nome]) => `
        <span>
            <i class="cal-prof-dot" style="--event-color:${CORES_CAL_PROF[tipo]}"></i>
            ${nome}
        </span>
    `,
        )
        .join("");

    area.innerHTML = `
        <header class="cal-prof-header">
            <h1>Calendário escolar</h1>
            <p>Confira os eventos, reservas e datas importantes da escola.</p>
        </header>

        <div class="cal-prof-toolbar">
            <div class="cal-prof-filters">
                ${[
                    ["geral", "Geral"],
                    ["reservas", "Reservas de salas"],
                    ["eventos", "Eventos"],
                ]
                    .map(
                        ([id, nome]) => `
                    <button
                        type="button"
                        class="${filtroCalendarioProfessor === id ? "active" : ""}"
                        onclick="filtrarCalendarioProfessor('${id}')"
                    >${nome}</button>
                `,
                    )
                    .join("")}
            </div>

            <div class="cal-prof-spacer"></div>

            <button type="button" onclick="moverMesCalendarioProfessor(-1)">Anterior</button>

            <select aria-label="Mês" onchange="selecionarMesCalendarioProfessor(this.value)">
                ${meses
                    .map(
                        (mes, i) => `
                    <option value="${i}" ${i === mesCalendarioProfessor ? "selected" : ""}>
                        ${mes}
                    </option>
                `,
                    )
                    .join("")}
            </select>

            <select aria-label="Ano" onchange="selecionarAnoCalendarioProfessor(this.value)">
                ${anos
                    .map(
                        (ano) => `
                    <option value="${ano}" ${ano === anoCalendarioProfessor ? "selected" : ""}>
                        ${ano}
                    </option>
                `,
                    )
                    .join("")}
            </select>

            <button type="button" onclick="moverMesCalendarioProfessor(1)">Próximo</button>
        </div>

        <div class="cal-prof-layout">
            <section class="cal-prof-main" aria-label="Calendário mensal">
                <div class="cal-prof-weekdays">
                    ${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
                        .map((d) => `<div>${d}</div>`)
                        .join("")}
                </div>
                <div class="cal-prof-grid">${diasHTML}</div>
                <div class="cal-prof-note">
                    <strong>Detalhes dos eventos</strong>
                    Passe o mouse sobre uma data marcada para consultar seus detalhes.
                </div>
            </section>

            <aside class="cal-prof-side">
                <h2>Próximos eventos</h2>
                <div class="cal-prof-event-list">${listaHTML}</div>
                <div class="cal-prof-legend">${legenda}</div>
            </aside>
        </div>
    `;
}

function filtrarCalendarioProfessor(filtro) {
    filtroCalendarioProfessor = filtro;
    renderizarCalendarioProfessor();
}

function moverMesCalendarioProfessor(direcao) {
    const data = new Date(
        anoCalendarioProfessor,
        mesCalendarioProfessor + direcao,
        1,
    );

    mesCalendarioProfessor = data.getMonth();
    anoCalendarioProfessor = data.getFullYear();

    renderizarCalendarioProfessor();
}

function selecionarMesCalendarioProfessor(mes) {
    mesCalendarioProfessor = Number(mes);
    renderizarCalendarioProfessor();
}

function selecionarAnoCalendarioProfessor(ano) {
    anoCalendarioProfessor = Number(ano);
    renderizarCalendarioProfessor();
}

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

    if (nome === "perfil") {
        carregarPerfilProfessor();
    }

    if (nome === "calendario") {
        carregarCalendarioProfessor();
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

async function carregarPerfilProfessor() {
    const usuario = JSON.parse(
        sessionStorage.getItem("usuarioLogado") || "null",
    );

    if (!usuario?.id) {
        aviso("Não foi possível identificar o professor.");
        return;
    }

    try {
        const resposta = await fetch(
            `${API_URL}/professor/perfil/${encodeURIComponent(usuario.id)}`,
        );

        const resultado = await resposta.json();

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(resultado.mensagem || "Erro ao carregar perfil.");
        }

        const p = resultado.professor;

        document.getElementById("perfilNome").textContent =
            p.nome || "Não informado";

        document.getElementById("perfilIdade").textContent =
            p.idade || "Não informado";

        document.getElementById("perfilMasp").textContent =
            p.masp || "Não informado";

        document.getElementById("perfilEmail").textContent =
            p.email || "Não informado";

        if (window.lucide) lucide.createIcons();
    } catch (erro) {
        console.error("Erro ao carregar perfil:", erro);
        aviso("Não foi possível carregar os dados do perfil.");
    }
}
