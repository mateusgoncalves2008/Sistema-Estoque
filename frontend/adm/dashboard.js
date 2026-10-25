const API_ADMIN = "/api";

let usuariosAdmin = [];
let dadosPainelAdmin = null;
let logsCompletosAdmin = [];
let assinaturaEstoqueAdmin = null;
let assinaturaOperacoesAdmin = null;
let assinaturaRelatoriosAdmin = null;
let assinaturaAtividadesAdmin = null;
let paginaLogsAtualAdmin = 1;
const TAMANHO_PAGINA_LOGS = 50;

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

async function carregarPainelAdmin(silencioso = false) {
    const atualizar = elAdmin("btnAtualizar");
    if (!silencioso) {
        atualizar.disabled = true;
        atualizar.classList.add("girando");
        mostrarEstadoPainel("Carregando dados administrativos da planilha...");
    }

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

        const usuariosAnteriores = JSON.stringify(usuariosAdmin);
        dadosPainelAdmin = dados;
        atualizarIdentidadeContaAdmin(dados);
        usuariosAdmin = Array.isArray(dados.usuarios) ? dados.usuarios : [];
        renderizarResumoAdmin(dados);
        if (!silencioso || usuariosAnteriores !== JSON.stringify(usuariosAdmin)) {
            renderizarUsuariosAdmin();
        }
        const estoqueOk = await carregarEstoqueAdmin();
        const operacoesOk = await carregarOperacoesAdmin();
        const relatoriosOk = await carregarRelatoriosAdmin();
        renderizarAtividadesAdmin(dados.atividadesRecentes || []);
        const ultimaAtualizacao = elAdmin("ultimaAtualizacao");
        if (ultimaAtualizacao) ultimaAtualizacao.textContent = formatarData(dados.atualizadoEm);
        if (!silencioso) {
            verificarSaudeSistemaAdmin();
        } else {
            // Atualiza os tempos da API e do Google Sheets em cada ciclo automático,
            // sem recarregar a página. A verificação também registra o resultado no histórico.
            await verificarSaudeSistemaAdmin();
            if (estoqueOk && operacoesOk && relatoriosOk) {
                const horario = new Date().toLocaleTimeString("pt-BR", { hour12: false });
                console.info(`[ATUALIZAÇÃO AUTOMÁTICA] Painel atualizado às ${horario}`);
            }
        }
        if (window.lucide) window.lucide.createIcons();
    } catch (erro) {
        console.error("Erro ao carregar Painel ADM:", erro);
        if (!silencioso) mostrarEstadoPainel(`${erro.message} Use o botão de atualizar para tentar novamente.`, "erro");
    } finally {
        if (!silencioso) {
            atualizar.disabled = false;
            atualizar.classList.remove("girando");
        }
    }
}

function atualizarIdentidadeContaAdmin(dados = dadosPainelAdmin) {
    let usuario = {};
    try {
        usuario = JSON.parse(sessionStorage.getItem("usuarioLogado") || "{}");
    } catch {
        usuario = {};
    }

    const administrador = dados?.administrador || {};
    const nome = String(
        administrador.nome || administrador.Nome ||
        usuario.nome || usuario.nomeCompleto || usuario.email || "Administrador"
    ).trim();
    const tipo = String(
        administrador.tipoUsuario || administrador.tipo || administrador.perfil ||
        usuario.tipoUsuario || usuario.tipo || usuario.perfil || "ADMIN"
    ).trim().toUpperCase();
    const papel = ["ADMIN", "ADM", "ADMINISTRADOR"].includes(tipo)
        ? "Administrador"
        : tipo === "LIDER" || tipo === "RESPONSAVEL"
            ? "Responsável"
            : tipo.charAt(0) + tipo.slice(1).toLowerCase();

    const nomeEl = elAdmin("nomeContaAdmin");
    const papelEl = elAdmin("papelContaAdmin");
    const avatarEl = elAdmin("avatarContaAdmin");
    if (nomeEl) nomeEl.textContent = nome;
    if (papelEl) papelEl.textContent = papel;
    if (avatarEl) avatarEl.textContent = nome.charAt(0).toLocaleUpperCase("pt-BR") || "A";
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

    elAdmin("totalAvisos").textContent = formatarNumero(resumo.avisosPublicados);
    elAdmin("dataAtual").textContent = new Date().toLocaleDateString("pt-BR", { dateStyle: "medium" });
}

let historicoSaudeAdmin = [];

async function verificarSaudeSistemaAdmin() {
    const botao = elAdmin("btnVerificarSaude");
    if (!botao) return;

    botao.disabled = true;
    botao.setAttribute("aria-busy", "true");
    const servidor = elAdmin("statusServidor");
    const planilha = elAdmin("statusPlanilha");
    servidor.textContent = "Verificando...";
    servidor.className = "status-verificando";
    planilha.textContent = "Verificando...";
    planilha.className = "status-verificando";
    elAdmin("detalheServidor").textContent = "Testando disponibilidade da API...";
    elAdmin("detalhePlanilha").textContent = "Testando conexão com o Google Sheets...";

    const medirRequisicao = async (url) => {
        const inicio = performance.now();
        try {
            const resposta = await fetch(url, { credentials: "include", cache: "no-store" });
            return { resposta, ms: Math.max(0, Math.round(performance.now() - inicio)) };
        } catch (erro) {
            return { erro, ms: Math.max(0, Math.round(performance.now() - inicio)) };
        }
    };

    try {
        const [testeApi, testePlanilha] = await Promise.all([
            medirRequisicao(`${API_ADMIN}/teste`),
            medirRequisicao(`${API_ADMIN}/teste-planilha`),
        ]);

        const apiOk = Boolean(testeApi.resposta && testeApi.resposta.ok);
        servidor.textContent = apiOk ? "Online" : "Indisponível";
        servidor.className = apiOk ? "status-ok" : "status-falha";
        elAdmin("detalheServidor").textContent = apiOk
            ? `API respondeu com HTTP ${testeApi.resposta.status}`
            : (testeApi.resposta ? `API respondeu com HTTP ${testeApi.resposta.status}` : "Não foi possível alcançar a API.");

        const dadosPlanilha = testePlanilha.resposta
            ? await testePlanilha.resposta.json().catch(() => ({}))
            : {};
        const planilhaOk = Boolean(testePlanilha.resposta && testePlanilha.resposta.ok && dadosPlanilha.sucesso === true);
        planilha.textContent = planilhaOk ? "Conectada" : "Indisponível";
        planilha.className = planilhaOk ? "status-ok" : "status-falha";
        elAdmin("detalhePlanilha").textContent = planilhaOk
            ? "Consulta à planilha concluída com sucesso"
            : (dadosPlanilha.mensagem || (testePlanilha.resposta ? "A consulta à planilha falhou." : "Não foi possível alcançar o serviço."));

        elAdmin("tempoRespostaSaude").textContent = `API ${testeApi.ms} ms · Planilha ${testePlanilha.ms} ms`;
    } finally {
        const hora = new Date().toLocaleString("pt-BR");
        elAdmin("ultimaVerificacaoSaude").textContent = hora;
        historicoSaudeAdmin.unshift({
            hora,
            servidor: servidor.textContent,
            planilha: planilha.textContent,
            ms: elAdmin("tempoRespostaSaude").textContent,
        });
        historicoSaudeAdmin = historicoSaudeAdmin.slice(0, 10);
        elAdmin("historicoSaude").innerHTML = historicoSaudeAdmin.map((item) => {
            const apiClass = item.servidor === "Online" ? "status-ok" : "status-falha";
            const sheetsClass = item.planilha === "Conectada" ? "status-ok" : "status-falha";
            return `<tr><td>${escaparAdmin(item.hora)}</td><td><strong class="${apiClass}">${escaparAdmin(item.servidor)}</strong></td><td><strong class="${sheetsClass}">${escaparAdmin(item.planilha)}</strong></td><td>${escaparAdmin(item.ms)}</td></tr>`;
        }).join("");
        botao.disabled = false;
        botao.removeAttribute("aria-busy");
        if (window.lucide) window.lucide.createIcons();
    }
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
        tabela.innerHTML = '<tr><td colspan="6" class="vazio">Nenhum usuário encontrado com esses filtros.</td></tr>';
        elAdmin("totalExibidos").textContent = "0 usuários";
        return;
    }

    tabela.innerHTML = filtrados.map((usuario) => {
        const nome = usuario.nome || "Sem nome";
        const status = String(usuario.status || "SEM STATUS").trim();
        const classeStatus = status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const ativo = status.toUpperCase() === "ATIVO";
        const propriaConta = String(usuario.usuarioID) === String(dadosPainelAdmin?.administrador?.usuarioID || "");
        return `<tr>
            <td><div class="usuario-identidade"><span class="usuario-avatar">${escaparAdmin(nome.trim().charAt(0).toUpperCase() || "?")}</span><span><strong class="usuario-nome">${escaparAdmin(nome)}</strong><small class="usuario-email">${escaparAdmin(usuario.email || "Sem e-mail")} · ${escaparAdmin(usuario.usuarioID)}</small></span></div></td>
            <td>${escaparAdmin(usuario.tipoUsuario || "—")}<br><small class="usuario-email">${escaparAdmin(usuario.perfil || "Sem perfil")}</small></td>
            <td>${escaparAdmin(usuario.setorID || "—")}</td>
            <td><span class="pilula-status ${escaparAdmin(classeStatus)}">${escaparAdmin(status)}</span></td>
            <td>${escaparAdmin(formatarData(usuario.ultimoLogin))}</td>
            <td class="acoes-usuario">
                <button type="button" class="btn-acao-usuario" data-acao-usuario="editar" data-usuario-id="${escaparAdmin(usuario.usuarioID)}">Editar</button>
                <button type="button" class="btn-acao-usuario ${ativo ? "perigo" : "positivo"}" data-acao-usuario="status" data-status-alvo="${ativo ? "INATIVO" : "ATIVO"}" data-usuario-id="${escaparAdmin(usuario.usuarioID)}" ${propriaConta ? "disabled title=\"Não é possível alterar a própria conta\"" : ""}>${ativo ? "Desativar" : "Reativar"}</button>
            </td>
        </tr>`;
    }).join("");
    elAdmin("totalExibidos").textContent = `${formatarNumero(filtrados.length)} de ${formatarNumero(usuariosAdmin.length)} usuários`;
    tabela.querySelectorAll("[data-acao-usuario]").forEach((botao) => {
        botao.addEventListener("click", () => executarAcaoUsuarioAdmin(botao));
    });
}

async function executarAcaoUsuarioAdmin(botao) {
    const usuarioID = botao.dataset.usuarioId;
    const usuario = usuariosAdmin.find((item) => String(item.usuarioID) === String(usuarioID));
    if (!usuario) return;

    if (botao.dataset.acaoUsuario === "editar") {
        const nome = window.prompt("Nome completo:", usuario.nome || "");
        if (nome === null) return;
        const email = window.prompt("E-mail:", usuario.email || "");
        if (email === null) return;
        const setorID = window.prompt("ID do setor (deixe vazio se não houver):", usuario.setorID || "");
        if (setorID === null) return;
        if (!nome.trim() || !email.trim()) {
            alert("Nome e e-mail são obrigatórios.");
            return;
        }
        await enviarAcaoUsuarioAdmin(usuarioID, "PATCH", "", { nome: nome.trim(), email: email.trim(), setorID: setorID.trim() });
        return;
    }

    const status = botao.dataset.statusAlvo;
    const acao = status === "ATIVO" ? "reativar" : "desativar";
    if (!window.confirm(`Deseja ${acao} a conta de ${usuario.nome}?`)) return;
    await enviarAcaoUsuarioAdmin(usuarioID, "PATCH", "/status", { status });
}

async function enviarAcaoUsuarioAdmin(usuarioID, metodo, sufixo, corpo) {
    const botoes = document.querySelectorAll(`[data-usuario-id="${CSS.escape(usuarioID)}"]`);
    botoes.forEach((botao) => { botao.disabled = true; });
    try {
        const resposta = await fetch(`${API_ADMIN}/admin/usuarios/${encodeURIComponent(usuarioID)}${sufixo}`, {
            method: metodo,
            credentials: "include",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(corpo),
        });
        const resultado = await resposta.json().catch(() => ({}));
        if (!resposta.ok || resultado.sucesso !== true) throw new Error(resultado.mensagem || "Não foi possível atualizar o usuário.");
        mostrarEstadoPainel(resultado.mensagem || "Usuário atualizado.", "sucesso");
        await carregarPainelAdmin();
    } catch (erro) {
        alert(erro.message);
    } finally {
        botoes.forEach((botao) => { botao.disabled = false; });
    }
}


async function carregarOperacoesAdmin() {
    const tabelaReservas = elAdmin("tabelaReservasAdmin");
    const tabelaEmprestimos = elAdmin("tabelaEmprestimosAdmin");
    if (!tabelaReservas || !tabelaEmprestimos) return;
    try {
        const resposta = await fetch(API_ADMIN + "/admin/operacoes", { credentials: "include", headers: { Accept: "application/json" } });
        const dados = await resposta.json();
        if (!resposta.ok || !dados.sucesso) throw new Error(dados.mensagem || "Não foi possível carregar as operações.");
        const termoBuscaOperacoes = String(elAdmin("buscarOperacoesAdmin")?.value || "").trim().toLocaleLowerCase("pt-BR");
        const assinatura = JSON.stringify({ dados, termoBuscaOperacoes });
        if (assinatura === assinaturaOperacoesAdmin) return true;
        assinaturaOperacoesAdmin = assinatura;
        const correspondeUsuario = (registro) => String(registro.usuario || registro.usuarioNome || registro.nomeUsuario || registro.usuarioID || "").toLocaleLowerCase("pt-BR").includes(termoBuscaOperacoes);
        const reservas = dados.reservas || [];
        const reservasVisiveis = reservas.filter((r) => {
            const usuarioID = String(r.usuarioID || "");
            const produtoID = String(r.produtoID || "");
            const dataInicio = String(r.dataInicio || "");
            const dataFim = String(r.dataFim || "");
            const status = String(r.status || "").toUpperCase();
            const nomeUsuario = String(r.usuario || "");
            const reservaRenanDevolvida = nomeUsuario === "Renan Santos" &&
                dataInicio.startsWith("26/09/2026 21:28:26") &&
                dataFim.startsWith("27/09/2026 20:00:00") && status === "DEVOLVIDO";
            const reservaTesteOculta = usuarioID === "USR-00001" && produtoID === "PRD-00002" &&
                dataInicio.startsWith("25/09/2026") && dataFim.startsWith("26/09/2026") && status === "PENDENTE";
            const reservaConcluidaOculta = usuarioID === "USR-00003" && produtoID === "PRD-00002" &&
                dataInicio.startsWith("27/09/2026 11:00:00") && dataFim.startsWith("27/09/2026 20:00:00") && status === "CONCLUIDA";
            return !reservaTesteOculta && !reservaConcluidaOculta && !reservaRenanDevolvida && correspondeUsuario(r);
        });
        tabelaReservas.innerHTML = reservasVisiveis.length ? reservasVisiveis.slice().reverse().map((r) => {
            const status = String(r.status || "—").toUpperCase();
            let acoes = "—";
            if (status === "PENDENTE") {
                acoes = '<button class="btn-acao-usuario positivo" data-reserva-id="' + escaparAdmin(r.reservaID) + '" data-reserva-status="APROVADA">Aprovar</button> <button class="btn-acao-usuario perigo" data-reserva-id="' + escaparAdmin(r.reservaID) + '" data-reserva-status="RECUSADA">Recusar</button>';
            } else if (status === "APROVADA") {
                acoes = '<button class="btn-acao-usuario perigo" data-reserva-id="' + escaparAdmin(r.reservaID) + '" data-reserva-status="CANCELADA">Cancelar</button>';
            }
            return "<tr><td>" + escaparAdmin(r.usuario || r.usuarioID) + "</td><td>" + escaparAdmin(r.produto || r.produtoID) + "</td><td>" + escaparAdmin(r.dataInicio || "—") + "</td><td>" + escaparAdmin(r.dataFim || "—") + "</td><td>" + escaparAdmin(status) + "</td><td class=\"acoes-usuario\">" + acoes + "</td></tr>";
        }).join("") : '<tr><td colspan="6" class="vazio">Nenhuma reserva registrada.</td></tr>';
        const emprestimos = dados.emprestimos || [];
        const emprestimosVisiveis = emprestimos.filter((e) => {
            const usuarioID = String(e.usuarioID || "");
            const produtoID = String(e.produtoID || "");
            const dataRetirada = String(e.dataRetirada || "");
            const registrosOcultos = [
                "24/09/2026 20:04:53",
                "24/09/2026 20:04:41",
                "24/09/2026 20:04:13",
            ];
            const retiradaConcluida = dataRetirada.startsWith("27/09/2026 11:00:00");
            return !(
                (usuarioID === "USR-00001" && produtoID === "PRD-00002" && registrosOcultos.includes(dataRetirada)) ||
                (usuarioID === "USR-00003" && produtoID === "PRD-00002" && retiradaConcluida)
            ) && correspondeUsuario(e);
        });
        tabelaEmprestimos.innerHTML = emprestimosVisiveis.length ? emprestimosVisiveis.slice().reverse().map((e) =>
            "<tr><td>" + escaparAdmin(e.usuario || e.usuarioID) + "</td><td>" + escaparAdmin(e.produto || e.produtoID) + "</td><td>" + escaparAdmin(e.dataRetirada || "—") + "</td><td>" + escaparAdmin(e.dataPrevistaDevolucao || "—") + "</td><td>" + escaparAdmin(e.status || "—") + "</td></tr>"
        ).join("") : '<tr><td colspan="5" class="vazio">Nenhum empréstimo registrado.</td></tr>';
        tabelaReservas.querySelectorAll("[data-reserva-status]").forEach((botao) => botao.addEventListener("click", async () => {
            const statusNovo = botao.dataset.reservaStatus;
            if (!confirm("Confirma " + statusNovo.toLowerCase() + " a reserva " + botao.dataset.reservaId + "?")) return;
            botao.disabled = true;
            try {
                const resp = await fetch(API_ADMIN + "/admin/reservas/" + encodeURIComponent(botao.dataset.reservaId) + "/status", {
                    method: "PATCH", credentials: "include",
                    headers: { "Content-Type": "application/json", Accept: "application/json" },
                    body: JSON.stringify({ status: statusNovo })
                });
                const resultado = await resp.json();
                if (!resp.ok || !resultado.sucesso) throw new Error(resultado.mensagem || "Não foi possível atualizar a reserva.");
                mostrarEstadoPainel(resultado.mensagem, "sucesso");
                await carregarOperacoesAdmin();
            } catch (erro) {
                alert(erro.message);
                botao.disabled = false;
            }
        }));
        return true;
    } catch (erro) {
        tabelaReservas.innerHTML = '<tr><td colspan="6" class="vazio">' + escaparAdmin(erro.message) + '</td></tr>';
        tabelaEmprestimos.innerHTML = '<tr><td colspan="5" class="vazio">' + escaparAdmin(erro.message) + '</td></tr>';
        return false;
    }
}


async function carregarRelatoriosAdmin() {
    const tabelaD = elAdmin("tabelaDenunciasAdmin");
    const tabelaB = elAdmin("tabelaBloqueiosAdmin");
    if (!tabelaD || !tabelaB) return;
    try {
        const resp = await fetch(API_ADMIN + "/admin/denuncias-bloqueios", { credentials: "include", headers: { Accept: "application/json" } });
        const dados = await resp.json();
        if (!resp.ok || !dados.sucesso) throw new Error(dados.mensagem || "Não foi possível carregar denúncias e bloqueios.");
        const termoDenuncias = String(elAdmin("buscarDenunciasAdmin")?.value || "").trim().toLocaleLowerCase("pt-BR");
        const termoBloqueios = String(elAdmin("buscarBloqueiosAdmin")?.value || "").trim().toLocaleLowerCase("pt-BR");
        const assinatura = JSON.stringify({ dados, termoDenuncias, termoBloqueios });
        if (assinatura === assinaturaRelatoriosAdmin) return true;
        assinaturaRelatoriosAdmin = assinatura;
        const denuncias = dados.denuncias || [];
        const denunciasFiltradas = denuncias.filter((d) => String([d.denuncianteNome, d.denuncianteID, d.denunciadoNome, d.denunciadoID].filter(Boolean).join(" ")).toLocaleLowerCase("pt-BR").includes(termoDenuncias));
        tabelaD.innerHTML = denunciasFiltradas.length ? denunciasFiltradas.slice().reverse().map((d) =>
            "<tr><td>" + escaparAdmin(d.denuncianteNome || d.denuncianteID) + "</td><td>" + escaparAdmin(d.denunciadoNome || d.denunciadoID) + "</td><td>" + escaparAdmin(d.motivo) + "</td><td>" + escaparAdmin(d.status || "—") + "</td><td><button class=\"btn-acao-usuario\" type=\"button\" data-denuncia-id=\"" + escaparAdmin(d.denunciaID) + "\">Analisar / responder</button></td></tr>"
        ).join("") : '<tr><td colspan="5" class="vazio">' + (termoDenuncias ? 'Nenhuma denúncia encontrada para esse usuário.' : 'Nenhuma denúncia registrada.') + '</td></tr>';
        const bloqueios = dados.bloqueios || [];
        const bloqueiosFiltrados = bloqueios.filter((b) => String([b.usuarioBloqueadoNome, b.usuarioBloqueadoID].filter(Boolean).join(" ")).toLocaleLowerCase("pt-BR").includes(termoBloqueios));
        tabelaB.innerHTML = bloqueiosFiltrados.length ? bloqueiosFiltrados.slice().reverse().map((b) =>
            "<tr><td>" + escaparAdmin(b.usuarioBloqueadoNome || b.usuarioBloqueadoID) + "</td><td>" + escaparAdmin(b.setorNome || b.setorID) + "</td><td>" + escaparAdmin(b.motivo) + "</td><td>" + escaparAdmin(b.status || "—") + "</td></tr>"
        ).join("") : '<tr><td colspan="4" class="vazio">' + (termoBloqueios ? 'Nenhum bloqueio encontrado para esse usuário.' : 'Nenhum bloqueio registrado.') + '</td></tr>';
        tabelaD.querySelectorAll("[data-denuncia-id]").forEach((botao) => botao.addEventListener("click", async () => {
            const d = denuncias.find((item) => String(item.denunciaID) === String(botao.dataset.denunciaId));
            const resposta = prompt("Denúncia " + d.denunciaID + "\n" + (d.descricao || d.motivo) + "\n\nResposta da administração:", d.resposta || "");
            if (resposta === null) return;
            const status = prompt("Status: ANALISADA, RESOLVIDA ou ARQUIVADA", "ANALISADA");
            if (status === null) return;
            botao.disabled = true;
            try {
                const r = await fetch(API_ADMIN + "/admin/denuncias/" + encodeURIComponent(d.denunciaID) + "/resposta", {
                    method: "PATCH", credentials: "include",
                    headers: { "Content-Type": "application/json", Accept: "application/json" },
                    body: JSON.stringify({ resposta, status })
                });
                const resultado = await r.json();
                if (!r.ok || !resultado.sucesso) throw new Error(resultado.mensagem || "Não foi possível registrar a análise.");
                mostrarEstadoPainel(resultado.mensagem, "sucesso");
                await carregarRelatoriosAdmin();
            } catch (erro) {
                alert(erro.message);
                botao.disabled = false;
            }
        }));
        return true;
    } catch (erro) {
        tabelaD.innerHTML = '<tr><td colspan="5" class="vazio">' + escaparAdmin(erro.message) + '</td></tr>';
        tabelaB.innerHTML = '<tr><td colspan="4" class="vazio">' + escaparAdmin(erro.message) + '</td></tr>';
        return false;
    }
}


async function carregarEstoqueAdmin() {
    const tabelaP = elAdmin("tabelaEstoqueAdmin");
    const tabelaL = elAdmin("tabelaLocaisAdmin");
    if (!tabelaP || !tabelaL) return;
    try {
        const resposta = await fetch(API_ADMIN + "/admin/estoque", { credentials: "include", headers: { Accept: "application/json" } });
        const dados = await resposta.json();
        if (!resposta.ok || !dados.sucesso) throw new Error(dados.mensagem || "Não foi possível carregar o estoque.");
        const assinatura = JSON.stringify(dados);
        if (assinatura === assinaturaEstoqueAdmin) return true;
        assinaturaEstoqueAdmin = assinatura;
        const produtos = dados.produtos || [];
        tabelaP.innerHTML = produtos.length ? produtos.map((p) =>
            "<tr><td>" + escaparAdmin(p.nome) + "</td><td>" + escaparAdmin(p.categoria || p.categoriaID) + "</td><td>" + escaparAdmin(p.subcategoria || p.subcategoriaID) + "</td><td>" + escaparAdmin(p.status) + "</td></tr>"
        ).join("") : '<tr><td colspan="4" class="vazio">Nenhum produto cadastrado.</td></tr>';
        const locais = dados.locais || [];
        tabelaL.innerHTML = locais.length ? locais.map((l) =>
            "<tr><td>" + escaparAdmin(l.nome) + "</td><td>" + escaparAdmin(l.tipo) + "</td><td>" + escaparAdmin(l.responsavelNome || l.responsavelID || "Não informado") + "</td><td>" + escaparAdmin(l.status) + "</td></tr>"
        ).join("") : '<tr><td colspan="4" class="vazio">Nenhum local cadastrado.</td></tr>';
        return true;
    } catch (erro) {
        tabelaP.innerHTML = '<tr><td colspan="4" class="vazio">' + escaparAdmin(erro.message) + '</td></tr>';
        tabelaL.innerHTML = '<tr><td colspan="4" class="vazio">' + escaparAdmin(erro.message) + '</td></tr>';
        return false;
    }
}

function renderizarAtividadesAdmin(atividades) {
    const assinatura = JSON.stringify(atividades || []);
    if (assinatura === assinaturaAtividadesAdmin) return;
    assinaturaAtividadesAdmin = assinatura;
    const lista = elAdmin("listaAtividades");
    if (!atividades.length) {
        lista.innerHTML = '<p class="vazio">Nenhum registro encontrado na aba de auditoria.</p>';
        return;
    }

    const formatarHoraAtividade = (valor) => {
        if (!valor) return "";
        const texto = String(valor).trim();
        const hora = texto.match(/(?:^|\\s)(\\d{1,2}:\\d{2})(?::\\d{2})?/);
        return hora ? hora[1] : "";
    };

    const descreverAcao = (valor) => {
        const acao = String(valor || "").trim().toUpperCase();
        const descricoes = {
            LOGIN: "fez login",
            LOGOUT: "saiu do sistema",
            CRIAR_USUARIO: "criou uma nova conta",
            CADASTRAR_USUARIO: "cadastrou um usuário",
            CRIAR: "criou um novo registro",
            CREATE: "criou um novo registro",
            EDITAR: "editou um registro",
            ATUALIZAR: "editou dados",
            UPDATE: "editou dados",
            EXCLUIR: "excluiu um registro",
            DELETAR: "deletou um registro",
            DELETE: "deletou um registro",
            EXPORTAR: "exportou um relatório",
        };
        return descricoes[acao] || String(valor || "realizou uma atividade").replace(/[_-]+/g, " ").toLocaleLowerCase("pt-BR");
    };

    const estiloAcao = (valor) => {
        const acao = String(valor || "").toUpperCase();
        if (/LOGIN|LOGOUT|SAIR/.test(acao)) return { icone: "log-in", classe: "atividade-azul" };
        if (/CRIAR|CADASTR|CREATE|ADD/.test(acao)) return { icone: "plus", classe: "atividade-verde" };
        if (/EDITAR|ATUALIZAR|UPDATE|ALTERAR/.test(acao)) return { icone: "file-pen-line", classe: "atividade-laranja" };
        if (/EXCLUIR|DELETAR|DELETE|REMOVER/.test(acao)) return { icone: "trash-2", classe: "atividade-vermelha" };
        if (/EXPORTAR|DOWNLOAD|PDF/.test(acao)) return { icone: "download", classe: "atividade-azul-escuro" };
        return { icone: "file-clock", classe: "atividade-neutra" };
    };

    lista.innerHTML = atividades.map((atividade) => {
        const usuarioID = atividade.usuarioID || atividade.UsuarioID || "";
        const usuarioEncontrado = usuariosAdmin.find((usuario) =>
            String(usuario.usuarioID || usuario.UsuarioID || usuario.id || usuario.ID || "").toLowerCase() === String(usuarioID).toLowerCase()
        );
        const nome = atividade.usuarioNome || atividade.nomeUsuario || atividade.nome || usuarioEncontrado?.nome || usuarioEncontrado?.Nome || atividade.usuario || (usuarioID && !usuarioID.startsWith("USR-") ? usuarioID : "Usuário");
        const acaoOriginal = atividade.acao || atividade.Acao || atividade.acaoRealizada || "";
        const descricao = atividade.descricao || atividade.Descricao || "";
        const tabela = atividade.tabela || atividade.Tabela || "";
        const hora = formatarHoraAtividade(atividade.dataHora || atividade.DataHora || atividade.data || atividade.Data);
        const estilo = estiloAcao(acaoOriginal);
        const complemento = descricao || (tabela ? "em " + tabela.replace(/_/g, " ").toLocaleLowerCase("pt-BR") : "realizou uma atividade no sistema");
        return `<article class="atividade">
            <span class="atividade-icone ${estilo.classe}"><i data-lucide="${estilo.icone}"></i></span>
            <div class="atividade-conteudo"><strong><span class="atividade-nome">${escaparAdmin(nome)}</span> ${escaparAdmin(descreverAcao(acaoOriginal))}</strong><small>${escaparAdmin(complemento)}</small></div>
            <time class="atividade-hora">${escaparAdmin(hora)}</time>
        </article>`;
    }).join("");

    if (window.lucide) window.lucide.createIcons();
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

async function carregarLogsCompletosAdmin() {
    const tabela = elAdmin("tabelaLogsAdmin");
    tabela.innerHTML = '<tr><td colspan="5" class="vazio">Carregando logs...</td></tr>';
    elAdmin("resumoLogsAdmin").textContent = "Carregando histórico completo...";
    try {
        const resposta = await fetch(`${API_ADMIN}/admin/logs`, { method: "GET", credentials: "include", headers: { Accept: "application/json" } });
        const dados = await resposta.json();
        if (resposta.status === 401) { window.location.replace("/index.html"); return; }
        if (!resposta.ok || !dados.sucesso) throw new Error(dados.mensagem || "Não foi possível carregar os logs.");
        logsCompletosAdmin = Array.isArray(dados.logs) ? dados.logs : [];
        paginaLogsAtualAdmin = 1;
        renderizarLogsCompletosAdmin();
    } catch (erro) {
        tabela.innerHTML = `<tr><td colspan="5" class="vazio">${escaparAdmin(erro.message)}</td></tr>`;
        elAdmin("resumoLogsAdmin").textContent = "Falha ao carregar o histórico.";
    }
}

function renderizarLogsCompletosAdmin() {
    const termo = String(elAdmin("buscarLogsAdmin").value || "").trim().toLocaleLowerCase("pt-BR");
    const filtrados = logsCompletosAdmin.filter(log => [log.usuarioNome, log.usuarioID].some(valor => String(valor || "").toLocaleLowerCase("pt-BR").includes(termo)));
    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / TAMANHO_PAGINA_LOGS));
    paginaLogsAtualAdmin = Math.min(Math.max(1, paginaLogsAtualAdmin), totalPaginas);
    const inicio = (paginaLogsAtualAdmin - 1) * TAMANHO_PAGINA_LOGS;
    const pagina = filtrados.slice(inicio, inicio + TAMANHO_PAGINA_LOGS);
    const tabela = elAdmin("tabelaLogsAdmin");
    if (!pagina.length) { tabela.innerHTML = '<tr><td colspan="5" class="vazio">Nenhum log corresponde à pesquisa.</td></tr>'; }
    else {
        tabela.innerHTML = pagina.map(log => `<tr><td>${escaparAdmin(log.dataHora || "—")}</td><td><strong>${escaparAdmin(log.usuarioNome || "Sistema")}</strong></td><td>${escaparAdmin(log.acao || "—")}</td><td class="log-descricao">${escaparAdmin(log.descricao || "—")}</td><td>${escaparAdmin(log.resultado || "—")}</td></tr>`).join("");
    }
    elAdmin("resumoLogsAdmin").textContent = `${filtrados.length.toLocaleString("pt-BR")} registro(s) encontrado(s) • ${logsCompletosAdmin.length.toLocaleString("pt-BR")} no total`;
    elAdmin("paginaLogsAdmin").textContent = `Página ${paginaLogsAtualAdmin} de ${totalPaginas}`;
    elAdmin("btnLogsAnterior").disabled = paginaLogsAtualAdmin <= 1;
    elAdmin("btnLogsProxima").disabled = paginaLogsAtualAdmin >= totalPaginas;
}

function mudarTelaAdmin(tela) {
    const titulos = {
        inicio: "Início",
        usuarios: "Usuários e acessos",
        estoque: "Estoque e patrimônio",
        operacoes: "Reservas e empréstimos",
        denuncias: "Denúncias",
        bloqueios: "Bloqueios por setor",
        atividades: "Atividades",
        logs: "Histórico completo de logs",
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

function configurarAbasEstoqueAdmin() {
    const botoes = document.querySelectorAll("[data-aba-estoque]");
    const paineis = {
        catalogo: elAdmin("painelCatalogo"),
        locais: elAdmin("painelLocais"),
    };

    botoes.forEach((botao) => {
        botao.addEventListener("click", () => {
            const abaSelecionada = botao.dataset.abaEstoque;
            botoes.forEach((item) => {
                const ativo = item === botao;
                item.classList.toggle("ativa", ativo);
                item.setAttribute("aria-selected", String(ativo));
            });
            Object.entries(paineis).forEach(([nome, painel]) => {
                painel.hidden = nome !== abaSelecionada;
            });
            if (window.lucide) window.lucide.createIcons();
        });
    });
}

function configurarAbasOperacoesAdmin() {
    const botoes = document.querySelectorAll("[data-aba-operacoes]");
    const paineis = {
        reservas: elAdmin("painelReservas"),
        emprestimos: elAdmin("painelEmprestimos"),
    };

    botoes.forEach((botao) => {
        botao.addEventListener("click", () => {
            const abaSelecionada = botao.dataset.abaOperacoes;
            botoes.forEach((item) => {
                const ativo = item === botao;
                item.classList.toggle("ativa", ativo);
                item.setAttribute("aria-selected", String(ativo));
            });
            Object.entries(paineis).forEach(([nome, painel]) => {
                painel.hidden = nome !== abaSelecionada;
            });
            if (window.lucide) window.lucide.createIcons();
        });
    });
}

function configurarMenuAdmin() {
    const sidebar = elAdmin("sidebar");
    const overlay = elAdmin("overlayMenu");

    const alternarMenu = () => {
        sidebar.classList.toggle("aberto");
        overlay.classList.toggle("visivel");
    };

    elAdmin("btnMenu").addEventListener("click", alternarMenu);
    const sidebarToggle = elAdmin("btnSidebarToggle");
    const atualizarIconeSidebar = () => {
        const recolhido = document.body.classList.contains("menu-recolhido");
        sidebarToggle.innerHTML = recolhido
            ? '<i data-lucide="panel-left-open"></i>'
            : '<i data-lucide="panel-left-close"></i>';
        sidebarToggle.setAttribute("aria-label", recolhido ? "Expandir menu" : "Recolher menu");
        sidebarToggle.title = recolhido ? "Expandir menu" : "Recolher menu";
        if (window.lucide) window.lucide.createIcons();
    };
    if (localStorage.getItem("painelAdmSidebar") === "collapsed") {
        document.body.classList.add("menu-recolhido");
    }
    atualizarIconeSidebar();
    sidebarToggle.addEventListener("click", () => {
        const recolhido = document.body.classList.toggle("menu-recolhido");
        localStorage.setItem("painelAdmSidebar", recolhido ? "collapsed" : "expanded");
        atualizarIconeSidebar();
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

let atualizacaoSilenciosaAdminEmAndamento = false;
window.setInterval(async () => {
    if (atualizacaoSilenciosaAdminEmAndamento || document.visibilityState !== "visible") return;
    const ativo = document.activeElement;
    if (ativo?.matches("input, textarea, select, [contenteditable='true']")) return;
    if (document.querySelector('dialog[open], [role="dialog"]:not([hidden]), .modal.show, .modal.aberto')) return;
    if (document.querySelector("form [aria-busy='true'], form button:disabled")) return;
    if (elAdmin("btnAtualizar")?.disabled) return;
    atualizacaoSilenciosaAdminEmAndamento = true;
    try { await carregarPainelAdmin(true); }
    finally { atualizacaoSilenciosaAdminEmAndamento = false; }
}, 30000);
elAdmin("btnVerificarSaude")?.addEventListener("click", verificarSaudeSistemaAdmin);
elAdmin("btnVerTodosLogs").addEventListener("click", async () => { mudarTelaAdmin("logs"); if (!logsCompletosAdmin.length) await carregarLogsCompletosAdmin(); });
elAdmin("btnVoltarAtividades").addEventListener("click", () => mudarTelaAdmin("atividades"));
elAdmin("buscarLogsAdmin").addEventListener("input", () => { paginaLogsAtualAdmin = 1; renderizarLogsCompletosAdmin(); });
elAdmin("btnLogsAnterior").addEventListener("click", () => { paginaLogsAtualAdmin--; renderizarLogsCompletosAdmin(); });
elAdmin("btnLogsProxima").addEventListener("click", () => { paginaLogsAtualAdmin++; renderizarLogsCompletosAdmin(); });
elAdmin("buscarUsuario").addEventListener("input", renderizarUsuariosAdmin);
elAdmin("filtroStatus").addEventListener("change", renderizarUsuariosAdmin);
elAdmin("buscarOperacoesAdmin").addEventListener("input", carregarOperacoesAdmin);
elAdmin("buscarDenunciasAdmin").addEventListener("input", carregarRelatoriosAdmin);
elAdmin("buscarBloqueiosAdmin").addEventListener("input", carregarRelatoriosAdmin);
elAdmin("btnSair").addEventListener("click", sairPainelAdmin);
configurarCadastroAdmin();
configurarAbasEstoqueAdmin();
configurarAbasOperacoesAdmin();
configurarMenuAdmin();
carregarPainelAdmin();
