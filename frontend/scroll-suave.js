(function () {
    "use strict";

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const GSAP_URL = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js";
    const DURATION = 0.16;
    const MAX_DELTA = 100;
    let ready = false;
    let targetY = 0;
    let scrollTween = null;
    const position = { y: 0 };

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

    function onWheel(event) {
        if (!ready || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.deltaY === 0 || hasScrollableParent(event.target, event.deltaY)) return;

        const current = window.scrollY || window.pageYOffset || 0;
        const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        let delta = event.deltaMode === 1 ? event.deltaY * 16
            : event.deltaMode === 2 ? event.deltaY * window.innerHeight
            : event.deltaY;

        // Evita que um único evento muito grande provoque um salto exagerado.
        delta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, delta));

        if (!scrollTween) targetY = current;
        targetY = Math.max(0, Math.min(max, targetY + delta));

        if (Math.abs(targetY - current) < 1) return;
        event.preventDefault();

        if (scrollTween) scrollTween.kill();

        position.y = current;
        scrollTween = window.gsap.to(position, {
            y: targetY,
            duration: DURATION,
            ease: "power1.out",
            overwrite: true,
            onUpdate: () => window.scrollTo(0, position.y),
            onComplete: () => {
                window.scrollTo(0, targetY);
                scrollTween = null;
            },
            onInterrupt: () => {
                scrollTween = null;
            }
        });
    }

    loadGSAP().then(() => {
        ready = true;
        targetY = window.scrollY || window.pageYOffset || 0;
        window.addEventListener("wheel", onWheel, { passive: false });
    }).catch((error) => {
        console.warn("Não foi possível carregar o GSAP; a rolagem nativa continuará ativa.", error);
    });
})();
