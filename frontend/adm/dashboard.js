const API_ADMIN = "/api";

let usuariosAdmin = [];
let dadosPainelAdmin = null;

const elAdmin = (id) => document.getElementById(id);

function escaparAdmin(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, (caractere) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[caractere]);
}

function formatarNumero(valor) {
    const numero = Number(valor || 0);
    return Number.isFinite(numero) ? numero.toLocaleString("pt-BR") : "0";
}

function formatarData(valor) {
    if (!valor) return "Nunca";
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? String(valor) : data.toLocaleString("pt-BR", {
        dateStyle: "short", timeStyle: "short",
    });
}

function mostrarEstadoPainel(texto, tipo = "") {
    const elemento = elAdmin("mensagemEstado");
    elemento.textContent = texto;
    elemento.className = `mensagem-estado ${tipo}`.trim();
}

async function carregarPainelAdmin() {
    const atualizar = elAdmin("btnAtualizar");
    atualizar.disabled = true;
    atualizar.classList.add("girando");
    mostrarEstadoPainel("Carregando dados administrativos da planilha...");

    try {
        const resposta = await fetch(`${API_ADMIN}/admin/dashboard`, {
            method: "GET",
            credentials: "include",
            headers: { Accept: "application/json" },
        });
        const dados = await resposta.json();

        if (resposta.status === 401) {
            window.location.replace("/index.html");
            return;
        }
        if (resposta.status === 403) {
            mostrarEstadoPainel("Acesso negado: esta área é exclusiva do ADM.", "erro");
            document.querySelectorAll(".conteudo > section, .conteudo > .metricas").forEach((item) => item.hidden = true);
            return;
        }
        if (!resposta.ok || !dados.sucesso) {
            throw new Error(dados.mensagem || "Não foi possível carregar o painel.");
        }

        dadosPainelAdmin = dados;
        usuariosAdmin = Array.isArray(dados.usuarios) ? dados.usuarios : [];
        renderizarResumoAdmin(dados);
        renderizarUsuariosAdmin();
        renderizarAtividadesAdmin(dados.atividadesRecentes || []);
        mostrarEstadoPainel("Dados carregados com sucesso da planilha escolar.", "sucesso");
        elAdmin("ultimaAtualizacao").textContent = formatarData(dados.atualizadoEm);
        verificarPlanilhaAdmin();
        if (window.lucide) window.lucide.createIcons();
    } catch (erro) {
        console.error("Erro ao carregar Painel ADM:", erro);
        mostrarEstadoPainel(`${erro.message} Use o botão de atualizar para tentar novamente.`, "erro");
    } finally {
        atualizar.disabled = false;
        atualizar.classList.remove("girando");
    }
}

function renderizarResumoAdmin(dados) {
    const resumo = dados.resumo || {};
    const papeis = resumo.usuariosPorTipo || {};

    elAdmin("totalUsuarios").textContent = formatarNumero(resumo.totalUsuarios);
    elAdmin("usuariosAtivos").textContent = formatarNumero(resumo.usuariosAtivos);
    elAdmin("totalProdutos").textContent = formatarNumero(resumo.produtosCadastrados);
    elAdmin("totalEstoque").textContent = formatarNumero(resumo.quantidadeTotalEstoque);
    elAdmin("estoqueDisponivel").textContent = formatarNumero(resumo.quantidadeDisponivel);
    elAdmin("totalLogs").textContent = formatarNumero(resumo.registrosDeAuditoria);

    elAdmin("qtdAlunos").textContent = formatarNumero(papeis.alunos);
    elAdmin("qtdProfessores").textContent = formatarNumero(papeis.professores);
    elAdmin("qtdResponsaveis").textContent = formatarNumero(papeis.responsaveis);
    elAdmin("qtdSecretaria").textContent = formatarNumero(papeis.secretaria);
    elAdmin("qtdAdmins").textContent = formatarNumero(papeis.administradores);

    elAdmin("totalLocais").textContent = formatarNumero(resumo.locaisCadastrados);
    elAdmin("registrosEstoque").textContent = formatarNumero(resumo.registrosDeEstoque);
    elAdmin("disponivelDetalhe").textContent = formatarNumero(resumo.quantidadeDisponivel);
    elAdmin("totalReservas").textContent = formatarNumero(resumo.reservas);
    elAdmin("totalEmprestimos").textContent = formatarNumero(resumo.emprestimos);
    elAdmin("totalDevolucoes").textContent = formatarNumero(resumo.devolucoes);
    elAdmin("totalMovimentacoes").textContent = formatarNumero(resumo.movimentacoes);
    elAdmin("totalAvisos").textContent = formatarNumero(resumo.avisosPublicados);
    elAdmin("dataAtual").textContent = new Date().toLocaleDateString("pt-BR", { dateStyle: "medium" });
}

async function verificarPlanilhaAdmin() {
    const status = elAdmin("statusPlanilha");
    status.textContent = "Verificando...";
    status.className = "status-verificando";
    try {
        const resposta = await fetch(`${API_ADMIN}/teste-planilha`, { credentials: "include" });
        const dados = await resposta.json();
        if (!resposta.ok || !dados.sucesso) throw new Error(dados.mensagem || "Falha na conexão");
        status.textContent = "Conectada";
        status.className = "status-ok";
    } catch (erro) {
        status.textContent = "Indisponível";
        status.className = "status-falha";
    }
}

function renderizarUsuariosAdmin() {
    const busca = elAdmin("buscarUsuario").value.trim().toLocaleLowerCase("pt-BR");
    const statusFiltro = elAdmin("filtroStatus").value;
    const filtrados = usuariosAdmin.filter((usuario) => {
        const texto = [usuario.usuarioID, usuario.nome, usuario.email, usuario.tipoUsuario, usuario.perfil, usuario.setorID]
            .join(" ").toLocaleLowerCase("pt-BR");
        return (!busca || texto.includes(busca)) &&
            (!statusFiltro || String(usuario.status || "").toUpperCase() === statusFiltro);
    });

    const tabela = elAdmin("tabelaUsuarios");
    if (!filtrados.length) {
        tabela.innerHTML = '<tr><td colspan="5" class="vazio">Nenhum usuário encontrado com esses filtros.</td></tr>';
        elAdmin("totalExibidos").textContent = "0 usuários";
        return;
    }

    tabela.innerHTML = filtrados.map((usuario) => {
        const nome = usuario.nome || "Sem nome";
        const status = String(usuario.status || "SEM STATUS").trim();
        const classeStatus = status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return `<tr>
            <td><div class="usuario-identidade"><span class="usuario-avatar">${escaparAdmin(nome.trim().charAt(0).toUpperCase() || "?")}</span><span><strong class="usuario-nome">${escaparAdmin(nome)}</strong><small class="usuario-email">${escaparAdmin(usuario.email || "Sem e-mail")} · ${escaparAdmin(usuario.usuarioID)}</small></span></div></td>
            <td>${escaparAdmin(usuario.tipoUsuario || "—")}<br><small class="usuario-email">${escaparAdmin(usuario.perfil || "Sem perfil")}</small></td>
            <td>${escaparAdmin(usuario.setorID || "—")}</td>
            <td><span class="pilula-status ${escaparAdmin(classeStatus)}">${escaparAdmin(status)}</span></td>
            <td>${escaparAdmin(formatarData(usuario.ultimoLogin))}</td>
        </tr>`;
    }).join("");
    elAdmin("totalExibidos").textContent = `${formatarNumero(filtrados.length)} de ${formatarNumero(usuariosAdmin.length)} usuários`;
}

function renderizarAtividadesAdmin(atividades) {
    const lista = elAdmin("listaAtividades");
    if (!atividades.length) {
        lista.innerHTML = '<p class="vazio">Nenhum registro encontrado na aba de auditoria.</p>';
        return;
    }

    lista.innerHTML = atividades.map((atividade) => {
        const pares = Object.entries(atividade).filter(([, valor]) => String(valor || "").trim());
        const titulo = pares.slice(0, 2).map(([chave, valor]) => `${chave}: ${valor}`).join(" · ") || "Registro de atividade";
        const detalhe = pares.slice(2, 6).map(([chave, valor]) => `${chave}: ${valor}`).join(" · ");
        return `<article class="atividade">
            <span class="atividade-icone"><i data-lucide="file-clock"></i></span>
            <div><strong>${escaparAdmin(titulo)}</strong><small>${escaparAdmin(detalhe || "Registro mantido na planilha de auditoria.")}</small></div>
        </article>`;
    }).join("");
}

async function sairPainelAdmin() {
    const botao = elAdmin("btnSair");
    botao.disabled = true;
    botao.querySelector("span").textContent = "Saindo...";
    try {
        const resposta = await fetch(`${API_ADMIN}/logout`, {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
        });
        const resultado = await resposta.json().catch(() => ({}));
        if (!resposta.ok || resultado.sucesso !== true) {
            throw new Error(resultado.mensagem || "Não foi possível encerrar a sessão.");
        }
        sessionStorage.removeItem("usuarioLogado");
        window.location.replace("/index.html");
    } catch (erro) {
        console.error("Erro ao encerrar sessão:", erro);
        botao.disabled = false;
        botao.querySelector("span").textContent = "Sair";
        alert("Não foi possível confirmar a saída. Verifique sua conexão e tente novamente.");
    }
}

// Evita exibir a tela antiga ao voltar pelo histórico do navegador.
window.addEventListener("pageshow", (evento) => {
    if (evento.persisted && !sessionStorage.getItem("usuarioLogado")) {
        window.location.replace("/index.html");
    }
});

function mudarTelaAdmin(tela) {
    const titulos = {
        inicio: "Início",
        usuarios: "Usuários e acessos",
        estoque: "Estoque e patrimônio",
        operacoes: "Reservas e empréstimos",
        auditoria: "Auditoria e atividade",
        sistema: "Saúde do sistema",
        cadastro: "Cadastrar conta",
    };

    document.querySelectorAll("[data-pagina]").forEach((secao) => {
        secao.hidden = secao.dataset.pagina !== tela;
    });

    document.querySelectorAll("[data-tela]").forEach((botao) => {
        const ativo = botao.dataset.tela === tela;
        botao.classList.toggle("ativo", ativo);
        botao.classList.toggle("on", ativo);
        botao.setAttribute("aria-current", ativo ? "page" : "false");
    });

    elAdmin("tituloTela").textContent = titulos[tela] || "Painel ADM";
    document.title = `${titulos[tela] || "Painel ADM"} | Painel ADM`;
    elAdmin("sidebar").classList.remove("aberto");
    elAdmin("overlayMenu").classList.remove("visivel");
}


function configurarCadastroAdmin() {
    const form = elAdmin("formCadastroAdmin");
    if (!form) return;
    const tipo = elAdmin("tipoContaAdmin");
    const grupo = elAdmin("grupoSetorAdminCadastro");
    const setor = elAdmin("setorAdminCadastro");
    const mensagem = elAdmin("mensagemCadastroAdmin");
    const botao = elAdmin("btnCadastrarAdmin");
    const mostrar = (texto, classe = "erro") => {
        mensagem.textContent = texto;
        mensagem.className = "mensagem-cadastro-admin " + classe;
    };
    const carregarSetores = async () => {
        setor.disabled = true;
        try {
            const resp = await fetch("/api/setores-disponiveis", { credentials: "include" });
            const data = await resp.json();
            if (!resp.ok || !data.sucesso) throw new Error(data.mensagem || "Não foi possível carregar os setores.");
            setor.replaceChildren();
            const inicial = document.createElement("option");
            inicial.value = "";
            inicial.textContent = data.setores.length ? "Selecione um setor" : "Nenhum setor disponível";
            setor.appendChild(inicial);
            data.setores.forEach((item) => {
                const opcao = document.createElement("option");
                opcao.value = item.setorID;
                opcao.textContent = item.nome + " (" + item.setorID + ")";
                setor.appendChild(opcao);
            });
            setor.disabled = !data.setores.length;
        } catch (erro) {
            mostrar(erro.message);
        }
    };
    const atualizarTipo = () => {
        const exigeSetor = tipo.value === "RESPONSAVEL";
        grupo.hidden = !exigeSetor;
        setor.required = exigeSetor;
        if (exigeSetor) carregarSetores();
    };
    tipo.addEventListener("change", atualizarTipo);
    elAdmin("cpfAdminCadastro").addEventListener("input", (evento) => {
        const v = evento.target.value.replace(/[^0-9]/g, "").slice(0, 11);
        evento.target.value = v.length > 9 ? v.slice(0,3)+"."+v.slice(3,6)+"."+v.slice(6,9)+"-"+v.slice(9) : v.length > 6 ? v.slice(0,3)+"."+v.slice(3,6)+"."+v.slice(6) : v.length > 3 ? v.slice(0,3)+"."+v.slice(3) : v;
    });
    elAdmin("telefoneAdminCadastro").addEventListener("input", (evento) => {
        const v = evento.target.value.replace(/[^0-9]/g, "").slice(0, 11);
        evento.target.value = v.length > 10 ? "(" + v.slice(0,2) + ") " + v.slice(2,7) + "-" + v.slice(7) : v.length > 6 ? "(" + v.slice(0,2) + ") " + v.slice(2,6) + "-" + v.slice(6) : v;
    });
    form.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        const senha = elAdmin("senhaAdminCadastro").value;
        const confirmacao = elAdmin("confirmacaoAdminCadastro").value;
        if (senha !== confirmacao) return mostrar("As senhas não coincidem.");
        const dados = {
            tipoConta: tipo.value,
            nome: elAdmin("nomeAdminCadastro").value.trim(),
            cpf: elAdmin("cpfAdminCadastro").value.replace(/[^0-9]/g, ""),
            dataNascimento: elAdmin("nascimentoAdminCadastro").value,
            telefone: elAdmin("telefoneAdminCadastro").value.replace(/[^0-9]/g, ""),
            email: elAdmin("emailAdminCadastro").value.trim(),
            setorID: tipo.value === "RESPONSAVEL" ? setor.value : "",
            senha,
            confirmacaoSenha: confirmacao
        };
        botao.disabled = true;
        mostrar("Cadastrando...");
        try {
            const rota = tipo.value === "SECRETARIA" ? "cadastro-secretaria" : "cadastro-responsavel";
            const resp = await fetch("/api/" + rota, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(dados)
            });
            const resultado = await resp.json();
            if (!resp.ok || !resultado.sucesso) throw new Error(resultado.mensagem || "Não foi possível cadastrar a conta.");
            mostrar(resultado.mensagem + " ID: " + resultado.usuario.id, "sucesso");
            form.reset();
            atualizarTipo();
            await carregarPainelAdmin();
        } catch (erro) {
            mostrar(erro.message);
        } finally {
            botao.disabled = false;
        }
    });
    atualizarTipo();
}

function configurarMenuAdmin() {
    const sidebar = elAdmin("sidebar");
    const overlay = elAdmin("overlayMenu");

    const alternarMenu = () => {
        sidebar.classList.toggle("aberto");
        overlay.classList.toggle("visivel");
    };

    elAdmin("btnMenu").addEventListener("click", alternarMenu);
    elAdmin("btnSidebarToggle").addEventListener("click", () => {
        document.body.classList.toggle("menu-recolhido");
    });

    overlay.addEventListener("click", () => {
        sidebar.classList.remove("aberto");
        overlay.classList.remove("visivel");
    });

    document.querySelectorAll("[data-tela]").forEach((botao) => {
        botao.addEventListener("click", () => mudarTelaAdmin(botao.dataset.tela));
    });

    mudarTelaAdmin("inicio");
}

elAdmin("btnAtualizar").addEventListener("click", carregarPainelAdmin);
elAdmin("buscarUsuario").addEventListener("input", renderizarUsuariosAdmin);
elAdmin("filtroStatus").addEventListener("change", renderizarUsuariosAdmin);
elAdmin("btnSair").addEventListener("click", sairPainelAdmin);
configurarCadastroAdmin();
configurarMenuAdmin();
carregarPainelAdmin();
