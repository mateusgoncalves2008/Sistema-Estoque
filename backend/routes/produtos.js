const express = require("express");
const router = express.Router();

const sheets = require("../database/googleSheets");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function normalizar(valor) {
    return String(valor ?? "")
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function numero(valor) {
    const n = Number(String(valor ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
}

function texto(valor) {
    return String(valor ?? "").trim();
}

function formatarSituacao(codigo) {
    const valor = normalizar(codigo);

    if (valor === "DISPONIVEL") {
        return {
            codigo: "DISPONIVEL",
            texto: "Disponível",
        };
    }

    if (valor === "EMPRESTADO" || valor === "USO" || valor === "EM_USO") {
        return {
            codigo: "EM_USO",
            texto: "Emprestado / Em uso",
        };
    }

    if (valor === "MANUTENCAO" || valor === "EM_MANUTENCAO") {
        return {
            codigo: "MANUTENCAO",
            texto: "Em manutenção",
        };
    }

    return {
        codigo: "INDISPONIVEL",
        texto: "Indisponível",
    };
}

// ============================================================
// LEITOR GENÉRICO DE PLANILHA
// ============================================================

function transformarPorCabecalho(linhas) {
    if (!linhas || linhas.length === 0) {
        return [];
    }

    const cabecalho = linhas[0];

    return linhas
        .slice(1)
        .filter((linha) => linha[0])
        .map((linha) => {
            const objeto = {};

            cabecalho.forEach((coluna, index) => {
                if (coluna) {
                    objeto[String(coluna).trim()] = linha[index] ?? "";
                }
            });

            return objeto;
        });
}

// ============================================================
// GET /api/aluno/itens
//
// Retorna somente:
// - Livros da Biblioteca
// - Computadores do Laboratório de Informática
//
// Tudo é lido diretamente do Google Sheets.
// ============================================================

router.get("/aluno/itens", async (req, res) => {
    try {
        // --------------------------------------------------------
        // 02_PRODUTOS
        //
        // A ProdutoID
        // B Codigo
        // C Nome
        // D Autor
        // E CategoriaID
        // F SubcategoriaID
        // G EstoqueMinimo
        // H Estado
        // I Status
        // J DataCadastro
        // K Observacao
        // --------------------------------------------------------

        const produtosResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "02_PRODUTOS!A:K",
        });

        const produtosLinhas = produtosResponse.data.values || [];
        const produtos = transformarPorCabecalho(produtosLinhas);

        // --------------------------------------------------------
        // 03_CATEGORIAS
        //
        // A CategoriaID
        // B Nome
        // C Descricao
        // D Status
        // --------------------------------------------------------

        const categoriasResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "03_CATEGORIAS!A:D",
        });

        const categoriasLinhas = categoriasResponse.data.values || [];

        const categorias = new Map();

        categoriasLinhas.slice(1).forEach((linha) => {
            if (!linha[0]) return;

            categorias.set(String(linha[0]), {
                id: texto(linha[0]),
                nome: texto(linha[1]),
                descricao: texto(linha[2]),
                status: texto(linha[3]),
            });
        });

        // --------------------------------------------------------
        // 04_SUBCATEGORIAS
        //
        // A SubcategoriaID
        // B CategoriaID
        // C Nome
        // D Descricao
        // E Status
        // --------------------------------------------------------

        const subcategoriasResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "04_SUBCATEGORIAS!A:E",
        });

        const subcategoriasLinhas = subcategoriasResponse.data.values || [];

        const subcategorias = new Map();

        subcategoriasLinhas.slice(1).forEach((linha) => {
            if (!linha[0]) return;

            subcategorias.set(String(linha[0]), {
                id: texto(linha[0]),
                categoriaID: texto(linha[1]),
                nome: texto(linha[2]),
                descricao: texto(linha[3]),
                status: texto(linha[4]),
            });
        });

        // --------------------------------------------------------
        // 05_LOCAIS
        //
        // A LocalID
        // B CodigoLocal
        // C Nome
        // D Tipo
        // E ResponsavelID
        // F Descricao
        // G Status
        // --------------------------------------------------------

        const locaisResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "05_LOCAIS!A:G",
        });

        const locaisLinhas = locaisResponse.data.values || [];

        const locais = new Map();

        locaisLinhas.slice(1).forEach((linha) => {
            if (!linha[0]) return;

            locais.set(String(linha[0]), {
                id: texto(linha[0]),
                codigo: texto(linha[1]),
                nome: texto(linha[2]),
                tipo: texto(linha[3]),
                responsavelID: texto(linha[4]),
                descricao: texto(linha[5]),
                status: texto(linha[6]),
            });
        });

        // --------------------------------------------------------
        // 06_ESTOQUE_LOCAIS
        //
        // A EstoqueID
        // B ProdutoID
        // C LocalID
        // D Quantidade
        // E Reservado
        // F Disponivel
        // G Indisponivel
        // H UltimaAtualizacao
        // --------------------------------------------------------

        const estoqueResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "06_ESTOQUE_LOCAIS!A:H",
        });

        const estoqueLinhas = estoqueResponse.data.values || [];

        const estoquePorProduto = new Map();

        estoqueLinhas.slice(1).forEach((linha) => {
            if (!linha[0] || !linha[1]) return;

            const registro = {
                estoqueID: texto(linha[0]),
                produtoID: texto(linha[1]),
                localID: texto(linha[2]),
                quantidade: numero(linha[3]),
                reservado: numero(linha[4]),
                disponivel: numero(linha[5]),
                indisponivel: numero(linha[6]),
                ultimaAtualizacao: texto(linha[7]),
            };

            if (!estoquePorProduto.has(registro.produtoID)) {
                estoquePorProduto.set(registro.produtoID, []);
            }

            estoquePorProduto.get(registro.produtoID).push(registro);
        });

        // --------------------------------------------------------
        // 09_EMPRESTIMOS
        //
        // Mantemos a estrutura já utilizada pelo seu sistema:
        //
        // D = ProdutoID
        // F = Quantidade
        // I = Status
        //
        // --------------------------------------------------------

        const emprestimosResponse = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "09_EMPRESTIMOS!A:K",
        });

        const emprestimosLinhas = emprestimosResponse.data.values || [];

        const emprestimosAbertos = new Map();

        emprestimosLinhas.slice(1).forEach((linha) => {
            if (!linha[0] || !linha[3]) return;

            const status = normalizar(linha[8]);

            const statusAberto =
                status === "ABERTO" ||
                status === "EMPRESTADO" ||
                status === "EM_USO" ||
                status === "USO";

            if (!statusAberto) {
                return;
            }

            const produtoID = texto(linha[3]);
            const quantidade = numero(linha[5]);

            emprestimosAbertos.set(
                produtoID,
                (emprestimosAbertos.get(produtoID) || 0) + quantidade,
            );
        });

        // ========================================================
        // MONTAGEM DOS ITENS
        // ========================================================

        const itens = [];

        for (const produto of produtos) {
            const produtoID = texto(produto.ProdutoID);

            if (!produtoID) {
                continue;
            }

            // Somente produtos ativos
            if (normalizar(produto.Status) !== "ATIVO") {
                continue;
            }

            const categoria = categorias.get(String(produto.CategoriaID));

            if (!categoria) {
                continue;
            }

            // Somente categoria ativa
            if (categoria.status && normalizar(categoria.status) !== "ATIVO") {
                continue;
            }

            const subcategoria = subcategorias.get(
                String(produto.SubcategoriaID),
            );

            // ----------------------------------------------------
            // IDENTIFICAÇÃO DO TIPO
            // ----------------------------------------------------

            const categoriaNome = normalizar(categoria.nome);
            const subcategoriaNome = normalizar(subcategoria?.nome);

            const nomeProduto = normalizar(produto.Nome);

            const ehLivro = categoriaNome === "BIBLIOTECA";

            const ehComputador =
                categoriaNome === "INFORMATICA" &&
                (subcategoriaNome === "DESKTOP" ||
                    subcategoriaNome === "NOTEBOOK" ||
                    nomeProduto.includes("COMPUTADOR") ||
                    nomeProduto === "PC");

            // O aluno não vê outros tipos de estoque
            if (!ehLivro && !ehComputador) {
                continue;
            }

            const tipo = ehLivro ? "Livro" : "Computador";

            // ----------------------------------------------------
            // ESTOQUE
            // ----------------------------------------------------

            const registrosEstoque = estoquePorProduto.get(produtoID) || [];

            // Se não houver registro de estoque,
            // ainda mostramos o item, porém indisponível.
            if (registrosEstoque.length === 0) {
                itens.push({
                    produtoID,
                    codigo: texto(produto.Codigo),
                    nome: texto(produto.Nome),
                    autor: texto(produto.Autor),

                    categoriaID: texto(produto.CategoriaID),
                    categoria: texto(categoria.nome),

                    subcategoriaID: texto(produto.SubcategoriaID),

                    subcategoria: texto(subcategoria?.nome),

                    localID: null,
                    local: "Não informado",

                    tipo,

                    quantidade: 0,
                    reservado: 0,
                    disponivel: 0,
                    indisponivel: 0,
                    emprestado: 0,

                    situacao: "INDISPONIVEL",
                    situacaoTexto: "Indisponível",

                    podeReservar: false,
                });

                continue;
            }

            // ----------------------------------------------------
            // CADA LOCAL DO PRODUTO
            // ----------------------------------------------------

            for (const estoque of registrosEstoque) {
                const local = locais.get(String(estoque.localID));

                // Ignora local inexistente
                if (!local) {
                    continue;
                }

                // Ignora local inativo
                if (local.status && normalizar(local.status) !== "ATIVO") {
                    continue;
                }

                const emprestado = emprestimosAbertos.get(produtoID) || 0;

                // ------------------------------------------------
                // SITUAÇÃO
                // ------------------------------------------------

                let situacaoCodigo;

                const estadoProduto = normalizar(produto.Estado);

                if (
                    estadoProduto === "MANUTENCAO" ||
                    estadoProduto === "EM_MANUTENCAO"
                ) {
                    situacaoCodigo = "MANUTENCAO";
                } else if (estoque.disponivel > 0) {
                    situacaoCodigo = "DISPONIVEL";
                } else if (emprestado > 0 || estoque.quantidade > 0) {
                    situacaoCodigo = "EM_USO";
                } else {
                    situacaoCodigo = "INDISPONIVEL";
                }

                const situacao = formatarSituacao(situacaoCodigo);

                // ------------------------------------------------
                // LOCAL
                // ------------------------------------------------

                const localNome = texto(local.nome) || "Não informado";

                const localNormalizado = normalizar(localNome);

                // ------------------------------------------------
                // PODE RESERVAR?
                // ------------------------------------------------

                let podeReservar = false;

                if (ehLivro) {
                    podeReservar =
                        localNormalizado.includes("BIBLIOTECA") &&
                        situacaoCodigo === "DISPONIVEL" &&
                        estoque.disponivel > estoque.reservado;
                }

                if (ehComputador) {
                    podeReservar =
                        localNormalizado.includes(
                            "LABORATORIO DE INFORMATICA",
                        ) &&
                        situacaoCodigo === "DISPONIVEL" &&
                        estoque.disponivel > estoque.reservado;
                }

                // ------------------------------------------------
                // DETALHE PARA O FRONTEND
                // ------------------------------------------------

                let detalhe = "";

                if (ehLivro) {
                    detalhe = texto(produto.Autor)
                        ? `Autor: ${texto(produto.Autor)}`
                        : "Livro disponível na Biblioteca.";
                } else {
                    detalhe =
                        "Computador disponível no Laboratório de Informática.";
                }

                itens.push({
                    produtoID,
                    codigo: texto(produto.Codigo),
                    nome: texto(produto.Nome),
                    autor: texto(produto.Autor),

                    categoriaID: texto(produto.CategoriaID),
                    categoria: texto(categoria.nome),

                    subcategoriaID: texto(produto.SubcategoriaID),

                    subcategoria: texto(subcategoria?.nome),

                    localID: estoque.localID,
                    local: localNome,

                    tipo,

                    quantidade: estoque.quantidade,
                    reservado: estoque.reservado,
                    disponivel: estoque.disponivel,
                    indisponivel: estoque.indisponivel,

                    emprestado,

                    situacao: situacao.codigo,
                    situacaoTexto: situacao.texto,

                    detalhe,

                    podeReservar,
                });
            }
        }

        // ========================================================
        // ORDENAÇÃO
        // ========================================================

        itens.sort((a, b) => {
            if (a.tipo !== b.tipo) {
                return a.tipo === "Livro" ? -1 : 1;
            }

            return String(a.nome).localeCompare(String(b.nome), "pt-BR", {
                sensitivity: "base",
            });
        });

        // ========================================================
        // RESPOSTA
        // ========================================================

        return res.json({
            sucesso: true,
            total: itens.length,
            itens,
        });
    } catch (erro) {
        console.error("Erro ao buscar itens do aluno:", erro);

        return res.status(500).json({
            sucesso: false,
            mensagem: "Erro ao buscar os itens da planilha.",
            erro:
                process.env.NODE_ENV === "development"
                    ? erro.message
                    : undefined,
        });
    }
});

module.exports = router;
