(function () {
    "use strict";

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const GSAP_CDN = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/";
    const stateByTarget = new WeakMap();
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
        const overflow = style.overflowY;
        if (!/(auto|scroll|overlay)/.test(overflow) || element.scrollHeight <= element.clientHeight + 1) return false;
        if (delta < 0) return element.scrollTop > 0;
        return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
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
        if (target === window) return window.scrollY || window.pageYOffset || 0;
        return target.scrollTop;
    }

    function getMaxY(target) {
        if (target === window) {
            return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        }
        return Math.max(0, target.scrollHeight - target.clientHeight);
    }

    function smoothWheel(event) {
        if (!ready || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.deltaY === 0) return;

        const target = findScrollTarget(event);
        const current = getCurrentY(target);
        const previous = stateByTarget.get(target);
        const start = previous ? previous.destination : current;
        const destination = Math.max(0, Math.min(getMaxY(target), start + event.deltaY * 1.15));

        if (Math.abs(destination - current) < 1) return;

        event.preventDefault();
        stateByTarget.set(target, { destination });

        window.gsap.to(target, {
            duration: 0.85,
            ease: "power3.out",
            overwrite: "auto",
            scrollTo: target === window
                ? { y: destination, autoKill: false }
                : { y: destination, autoKill: false },
            onComplete: () => {
                const state = stateByTarget.get(target);
                if (state && state.destination === destination) stateByTarget.delete(target);
            }
        });
    }

    function start() {
        ready = true;
        window.addEventListener("wheel", smoothWheel, { passive: false });
        document.documentElement.style.overflowX = "hidden";
        document.body.style.overflowX = "hidden";
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
