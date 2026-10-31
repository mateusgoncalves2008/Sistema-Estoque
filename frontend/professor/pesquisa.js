// ============================================================
// PESQUISA DE ITENS — PAINEL DO PROFESSOR
// Lista todos os itens da planilha (todas as categorias),
// com filtros por grupo/subcategoria e busca por texto.
// As salas (categoria Laboratório, grupo "Salas") podem ser reservadas.
// ============================================================

const PESQUISA_API = "/api";

var ITENS_CATALOGO = [];
var GRUPOS_CATALOGO = [];
var PAGINA_PESQUISA_ATUAL = 1;
const ITENS_POR_PAGINA_PESQUISA = 20;

// Usuário logado (mesmo dado salvo pelo login)
var usuarioLogado =
    usuarioLogado ||
    JSON.parse(sessionStorage.getItem("usuarioLogado") || "null");

function escapeHtml(valor) {
    return String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function iconePesquisa(nome) {
    return `<i data-lucide="${nome}"></i>`;
}

function iconesPesquisa() {
    if (window.lucide) lucide.createIcons();
}

function showToast(mensagem) {
    if (typeof aviso === "function") aviso(mensagem);
}

function classeSituacao(codigo) {
    if (codigo === "DISPONIVEL") return "available";
    if (codigo === "EM_USO") return "loaned";
    if (codigo === "MANUTENCAO") return "maintenance";
    return "";
}

function iconeDoGrupo(grupo) {
    const mapa = {
        Salas: "door-open",
        Biblioteca: "book-open",
        Informática: "monitor",
        Audiovisual: "speaker",
        Laboratório: "flask-conical",
        Cozinha: "utensils",
        Mobiliário: "armchair",
        Esportes: "trophy",
        Jogos: "gamepad-2",
        Infraestrutura: "building-2",
    };
    return mapa[grupo] || "package";
}

// ------------------------------------------------------------
// MONTAGEM DA TELA
// ------------------------------------------------------------

function montarPesquisa() {
    const container = document.getElementById("pesquisaContainer");
    if (!container) return false;

    container.innerHTML = `
        
<header class="pesquisa-cabecalho">
    <h1>Pesquisar item</h1>
    <p>Encontre livros da Biblioteca e computadores do Laboratório de Informática.</p>
</header>

<section class="search-panel">
    <div class="search-main-field">
        <label for="pesquisaBusca">O que você está procurando?</label>
        <div class="search-input-wrap">
            ${iconePesquisa("search")}
            <input
                type="text"
                id="pesquisaBusca"
                placeholder="Digite o nome, código ou palavra-chave..."
            />
        </div>
    </div>

    <div class="search-filtros-linha">
        <div class="search-filtro-campo">
            <label for="pesquisaTipo">Tipo</label>
            <select id="pesquisaTipo">
                <option value="todos">Todas as categorias</option>
            </select>
        </div>

        <div class="search-filtro-campo">
            <label for="pesquisaSituacao">Situação</label>
            <select id="pesquisaSituacao">
                <option value="todas">Todas</option>
                <option value="DISPONIVEL">Disponível</option>
                <option value="EM_USO">Em uso</option>
                <option value="MANUTENCAO">Manutenção</option>
            </select>
        </div>

        <button type="button" id="limparPesquisa" class="search-clear">
            ${iconePesquisa("rotate-ccw")}
            Limpar
        </button>
    </div>
</section>

<div class="search-results-head">
    <div>
        <h2>Itens encontrados</h2>
        <span id="pesquisaContagem">Carregando...</span>
    </div>
</div>

<div id="pesquisaResultados" class="item-results"></div>
<div id="pesquisaPaginacao" class="pesquisa-paginacao" aria-label="Paginação dos itens" hidden></div>


        <div class="search-note">
            ${iconePesquisa("info")}
            <span>Clique em uma sala disponível para reservá-la.</span>
        </div>
    `;

    document
        .getElementById("pesquisaBusca")
        .addEventListener("input", aplicarFiltros);

    document
        .getElementById("pesquisaTipo")
        .addEventListener("change", aplicarFiltros);

    document
        .getElementById("pesquisaSituacao")
        .addEventListener("change", aplicarFiltros);

    document.getElementById("limparPesquisa").addEventListener("click", () => {
        document.getElementById("pesquisaBusca").value = "";
        document.getElementById("pesquisaTipo").value = "todos";
        document.getElementById("pesquisaSituacao").value = "todas";
        aplicarFiltros();
    });

    document
        .getElementById("pesquisaResultados")
        .addEventListener("click", (e) => {
            const card = e.target.closest(".item-result-card.reservable");
            if (card)
                abrirModalReserva(
                    card.dataset.produto,
                    card.dataset.local,
                    card.dataset.nome,
                );
        });

    document.getElementById("pesquisaContainer").addEventListener("click", (e) => {
        const botao = e.target.closest("[data-pagina-pesquisa]");
        if (!botao) return;
        PAGINA_PESQUISA_ATUAL = Number(botao.dataset.paginaPesquisa);
        renderizarPaginaPesquisa();
        const main = document.querySelector(".main-content");
        if (main) main.scrollTo({ top: 0, behavior: "smooth" });
        window.scrollTo({ top: 0, behavior: "smooth" });
    });

    document
        .getElementById("pesquisaResultados")
        .addEventListener("keydown", (e) => {
            if (e.key !== "Enter") return;
            const card = e.target.closest(".item-result-card.reservable");
            if (card)
                abrirModalReserva(
                    card.dataset.produto,
                    card.dataset.local,
                    card.dataset.nome,
                );
        });

    return true;
}

function limparPesquisa() {
    document.getElementById("pesquisaBusca").value = "";
    document.getElementById("pesquisaGrupo").value = "";
    atualizarSubcategorias();
    document.getElementById("pesquisaSubcategoria").value = "";
    aplicarFiltros();
}

// ------------------------------------------------------------
// FILTROS E CARDS
// ------------------------------------------------------------

function aplicarFiltros() {
    const termo = (document.getElementById("pesquisaBusca")?.value || "")
        .trim()
        .toLowerCase();

    const tipo = document.getElementById("pesquisaTipo")?.value || "todos";
    const situacao =
        document.getElementById("pesquisaSituacao")?.value || "todas";

    const filtrados = ITENS_CATALOGO.filter((item) => {
        const grupo = String(item.grupo || "").toLowerCase();
        const categoriaID = String(item.categoriaID || "");
        const categoria = String(item.categoria || "").toLowerCase();

        // Pesquisa por nome, código, autor, local ou categoria
        const texto = [
            item.nome,
            item.codigo,
            item.autor,
            item.local,
            item.categoria,
            item.subcategoria,
            item.detalhe,
        ]
            .join(" ")
            .toLowerCase();

        if (termo && !texto.includes(termo)) return false;

        // Filtro por categoria cadastrada na aba 03_CATEGORIAS
        if (tipo !== "todos" && categoriaID !== tipo) return false;

        // Na categoria Informática, exibe somente computadores nos três locais permitidos.
        const normalizarTexto = (valor) =>
            String(valor || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .trim()
                .toLowerCase();

        const tipoSelecionado = normalizarTexto(
            document.getElementById("pesquisaTipo")?.selectedOptions?.[0]?.textContent || "",
        );

        if (tipoSelecionado === "informatica") {
            const nomeItem = normalizarTexto(item.nome);
            const localItem = normalizarTexto(item.local);
            const ehComputador =
                nomeItem.includes("computador") ||
                nomeItem.includes("desktop");

            const locaisPermitidos = [
                "laboratorio de informatica",
                "sala dos professores",
                "supervisao",
            ];

            if (!ehComputador || !locaisPermitidos.includes(localItem)) {
                return false;
            }
        }

        // Filtro por situação
        if (situacao !== "todas" && item.situacao !== situacao) {
            return false;
        }

        // Exibe todos os produtos do catálogo que correspondem aos filtros.
        // Assim, qualquer categoria selecionada mostra todos os seus produtos.
        return true;
    });

    const contagem = document.getElementById("pesquisaContagem");
    if (contagem) {
        contagem.textContent = `${filtrados.length} ${
            filtrados.length === 1 ? "item encontrado" : "itens encontrados"
        }`;
    }

    window.ITENS_PESQUISA_FILTRADOS = filtrados;
    PAGINA_PESQUISA_ATUAL = 1;
    renderizarPaginaPesquisa();
}

function renderizarPaginaPesquisa() {
    const resultados = document.getElementById("pesquisaResultados");
    if (!resultados) return;
    const filtrados = window.ITENS_PESQUISA_FILTRADOS || [];
    const totalPaginas = Math.ceil(filtrados.length / ITENS_POR_PAGINA_PESQUISA);
    PAGINA_PESQUISA_ATUAL = Math.min(Math.max(PAGINA_PESQUISA_ATUAL, 1), Math.max(totalPaginas, 1));
    const inicio = (PAGINA_PESQUISA_ATUAL - 1) * ITENS_POR_PAGINA_PESQUISA;
    const itensDaPagina = filtrados.slice(inicio, inicio + ITENS_POR_PAGINA_PESQUISA);
    resultados.innerHTML = filtrados.length
        ? itensDaPagina.map(cardDoItem).join("")
        : `<div class="search-empty">${iconePesquisa("search-x")}<strong>Nenhum item encontrado</strong><p>Ajuste a busca ou os filtros.</p></div>`;
    renderizarPaginacaoPesquisa(totalPaginas);
    iconesPesquisa();
}

function renderizarPaginacaoPesquisa(totalPaginas) {
    const existente = document.getElementById("pesquisaPaginacao");
    if (!existente) return;
    if (totalPaginas <= 1) {
        existente.innerHTML = "";
        existente.hidden = true;
        return;
    }
    existente.hidden = false;
    const inicioJanela = Math.floor((PAGINA_PESQUISA_ATUAL - 1) / 10) * 10 + 1;
    const fimJanela = Math.min(inicioJanela + 9, totalPaginas);
    let botoes = "";
    if (PAGINA_PESQUISA_ATUAL > 1) {
        botoes += `<button type="button" class="pagina-seta" data-pagina-pesquisa="${PAGINA_PESQUISA_ATUAL - 1}">Anterior</button>`;
    }
    for (let pagina = inicioJanela; pagina <= fimJanela; pagina++) {
        botoes += `<button type="button" class="pagina-numero ${pagina === PAGINA_PESQUISA_ATUAL ? "ativa" : ""}" data-pagina-pesquisa="${pagina}" ${pagina === PAGINA_PESQUISA_ATUAL ? 'aria-current="page"' : ""}>${pagina}</button>`;
    }
    if (PAGINA_PESQUISA_ATUAL < totalPaginas) {
        botoes += `<button type="button" class="pagina-seta" data-pagina-pesquisa="${PAGINA_PESQUISA_ATUAL + 1}">Seguinte <span aria-hidden="true">›</span></button>`;
    }
    existente.innerHTML = botoes;
}

function cardDoItem(item) {
    const reservavel = true;
    return `
        <article
            class="item-result-card ${reservavel ? "reservable" : ""}"
            ${reservavel ? `role="button" tabindex="0" title="Clique para reservar"` : ""}
            data-produto="${escapeHtml(item.produtoID)}"
            data-local="${escapeHtml(item.localID || "")}"
            data-nome="${escapeHtml(item.nome)}"
        >
            <div class="item-result-icon">${iconePesquisa(iconeDoGrupo(item.grupo))}</div>

            <div class="item-result-main">
                <div class="item-result-top">
                    <div>
                        <span class="item-type">${escapeHtml(item.categoria)}</span>
                        <h3>${escapeHtml(item.nome)}</h3>
                    </div>
                    <span class="item-status ${classeSituacao(item.situacao)}">
                        ${escapeHtml(item.situacaoTexto)}
                    </span>
                </div>

                <p>${escapeHtml(item.detalhe || "Sem informações adicionais.")}</p>

                <div class="item-result-meta">
                    <span>${iconePesquisa("hash")} ${escapeHtml(item.codigo || item.produtoID)}</span>
                    <span>${iconePesquisa("map-pin")} ${escapeHtml(item.local || "Não informado")}</span>
                    <span>${iconePesquisa("package")} ${escapeHtml(String(item.disponivel ?? 0))} disponível</span>
                </div>
            </div>
        </article>`;
}

// ------------------------------------------------------------
// CARREGAMENTO
// ------------------------------------------------------------

async function carregarCatalogo() {
    const resultados = document.getElementById("pesquisaResultados");
    try {
        const resposta = await fetch(`${PESQUISA_API}/professor/itens`);
        const resultado = await resposta.json();

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(resultado.mensagem || "Erro ao carregar itens.");
        }

        ITENS_CATALOGO = resultado.itens || [];
        GRUPOS_CATALOGO = resultado.grupos || [];

        // As opções são recebidas da planilha pela API.
        // Mantém a seleção atual quando o catálogo é atualizado.
        const filtroTipo = document.getElementById("pesquisaTipo");
        if (filtroTipo) {
            const selecaoAtual = filtroTipo.value || "todos";
            const categorias = Array.isArray(resultado.categorias)
                ? resultado.categorias.filter((categoria) => {
                      const nome = String(categoria.nome || "")
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "")
                          .trim()
                          .toLowerCase();
                      return !["equipamentos", "mobiliario", "cantina", "laboratorio"].includes(nome);
                  })
                : [];
            filtroTipo.innerHTML =
                '<option value="todos">Todas as categorias</option>' +
                categorias
                    .map((categoria) => {
                        const id = escapeHtml(categoria.categoriaID);
                        const nome = escapeHtml(categoria.nome);
                        return '<option value="' + id + '">' + nome + "</option>";
                    })
                    .join("");

            filtroTipo.value = categorias.some(
                (categoria) => String(categoria.categoriaID) === selecaoAtual,
            )
                ? selecaoAtual
                : "todos";
        }

        aplicarFiltros();
    } catch (erro) {
        console.error("Erro ao carregar itens da pesquisa:", erro);
        if (resultados) {
            resultados.innerHTML = `<p class="empty">Não foi possível carregar os itens.</p>`;
        }
    }
}

function iniciarPesquisa() {
    if (!document.getElementById("pesquisaContainer")) return Promise.resolve();
    if (!document.getElementById("pesquisaBusca")) {
        montarPesquisa();
        return carregarCatalogo();
    }
    return Promise.resolve();
}

// ------------------------------------------------------------
// RESERVA DE SALA
// ------------------------------------------------------------

function hojeISO() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function abrirModalReserva(produtoID, localID, nome) {
    if (!usuarioLogado?.id) {
        showToast("Não foi possível identificar o usuário logado.");
        return;
    }

    fecharModalReserva();

    const overlay = document.createElement("div");
    overlay.id = "modalReservaSala";
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
        <div class="modal-reserva" role="dialog" aria-modal="true">
            <div class="modal-reserva-header">
                <div>
                    <span class="modal-reserva-tipo">Reserva</span>
                    <h2>${escapeHtml(nome)}</h2>
                </div>
                <button class="modal-fechar" id="fecharModalBtn" type="button">&#x2715;</button>
            </div>

            <form id="formReservaSala">
                <p class="modal-reserva-sub">Período da reserva</p>
                <p class="modal-reserva-hint">Informe quando você irá retirar e devolver o item.</p>

                <div class="modal-reserva-grid">
                    <div class="modal-campo">
                        <label>Data da retirada</label>
                        <input type="date" name="dataRetirada" min="${hojeISO()}" required />
                    </div>
                    <div class="modal-campo">
                        <label>Hora da retirada</label>
                        <input type="time" name="horaRetirada" required />
                    </div>
                    <div class="modal-campo">
                        <label>Data da devolução</label>
                        <input type="date" name="dataDevolucao" min="${hojeISO()}" required />
                    </div>
                    <div class="modal-campo">
                        <label>Hora da devolução</label>
                        <input type="time" name="horaDevolucao" required />
                    </div>
                </div>

                <div class="modal-campo">
                    <label>Motivo da reserva</label>
                    <textarea name="motivo" rows="3" placeholder="Informe o motivo da utilização..."></textarea>
                </div>

                <div class="modal-reserva-acoes">
                    <button type="button" class="btn-modal-cancelar" id="cancelarReservaSala">Cancelar</button>
                    <button type="submit" class="btn-modal-confirmar" id="confirmarReservaSala">Reservar</button>
                </div>
            </form>
        </div>`;

    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) fecharModalReserva();
    });
    document
        .getElementById("fecharModalBtn")
        .addEventListener("click", fecharModalReserva);
    document
        .getElementById("cancelarReservaSala")
        .addEventListener("click", fecharModalReserva);
    document
        .getElementById("formReservaSala")
        .addEventListener("submit", (e) => {
            e.preventDefault();
            confirmarReservaSala(produtoID, localID, e.target);
        });
}

function fecharModalReserva() {
    document.getElementById("modalReservaSala")?.remove();
}

async function confirmarReservaSala(produtoID, localID, form) {
    const dados = Object.fromEntries(new FormData(form).entries());

    if (dados.dataDevolucao < dados.dataRetirada) {
        showToast("A devolução não pode ser antes da retirada.");
        return;
    }

    const botao = document.getElementById("confirmarReservaSala");
    botao.disabled = true;

    try {
        const resposta = await fetch(`${PESQUISA_API}/professor/reservas`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                usuarioID: usuarioLogado.id,
                produtoID,
                localID,
                dataRetirada: dados.dataRetirada,
                horaRetirada: dados.horaRetirada,
                dataDevolucao: dados.dataDevolucao,
                horaDevolucao: dados.horaDevolucao,
                motivo: dados.motivo || "",
                observacao: "",
            }),
        });
        const resultado = await resposta.json();

        if (!resposta.ok || !resultado.sucesso) {
            throw new Error(resultado.mensagem || "Não foi possível reservar.");
        }

        fecharModalReserva();
        showToast("Reserva enviada com sucesso.");
        carregarCatalogo();
    } catch (erro) {
        showToast(erro.message);
        botao.disabled = false;
    }
}
