"use strict";

/* =====================================================
   PAINEL DO RESPONSÁVEL — SISTEMA DE ESTOQUE ESCOLAR
   API existente: GET /api/responsavel/dashboard
===================================================== */

const API_BASE = "/api";

const state = {
    page: "inicio",
    user: null,
    sector: null,
    stock: [],
    movements: [],
    requests: [],
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

/* =====================================================
   FUNÇÕES AUXILIARES
===================================================== */

function el(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const element = el(id);
    if (element) element.textContent = value;
}

function escapeHTML(value) {
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

function getValue(row, keys, fallback = "—") {
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

function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function normalizeText(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function formatDate(value) {
    if (!value || value === "—") return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return escapeHTML(value);
    }

    return date.toLocaleDateString("pt-BR");
}

function formatNumber(value) {
    return numberValue(value).toLocaleString("pt-BR");
}

function getStatusClass(status) {
    const normalized = normalizeText(status);

    if (/aprov|conclu|disponivel|ativo|devolvido/.test(normalized)) {
        return "aprovada";
    }

    if (/pendente|aguardando|aberto/.test(normalized)) {
        return "pendente";
    }

    if (/recus|cancel|indisponivel|atrasado|negado/.test(normalized)) {
        return "recusada";
    }

    return "";
}

function statusBadge(status) {
    const text = String(status || "Não informado");
    const css = getStatusClass(text);

    return `<span class="pill ${css}">${escapeHTML(text)}</span>`;
}

function showNotice(message, isError = false) {
    const notice = el("notice");

    if (!notice) {
        console[isError ? "error" : "log"](message);
        return;
    }

    notice.textContent = message;
    notice.classList.remove("hidden");
    notice.classList.toggle("error", isError);
}

function hideNotice() {
    el("notice")?.classList.add("hidden");
}

/* =====================================================
   RELÓGIO
===================================================== */

function updateClock() {
    const now = new Date();

    setText(
        "clockTime",
        now.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        }),
    );

    setText(
        "clockDate",
        now.toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
        }),
    );
}

/* =====================================================
   NAVEGAÇÃO
===================================================== */

function openPage(page) {
    if (!pageInfo[page]) return;

    state.page = page;

    document.querySelectorAll(".page").forEach((section) => {
        section.classList.add("hidden");
    });

    const target = el(`page-${page}`);

    if (target) {
        target.classList.remove("hidden");
    }

    document.querySelectorAll(".nav").forEach((button) => {
        button.classList.toggle("active", button.dataset.page === page);
    });

    setText("pageTitle", pageInfo[page][0]);
    setText("pageSubtitle", pageInfo[page][1]);

    document.body.classList.remove("mobile-menu-open");
}

/* =====================================================
   IDENTIFICAÇÃO
===================================================== */

function renderIdentity() {
    const name = getValue(
        state.user,
        ["nome", "Nome", "name", "usuario"],
        "Responsável",
    );

    let sector = "Setor autorizado";

    if (typeof state.sector === "string") {
        sector = state.sector;
    } else {
        sector = getValue(
            state.sector,
            ["nome", "Nome", "setor", "Setor", "descricao"],
            sector,
        );
    }

    setText("userName", name);
    setText("welcomeName", String(name).split(" ")[0]);
    setText("sectorName", sector);
}

/* =====================================================
   INDICADORES
===================================================== */

function renderStats() {
    const total = state.stock.reduce(
        (sum, item) =>
            sum +
            numberValue(
                getValue(item, ["quantidade", "Quantidade", "total"], 0),
            ),
        0,
    );

    const reserved = state.stock.reduce(
        (sum, item) =>
            sum +
            numberValue(
                getValue(
                    item,
                    ["reservado", "Reservado", "quantidadeReservada"],
                    0,
                ),
            ),
        0,
    );

    const unavailable = state.stock.reduce(
        (sum, item) =>
            sum +
            numberValue(
                getValue(
                    item,
                    ["indisponivel", "Indisponivel", "quantidadeIndisponivel"],
                    0,
                ),
            ),
        0,
    );

    const available = state.stock.reduce((sum, item) => {
        const explicit = getValue(
            item,
            ["disponivel", "Disponivel", "quantidadeDisponivel"],
            null,
        );

        // Se a API não enviar disponíveis, calcula pela quantidade restante.
        if (explicit !== null) return sum + numberValue(explicit);

        const quantity = numberValue(
            getValue(item, ["quantidade", "Quantidade", "total"], 0),
        );

        const itemReserved = numberValue(
            getValue(
                item,
                ["reservado", "Reservado", "quantidadeReservada"],
                0,
            ),
        );

        const itemUnavailable = numberValue(
            getValue(
                item,
                ["indisponivel", "Indisponivel", "quantidadeIndisponivel"],
                0,
            ),
        );

        return sum + Math.max(0, quantity - itemReserved - itemUnavailable);
    }, 0);

    const pending = state.requests.filter((item) =>
        /pendente|aberto|aguardando/.test(
            normalizeText(getValue(item, ["status", "Status"], "")),
        ),
    ).length;

    setText("totalItens", formatNumber(total));
    setText("itensDisponiveis", formatNumber(available));
    setText("itensReservados", formatNumber(reserved));
    setText("itensIndisponiveis", formatNumber(unavailable));
    setText("solicitacoesPendentes", formatNumber(pending));
    setText("totalMovimentacoes", formatNumber(state.movements.length));

    setText("totalProdutos", formatNumber(state.stock.length));
    setText("totalSolicitacoes", formatNumber(state.requests.length));

    // Atualiza o gráfico circular de disponibilidade.
    setText("legendAvailable", formatNumber(available));
    setText("legendReserved", formatNumber(reserved));
    setText("legendUnavailable", formatNumber(unavailable));

    const percent = total > 0 ? Math.round((available / total) * 100) : 0;

    setText("availabilityPercent", percent + "%");

    const donut = el("stockDonut");
    if (donut) {
        const safeTotal = Math.max(total, 1);
        const green = (available / safeTotal) * 100;
        const blue = (reserved / safeTotal) * 100;
        const orange = (unavailable / safeTotal) * 100;

        donut.style.background = `conic-gradient(
                #31966a 0% ${green}%,
                #4285d4 ${green}% ${green + blue}%,
                #e58b45 ${green + blue}% ${green + blue + orange}%,
                #eee ${green + blue + orange}% 100%
            )`;
    }
}

/* =====================================================
   TABELA DE MOVIMENTAÇÕES RECENTES
===================================================== */

function renderRecentMoves() {
    const tbody = el("recentMoves");
    if (!tbody) return;

    const rows = state.movements.slice(-5).reverse();

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="empty">
                    Nenhuma movimentação encontrada.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows
        .map(
            (item) => `
        <tr>
            <td>${formatDate(
                getValue(item, ["data", "Data", "dataMovimentacao"]),
            )}</td>
            <td>${escapeHTML(
                getValue(item, ["produto", "Produto", "nomeProduto", "item"]),
            )}</td>
            <td>${statusBadge(
                getValue(item, ["tipo", "Tipo", "tipoMovimentacao"]),
            )}</td>
            <td>${escapeHTML(getValue(item, ["quantidade", "Quantidade"]))}</td>
        </tr>
    `,
        )
        .join("");
}

/* =====================================================
   TABELA DE ESTOQUE
===================================================== */

function renderStock(filter = "") {
    const tbody = el("stockRows");
    if (!tbody) return;

    const categoriaSelecionada = el("stockCategoryFilter")?.value || "";

    const statusSelecionado = el("stockStatusFilter")?.value || "";

    const categorias = [
        ...new Set(
            state.stock
                .map((item) => getValue(item, ["categoria", "Categoria"], ""))
                .filter(Boolean),
        ),
    ];

    const status = [
        ...new Set(
            state.stock
                .map((item) => getValue(item, ["status", "Status"], ""))
                .filter(Boolean),
        ),
    ];

    const preencherFiltro = (id, valores, selecionado, titulo) => {
        const select = el(id);
        if (!select) return;

        select.innerHTML =
            `<option value="">${titulo}</option>` +
            valores
                .map(
                    (valor) =>
                        `<option value="${escapeHTML(valor)}">${escapeHTML(valor)}</option>`,
                )
                .join("");

        select.value = selecionado;
    };

    preencherFiltro(
        "stockCategoryFilter",
        categorias,
        categoriaSelecionada,
        "Todas as categorias",
    );

    preencherFiltro(
        "stockStatusFilter",
        status,
        statusSelecionado,
        "Todos os status",
    );

    const busca = normalizeText(filter);

    const rows = state.stock.filter((item) => {
        const codigo = normalizeText(
            getValue(item, ["produtoID", "ProdutoID", "estoqueID"], ""),
        );

        const produto = normalizeText(
            getValue(item, ["produto", "Produto", "nome", "Nome"], ""),
        );

        const categoria = getValue(item, ["categoria", "Categoria"], "");

        const situacao = getValue(item, ["status", "Status"], "");

        const correspondeBusca =
            !busca ||
            codigo.includes(busca) ||
            produto.includes(busca) ||
            normalizeText(categoria).includes(busca);

        const correspondeCategoria =
            !categoriaSelecionada || categoria === categoriaSelecionada;

        const correspondeStatus =
            !statusSelecionado || situacao === statusSelecionado;

        return correspondeBusca && correspondeCategoria && correspondeStatus;
    });

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty">Nenhum item encontrado.</td></tr>`;
        return;
    }

    tbody.innerHTML = rows
        .map(
            (item) => `
        <tr>
            <td>${escapeHTML(getValue(item, ["produtoID", "ProdutoID", "codigo", "Codigo", "id"]))}</td>
            <td>${escapeHTML(getValue(item, ["produto", "Produto", "nome", "Nome", "nomeProduto"]))}</td>
            <td>${escapeHTML(getValue(item, ["categoria", "Categoria"]))}</td>
            <td>${escapeHTML(getValue(item, ["quantidade", "Quantidade", "total"]))}</td>
            <td>${escapeHTML(getValue(item, ["disponivel", "Disponivel", "quantidadeDisponivel"]))}</td>
            <td>${statusBadge(getValue(item, ["status", "Status"], "Disponível"))}</td>
        </tr>
    `,
        )
        .join("");
}

/* =====================================================
   TABELA DE MOVIMENTAÇÕES
===================================================== */

function renderMovements(filter = "") {
    const tbody = el("moveRows");
    if (!tbody) return;

    const search = normalizeText(filter);

    const rows = state.movements
        .filter((item) => {
            return normalizeText(JSON.stringify(item)).includes(search);
        })
        .slice()
        .reverse();

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty">
                    Nenhuma movimentação encontrada.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = rows
        .map(
            (item) => `
        <tr>
            <td>${formatDate(
                getValue(item, ["data", "Data", "dataMovimentacao"]),
            )}</td>
            <td>${escapeHTML(
                getValue(item, ["produto", "Produto", "nomeProduto", "item"]),
            )}</td>
            <td>${statusBadge(
                getValue(item, ["tipo", "Tipo", "tipoMovimentacao"]),
            )}</td>
            <td>${escapeHTML(getValue(item, ["quantidade", "Quantidade"]))}</td>
            <td>${escapeHTML(
                getValue(item, [
                    "observacao",
                    "Observacao",
                    "observação",
                    "descricao",
                ]),
            )}</td>
        </tr>
    `,
        )
        .join("");
}

/* =====================================================
   TABELA DE SOLICITAÇÕES
===================================================== */

function renderRequests() {
    const tbody = el("requestRows");
    if (!tbody) return;

    const rows = state.requests.slice().reverse();

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty">
                    Nenhuma solicitação encontrada.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = rows
        .map((item) => {
            const status = normalizeText(item.status);
            const id = escapeHTML(item.reservaID || "");
            let actions = "";

            if (status === "pendente") {
                actions = `
                <button class="request-action approve"
                    data-action="aprovar" data-id="${id}">
                    Aprovar
                </button>
                <button class="request-action reject"
                    data-action="recusar" data-id="${id}">
                    Recusar
                </button>
                <button class="request-action cancel"
                    data-action="cancelar" data-id="${id}">
                    Cancelar
                </button>`;
            } else if (status === "aprovada") {
                actions = `
                <button class="request-action cancel"
                    data-action="cancelar" data-id="${id}">
                    Cancelar
                </button>
                <button class="request-action finish"
                    data-action="concluir" data-id="${id}">
                    Concluir devolução
                </button>`;
            }

            return `
            <tr>
                <td>${formatDate(item.dataSolicitacao)}</td>
                <td>${escapeHTML(item.solicitante)}</td>
                <td>${escapeHTML(item.produto)}</td>
                <td>${escapeHTML(item.quantidade)}</td>
                <td>${statusBadge(item.status)}</td>
                <td class="request-actions">
                    ${actions || "—"}
                </td>
            </tr>`;
        })
        .join("");
}

async function executarAcaoReserva(acao, reservaID) {
    const confirmacoes = {
        aprovar: "Deseja aprovar esta reserva?",
        recusar: "Deseja recusar esta solicitação?",
        cancelar: "Deseja cancelar esta reserva?",
        concluir: "Confirma que o item foi devolvido?",
    };

    if (!confirmacoes[acao] || !reservaID) return;
    if (!window.confirm(confirmacoes[acao])) return;

    const linha = [...document.querySelectorAll("#requestRows tr")].find((tr) =>
        tr.querySelector(`button[data-id="${CSS.escape(reservaID)}"]`),
    );

    const botoes = linha
        ? [...linha.querySelectorAll("button[data-action]")]
        : [];

    botoes.forEach((botao) => {
        botao.disabled = true;
        botao.dataset.textoOriginal = botao.textContent;
        botao.textContent = "Processando...";
    });

    try {
        const response = await fetch(
            `${API_BASE}/responsavel/solicitacoes/${encodeURIComponent(reservaID)}/${acao}`,
            {
                method: "PATCH",
                credentials: "include",
                headers: { Accept: "application/json" },
            },
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.sucesso) {
            throw new Error(
                data.mensagem || "Não foi possível atualizar a reserva.",
            );
        }

        showNotice(data.mensagem || "Reserva atualizada com sucesso.");

        // Busca novamente os dados atualizados no servidor.
        await carregarPainel();
    } catch (error) {
        showNotice(error.message || "Erro ao atualizar a reserva.", true);

        // Se falhar, restaura os botões para permitir nova tentativa.
        botoes.forEach((botao) => {
            botao.disabled = false;
            botao.textContent =
                botao.dataset.textoOriginal || botao.textContent;
        });
    }
}

/* =====================================================
   GRÁFICO: ITENS POR CATEGORIA
===================================================== */

function renderCategoryChart() {
    const container = el("categoryChart");
    if (!container) return;

    const categories = {};

    state.stock.forEach((item) => {
        const category = getValue(
            item,
            ["categoria", "Categoria"],
            "Sem categoria",
        );

        const quantity = numberValue(
            getValue(item, ["quantidade", "Quantidade"], 0),
        );

        categories[category] = (categories[category] || 0) + quantity;
    });

    const entries = Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7);

    if (!entries.length) {
        container.innerHTML = `
            <p class="empty">Sem dados de categorias para mostrar.</p>
        `;
        return;
    }

    const max = Math.max(...entries.map((entry) => entry[1]), 1);

    container.innerHTML = `
        <div class="bar-chart">
            ${entries
                .map(([name, value]) => {
                    const width = Math.max(
                        0,
                        Math.min(100, (value / max) * 100),
                    );

                    return `
                    <div class="bar-row">
                        <span class="bar-label" title="${escapeHTML(name)}">
                            ${escapeHTML(name)}
                        </span>
                        <div class="bar-track">
                            <div class="bar-fill"
                                 style="--bar-width:${width}%"></div>
                        </div>
                        <strong class="bar-value">${formatNumber(value)}</strong>
                    </div>
                `;
                })
                .join("")}
        </div>
    `;
}

/* =====================================================
   GRÁFICO: MOVIMENTAÇÕES DOS ÚLTIMOS 7 DIAS
===================================================== */

function renderWeeklyChart() {
    const container = el("movementChart");
    if (!container) return;

    const days = [];

    for (let offset = 6; offset >= 0; offset--) {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - offset);

        days.push({
            date,
            label: date
                .toLocaleDateString("pt-BR", {
                    weekday: "short",
                })
                .replace(".", ""),
            count: 0,
        });
    }

    state.movements.forEach((item) => {
        const rawDate = getValue(
            item,
            ["data", "Data", "dataMovimentacao"],
            "",
        );

        if (!rawDate) return;

        const date = new Date(rawDate);
        if (Number.isNaN(date.getTime())) return;

        date.setHours(0, 0, 0, 0);

        const day = days.find((entry) => {
            return entry.date.getTime() === date.getTime();
        });

        if (day) day.count++;
    });

    const max = Math.max(...days.map((day) => day.count), 1);

    container.innerHTML = `
        <div class="period-chart">
            ${days
                .map((day) => {
                    const height = Math.max(4, (day.count / max) * 100);

                    return `
                    <div class="period-col">
                        <strong>${day.count}</strong>
                        <div class="period-bar-wrap">
                            <div class="period-bar"
                                 style="--bar-height:${height}%"></div>
                        </div>
                        <small>${escapeHTML(day.label)}</small>
                    </div>
                `;
                })
                .join("")}
        </div>
    `;
}

/* =====================================================
   GRÁFICO: STATUS DAS SOLICITAÇÕES
===================================================== */

function renderRequestStatusChart() {
    const container = el("requestChart");
    if (!container) return;

    const groups = [
        { label: "Pendentes", count: 0, css: "pending" },
        { label: "Aprovadas", count: 0, css: "approved" },
        { label: "Recusadas", count: 0, css: "rejected" },
        { label: "Outras", count: 0, css: "other" },
    ];

    state.requests.forEach((item) => {
        const status = normalizeText(getValue(item, ["status", "Status"], ""));

        if (/pendente|aberto|aguardando/.test(status)) {
            groups[0].count++;
        } else if (/aprov|conclu|aceit/.test(status)) {
            groups[1].count++;
        } else if (/recus|cancel|negad/.test(status)) {
            groups[2].count++;
        } else {
            groups[3].count++;
        }
    });

    const max = Math.max(...groups.map((group) => group.count), 1);

    container.innerHTML = `
        <div class="status-chart">
            ${groups
                .map((group) => {
                    const width = (group.count / max) * 100;

                    return `
                    <div class="status-row">
                        <span>${group.label}</span>
                        <div class="status-track">
                            <div class="status-fill ${group.css}"
                                 style="width:${width}%"></div>
                        </div>
                        <strong>${group.count}</strong>
                    </div>
                `;
                })
                .join("")}
        </div>
    `;
}

/* =====================================================
   ALERTAS DE ESTOQUE
===================================================== */

function renderAlerts() {
    const container = el("alertsList");
    if (!container) return;

    const products = new Map();

    state.stock.forEach((item) => {
        const id = getValue(
            item,
            ["produtoID", "ProdutoID", "codigo", "Codigo", "id", "ID"],
            "",
        );

        const name = getValue(
            item,
            ["produto", "Produto", "nomeProduto", "nome", "Nome"],
            "Item sem nome",
        );

        const key = String(id !== "" ? id : name).trim();

        if (!products.has(key)) {
            products.set(key, {
                name,
                available: 0,
                hasAvailable: false,
                total: 0,
                reserved: 0,
                unavailable: 0,
                status: "",
            });
        }

        const product = products.get(key);

        product.total += numberValue(
            getValue(item, ["quantidade", "Quantidade", "total"], 0),
        );

        product.reserved += numberValue(
            getValue(
                item,
                ["reservado", "Reservado", "quantidadeReservada"],
                0,
            ),
        );

        product.unavailable += numberValue(
            getValue(
                item,
                ["indisponivel", "Indisponivel", "quantidadeIndisponivel"],
                0,
            ),
        );

        const availableValue = getValue(
            item,
            ["disponivel", "Disponivel", "quantidadeDisponivel"],
            null,
        );

        if (availableValue !== null) {
            product.available += numberValue(availableValue);
            product.hasAvailable = true;
        }

        product.status = getValue(item, ["status", "Status"], "");
    });

    const alerts = [];

    products.forEach((product) => {
        const available = product.hasAvailable
            ? product.available
            : Math.max(
                  0,
                  product.total - product.reserved - product.unavailable,
              );

        const status = normalizeText(product.status);

        if (available <= 0 || /indisponivel|esgotado/.test(status)) {
            alerts.push({
                title: "Item sem disponibilidade",
                detail: `${product.name}: nenhuma unidade disponível.`,
                type: "red",
            });
        } else if (available <= 3) {
            alerts.push({
                title: "Estoque baixo",
                detail: `${product.name}: restam ${formatNumber(available)} unidade(s).`,
                type: "",
            });
        }
    });

    if (!alerts.length) {
        container.innerHTML =
            '<p class="empty-state">Nenhum alerta de estoque identificado.</p>';
        return;
    }

    container.innerHTML = alerts
        .slice(0, 8)
        .map(
            (alert) => `
        <div class="alert-item">
            <div class="alert-icon ${alert.type}">
                <i class="fa-solid fa-triangle-exclamation"></i>
            </div>
            <div>
                <strong>${escapeHTML(alert.title)}</strong>
                <small>${escapeHTML(alert.detail)}</small>
            </div>
        </div>
    `,
        )
        .join("");
}

function renderRecentRequests() {
    const container = el("recentRequests");
    if (!container) return;

    const rows = state.requests.slice().reverse().slice(0, 5);

    if (!rows.length) {
        container.innerHTML =
            '<p class="empty-state">Nenhuma solicitação encontrada.</p>';
        return;
    }

    container.innerHTML = rows
        .map(
            (item) => `
        <div class="recent-item">
            <strong>${escapeHTML(
                getValue(item, ["produto", "Produto", "nomeProduto", "item"]),
            )}</strong>
            <small>
                ${escapeHTML(
                    getValue(item, [
                        "solicitante",
                        "Solicitante",
                        "nomeUsuario",
                        "usuario",
                    ]),
                )}
                · Quantidade: ${escapeHTML(
                    getValue(item, ["quantidade", "Quantidade"]),
                )}
            </small>
            ${statusBadge(getValue(item, ["status", "Status"], "Pendente"))}
        </div>
    `,
        )
        .join("");
}

/* =====================================================
   RENDERIZAÇÃO GERAL
===================================================== */

function renderAll() {
    renderIdentity();
    renderStats();
    renderRecentMoves();
    renderStock(el("stockSearch")?.value || "");
    renderMovements(el("moveSearch")?.value || "");
    renderRequests();

    renderRecentRequests();

    renderCategoryChart();
    renderWeeklyChart();
    renderRequestStatusChart();
    renderAlerts();
}

/* =====================================================
   CARREGAR DADOS DA API
===================================================== */

async function carregarPainel() {
    hideNotice();

    const refreshButton = el("refreshButton");

    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.classList.add("loading");
    }

    try {
        const response = await fetch(`${API_BASE}/responsavel/dashboard`, {
            method: "GET",
            credentials: "include",
            headers: {
                Accept: "application/json",
            },
        });

        const contentType = response.headers.get("content-type") || "";

        if (!contentType.includes("application/json")) {
            throw new Error(
                "A API não retornou JSON. Verifique a rota e a sessão de login.",
            );
        }

        const data = await response.json();

        if (!response.ok || data.sucesso === false) {
            throw new Error(
                data.mensagem || data.erro || `Erro HTTP ${response.status}`,
            );
        }

        state.user = data.usuario || null;
        state.sector = data.setor || null;

        atualizarTituloSetor(state.sector);

        state.stock = Array.isArray(data.estoque) ? data.estoque : [];

        state.movements = Array.isArray(data.movimentacoes)
            ? data.movimentacoes
            : [];

        state.requests = Array.isArray(data.solicitacoes)
            ? data.solicitacoes
            : [];

        renderAll();

        const updated = new Date().toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
        });

        setText("lastUpdated", `Atualizado às ${updated}`);
    } catch (error) {
        console.error("Erro ao carregar painel:", error);

        showNotice(
            `Não foi possível carregar os dados: ${error.message}`,
            true,
        );
    } finally {
        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.classList.remove("loading");
        }
    }
}

/* =====================================================
   EVENTOS DA INTERFACE
===================================================== */

function iniciarEventos() {
    document.querySelectorAll(".nav").forEach((button) => {
        button.addEventListener("click", () => {
            openPage(button.dataset.page);
        });
    });

    document.querySelectorAll("[data-go]").forEach((button) => {
        button.addEventListener("click", () => {
            openPage(button.dataset.go);
        });
    });

    el("refreshButton")?.addEventListener("click", carregarPainel);

    el("stockSearch")?.addEventListener("input", (event) => {
        renderStock(event.target.value);
    });

    el("moveSearch")?.addEventListener("input", (event) => {
        renderMovements(event.target.value);
    });

    el("logoutButton")?.addEventListener("click", () => {
        const logoutUrl = window.RESPONSAVEL_API?.logoutUrl;

        if (logoutUrl) {
            window.location.href = logoutUrl;
        } else {
            showNotice(
                "A saída ainda precisa ser ligada à rota de logout do sistema.",
            );
        }
    });

    el("sidebarToggle")?.addEventListener("click", () => {
        document.body.classList.toggle("sidebar-collapsed");
    });

    el("menuButton")?.addEventListener("click", () => {
        document.body.classList.toggle("mobile-menu-open");
    });

    el("stockCategoryFilter")?.addEventListener("change", () => {
        renderStock(el("stockSearch")?.value || "");
    });

    el("stockStatusFilter")?.addEventListener("change", () => {
        renderStock(el("stockSearch")?.value || "");
    });

    el("requestRows")?.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        executarAcaoReserva(button.dataset.action, button.dataset.id);
    });
}

/* =====================================================
   INICIALIZAÇÃO
===================================================== */

document.addEventListener("DOMContentLoaded", () => {
    iniciarEventos();
    updateClock();
    setInterval(updateClock, 1000);
    carregarPainel();
});

function atualizarTituloSetor(setor) {
    const titulo = document.getElementById("heroSector");
    if (!titulo) return;

    const nome =
        typeof setor === "string"
            ? setor.trim()
            : String(
                  setor?.nome ??
                      setor?.Nome ??
                      setor?.setor ??
                      setor?.Setor ??
                      setor?.descricao ??
                      setor?.Descricao ??
                      "",
              ).trim();

    const normalizado = nome.toLocaleLowerCase("pt-BR");

    if (normalizado.includes("lab") && normalizado.includes("infor")) {
        titulo.textContent = "PAINEL LABORATÓRIO DE INFORMÁTICA";
    } else {
        titulo.textContent = nome
            ? `PAINEL ${nome.toLocaleUpperCase("pt-BR")}`
            : "PAINEL DO SETOR";
    }
}
