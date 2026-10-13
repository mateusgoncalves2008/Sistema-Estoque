const inicioCarregamento = Date.now();

function esconderCarregamento() {
    const tela = document.getElementById("tela-carregamento");
    if (!tela) return;

    const espera = Math.max(0, 1800 - (Date.now() - inicioCarregamento));

    setTimeout(() => {
        tela.style.opacity = "0";
        tela.style.visibility = "hidden";
        tela.style.pointerEvents = "none";

        setTimeout(() => tela.remove(), 700);
    }, espera);
}
