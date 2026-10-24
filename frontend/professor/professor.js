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

function carregarCalendarioProfessor(silencioso = false) {
    const area = document.getElementById("calendarioProfessor");
    if (!area) return;

    if (!silencioso) {
        area.innerHTML = `
            <div class="cal-prof-loading">Carregando calendário escolar...</div>
        `;
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }

    return fetch(`${API_URL}/professor/calendario`)
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
            const assinaturaAnterior = JSON.stringify(eventosCalendarioProfessor);
            eventosCalendarioProfessor = dados.eventos || [];
            calendarioProfessorCarregado = true;
            if (!silencioso || assinaturaAnterior !== JSON.stringify(eventosCalendarioProfessor)) {
                renderizarCalendarioProfessor();
            }
            return true;
        })
        .catch((erro) => {
            console.error("Erro no calendário:", erro);
            if (silencioso) return false;

            area.innerHTML = `
                <div class="cal-prof-empty">
                    Não foi possível carregar os eventos da escola.
                    Verifique a conexão e tente abrir o calendário novamente.
                    <br><br>
                    <button type="button" class="primary-btn" data-cal-prof-action="retry">
                        Tentar novamente
                    </button>
                </div>
            `;
            area.querySelector('[data-cal-prof-action="retry"]')?.addEventListener(
                "click",
                carregarCalendarioProfessor,
            );
            return false;
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
                        data-cal-prof-filter="${id}"
                    >${nome}</button>
                `,
                    )
                    .join("")}
            </div>

            <div class="cal-prof-spacer"></div>

            <button type="button" data-cal-prof-month="-1">Anterior</button>

            <select aria-label="Mês" data-cal-prof-select="mes">
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

            <select aria-label="Ano" data-cal-prof-select="ano">
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

            <button type="button" data-cal-prof-month="1">Próximo</button>
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

    area.querySelectorAll("[data-cal-prof-filter]").forEach((botao) => {
        botao.addEventListener("click", () => {
            filtrarCalendarioProfessor(botao.dataset.calProfFilter);
        });
    });

    area.querySelectorAll("[data-cal-prof-month]").forEach((botao) => {
        botao.addEventListener("click", () => {
            moverMesCalendarioProfessor(Number(botao.dataset.calProfMonth));
        });
    });

    area.querySelector('[data-cal-prof-select="mes"]')?.addEventListener(
        "change",
        (evento) => selecionarMesCalendarioProfessor(evento.target.value),
    );

    area.querySelector('[data-cal-prof-select="ano"]')?.addEventListener(
        "change",
        (evento) => selecionarAnoCalendarioProfessor(evento.target.value),
    );
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

/* Atualização silenciosa: não troca a tela inteira nem interrompe campos em uso. */
let atualizacaoSilenciosaProfessorEmAndamento = false;

function podeAtualizarProfessorSilenciosamente() {
    if (document.visibilityState !== "visible") return false;
    const ativo = document.activeElement;
    if (ativo?.matches("input, textarea, select, [contenteditable='true']")) return false;
    if (document.querySelector('dialog[open], [role="dialog"]:not([hidden]), .modal.show, .modal.aberto')) return false;
    if (document.querySelector("form [aria-busy='true'], form button:disabled")) return false;
    return true;
}

async function atualizarDadosAutomaticamenteProfessor() {
    if (atualizacaoSilenciosaProfessorEmAndamento || !podeAtualizarProfessorSilenciosamente()) return;
    const paginaAtiva = document.querySelector(".page.active")?.id?.replace("page-", "");
    if (!["inicio", "reservas", "emprestimos", "historico", "calendario"].includes(paginaAtiva)) return;

    atualizacaoSilenciosaProfessorEmAndamento = true;
    let totalConsultas = 0;
    let consultasSucesso = 0;
    try {
        if (paginaAtiva === "inicio" || paginaAtiva === "reservas") {
            totalConsultas++;
            const reservasAnteriores = JSON.stringify(reservas);
            const sucesso = await carregarReservasProfessor(true);
            if (sucesso) {
                consultasSucesso++;
                if (reservasAnteriores !== JSON.stringify(reservas)) atualizarTabelas();
            }
        }
        if (paginaAtiva === "inicio" || paginaAtiva === "emprestimos") {
            totalConsultas++;
            if (await carregarEmprestimosProfessor(true)) consultasSucesso++;
        }
        if (paginaAtiva === "historico") {
            totalConsultas++;
            if (await carregarHistoricoProfessor(true)) consultasSucesso++;
        }
        if (paginaAtiva === "calendario") {
            totalConsultas++;
            if (await carregarCalendarioProfessor(true)) consultasSucesso++;
        }

        if (totalConsultas > 0 && consultasSucesso === totalConsultas) {
            const horario = new Date().toLocaleTimeString("pt-BR", { hour12: false });
            console.info(`[ATUALIZAÇÃO AUTOMÁTICA] Painel atualizado às ${horario}`);
        }
    } catch (erro) {
        console.error("Erro na atualização automática do Professor:", erro);
    } finally {
        atualizacaoSilenciosaProfessorEmAndamento = false;
    }
}

window.setInterval(atualizarDadosAutomaticamenteProfessor, 30000);

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

document.getElementById("sair")?.addEventListener("click", async (event) => {
    const botao = event.currentTarget;
    botao.disabled = true;

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
        aviso("Erro ao sair. Tente novamente.");
        botao.disabled = false;
    }
});

atualizarTabelas();
carregarPerfilProfessor();
criarBotaoAvisosProfessor();
carregarAvisosProfessor();

if (window.lucide) lucide.createIcons();

async function carregarReservasProfessor(silencioso = false) {
    if (!usuarioLogado?.id) {
        reservas = [];
        if (!silencioso) showToast("Não foi possível identificar o usuário logado.");
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
        if (!silencioso) showToast("Não foi possível carregar suas reservas.");
        return false;
    }
}

async function carregarEmprestimosProfessor(silencioso = false) {
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

        const assinaturaAnterior = JSON.stringify(emprestimos);
        emprestimos = resultado.emprestimos || [];
        if (!silencioso || assinaturaAnterior !== JSON.stringify(emprestimos)) {
            atualizarTabelaEmprestimos();
        }
        return true;
    } catch (erro) {
        console.error("Erro ao carregar empréstimos:", erro);
        return false;
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

async function carregarHistoricoProfessor(silencioso = false) {
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

    if (!silencioso) {
        area.innerHTML = '<p class="empty">Carregando histórico...</p>';
    }

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

        const assinaturaAnterior = JSON.stringify(historicoProfessor);
        historicoProfessor = Array.isArray(resultado.emprestimos)
            ? resultado.emprestimos
            : [];

        if (silencioso && assinaturaAnterior === JSON.stringify(historicoProfessor)) {
            return true;
        }

        const escapar = (valor) =>
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

        const normalizarStatus = (status) =>
            String(status || "SEM STATUS")
                .trim()
                .toUpperCase();

        const classeStatus = (status) => {
            if (
                [
                    "DEVOLVIDO",
                    "DEVOLVIDA",
                    "CONCLUIDO",
                    "CONCLUÍDO",
                    "FINALIZADO",
                    "FINALIZADA",
                ].includes(status)
            ) {
                return "historico-concluido";
            }

            if (status === "ATRASADO") return "historico-atrasado";

            if (
                [
                    "CANCELADO",
                    "CANCELADA",
                    "RECUSADO",
                    "RECUSADA",
                    "REJEITADO",
                    "REJEITADA",
                ].includes(status)
            ) {
                return "historico-recusada";
            }

            if (
                ["ABERTO", "EM ANDAMENTO", "APROVADO", "APROVADA"].includes(
                    status,
                )
            ) {
                return "historico-aprovada";
            }

            return "historico-pendente";
        };

        const registros = historicoProfessor.map((m) => ({
            id: m.emprestimoID || m.id || "",
            item: m.item || m.nome || m.produtoID || "Item não identificado",
            tipo: m.tipo || "Não informado",
            local: m.local || m.localID || "Não informado",
            quantidade: m.quantidade ?? 1,
            data: m.retirada || m.data || "",
            devolucao: m.devolucao || "",
            dataDevolucao: m.dataDevolucao || "",
            status: normalizarStatus(m.status),
        }));

        registros.sort((a, b) => String(b.data).localeCompare(String(a.data)));

        const devolvidos = registros.filter((m) =>
            [
                "DEVOLVIDO",
                "DEVOLVIDA",
                "CONCLUIDO",
                "CONCLUÍDO",
                "FINALIZADO",
                "FINALIZADA",
            ].includes(m.status),
        ).length;

        function criarCards(listaRegistros) {
            return (
                listaRegistros
                    .map(
                        (m) => `
                    <div class="historico-card">
                        <div class="historico-card-topo">
                            <span class="historico-tipo tipo-emprestimo">
                                ${icon("book-open")}
                                Empréstimo
                            </span>

                            <span class="historico-status ${classeStatus(m.status)}">
                                ${escapar(m.status.replace(/_/g, " "))}
                            </span>
                        </div>

                        <h3>
                            ${icon(
                                /computador|desktop/i.test(m.item)
                                    ? "monitor"
                                    : /livro/i.test(m.tipo)
                                      ? "book-open"
                                      : "package",
                            )}
                            ${escapar(m.item)}
                        </h3>

                        <div class="historico-dados">
                            <p>${icon("layers")}<span><b>Tipo</b>${escapar(m.tipo)}</span></p>
                            <p>${icon("hash")}<span><b>ID do registro</b>${escapar(m.id || "Não informado")}</span></p>
                            <p>${icon("map-pin")}<span><b>Local</b>${escapar(m.local)}</span></p>
                            <p>${icon("package")}<span><b>Quantidade</b>${escapar(m.quantidade)}</span></p>
                            <p>${icon("calendar")}<span><b>Data</b>${escapar(m.data ? formatarDataHoraReserva(m.data) : "Não informada")}</span></p>
                            <p>${icon("calendar-clock")}<span><b>Devolução prevista</b>${escapar(m.devolucao ? formatarDataHoraReserva(m.devolucao) : "Não informada")}</span></p>

                            ${
                                m.dataDevolucao
                                    ? `<p>${icon("check-circle")}<span><b>Devolvido em</b>${escapar(formatarDataHoraReserva(m.dataDevolucao))}</span></p>`
                                    : ""
                            }
                        </div>
                    </div>
                `,
                    )
                    .join("") ||
                '<div class="historico-vazio">Nenhum registro encontrado para essa categoria.</div>'
            );
        }

        area.innerHTML = `
            <div class="head">
                <h1>Histórico</h1>
                <p class="sub">Consulte suas reservas e empréstimos.</p>
            </div>

            <div class="grid">
                <div class="card">
                    <div class="lab">${icon("bookmark")} Empréstimos</div>
                    <div class="big">${registros.length}</div>
                    <p>Registros de empréstimos.</p>
                </div>

                <div class="card">
                    <div class="lab">${icon("book-open")} Itens devolvidos</div>
                    <div class="big">${devolvidos}</div>
                    <p>Empréstimos concluídos.</p>
                </div>
            </div>

            
<div class="historico-filtros">
    <div class="historico-filtro-grupo">
        <span>Tipo de registro</span>
        <div class="historico-botoes">
            <button type="button" data-filtro-tipo-prof="todos" class="ativo">Todos</button>
            <button type="button" data-filtro-tipo-prof="reservas">Reservas</button>
            <button type="button" data-filtro-tipo-prof="emprestimos">Empréstimos</button>
        </div>
    </div>

    <div class="historico-filtro-grupo">
        <span>Categoria</span>
        <div class="historico-botoes">
            <button type="button" data-filtro-prof="todas" class="ativo">Todos</button>
            <button type="button" data-filtro-prof="biblioteca">Biblioteca</button>
            <button type="button" data-filtro-prof="informatica">Informática</button>
        </div>
    </div>
</div>


            <div class="historico-lista">
                ${criarCards(registros)}
            </div>
        `;

        // Desenha os ícones depois de montar o histórico.
        if (window.lucide) {
            window.lucide.createIcons();
        }

        let tipoSelecionado = "todos";
        let categoriaSelecionada = "todas";
        const lista = area.querySelector(".historico-lista");

        function aplicarFiltros() {
            const filtrados = registros.filter((m) => {
                const texto = `${m.item} ${m.tipo} ${m.local}`.toLowerCase();

                const correspondeCategoria =
                    categoriaSelecionada === "todas" ||
                    (categoriaSelecionada === "biblioteca" &&
                        /biblioteca|livro|livros/.test(texto)) ||
                    (categoriaSelecionada === "informatica" &&
                        /informática|informatica|computador|desktop/.test(
                            texto,
                        ));

                // Atualmente, a API carrega somente empréstimos.
                const correspondeTipo =
                    tipoSelecionado === "todos" ||
                    tipoSelecionado === "emprestimos";

                return correspondeCategoria && correspondeTipo;
            });

            lista.innerHTML = criarCards(filtrados);

            if (window.lucide) {
                window.lucide.createIcons();
            }
        }

        area.querySelectorAll("[data-filtro-prof]").forEach((botao) => {
            botao.addEventListener("click", () => {
                categoriaSelecionada = botao.dataset.filtroProf;

                area.querySelectorAll("[data-filtro-prof]").forEach((b) => {
                    b.classList.toggle("ativo", b === botao);
                });

                aplicarFiltros();
            });
        });

        area.querySelectorAll("[data-filtro-tipo-prof]").forEach((botao) => {
            botao.addEventListener("click", () => {
                tipoSelecionado = botao.dataset.filtroTipoProf;

                area.querySelectorAll("[data-filtro-tipo-prof]").forEach(
                    (b) => {
                        b.classList.toggle("ativo", b === botao);
                    },
                );

                aplicarFiltros();
            });
        });
        return true;
    } catch (erro) {
        console.error("Erro ao carregar histórico:", erro);

        area.innerHTML = `
            <div class="historico-vazio">
                <h3>Erro ao carregar histórico</h3>
                <p>${String(erro.message || erro)}</p>
            </div>
        `;
        return false;
    }
}

function formatarDataHoraReserva(valor) {
    if (!valor) return "Não informada";

    const data = new Date(valor);

    if (isNaN(data.getTime())) return String(valor);

    return data.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function icon(nome) {
    const permitidos = [
        "book-open",
        "monitor",
        "package",
        "layers",
        "hash",
        "map-pin",
        "calendar",
        "calendar-clock",
        "check-circle",
        "bookmark",
    ];

    if (!permitidos.includes(nome)) {
        return "";
    }

    return `<i data-lucide="${nome}" class="icone-historico" aria-hidden="true"></i>`;
}

async function carregarPerfilProfessor() {
    const usuario = JSON.parse(
        sessionStorage.getItem("usuarioLogado") || "null",
    );

    if (!usuario?.id) {
        console.error("Não foi possível identificar o professor.");
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
        const nomeCompleto = String(
            p.nome || usuario.nome || usuario.nomeCompleto || "Professor",
        ).trim();

        // Nome na tela inicial
        document.getElementById("nomeHero").textContent =
            nomeCompleto.split(/\s+/)[0];

        // Nome no rodapé do menu
        document.getElementById("nomeUsuario").textContent = nomeCompleto;

        // Inicial do avatar
        document.getElementById("avatar").textContent = nomeCompleto
            .charAt(0)
            .toUpperCase();

        // Dados do perfil
        document.getElementById("perfilNome").textContent = nomeCompleto;

        document.getElementById("perfilIdade").textContent =
            p.idade || "Não informado";

        document.getElementById("perfilMasp").textContent =
            p.masp || "Não informado";

        document.getElementById("perfilEmail").textContent =
            p.email || "Não informado";

        if (window.lucide) window.lucide.createIcons();
    } catch (erro) {
        console.error("Erro ao carregar perfil:", erro);
        aviso("Não foi possível carregar os dados do professor.");
    }
}


/* ============================================================
   CENTRAL DE AVISOS DO PROFESSOR
   Usa a API e o registro de leitura compartilhados com o painel Aluno.
============================================================ */

let avisosProfessor = [];
let avisosLidosProfessor = [];
let centralAvisosProfessorAberta = false;

async function carregarAvisosProfessor() {
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

        avisosProfessor = Array.isArray(resultadoAvisos.avisos) ? resultadoAvisos.avisos : [];
        avisosLidosProfessor = Array.isArray(resultadoLeituras.avisosLidos)
            ? resultadoLeituras.avisosLidos
            : [];

        renderizarAvisosProfessor();
        atualizarContadorAvisosProfessor();
    } catch (erro) {
        console.error("Erro ao carregar avisos do professor:", erro);
        const lista = document.getElementById("listaAvisosProfessor");
        if (lista) {
            lista.innerHTML = '<p class="avisos-vazio-professor">Não foi possível carregar os avisos. Tente atualizar a página.</p>';
        }
    }
}

async function registrarLeituraAvisoProfessor(avisoID) {
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

    if (!avisosLidosProfessor.includes(avisoID)) {
        avisosLidosProfessor.push(avisoID);
    }
}

function atualizarContadorAvisosProfessor() {
    const botao = document.getElementById("botaoAvisosProfessor");
    const contador = document.getElementById("contadorAvisosProfessor");
    if (!botao || !contador) return;

    const naoLidos = avisosProfessor.filter(
        (aviso) => !avisosLidosProfessor.includes(aviso.id),
    ).length;

    contador.textContent = naoLidos > 99 ? "99+" : String(naoLidos);
    contador.hidden = naoLidos === 0;
    botao.setAttribute(
        "aria-label",
        naoLidos ? `Avisos. ${naoLidos} não lidos` : "Avisos",
    );
}

function criarBotaoAvisosProfessor() {
    if (document.getElementById("botaoAvisosProfessor")) return;

    const botao = document.createElement("button");
    botao.type = "button";
    botao.id = "botaoAvisosProfessor";
    botao.className = "botao-avisos-professor";
    botao.setAttribute("aria-label", "Avisos");
    botao.title = "Avisos da escola";
    botao.innerHTML = '<i data-lucide="bell" aria-hidden="true"></i><span id="contadorAvisosProfessor" class="contador-avisos-professor" hidden>0</span>';

    const central = document.createElement("section");
    central.id = "centralAvisosProfessor";
    central.className = "central-avisos-professor";
    central.hidden = true;
    central.setAttribute("aria-label", "Central de avisos");
    central.innerHTML = `
        <div class="cabecalho-avisos-professor">
            <div><h2>Avisos da escola</h2><p>Comunicados destinados aos professores</p></div>
            <button type="button" id="fecharAvisosProfessor" class="fechar-avisos-professor" aria-label="Fechar avisos">×</button>
        </div>
        <div class="acoes-avisos-professor">
            <button type="button" id="marcarAvisosLidosProfessor">Marcar todos como lidos</button>
        </div>
        <div id="listaAvisosProfessor" class="lista-avisos-professor">
            <p class="avisos-vazio-professor">Carregando avisos...</p>
        </div>
    `;

    document.body.append(botao, central);
    botao.addEventListener("click", alternarCentralAvisosProfessor);
    central.querySelector("#fecharAvisosProfessor").addEventListener("click", fecharCentralAvisosProfessor);
    central.querySelector("#marcarAvisosLidosProfessor").addEventListener("click", marcarTodosAvisosProfessorComoLidos);

    if (window.lucide) window.lucide.createIcons();
}

function alternarCentralAvisosProfessor() {
    centralAvisosProfessorAberta = !centralAvisosProfessorAberta;
    const central = document.getElementById("centralAvisosProfessor");
    if (!central) return;

    central.hidden = !centralAvisosProfessorAberta;
    if (centralAvisosProfessorAberta) renderizarAvisosProfessor();
}

function fecharCentralAvisosProfessor() {
    centralAvisosProfessorAberta = false;
    const central = document.getElementById("centralAvisosProfessor");
    if (central) central.hidden = true;
}

async function marcarTodosAvisosProfessorComoLidos() {
    const pendentes = avisosProfessor.filter(
        (aviso) => !avisosLidosProfessor.includes(aviso.id),
    );

    try {
        await Promise.all(pendentes.map((aviso) => registrarLeituraAvisoProfessor(aviso.id)));
        atualizarContadorAvisosProfessor();
        renderizarAvisosProfessor();
    } catch (erro) {
        console.error("Erro ao marcar avisos do professor como lidos:", erro);
        aviso("Não foi possível salvar a leitura dos avisos.");
    }
}

function renderizarAvisosProfessor() {
    const lista = document.getElementById("listaAvisosProfessor");
    if (!lista) return;

    if (!avisosProfessor.length) {
        lista.innerHTML = '<p class="avisos-vazio-professor">Nenhum aviso publicado para os professores.</p>';
        return;
    }

    lista.innerHTML = avisosProfessor.map((item) => {
        const lido = avisosLidosProfessor.includes(item.id);
        const prioridade = String(item.prioridade || "NORMAL").toUpperCase();
        const data = item.dataPublicacao ? new Date(item.dataPublicacao) : null;
        const dataTexto = data && !Number.isNaN(data.getTime())
            ? data.toLocaleString("pt-BR")
            : "";

        return `
            <article class="aviso-professor ${lido ? "aviso-lido-professor" : "aviso-nao-lido-professor"}">
                <div class="aviso-professor-topo">
                    <strong>${escaparCalProf(item.titulo || "Aviso")}</strong>
                    <span class="prioridade-aviso-professor ${prioridade === "URGENTE" ? "urgente" : ""}">${escaparCalProf(prioridade)}</span>
                </div>
                <p>${escaparCalProf(item.mensagem || "")}</p>
                <div class="aviso-professor-rodape">
                    <small>${escaparCalProf(dataTexto)}</small>
                    ${lido
                        ? '<span class="estado-aviso-professor">Lido</span>'
                        : `<button type="button" data-aviso-lido-professor="${escaparCalProf(item.id)}">Marcar como lido</button>`}
                </div>
            </article>
        `;
    }).join("");

    lista.querySelectorAll("[data-aviso-lido-professor]").forEach((botao) => {
        botao.addEventListener("click", async () => {
            botao.disabled = true;
            try {
                await registrarLeituraAvisoProfessor(botao.dataset.avisoLidoProfessor);
                atualizarContadorAvisosProfessor();
                renderizarAvisosProfessor();
            } catch (erro) {
                console.error("Erro ao marcar aviso do professor como lido:", erro);
                aviso("Não foi possível salvar a leitura do aviso.");
                botao.disabled = false;
            }
        });
    });
}


// Menu lateral recolhível seguindo o comportamento do painel Responsável.
(() => {
    const toggle = document.getElementById("sidebarToggle");
    if (!toggle) return;
    const atualizarIcone = () => {
        const recolhido = document.body.classList.contains("sidebar-collapsed");
        toggle.innerHTML = recolhido
            ? '<i data-lucide="panel-left-open"></i>'
            : '<i data-lucide="panel-left-close"></i>';
        toggle.setAttribute("aria-label", recolhido ? "Expandir menu" : "Recolher menu");
        toggle.title = recolhido ? "Expandir menu" : "Recolher menu";
        if (window.lucide) window.lucide.createIcons();
    };
    if (localStorage.getItem("painelProfessorSidebar") === "collapsed") {
        document.body.classList.add("sidebar-collapsed");
    }
    atualizarIcone();
    toggle.addEventListener("click", () => {
        const recolhido = document.body.classList.toggle("sidebar-collapsed");
        localStorage.setItem("painelProfessorSidebar", recolhido ? "collapsed" : "expanded");
        atualizarIcone();
    });
})();
