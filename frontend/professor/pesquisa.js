// ============================================================
// PESQUISA DE ITENS — PAINEL DO PROFESSOR
// Lista todos os itens da planilha (todas as categorias),
// com filtros por grupo/subcategoria e busca por texto.
// As salas (categoria Laboratório, grupo "Salas") podem ser reservadas.
// ============================================================

const PESQUISA_API = "/api";

var ITENS_CATALOGO = [];
var GRUPOS_CATALOGO = [];

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
        <header class="reservas-header">
            <h1>Pesquisar itens</h1>
            <p>Consulte salas, livros, equipamentos e materiais da escola.</p>
        </header>

        <div class="search-main-field">
            <div class="search-input-wrap">
                ${iconePesquisa("search")}
                <input
                    type="text"
                    id="pesquisaBusca"
                    placeholder="Buscar por nome, código, autor ou local..."
                />
            </div>
        </div>

       <div class="search-filters">
            <button class="filtro-btn active" data-filtro="">Todos</button>
            <button class="filtro-btn" data-filtro="lab-info">Lab. Informática</button>
            <button class="filtro-btn" data-filtro="lab-cie">Lab. Ciência</button>
            <button class="filtro-btn" data-filtro="locais">Locais</button>
            <button class="filtro-btn" data-filtro="biblioteca">Biblioteca</button>
        </div>

        <div class="search-results-head">
            <div>
                <h2>Itens encontrados</h2>
                <span id="pesquisaContagem">Carregando...</span>
            </div>
        </div>

        <div id="pesquisaResultados" class="item-results"></div>

        <div class="search-note">
            ${iconePesquisa("info")}
            <span>Clique em uma sala disponível para reservá-la.</span>
        </div>
    `;

    document
        .getElementById("pesquisaBusca")
        .addEventListener("input", aplicarFiltros);
    document.querySelectorAll(".filtro-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document
                .querySelectorAll(".filtro-btn")
                .forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            aplicarFiltros();
        });
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
    const filtroAtivo =
        document.querySelector(".filtro-btn.active")?.dataset.filtro || "";

    const filtrados = ITENS_CATALOGO.filter((item) => {
        // Regra de visibilidade
        const noLabInfo = item.local === "Laboratório de Informática";
        const noLabCie = item.local === "Laboratório de Ciência";
        const ehSala = item.grupo === "Salas";
        const ehBiblioteca = item.grupo === "Biblioteca";
        const ehInfoOuAV =
            item.grupo === "Informática" || item.grupo === "Audiovisual";

        const visivel = ehBiblioteca || ehSala || (ehInfoOuAV && noLabInfo);

        if (!visivel) return false;

        // Filtro do botão selecionado
        if (filtroAtivo === "lab-info") {
            if (!noLabInfo && !ehSala) return false;
            if (ehSala && item.nome !== "Laboratório de Informática")
                return false;
        } else if (filtroAtivo === "lab-cie") {
            if (ehSala && item.nome !== "Laboratório de Ciência") return false;
            if (!ehSala) return false;
        } else if (filtroAtivo === "locais") {
            if (!ehSala) return false;
        } else if (filtroAtivo === "biblioteca") {
            if (!ehBiblioteca) return false;
        }

        const textoBusca = [
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

        return !termo || textoBusca.includes(termo);
    });

    const contagem = document.getElementById("pesquisaContagem");
    if (contagem) {
        contagem.textContent = `${filtrados.length} ${
            filtrados.length === 1 ? "item encontrado" : "itens encontrados"
        }`;
    }

    const resultados = document.getElementById("pesquisaResultados");
    if (!resultados) return;

    resultados.innerHTML = filtrados.length
        ? filtrados.map(cardDoItem).join("")
        : `
            <div class="search-empty">
                ${iconePesquisa("search-x")}
                <strong>Nenhum item encontrado</strong>
                <p>Ajuste a busca ou os filtros.</p>
            </div>`;

    iconesPesquisa();
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

        aplicarFiltros();
    } catch (erro) {
        console.error("Erro ao carregar itens da pesquisa:", erro);
        if (resultados) {
            resultados.innerHTML = `<p class="empty">Não foi possível carregar os itens.</p>`;
        }
    }
}

function iniciarPesquisa() {
    if (!document.getElementById("pesquisaContainer")) return;
    if (!document.getElementById("pesquisaBusca")) {
        montarPesquisa();
        carregarCatalogo();
    }
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
