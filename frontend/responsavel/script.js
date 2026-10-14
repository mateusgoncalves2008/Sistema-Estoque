/*
 * Painel único para todos os setores.
 * A interface está preparada para a API, mas os endpoints reais precisam
 * ser conectados às rotas existentes do seu backend.
 *
 * IMPORTANTE: o setor autorizado deve ser validado no backend.
 * Não confie em um setor enviado pelo navegador.
 */

const API_BASE = "/api";

const state = {
    page: "inicio",
    stock: [],
    movements: [],
    requests: [],
    user: null,
    sector: null,
};

const pageInfo = {
    inicio: [
        "Visão geral",
        "Acompanhe o estoque e as atividades do seu setor.",
    ],
    estoque: ["Estoque", "Consulte os itens e as quantidades do seu setor."],
    movimentacoes: [
        "Movimentações",
        "Histórico de entradas, saídas e ajustes.",
    ],
    solicitacoes: ["Solicitações", "Pedidos relacionados ao seu setor."],
};

function esc(value) {
    return String(value ?? "—").replace(
        /[&<>"']/g,
        (char) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[char],
    );
}

function get(row, keys, fallback = "—") {
    for (const key of keys) {
        if (
            row &&
            row[key] !== undefined &&
            row[key] !== null &&
            row[key] !== ""
        ) {
            return row[key];
        }
    }
    return fallback;
}

function formatDate(value) {
    if (!value || value === "—") return "—";

    const date = new Date(value);

    return Number.isNaN(date.getTime())
        ? esc(value)
        : date.toLocaleDateString("pt-BR");
}

function badge(status) {
    const text = String(status || "—");
    const css = text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    return `<span class="pill ${esc(css)}">${esc(text)}</span>`;
}

function showNotice(message, error = false) {
    const element = document.getElementById("notice");
    element.textContent = message;
    element.classList.remove("hidden");
    element.classList.toggle("error", error);
}

function openPage(page) {
    if (!pageInfo[page]) return;

    state.page = page;

    document.querySelectorAll(".page").forEach((element) => {
        element.classList.add("hidden");
    });

    document.getElementById(`page-${page}`).classList.remove("hidden");

    document.querySelectorAll(".nav").forEach((button) => {
        button.classList.toggle("active", button.dataset.page === page);
    });

    document.getElementById("pageTitle").textContent = pageInfo[page][0];
    document.getElementById("pageSubtitle").textContent = pageInfo[page][1];
}

function renderIdentity() {
    const name =
        state.user?.nome ||
        state.user?.Nome ||
        state.user?.name ||
        "Responsável";

    const sector =
        typeof state.sector === "string"
            ? state.sector
            : state.sector?.nome || state.sector?.Nome || "Setor autorizado";

    document.getElementById("userName").textContent = name;
    document.getElementById("welcomeName").textContent = name.split(" ")[0];
    document.getElementById("sectorName").textContent = sector;
}

function renderStats() {
    const total = state.stock.reduce(
        (sum, item) =>
            sum +
            (Number(get(item, ["quantidade", "Quantidade", "total"], 0)) || 0),
        0,
    );

    const available = state.stock.reduce(
        (sum, item) =>
            sum +
            (Number(
                get(
                    item,
                    ["disponivel", "Disponivel", "quantidadeDisponivel"],
                    0,
                ),
            ) || 0),
        0,
    );

    const pending = state.requests.filter((item) =>
        /pendente|aberto|aguardando/i.test(get(item, ["status", "Status"], "")),
    ).length;

    document.getElementById("totalItens").textContent = state.stock.length
        ? total
        : "—";

    document.getElementById("itensDisponiveis").textContent = state.stock.length
        ? available
        : "—";

    document.getElementById("solicitacoesPendentes").textContent = pending;
    document.getElementById("totalMovimentacoes").textContent =
        state.movements.length;
}

function renderRecentMoves() {
    const rows = state.movements.slice(-5).reverse();

    document.getElementById("recentMoves").innerHTML = rows.length
        ? rows
              .map(
                  (item) => `
      <tr>
        <td>${formatDate(get(item, ["data", "Data", "dataMovimentacao"]))}</td>
        <td>${esc(get(item, ["produto", "Produto", "nomeProduto", "item"]))}</td>
        <td>${badge(get(item, ["tipo", "Tipo", "tipoMovimentacao"]))}</td>
        <td>${esc(get(item, ["quantidade", "Quantidade"]))}</td>
      </tr>`,
              )
              .join("")
        : `<tr><td colspan="4" class="empty">Nenhuma movimentação carregada.</td></tr>`;
}

function renderStock(filter = "") {
    const rows = state.stock.filter((item) =>
        JSON.stringify(item).toLowerCase().includes(filter.toLowerCase()),
    );

    document.getElementById("stockRows").innerHTML = rows.length
        ? rows
              .map(
                  (item) => `
      <tr>
        <td>${esc(get(item, ["produtoID", "ProdutoID", "codigo", "Codigo", "id"]))}</td>
        <td>${esc(get(item, ["produto", "Produto", "nome", "Nome", "nomeProduto"]))}</td>
        <td>${esc(get(item, ["categoria", "Categoria"]))}</td>
        <td>${esc(get(item, ["quantidade", "Quantidade", "total"]))}</td>
        <td>${esc(get(item, ["disponivel", "Disponivel", "quantidadeDisponivel"]))}</td>
        <td>${badge(get(item, ["status", "Status"], "Disponível"))}</td>
      </tr>`,
              )
              .join("")
        : `<tr><td colspan="6" class="empty">Nenhum item para mostrar.</td></tr>`;
}

function renderMovements(filter = "") {
    const rows = state.movements
        .filter((item) =>
            JSON.stringify(item).toLowerCase().includes(filter.toLowerCase()),
        )
        .slice()
        .reverse();

    document.getElementById("moveRows").innerHTML = rows.length
        ? rows
              .map(
                  (item) => `
      <tr>
        <td>${formatDate(get(item, ["data", "Data", "dataMovimentacao"]))}</td>
        <td>${esc(get(item, ["produto", "Produto", "nomeProduto", "item"]))}</td>
        <td>${badge(get(item, ["tipo", "Tipo", "tipoMovimentacao"]))}</td>
        <td>${esc(get(item, ["quantidade", "Quantidade"]))}</td>
        <td>${esc(get(item, ["observacao", "Observacao", "observação", "descricao"]))}</td>
      </tr>`,
              )
              .join("")
        : `<tr><td colspan="5" class="empty">Nenhuma movimentação para mostrar.</td></tr>`;
}

function renderRequests() {
    const rows = state.requests.slice().reverse();

    document.getElementById("requestRows").innerHTML = rows.length
        ? rows
              .map(
                  (item) => `
      <tr>
        <td>${formatDate(get(item, ["dataSolicitacao", "DataSolicitacao", "data", "Data"]))}</td>
        <td>${esc(get(item, ["solicitante", "Solicitante", "nomeUsuario", "usuario"]))}</td>
        <td>${esc(get(item, ["produto", "Produto", "nomeProduto", "item"]))}</td>
        <td>${esc(get(item, ["quantidade", "Quantidade"]))}</td>
        <td>${badge(get(item, ["status", "Status"], "Pendente"))}</td>
      </tr>`,
              )
              .join("")
        : `<tr><td colspan="5" class="empty">Nenhuma solicitação para mostrar.</td></tr>`;
}

function renderAll() {
    renderIdentity();
    renderStats();
    renderRecentMoves();
    renderStock(document.getElementById("stockSearch").value);
    renderMovements(document.getElementById("moveSearch").value);
    renderRequests();
}

async function carregarPainel() {
    document.getElementById("notice").classList.add("hidden");

    /*
     * A conexão será configurada com as rotas reais do seu projeto.
     * Não presuma que estes endpoints existem antes de verificarmos o backend.
     */
    const config = window.RESPONSAVEL_API;

    if (!config?.me || !config?.dashboard) {
        showNotice(
            "A interface está criada. Falta conectar a autenticação existente e a rota do responsável no backend.",
        );
        document.getElementById("lastUpdated").textContent =
            "Aguardando integração com a API";
        renderAll();
        return;
    }

    try {
        const [userResponse, dataResponse] = await Promise.all([
            fetch(API_BASE + config.me, { credentials: "include" }),
            fetch(API_BASE + config.dashboard, { credentials: "include" }),
        ]);

        const userData = await userResponse.json();
        const data = await dataResponse.json();

        if (!userResponse.ok || !dataResponse.ok) {
            throw new Error(
                userData.erro || data.erro || "Falha ao carregar dados.",
            );
        }

        state.user = userData.usuario || userData.user || userData;
        state.sector = data.setor || data.local || null;
        state.stock = Array.isArray(data.estoque) ? data.estoque : [];
        state.movements = Array.isArray(data.movimentacoes)
            ? data.movimentacoes
            : [];
        state.requests = Array.isArray(data.solicitacoes)
            ? data.solicitacoes
            : [];

        renderAll();

        document.getElementById("lastUpdated").textContent =
            "Atualizado às " +
            new Date().toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
            });
    } catch (error) {
        showNotice(
            "Não foi possível carregar os dados: " + error.message,
            true,
        );
    }
}

document.querySelectorAll(".nav").forEach((button) => {
    button.addEventListener("click", () => openPage(button.dataset.page));
});

document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => openPage(button.dataset.go));
});

document
    .getElementById("refreshButton")
    .addEventListener("click", carregarPainel);

document.getElementById("stockSearch").addEventListener("input", (event) => {
    renderStock(event.target.value);
});

document.getElementById("moveSearch").addEventListener("input", (event) => {
    renderMovements(event.target.value);
});

document.getElementById("logoutButton").addEventListener("click", () => {
    if (window.RESPONSAVEL_API?.logoutUrl) {
        window.location.href = window.RESPONSAVEL_API.logoutUrl;
    } else {
        showNotice("A rota de saída será conectada à autenticação existente.");
    }
});

carregarPainel();
