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

let series = [];
let teachers = [];

let evs = [];
let audit = [];

let disciplinas = [];
let professorTurmas = [];
let locais = [];
let categorias = [];

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
        const [dados, dadosTurmas] = await Promise.all([
            api("/secretaria/dashboard"),
            api("/secretaria/turmas"),
        ]);

        indicadores = dados.indicadores || {};

        users = (dados.usuarios || []).map((u) => ({
            id: u.usuarioID,
            n: u.nome,
            email: u.email,
            p:
                u.tipoUsuario === "ALUNO"
                    ? "Aluno"
                    : u.tipoUsuario === "PROFESSOR"
                      ? "Professor"
                      : u.tipoUsuario,
            t: u.turma || u.ano || u.identificador || "-",
            tu: u.turno || "-",
            a: u.status === "ATIVO",
        }));

        prods = (dados.produtos || []).map((p) => ({
            id: p.produtoID,
            n: p.nome,
            c: p.categoria || "Sem categoria",
            l: p.estoques?.[0]?.local || "Sem local",
            q: p.quantidade || 0,
            m: p.estoqueMinimo || 0,
            estoques: p.estoques || [],
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

        movs = (dados.movimentacoes || []).map((m) => [
            m.dataHora ? new Date(m.dataHora).toLocaleDateString("pt-BR") : "-",
            formatarTipoMovimentacao(m.tipo),
            m.usuario || "Usuário",
            m.produto || "Produto",
        ]);

        series = montarTurmas(dadosTurmas.turmas || []);

        disciplinas = dados.disciplinas || [];

        professorTurmas = dados.professorTurmas || [];

        teachers = montarProfessores(
            dados.professores || [],
            dados.turmas || [],
            dados.disciplinas || [],
            professorTurmas,
        );

        evs = (dados.calendario || []).map((e) => ({
            id: e.eventoID,
            d: e.data ? e.data.substring(0, 10) : "",
            t: String(e.tipo || "").toLowerCase(),
            n: e.titulo,
            descricao: e.descricao || "",
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
        const tipo = m[1] || "Outro";
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
    const busca = ($("#uq")?.value || "").toLowerCase();

    const filtro = $("#uf")?.value || "";

    const filtrados = users.filter((u) => {
        const nomeOk = u.n.toLowerCase().includes(busca);

        const perfilOk = !filtro || u.p === filtro;

        return nomeOk && perfilOk;
    });

    $("#ut2").innerHTML = T(
        ["Nome", "Perfil", "Turma / Disciplina", "Turno", "Situação", "Ações"],
        filtrados.map((u) => [
            `<b>${u.n}</b>`,
            u.p,
            u.t,
            u.tu,
            u.a ? tg("Ativo") : tg("Inativo", "m"),
            `
                <button
                    class="btn s"
                    onclick="togUser('${u.id}', ${u.a})"
                >
                    ${u.a ? "Desativar" : "Reativar"}
                </button>
            `,
        ]),
    );
}

async function togUser(usuarioID, ativo) {
    try {
        await api(
            `/secretaria/usuarios/${encodeURIComponent(usuarioID)}/status`,
            {
                method: "PATCH",
                body: JSON.stringify({
                    status: ativo ? "INATIVO" : "ATIVO",
                }),
            },
        );

        toast(ativo ? "Usuário desativado." : "Usuário reativado.");

        await carregarDados();
    } catch (erro) {
        toast(erro.message);
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

async function resv(reservaID, status) {
    try {
        await api(
            `/secretaria/reservas/${encodeURIComponent(reservaID)}/status`,
            {
                method: "PATCH",
                body: JSON.stringify({
                    status: status === "Aprovada" ? "APROVADA" : "CANCELADA",
                }),
            },
        );

        toast(
            status === "Aprovada" ? "Reserva aprovada." : "Reserva cancelada.",
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

async function addEv() {
    const data = $("#cd")?.value;

    const tipo = $("#ct")?.value;

    const titulo = $("#cn")?.value.trim();

    if (!data || !tipo || !titulo) {
        return toast("Preencha data, tipo e descrição.");
    }

    try {
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
    }
}

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
                    ${l[i] || ""}: ${x}
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
            >${l[i] || ""}</text>
        `;
    });

    return s + "</svg>";
}

function line(v, l) {
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
            >${l[i] || ""}</text>
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
                                ${x[0]} - ${x[1]}
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
                    <span>${x[0]}</span>
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

/* =========================================================
   RENDERIZAÇÃO
========================================================= */

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
                            ${a[0]}
                            <span>${a[1]}</span>
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

        $("#ch-prof").innerHTML = bars(
            dados.map((x) => x[3]),
            dados.map((x) => x[0].split(" ")[0]),
        );

        $("#t-prof").innerHTML = T(
            ["Professor", "MASP", "E-mail", "Aulas semanais"],
            dados,
        );
    },

    usuarios() {
        uList();
    },

    acervo() {
        $("#ch-acervo").innerHTML = bars(
            prods.map((p) => p.q),
            prods.map((p) => p.n),
        );

        $("#low").innerHTML =
            prods
                .filter((p) => p.q <= p.m)
                .map(
                    (p) =>
                        `<div class="log">
                            <b>${p.n}</b>
                            <span>
                                ${p.q}
                            </span>
                        </div>`,
                )
                .join("") ||
            `<p class="sub">
                Todos os itens estão acima do mínimo.
            </p>`;

        $("#t-acervo").innerHTML = T(
            ["Produto", "Categoria", "Local", "Qtd.", "Mínimo", "Situação"],
            prods.map((p) => [
                `<b>${p.n}</b>`,
                p.c,
                p.l,
                p.q,
                p.m,
                p.q <= p.m ? tg("Estoque baixo", "r") : tg("Normal"),
            ]),
        );
    },

    reservas() {
        $("#t-res").innerHTML = T(
            ["Solicitante", "Item", "Data", "Situação", "Ações"],
            reservas.map((r) => [
                `<b>${r.q}</b>`,
                r.i,
                r.d,
                tg(
                    r.s,
                    r.s === "Pendente" ? "g" : r.s === "Cancelada" ? "m" : "",
                ),
                r.s === "Pendente"
                    ? `
                                <button
                                    class="btn s"
                                    onclick="resv('${r.id}', 'Aprovada')"
                                >
                                    Aprovar
                                </button>

                                <button
                                    class="btn s d"
                                    onclick="resv('${r.id}', 'Cancelada')"
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
                    `<b>${e.q}</b>`,
                    e.i,
                    e.r,
                    e.p,
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

    movs() {
        const filtro = $("#mf")?.value || "";

        const dados = movs.filter((m) => !filtro || m[1] === filtro);

        $("#mt").innerHTML = T(
            ["Data", "Tipo", "Pessoa", "Item"],
            dados.map((m) => [m[0], m[1], m[2], m[3]]),
        );
    },

    calendario() {
        const TP = {
            feriado: ["Feriado", "#C2452D"],
            recesso: ["Recesso", "#8A6BBE"],
            prova: ["Prova", "#D9A441"],
            reuniao: ["Reunião", "#7A8B2E"],
            evento: ["Evento escolar", "#2F6FB5"],
        };

        $("#t-cal").innerHTML = T(
            ["Data", "Tipo", "Descrição"],
            evs.map((e) => [
                e.d ? e.d.split("-").reverse().join("/") : "-",

                `
                            <span
                                class="dot"
                                style="--c:${TP[e.t]?.[1] || "#888"}"
                            ></span>
                            ${TP[e.t]?.[0] || e.t}
                        `,

                `<b>${e.n}</b>`,
            ]),
        );
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

    avisos() {
        /*
         * A planilha atual não possui
         * uma tabela própria para avisos
         * gerais.
         *
         * Não vamos inventar dados aqui.
         */
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
                            ${a[0]}
                            <span>${a[1]}</span>
                        </div>`,
                )
                .join("") ||
            `<p class="sub">
                Nenhuma ação registrada.
            </p>`;
    },
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

document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-p],[data-go]");

    if (!b) return;

    go(b.dataset.p || b.dataset.go);
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

    select.innerHTML = `<option value="">Selecione o professor</option>`;

    professoresReais.forEach((professor) => {
        const option = document.createElement("option");

        option.value = professor.usuarioID;

        option.textContent = `${professor.nome} — ${
            professor.identificador || "Sem MASP"
        }`;

        select.appendChild(option);
    });
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

async function addProf() {
    const nome = $("#pn")?.value.trim();
    const email = $("#pe")?.value.trim();
    const senha = $("#ps")?.value;
    const masp = $("#pm")?.value.trim();

    if (!nome) {
        return toast("Informe o nome do professor.");
    }

    if (!email) {
        return toast("Informe o e-mail do professor.");
    }

    if (!senha) {
        return toast("Informe uma senha provisória.");
    }

    try {
        const resultado = await api("/secretaria/professores", {
            method: "POST",
            body: JSON.stringify({
                nome,
                email,
                senha,
                masp,
            }),
        });

        if (!resultado.sucesso) {
            throw new Error(
                resultado.erro || "Não foi possível cadastrar o professor.",
            );
        }

        toast("Professor cadastrado com sucesso.");

        $("#pn").value = "";
        $("#pe").value = "";
        $("#ps").value = "";
        $("#pm").value = "";

        await carregarDados();

        await carregarDadosProfessores();
    } catch (erro) {
        console.error("Erro ao cadastrar professor:", erro);
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
