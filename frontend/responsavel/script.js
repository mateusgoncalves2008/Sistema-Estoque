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
    bloqueios: [
        "Bloqueios por setor",
        "Gerencie o acesso às reservas dos itens vinculados ao seu setor.",
    ],
    denuncias: [
        "Denúncias",
        "Consulte as denúncias encaminhadas à Secretaria.",
    ],
    perfil: ["Meu Perfil", "Consulte e atualize seus dados pessoais."],
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

function confirmarAcaoEscolar(mensagem) {
    const dialog = el("schoolConfirmDialog");
    const texto = el("schoolConfirmMessage");
    const aceitar = el("schoolConfirmAccept");
    const cancelar = el("schoolConfirmCancel");

    if (!dialog || !texto || !aceitar || !cancelar) {
        return Promise.resolve(window.confirm(mensagem));
    }

    texto.textContent = mensagem;
    dialog.showModal();

    return new Promise((resolve) => {
        const finalizar = (resultado) => {
            dialog.close();
            aceitar.removeEventListener("click", confirmar);
            cancelar.removeEventListener("click", negar);
            dialog.removeEventListener("cancel", cancelarDialogo);
            resolve(resultado);
        };
        const confirmar = () => finalizar(true);
        const negar = () => finalizar(false);
        const cancelarDialogo = (evento) => {
            evento.preventDefault();
            finalizar(false);
        };

        aceitar.addEventListener("click", confirmar);
        cancelar.addEventListener("click", negar);
        dialog.addEventListener("cancel", cancelarDialogo);
    });
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

    if (page === "bloqueios" || page === "denuncias") {
        carregarBloqueiosDenuncias();
    }
    if (page === "perfil") {
        carregarPerfil();
    }

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

    // Na tela inicial, oculta o cabeçalho textual; nas demais páginas, mantém os títulos.
    el("pageHeading")?.classList.toggle("hidden", page === "inicio" || page === "bloqueios" || page === "denuncias");

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
    const roleValue = String(state.user?.tipoUsuario || state.user?.tipo || state.user?.perfil || "Responsável").trim();
    const roleKey = roleValue.toUpperCase();
    const accountRole = roleKey === "LIDER" || roleKey === "RESPONSAVEL"
        ? "Responsável"
        : roleKey === "ADMIN" || roleKey === "ADM" || roleKey === "ADMINISTRADOR"
            ? "Administrador"
            : roleKey === "ALUNO"
                ? "Aluno"
                : roleKey === "PROFESSOR"
                    ? "Professor"
                    : roleValue.charAt(0).toLocaleUpperCase("pt-BR") + roleValue.slice(1).toLocaleLowerCase("pt-BR");
    setText("sidebarAccountName", name);
    setText("sidebarAccountRole", accountRole);
    setText("sidebarAccountAvatar", String(name).trim().charAt(0).toUpperCase() || "U");
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

/* Cadastro de item e criação automática do registro de estoque. */
let opcoesCadastroItem = { categorias: [], subcategorias: [] };
async function carregarOpcoesCadastroItem() {
 const categoriaSelect=el("newItemCategory"), subcategoriaSelect=el("newItemSubcategory");
 if(!categoriaSelect||!subcategoriaSelect) return;
 try {
  const response=await fetch(API_BASE+"/responsavel/itens/opcoes",{credentials:"include",headers:{Accept:"application/json"}});
  const data=await response.json();
  if(!response.ok||!data.sucesso) throw new Error(data.mensagem||"Não foi possível carregar categorias.");
  opcoesCadastroItem=data;
  categoriaSelect.innerHTML='<option value="">Selecione uma categoria</option>'+data.categorias.map(i=>'<option value="'+escapeHTML(i.id)+'">'+escapeHTML(i.nome)+'</option>').join("");
  atualizarSubcategoriasCadastroItem();
 } catch(erro) { categoriaSelect.innerHTML='<option value="">Erro ao carregar categorias</option>'; showNotice(erro.message||"Erro ao carregar opções.",true); }
}
function atualizarSubcategoriasCadastroItem() {
 const categoriaID=el("newItemCategory")?.value||"", select=el("newItemSubcategory");
 if(!select) return;
 const lista=opcoesCadastroItem.subcategorias.filter(i=>i.categoriaID===categoriaID);
 select.innerHTML='<option value="">'+(categoriaID?"Selecione uma subcategoria":"Selecione uma categoria primeiro")+'</option>'+lista.map(i=>'<option value="'+escapeHTML(i.id)+'">'+escapeHTML(i.nome)+'</option>').join("");
 select.disabled=!categoriaID||lista.length===0;
 if(categoriaID&&!lista.length) select.innerHTML='<option value="">Nenhuma subcategoria ativa nesta categoria</option>';
}
function configurarFechamentoCadastroItem() {
 const dialog=el("newItemDialog");
 if(!dialog || dialog.dataset.clickOutsideConfigured==="true") return;
 dialog.dataset.clickOutsideConfigured="true";
 dialog.addEventListener("click", event => {
  if(event.target===dialog) dialog.close();
 });
 dialog.addEventListener("click", event => {
  const rect=dialog.getBoundingClientRect();
  const clicouForaDoConteudo=event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom;
  if(clicouForaDoConteudo) dialog.close();
 });
}
function abrirCadastroItem() {
 const dialog=el("newItemDialog"), form=el("newItemForm");
 if(!dialog||!form) return;
 form.reset(); opcoesCadastroItem={categorias:[],subcategorias:[]};
 if(el("newItemCategory")) el("newItemCategory").innerHTML='<option value="">Carregando categorias...</option>';
 if(el("newItemSubcategory")) {el("newItemSubcategory").innerHTML='<option value="">Selecione uma categoria primeiro</option>';el("newItemSubcategory").disabled=true;}
 if(typeof dialog.showModal==="function") dialog.showModal(); else {showNotice("Seu navegador não suporta o formulário.",true);return;}
 configurarFechamentoCadastroItem();
 carregarOpcoesCadastroItem();
}
async function salvarNovoItem(event) {
 event.preventDefault();
 const form=el("newItemForm"), botao=el("saveNewItemButton");
 if(!form||!botao) return;
 const payload=Object.fromEntries(new FormData(form).entries());
 payload.quantidade=Number(payload.quantidade); payload.estoqueMinimo=Number(payload.estoqueMinimo);
 botao.disabled=true;
 try {
  const response=await fetch(API_BASE+"/responsavel/itens",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(payload)});
  const data=await response.json();
  if(!response.ok||!data.sucesso) throw new Error(data.mensagem||"Não foi possível cadastrar o item.");
  el("newItemDialog")?.close(); showNotice(data.mensagem||"Item cadastrado com sucesso."); await carregarPainel(); openPage("estoque");
 } catch(erro) {showNotice(erro.message||"Erro ao cadastrar item.",true);}
 finally {botao.disabled=false;}
}

function abrirDialogAcaoEstoque(estoqueID, acao) {
    const dialog = el("stockActionDialog");
    const form = el("stockActionForm");
    if (!dialog || !form || !estoqueID || !["entrada", "saida", "desativar"].includes(acao)) {
        showNotice("Não foi possível abrir a ação do estoque.", true);
        return;
    }

    form.reset();
    dialog.dataset.estoqueId = estoqueID;
    dialog.dataset.acao = acao;
    const quantidadeWrap = el("stockActionQuantityWrap");
    const motivoWrap = el("stockActionReasonWrap");
    const warning = el("stockActionWarning");
    const title = el("stockActionTitle");
    const description = el("stockActionDescription");
    const submit = el("stockActionSubmit");
    const desativar = acao === "desativar";

    quantidadeWrap.hidden = desativar;
    motivoWrap.hidden = desativar;
    el("stockActionQuantity").required = !desativar;
    el("stockActionReason").required = !desativar;

    if (desativar) {
        title.textContent = "Desativar item neste setor";
        description.textContent = "Confirme a desativação deste item no seu setor.";
        warning.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> As quantidades e o histórico serão preservados. O item ficará indisponível neste setor.';
        submit.innerHTML = '<i class="fa-solid fa-ban"></i> Desativar item';
        submit.classList.add("danger-action");
    } else {
        title.textContent = acao === "entrada" ? "Aumentar estoque" : "Diminuir estoque";
        description.textContent = acao === "entrada" ? "Registre a entrada de unidades no seu setor." : "Registre a saída de unidades do seu setor.";
        warning.innerHTML = '<i class="fa-solid fa-circle-info"></i> A movimentação será registrada no histórico do setor.';
        submit.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar';
        submit.classList.remove("danger-action");
    }

    dialog.showModal();
}

async function executarAcaoEstoque(event) {
    event.preventDefault();
    const dialog = el("stockActionDialog");
    const form = el("stockActionForm");
    const submit = el("stockActionSubmit");
    if (!dialog || !form || !submit) return;

    const estoqueID = dialog.dataset.estoqueId;
    const acao = dialog.dataset.acao;
    let payload;
    if (acao === "entrada" || acao === "saida") {
        const quantidade = Number(el("stockActionQuantity").value);
        const motivo = el("stockActionReason").value.trim();
        if (!Number.isSafeInteger(quantidade) || quantidade <= 0) {
            showNotice("Informe uma quantidade inteira maior que zero.", true);
            return;
        }
        if (!motivo) {
            showNotice("O motivo é obrigatório.", true);
            return;
        }
        payload = { operacao: acao, quantidade, motivo };
    } else if (acao !== "desativar") {
        return;
    }

    submit.disabled = true;
    try {
        const response = await fetch(
            `${API_BASE}/responsavel/estoque/${encodeURIComponent(estoqueID)}/${acao === "desativar" ? "desativar" : "ajustar"}`,
            {
                method: acao === "desativar" ? "PATCH" : "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: acao === "desativar" ? undefined : JSON.stringify(payload),
            },
        );
        const data = await response.json();
        if (!response.ok || data.sucesso === false) {
            throw new Error(data.mensagem || data.erro || `Erro HTTP ${response.status}`);
        }
        dialog.close();
        showNotice(data.mensagem || "Estoque atualizado.");
        await carregarPainel();
    } catch (error) {
        showNotice(error.message || "Não foi possível atualizar o estoque.", true);
    } finally {
        submit.disabled = false;
    }
}

/* =====================================================
   TABELA DE ESTOQUE
===================================================== */

function renderStock(filter = "") {
    const container = el("stockRows");
    if (!container) return;

    const categoriaSelecionada = el("stockCategoryFilter")?.value || "";
    const statusSelecionado = el("stockStatusFilter")?.value || "";
    const categorias = [...new Set(state.stock.map(item => getValue(item, ["categoria", "Categoria"], "")).filter(Boolean))];
    const status = [...new Set(state.stock.map(item => getValue(item, ["statusLocal", "StatusLocal", "status", "Status"], "ATIVO")).filter(Boolean))];

    const preencherFiltro = (id, valores, selecionado, titulo) => {
        const select = el(id);
        if (!select) return;
        select.innerHTML = `<option value="">${titulo}</option>` + valores.map(valor => `<option value="${escapeHTML(valor)}">${escapeHTML(valor)}</option>`).join("");
        select.value = selecionado;
    };
    preencherFiltro("stockCategoryFilter", categorias, categoriaSelecionada, "Todas as categorias");
    preencherFiltro("stockStatusFilter", status, statusSelecionado, "Todos os status");

    const busca = normalizeText(filter);
    const rows = state.stock.filter(item => {
        const codigo = normalizeText(getValue(item, ["codigo", "Codigo", "produtoID", "ProdutoID", "estoqueID"], ""));
        const produto = normalizeText(getValue(item, ["produto", "Produto", "nome", "Nome", "nomeProduto"], ""));
        const categoria = getValue(item, ["categoria", "Categoria"], "");
        const situacao = getValue(item, ["statusLocal", "StatusLocal", "status", "Status"], "ATIVO");
        return (!busca || codigo.includes(busca) || produto.includes(busca) || normalizeText(categoria).includes(busca))
            && (!categoriaSelecionada || categoria === categoriaSelecionada)
            && (!statusSelecionado || situacao === statusSelecionado);
    });

    if (!rows.length) {
        container.innerHTML = '<div class="stock-empty"><i class="fa-solid fa-box-open"></i><strong>Nenhum item encontrado</strong><span>Tente alterar a busca ou os filtros.</span></div>';
        return;
    }

    container.innerHTML = rows.map(item => {
        const nome = getValue(item, ["produto", "Produto", "nome", "Nome", "nomeProduto"], "Item sem nome");
        const categoriaItem = getValue(item, ["categoria", "Categoria"], "");
        const textoItem = normalizeText(`${nome} ${categoriaItem}`);
        const iconeItem = /computador|desktop|notebook|laptop|pc gamer|microcomputador|informatica/.test(textoItem) ? "fa-desktop" : "fa-box";
        const codigo = getValue(item, ["codigo", "Codigo", "produtoID", "ProdutoID", "estoqueID"], "—");
        const total = numberValue(getValue(item, ["quantidade", "Quantidade", "total"], 0));
        const disponivel = numberValue(getValue(item, ["disponivel", "Disponivel", "quantidadeDisponivel"], 0));
        const localStatus = String(getValue(item, ["statusLocal", "StatusLocal", "status", "Status"], "ATIVO"));
        const inativo = normalizeText(localStatus) === "inativo";
        const estoqueId = escapeHTML(getValue(item, ["estoqueID", "EstoqueID"], ""));
        return `
        <article class="stock-item-card ${inativo ? "is-inactive" : ""}">
            <div class="stock-card-main">
                <div class="stock-card-icon"><i class="fa-solid ${iconeItem}"></i></div>
                <div class="stock-card-info">
                    <div class="stock-card-title-row"><h3>${escapeHTML(nome)}</h3><span class="stock-state ${inativo ? "inactive" : "active"}"><span></span>${inativo ? "Inativo" : "Ativo"}</span></div>
                    <p class="stock-code"><i class="fa-solid fa-barcode"></i> Código: <strong>${escapeHTML(codigo)}</strong></p>
                    <div class="stock-card-metrics"><span><i class="fa-solid fa-cubes-stacked"></i> Total: <strong>${formatNumber(total)}</strong></span><span class="stock-metric-available"><i class="fa-solid fa-circle-check"></i> Disponíveis: <strong>${formatNumber(disponivel)}</strong></span></div>
                    <div class="stock-card-category"><i class="fa-solid fa-tag"></i> ${escapeHTML(getValue(item, ["categoria", "Categoria"], "Sem categoria"))}</div>
                </div>
            </div>
            <div class="stock-card-actions">
                ${inativo ? '<span class="stock-inactive-note"><i class="fa-solid fa-ban"></i> Item desativado neste setor</span>' : `
                    <button type="button" class="stock-action increase" data-stock-action="entrada" data-id="${estoqueId}"><i class="fa-solid fa-plus"></i><span>Aumentar</span></button>
                    <button type="button" class="stock-action decrease" data-stock-action="saida" data-id="${estoqueId}"><i class="fa-solid fa-minus"></i><span>Diminuir</span></button>
                    <button type="button" class="stock-action deactivate" data-stock-action="desativar" data-id="${estoqueId}"><i class="fa-solid fa-ban"></i><span>Desativar</span></button>
                `}
            </div>
        </article>`;
    }).join("");
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
    if (!(await confirmarAcaoEscolar(confirmacoes[acao]))) return;

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

async function carregarPainel(silencioso = false) {
    if (!silencioso) hideNotice();

    const refreshButton = el("refreshButton");

    if (!silencioso && refreshButton) {
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

        const estadoAnterior = silencioso
            ? JSON.stringify({
                  user: state.user,
                  sector: state.sector,
                  stock: state.stock,
                  movements: state.movements,
                  requests: state.requests,
              })
            : null;

        state.user = data.usuario || null;
        state.sector = data.setor || null;
        state.stock = Array.isArray(data.estoque) ? data.estoque : [];
        state.movements = Array.isArray(data.movimentacoes)
            ? data.movimentacoes
            : [];
        state.requests = Array.isArray(data.solicitacoes)
            ? data.solicitacoes
            : [];

        atualizarTituloSetor(state.sector);

        const estadoAtual = JSON.stringify({
            user: state.user,
            sector: state.sector,
            stock: state.stock,
            movements: state.movements,
            requests: state.requests,
        });
        const dadosMudaram = estadoAnterior !== estadoAtual;

        // Evita reconstruir o painel se a consulta trouxe os mesmos dados.
        if (!silencioso || dadosMudaram) renderAll();

        const updated = new Date().toLocaleTimeString("pt-BR", {
            hour12: false,
        });

        if (silencioso) {
            console.info(`[ATUALIZAÇÃO AUTOMÁTICA] Painel atualizado às ${updated}`);
        } else {
            setText("lastUpdated", `Atualizado às ${updated.slice(0, 5)}`);
        }
    } catch (error) {
        console.error("Erro ao carregar painel:", error);

        if (!silencioso) showNotice(
            `Não foi possível carregar os dados: ${error.message}`,
            true,
        );
    } finally {
        if (!silencioso && refreshButton) {
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

    el("profileBirthDate")?.addEventListener("change", atualizarIdadePerfil);
    el("profileCPF")?.addEventListener("input", (event) => {
        const digits = event.target.value.replace(/\D/g, "").slice(0, 11);
        event.target.value = digits
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    });
    el("profilePhone")?.addEventListener("input", (event) => {
        const digits = event.target.value.replace(/\D/g, "").slice(0, 11);
        event.target.value =
            digits.length > 10
                ? digits.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3")
                : digits.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
    });

    el("openNewItemButton")?.addEventListener("click", abrirCadastroItem);
    el("closeNewItemButton")?.addEventListener("click", () => el("newItemDialog")?.close());
    el("cancelNewItemButton")?.addEventListener("click", () => el("newItemDialog")?.close());
    el("newItemCategory")?.addEventListener("change", atualizarSubcategoriasCadastroItem);
    el("newItemForm")?.addEventListener("submit", salvarNovoItem);

    el("stockSearch")?.addEventListener("input", (event) => {
        renderStock(event.target.value);
    });

    el("moveSearch")?.addEventListener("input", (event) => {
        renderMovements(event.target.value);
    });

    el("logoutButton")?.addEventListener("click", async () => {
        const botao = el("logoutButton");
        botao.disabled = true;

        try {
            const resposta = await fetch("/api/logout", {
                method: "POST",
                credentials: "include",
                headers: { Accept: "application/json" },
            });

            const resultado = await resposta.json();

            if (!resposta.ok || !resultado.sucesso) {
                throw new Error("Não foi possível encerrar a sessão.");
            }

            window.location.replace("/");
        } catch (erro) {
            showNotice(erro.message || "Erro ao sair do sistema.", true);
            botao.disabled = false;
        }
    });

    const sidebarToggle = el("btnSidebarToggle");
    const atualizarIconeSidebarResponsavel = () => {
        if (!sidebarToggle) return;
        const recolhido = document.body.classList.contains("sidebar-collapsed");
        sidebarToggle.innerHTML = recolhido
            ? '<i data-lucide="panel-left-open" aria-hidden="true"></i>'
            : '<i data-lucide="panel-left-close" aria-hidden="true"></i>';
        sidebarToggle.setAttribute("aria-label", recolhido ? "Expandir menu" : "Recolher menu");
        sidebarToggle.setAttribute("title", recolhido ? "Expandir menu" : "Recolher menu");
        if (window.lucide) window.lucide.createIcons();
    };
    if (localStorage.getItem("painelResponsavelSidebar") === "collapsed") {
        document.body.classList.add("sidebar-collapsed");
    }
    atualizarIconeSidebarResponsavel();
    sidebarToggle?.addEventListener("click", () => {
        const recolhido = document.body.classList.toggle("sidebar-collapsed");
        localStorage.setItem("painelResponsavelSidebar", recolhido ? "collapsed" : "expanded");
        atualizarIconeSidebarResponsavel();
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

    el("stockRows")?.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-stock-action]");
        if (!button || button.disabled) return;
        abrirDialogAcaoEstoque(button.dataset.id, button.dataset.stockAction);
    });

    el("stockActionClose")?.addEventListener("click", () => el("stockActionDialog")?.close());
    el("stockActionCancel")?.addEventListener("click", () => el("stockActionDialog")?.close());
    el("stockActionForm")?.addEventListener("submit", executarAcaoEstoque);
    el("stockActionDialog")?.addEventListener("click", (event) => {
        const dialog = el("stockActionDialog");
        if (event.target === dialog) dialog.close();
    });

    el("requestRows")?.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        executarAcaoReserva(button.dataset.action, button.dataset.id);
    });

    el("blockedUserSearch")?.addEventListener("input", renderBloqueios);
    el("reportSearch")?.addEventListener("input", renderDenuncias);

    el("blockRows")?.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-bloqueio-id]");
        if (!button || button.disabled) return;

        const bloqueioID = button.dataset.bloqueioId;
        const nome = button.dataset.usuarioNome || "este usuário";
        if (!bloqueioID) {
            showNotice("Não foi possível identificar o bloqueio.", true);
            return;
        }
        if (!(await confirmarAcaoEscolar("Deseja desbloquear " + nome + " neste setor?")))
            return;

        button.disabled = true;
        try {
            const response = await fetch(
                API_BASE +
                    "/responsavel/bloqueios/" +
                    encodeURIComponent(bloqueioID) +
                    "/desbloquear",

                {
                    method: "PATCH",
                    credentials: "include",
                    headers: { Accept: "application/json" },
                },
            );
            const data = await response.json();
            if (!response.ok || !data.sucesso) {
                throw new Error(
                    data.mensagem || "Não foi possível desbloquear o usuário.",
                );
            }
            showNotice(data.mensagem || "Usuário desbloqueado neste setor.");
            await carregarBloqueiosDenuncias();
        } catch (error) {
            showNotice(error.message || "Erro ao desbloquear usuário.", true);
        } finally {
            button.disabled = false;
        }
    });

    el("newBlockButton")?.addEventListener("click", () => {
        abrirFormulario("bloqueio");
    });

    el("newReportButton")?.addEventListener("click", () => {
        abrirFormulario("denuncia");
    });
}

/* =====================================================
   BLOQUEIOS E DENÚNCIAS
===================================================== */

state.bloqueios = [];
state.denuncias = [];

async function carregarBloqueiosDenuncias() {
    try {
        const response = await fetch(
            `${API_BASE}/responsavel/bloqueios-denuncias`,
            {
                credentials: "include",
                headers: { Accept: "application/json" },
            },
        );

        const data = await response.json();

        if (!response.ok || !data.sucesso) {
            throw new Error(data.mensagem || "Erro ao carregar registros.");
        }

        state.bloqueios = data.bloqueios || [];
        state.denuncias = data.denuncias || [];

        renderBloqueios();
        renderDenuncias();

        setText(
            "totalBloqueados",
            state.bloqueios.filter(
                (item) => String(item[9] || "").toUpperCase() === "ATIVO",
            ).length,
        );

        setText("totalDenuncias", state.denuncias.length);
    } catch (error) {
        showNotice(
            error.message || "Erro ao carregar bloqueios e denúncias.",
            true,
        );
    }
}

function renderBloqueios() {
    const tbody = el("blockRows");
    if (!tbody) return;

    const busca = normalizeText(el("blockedUserSearch")?.value || "");

    const registros = state.bloqueios.filter((item) =>
        normalizeText(
            `${item[6] || ""} ${item[7] || ""} ${item[8] || ""}`,
        ).includes(busca),
    );

    if (!registros.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="empty">
                    <div class="bd-empty">
                        <i class="fa-solid fa-shield-halved"></i>
                        <strong>Nenhum bloqueio encontrado</strong>
                        <span>Os registros aparecerão aqui quando existirem.</span>
                    </div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = registros
        .map((item) => {
            const nome = escapeHTML(item[7] || "Usuário não identificado");
            const id = escapeHTML(item[6] || "—");
            const motivo = escapeHTML(item[8] || "Não informado");
            const data = escapeHTML(formatDate(item[1]));
            const status = String(item[9] || "Não informado");
            const ativo = normalizeText(status) === "ativo";

            return `
            <tr>
                <td>
                    <div class="bd-user">
                        <span class="bd-avatar">
                            <i class="fa-solid fa-user"></i>
                        </span>
                        <div>
                            <strong>${nome}</strong>
                            <small>Usuário do setor</small>
                        </div>
                    </div>
                </td>
                <td><span class="bd-id">${id}</span></td>
                <td>${motivo}</td>
                <td>${data}</td>
                <td>
                    <span class="bd-status ${ativo ? "ativo" : "inativo"}">
                        <i class="fa-solid ${ativo ? "fa-circle-check" : "fa-circle-minus"}"></i>
                        ${escapeHTML(status)}
                    </span>
                </td>
                <td>
                    ${
                        ativo
                            ? `<button type="button" class="bd-unblock-button" data-bloqueio-id="${escapeHTML(item[0] || "")}" data-usuario-nome="${nome}" title="Desbloquear usuário">
                                  <i class="fa-solid fa-lock-open"></i>
                                  Desbloquear
                              </button>`
                            : `<span class="bd-action-info" title="Bloqueio inativo">
                                  <i class="fa-solid fa-shield-halved"></i>
                              </span>`
                    }
                </td>
            </tr>`;
        })
        .join("");
}

function renderDenuncias() {
    const tbody = el("reportRows");
    if (!tbody) return;

    const busca = normalizeText(el("reportSearch")?.value || "");
    const registros = state.denuncias.filter((item) =>
        normalizeText(
            [item[1], item[7], item[8], item[9], item[10]].join(" "),
        ).includes(busca),
    );

    if (!registros.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty">
                    <div class="bd-empty">
                        <i class="fa-solid fa-flag"></i>
                        <strong>${busca ? "Nenhuma denúncia encontrada" : "Nenhuma denúncia registrada"}</strong>
                        <span>${busca ? "Tente buscar por outro termo." : "As denúncias registradas aparecerão aqui."}</span>
                    </div>
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = registros
        .map((item) => {
            const data = escapeHTML(formatDate(item[1]));
            const nome = escapeHTML(item[7] || "Não identificado");
            const motivo = escapeHTML(item[8] || "Não informado");
            const descricao = escapeHTML(item[9] || "Sem descrição");
            const status = escapeHTML(item[10] || "Pendente");
            const statusNormalizado = normalizeText(status);

            let classe = "pendente";
            let icone = "fa-clock";

            if (
                statusNormalizado.includes("resolvida") ||
                statusNormalizado.includes("concluida") ||
                statusNormalizado.includes("aprovada")
            ) {
                classe = "ativo";
                icone = "fa-circle-check";
            } else if (
                statusNormalizado.includes("recusada") ||
                statusNormalizado.includes("cancelada")
            ) {
                classe = "inativo";
                icone = "fa-circle-xmark";
            }

            return `
            <tr>
                <td>${data}</td>
                <td>
                    <div class="bd-user">
                        <span class="bd-avatar">
                            <i class="fa-solid fa-user"></i>
                        </span>
                        <div>
                            <strong>${nome}</strong>
                            <small>Usuário denunciado</small>
                        </div>
                    </div>
                </td>
                <td>${motivo}</td>
                <td class="bd-description">${descricao}</td>
                <td>
                    <span class="bd-status ${classe}">
                        <i class="fa-solid ${icone}"></i>
                        ${status}
                    </span>
                </td>
            </tr>`;
        })
        .join("");
}

document.addEventListener("DOMContentLoaded", () => {
    iniciarEventos();
    updateClock();
    setInterval(updateClock, 1000);
    carregarPainel();
    criarBotaoAvisosResponsavel();
    carregarAvisosResponsavel();

    // Atualiza em segundo plano somente quando a interface está livre.
    let atualizacaoSilenciosaResponsavelEmAndamento = false;
    window.setInterval(async () => {
        if (atualizacaoSilenciosaResponsavelEmAndamento || document.visibilityState !== "visible") return;
        const ativo = document.activeElement;
        if (ativo?.matches("input, textarea, select, [contenteditable='true']")) return;
        if (document.querySelector('dialog[open], [role="dialog"]:not([hidden]), .modal.show, .modal.aberto')) return;
        if (document.querySelector("form [aria-busy='true'], form button:disabled")) return;
        atualizacaoSilenciosaResponsavelEmAndamento = true;
        try { await carregarPainel(true); }
        finally { atualizacaoSilenciosaResponsavelEmAndamento = false; }
    }, 30000);
});

/* =====================================================
   INICIALIZAÇÃO
===================================================== */

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

function abrirFormulario(tipo) {
    const bloqueio = tipo === "bloqueio";

    const dialog = document.createElement("dialog");
    dialog.className = "bd-dialog";

    dialog.innerHTML = `
    <form id="registroForm" class="bd-form">
        <div class="bd-form-header">
            <span class="bd-form-icon">
                <i class="fa-solid ${bloqueio ? "fa-shield-halved" : "fa-flag"}"></i>
            </span>

            <div class="bd-form-title">
                <h2>${bloqueio ? "Bloquear usuário" : "Registrar denúncia"}</h2>
                <p>${
                    bloqueio
                        ? "Informe os dados para registrar o bloqueio."
                        : "Descreva a ocorrência para registrar a denúncia."
                }</p>
            </div>

            <button type="button" id="cancelarForm" class="bd-close"
                    aria-label="Fechar">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <div class="bd-form-body">
            <label for="bdUsuarioID">ID do usuário</label>
            <input id="bdUsuarioID" name="usuarioID" required
                   placeholder="Ex.: USU-0001" autocomplete="off">

            <label for="bdMotivo">Motivo</label>
            <input id="bdMotivo" name="motivo" required
                   minlength="${bloqueio ? 5 : 3}"
                   placeholder="Informe o motivo">

            ${
                bloqueio
                    ? ""
                    : `
                <label for="bdDescricao">Descrição da ocorrência</label>
                <textarea id="bdDescricao" name="descricao"
                          required minlength="10" rows="4"
                          placeholder="Descreva o que aconteceu..."></textarea>
            `
            }
        </div>

        <div class="bd-form-actions bd-form-actions-top">
            <button type="button" id="cancelarFormSecundario" class="bd-cancel">
                Cancelar
            </button>
            <button type="submit" class="bd-submit">
                <i class="fa-solid fa-paper-plane"></i>
                Enviar registro
            </button>
        </div>
    </form>
`;

    document.body.appendChild(dialog);
    dialog.showModal();

    const fechar = () => dialog.close();

    dialog.querySelector("#cancelarForm").onclick = fechar;
    dialog.querySelector("#cancelarFormSecundario").onclick = fechar;
    dialog.addEventListener("close", () => dialog.remove());

    dialog
        .querySelector("#registroForm")
        .addEventListener("submit", async (event) => {
            event.preventDefault();

            const form = event.currentTarget;
            const botao = form.querySelector('[type="submit"]');
            const campos = new FormData(form);

            const dados = bloqueio
                ? {
                      usuarioBloqueadoID: campos.get("usuarioID").trim(),
                      motivo: campos.get("motivo").trim(),
                  }
                : {
                      denunciadoID: campos.get("usuarioID").trim(),
                      motivo: campos.get("motivo").trim(),
                      descricao: campos.get("descricao").trim(),
                  };

            botao.disabled = true;
            botao.innerHTML =
                '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';

            try {
                const response = await fetch(
                    `${API_BASE}/responsavel/${bloqueio ? "bloqueios" : "denuncias"}`,
                    {
                        method: "POST",
                        credentials: "include",
                        headers: {
                            "Content-Type": "application/json",
                            Accept: "application/json",
                        },
                        body: JSON.stringify(dados),
                    },
                );

                const resultado = await response.json();

                if (!response.ok || !resultado.sucesso) {
                    throw new Error(
                        resultado.mensagem || "Não foi possível salvar.",
                    );
                }

                dialog.close();
                showNotice(resultado.mensagem || "Registro salvo com sucesso.");
                await carregarBloqueiosDenuncias();
            } catch (error) {
                showNotice(error.message || "Erro ao enviar os dados.", true);
            } finally {
                if (botao.isConnected) {
                    botao.disabled = false;
                    botao.innerHTML =
                        '<i class="fa-solid fa-paper-plane"></i> Enviar registro';
                }
            }
        });
}

/* =====================================================
   MEU PERFIL
===================================================== */
function atualizarIdadePerfil() {
    const value = el("profileBirthDate")?.value;
    if (!value) {
        setText("profileAge", "");
        return;
    }
    const nascimento = new Date(value + "T12:00:00");
    const hoje = new Date();
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const aniversarioAindaNaoChegou =
        hoje.getMonth() < nascimento.getMonth() ||
        (hoje.getMonth() === nascimento.getMonth() &&
            hoje.getDate() < nascimento.getDate());

    if (aniversarioAindaNaoChegou) idade--;
    setText("profileAge", idade >= 0 && idade <= 120 ? String(idade) : "");
}

async function carregarPerfil() {
    try {
        const response = await fetch(`${API_BASE}/responsavel/perfil`, {
            method: "GET",
            credentials: "include",
            headers: { Accept: "application/json" },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.sucesso) {
            throw new Error(
                data.mensagem || "Não foi possível carregar seu perfil.",
            );
        }
        const perfil = data.perfil || {};
        setText("profileName", perfil.nome || "Meu perfil");
        setText("profileUserID", perfil.usuarioID || "—");
        setText("profileSector", perfil.setor || "—");
        setText("profileStatus", perfil.status || "—");
        el("profileFullName").value = perfil.nome || "";
        el("profileEmail").value = perfil.email || "";
        el("profileBirthDate").value = perfil.dataNascimento || "";
        el("profileCPF").value = formatarCPFPerfil(perfil.cpf || "");
        el("profilePhone").value = formatarTelefonePerfil(
            perfil.telefone || "",
        );
        el("profileRole").value = perfil.perfil || perfil.tipoUsuario || "";
        el("profileCreated").value = perfil.dataCadastro || "—";
        el("profileLastLogin").value = perfil.ultimoLogin || "—";
        atualizarIdadePerfil();
    } catch (error) {
        showNotice(error.message || "Erro ao carregar perfil.", true);
    }
}

function formatarCPFPerfil(value) {
    const digits = String(value || "")
        .replace(/\D/g, "")
        .slice(0, 11);
    return digits
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function formatarTelefonePerfil(value) {
    const digits = String(value || "")
        .replace(/\D/g, "")
        .slice(0, 11);
    return digits.length > 10
        ? digits.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3")
        : digits.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
}


/* ============================================================
   CENTRAL DE AVISOS DO RESPONSÁVEL PELO SETOR
============================================================ */
let avisosResponsavel = [];
let avisosLidosResponsavel = [];
let centralAvisosResponsavelAberta = false;

async function carregarAvisosResponsavel() {
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

        avisosResponsavel = Array.isArray(dadosAvisos.avisos) ? dadosAvisos.avisos : [];
        avisosLidosResponsavel = Array.isArray(dadosLeituras.avisosLidos) ? dadosLeituras.avisosLidos : [];
        renderizarAvisosResponsavel();
        atualizarContadorAvisosResponsavel();
    } catch (erro) {
        console.error("Erro ao carregar avisos do responsável:", erro);
        const lista = el("listaAvisosResponsavel");
        if (lista) lista.innerHTML = '<p class="avisos-vazio-responsavel">Não foi possível carregar os avisos. Atualize a página e tente novamente.</p>';
    }
}

async function registrarLeituraAvisoResponsavel(avisoID) {
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
    if (!avisosLidosResponsavel.includes(avisoID)) avisosLidosResponsavel.push(avisoID);
}

function atualizarContadorAvisosResponsavel() {
    const botao = el("botaoAvisosResponsavel");
    const contador = el("contadorAvisosResponsavel");
    if (!botao || !contador) return;
    const naoLidos = avisosResponsavel.filter((item) => !avisosLidosResponsavel.includes(item.id)).length;
    contador.textContent = naoLidos > 99 ? "99+" : String(naoLidos);
    contador.hidden = naoLidos === 0;
    botao.setAttribute("aria-label", naoLidos ? `Avisos. ${naoLidos} não lidos` : "Avisos");
}

function criarBotaoAvisosResponsavel() {
    if (el("botaoAvisosResponsavel")) return;
    const botao = document.createElement("button");
    botao.type = "button";
    botao.id = "botaoAvisosResponsavel";
    botao.className = "botao-avisos-responsavel";
    botao.title = "Avisos da escola";
    botao.setAttribute("aria-label", "Avisos");
    botao.innerHTML = '<i class="fa-solid fa-bell" aria-hidden="true"></i><span id="contadorAvisosResponsavel" class="contador-avisos-responsavel" hidden>0</span>';

    const central = document.createElement("section");
    central.id = "centralAvisosResponsavel";
    central.className = "central-avisos-responsavel";
    central.hidden = true;
    central.setAttribute("aria-label", "Central de avisos");
    central.innerHTML = `
        <div class="cabecalho-avisos-responsavel">
            <div><h2>Avisos da escola</h2><p>Comunicados destinados aos responsáveis pelos setores</p></div>
            <button type="button" id="fecharAvisosResponsavel" class="fechar-avisos-responsavel" aria-label="Fechar avisos">&times;</button>
        </div>
        <div class="acoes-avisos-responsavel"><button type="button" id="marcarAvisosLidosResponsavel">Marcar todos como lidos</button></div>
        <div id="listaAvisosResponsavel" class="lista-avisos-responsavel"><p class="avisos-vazio-responsavel">Carregando avisos...</p></div>
    `;
    document.body.append(botao, central);
    botao.addEventListener("click", alternarCentralAvisosResponsavel);
    central.querySelector("#fecharAvisosResponsavel").addEventListener("click", fecharCentralAvisosResponsavel);
    central.querySelector("#marcarAvisosLidosResponsavel").addEventListener("click", marcarTodosAvisosResponsavelComoLidos);
}

function alternarCentralAvisosResponsavel() {
    centralAvisosResponsavelAberta = !centralAvisosResponsavelAberta;
    const central = el("centralAvisosResponsavel");
    if (!central) return;
    central.hidden = !centralAvisosResponsavelAberta;
    if (centralAvisosResponsavelAberta) renderizarAvisosResponsavel();
}

function fecharCentralAvisosResponsavel() {
    centralAvisosResponsavelAberta = false;
    const central = el("centralAvisosResponsavel");
    if (central) central.hidden = true;
}

async function marcarTodosAvisosResponsavelComoLidos() {
    const pendentes = avisosResponsavel.filter((item) => !avisosLidosResponsavel.includes(item.id));
    try {
        await Promise.all(pendentes.map((item) => registrarLeituraAvisoResponsavel(item.id)));
        atualizarContadorAvisosResponsavel();
        renderizarAvisosResponsavel();
    } catch (erro) {
        console.error("Erro ao marcar avisos do responsável como lidos:", erro);
        showNotice("Não foi possível salvar a leitura dos avisos.", true);
    }
}

function renderizarAvisosResponsavel() {
    const lista = el("listaAvisosResponsavel");
    if (!lista) return;
    if (!avisosResponsavel.length) {
        lista.innerHTML = '<p class="avisos-vazio-responsavel">Nenhum aviso publicado para os responsáveis pelos setores.</p>';
        return;
    }

    lista.innerHTML = avisosResponsavel.map((item) => {
        const lido = avisosLidosResponsavel.includes(item.id);
        const prioridade = String(item.prioridade || "NORMAL").toUpperCase();
        const data = item.dataPublicacao ? new Date(item.dataPublicacao) : null;
        const dataTexto = data && !Number.isNaN(data.getTime()) ? data.toLocaleString("pt-BR") : "";
        return `
            <article class="aviso-responsavel ${lido ? "aviso-lido-responsavel" : "aviso-nao-lido-responsavel"}">
                <div class="aviso-responsavel-topo">
                    <strong>${escapeHTML(item.titulo || "Aviso")}</strong>
                    <span class="prioridade-aviso-responsavel ${prioridade === "URGENTE" ? "urgente" : ""}">${escapeHTML(prioridade)}</span>
                </div>
                <p>${escapeHTML(item.mensagem || "")}</p>
                <div class="aviso-responsavel-rodape">
                    <small>${escapeHTML(dataTexto)}</small>
                    ${lido ? '<span class="estado-aviso-responsavel">Lido</span>' : `<button type="button" data-aviso-lido-responsavel="${escapeHTML(item.id)}">Marcar como lido</button>`}
                </div>
            </article>
        `;
    }).join("");

    lista.querySelectorAll("[data-aviso-lido-responsavel]").forEach((botao) => {
        botao.addEventListener("click", async () => {
            botao.disabled = true;
            try {
                await registrarLeituraAvisoResponsavel(botao.dataset.avisoLidoResponsavel);
                atualizarContadorAvisosResponsavel();
                renderizarAvisosResponsavel();
            } catch (erro) {
                console.error("Erro ao marcar aviso como lido:", erro);
                showNotice("Não foi possível salvar a leitura do aviso.", true);
                botao.disabled = false;
            }
        });
    });
}
