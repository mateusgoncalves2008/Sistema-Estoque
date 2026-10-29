(() => {
    const inicioCarregamento = Date.now();
    let requisicoesAtivas = 0;
    let ultimaRequisicao = inicioCarregamento;
    let finalizacaoAgendada = false;

    function nomeUsuarioAtual() {
        const seletores = [
            "#nomeUsuario", "#welcomeName", "#sidebarAccountName",
            "#nomeHero", "#nomeUsuarioLateral", "#userName"
        ];
        for (const seletor of seletores) {
            const elemento = document.querySelector(seletor);
            const nome = elemento?.textContent?.trim();
            if (nome && !/^(professor|responsável|usuário|carregando\.\.\.)$/i.test(nome)) {
                return nome;
            }
        }
        for (const chave of ["usuarioLogado", "usuario", "usuarioAtual"]) {
            try {
                const valor = sessionStorage.getItem(chave) || localStorage.getItem(chave);
                if (!valor) continue;
                const usuario = JSON.parse(valor);
                const nome = usuario.nome || usuario.nomeCompleto || usuario.name;
                if (nome && String(nome).trim()) return String(nome).trim();
            } catch (_) {}
        }
        return "";
    }

    function atualizarLegenda() {
        const legenda = document.getElementById("texto-carregamento-global");
        if (!legenda) return;
        const nome = nomeUsuarioAtual();
        const texto = nome
            ? `Carregando dados de ${nome} (usuário)...`
            : "Carregando dados do usuário...";
        if (legenda.textContent !== texto) legenda.textContent = texto;
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
        atualizarLegenda();
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

    const observador = new MutationObserver(atualizarLegenda);
    document.addEventListener("DOMContentLoaded", () => {
        atualizarLegenda();
        observador.observe(document.body, { childList: true, subtree: true, characterData: true });
        verificarFimDoCarregamento();
    }, { once: true });
})();
