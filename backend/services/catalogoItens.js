const sheets = require("../database/googleSheets");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ============================================================
// AUXILIARES
// ============================================================

function normalizar(valor) {
    return String(valor ?? "")
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function texto(valor) {
    return String(valor ?? "").trim();
}

function numero(valor) {
    const n = Number(String(valor ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
}

async function lerAba(range) {
    const resposta = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range,
    });
    return resposta.data.values || [];
}

// Grupo exibido no filtro. Itens da categoria Laboratório são as salas
// reserváveis, por isso aparecem no filtro "Salas".
function grupoDaCategoria(categoriaNome) {
    if (normalizar(categoriaNome) === "LABORATORIO") {
        return "Salas";
    }
    return categoriaNome;
}

function situacaoDoEstoque(estadoProduto, disponivel, emprestado, quantidade) {
    const estado = normalizar(estadoProduto);

    if (estado === "MANUTENCAO" || estado === "EM_MANUTENCAO") {
        return { codigo: "MANUTENCAO", texto: "Em manutenção" };
    }
    if (disponivel > 0) {
        return { codigo: "DISPONIVEL", texto: "Disponível" };
    }
    if (emprestado > 0 || quantidade > 0) {
        return { codigo: "EM_USO", texto: "Emprestado / Em uso" };
    }
    return { codigo: "INDISPONIVEL", texto: "Indisponível" };
}

// ============================================================
// CATÁLOGO COMPLETO (todas as categorias ativas)
//
// Colunas usadas (mesmas do restante do sistema):
// 02_PRODUTOS A:K | 03_CATEGORIAS A:D | 04_SUBCATEGORIAS A:E
// 05_LOCAIS A:G   | 06_ESTOQUE_LOCAIS A:H | 09_EMPRESTIMOS A:K
// ============================================================

async function buscarCatalogo() {
    const [
        produtosL,
        categoriasL,
        subcategoriasL,
        locaisL,
        estoqueL,
        emprestimosL,
    ] = await Promise.all([
        lerAba("02_PRODUTOS!A:K"),
        lerAba("03_CATEGORIAS!A:D"),
        lerAba("04_SUBCATEGORIAS!A:E"),
        lerAba("05_LOCAIS!A:G"),
        lerAba("06_ESTOQUE_LOCAIS!A:H"),
        lerAba("09_EMPRESTIMOS!A:K"),
    ]);

    const categorias = new Map();
    const categoriasDisponiveis = [];
    categoriasL.slice(1).forEach((l) => {
        if (!l[0] || !texto(l[1])) return;

        const categoria = {
            categoriaID: texto(l[0]),
            nome: texto(l[1]),
            status: texto(l[3]),
        };

        categorias.set(categoria.categoriaID, {
            nome: categoria.nome,
            status: categoria.status,
        });

        // Mantém apenas categorias ativas (ou sem status preenchido),
        // seguindo a regra já usada pelo catálogo para categorias.
        if (!categoria.status || normalizar(categoria.status) === "ATIVO") {
            categoriasDisponiveis.push({
                categoriaID: categoria.categoriaID,
                nome: categoria.nome,
            });
        }
    });

    categoriasDisponiveis.sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
    );

    const subcategorias = new Map();
    subcategoriasL.slice(1).forEach((l) => {
        if (!l[0]) return;
        subcategorias.set(texto(l[0]), {
            nome: texto(l[2]),
            status: texto(l[4]),
        });
    });

    const locais = new Map();
    locaisL.slice(1).forEach((l) => {
        if (!l[0]) return;
        locais.set(texto(l[0]), { nome: texto(l[2]), status: texto(l[6]) });
    });

    const estoquePorProduto = new Map();
    estoqueL.slice(1).forEach((l) => {
        if (!l[0] || !l[1]) return;
        const registro = {
            localID: texto(l[2]),
            quantidade: numero(l[3]),
            reservado: numero(l[4]),
            disponivel: numero(l[5]),
        };
        if (!estoquePorProduto.has(texto(l[1]))) {
            estoquePorProduto.set(texto(l[1]), []);
        }
        estoquePorProduto.get(texto(l[1])).push(registro);
    });

    // Empréstimos em aberto, somados por produto
    const emprestadoPorProduto = new Map();
    emprestimosL.slice(1).forEach((l) => {
        if (!l[0] || !l[3]) return;
        const status = normalizar(l[8]);
        const aberto = ["ABERTO", "EMPRESTADO", "EM_USO", "USO"].includes(
            status,
        );
        if (!aberto) return;
        const produtoID = texto(l[3]);
        emprestadoPorProduto.set(
            produtoID,
            (emprestadoPorProduto.get(produtoID) || 0) + numero(l[5]),
        );
    });

    const itens = [];

    produtosL.slice(1).forEach((linha) => {
        const produtoID = texto(linha[0]);
        if (!produtoID) return;

        // Produto precisa estar ativo
        if (normalizar(linha[8]) !== "ATIVO") return;

        const categoria = categorias.get(texto(linha[4]));
        if (!categoria) return;
        if (categoria.status && normalizar(categoria.status) !== "ATIVO")
            return;

        const subcategoria = subcategorias.get(texto(linha[5]));
        const grupo = grupoDaCategoria(categoria.nome);
        const emprestado = emprestadoPorProduto.get(produtoID) || 0;
        const base = {
            produtoID,
            codigo: texto(linha[1]),
            nome: texto(linha[2]),
            autor: texto(linha[3]),
            categoriaID: texto(linha[4]),
            categoria: categoria.nome,
            subcategoria: subcategoria?.nome || "",
            grupo,
            emprestado,
        };

        const registros = estoquePorProduto.get(produtoID) || [];

        // Sem registro de estoque: mostra o item como indisponível
        if (registros.length === 0) {
            itens.push({
                ...base,
                localID: null,
                local: "Não informado",
                quantidade: 0,
                reservado: 0,
                disponivel: 0,
                situacao: "INDISPONIVEL",
                situacaoTexto: "Indisponível",
                podeReservar: false,
                detalhe: detalheDoItem(base, "Não informado"),
            });
            return;
        }

        // Um card por local onde o item está
        registros.forEach((estoque) => {
            const local = locais.get(estoque.localID);

            // Local inexistente ou inativo: não mostra
            if (!local) return;
            if (local.status && normalizar(local.status) !== "ATIVO") return;

            const situacao = situacaoDoEstoque(
                linha[7],
                estoque.disponivel,
                emprestado,
                estoque.quantidade,
            );

            // Só salas (categoria Laboratório) são reserváveis por enquanto
            const podeReservar =
                situacao.codigo === "DISPONIVEL" &&
                estoque.disponivel > estoque.reservado;

            itens.push({
                ...base,
                localID: estoque.localID,
                local: local.nome || "Não informado",
                quantidade: estoque.quantidade,
                reservado: estoque.reservado,
                disponivel: estoque.disponivel,
                situacao: situacao.codigo,
                situacaoTexto: situacao.texto,
                podeReservar,
                detalhe: detalheDoItem(base, local.nome),
            });
        });
    });

    itens.sort((a, b) => {
        if (a.grupo !== b.grupo) {
            if (a.grupo === "Salas") return -1;
            if (b.grupo === "Salas") return 1;
            return a.grupo.localeCompare(b.grupo, "pt-BR");
        }
        return String(a.nome).localeCompare(String(b.nome), "pt-BR", {
            numeric: true,
            sensitivity: "base",
        });
    });

    const grupos = [...new Set(itens.map((i) => i.grupo))].sort((a, b) => {
        if (a === "Salas") return -1;
        if (b === "Salas") return 1;
        return a.localeCompare(b, "pt-BR");
    });

    return { itens, grupos, categorias: categoriasDisponiveis };
}

function detalheDoItem(base, localNome) {
    if (base.grupo === "Salas") {
        return `Sala ${localNome || ""}`.trim() + " — disponível para reserva.";
    }
    if (base.autor) {
        return `Autor: ${base.autor}`;
    }
    if (base.subcategoria) {
        return base.subcategoria;
    }
    return base.categoria;
}

module.exports = { buscarCatalogo };
