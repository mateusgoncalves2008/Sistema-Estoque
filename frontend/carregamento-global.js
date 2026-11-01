(() => {
    const inicioCarregamento = Date.now();
    let requisicoesAtivas = 0;
    let ultimaRequisicao = inicioCarregamento;
    let finalizacaoAgendada = false;
    let progresso = 0;

    function mensagemDoPainel() {
        const caminho = window.location.pathname.toLowerCase();

        if (caminho.includes("/aluno")) return "Preparando o painel do aluno...";
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

    function ocultarTelaCarregamento() {
        const tela = document.getElementById("tela-carregamento-global");
        if (!tela) return;
        atualizarBarra(100);
        tela.classList.add("oculta");
    }

    function esconderCarregamentoGlobal() {
        const tela = document.getElementById("tela-carregamento-global");
        if (!tela || finalizacaoAgendada) return;
        finalizacaoAgendada = true;

        atualizarBarra(100);
        const esperaMinima = Math.max(0, 1800 - (Date.now() - inicioCarregamento));
        const esperaConclusaoVisual = Math.max(300, esperaMinima);

        window.setTimeout(ocultarTelaCarregamento, esperaConclusaoVisual);
    }

    window.mostrarCarregamentoGlobal = (mensagem) => {
        const tela = document.getElementById("tela-carregamento-global");
        if (!tela) return;

        finalizacaoAgendada = true;
        progresso = 0;
        atualizarBarra(18);
        const legenda = document.getElementById("texto-carregamento-global");
        if (legenda) legenda.textContent = mensagem || mensagemDoPainel();
        tela.classList.remove("oculta");
        window.requestAnimationFrame(() => atualizarBarra(82));
    };

    window.finalizarCarregamentoGlobal = ocultarTelaCarregamento;

    let fetchOriginal = null;
    if (typeof window.fetch === "function") {
        fetchOriginal = window.fetch.bind(window);
        window.fetch = (...args) => {
            const entrada = args[0];
            const url = typeof entrada === "string" ? entrada : entrada?.url || "";
            if (
                window.__hauySessaoAlterada &&
                String(url).includes("/api/") &&
                !String(url).includes("/api/logout")
            ) {
                return Promise.reject(new Error("A sessão foi alterada em outra aba."));
            }

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

        const painelAluno = window.location.pathname.toLowerCase().includes("/aluno");
        if ((!painelAluno && carregamentoConcluido) || tempoDecorrido >= 20000) {
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

    function iniciarProtecaoDeSessao() {
        const caminho = window.location.pathname.toLowerCase();
        const paginaDePainel = ["/aluno/", "/professor/", "/responsavel/", "/secretaria/", "/adm/"]
            .some((trecho) => caminho.includes(trecho));
        if (!paginaDePainel) return;

        const enviarPresenca = () => {
            if (document.visibilityState === "visible" && !window.__hauySessaoAlterada) {
                fetchOriginal("/api/chat/presenca", { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
            }
        };
        window.setTimeout(() => {
            enviarPresenca();
            window.setInterval(enviarPresenca, 3000);
            document.addEventListener("visibilitychange", enviarPresenca);
        }, 1200);

        let usuarioEsperado;

        try {
            usuarioEsperado = JSON.parse(sessionStorage.getItem("usuarioLogado") || "null");
        } catch {
            return;
        }

        const idEsperado = String(usuarioEsperado?.id || usuarioEsperado?.usuarioID || "").trim();
        if (!idEsperado) return;

        let verificacaoEmAndamento = false;
        let sessaoConfirmada = false;

        function bloquearPainel() {
            if (window.__hauySessaoAlterada) return;
            window.__hauySessaoAlterada = true;

            const bloqueio = document.createElement("div");
            bloqueio.id = "hauy-sessao-alterada";
            bloqueio.setAttribute("role", "alertdialog");
            bloqueio.setAttribute("aria-modal", "true");
            bloqueio.innerHTML = `
                <div class="hauy-sessao-cartao">
                    <div class="hauy-sessao-marca">HAUY</div>
                    <h2>Sessão alterada</h2>
                    <p>Sua sessão foi alterada em outra aba. Entre novamente para continuar.</p>
                    <button type="button" id="hauy-sessao-entrar">Ir para o login</button>
                </div>
            `;

            const estilo = document.createElement("style");
            estilo.textContent = `
                #hauy-sessao-alterada {
                    position: fixed; inset: 0; z-index: 2147483647;
                    display: grid; place-items: center; padding: 24px;
                    background: rgba(25, 17, 13, .72); backdrop-filter: blur(4px);
                    font-family: inherit;
                }
                #hauy-sessao-alterada .hauy-sessao-cartao {
                    width: min(100%, 430px); padding: 30px; text-align: center;
                    background: #fffdfa; border: 1px solid #e6d8cc;
                    border-radius: 18px; box-shadow: 0 18px 55px rgba(0,0,0,.22);
                    color: #352219;
                }
                #hauy-sessao-alterada .hauy-sessao-marca {
                    display: inline-block; margin-bottom: 14px; color: #c95730;
                    font-weight: 800; letter-spacing: .16em;
                }
                #hauy-sessao-alterada h2 { margin: 0 0 10px; font-size: 1.35rem; }
                #hauy-sessao-alterada p { margin: 0 0 22px; line-height: 1.55; color: #6d5b50; }
                #hauy-sessao-alterada button {
                    border: 0; border-radius: 9px; padding: 12px 20px;
                    background: #c95730; color: #fff; font: inherit; font-weight: 700;
                    cursor: pointer;
                }
            `;
            document.head.appendChild(estilo);
            document.body.appendChild(bloqueio);
            document.getElementById("hauy-sessao-entrar")?.addEventListener("click", () => {
                window.location.href = "/";
            });
        }

        async function conferirSessao() {
            if (verificacaoEmAndamento || window.__hauySessaoAlterada) return;
            verificacaoEmAndamento = true;

            try {
                const resposta = await fetchOriginal("/api/sessao", {
                    method: "GET",
                    credentials: "include",
                    cache: "no-store",
                    headers: { "Accept": "application/json" },
                });
                if (resposta.status === 401) {
                    if (sessaoConfirmada) bloquearPainel();
                    return;
                }
                if (!resposta.ok) return;

                const dados = await resposta.json();
                const idAtual = String(dados?.usuario?.usuarioID || "").trim();
                if (!dados?.sucesso || !idAtual) return;
                if (idAtual !== idEsperado) {
                    bloquearPainel();
                    return;
                }
                sessaoConfirmada = true;
            } catch {
                // Falhas temporárias de rede não encerram a sessão do painel.
            } finally {
                verificacaoEmAndamento = false;
            }
        }

        window.setTimeout(() => {
            conferirSessao();
            window.setInterval(conferirSessao, 5000);
            window.addEventListener("pagehide", () => {
                // A presença expira no servidor após 3 segundos sem heartbeat.
            });
        }, 1200);
    }

    document.addEventListener("DOMContentLoaded", () => {
        atualizarLegenda();
        verificarFimDoCarregamento();
        iniciarProtecaoDeSessao();
    }, { once: true });
})();