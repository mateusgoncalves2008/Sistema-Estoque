(() => {
    const inicioCarregamento = Date.now();
    let requisicoesAtivas = 0;
    let ultimaRequisicao = inicioCarregamento;
    let finalizacaoAgendada = false;
    let progresso = 0;

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

    function atualizarBarra(valor) {
        const barra = document.querySelector(".barra-carregamento-global");
        if (!barra) return;
        progresso = Math.max(progresso, Math.min(100, valor));
        barra.style.setProperty("--progresso-carregamento", progresso + "%");
        barra.setAttribute("aria-valuenow", String(Math.round(progresso)));
        barra.setAttribute("aria-valuemin", "0");
        barra.setAttribute("aria-valuemax", "100");
    }

    function esconderCarregamentoGlobal() {
        const tela = document.getElementById("tela-carregamento-global");
        if (!tela || finalizacaoAgendada) return;
        finalizacaoAgendada = true;

        atualizarBarra(100);
        const esperaMinima = Math.max(0, 1800 - (Date.now() - inicioCarregamento));
        const esperaConclusaoVisual = Math.max(300, esperaMinima);

        window.setTimeout(() => {
            tela.classList.add("oculta");
            window.setTimeout(() => tela.remove(), 400);
        }, esperaConclusaoVisual);
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
        if (finalizacaoAgendada) return;

        const tempoDecorrido = Date.now() - inicioCarregamento;
        const semRequisicoesRecentes = Date.now() - ultimaRequisicao >= 650;
        const carregamentoConcluido =
            tempoDecorrido >= 1800 &&
            requisicoesAtivas === 0 &&
            semRequisicoesRecentes;

        if (carregamentoConcluido || tempoDecorrido >= 20000) {
            esconderCarregamentoGlobal();
            return;
        }

        // Avança devagar até 85% e fica aguardando se o painel demorar.
        // Só completa quando as requisições terminarem ou atingir o limite de segurança.
        if (progresso < 85) {
            atualizarBarra(Math.min(85, progresso + 0.65));
        }

        window.setTimeout(verificarFimDoCarregamento, 200);
    }

    document.addEventListener("DOMContentLoaded", () => {
        atualizarLegenda();
        verificarFimDoCarregamento();
    }, { once: true });
})();