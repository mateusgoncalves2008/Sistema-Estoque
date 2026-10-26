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

function mostrarToastAdmin(mensagem, tipo = "") {
    const toast = elAdmin("toastAdmin");
    if (!toast) return;
    toast.textContent = String(mensagem || "");
    toast.classList.toggle("error", tipo === "erro");
    toast.classList.toggle("sucesso", tipo === "sucesso");
    toast.classList.add("show");
    clearTimeout(mostrarToastAdmin.timer);
    mostrarToastAdmin.timer = setTimeout(() => toast.classList.remove("show"), 4200);
}


function abrirModalAdmin({ titulo, mensagem = "", campos = [], confirmar = "Confirmar", perigo = false } = {}) {
 const modal=elAdmin("modalAcaoAdmin"),form=elAdmin("formModalAcaoAdmin"),tituloEl=elAdmin("tituloModalAcaoAdmin"),mensagemEl=elAdmin("mensagemModalAcaoAdmin"),camposEl=elAdmin("camposModalAcaoAdmin"),ok=elAdmin("confirmarModalAcaoAdmin"),cancelar=elAdmin("cancelarModalAcaoAdmin");
 if(!modal||!form)return Promise.resolve(null);
 tituloEl.textContent=titulo;mensagemEl.textContent=mensagem;mensagemEl.hidden=!mensagem;
 camposEl.innerHTML=campos.map((c,i)=>{const id="campoModalAcaoAdmin"+i,l=escaparAdmin(c.rotulo),v=escaparAdmin(c.valor??""),n=escaparAdmin(c.nome);
 if(c.tipo==="select")return '<div class="campo-modal-admin"><label for="'+id+'">'+l+'</label><select id="'+id+'" name="'+n+'">'+c.opcoes.map(o=>'<option value="'+escaparAdmin(o.valor)+'"'+(String(o.valor)===String(c.valor)?" selected":"")+'>'+escaparAdmin(o.texto)+'</option>').join("")+'</select></div>';
 if(c.tipo==="textarea")return '<div class="campo-modal-admin"><label for="'+id+'">'+l+'</label><textarea id="'+id+'" name="'+n+'"'+(c.obrigatorio?" required":"")+'>'+v+'</textarea></div>';
 return '<div class="campo-modal-admin"><label for="'+id+'">'+l+'</label><input id="'+id+'" name="'+n+'" type="'+(c.tipo||"text")+'" value="'+v+'"'+(c.obrigatorio?" required":"")+(c.maxlength?' maxlength="'+Number(c.maxlength)+'"':"")+(c.minlength?' minlength="'+Number(c.minlength)+'"':"")+'></div>';
 }).join("");
 ok.textContent=confirmar;ok.classList.toggle("perigo",perigo);modal.hidden=false;modal.setAttribute("aria-hidden","false");document.body.classList.add("modal-admin-aberto");(camposEl.querySelector("input,textarea,select")||ok).focus();
 return new Promise(resolve=>{let done=false;const close=value=>{if(done)return;done=true;form.removeEventListener("submit",submit);cancelar.removeEventListener("click",cancel);modal.removeEventListener("click",backdrop);document.removeEventListener("keydown",keydown);modal.hidden=true;modal.setAttribute("aria-hidden","true");document.body.classList.remove("modal-admin-aberto");resolve(value);};
 const submit=e=>{e.preventDefault();const values={};campos.forEach((c,i)=>{const el=elAdmin("campoModalAcaoAdmin"+i);values[c.nome]=el?(c.tipo==="password"?el.value:el.value.trim()):"";});close(values);};
 const cancel=()=>close(null),backdrop=e=>{if(e.target===modal)close(null);},keydown=e=>{if(e.key==="Escape"&&!modal.hidden)close(null);};
 form.addEventListener("submit",submit);cancelar.addEventListener("click",cancel);modal.addEventListener("click",backdrop);document.addEventListener("keydown",keydown);
 });
}

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
        renderizarGraficosAdmin(dados.graficos || {});
        renderizarAlertasAdmin(dados.alertas || []);
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

function renderizarAlertasAdmin(alertas = []) {
    const lista = elAdmin("listaAlertasAdmin");
    if (!lista) return;
    if (!Array.isArray(alertas) || !alertas.length) {
        lista.innerHTML = '<p class="vazio">Nenhum alerta disponível no momento.</p>';
        return;
    }
    lista.innerHTML = alertas.map((alerta) => {
        const quantidade = Number(alerta.quantidade) || 0;
        return '<article class="alerta-admin-item' + (quantidade > 0 ? ' alerta-ativo' : '') + '">' +
            '<div class="alerta-admin-icone"><i data-lucide="' + (quantidade > 0 ? 'circle-alert' : 'check-circle-2') + '"></i></div>' +
            '<div class="alerta-admin-conteudo"><strong>' + escaparAdmin(alerta.titulo) + '</strong><p>' + escaparAdmin(alerta.descricao) + '</p></div>' +
            '<strong class="alerta-admin-quantidade">' + formatarNumero(quantidade) + '</strong>' +
            '<button type="button" class="btn-secundario" data-ir-alerta="' + escaparAdmin(alerta.destino) + '">Consultar</button>' +
            '</article>';
    }).join("");
    lista.querySelectorAll("[data-ir-alerta]").forEach((botao) => {
        botao.addEventListener("click", () => mudarTelaAdmin(botao.dataset.irAlerta));
    });
    if (window.lucide) window.lucide.createIcons();
}

function renderizarGraficoLinhaAdmin(id, serie, cor, descricao) {
    const container = elAdmin(id);
    if (!container) return;
    const dados = Array.isArray(serie) ? serie : [];
    if (!dados.length) {
        container.innerHTML = '<p class="vazio">Não há dados suficientes para montar este gráfico.</p>';
        return;
    }
    const largura = 640, altura = 250, margemEsquerda = 42, margemDireita = 18, margemTopo = 20, margemBase = 42;
    const areaLargura = largura - margemEsquerda - margemDireita;
    const areaAltura = altura - margemTopo - margemBase;
    const maximo = Math.max(1, ...dados.map((item) => Number(item.total) || 0));
    const teto = maximo === 1 ? 1 : Math.ceil(maximo * 1.15);
    const pontos = dados.map((item, indice) => ({
        x: margemEsquerda + (dados.length === 1 ? areaLargura / 2 : indice * areaLargura / (dados.length - 1)),
        y: margemTopo + areaAltura - ((Number(item.total) || 0) / teto) * areaAltura,
        total: Number(item.total) || 0,
        label: String(item.label || ""),
    }));
    const linhasGrade = Array.from({ length: 5 }, (_, indice) => {
        const y = margemTopo + indice * areaAltura / 4;
        const valor = Math.round(teto * (4 - indice) / 4);
        return '<line x1="' + margemEsquerda + '" y1="' + y + '" x2="' + (largura - margemDireita) + '" y2="' + y + '" class="linha-grade-grafico"/><text x="' + (margemEsquerda - 9) + '" y="' + (y + 4) + '" text-anchor="end" class="rotulo-grafico">' + valor + '</text>';
    }).join("");
    const caminho = pontos.map((ponto, indice) => (indice ? "L" : "M") + ponto.x + " " + ponto.y).join(" ");
    const circulos = pontos.map((ponto) => '<circle cx="' + ponto.x + '" cy="' + ponto.y + '" r="4" fill="' + cor + '" class="ponto-grafico"><title>' + escaparAdmin(ponto.label) + ': ' + ponto.total + '</title></circle>').join("");
    const rotulos = pontos.map((ponto, indice) => '<text x="' + ponto.x + '" y="' + (altura - 15) + '" text-anchor="middle" class="rotulo-grafico">' + escaparAdmin(ponto.label) + '</text>').join("");
    container.innerHTML = '<svg viewBox="0 0 ' + largura + ' ' + altura + '" class="grafico-svg" role="img" aria-label="' + escaparAdmin(descricao) + '">' + linhasGrade + '<path d="' + caminho + '" fill="none" stroke="' + cor + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' + circulos + rotulos + '</svg><div class="legenda-grafico"><span style="background:' + cor + '"></span>' + escaparAdmin(descricao) + '</div>';
}

function renderizarGraficosAdmin(graficos = {}) {
    renderizarGraficoLinhaAdmin("graficoMovimentacoesAdmin", graficos.movimentacoesPorSemana, "#c95730", "Movimentações");
    renderizarGraficoLinhaAdmin("graficoEmprestimosAdmin", graficos.emprestimosPorMes, "#3977b9", "Empréstimos");
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
    elAdmin("totalSetores").textContent = formatarNumero(resumo.setores);
    elAdmin("totalAvisosInicio").textContent = formatarNumero(resumo.avisosPublicados);

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
        const tipo = String(usuario.tipoUsuario || "").trim().toUpperCase();
        const perfil = String(usuario.perfil || "").trim().toUpperCase();
        const ehAlunoOuProfessor = ["ALUNO", "PROFESSOR"].includes(tipo) || ["ALUNO", "PROFESSOR"].includes(perfil);
        const ehResponsavel = ["RESPONSAVEL", "RESPONSÁVEL", "LIDER"].includes(tipo) || ["RESPONSAVEL", "RESPONSÁVEL", "LIDER"].includes(perfil);
        let campos;
        if (ehAlunoOuProfessor) {
            campos = [
                { nome: "email", rotulo: "E-mail", tipo: "email", valor: usuario.email || "", obrigatorio: true, maxlength: 254 },
                { nome: "senha", rotulo: "Nova senha (máx. 6 caracteres; deixe em branco para manter)", tipo: "password", valor: "", maxlength: 6 },
            ];
        } else if (ehResponsavel) {
            campos = [
                { nome: "nome", rotulo: "Nome completo", valor: usuario.nome || "", obrigatorio: true, maxlength: 150 },
                { nome: "email", rotulo: "E-mail", tipo: "email", valor: usuario.email || "", obrigatorio: true, maxlength: 254 },
                { nome: "senha", rotulo: "Nova senha (mín. 12 caracteres; deixe em branco para manter)", tipo: "password", valor: "", minlength: 12, maxlength: 128 },
                { nome: "setorID", rotulo: "ID do setor (opcional)", valor: usuario.setorID || "", maxlength: 100 },
            ];
        } else {
            campos = [
                { nome: "nome", rotulo: "Nome completo", valor: usuario.nome || "", obrigatorio: true, maxlength: 150 },
                { nome: "email", rotulo: "E-mail", tipo: "email", valor: usuario.email || "", obrigatorio: true, maxlength: 254 },
                { nome: "setorID", rotulo: "ID do setor (opcional)", valor: usuario.setorID || "", maxlength: 100 },
            ];
        }
        const dados = await abrirModalAdmin({
            titulo: "Editar usuário",
            mensagem: ehAlunoOuProfessor
                ? "Para alunos e professores, é possível alterar somente o e-mail e a senha."
                : ehResponsavel
                    ? "Para responsáveis, é possível alterar nome, e-mail, senha e setor."
                    : "Atualize os dados da conta selecionada.",
            campos,
            confirmar: "Salvar alterações",
        });
        if (!dados) return;
        if (!dados.email || ((ehResponsavel || !ehAlunoOuProfessor) && !dados.nome)) {
            mostrarToastAdmin("Confira os campos obrigatórios.", "erro");
            return;
        }
        if (dados.senha === "") {
            delete dados.senha;
        } else if (ehAlunoOuProfessor && dados.senha.length > 6) {
            mostrarToastAdmin("A senha de aluno e professor pode ter no máximo 6 caracteres.", "erro");
            return;
        } else if (ehResponsavel && (dados.senha.length < 12 || dados.senha.length > 128)) {
            mostrarToastAdmin("A senha do responsável deve ter no mínimo 12 e no máximo 128 caracteres.", "erro");
            return;
        }
        await enviarAcaoUsuarioAdmin(usuarioID, "PATCH", "", dados);
        return;
    }
    const status=botao.dataset.statusAlvo,acao=status==="ATIVO"?"reativar":"desativar";
    const ok=await abrirModalAdmin({titulo:status==="ATIVO"?"Reativar usuário":"Desativar usuário",mensagem:"Deseja "+acao+" a conta de "+usuario.nome+"?",confirmar:status==="ATIVO"?"Reativar conta":"Desativar conta",perigo:status!=="ATIVO"});
    if(!ok)return;
    await enviarAcaoUsuarioAdmin(usuarioID,"PATCH","/status",{status});
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
        mostrarToastAdmin("Salvo com sucesso.", "sucesso");
        await carregarPainelAdmin();
    } catch (erro) {
        mostrarToastAdmin(erro.message || "Ocorreu um erro.", "erro");
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
            const ok = await abrirModalAdmin({titulo:"Atualizar reserva",mensagem:"Confirma "+statusNovo.toLowerCase()+" a reserva "+botao.dataset.reservaId+"?",confirmar:"Confirmar ação",perigo:statusNovo==="RECUSADA"||statusNovo==="CANCELADA"});
            if(!ok)return;
            botao.disabled = true;
            try {
                const resp = await fetch(API_ADMIN + "/admin/reservas/" + encodeURIComponent(botao.dataset.reservaId) + "/status", {
                    method: "PATCH", credentials: "include",
                    headers: { "Content-Type": "application/json", Accept: "application/json" },
                    body: JSON.stringify({ status: statusNovo })
                });
                const resultado = await resp.json();
                if (!resp.ok || !resultado.sucesso) throw new Error(resultado.mensagem || "Não foi possível atualizar a reserva.");
                mostrarToastAdmin("Salvo com sucesso.", "sucesso");
                await carregarOperacoesAdmin();
            } catch (erro) {
                mostrarToastAdmin(erro.message || "Ocorreu um erro.", "erro");
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
            if(!d)return;
            const analise=await abrirModalAdmin({titulo:"Analisar denúncia "+d.denunciaID,mensagem:d.descricao||d.motivo||"Sem descrição informada.",campos:[
                {nome:"resposta",rotulo:"Resposta da administração",tipo:"textarea",valor:d.resposta||"",obrigatorio:true},
                {nome:"status",rotulo:"Status da denúncia",tipo:"select",valor:d.status||"ANALISADA",opcoes:[
                    {valor:"ANALISADA",texto:"Analisada"},{valor:"RESOLVIDA",texto:"Resolvida"},{valor:"ARQUIVADA",texto:"Arquivada"}
                ]}
            ],confirmar:"Salvar análise"});
            if(!analise)return;
            const resposta=analise.resposta,status=analise.status;
            botao.disabled = true;
            try {
                const r = await fetch(API_ADMIN + "/admin/denuncias/" + encodeURIComponent(d.denunciaID) + "/resposta", {
                    method: "PATCH", credentials: "include",
                    headers: { "Content-Type": "application/json", Accept: "application/json" },
                    body: JSON.stringify({ resposta, status })
                });
                const resultado = await r.json();
                if (!r.ok || !resultado.sucesso) throw new Error(resultado.mensagem || "Não foi possível registrar a análise.");
                mostrarToastAdmin("Salvo com sucesso.", "sucesso");
                await carregarRelatoriosAdmin();
            } catch (erro) {
                mostrarToastAdmin(erro.message || "Ocorreu um erro.", "erro");
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
        sessionStorage.setItem("hauyLogoutConcluido", "1");
        localStorage.removeItem("emailLembrado");
        window.location.replace("/index.html");
    } catch (erro) {
        console.error("Erro ao encerrar sessão:", erro);
        botao.disabled = false;
        botao.querySelector("span").textContent = "Sair";
        mostrarToastAdmin("Não foi possível confirmar a saída. Verifique sua conexão e tente novamente.", "erro");
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
        const preencherFiltro = (id, chave, titulo) => {
            const select = elAdmin(id);
            if (!select) return;
            const atual = select.value;
            const valores = [...new Set(logsCompletosAdmin.map((log) => String(log[chave] || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
            select.innerHTML = '<option value="">' + titulo + '</option>' + valores.map((valor) => '<option value="' + escaparAdmin(valor) + '">' + escaparAdmin(valor) + '</option>').join("");
            if (valores.includes(atual)) select.value = atual;
        };
        preencherFiltro("filtroAcaoLogsAdmin", "acao", "Todas as ações");
        preencherFiltro("filtroResultadoLogsAdmin", "resultado", "Todos os resultados");
        paginaLogsAtualAdmin = 1;
        renderizarLogsCompletosAdmin();
    } catch (erro) {
        tabela.innerHTML = `<tr><td colspan="5" class="vazio">${escaparAdmin(erro.message)}</td></tr>`;
        elAdmin("resumoLogsAdmin").textContent = "Falha ao carregar o histórico.";
    }
}

function renderizarLogsCompletosAdmin() {
    const termo = String(elAdmin("buscarLogsAdmin")?.value || "").trim().toLocaleLowerCase("pt-BR");
    const dataTermo = String(elAdmin("buscarDataLogsAdmin")?.value || "").trim().toLocaleLowerCase("pt-BR");
    const acaoFiltro = String(elAdmin("filtroAcaoLogsAdmin")?.value || "");
    const resultadoFiltro = String(elAdmin("filtroResultadoLogsAdmin")?.value || "");
    const filtrados = logsCompletosAdmin.filter((log) => {
        const textoPesquisa = [log.usuarioNome, log.usuarioID, log.acao, log.tabela, log.registroID, log.descricao, log.resultado, log.dataHora].join(" ").toLocaleLowerCase("pt-BR");
        return textoPesquisa.includes(termo) &&
            String(log.dataHora || "").toLocaleLowerCase("pt-BR").includes(dataTermo) &&
            (!acaoFiltro || String(log.acao || "") === acaoFiltro) &&
            (!resultadoFiltro || String(log.resultado || "") === resultadoFiltro);
    });
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

let avisosAdminCache = [];

async function carregarAvisosAdmin() {
    const lista = elAdmin("listaAvisosAdmin");
    if (!lista) return;
    lista.innerHTML = '<p class="vazio">Carregando avisos da planilha...</p>';
    try {
        const resposta = await fetch(API_ADMIN + "/secretaria/avisos", {
            method: "GET",
            credentials: "include",
            headers: { Accept: "application/json" },
            cache: "no-store",
        });
        const dados = await resposta.json();
        if (resposta.status === 401) { window.location.replace("/index.html"); return; }
        if (!resposta.ok || !dados.sucesso) throw new Error(dados.erro || "Não foi possível carregar os avisos.");
        avisosAdminCache = Array.isArray(dados.avisos) ? dados.avisos : [];
        if (!avisosAdminCache.length) {
            lista.innerHTML = '<p class="vazio">Ainda não há avisos publicados.</p>';
            return;
        }
        lista.innerHTML = avisosAdminCache.map((aviso) => {
            const urgente = String(aviso.prioridade || "").toUpperCase() === "URGENTE";
            return '<article class="aviso-admin-item' + (urgente ? ' urgente' : '') + '">' +
                '<div class="aviso-admin-meta"><span class="aviso-admin-prioridade">' + escaparAdmin(aviso.prioridade || "NORMAL") + '</span><span>' + escaparAdmin(aviso.dataPublicacao || "Data não informada") + '</span></div>' +
                '<h3>' + escaparAdmin(aviso.titulo || "Sem título") + '</h3>' +
                '<p class="aviso-admin-mensagem">' + escaparAdmin(aviso.mensagem || "").replace(/\n/g, "<br>") + '</p>' +
                '<p class="aviso-admin-destino">Destinatários: ' + escaparAdmin(String(aviso.destinatarios || "").split(",").join(", ")) + '</p>' +
                '</article>';
        }).join("");
    } catch (erro) {
        lista.innerHTML = '<p class="mensagem-estado erro">' + escaparAdmin(erro.message || "Erro ao carregar avisos.") + '</p>';
    }
}

function configurarAvisosAdmin() {
    const form = elAdmin("formAvisoAdmin");
    const botao = elAdmin("btnPublicarAvisoAdmin");
    const estado = elAdmin("mensagemEstadoAvisoAdmin");
    if (!form || !botao || !estado) return;
    form.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        const titulo = elAdmin("tituloAvisoAdmin").value.trim();
        const mensagem = elAdmin("mensagemAvisoAdmin").value.trim();
        const prioridade = elAdmin("prioridadeAvisoAdmin").value;
        const destinatarios = elAdmin("destinatariosAvisoAdmin").value;
        if (!titulo || !mensagem) {
            estado.textContent = "Preencha o título e a mensagem.";
            estado.className = "mensagem-aviso-admin erro";
            return;
        }
        botao.disabled = true;
        botao.setAttribute("aria-busy", "true");
        estado.textContent = "Publicando aviso na planilha escolar...";
        estado.className = "mensagem-aviso-admin";
        try {
            const resposta = await fetch(API_ADMIN + "/secretaria/avisos", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ titulo, mensagem, prioridade, destinatarios: [destinatarios] }),
            });
            const dados = await resposta.json();
            if (resposta.status === 401) { window.location.replace("/index.html"); return; }
            if (!resposta.ok || !dados.sucesso) throw new Error(dados.erro || "Não foi possível publicar o aviso.");
            form.reset();
            estado.textContent = dados.mensagem || "Aviso publicado com sucesso.";
            estado.className = "mensagem-aviso-admin sucesso";
            await carregarAvisosAdmin();
            await carregarPainelAdmin(true);
        } catch (erro) {
            estado.textContent = erro.message || "Não foi possível publicar o aviso.";
            estado.className = "mensagem-aviso-admin erro";
        } finally {
            botao.disabled = false;
            botao.removeAttribute("aria-busy");
            if (window.lucide) window.lucide.createIcons();
        }
    });
    elAdmin("btnAtualizarAvisosAdmin")?.addEventListener("click", carregarAvisosAdmin);
}

function converterParaCSVAdmin(cabecalhos, linhas) {
    const escaparCSV = (valor) => '"' + String(valor ?? "").replace(/"/g, '""') + '"';
    return String.fromCharCode(0xFEFF) + [cabecalhos, ...linhas].map((linha) => linha.map(escaparCSV).join(";")).join(String.fromCharCode(13, 10));
}

async function exportarRelatorioAdmin(tipo) {
    const estado = elAdmin("estadoRelatoriosAdmin");
    const botoes = [...document.querySelectorAll("[data-relatorio-admin]")];
    botoes.forEach((botao) => botao.disabled = true);
    if (estado) { estado.textContent = "Consultando dados atualizados da planilha..."; estado.className = "mensagem-estado"; }
    const consultar = async (rota) => {
        const resposta = await fetch(API_ADMIN + rota, { credentials: "include", headers: { Accept: "application/json" }, cache: "no-store" });
        const dados = await resposta.json();
        if (resposta.status === 401) { window.location.replace("/index.html"); throw new Error("Sua sessão expirou."); }
        if (!resposta.ok || dados.sucesso === false) throw new Error(dados.mensagem || dados.erro || "Falha ao consultar dados da planilha.");
        return dados;
    };
    try {
        let nomeArquivo = "relatorio-adm";
        let cabecalhos = [];
        let linhas = [];
        if (tipo === "resumo" || tipo === "usuarios") {
            const dados = await consultar("/admin/dashboard");
            if (tipo === "resumo") {
                nomeArquivo = "resumo-administrativo";
                cabecalhos = ["Indicador", "Quantidade"];
                linhas = Object.entries(dados.resumo || {}).filter(([, valor]) => typeof valor !== "object").map(([chave, valor]) => [chave, valor]);
            } else {
                nomeArquivo = "usuarios";
                cabecalhos = ["UsuarioID", "Nome", "Email", "TipoUsuario", "Perfil", "SetorID", "Status", "DataCadastro", "UltimoLogin"];
                linhas = (dados.usuarios || []).map((u) => [u.usuarioID, u.nome, u.email, u.tipoUsuario, u.perfil, u.setorID, u.status, u.dataCadastro, u.ultimoLogin]);
            }
        } else if (tipo === "estoque") {
            const dados = await consultar("/admin/estoque");
            nomeArquivo = "estoque-e-patrimonio";
            cabecalhos = ["TipoRegistro", "ID", "Codigo", "Nome", "Categoria", "Subcategoria", "Quantidade", "Reservado", "Disponivel", "Indisponivel", "Estado", "Status", "Local", "Responsavel", "UltimaAtualizacao"];
            linhas = [
                ...(dados.produtos || []).map((p) => ["PRODUTO", p.produtoID, p.codigo, p.nome, p.categoria, p.subcategoria, "", "", "", "", p.estado, p.status, "", "", p.dataCadastro]),
                ...(dados.estoque || []).map((e) => ["ESTOQUE_LOCAL", e.estoqueID, "", e.produtoID, "", "", e.quantidade, e.reservado, e.disponivel, e.indisponivel, "", e.status, e.localID, "", e.ultimaAtualizacao]),
                ...(dados.locais || []).map((l) => ["LOCAL", l.localID, l.codigo, l.nome, "", "", "", "", "", "", "", l.status, l.tipo, l.responsavelNome, ""]),
            ];
        } else if (tipo === "operacoes") {
            const dados = await consultar("/admin/operacoes");
            nomeArquivo = "reservas-e-emprestimos";
            cabecalhos = ["Tipo", "ID", "DataSolicitacaoOuRetirada", "UsuarioID", "Usuario", "ProdutoID", "Produto", "LocalID", "Quantidade", "DataInicio", "DataFimOuPrevista", "DataDevolucao", "Status", "MotivoOuObservacao"];
            linhas = [
                ...(dados.reservas || []).map((r) => ["RESERVA", r.reservaID, r.dataSolicitacao, r.usuarioID, r.usuario, r.produtoID, r.produto, r.localID, r.quantidade, r.dataInicio, r.dataFim, "", r.status, r.motivo]),
                ...(dados.emprestimos || []).map((e) => ["EMPRESTIMO", e.emprestimoID, e.dataRetirada, e.usuarioID, e.usuario, e.produtoID, e.produto, e.localID, e.quantidade, "", e.dataPrevistaDevolucao, e.dataDevolucao, e.status, e.observacao]),
            ];
        } else if (tipo === "logs") {
            const dados = await consultar("/admin/logs");
            nomeArquivo = "auditoria";
            cabecalhos = ["LogID", "DataHora", "UsuarioID", "Usuario", "Acao", "Tabela", "RegistroID", "Descricao", "Resultado"];
            linhas = (dados.logs || []).map((l) => [l.logID, l.dataHora, l.usuarioID, l.usuarioNome, l.acao, l.tabela, l.registroID, l.descricao, l.resultado]);
        } else {
            throw new Error("Tipo de relatório desconhecido.");
        }
        if (!linhas.length) {
            if (estado) { estado.textContent = "A consulta foi concluída, mas não há registros para exportar."; estado.className = "mensagem-estado"; }
            return;
        }
        const arquivo = new Blob([converterParaCSVAdmin(cabecalhos, linhas)], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(arquivo);
        const link = document.createElement("a");
        link.href = url;
        link.download = nomeArquivo + "-" + new Date().toISOString().slice(0, 10) + ".csv";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        if (estado) { estado.textContent = "Relatório exportado com dados consultados agora."; estado.className = "mensagem-estado sucesso"; }
    } catch (erro) {
        if (estado) { estado.textContent = erro.message || "Não foi possível exportar o relatório."; estado.className = "mensagem-estado erro"; }
    } finally {
        botoes.forEach((botao) => botao.disabled = false);
    }
}

function mudarTelaAdmin(tela) {
    const titulos = {
        inicio: "Início",
        avisos: "Avisos",
        relatorios: "Relatórios",
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
    if (tela === "avisos") carregarAvisosAdmin();
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
elAdmin("buscarDataLogsAdmin").addEventListener("input", () => { paginaLogsAtualAdmin = 1; renderizarLogsCompletosAdmin(); });
elAdmin("filtroAcaoLogsAdmin").addEventListener("change", () => { paginaLogsAtualAdmin = 1; renderizarLogsCompletosAdmin(); });
elAdmin("filtroResultadoLogsAdmin").addEventListener("change", () => { paginaLogsAtualAdmin = 1; renderizarLogsCompletosAdmin(); });
elAdmin("btnLogsAnterior").addEventListener("click", () => { paginaLogsAtualAdmin--; renderizarLogsCompletosAdmin(); });
elAdmin("btnLogsProxima").addEventListener("click", () => { paginaLogsAtualAdmin++; renderizarLogsCompletosAdmin(); });
elAdmin("buscarUsuario").addEventListener("input", renderizarUsuariosAdmin);
elAdmin("filtroStatus").addEventListener("change", renderizarUsuariosAdmin);
elAdmin("buscarOperacoesAdmin").addEventListener("input", carregarOperacoesAdmin);
elAdmin("buscarDenunciasAdmin").addEventListener("input", carregarRelatoriosAdmin);
elAdmin("buscarBloqueiosAdmin").addEventListener("input", carregarRelatoriosAdmin);
elAdmin("btnSair").addEventListener("click", sairPainelAdmin);
configurarCadastroAdmin();
configurarAvisosAdmin();
document.querySelectorAll("[data-relatorio-admin]").forEach((botao) => botao.addEventListener("click", () => exportarRelatorioAdmin(botao.dataset.relatorioAdmin)));
configurarAbasEstoqueAdmin();
configurarAbasOperacoesAdmin();
configurarMenuAdmin();
carregarPainelAdmin();
