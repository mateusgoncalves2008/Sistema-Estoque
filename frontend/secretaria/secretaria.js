const API_URL = "/api";
let professoresReais = [];
let turmasReais = [];
let turmaSelecionada = null;
let disciplinasReais = [];

const $ = (s) => document.querySelector(s);

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", configurarEventosTurma);
} else {
    configurarEventosTurma();
}
const pad = (n) => String(n).padStart(2, "0");

let page = "inicio";

let users = [];
let prods = [];
let reservas = [];
let emps = [];
let movs = [];
let registrosBloqueios = { colunas: [], registros: [] };
let registrosDenuncias = { colunas: [], registros: [] };

let series = [];
let teachers = [];

let evs = [];
let audit = [];

let disciplinas = [];
let professorTurmas = [];
let locais = [];
let categorias = [];
let acervoProdutos = [];
let acervoLocais = [];
let acervoCategorias = [];
let emprestimosCalendario = [];

let indicadores = {};

let cfg = {
    prazo: 14,
    limite: 3,
    res: {
        Livros: true,
        Computadores: true,
        Equipamentos: false,
    },
};

/* =========================================================
   API
========================================================= */

function obterUsuarioLogado() {
    const bruto = sessionStorage.getItem("usuarioLogado");

    if (!bruto) return null;

    try {
        return JSON.parse(bruto);
    } catch {
        sessionStorage.removeItem("usuarioLogado");
        return null;
    }
}

// Sair da conta sem depender de onclick inline.
document.addEventListener("click", (evento) => {
    const botaoSair = evento.target.closest(".out");
    if (!botaoSair) return;

    evento.preventDefault();
    sessionStorage.removeItem("usuarioLogado");
    window.location.replace("/");
});

// Se a página voltar pelo histórico/cache após sair, retorna ao login.
window.addEventListener("pageshow", () => {
    if (!obterUsuarioLogado()) {
        window.location.replace("/");
    }
});

function headersAPI() {
    const usuario = obterUsuarioLogado();

    return {
        "Content-Type": "application/json",
        "x-usuario-id": usuario?.id || "",
    };
}

async function api(url, opcoes = {}) {
    const resposta = await fetch(API_URL + url, {
        ...opcoes,
        headers: {
            ...headersAPI(),
            ...(opcoes.headers || {}),
        },
    });

    const dados = await resposta.json();

    if (!resposta.ok || dados.sucesso === false) {
        throw new Error(
            dados.erro ||
                dados.detalhe ||
                "Erro na comunicação com o servidor.",
        );
    }

    return dados;
}

/* =========================================================
   CARREGAR DADOS REAIS
========================================================= */

async function carregarDados() {
    try {
        const [dados, dadosTurmas, dadosUsuarios, dadosAcervo, dadosMovimentacoes, dadosBloqueios, dadosDenuncias, dadosCalendario, dadosEmprestimos] = await Promise.all([
            api("/secretaria/dashboard"),
            api("/secretaria/turmas"),
            api("/secretaria/usuarios"),
            api("/secretaria/acervo"),
            api("/secretaria/movimentacoes"),
            api("/secretaria/bloqueios-setor").catch((erro) => {
                console.warn("Não foi possível carregar os bloqueios da Secretaria:", erro);
                return { colunas: [], registros: [] };
            }),
            api("/secretaria/denuncias").catch((erro) => {
                console.warn("Não foi possível carregar as denúncias da Secretaria:", erro);
                return { colunas: [], registros: [] };
            }),
            api("/secretaria/calendario"),
            api("/secretaria/emprestimos"),
        ]);

        registrosBloqueios = { colunas: dadosBloqueios.colunas || [], registros: dadosBloqueios.registros || [] };
        registrosDenuncias = { colunas: dadosDenuncias.colunas || [], registros: dadosDenuncias.registros || [] };

        indicadores = dados.indicadores || {};

        users = (dadosUsuarios.usuarios || []).map((u) => ({
            id: u.usuarioID,
            n: u.nome,
            email: u.email,
            p: "Aluno",
            t: u.turma || u.ano || "-",
            tu: u.turno || "-",
            a: String(u.status || "").toUpperCase() === "ATIVO",
        }));

        acervoProdutos = dadosAcervo.produtos || [];
        acervoLocais = dadosAcervo.locais || [];
        acervoCategorias = dadosAcervo.categorias || [];

        emprestimosCalendario = (dadosEmprestimos.emprestimos || []).map((emprestimo) => ({
            ...emprestimo,
            dataRetirada: emprestimo.dataRetirada || "",
            dataPrevista: emprestimo.dataPrevista || "",
            status: String(emprestimo.status || "").trim().toUpperCase(),
        }));
        prods = acervoProdutos.map((p) => ({
            id: p.produtoID, codigo: p.codigo || "", n: p.nome || "Sem nome", autor: p.autor || "",
            c: p.categoria || "Sem categoria", sub: p.subcategoria || "Sem subcategoria",
            l: (p.estoques || []).map((e) => e.local).filter(Boolean).join(", ") || "Sem local",
            q: Number(p.quantidade || 0), disponivel: Number(p.disponivel || 0),
            reservado: Number(p.reservado || 0), indisponivel: Number(p.indisponivel || 0),
            m: Number(p.estoqueMinimo || 0), estado: p.estado || "—", status: p.status || "—",
            observacao: p.observacao || "", estoques: p.estoques || [],
        }));

        reservas = (dados.reservas || []).map((r) => ({
            id: r.reservaID,
            q: r.usuario || "Usuário",
            i: r.produto || "Produto",
            d: r.dataInicio
                ? new Date(r.dataInicio).toLocaleDateString("pt-BR")
                : "-",
            s: formatarStatusReserva(r.status),
        }));

        emps = (dados.emprestimos || []).map((e) => ({
            id: e.emprestimoID,
            q: e.usuario || "Usuário",
            i: e.produto || "Produto",
            r: e.dataEmprestimo
                ? new Date(e.dataEmprestimo).toLocaleDateString("pt-BR")
                : "-",
            p: e.dataPrevista
                ? new Date(e.dataPrevista).toLocaleDateString("pt-BR")
                : "-",
            s:
                e.situacao === "ATRASADO"
                    ? "Atrasado"
                    : e.situacao === "ABERTO"
                      ? "Em andamento"
                      : "Devolvido",
        }));

        movs = (dadosMovimentacoes.movimentacoes || []).map((m) => {
            const data = m.data ? new Date(String(m.data).replace(" ", "T")) : null;
            return [
                m.movimentacaoID || "-",
                data && !Number.isNaN(data.getTime()) ? data.toLocaleString("pt-BR") : (m.data || "-"),
                formatarTipoMovimentacao(m.tipo),
                m.usuario || m.usuarioID || "—",
                m.produto || m.produtoID || "—",
                String(m.quantidade ?? 0),
                m.localOrigem || "—",
                m.localDestino || "—",
                m.observacao || "—",
            ];
        });

        series = montarTurmas(dadosTurmas.turmas || []);

        disciplinas = dados.disciplinas || [];

        professorTurmas = dados.professorTurmas || [];

        teachers = montarProfessores(
            dados.professores || [],
            dados.turmas || [],
            dados.disciplinas || [],
            professorTurmas,
        );

        evs = (dadosCalendario.eventos || []).map((e) => ({
            id: e.id || e.eventoID || "",
            d: e.data || "",
            dataFim: e.dataFim || e.data || "",
            t: String(e.tipo || "EVENTO").toUpperCase(),
            n: e.titulo || "Evento escolar",
            descricao: e.descricao || "",
            status: String(e.status || "ATIVO").toUpperCase(),
        }));

        locais = dados.locais || [];
        categorias = dados.categorias || [];

        audit = (dados.logs || []).map((l) => [
            l.descricao || l.acao || "Ação",
            l.dataHora
                ? new Date(l.dataHora).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                  })
                : "",
        ]);

        const prazo = Number(dados.configuracoes?.PRAZO_EMPRESTIMO?.valor);

        const limite = Number(dados.configuracoes?.LIMITE_ITENS?.valor);

        cfg.prazo = Number.isFinite(prazo) ? prazo : 14;

        cfg.limite = Number.isFinite(limite) ? limite : 3;

        draw();
    } catch (erro) {
        console.error("Erro ao carregar Secretaria:", erro);

        toast("Não foi possível carregar os dados da planilha.");
    }
}

function formatarStatusReserva(status) {
    const mapa = {
        PENDENTE: "Pendente",
        APROVADA: "Aprovada",
        CANCELADA: "Cancelada",
        REJEITADA: "Rejeitada",
        RECUSADA: "Recusada",
        DEVOLVIDO: "Devolvido",
    };

    return mapa[status] || status || "-";
}

function formatarTipoMovimentacao(tipo) {
    const mapa = {
        ENTRADA: "Entrada",
        SAIDA: "Saída",
        TRANSFERENCIA: "Transferência",
        RESERVA: "Reserva",
        RETIRADA: "Retirada",
        DEVOLUCAO: "Devolução",
        AJUSTE: "Ajuste",
    };

    return mapa[tipo] || tipo || "-";
}

/* =========================================================
   TURMAS
========================================================= */

function montarTurmas(turmas) {
    const mapa = new Map();

    turmas.forEach((t) => {
        const serie = t.serie || "Sem série";

        if (!mapa.has(serie)) {
            mapa.set(serie, []);
        }

        mapa.get(serie).push({
            id: t.turmaID,
            n: t.nome,
            tu: t.turno,
            al: Number(t.alunosAtivos || 0),
            cap: Number(t.capacidade || 0),
            status: t.status,
        });
    });

    return [...mapa.entries()].map(([s, t]) => ({
        s,
        t,
    }));
}

/* =========================================================
   PROFESSORES
========================================================= */

function montarProfessores(professores, turmas, disciplinas, vinculos) {
    return professores.map((p) => {
        const meus = vinculos.filter(
            (v) => v.professorID === p.usuarioID && v.status === "ATIVO",
        );

        return {
            id: p.usuarioID,
            n: p.nome,
            d:
                meus
                    .map(
                        (v) =>
                            disciplinas.find(
                                (d) => d.disciplinaID === v.disciplinaID,
                            )?.nome,
                    )
                    .filter(Boolean)
                    .join(", ") || "-",

            tm: meus.map((v) => {
                const turma = turmas.find((t) => t.turmaID === v.turmaID);

                const disciplina = disciplinas.find(
                    (d) => d.disciplinaID === v.disciplinaID,
                );

                return {
                    id: v.vinculoID,
                    texto: `${turma?.serie || ""} - ` + `${turma?.nome || ""}`,
                    disciplina: disciplina?.nome || "",
                    aulas: Number(v.aulasSemanais || 0),
                };
            }),
        };
    });
}

/* =========================================================
   DASHBOARD
========================================================= */

const G = {
    emp: [[], []],
    sem: [[], []],
    cat: [],
    atr: [],
};

function montarGraficos() {
    const agora = new Date();

    const meses = [];

    for (let i = 5; i >= 0; i--) {
        const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);

        meses.push({
            nome: d.toLocaleDateString("pt-BR", {
                month: "short",
            }),
            mes: d.getMonth(),
            ano: d.getFullYear(),
        });
    }

    G.emp[0] = meses.map((m) => m.nome.replace(".", ""));

    G.emp[1] = meses.map(
        (m) =>
            emps.filter((e) => {
                if (!e.r) return false;

                const partes = e.r.split("/");

                if (partes.length !== 3) {
                    return false;
                }

                return (
                    Number(partes[1]) - 1 === m.mes &&
                    Number(partes[2]) === m.ano
                );
            }).length,
    );

    const tipos = {};

    movs.forEach((m) => {
        const tipo = m[2] || "Outro";
        tipos[tipo] = (tipos[tipo] || 0) + 1;
    });

    G.cat = Object.entries(tipos);

    if (!G.cat.length) {
        G.cat = [["Nenhum", 1]];
    }

    G.sem = [
        ["S1", "S2", "S3", "S4"],
        [
            Math.ceil(indicadores.movimentacoesMes / 4),
            Math.ceil(indicadores.movimentacoesMes / 3),
            Math.ceil(indicadores.movimentacoesMes / 2),
            indicadores.movimentacoesMes,
        ],
    ];

    G.atr = series.map((s) => [
        s.s,
        emps.filter((e) => {
            if (e.s !== "Atrasado") {
                return false;
            }

            return e.q;
        }).length,
    ]);
}

/* =========================================================
   FUNÇÕES VISUAIS
========================================================= */

function log(m) {
    audit.unshift([
        m,
        new Date().toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
        }),
    ]);
}

function toast(m) {
    const t = $("#toast");

    if (!t) return;

    t.textContent = m;
    t.className = "s";

    clearTimeout(toast.h);

    toast.h = setTimeout(() => (t.className = ""), 2400);
}

const T = (h, r) =>
    `<div class="scroll"><table>
        <tr>${h.map((x) => `<th>${x}</th>`).join("")}</tr>
        ${
            r
                .map(
                    (x) => `<tr>${x.map((c) => `<td>${c}</td>`).join("")}</tr>`,
                )
                .join("") ||
            `<tr><td colspan="${h.length}">
                Nada por aqui.
            </td></tr>`
        }
    </table></div>`;

const tg = (t, c) => `<span class="tag ${c || ""}">${t}</span>`;

function countUp() {
    document.querySelectorAll("[data-n]").forEach((e) => {
        const n = Number(e.dataset.n || 0);

        e.textContent = n;
    });
}

function kv(id, valor) {
    const e = $("#" + id);

    if (!e) return;

    e.dataset.n = Number(valor || 0);
    e.textContent = Number(valor || 0);
}

/* =========================================================
   TURMAS
========================================================= */

function abrirModalTurma() {
    const modal = $("#modal-turma");
    if (!modal) return;

    modal.classList.add("aberto");
    modal.setAttribute("aria-hidden", "false");
    $("#tn")?.focus();
}

function fecharModalTurma() {
    const modal = $("#modal-turma");
    if (!modal) return;

    modal.classList.remove("aberto");
    modal.setAttribute("aria-hidden", "true");
}

function configurarEventosTurma() {
    document.querySelectorAll('[data-acao="abrir-modal-turma"]').forEach((botao) => {
        botao.addEventListener("click", abrirModalTurma);
    });

    document.querySelectorAll('[data-acao="fechar-modal-turma"]').forEach((botao) => botao.addEventListener("click", fecharModalTurma));
    document.querySelectorAll('[data-acao="fechar-detalhes-turma"]').forEach((botao) => botao.addEventListener("click", fecharDetalhesTurma));
    document.querySelectorAll('[data-acao="alternar-status-turma"]').forEach((botao) => botao.addEventListener("click", alternarStatusTurma));
    $("#busca-turmas")?.addEventListener("input", renderizarListaTurmas);
    $("#form-editar-turma")?.addEventListener("submit", salvarEdicaoTurma);

    const formulario = $("#form-turma");
    if (formulario) {
        formulario.addEventListener("submit", (evento) => {
            evento.preventDefault();
            addT();
        });
    }
}

async function addT() {
    const serie = $("#ts")?.value.trim();
    const nome = $("#tn")?.value.trim();
    const turno = $("#tt")?.value.trim();
    const capacidade = Number($("#tc")?.value);
    const botao = $("#btn-criar-turma");

    if (!serie || !nome || !turno) {
        return toast("Preencha todos os dados da turma.");
    }

    if (!Number.isInteger(capacidade) || capacidade < 0 || capacidade > 500) {
        return toast("Informe um limite máximo entre 0 e 500 alunos.");
    }

    if (botao) {
        botao.disabled = true;
        botao.textContent = "Criando...";
    }

    try {
        await api("/secretaria/turmas", {
            method: "POST",
            body: JSON.stringify({ nome, serie, turno, capacidade }),
        });

        $("#form-turma")?.reset();
        fecharModalTurma();
        toast("Turma criada com sucesso.");
        await carregarDados();
    } catch (erro) {
        toast(erro.message);
    } finally {
        if (botao) {
            botao.disabled = false;
            botao.textContent = "Criar";
        }
    }
}

function escHtml(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function obterTodasTurmas() {
    return series.flatMap((g) => g.t.map((t) => ({...t, serie:g.s})));
}
function renderizarListaTurmas() {
    const area=$("#series"); if(!area) return;
    const busca=($("#busca-turmas")?.value||"").trim().toLocaleLowerCase("pt-BR");
    const todas=obterTodasTurmas();
    const lista=todas.filter(t=>[t.n,t.serie,t.tu,t.id,t.status].some(v=>String(v||"").toLocaleLowerCase("pt-BR").includes(busca)));
    const resumo=$("#resultado-turmas"); if(resumo) resumo.textContent=`${lista.length} de ${todas.length} turma(s)`;
    if(!lista.length){area.innerHTML='<div class="card turmas-vazio"><strong>Nenhuma turma encontrada</strong><p class="sub">Tente outro nome, série ou turno.</p></div>';return;}
    area.innerHTML=lista.map(t=>{
        const cap=Number(t.cap||0), al=Number(t.al||0), pc=cap?Math.min(100,Math.round(al/cap*100)):0;
        const aberta=String(t.status||"").toUpperCase()==="ABERTO";
        const limiteVermelho=Math.floor(cap*0.30);
        const limiteAmarelo=Math.round(cap*0.50);
        const alerta=cap>0&&al<=limiteVermelho?"critica":cap>0&&al<=limiteAmarelo?"atencao":"";
        const textoOcupacao=alerta==="critica"?"Risco de fechamento":alerta==="atencao"?"Poucos alunos matriculados":"Ocupação";
        return `<button class="card turma-card ${alerta ? "turma-card--" + alerta : ""}" type="button" data-turma-id="${escHtml(t.id)}">
            <div class="turma-card__topo"><span class="turma-card__icone"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V8l9-5 9 5v13M8 21v-7h8v7M7 10h.01M12 10h.01M17 10h.01"></path></svg></span><span class="turma-status ${aberta?"aberta":"fechada"}">${aberta?"Aberta":"Fechada"}</span></div>
            <span class="turma-card__serie">${escHtml(t.serie)}</span><strong class="turma-card__nome">${escHtml(t.n)}</strong>
            <span class="turma-card__turno">${escHtml(t.tu)} • Código ${escHtml(t.id||"—")}</span>
            <div class="turma-card__ocupacao"><span>${textoOcupacao}</span><strong>${al} de ${cap} alunos</strong></div><div class="prog turma-card__barra ${alerta ? "turma-card__barra--" + alerta : ""}"><i style="width:${pc}%"></i></div>
            <span class="turma-card__rodape">Ver informações e gerenciar <span aria-hidden="true">→</span></span></button>`;
    }).join("");
    area.querySelectorAll("[data-turma-id]").forEach(card=>card.addEventListener("click",()=>abrirDetalhesTurma(card.dataset.turmaId)));
}
function abrirDetalhesTurma(id) {
    turmaSelecionada=obterTodasTurmas().find(t=>String(t.id)===String(id)); if(!turmaSelecionada)return;
    const aberta=String(turmaSelecionada.status||"").toUpperCase()==="ABERTO";
    $("#titulo-detalhes-turma").textContent=turmaSelecionada.n;
    $("#detalhe-turma-id").textContent=`Código: ${turmaSelecionada.id||"—"}`;
    $("#detalhes-turma-conteudo").innerHTML=`<div class="turma-detalhes-grid">
      <div><span>Série</span><strong>${escHtml(turmaSelecionada.serie)}</strong></div><div><span>Turno atual</span><strong>${escHtml(turmaSelecionada.tu)}</strong></div>
      <div><span>Alunos matriculados</span><strong>${Number(turmaSelecionada.al||0)}</strong></div><div><span>Limite máximo</span><strong>${Number(turmaSelecionada.cap||0)}</strong></div>
      <div><span>Vagas disponíveis</span><strong>${Math.max(0,Number(turmaSelecionada.cap||0)-Number(turmaSelecionada.al||0))}</strong></div>
      <div><span>Situação</span><strong>${aberta?"Aberta para matrículas":"Fechada para matrículas"}</strong></div></div>
      <p class="sub turma-detalhe-aviso">O limite não pode ficar abaixo da quantidade de alunos matriculados.</p>`;
    $("#detalhe-turno").value=["Manhã","Tarde","Noite"].includes(turmaSelecionada.tu)?turmaSelecionada.tu:"Manhã";
    $("#detalhe-capacidade").value=Number(turmaSelecionada.cap||0);
    $("#btn-status-turma").textContent=aberta?"Fechar turma para matrículas":"Reabrir turma";
    $("#btn-status-turma").classList.toggle("btn-perigo",aberta);
    const modal=$("#modal-detalhes-turma");modal.classList.add("aberto");modal.setAttribute("aria-hidden","false");
}
function fecharDetalhesTurma(){const m=$("#modal-detalhes-turma");if(m){m.classList.remove("aberto");m.setAttribute("aria-hidden","true");}turmaSelecionada=null;}
async function salvarEdicaoTurma(e){
    e.preventDefault();if(!turmaSelecionada)return;
    const capacidade=Number($("#detalhe-capacidade").value),turno=$("#detalhe-turno").value;
    if(!Number.isInteger(capacidade)||capacidade<0||capacidade>500)return toast("Informe um limite entre 0 e 500 alunos.");
    if(capacidade<Number(turmaSelecionada.al||0))return toast("O limite não pode ser menor que os alunos já matriculados.");
    const b=$("#btn-salvar-turma");b.disabled=true;
    try{await api(`/secretaria/turmas/${encodeURIComponent(turmaSelecionada.id)}`,{method:"PATCH",body:JSON.stringify({capacidade,turno})});fecharDetalhesTurma();toast("Turma atualizada com sucesso.");await carregarDados();}
    catch(err){toast(err.message);}finally{b.disabled=false;}
}
async function alternarStatusTurma(){
    if(!turmaSelecionada)return;const aberta=String(turmaSelecionada.status||"").toUpperCase()==="ABERTO",status=aberta?"FECHADO":"ABERTO",b=$("#btn-status-turma");b.disabled=true;
    try{await api(`/secretaria/turmas/${encodeURIComponent(turmaSelecionada.id)}`,{method:"PATCH",body:JSON.stringify({status})});fecharDetalhesTurma();toast(aberta?"Turma fechada para novas matrículas.":"Turma reaberta.");await carregarDados();}
    catch(err){toast(err.message);}finally{b.disabled=false;}
}

/* =========================================================
   USUÁRIOS
========================================================= */

function uList() {
    const busca = ($("#uq")?.value || "").trim().toLocaleLowerCase("pt-BR");
    const filtro = $("#uf")?.value || "";

    const filtrados = users.filter((u) => {
        const nome = String(u.n || "").toLocaleLowerCase("pt-BR");
        return nome.startsWith(busca) && (!filtro || u.p === filtro);
    });

    const tabela = $("#ut2");
    if (!tabela) return;

    tabela.innerHTML = T(
        ["Nome", "Turma", "Turno", "Situação", "Ações"],
        filtrados.map((u) => [
            `<b>${escHtml(u.n)}</b>`,
            escHtml(u.t),
            escHtml(u.tu),
            u.a ? tg("Ativo") : tg("Inativo", "m"),
            `
                <button
                    type="button"
                    class="btn s"
                    data-usuario-status="${escHtml(u.id || "")}"
                    data-status-atual="${u.a ? "ATIVO" : "INATIVO"}"
                    ${u.id ? "" : "disabled"}
                >${u.a ? "Desativar" : "Reativar"}</button>
            `,
        ]),
    );
}

// Filtros das listas de bloqueios e denúncias.
document.addEventListener("input", (evento) => {
    if (evento.target.matches("#buscar-denuncia")) renderizarRegistrosPlanilha("#t-denuncias", "#denuncias-resumo", registrosDenuncias, "denúncia(s)");
    if (evento.target.matches("#buscar-bloqueio")) renderizarRegistrosPlanilha("#t-bloqueios", "#bloqueios-resumo", registrosBloqueios, "bloqueio(s)");
});
document.addEventListener("change", (evento) => {
    if (evento.target.matches("#filtrar-status-denuncia")) renderizarRegistrosPlanilha("#t-denuncias", "#denuncias-resumo", registrosDenuncias, "denúncia(s)");
    if (evento.target.matches("#filtrar-status-bloqueio")) renderizarRegistrosPlanilha("#t-bloqueios", "#bloqueios-resumo", registrosBloqueios, "bloqueio(s)");
});

// Delegação de eventos: funciona mesmo quando a tabela é recriada.
document.addEventListener("click", (evento) => {
    const botao = evento.target.closest("#ut2 button[data-usuario-status]");
    if (!botao || botao.disabled) return;

    evento.preventDefault();
    const usuarioID = botao.dataset.usuarioStatus;
    const statusAtual = botao.dataset.statusAtual;

    if (!usuarioID || !["ATIVO", "INATIVO"].includes(statusAtual)) {
        toast("Não foi possível identificar o usuário.");
        return;
    }

    togUser(usuarioID, statusAtual);
});

async function togUser(usuarioID, statusAtual) {
    const tabela = $("#ut2");
    const botao = tabela?.querySelector(
        `button[data-usuario-status="${CSS.escape(usuarioID)}"]`,
    );

    if (botao) {
        botao.disabled = true;
        botao.textContent = "Salvando...";
    }

    try {
        const novoStatus = statusAtual === "ATIVO" ? "INATIVO" : "ATIVO";

        await api(
            `/secretaria/usuarios/${encodeURIComponent(usuarioID)}/status`,
            {
                method: "PATCH",
                body: JSON.stringify({ status: novoStatus }),
            },
        );

        toast(novoStatus === "INATIVO" ? "Usuário desativado." : "Usuário reativado.");
        await carregarDados();
    } catch (erro) {
        toast(erro.message || "Não foi possível alterar o status.");
        if (botao) {
            botao.disabled = false;
            botao.textContent = statusAtual === "ATIVO" ? "Desativar" : "Reativar";
        }
    }
}

async function addUser() {
    const nome = $("#un")?.value.trim();

    const perfil = $("#up")?.value;

    if (!nome) {
        return toast("Informe o nome.");
    }

    toast("O cadastro de usuário precisa de e-mail.");
}

/* =========================================================
   RESERVAS
========================================================= */

async function resv(reservaID, acao) {
    const rotas = {
        Aprovada: "aprovar",
        Recusada: "recusar",
        Cancelada: "cancelar",
    };
    const rota = rotas[acao];

    if (!rota) return toast("Ação de reserva inválida.");

    try {
        const corpo = rota === "aprovar"
            ? { aprovadoPor: obterUsuarioLogado()?.id || "" }
            : {};

        await api(
            `/secretaria/reservas/${encodeURIComponent(reservaID)}/${rota}`,
            {
                method: "PATCH",
                body: JSON.stringify(corpo),
            },
        );

        toast(
            rota === "aprovar" ? "Reserva aprovada."
                : rota === "recusar" ? "Reserva recusada."
                : "Reserva cancelada.",
        );

        await carregarDados();
    } catch (erro) {
        toast(erro.message);
    }
}

/* =========================================================
   DEVOLUÇÕES
========================================================= */

async function devolve(emprestimoID) {
    try {
        await api(
            `/secretaria/emprestimos/${encodeURIComponent(
                emprestimoID,
            )}/devolucao`,
            {
                method: "POST",
                body: JSON.stringify({}),
            },
        );

        toast("Devolução registrada.");

        await carregarDados();
    } catch (erro) {
        toast(erro.message);
    }
}

/* =========================================================
   ESTOQUE
========================================================= */

async function ajusta(estoqueID, quantidade) {
    try {
        await api(`/secretaria/estoque/${encodeURIComponent(estoqueID)}`, {
            method: "PATCH",
            body: JSON.stringify({
                quantidade,
            }),
        });

        toast("Estoque atualizado.");

        await carregarDados();
    } catch (erro) {
        toast(erro.message);
    }
}

/* =========================================================
   CALENDÁRIO
========================================================= */

async function addEv(botao) {
    if (botao?.disabled) return;

    if (botao) {
        botao.disabled = true;
        botao.dataset.textoOriginal = botao.textContent;
        botao.textContent = "Salvando...";
    }

    try {
        const data = $("#cd")?.value;
        const tipoSelecionado = $("#ct")?.value;
        const tipoPersonalizado = $("#ct-personalizado")?.value.trim();
        const tipo = (tipoPersonalizado || tipoSelecionado || "").toLocaleUpperCase("pt-BR");
        const titulo = $("#cn")?.value.trim();

        if (!data || !tipo || !titulo) {
            toast("Preencha data, tipo e descrição.");
            return;
        }

        await api("/secretaria/calendario", {
            method: "POST",
            body: JSON.stringify({
                data,
                dataFim: data,
                tipo,
                titulo,
                descricao: titulo,
            }),
        });

        toast("Evento criado.");
        await carregarDados();
    } catch (erro) {
        toast(erro.message);
    } finally {
        if (botao) {
            botao.disabled = false;
            botao.textContent = botao.dataset.textoOriginal || "Adicionar";
            delete botao.dataset.textoOriginal;
        }
    }
}

document.addEventListener("click", (evento) => {
    const botao = evento.target.closest("#btn-adicionar-evento");
    if (!botao) return;
    addEv(botao);
});

/* =========================================================
   CONFIGURAÇÕES
========================================================= */

async function saveCfg() {
    const prazo = Number($("#cp")?.value);

    const limite = Number($("#cl")?.value);

    try {
        await api("/secretaria/configuracoes", {
            method: "PATCH",
            body: JSON.stringify({
                prazo,
                limite,
            }),
        });

        cfg.prazo = prazo;
        cfg.limite = limite;

        toast("Configurações salvas.");

        await carregarDados();
    } catch (erro) {
        toast(erro.message);
    }
}

/* =========================================================
   GRÁFICOS
========================================================= */

const grid = (W, H, m) =>
    [0, 1, 2, 3]
        .map((i) => {
            const y = H - m - ((H - m * 2) * i) / 3;

            return `<line
                x1="${m}"
                x2="${W - m}"
                y1="${y}"
                y2="${y}"
                stroke="var(--line)"
            />`;
        })
        .join("");

function bars(v, l) {
    v = (Array.isArray(v) ? v : []).map((valor) => {
        const n = Number(valor);
        return Number.isFinite(n) ? n : 0;
    });
    l = Array.isArray(l) ? l : [];

    const W = 520;
    const H = 230;
    const m = 30;

    const mx = Math.max(...v, 1) * 1.15;

    const bw = (W - m * 2) / Math.max(v.length, 1);

    let s = `
        <svg
            viewBox="0 0 ${W} ${H}"
            style="width:100%;height:auto"
        >
        ${grid(W, H, m)}
    `;

    v.forEach((x, i) => {
        const h = ((H - m * 2) * x) / mx;

        const X = m + i * bw + bw * 0.2;

        const cx = X + bw * 0.3;

        s += `
            <rect
                x="${X}"
                y="${H - m - h}"
                width="${bw * 0.6}"
                height="${h}"
                rx="6"
                fill="var(--c1)"
            >
                <title>
                    ${escHtml(l[i] || "")}: ${x}
                </title>
            </rect>

            <text
                x="${cx}"
                y="${H - m - h - 7}"
                text-anchor="middle"
                font-size="12"
                font-weight="700"
                fill="var(--text)"
            >${x}</text>

            <text
                x="${cx}"
                y="${H - 9}"
                text-anchor="middle"
                font-size="12"
                fill="var(--mute)"
            >${escHtml(l[i] || "")}</text>
        `;
    });

    return s + "</svg>";
}

function line(v, l) {
    v = (Array.isArray(v) ? v : []).map((valor) => {
        const n = Number(valor);
        return Number.isFinite(n) ? n : 0;
    });
    l = Array.isArray(l) ? l : [];

    if (!v.length) {
        return "";
    }

    const W = 520;
    const H = 230;
    const m = 30;

    const mx = Math.max(...v, 1) * 1.15;

    const st = v.length === 1 ? 0 : (W - m * 2) / (v.length - 1);

    const pt = v.map((x, i) => [m + i * st, H - m - ((H - m * 2) * x) / mx]);

    const d = pt.map((p) => p.join(",")).join(" ");

    let s = `
        <svg
            viewBox="0 0 ${W} ${H}"
            style="width:100%;height:auto"
        >
        ${grid(W, H, m)}

        <polyline
            points="${d}"
            fill="none"
            stroke="var(--c2)"
            stroke-width="3"
            stroke-linejoin="round"
            stroke-linecap="round"
        />
    `;

    pt.forEach((p, i) => {
        s += `
            <circle
                cx="${p[0]}"
                cy="${p[1]}"
                r="5"
                fill="var(--card)"
                stroke="var(--c2)"
                stroke-width="3"
            />

            <text
                x="${p[0]}"
                y="${H - 9}"
                text-anchor="middle"
                font-size="12"
                fill="var(--mute)"
            >${escHtml(l[i] || "")}</text>
        `;
    });

    return s + "</svg>";
}

function donut(it) {
    if (!it.length) {
        return "";
    }

    const C = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)"];

    const tot = it.reduce((a, b) => a + b[1], 0);

    if (!tot) return "";

    const r = 62;
    const L = 2 * Math.PI * r;

    let offset = 0;

    let s = `
        <svg
            viewBox="0 0 170 170"
            width="170"
            height="170"
        >
        <g transform="rotate(-90 85 85)">
    `;

    it.forEach((x, i) => {
        const f = (L * x[1]) / tot;

        s += `
            <circle
                cx="85"
                cy="85"
                r="${r}"
                fill="none"
                stroke="${C[i % C.length]}"
                stroke-width="26"
                stroke-dasharray="${f} ${L - f}"
                stroke-dashoffset="${-offset}"
            />
        `;

        offset += f;
    });

    s += `
        </g>

        <text
            x="85"
            y="88"
            text-anchor="middle"
            font-size="26"
            font-weight="800"
            fill="var(--text)"
        >${tot}</text>

        <text
            x="85"
            y="106"
            text-anchor="middle"
            font-size="11"
            fill="var(--mute)"
        >usos no mês</text>

        </svg>
    `;

    return `
        <div class="dn">
            ${s}
            <div class="leg">
                ${it
                    .map(
                        (x, i) =>
                            `<span style="--c:${C[i % C.length]}">
                                ${escHtml(x[0])} - ${x[1]}
                            </span>`,
                    )
                    .join("")}
            </div>
        </div>
    `;
}

function hb(it) {
    const mx = Math.max(...it.map((x) => x[1]), 1);

    return it
        .map(
            (x) =>
                `<div class="hb">
                    <span>${escHtml(x[0])}</span>
                    <div>
                        <i style="width:${(x[1] / mx) * 100}%"></i>
                    </div>
                    <b>${x[1]}</b>
                </div>`,
        )
        .join("");
}

function ring(p, t) {
    const r = 58;
    const L = 2 * Math.PI * r;

    return `
        <div class="dn">
            <svg
                viewBox="0 0 150 150"
                width="170"
                height="170"
            >
                <g transform="rotate(-90 75 75)">
                    <circle
                        cx="75"
                        cy="75"
                        r="${r}"
                        fill="none"
                        stroke="var(--line)"
                        stroke-width="16"
                    />

                    <circle
                        cx="75"
                        cy="75"
                        r="${r}"
                        fill="none"
                        stroke="var(--c2)"
                        stroke-width="16"
                        stroke-linecap="round"
                        stroke-dasharray="${(L * p) / 100} ${L}"
                    />
                </g>

                <text
                    x="75"
                    y="82"
                    text-anchor="middle"
                    font-size="30"
                    font-weight="800"
                    fill="var(--text)"
                >${p}%</text>
            </svg>

            <p class="sub">${t}</p>
        </div>
    `;
}


function formatarNomeCampoPlanilha(nome) {
    const original = String(nome || "").trim();
    const normalizado = original.replace(/[_\s-]/g, "").toLocaleLowerCase("pt-BR");
    const nomes = {
        denunciadonome: "Denunciado",
        denunciantenome: "Denunciante",
        respostasecretaria: "Resposta Secretaria",
        datahora: "Data e hora",
        denunciaid: "ID da denúncia",
        bloqueioid: "ID do bloqueio",
        usuarioid: "ID do usuário",
        setorid: "ID do setor",
        datacadastro: "Data de cadastro",
        dataregistro: "Data do registro",
        motivo: "Motivo",
        descricao: "Descrição",
        status: "Status",
    };
    if (nomes[normalizado]) return nomes[normalizado];
    return original
        .replace(/([a-zá-ú])([A-ZÁ-Ú])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^([a-zá-ú])/i, (letra) => letra.toLocaleUpperCase("pt-BR"));
}

function separarDataHora(valor) {
    const texto = String(valor ?? "").trim();
    if (!texto) return { data: "", hora: "" };
    const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)/);
    if (iso) return { data: iso[3] + "/" + iso[2] + "/" + iso[1], hora: iso[4] };
    const brasileira = texto.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})[T ]+(\d{1,2}:\d{2}(?::\d{2})?)/);
    if (brasileira) return { data: brasileira[1], hora: brasileira[2] };
    const dataSozinha = texto.match(/^\d{4}-\d{2}-\d{2}$/);
    if (dataSozinha) return { data: texto.split("-").reverse().join("/"), hora: "" };
    return { data: texto, hora: "" };
}

function camposExibicaoPlanilha(colunas, linha) {
    const campos = [];
    colunas.forEach((coluna, i) => {
        const chave = String(coluna || "").replace(/[_\s-]/g, "").toLocaleLowerCase("pt-BR");
        const valor = String(linha[i] ?? "").trim() || "—";
        if (chave === "datahora") {
            const partes = separarDataHora(valor === "—" ? "" : valor);
            campos.push({ nome: "Data", valor: partes.data || "—" });
            campos.push({ nome: "Hora", valor: partes.hora || "—" });
        } else {
            campos.push({ nome: formatarNomeCampoPlanilha(coluna || ("Coluna " + (i + 1))), valor });
        }
    });
    return campos;
}

function renderizarRegistrosPlanilha(seletorTabela, seletorResumo, dados, singular) {
    const tabela = $(seletorTabela);
    const resumo = $(seletorResumo);
    if (!tabela || !resumo) return;

    const colunas = dados.colunas || [];
    const registros = dados.registros || [];
    const bloqueios = seletorTabela === "#t-bloqueios";
    const normalizar = (valor) => String(valor || "").trim().toLocaleUpperCase("pt-BR");
    const statusIndex = colunas.findIndex((c) => /status|situa/i.test(String(c)));
    const statusRegistro = (linha) => normalizar(statusIndex >= 0 ? linha[statusIndex] : "") || "PENDENTE";

    if (bloqueios) {
        const pendentes = registros.filter((linha) => statusRegistro(linha) === "PENDENTE").length;
        if ($("#bloqueios-total")) $("#bloqueios-total").textContent = registros.length;
        if ($("#bloqueios-pendentes")) $("#bloqueios-pendentes").textContent = pendentes;
        if ($("#bloqueios-outros")) $("#bloqueios-outros").textContent = registros.length - pendentes;
    } else {
        const pendentes = registros.filter((linha) => statusRegistro(linha) !== "RESOLVIDO").length;
        const resolvidas = registros.length - pendentes;
        if ($("#denuncias-total")) $("#denuncias-total").textContent = registros.length;
        if ($("#denuncias-pendentes")) $("#denuncias-pendentes").textContent = pendentes;
        if ($("#denuncias-resolvidas")) $("#denuncias-resolvidas").textContent = resolvidas;
    }

    const busca = String($(bloqueios ? "#buscar-bloqueio" : "#buscar-denuncia")?.value || "").trim().toLocaleLowerCase("pt-BR");
    const filtroStatus = normalizar($(bloqueios ? "#filtrar-status-bloqueio" : "#filtrar-status-denuncia")?.value || "TODOS");
    const filtrados = registros.map((linha, indice) => ({ linha, indice })).filter(({ linha }) => {
        const textoRegistro = [ ...colunas.map((_, i) => String(linha[i] ?? "")) ].join(" ").toLocaleLowerCase("pt-BR");
        const correspondeBusca = !busca || textoRegistro.includes(busca);
        const status = statusRegistro(linha);
        const correspondeStatus = filtroStatus === "TODOS"
            || status === filtroStatus
            || (filtroStatus === "PENDENTE" && status !== "RESOLVIDO" && status !== "ATIVO" && status !== "INATIVO" && status !== "BLOQUEADO");
        return correspondeBusca && correspondeStatus;
    });

    resumo.innerHTML = '<span class="registros-contador">' + filtrados.length + ' de ' + registros.length + ' ' + singular + ' encontrado(s)</span>';

    if (!colunas.length || !filtrados.length) {
        const mensagem = !colunas.length
            ? "A aba ainda não possui cabeçalhos ou não retornou dados."
            : (registros.length ? "Nenhum " + (bloqueios ? "bloqueio" : "denúncia") + " corresponde aos filtros selecionados." : "Nenhum " + (bloqueios ? "bloqueio" : "denúncia") + " registrado até o momento.");
        tabela.innerHTML = '<div class="registros-vazio"><span class="registros-vazio__icone">⌕</span><strong>' +
            escHtml(mensagem) + '</strong><p>Quando houver registros, eles aparecerão nesta área.</p></div>';
        return;
    }

    tabela.innerHTML = '<div class="registros-cards">' + filtrados.map(({ linha, indice }) => {
        const valor = (i) => String(linha[i] ?? "").trim();
        const nomeIndex = colunas.findIndex((c) => /denunciado.?nome|denunciante.?nome|nome|aluno|usuario|usuário/i.test(String(c)));
        const motivoIndex = colunas.findIndex((c) => /motivo|descri|relato|justificativa/i.test(String(c)));
        const dataIndex = colunas.findIndex((c) => /data|hora|criado/i.test(String(c)));
        const idIndex = colunas.findIndex((c) => /(^id$|bloqueioid|denuncia.?id|registro.?id)/i.test(String(c)));
        const nome = nomeIndex >= 0 && valor(nomeIndex) ? valor(nomeIndex) : (idIndex >= 0 && valor(idIndex) ? valor(idIndex) : "Registro " + (indice + 1));
        const motivo = motivoIndex >= 0 ? valor(motivoIndex) : "";
        const data = dataIndex >= 0 ? valor(dataIndex) : "";
        const status = statusRegistro(linha);
        const detalhes = camposExibicaoPlanilha(colunas, linha).map((campo) => '<div class="bloqueio-detalhe-campo"><span>' +
            escHtml(campo.nome) + '</span><strong>' + escHtml(campo.valor) + '</strong></div>').join("");
        const classeStatus = status === "RESOLVIDO" || status === "ATIVO" ? "resolvido" : (status === "INATIVO" || status === "BLOQUEADO" ? "bloqueado" : "pendente");
        return '<button type="button" class="registro-card ' + (bloqueios ? 'registro-card--bloqueio' : 'registro-card--denuncia') +
            '" data-registro-tipo="' + (bloqueios ? 'bloqueio' : 'denuncia') + '" data-registro-indice="' + indice + '">' +
            '<span class="registro-card__topo"><span class="registro-card__icone"><svg viewBox="0 0 24 24" aria-hidden="true">' +
            (bloqueios ? '<path d="M12 3 5 6v5c0 4.5 3 7.5 7 10 4-2.5 7-5.5 7-10V6l-7-3Z"/><path d="m9 9 6 6m0-6-6 6"/>' : '<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v4m0 3h.01"/>') +
            '</svg></span><span class="registro-card__status registro-card__status--' + classeStatus + '">' + escHtml(status) + '</span></span>' +
            '<strong class="registro-card__nome">' + escHtml(nome) + '</strong>' +
            (data ? '<span class="registro-card__data"><span>Data</span> ' + escHtml(data) + '</span>' : '') +
            (motivo ? '<span class="registro-card__motivo">' + escHtml(motivo) + '</span>' : '') +
            '<span class="registro-card__rodape">' + (bloqueios ? 'Ver detalhes do registro' : 'Ver detalhes e responder') + ' <span aria-hidden="true">↗</span></span>' +
            '<span class="registro-card__dados" hidden>' + detalhes + '</span></button>';
    }).join("") + '</div>';
}


/* =========================================================
   RENDERIZAÇÃO
========================================================= */


let mesCalendarioSecretaria = new Date().getMonth();
let anoCalendarioSecretaria = new Date().getFullYear();
let filtroCalendarioSecretaria = "geral";

const CORES_CAL_SECRETARIA = {
    FERIADO: "#c94736",
    RECESSO: "#9860ce",
    EVENTO: "#3475bf",
    REUNIAO: "#788d32",
    PROVA: "#d9a441",
};

function escaparCalSecretaria(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
}

function chaveCalSecretaria(data) {
    return [data.getFullYear(), String(data.getMonth() + 1).padStart(2, "0"), String(data.getDate()).padStart(2, "0")].join("-");
}

function dataCalSecretaria(valor) {
    const bruto = String(valor ?? "").trim();
    if (!bruto) return null;

    // O Google Sheets pode devolver datas como número serial.
    if (/^\d+(\.\d+)?$/.test(bruto)) {
        const serial = Number(bruto);
        if (serial > 20000 && serial < 80000) {
            const dataSerial = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000);
            const data = new Date(dataSerial.getUTCFullYear(), dataSerial.getUTCMonth(), dataSerial.getUTCDate());
            data.setHours(0, 0, 0, 0);
            return data;
        }
    }

    let ano, mes, dia;
    if (bruto.includes("/")) {
        const partes = bruto.split("/");
        if (partes.length !== 3) return null;
        [dia, mes, ano] = partes.map(Number);
        if (ano < 100) ano += 2000;
    } else {
        const partes = bruto.substring(0, 10).split("-");
        if (partes.length !== 3) return null;
        [ano, mes, dia] = partes.map(Number);
    }

    const data = new Date(ano, mes - 1, dia);
    if (!ano || !mes || !dia || data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return null;
    data.setHours(0, 0, 0, 0);
    return data;
}

function normalizarReservaEspaco(valor) {
    return String(valor || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("pt-BR");
}

function eventosVisiveisCalSecretaria() {
    const eventosEscolares = evs
        .filter((evento) => (filtroCalendarioSecretaria === "geral" || filtroCalendarioSecretaria === "eventos") && evento.status !== "INATIVO" && evento.status !== "CANCELADO")
        .map((evento) => {
            const data = dataCalSecretaria(evento.d);
            const dataFim = dataCalSecretaria(evento.dataFim) || data;
            const tipo = String(evento.t || "evento").toUpperCase();
            return {
                data,
                dataFim,
                titulo: evento.n || "Evento escolar",
                descricao: evento.descricao || "",
                tipo,
                cor: CORES_CAL_SECRETARIA[tipo] || CORES_CAL_SECRETARIA.EVENTO,
                categoria: ({ FERIADO: "Feriado", RECESSO: "Recesso", PROVA: "Prova", REUNIAO: "Reunião", EVENTO: "Evento escolar" })[tipo] || "Evento escolar",
            };
        })
        .filter((evento) => evento.data && !Number.isNaN(evento.data.getTime()));

    const subcategoriasReservaveis = new Set([
        "salas",
        "jardim",
        "quadra 01",
        "quadra 02",
        "refeitorio",
    ]);

    const reservasEspacos = emprestimosCalendario
        .filter((emprestimo) => !["DEVOLVIDO", "DEVOLVIDA", "CONCLUIDO", "CONCLUIDA", "CANCELADO", "CANCELADA", "RECUSADO", "RECUSADA", "REJEITADO", "REJEITADA", "INATIVO", "INATIVA"].includes(emprestimo.status))
        .map((emprestimo) => {
            const produto = acervoProdutos.find((item) =>
                String(item.produtoID || "").trim() === String(emprestimo.produtoID || "").trim()
            );
            if (!produto) return null;

            const categoria = normalizarReservaEspaco(produto.categoria);
            const subcategoria = normalizarReservaEspaco(produto.subcategoria);
            // Aceita apenas itens de Patrimônio que sejam espaços reserváveis.
            // Normaliza espaços e acentos antes da comparação.
            const categoriaPatrimonio = categoria === "patrimonio" || categoria === "patrimonio escolar";
            const subcategoriaReservavel = subcategoriasReservaveis.has(subcategoria);
            if (!categoriaPatrimonio || !subcategoriaReservavel) return null;

            const data = dataCalSecretaria(emprestimo.dataRetirada);
            const dataFim = dataCalSecretaria(emprestimo.dataPrevista) || data;
            if (!data || Number.isNaN(data.getTime())) return null;

            return {
                data,
                dataFim,
                titulo: produto.nome || emprestimo.produto || "Espaço escolar",
                descricao: [
                    emprestimo.usuario ? "Responsável: " + emprestimo.usuario : "",
                    emprestimo.status ? "Status: " + emprestimo.status : "",
                    emprestimo.observacao || "",
                ].filter(Boolean).join(" · "),
                tipo: "RESERVA_SALA",
                cor: "#27836b",
                categoria: "Reserva de espaço",
            };
        })
        .filter(Boolean);

    if (filtroCalendarioSecretaria === "eventos") return eventosEscolares;
    if (filtroCalendarioSecretaria === "reservas") return reservasEspacos;
    return [...eventosEscolares, ...reservasEspacos];
}

function renderizarCalendarioSecretaria() {
    const area = document.getElementById("calendarioSecretaria");
    if (!area) return;

    const eventos = eventosVisiveisCalSecretaria();
    const primeiroDia = new Date(anoCalendarioSecretaria, mesCalendarioSecretaria, 1);
    const inicio = new Date(primeiroDia);
    inicio.setDate(1 - ((primeiroDia.getDay() + 6) % 7));
    const hoje = chaveCalSecretaria(new Date());
    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const anos = Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 2 + i);
    let diasHTML = "";

    for (let i = 0; i < 42; i++) {
        const data = new Date(inicio);
        data.setDate(inicio.getDate() + i);
        const chave = chaveCalSecretaria(data);
        const doDia = eventos.filter((e) => chaveCalSecretaria(e.data) === chave);
        diasHTML += `
            <div class="cal-prof-day ${data.getMonth() !== mesCalendarioSecretaria ? "outside" : ""} ${data.getDay() === 0 || data.getDay() === 6 ? "weekend" : ""} ${chave === hoje ? "today" : ""}"
                 aria-label="${escaparCalSecretaria(data.getDate() + " de " + meses[data.getMonth()])}"
                 title="${escaparCalSecretaria(doDia.map((e) => e.titulo + (e.descricao ? " — Descrição: " + e.descricao : "")).join(" | "))}">
                <span class="cal-prof-number">${data.getDate()}</span>
                ${doDia.slice(0, 3).map((e) => `<span class="cal-prof-event" style="--event-color:${e.cor}"><i class="cal-prof-dot"></i><span class="cal-prof-event-label">${escaparCalSecretaria(e.titulo)}</span></span>`).join("")}
                ${doDia.length > 3 ? `<span class="cal-prof-event">+${doDia.length - 3} eventos</span>` : ""}
            </div>`;
    }

    const proximos = eventos.filter((e) => e.dataFim >= new Date(new Date().setHours(0, 0, 0, 0))).sort((a, b) => a.data - b.data).slice(0, 6);
    const listaHTML = proximos.length ? proximos.map((e) => `
        <div class="cal-prof-upcoming">
            <div class="cal-prof-datebox"><strong>${String(e.data.getDate()).padStart(2, "0")}</strong><span>${meses[e.data.getMonth()].slice(0, 3)}</span></div>
            <div class="cal-prof-upcoming-info"><strong><i class="cal-prof-dot" style="display:inline-block;background:${e.cor}"></i> ${escaparCalSecretaria(e.titulo)}</strong><span>${escaparCalSecretaria(e.categoria)}${e.descricao ? " · " + escaparCalSecretaria(e.descricao) : ""}</span></div>
        </div>`).join("") : filtroCalendarioSecretaria === "reservas"
        ? '<div class="cal-prof-empty-list">Nenhuma reserva de espaço encontrada.</div>'
        : '<div class="cal-prof-empty-list">Nenhum próximo evento cadastrado.</div>';

    const legenda = [["FERIADO", "Feriado"], ["RECESSO", "Recesso"], ["EVENTO", "Evento escolar"], ["REUNIAO", "Reunião"], ["PROVA", "Prova"]].map(([tipo, nome]) =>
        `<span><i class="cal-prof-dot" style="--event-color:${CORES_CAL_SECRETARIA[tipo]}"></i>${nome}</span>`).join("");

    area.innerHTML = `
        <header class="cal-prof-header"><h2>Calendário escolar</h2><p>Confira os eventos e as datas importantes da escola.</p></header>
        <div class="cal-prof-toolbar">
            <div class="cal-prof-spacer"></div>
            <button type="button" data-cal-sec-month="-1">Anterior</button>
            <select aria-label="Mês" data-cal-sec-select="mes">${meses.map((mes, i) => `<option value="${i}" ${i === mesCalendarioSecretaria ? "selected" : ""}>${mes}</option>`).join("")}</select>
            <select aria-label="Ano" data-cal-sec-select="ano">${anos.map((ano) => `<option value="${ano}" ${ano === anoCalendarioSecretaria ? "selected" : ""}>${ano}</option>`).join("")}</select>
            <button type="button" data-cal-sec-month="1">Próximo</button>
        </div>
        <div class="cal-prof-layout">
            <section class="cal-prof-main" aria-label="Calendário mensal">
                <div class="cal-prof-weekdays">${["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((dia) => `<div>${dia}</div>`).join("")}</div>
                <div class="cal-prof-grid">${diasHTML}</div>
                <div class="cal-prof-note"><strong>Detalhes dos eventos</strong>Passe o mouse sobre uma data marcada para consultar seus detalhes.</div>
            </section>
            <aside class="cal-prof-side"><h2>Próximos eventos</h2><div class="cal-prof-event-list">${listaHTML}</div><div class="cal-prof-legend">${legenda}</div></aside>
        </div>`;

    area.querySelectorAll("[data-cal-sec-filter]").forEach((botao) => botao.addEventListener("click", () => {
        filtroCalendarioSecretaria = botao.dataset.calSecFilter;
        renderizarCalendarioSecretaria();
    }));
    area.querySelectorAll("[data-cal-sec-month]").forEach((botao) => botao.addEventListener("click", () => {
        const data = new Date(anoCalendarioSecretaria, mesCalendarioSecretaria + Number(botao.dataset.calSecMonth), 1);
        mesCalendarioSecretaria = data.getMonth();
        anoCalendarioSecretaria = data.getFullYear();
        renderizarCalendarioSecretaria();
    }));
    area.querySelector('[data-cal-sec-select="mes"]')?.addEventListener("change", (evento) => {
        mesCalendarioSecretaria = Number(evento.target.value);
        renderizarCalendarioSecretaria();
    });
    area.querySelector('[data-cal-sec-select="ano"]')?.addEventListener("change", (evento) => {
        anoCalendarioSecretaria = Number(evento.target.value);
        renderizarCalendarioSecretaria();
    });
}

const R = {
    inicio() {
        montarGraficos();

        const alunos = indicadores.alunos || 0;

        const turmas = indicadores.turmas || 0;

        const vagas = indicadores.vagasLivres || 0;

        const ocupacao =
            alunos + vagas > 0
                ? Math.round((alunos / (alunos + vagas)) * 100)
                : 0;

        const hdate = $("#hdate");

        if (hdate) {
            hdate.textContent = new Date().toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "long",
            });
        }

        const hmsg = $("#hmsg");

        if (hmsg) {
            hmsg.textContent = `Você tem ${
                indicadores.reservasPendentes || 0
            } reservas pendentes e ${
                indicadores.atrasos || 0
            } atrasos para acompanhar.`;
        }

        kv("ki-al", alunos);

        $("#ki-al2").textContent = `em ${turmas} turmas`;

        kv("ki-pr", indicadores.professores);

        kv("ki-em", indicadores.emprestimosAtivos);

        kv("ki-at", indicadores.atrasos);

        kv("ki-rp", indicadores.reservasPendentes);

        $("#ch-emp").innerHTML = bars(G.emp[1], G.emp[0]);

        $("#ch-cat").innerHTML = donut(G.cat);

        $("#ch-sem").innerHTML = line(G.sem[1], G.sem[0]);

        $("#ch-oc").innerHTML = ring(
            ocupacao,
            `${alunos} alunos matriculados e ${vagas} vagas livres.`,
        );

        $("#ch-ser").innerHTML = bars(
            series.map((s) => s.t.reduce((a, t) => a + Number(t.al || 0), 0)),
            series.map((s) => s.s),
        );

        $("#log-ini").innerHTML =
            audit
                .slice(0, 5)
                .map(
                    (a) =>
                        `<div class="log">
                            ${escHtml(a[0])}
                            <span>${escHtml(a[1])}</span>
                        </div>`,
                )
                .join("") ||
            `<p class="sub">
                Nenhuma ação registrada ainda.
            </p>`;
    },

    turmas() {
        const A = indicadores.alunos || 0;
        const C = A + (indicadores.vagasLivres || 0);
        kv("kt-al", A); $("#kt-al2").textContent = `de ${C} vagas`;
        kv("kt-vg", indicadores.vagasLivres); kv("kt-tm", indicadores.turmas);
        const select = $("#ts");
        if (select) {
            const opts = [...new Set(["1º Ano", "2º Ano", "3º Ano", ...series.map((s) => s.s)])];
            select.innerHTML = opts.map((s) => `<option value="${escHtml(s)}">${escHtml(s)}</option>`).join("");
        }
        renderizarListaTurmas();
    },

    professores() {
        preencherSelectProfessores();
        preencherSelectTurmas();
        preencherSelectDisciplinas();

        const dados = professoresReais.map((p) => {
            const vinculos = (p.vinculos || []).filter(
                (v) => String(v.status).toUpperCase() === "ATIVO",
            );

            const aulas = vinculos.reduce(
                (total, v) => total + Number(v.aulasSemanais || 0),
                0,
            );

            return [
                p.nome || "-",
                p.identificador || "Sem MASP",
                p.email || "-",
                aulas,
            ];
        });

        const contador = $("#prof-total");
        if (contador) {
            contador.textContent = `${dados.length} ${dados.length === 1 ? "professor" : "professores"}`;
        }

        $("#t-prof").innerHTML = dados.length
            ? T(
                ["Professor", "MASP", "E-mail", "Aulas semanais"],
                dados.map((linha) => [
                    `<strong class="professor-nome">${escHtml(linha[0])}</strong>`,
                    escHtml(linha[1]),
                    `<span class="professor-email">${escHtml(linha[2])}</span>`,
                    `<span class="professor-aulas">${linha[3]} ${linha[3] === 1 ? "aula" : "aulas"}</span>`,
                ]),
            )
            : `<div class="professores-vazio"><strong>Nenhum professor encontrado</strong><p>Cadastre um professor para que ele apareça nesta lista.</p></div>`;
    },

    usuarios() {
        uList();
    },

    acervo() {
        const busca = ($("#acervo-busca")?.value || "").trim().toLocaleLowerCase("pt-BR");
        const categoria = $("#acervo-filtro-categoria")?.value || "";
        const local = $("#acervo-filtro-local")?.value || "";
        const situacao = $("#acervo-filtro-situacao")?.value || "";
        const ativos = prods.filter((p) => String(p.status).toUpperCase() === "ATIVO");
        const baixo = ativos.filter((p) => p.q <= p.m);
        const total = ativos.reduce((s,p) => s+p.q,0);
        const disponivel = ativos.reduce((s,p) => s+p.disponivel,0);
        const reservado = ativos.reduce((s,p) => s+p.reservado,0);
        const categoriasUnicas = [...new Set(prods.map(p=>p.c).filter(v=>v&&v!=="Sem categoria"))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
        const locaisUnicos = [...new Set(acervoLocais.map(l=>l.nome).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
        const preencherFiltro = (id,valores,atual,rotulo) => {
            const el=$(id); if(!el)return;
            if(el.dataset.preenchido!=="sim"){el.innerHTML='<option value="">Todas '+rotulo+'</option>'+valores.map(v=>'<option value="'+escHtml(v)+'">'+escHtml(v)+'</option>').join("");el.dataset.preenchido="sim";}
            el.value=atual;
        };
        preencherFiltro("#acervo-filtro-categoria",categoriasUnicas,categoria,"as categorias");
        preencherFiltro("#acervo-filtro-local",locaisUnicos,local,"os locais");
        const filtrados=prods.filter(p=>{
            const texto=[p.n,p.codigo,p.autor,p.c,p.sub,p.id].join(" ").toLocaleLowerCase("pt-BR");
            const b=!busca||texto.includes(busca), c=!categoria||p.c===categoria;
            const l=!local||p.estoques.some(e=>e.local===local);
            const s=!situacao||(situacao==="baixo"?p.q<=p.m:situacao==="sem-estoque"?p.q<=0:situacao==="inativo"?String(p.status).toUpperCase()!=="ATIVO":String(p.status).toUpperCase()==="ATIVO");
            return b&&c&&l&&s;
        });
        const setText=(id,value)=>{const el=$(id);if(el)el.textContent=value;};
        setText("#acervo-kpi-produtos",ativos.length);setText("#acervo-kpi-unidades",total);
        setText("#acervo-kpi-disponiveis",disponivel);setText("#acervo-kpi-reservadas",reservado);
        setText("#acervo-kpi-baixo",baixo.length);setText("#acervo-resultado",filtrados.length+" de "+prods.length+" produto(s)");
        const maiores=[...ativos].sort((a,b)=>b.q-a.q).slice(0,8);
        $("#ch-acervo").innerHTML=bars(maiores.map(p=>p.q),maiores.map(p=>p.n));
        $("#low").innerHTML=baixo.slice(0,8).map(p=>'<div class="log"><b>'+escHtml(p.n)+'</b><span>'+p.q+' / mín. '+p.m+'</span></div>').join("")||'<p class="sub">'+(ativos.length?"Nenhum produto abaixo do mínimo.":"Nenhum produto ativo cadastrado.")+'</p>';
        const porCategoria=categoriasUnicas.map(nome=>({nome,quantidade:ativos.filter(p=>p.c===nome).reduce((s,p)=>s+p.q,0)})).sort((a,b)=>b.quantidade-a.quantidade);
        $("#acervo-categorias").innerHTML=porCategoria.map(c=>'<div class="acervo-resumo-linha"><span>'+escHtml(c.nome)+'</span><strong>'+c.quantidade+' unidade(s)</strong></div>').join("")||'<p class="sub">Nenhuma categoria cadastrada.</p>';
        $("#acervo-locais").innerHTML=locaisUnicos.map(nome=>{const quantidade=ativos.reduce((s,p)=>s+p.estoques.filter(e=>e.local===nome).reduce((n,e)=>n+Number(e.quantidade||0),0),0);return '<div class="acervo-resumo-linha"><span>'+escHtml(nome)+'</span><strong>'+quantidade+' unidade(s)</strong></div>';}).join("")||'<p class="sub">Nenhum local cadastrado.</p>';
        $("#t-acervo").innerHTML='<div class="acervo-tabela-topo"><div><h2>Catálogo de produtos</h2><p class="sub">Pesquise e filtre o acervo da escola. Use “Ver estoque” para conferir a distribuição por local.</p></div><span class="acervo-contador">'+filtrados.length+' resultado(s)</span></div>'+T(
            ["Código / Produto","Categoria","Subcategoria","Quantidade","Disponível","Estado","Situação","Detalhes"],
            filtrados.map(p=>[
                '<div class="acervo-produto"><strong>'+escHtml(p.n)+'</strong><small>'+escHtml(p.codigo||p.id)+(p.autor?' · '+escHtml(p.autor):'')+'</small></div>',
                escHtml(p.c),escHtml(p.sub),p.q,p.disponivel,escHtml(p.estado),
                String(p.status).toUpperCase()!=="ATIVO"?tg("Inativo","m"):p.q<=p.m?tg("Estoque baixo","r"):tg("Normal","g"),
                '<button type="button" class="btn s acervo-ver-estoque" data-produto-id="'+escHtml(p.id)+'">Ver estoque</button>'
            ])
        );
    },
    reservas() {
        $("#t-res").innerHTML = T(
            ["Solicitante", "Item", "Data", "Situação", "Ações"],
            reservas.map((r) => [
                `<b>${escHtml(r.q)}</b>`,
                escHtml(r.i),
                r.d,
                tg(
                    r.s,
                    r.s === "Pendente" ? "g" : r.s === "Cancelada" ? "m" : "",
                ),
                r.s === "Pendente"
                    ? `
                                <button
                                    class="btn s"
                                    onclick="resv('${escHtml(r.id)}', 'Aprovada')"
                                >
                                    Aprovar
                                </button>

                                <button
                                    class="btn s d"
                                    onclick="resv('${escHtml(r.id)}', 'Recusada')"
                                >
                                    Recusar
                                </button>

                                <button
                                    class="btn s d"
                                    onclick="resv('${escHtml(r.id)}', 'Cancelada')"
                                >
                                    Cancelar
                                </button>
                            `
                    : "-",
            ]),
        );
    },

    emprestimos() {
        const resumo = `
            <div class="hb">
                <span>Em andamento</span>
                <b>
                    ${emps.filter((e) => e.s === "Em andamento").length}
                </b>
            </div>

            <div class="hb">
                <span>Atrasados</span>
                <b>
                    ${emps.filter((e) => e.s === "Atrasado").length}
                </b>
            </div>

            <div class="hb">
                <span>Prazo padrão</span>
                <b>
                    ${cfg.prazo} dias
                </b>
            </div>
        `;

        $("#resumo").innerHTML = resumo;

        $("#ch-atr").innerHTML = hb(G.atr);

        $("#t-emp").innerHTML = T(
            ["Pessoa", "Item", "Retirada", "Prevista", "Situação", "Ações"],
            emps
                .filter((e) => e.s !== "Devolvido")
                .map((e) => [
                    `<b>${escHtml(e.q)}</b>`,
                    escHtml(e.i),
                    escHtml(e.r),
                    escHtml(e.p),
                    tg(e.s, e.s === "Atrasado" ? "r" : "g"),
                    `
                                <button
                                    class="btn s"
                                    onclick="devolve('${e.id}')"
                                >
                                    Registrar devolução
                                </button>
                            `,
                ]),
        );
    },

    bloqueios() {
        renderizarRegistrosPlanilha("#t-bloqueios", "#bloqueios-resumo", registrosBloqueios, "bloqueio(s)");
    },

    denuncias() {
        renderizarRegistrosPlanilha("#t-denuncias", "#denuncias-resumo", registrosDenuncias, "denúncia(s)");
    },

    movs() {
        const filtro = $("#mf")?.value || "";
        const dados = movs.filter((m) => !filtro || m[2] === filtro);

        $("#mt").innerHTML = T(
            ["ID", "Data e hora", "Tipo", "Pessoa", "Item", "Quantidade", "Local de origem", "Local de destino", "Observação"],
            dados.map((m) => m.map((valor) => escHtml(valor))),
        );
    },

    calendario() {
        renderizarCalendarioSecretaria();
    },

    cardapio() {
        /*
         * A planilha enviada não possui
         * uma aba de cardápio.
         *
         * Por enquanto a tela permanece
         * visual. Depois criamos a aba
         * 22_CARDAPIO.
         */
    },

    async avisos() {
        const container = $("#avisos");
        if (!container) return;

        container.innerHTML = '<p class="sub">Carregando avisos...</p>';

        try {
            const dados = await api("/secretaria/avisos");
            const avisos = dados.avisos || [];

            container.innerHTML = avisos.map((aviso) => {
                const urgente = String(aviso.prioridade || "").toUpperCase() === "URGENTE";
                const destino = String(aviso.destinatarios || "").split(",").join(", ");

                return `
                    <article class="card" style="margin-bottom:12px">
                        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
                            <h3>${escHtml(aviso.titulo)}</h3>
                            <span class="dot" style="--c:${urgente ? "#B42318" : "#2F6FB5"}"></span>
                        </div>
                        <p>${escHtml(aviso.mensagem)}</p>
                        <p class="sub">
                            ${urgente ? "URGENTE" : "Normal"} ·
                            Destino: ${escHtml(destino || "—")} ·
                            ${escHtml(aviso.dataPublicacao || "")}
                        </p>
                    </article>
                `;
            }).join("") || '<div class="card"><p class="sub">Nenhum aviso publicado ainda.</p></div>';
        } catch (erro) {
            console.error("Erro ao carregar avisos:", erro);
            container.innerHTML = `<div class="card"><p class="sub">${escHtml(erro.message || "Não foi possível carregar os avisos.")}</p></div>`;
        }
    },

    relatorios() {
        montarGraficos();

        $("#r1").innerHTML = bars(G.emp[1], G.emp[0]);

        $("#r2").innerHTML = line(G.sem[1], G.sem[0]);

        $("#r3").innerHTML = donut(G.cat);

        $("#r4").innerHTML = hb(G.atr);
    },

    config() {
        $("#cp").value = cfg.prazo;

        $("#cl").value = cfg.limite;

        $("#audit").innerHTML =
            audit
                .slice(0, 100)
                .map(
                    (a) =>
                        `<div class="log">
                            ${escHtml(a[0])}
                            <span>${escHtml(a[1])}</span>
                        </div>`,
                )
                .join("") ||
            `<p class="sub">
                Nenhuma ação registrada.
            </p>`;
    },
};


/* =========================================================
   PUBLICAR AVISOS
========================================================= */
window.addAv = async function addAv() {
    const tituloCampo = $("#at");
    const destinoCampo = $("#ad");
    const prioridadeCampo = $("#au");
    const mensagemCampo = $("#ax");

    const titulo = tituloCampo?.value.trim() || "";
    const mensagem = mensagemCampo?.value.trim() || "";
    const destino = destinoCampo?.value || "Todos";
    const prioridade = prioridadeCampo?.value || "Normal";

    if (!titulo || !mensagem) {
        alert("Preencha o título e a mensagem do aviso.");
        return;
    }

    const destinoAPI = {
        "Todos": "TODOS",
        "Alunos": "ALUNO",
        "Professores": "PROFESSOR",
    };

    const botao = $("#btn-publicar-aviso");
    if (botao) {
        botao.disabled = true;
        botao.textContent = "Publicando...";
    }

    try {
        await api("/secretaria/avisos", {
            method: "POST",
            body: JSON.stringify({
                titulo,
                mensagem,
                prioridade,
                destinatarios: [destinoAPI[destino] || "TODOS"],
            }),
        });

        if (tituloCampo) tituloCampo.value = "";
        if (mensagemCampo) mensagemCampo.value = "";

        await R.avisos();
        alert("Aviso publicado com sucesso.");
    } catch (erro) {
        console.error("Erro ao publicar aviso:", erro);
        alert(erro.message || "Não foi possível publicar o aviso.");
    } finally {
        if (botao) {
            botao.disabled = false;
            botao.textContent = "Publicar";
        }
    }
};

/* =========================================================
   NAVEGAÇÃO
========================================================= */

function draw() {
    if (!R[page]) return;

    R[page]();

    countUp();
}

function go(p) {
    page = p;

    document
        .querySelectorAll(".page")
        .forEach((s) => s.classList.toggle("on", s.id === "p-" + p));

    document
        .querySelectorAll("nav button")
        .forEach((b) => b.classList.toggle("on", b.dataset.p === p));

    draw();

    const main = $("main");

    if (main) {
        main.scrollTop = 0;
    }
}

document.addEventListener("input", (e) => { if (e.target.matches("#acervo-busca")) R.acervo(); });
document.addEventListener("change", (e) => { if (e.target.matches("#acervo-filtro-categoria, #acervo-filtro-local, #acervo-filtro-situacao")) R.acervo(); });
$("#form-resposta-denuncia")?.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const campo = $("#resposta-denuncia");
    const mensagem = $("#mensagem-resposta-denuncia");
    const botao = $("#btn-salvar-resposta-denuncia");
    const denunciaID = botao?.dataset.denunciaId;
    const respostaSecretaria = campo?.value.trim();

    if (!denunciaID) {
        if (mensagem) mensagem.textContent = "Não foi possível identificar esta denúncia. Confira se a coluna DenunciaID existe na planilha.";
        return;
    }
    if (!respostaSecretaria) {
        if (mensagem) mensagem.textContent = "Digite a resposta da Secretaria antes de salvar.";
        campo?.focus();
        return;
    }
    if (botao) {
        botao.disabled = true;
        botao.textContent = "Salvando...";
    }
    if (mensagem) mensagem.textContent = "";
    try {
        await api("/secretaria/denuncias/" + encodeURIComponent(denunciaID) + "/resposta", {
            method: "PATCH",
            body: JSON.stringify({ respostaSecretaria })
        });
        if (mensagem) mensagem.textContent = "Resposta salva na planilha.";
        toast("Resposta da Secretaria salva.");
        await carregarDados();
        const atualizados = registrosDenuncias;
        const idIndice = atualizados.colunas.findIndex((c) =>
            String(c || "").replace(/[_\s-]/g, "").toLocaleLowerCase("pt-BR") === "denunciaid"
        );
        const indice = atualizados.registros.findIndex((linha) => String(linha[idIndice] || "") === denunciaID);
        if (indice >= 0) {
            const linha = atualizados.registros[indice];
            const respostaIndice = atualizados.colunas.findIndex((c) =>
                String(c || "").replace(/[_\s-]/g, "").toLocaleLowerCase("pt-BR") === "respostasecretaria"
            );
            if (respostaIndice >= 0 && campo) campo.value = String(linha[respostaIndice] || "");
        }
    } catch (erro) {
        if (mensagem) mensagem.textContent = erro.message || "Não foi possível salvar a resposta.";
        toast(erro.message || "Não foi possível salvar a resposta.");
    } finally {
        if (botao) {
            botao.disabled = false;
            botao.textContent = "Salvar resposta";
        }
    }
});


document.addEventListener("click", async (e) => {
    const botao = e.target.closest("#btn-alternar-bloqueio");
    if (!botao || botao.hidden) return;
    const bloqueioID = String(botao.dataset.bloqueioId || "").trim();
    const acao = String(botao.dataset.acao || "").toUpperCase();
    if (!bloqueioID || !["BLOQUEAR", "DESBLOQUEAR"].includes(acao)) {
        toast("Não foi possível identificar o registro de bloqueio.");
        return;
    }
    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = "Salvando...";
    try {
        const resposta = await api("/secretaria/bloqueios-setor/" + encodeURIComponent(bloqueioID) + "/status", {
            method: "PATCH",
            body: JSON.stringify({ acao }),
        });
        const normalizarCabecalho = (valor) => String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\s-]/g, "").trim().toLocaleLowerCase("pt-BR");
        const indiceStatus = registrosBloqueios.colunas.findIndex((c) => ["status", "situacao"].includes(normalizarCabecalho(c)));
        const indiceID = registrosBloqueios.colunas.findIndex((c) => ["bloqueioid", "registroid", "id"].includes(normalizarCabecalho(c)));
        const registro = registrosBloqueios.registros.find((linha) => indiceID >= 0 && String(linha[indiceID] || "").trim() === bloqueioID);
        if (registro && indiceStatus >= 0) registro[indiceStatus] = resposta.statusBloqueio;
        renderizarRegistrosPlanilha("#t-bloqueios", "#bloqueios-resumo", registrosBloqueios, "bloqueio(s)");
        toast(resposta.mensagem || "Status atualizado.");
        $("#modal-registro-planilha").hidden = true;
        document.body.classList.remove("modal-registro-aberto");
    } catch (erro) {
        toast(erro.message || "Não foi possível alterar o bloqueio.");
        botao.disabled = false;
        botao.textContent = textoOriginal;
    }
});

document.addEventListener("click", (e) => {
    const registroCard = e.target.closest(".registro-card");
    if (registroCard) {
        const bloqueios = registroCard.dataset.registroTipo === "bloqueio";
        const dados = bloqueios ? registrosBloqueios : registrosDenuncias;
        const linha = dados.registros[Number(registroCard.dataset.registroIndice)];
        if (!linha) return;
        const modal = $("#modal-registro-planilha");
        const titulo = $("#modal-registro-titulo");
        const subtitulo = $("#modal-registro-subtitulo");
        const conteudo = $("#modal-registro-conteudo");
        titulo.textContent = bloqueios ? "Detalhes do bloqueio" : "Detalhes da denúncia";
        subtitulo.textContent = bloqueios ? "Registro da aba 22_BLOQUEIOS_SETOR" : "Registro da aba 23_DENUNCIAS_SECRETARIA";
        conteudo.innerHTML = camposExibicaoPlanilha(dados.colunas, linha).map((campo) =>
            '<div class="bloqueio-detalhe-campo"><span>' + escHtml(campo.nome) +
            '</span><strong>' + escHtml(campo.valor) + '</strong></div>'
        ).join("");

        const areaResposta = $("#form-resposta-denuncia");
        const campoResposta = $("#resposta-denuncia");
        const mensagemResposta = $("#mensagem-resposta-denuncia");
        if (areaResposta) areaResposta.hidden = bloqueios;
        if (mensagemResposta) mensagemResposta.textContent = "";
        if (campoResposta) {
            const indiceResposta = dados.colunas.findIndex((c) =>
                String(c || "").replace(/[_\s-]/g, "").toLocaleLowerCase("pt-BR") === "respostasecretaria"
            );
            campoResposta.value = indiceResposta >= 0 ? String(linha[indiceResposta] || "") : "";
            campoResposta.disabled = false;
        }
        const idIndice = dados.colunas.findIndex((c) =>
            String(c || "").replace(/[_\s-]/g, "").toLocaleLowerCase("pt-BR") === "denunciaid"
        );
        const botaoResposta = $("#btn-salvar-resposta-denuncia");
        if (botaoResposta) botaoResposta.dataset.denunciaId = idIndice >= 0 ? String(linha[idIndice] || "") : "";

        const botaoBloqueio = $("#btn-alternar-bloqueio");
        if (botaoBloqueio) {
            botaoBloqueio.hidden = !bloqueios;
            botaoBloqueio.dataset.bloqueioId = "";
            if (bloqueios) {
                const normalizarCabecalho = (valor) => String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\s-]/g, "").trim().toLocaleLowerCase("pt-BR");
                const indiceBloqueioID = dados.colunas.findIndex((c) => ["bloqueioid", "registroid", "id"].includes(normalizarCabecalho(c)));
                const indiceStatusBloqueio = dados.colunas.findIndex((c) => ["status", "situacao"].includes(normalizarCabecalho(c)));
                const statusAtual = String(indiceStatusBloqueio >= 0 ? linha[indiceStatusBloqueio] : "").trim().toUpperCase();
                botaoBloqueio.dataset.bloqueioId = indiceBloqueioID >= 0 ? String(linha[indiceBloqueioID] || "") : "";
                botaoBloqueio.dataset.acao = statusAtual === "BLOQUEADO" ? "DESBLOQUEAR" : "BLOQUEAR";
                botaoBloqueio.textContent = statusAtual === "BLOQUEADO" ? "Desbloquear usuário" : "Bloquear novamente";
                botaoBloqueio.classList.toggle("btn-perigo", statusAtual !== "BLOQUEADO");
            }
        }
        modal.hidden = false;
        document.body.classList.add("modal-registro-aberto");
        return;
    }
    const fecharRegistro = e.target.closest("[data-fechar-modal-registro]");
    if (fecharRegistro) {
        const modal = $("#modal-registro-planilha");
        modal.hidden = true;
        document.body.classList.remove("modal-registro-aberto");
        return;
    }
    const detalhe = e.target.closest(".acervo-ver-estoque");
    if (detalhe) {
        const p = prods.find((item) => String(item.id) === String(detalhe.dataset.produtoId));
        if (!p) return;
        const linhas = p.estoques.map((item) => item.local + ": total " + item.quantidade + ", disponível " + item.disponivel + ", reservado " + item.reservado + ", indisponível " + item.indisponivel).join("\n");
        alert(p.n + " (" + (p.codigo || p.id) + ")\n\n" + (linhas || "Nenhum registro de estoque por local.") + "\n\nMínimo: " + p.m + "\nEstado: " + p.estado + "\nStatus: " + p.status + (p.observacao ? "\nObservação: " + p.observacao : ""));
        return;
    }
    const b = e.target.closest("[data-p],[data-go]");

    if (!b) return;

    go(b.dataset.p || b.dataset.go);
});

async function salvarAutorizacaoMatricula(evento) {
    evento.preventDefault();

    const campo = $("#matricula-autorizacao");
    const mensagem = $("#mensagem-autorizacao-matricula");
    const botao = $("#btn-salvar-autorizacao-matricula");
    const matricula = campo?.value.trim();

    if (!matricula) {
        if (mensagem) mensagem.textContent = "Informe a matrícula do aluno.";
        campo?.focus();
        return;
    }

    if (!/^\\d{5,10}$/.test(matricula)) {
        if (mensagem) mensagem.textContent = "A matrícula deve conter somente números, entre 5 e 10 dígitos.";
        campo?.focus();
        return;
    }

    if (botao) {
        botao.disabled = true;
        botao.textContent = "Salvando...";
    }
    if (mensagem) mensagem.textContent = "";

    try {
        const resposta = await api("/secretaria/autorizar-matricula", {
            method: "POST",
            body: JSON.stringify({ matricula }),
        });

        if (mensagem) {
            mensagem.textContent = `Autorização salva. ID: ${resposta.cadastradoID} — Status: PENDENTE.`;
        }
        campo.value = "";
        toast("Matrícula autorizada para cadastro próprio.");
    } catch (erro) {
        if (mensagem) mensagem.textContent = erro.message;
        toast(erro.message);
    } finally {
        if (botao) {
            botao.disabled = false;
            botao.textContent = "Salvar autorização";
        }
    }
}

function abrirModalAutorizacaoMatricula() {
    const modal = $("#modal-autorizar-matricula");
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("modal-autorizacao-aberto");
    window.requestAnimationFrame(() => $("#matricula-autorizacao")?.focus());
}

function fecharModalAutorizacaoMatricula() {
    const modal = $("#modal-autorizar-matricula");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("modal-autorizacao-aberto");
    $('[data-acao-usuario="autorizar"]')?.focus();
}

document.addEventListener("click", (e) => {
    const acao = e.target.closest('[data-acao-usuario="autorizar"]');
    if (acao) {
        e.preventDefault();
        abrirModalAutorizacaoMatricula();
        return;
    }

    if (e.target.closest("#fechar-modal-autorizacao, #cancelar-modal-autorizacao")) {
        fecharModalAutorizacaoMatricula();
        return;
    }

    if (e.target.id === "modal-autorizar-matricula") {
        fecharModalAutorizacaoMatricula();
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#modal-autorizar-matricula")?.hidden) {
        fecharModalAutorizacaoMatricula();
    }
});

$("#form-autorizar-matricula")?.addEventListener("submit", salvarAutorizacaoMatricula);


async function abrirModalNovoAluno() {
    const modal = $("#modal-novo-aluno");
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("modal-autorizacao-aberto");
    window.requestAnimationFrame(() => $("#novo-aluno-identificador")?.focus());
}

async function abrirModalMudarTurma() {
    const modal = $("#modal-mudar-turma");
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add("modal-autorizacao-aberto");
    const select = $("#mudar-turma-aluno");
    select.innerHTML = '<option value="">Carregando alunos...</option>';
    $("#mensagem-mudar-turma").textContent = "";
    try {
        const resposta = await api("/secretaria/usuarios");
        const alunos = (resposta.usuarios || []).filter(u =>
            String(u.tipoUsuario || "").toLowerCase() === "aluno" &&
            String(u.status || "").toUpperCase() === "ATIVO"
        );
        select.innerHTML = '<option value="">Selecione o aluno</option>';
        alunos.forEach(aluno => {
            const option = document.createElement("option");
            option.value = aluno.usuarioID;
            option.textContent = [aluno.nome, aluno.matricula ? "Matrícula " + aluno.matricula : "", aluno.ano, aluno.turma].filter(Boolean).join(" — ");
            option.dataset.ano = aluno.ano || "";
            option.dataset.turma = aluno.turma || "";
            option.dataset.turno = aluno.turno || "";
            select.appendChild(option);
        });
        if (!alunos.length) select.innerHTML = '<option value="">Nenhum aluno ativo encontrado</option>';
    } catch (erro) {
        select.innerHTML = '<option value="">Erro ao carregar alunos</option>';
        $("#mensagem-mudar-turma").textContent = erro.message;
    }
    window.requestAnimationFrame(() => select.focus());
}

function fecharModalOperacao(id) {
    const modal = $("#" + id);
    if (modal) modal.hidden = true;
    if ($("#modal-autorizar-matricula")?.hidden !== false &&
        $("#modal-novo-aluno")?.hidden !== false &&
        $("#modal-mudar-turma")?.hidden !== false) {
        document.body.classList.remove("modal-autorizacao-aberto");
    }
}

document.addEventListener("click", e => {
    if (e.target.closest('[data-acao-usuario="novo-aluno"]')) {
        e.preventDefault();
        abrirModalNovoAluno();
    } else if (e.target.closest('[data-acao-usuario="transferir-turma"]')) {
        e.preventDefault();
        abrirModalMudarTurma();
    } else if (e.target.closest("[data-fechar-modal-aluno]")) {
        fecharModalOperacao("modal-novo-aluno");
    } else if (e.target.closest("[data-fechar-modal-turma]")) {
        fecharModalOperacao("modal-mudar-turma");
    } else if (e.target.id === "modal-novo-aluno") {
        fecharModalOperacao("modal-novo-aluno");
    } else if (e.target.id === "modal-mudar-turma") {
        fecharModalOperacao("modal-mudar-turma");
    }
});

document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    ["modal-novo-aluno", "modal-mudar-turma"].forEach(id => {
        if (!$("#" + id)?.hidden) fecharModalOperacao(id);
    });
});

$("#form-novo-aluno")?.addEventListener("submit", async e => {
    e.preventDefault();
    const form = e.currentTarget;
    const mensagem = $("#mensagem-novo-aluno");
    const botao = $("#btn-salvar-novo-aluno");
    const dados = Object.fromEntries(new FormData(form).entries());
    const identificador = String(dados.identificador || "").trim();

    if (!/^\\d{5,10}$/.test(identificador)) {
        mensagem.textContent = "A matrícula deve conter somente números, entre 5 e 10 dígitos.";
        $("#novo-aluno-identificador")?.focus();
        return;
    }

    botao.disabled = true;
    botao.textContent = "Salvando...";
    mensagem.textContent = "";
    try {
        const resposta = await api("/secretaria/alunos", {
            method: "POST",
            body: JSON.stringify(dados)
        });
        mensagem.textContent = "Aluno cadastrado. ID de usuário: " + resposta.usuarioID;
        toast("Aluno cadastrado com sucesso.");
        form.reset();
    } catch (erro) {
        mensagem.textContent = erro.message;
        toast(erro.message);
    } finally {
        botao.disabled = false;
        botao.textContent = "Salvar aluno";
    }
});

$("#mudar-turma-aluno")?.addEventListener("change", e => {
    const option = e.currentTarget.selectedOptions[0];
    $("#mudar-turma-ano").value = option?.dataset.ano || "";
    $("#mudar-turma-nome").value = option?.dataset.turma || "";
    $("#mudar-turma-turno").value = option?.dataset.turno || "";
});

$("#form-mudar-turma")?.addEventListener("submit", async e => {
    e.preventDefault();
    const mensagem = $("#mensagem-mudar-turma");
    const botao = $("#btn-salvar-mudar-turma");
    const usuarioID = $("#mudar-turma-aluno").value;
    const dados = {
        ano: $("#mudar-turma-ano").value.trim(),
        turma: $("#mudar-turma-nome").value.trim(),
        turno: $("#mudar-turma-turno").value
    };
    if (!usuarioID) {
        mensagem.textContent = "Selecione um aluno.";
        return;
    }
    botao.disabled = true;
    botao.textContent = "Salvando...";
    mensagem.textContent = "";
    try {
        const resposta = await api("/secretaria/alunos/" + encodeURIComponent(usuarioID) + "/turma", {
            method: "PATCH",
            body: JSON.stringify(dados)
        });
        mensagem.textContent = resposta.mensagem || "Turma atualizada.";
        toast("Turma do aluno alterada.");
    } catch (erro) {
        mensagem.textContent = erro.message;
        toast(erro.message);
    } finally {
        botao.disabled = false;
        botao.textContent = "Salvar mudança";
    }
});



setInterval(() => {
    const c = $("#clk");

    if (c) {
        c.textContent = new Date().toLocaleTimeString("pt-BR");
    }
}, 1000);

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

(async function iniciar() {
    try {
        await carregarDados();
        await carregarDadosProfessores();
    } catch (erro) {
        console.error("Erro ao iniciar Secretaria:", erro);
    }
})();

async function carregarDadosProfessores() {
    try {
        const [respostaProfessores, respostaTurmas, respostaDisciplinas] =
            await Promise.all([
                api("/secretaria/professores"),
                api("/secretaria/turmas"),
                api("/secretaria/disciplinas"),
            ]);

        professoresReais = respostaProfessores.professores || [];

        turmasReais = respostaTurmas.turmas || [];

        disciplinasReais = respostaDisciplinas.disciplinas || [];

        preencherSelectProfessores();
        preencherSelectTurmas();
        preencherSelectDisciplinas();

        if (page === "professores") {
            R.professores();
        }
    } catch (erro) {
        console.error("Erro ao carregar professores:", erro);

        toast(
            erro.message ||
                "Erro ao carregar professores, turmas ou disciplinas.",
        );
    }
}

function preencherSelectProfessores() {
    const select = $("#pp");
    if (!select) return;

    const selecionado = select.value;
    select.innerHTML = `<option value="">Selecione um professor</option>`;

    professoresReais.forEach((professor) => {
        const option = document.createElement("option");
        option.value = professor.usuarioID;
        option.textContent = `${professor.nome} — ${professor.identificador || "Sem MASP"}`;
        select.appendChild(option);
    });

    if (selecionado && professoresReais.some((p) => p.usuarioID === selecionado)) {
        select.value = selecionado;
    }
}

function formatarMasp(valor) {
    const numeros = String(valor || "").replace(/\D/g, "").slice(0, 8);
    if (numeros.length <= 7) return numeros;
    return numeros.slice(0, 7) + "-" + numeros.slice(7);
}

function normalizarMaspBusca(valor) {
    return String(valor || "").trim().toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]/g, "");
}

function pesquisarProfessorMasp() {
    const campo = $("#busca-masp");
    const resultados = $("#masp-resultados");
    const status = $("#masp-status");
    const select = $("#pp");
    if (!campo || !resultados || !status || !select) return;

    const digitado = campo.value.trim();
    const busca = normalizarMaspBusca(digitado);
    resultados.innerHTML = "";
    select.value = "";

    if (!busca) {
        status.textContent = "Digite o MASP para localizar o professor.";
        status.dataset.estado = "";
        return;
    }

    const encontrados = professoresReais.filter((p) => {
        const masp = normalizarMaspBusca(p.identificador);
        return masp && masp.includes(busca);
    });

    if (!encontrados.length) {
        status.textContent = "MASP não encontrado. Confira os números digitados.";
        status.dataset.estado = "erro";
        return;
    }

    status.textContent = encontrados.length === 1
        ? "1 professor encontrado."
        : `${encontrados.length} professores encontrados. Continue digitando para refinar.`;
    status.dataset.estado = "sucesso";

    encontrados.forEach((professor) => {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = "professor-masp-opcao";
        botao.setAttribute("role", "option");
        botao.innerHTML = `<strong>${escHtml(professor.nome || "Sem nome")}</strong><span>MASP: ${escHtml(professor.identificador || "Não informado")}</span>`;
        botao.addEventListener("click", () => {
            select.value = professor.usuarioID;
            campo.value = professor.identificador || "";
            resultados.innerHTML = "";
            status.textContent = `Professor selecionado: ${professor.nome} — MASP ${professor.identificador}.`;
            status.dataset.estado = "sucesso";
        });
        resultados.appendChild(botao);
    });

    const maspDigitado = normalizarMaspBusca(digitado);
    const exatos = encontrados.filter((p) => normalizarMaspBusca(p.identificador) === maspDigitado);
    if (exatos.length === 1) {
        const professor = exatos[0];
        select.value = professor.usuarioID;
        resultados.innerHTML = "";
        status.textContent = `MASP exato encontrado: ${professor.nome}.`;
        status.dataset.estado = "sucesso";
    }
}

function preencherSelectTurmas() {
    const select = $("#pt");

    if (!select) return;

    select.innerHTML = `<option value="">Selecione a turma</option>`;

    turmasReais.forEach((turma) => {
        const option = document.createElement("option");

        option.value = turma.turmaID;

        option.textContent = `${turma.serie || ""} - ${turma.nome || ""} - ${
            turma.turno || ""
        }`;

        select.appendChild(option);
    });
}

function preencherSelectDisciplinas() {
    const select = $("#pdv");

    if (!select) return;

    select.innerHTML = `<option value="">Selecione a disciplina</option>`;

    disciplinasReais.forEach((disciplina) => {
        const option = document.createElement("option");

        option.value = disciplina.disciplinaID;

        option.textContent = disciplina.nome;

        select.appendChild(option);
    });
}

document.addEventListener("input", (evento) => {
    const campo = evento.target;
    if (!["np-masp", "pm", "busca-masp"].includes(campo?.id)) return;

    const posicao = campo.selectionStart;
    const valorAnterior = campo.value;
    campo.value = formatarMasp(valorAnterior);

    if (posicao !== null && campo === document.activeElement) {
        const diferenca = campo.value.length - valorAnterior.length;
        const novaPosicao = Math.max(0, Math.min(campo.value.length, posicao + diferenca));
        campo.setSelectionRange(novaPosicao, novaPosicao);
    }

    if (campo.id === "busca-masp") pesquisarProfessorMasp();
});

async function addProf() {
    const masp = $("#pm")?.value.trim();

    if (!masp) {
        return toast("Informe o MASP do professor.");
    }

    try {
        const resultado = await api("/secretaria/professores", {
            method: "POST",
            body: JSON.stringify({ masp }),
        });

        if (!resultado.sucesso) {
            throw new Error(
                resultado.erro || "Não foi possível autorizar o MASP.",
            );
        }

        toast(`MASP autorizado com status PENDENTE. ID: ${resultado.autorizacaoID}`);
        $("#pm").value = "";
        await carregarDados();
        await carregarDadosProfessores();
    } catch (erro) {
        console.error("Erro ao autorizar MASP do professor:", erro);
        toast(erro.message);
    }
}

async function cadastrarProfessorAgora() {
    const masp = $("#np-masp")?.value.trim();
    const nome = $("#np-nome")?.value.trim();
    const idade = Number($("#np-idade")?.value);
    const email = $("#np-email")?.value.trim();
    const senha = $("#np-senha")?.value;

    if (!masp || !nome || !idade || !email || !senha) {
        return toast("Preencha todos os campos do cadastro imediato.");
    }
    if (senha.length < 6 || senha.length > 128) return toast("A senha precisa ter entre 6 e 128 caracteres.");

    try {
        const resultado = await api("/secretaria/professores/cadastrar", {
            method: "POST",
            body: JSON.stringify({ masp, nome, idade, email, senha }),
        });
        if (!resultado.sucesso) throw new Error(resultado.erro || "Não foi possível cadastrar o professor.");

        toast(`Professor cadastrado com sucesso. ID: ${resultado.usuarioID}`);
        ["np-masp", "np-nome", "np-idade", "np-email", "np-senha"].forEach((id) => {
            const campo = document.getElementById(id);
            if (campo) campo.value = "";
        });
        await carregarDados();
        await carregarDadosProfessores();
    } catch (erro) {
        console.error("Erro ao cadastrar professor imediatamente:", erro);
        toast(erro.message);
    }
}

async function assign() {
    const professorID = $("#pp")?.value;
    const turmaID = $("#pt")?.value;
    const disciplinaID = $("#pdv")?.value;
    const aulasSemanais = Number($("#pa")?.value);

    if (!professorID) {
        return toast("Selecione o professor.");
    }

    if (!turmaID) {
        return toast("Selecione a turma.");
    }

    if (!disciplinaID) {
        return toast("Selecione a disciplina.");
    }

    if (!aulasSemanais || aulasSemanais < 1) {
        return toast("Informe a quantidade de aulas.");
    }

    try {
        const resultado = await api("/secretaria/professor-turmas", {
            method: "POST",
            body: JSON.stringify({
                professorID,
                turmaID,
                disciplinaID,
                aulasSemanais,
            }),
        });

        toast(resultado.mensagem || "Professor vinculado com sucesso.");

        $("#pp").value = "";
        $("#busca-masp").value = "";
        $("#masp-resultados").innerHTML = "";
        $("#masp-status").textContent = "Digite o MASP para localizar o professor.";
        $("#masp-status").dataset.estado = "";
        $("#pt").value = "";
        $("#pdv").value = "";
        $("#pa").value = "4";

        await carregarDados();
        await carregarDadosProfessores();
    } catch (erro) {
        console.error("Erro ao vincular professor:", erro);

        toast(erro.message);
    }
}


function configurarEventosBotoesProfessores() {
    document
        .querySelector("#btn-cadastrar-professor-agora")
        ?.addEventListener("click", cadastrarProfessorAgora);
    document
        .querySelector("#btn-autorizar-masp")
        ?.addEventListener("click", addProf);
    document
        .querySelector("#btn-salvar-vinculo")
        ?.addEventListener("click", assign);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", configurarEventosBotoesProfessores);
} else {
    configurarEventosBotoesProfessores();
}



// Liga o botão de publicação sem usar onclick inline (compatível com a CSP do Helmet).
function configurarBotaoPublicarAviso() {
    $("#btn-publicar-aviso")?.addEventListener("click", addAv);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", configurarBotaoPublicarAviso);
} else {
    configurarBotaoPublicarAviso();
}


/* =========================================================
   CENTRAL DE AVISOS DA SECRETARIA
========================================================= */
let avisosSecretariaPainel = [];
let avisosLidosSecretariaPainel = [];
let centralAvisosSecretariaAberta = false;

async function carregarAvisosSecretariaPainel() {
    try {
        const [respostaAvisos, respostaLeituras] = await Promise.all([
            fetch(`${API_URL}/avisos`, { credentials: "same-origin" }),
            fetch(`${API_URL}/avisos/leituras`, { credentials: "same-origin" }),
        ]);
        const dadosAvisos = await respostaAvisos.json();
        const dadosLeituras = await respostaLeituras.json();

        if (!respostaAvisos.ok || !dadosAvisos.sucesso) {
            throw new Error(dadosAvisos.erro || "Não foi possível carregar os avisos.");
        }
        if (!respostaLeituras.ok || !dadosLeituras.sucesso) {
            throw new Error(dadosLeituras.erro || "Não foi possível carregar as leituras.");
        }

        avisosSecretariaPainel = Array.isArray(dadosAvisos.avisos) ? dadosAvisos.avisos : [];
        avisosLidosSecretariaPainel = Array.isArray(dadosLeituras.avisosLidos) ? dadosLeituras.avisosLidos : [];
        renderizarAvisosSecretariaPainel();
        atualizarContadorAvisosSecretariaPainel();
    } catch (erro) {
        console.error("Erro ao carregar avisos da Secretaria:", erro);
        const lista = $("#listaAvisosSecretariaPainel");
        if (lista) lista.innerHTML = '<p class="avisos-vazio-secretaria-painel">Não foi possível carregar os avisos. Atualize a página e tente novamente.</p>';
    }
}

async function registrarLeituraAvisoSecretariaPainel(avisoID) {
    const resposta = await fetch(`${API_URL}/avisos/leituras`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avisoID }),
    });
    const dados = await resposta.json();
    if (!resposta.ok || !dados.sucesso) {
        throw new Error(dados.erro || "Não foi possível registrar a leitura.");
    }
    if (!avisosLidosSecretariaPainel.includes(avisoID)) avisosLidosSecretariaPainel.push(avisoID);
}

function atualizarContadorAvisosSecretariaPainel() {
    const botao = $("#botaoAvisosSecretariaPainel");
    const contador = $("#contadorAvisosSecretariaPainel");
    if (!botao || !contador) return;
    const naoLidos = avisosSecretariaPainel.filter((item) => !avisosLidosSecretariaPainel.includes(item.id)).length;
    contador.textContent = naoLidos > 99 ? "99+" : String(naoLidos);
    contador.hidden = naoLidos === 0;
    botao.setAttribute("aria-label", naoLidos ? `Avisos. ${naoLidos} não lidos` : "Avisos");
}

function criarBotaoAvisosSecretaria() {
    if ($("#botaoAvisosSecretariaPainel")) return;
    const botao = document.createElement("button");
    botao.type = "button";
    botao.id = "botaoAvisosSecretariaPainel";
    botao.className = "botao-avisos-secretaria-painel";
    botao.title = "Avisos da escola";
    botao.setAttribute("aria-label", "Avisos");
    botao.innerHTML = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-avisos"></use></svg><span id="contadorAvisosSecretariaPainel" class="contador-avisos-secretaria-painel" hidden>0</span>';

    const central = document.createElement("section");
    central.id = "centralAvisosSecretariaPainel";
    central.className = "central-avisos-secretaria-painel";
    central.hidden = true;
    central.setAttribute("aria-label", "Central de avisos");
    central.innerHTML = `
        <div class="cabecalho-avisos-secretaria-painel">
            <div><h2>Avisos da escola</h2><p>Comunicados destinados à Secretaria</p></div>
            <button type="button" id="fecharAvisosSecretariaPainel" class="fechar-avisos-secretaria-painel" aria-label="Fechar avisos">&times;</button>
        </div>
        <div class="acoes-avisos-secretaria-painel"><button type="button" id="marcarAvisosLidosSecretariaPainel">Marcar todos como lidos</button></div>
        <div id="listaAvisosSecretariaPainel" class="lista-avisos-secretaria-painel"><p class="avisos-vazio-secretaria-painel">Carregando avisos...</p></div>
    `;
    document.body.append(botao, central);
    botao.addEventListener("click", alternarCentralAvisosSecretariaPainel);
    central.querySelector("#fecharAvisosSecretariaPainel").addEventListener("click", fecharCentralAvisosSecretariaPainel);
    central.querySelector("#marcarAvisosLidosSecretariaPainel").addEventListener("click", marcarTodosAvisosSecretariaPainelComoLidos);
}

function alternarCentralAvisosSecretariaPainel() {
    centralAvisosSecretariaAberta = !centralAvisosSecretariaAberta;
    const central = $("#centralAvisosSecretariaPainel");
    if (!central) return;
    central.hidden = !centralAvisosSecretariaAberta;
    if (centralAvisosSecretariaAberta) renderizarAvisosSecretariaPainel();
}

function fecharCentralAvisosSecretariaPainel() {
    centralAvisosSecretariaAberta = false;
    const central = $("#centralAvisosSecretariaPainel");
    if (central) central.hidden = true;
}

async function marcarTodosAvisosSecretariaPainelComoLidos() {
    const pendentes = avisosSecretariaPainel.filter((item) => !avisosLidosSecretariaPainel.includes(item.id));
    try {
        await Promise.all(pendentes.map((item) => registrarLeituraAvisoSecretariaPainel(item.id)));
        atualizarContadorAvisosSecretariaPainel();
        renderizarAvisosSecretariaPainel();
    } catch (erro) {
        console.error("Erro ao marcar avisos da Secretaria como lidos:", erro);
        toast("Não foi possível salvar a leitura dos avisos.");
    }
}

function renderizarAvisosSecretariaPainel() {
    const lista = $("#listaAvisosSecretariaPainel");
    if (!lista) return;
    if (!avisosSecretariaPainel.length) {
        lista.innerHTML = '<p class="avisos-vazio-secretaria-painel">Nenhum aviso publicado para a Secretaria.</p>';
        return;
    }

    lista.innerHTML = avisosSecretariaPainel.map((item) => {
        const lido = avisosLidosSecretariaPainel.includes(item.id);
        const prioridade = String(item.prioridade || "NORMAL").toUpperCase();
        const data = item.dataPublicacao ? new Date(item.dataPublicacao) : null;
        const dataTexto = data && !Number.isNaN(data.getTime()) ? data.toLocaleString("pt-BR") : "";
        return `
            <article class="aviso-secretaria-painel ${lido ? "aviso-lido-secretaria-painel" : "aviso-nao-lido-secretaria-painel"}">
                <div class="aviso-secretaria-painel-topo">
                    <strong>${escHtml(item.titulo || "Aviso")}</strong>
                    <span class="prioridade-aviso-secretaria-painel ${prioridade === "URGENTE" ? "urgente" : ""}">${escHtml(prioridade)}</span>
                </div>
                <p>${escHtml(item.mensagem || "")}</p>
                <div class="aviso-secretaria-painel-rodape">
                    <small>${escHtml(dataTexto)}</small>
                    ${lido ? '<span class="estado-aviso-secretaria-painel">Lido</span>' : `<button type="button" data-aviso-lido-secretaria-painel="${escHtml(item.id)}">Marcar como lido</button>`}
                </div>
            </article>
        `;
    }).join("");

    lista.querySelectorAll("[data-aviso-lido-secretaria-painel]").forEach((botao) => {
        botao.addEventListener("click", async () => {
            botao.disabled = true;
            try {
                await registrarLeituraAvisoSecretariaPainel(botao.dataset.avisoLidoSecretariaPainel);
                atualizarContadorAvisosSecretariaPainel();
                renderizarAvisosSecretariaPainel();
            } catch (erro) {
                console.error("Erro ao marcar aviso como lido:", erro);
                toast("Não foi possível salvar a leitura do aviso.");
                botao.disabled = false;
            }
        });
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        criarBotaoAvisosSecretaria();
        carregarAvisosSecretariaPainel();
    });
} else {
    criarBotaoAvisosSecretaria();
    carregarAvisosSecretariaPainel();
}
