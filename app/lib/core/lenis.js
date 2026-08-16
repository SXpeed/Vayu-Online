/**
 * Vayu — Lenis smooth scroll.
 *
 * Its own lazy bundle, loaded by app.js after `load`, so smooth scroll
 * costs nothing before first render. The vendor build is imported rather
 * than appended as a <script>, which is what it used to be: that cost a
 * second network level (include.js → boot/lenis.js → boot/scripts.js →
 * /js/vendor/lenis.min.js) for a 14 KB file. esbuild folds it in here
 * instead, so the whole feature is one request.
 *
 * Touch is left native (syncTouch defaults to false) so phones keep their
 * normal momentum feel.
 */

import { markNativeScrollAreas } from './scroll.js';

/**
 * The vendor bundle ends with a redundant
 * `globalThis.Lenis.prototype = Lenis.prototype` — a no-op assignment of a
 * class's prototype to itself, and a TypeError in strict mode because that
 * property is read-only. It went unnoticed while the file was appended as a
 * *classic* script, where sloppy mode swallows the failed write. Bundled
 * into a module it throws, so it is imported inside a try: the throw
 * arrives after globalThis.Lenis has been set, and the constructor is
 * perfectly usable.
 */
async function loadVendor() {
    try {
        await import('../vendor/lenis.min.js');
    } catch (err) {
        if (!globalThis.Lenis) throw err;
    }
    return globalThis.Lenis;
}

export async function startLenis() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let Lenis;
    try {
        Lenis = await loadVendor();
    } catch (err) {
        console.warn('Smooth scroll unavailable, falling back to native scrolling.', err);
        return;
    }
    if (!Lenis) return;

    // exposed so core/shell.js can pause it while the mobile menu sheet is
    // open. A longer duration and a lower `lerp`-equivalent give the page
    // weight: it keeps gliding after the wheel stops rather than halting
    // with it. `touchMultiplier` is left alone — touch stays native (see
    // above), so phones keep the momentum their OS provides.
    window.lenis = new Lenis({
        duration: 1.6,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -11 * t)),
        smoothWheel: true,
        wheelMultiplier: 0.9,
    });

    const raf = (time) => {
        window.lenis.raf(time);
        requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);

    markNativeScrollAreas();
}

export default startLenis;
