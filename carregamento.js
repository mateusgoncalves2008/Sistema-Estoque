const inicioCarregamento = Date.now();

function esconderCarregamento() {
    const tela = document.getElementById("tela-carregamento");
    if (!tela) return;

    const espera = Math.max(0, 1800 - (Date.now() - inicioCarregamento));

    setTimeout(() => {
        tela.style.display = "none";
    }, espera);
}

window.addEventListener("load", esconderCarregamento);
