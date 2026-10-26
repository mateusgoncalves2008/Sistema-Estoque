(function () {
    "use strict";

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const GSAP_URL = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js";
    const SMOOTHNESS = 0.14;
    let ready = false;
    let destination = 0;
    let scrolling = false;

    function loadGSAP() {
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = GSAP_URL;
            script.async = true;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function canScroll(element, deltaY) {
        if (!(element instanceof HTMLElement)) return false;

        const style = window.getComputedStyle(element);
        if (!/(auto|scroll|overlay)/.test(style.overflowY)) return false;
        if (element.scrollHeight <= element.clientHeight + 1) return false;

        return deltaY < 0
            ? element.scrollTop > 0
            : element.scrollTop + element.clientHeight < element.scrollHeight - 1;
    }

    function hasScrollableParent(target, deltaY) {
        let element = target instanceof Element ? target.parentElement : null;

        while (element && element !== document.body && element !== document.documentElement) {
            if (canScroll(element, deltaY)) return true;
            element = element.parentElement;
        }

        return false;
    }

    function updateScroll() {
        const current = window.scrollY || window.pageYOffset || 0;
        const difference = destination - current;

        if (Math.abs(difference) < 0.8) {
            window.scrollTo(0, destination);
            scrolling = false;
            window.gsap.ticker.remove(updateScroll);
            return;
        }

        // Aproxima a posição desejada gradualmente, sem reiniciar uma animação a cada giro.
        window.scrollTo(0, current + difference * SMOOTHNESS);
    }

    function onWheel(event) {
        if (!ready || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.deltaY === 0 || hasScrollableParent(event.target, event.deltaY)) return;

        const current = window.scrollY || window.pageYOffset || 0;
        const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        const delta = event.deltaMode === 1
            ? event.deltaY * 16
            : event.deltaMode === 2
                ? event.deltaY * window.innerHeight
                : event.deltaY;

        if (!scrolling) destination = current;
        destination = Math.max(0, Math.min(max, destination + delta));

        if (Math.abs(destination - current) < 1) return;

        event.preventDefault();

        if (!scrolling) {
            scrolling = true;
            window.gsap.ticker.add(updateScroll);
        }
    }

    loadGSAP().then(() => {
        ready = true;
        destination = window.scrollY || window.pageYOffset || 0;
        window.addEventListener("wheel", onWheel, { passive: false });
    }).catch((error) => {
        console.warn("Não foi possível carregar o GSAP; a rolagem nativa continuará ativa.", error);
    });
})();
