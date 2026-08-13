/**
 * Vayu — Lenis smooth scroll.
 *
 * Loaded on every page from the local vendor copy. Touch is left native
 * (syncTouch defaults to false) so phones keep their normal momentum feel.
 */

import { loadScript } from './scripts.js';

export async function startLenis() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    try {
        await loadScript('/js/vendor/lenis.min.js');
    } catch (err) {
        console.warn('Smooth scroll unavailable, falling back to native scrolling.', err);
        return;
    }

    // exposed so script.js can pause it while the mobile menu sheet is open
    // A longer duration and a lower `lerp`-equivalent give the page weight:
    // it keeps gliding after the wheel stops rather than halting with it.
    // `touchMultiplier` is left alone — touch stays native (see above), so
    // phones keep the momentum their OS provides.
    window.lenis = new Lenis({
        duration: 1.6,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -11 * t)),
        smoothWheel: true,
        wheelMultiplier: 0.9
    });

    const raf = (time) => {
        window.lenis.raf(time);
        requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
}

/** Panels whose own list should scroll natively instead of driving the page. */
export function markNativeScrollAreas(selectors = ['.mobile-menu-body']) {
    for (const selector of selectors) {
        document.querySelectorAll(selector).forEach(el => {
            el.dataset.lenisPrevent = '';
        });
    }
}

/** Scroll helper that routes through Lenis when it is active. */
export const scrollToTop = () => {
    if (window.lenis) window.lenis.scrollTo(0);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
};
