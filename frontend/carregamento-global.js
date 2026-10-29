(() => {
    const inicioCarregamento = Date.now();
    let requisicoesAtivas = 0;
    let ultimaRequisicao = inicioCarregamento;
    let finalizacaoAgendada = false;

    function mensagemDoPainel() {
        const caminho = window.location.pathname.toLowerCase();

        if (caminho.includes("/professor")) return "Preparando o painel do professor...";
        if (caminho.includes("/responsavel")) return "Preparando o painel do responsável...";
        if (caminho.includes("/secretaria")) return "Preparando o painel da secretaria...";
        if (caminho.includes("/adm")) return "Preparando o painel administrativo...";
        return "Preparando o acesso ao sistema...";
    }

    function atualizarLegenda() {
        const legenda = document.getElementById("texto-carregamento-global");
        if (legenda) legenda.textContent = mensagemDoPainel();
    }

    function esconderCarregamentoGlobal() {
        const tela = document.getElementById("tela-carregamento-global");
        if (!tela || finalizacaoAgendada) return;
        finalizacaoAgendada = true;
        const esperaMinima = Math.max(0, 1800 - (Date.now() - inicioCarregamento));
        window.setTimeout(() => {
            tela.classList.add("oculta");
            window.setTimeout(() => tela.remove(), 400);
        }, esperaMinima);
    }

    if (typeof window.fetch === "function") {
        const fetchOriginal = window.fetch.bind(window);
        window.fetch = (...args) => {
            requisicoesAtivas++;
            ultimaRequisicao = Date.now();
            return fetchOriginal(...args).finally(() => {
                requisicoesAtivas = Math.max(0, requisicoesAtivas - 1);
                ultimaRequisicao = Date.now();
            });
        };
    }

    function verificarFimDoCarregamento() {
        const tempoDecorrido = Date.now() - inicioCarregamento;
        const semRequisicoesRecentes = Date.now() - ultimaRequisicao >= 650;

        if (tempoDecorrido >= 1800 && requisicoesAtivas === 0 && semRequisicoesRecentes) {
            esconderCarregamentoGlobal();
            return;
        }
        if (tempoDecorrido >= 20000) {
            esconderCarregamentoGlobal();
            return;
        }
        window.setTimeout(verificarFimDoCarregamento, 120);
    }

    document.addEventListener("DOMContentLoaded", () => {
        atualizarLegenda();
        verificarFimDoCarregamento();
    }, { once: true });
})();