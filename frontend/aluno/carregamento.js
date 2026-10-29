function esconderCarregamento() {
    if (typeof window.finalizarCarregamentoGlobal === "function") {
        window.finalizarCarregamentoGlobal();
        return;
    }

    const tela = document.getElementById("tela-carregamento");
    if (!tela) return;
    tela.classList.add("oculta");
    window.setTimeout(() => tela.remove(), 400);
}
