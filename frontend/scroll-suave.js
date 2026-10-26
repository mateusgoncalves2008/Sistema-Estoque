(function () {
    "use strict";

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const GSAP_CDN = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/";
    const scrollStates = new WeakMap();
    let ready = false;

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = src;
            script.async = false;
            script.onload = resolve;
            script.onerror = () => reject(new Error("Não foi possível carregar " + src));
            document.head.appendChild(script);
        });
    }

    function canScroll(element, delta) {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        if (!/(auto|scroll|overlay)/.test(style.overflowY)) return false;
        if (element.scrollHeight <= element.clientHeight + 1) return false;
        return delta < 0
            ? element.scrollTop > 0
            : element.scrollTop + element.clientHeight < element.scrollHeight - 1;
    }

    function findScrollTarget(event) {
        let element = event.target instanceof Element ? event.target : null;
        while (element && element !== document.body && element !== document.documentElement) {
            if (canScroll(element, event.deltaY)) return element;
            element = element.parentElement;
        }
        return window;
    }

    function getCurrentY(target) {
        return target === window ? (window.scrollY || window.pageYOffset || 0) : target.scrollTop;
    }

    function getMaxY(target) {
        return target === window
            ? Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
            : Math.max(0, target.scrollHeight - target.clientHeight);
    }

    function smoothWheel(event) {
        if (!ready || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.deltaY === 0) return;

        const target = findScrollTarget(event);
        const current = getCurrentY(target);
        const max = getMaxY(target);
        const oldState = scrollStates.get(target);
        const destinationBase = oldState ? oldState.destination : current;

        // Respeita os limites da área rolável e não acumula movimento além do fim.
        const delta = event.deltaMode === 1 ? event.deltaY * 16
            : event.deltaMode === 2 ? event.deltaY * window.innerHeight
            : event.deltaY;
        const destination = Math.max(0, Math.min(max, destinationBase + delta));

        // Deixa o comportamento nativo agir se já estamos no limite.
        if ((event.deltaY > 0 && current >= max && (!oldState || oldState.destination >= max)) ||
            (event.deltaY < 0 && current <= 0 && (!oldState || oldState.destination <= 0))) {
            scrollStates.delete(target);
            return;
        }

        event.preventDefault();

        let state = oldState;
        if (!state) {
            state = { destination: current, tween: null };
            scrollStates.set(target, state);
        }
        state.destination = destination;

        if (state.tween) state.tween.kill();

        const scrollObject = target === window ? window : target;
        state.tween = window.gsap.to(scrollObject, {
            duration: 0.38,
            ease: "power2.out",
            overwrite: true,
            scrollTo: { y: destination, autoKill: true },
            onComplete: () => {
                if (scrollStates.get(target) === state) {
                    state.tween = null;
                    if (Math.abs(getCurrentY(target) - state.destination) < 2) {
                        scrollStates.delete(target);
                    }
                }
            },
            onInterrupt: () => {
                if (scrollStates.get(target) === state) state.tween = null;
            }
        });
    }

    function start() {
        ready = true;
        document.documentElement.style.overflowX = "hidden";
        document.body.style.overflowX = "hidden";
        window.addEventListener("wheel", smoothWheel, { passive: false });
    }

    Promise.all([
        loadScript(GSAP_CDN + "gsap.min.js"),
        loadScript(GSAP_CDN + "ScrollToPlugin.min.js")
    ]).then(() => {
        window.gsap.registerPlugin(window.ScrollToPlugin);
        start();
    }).catch((error) => {
        console.error("Rolagem suave GSAP indisponível; mantendo rolagem nativa.", error);
    });
})();
