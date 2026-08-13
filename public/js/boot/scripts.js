/**
 * Vayu — loading the classic (non-module) scripts.
 */

/** Append a <script> and resolve when it has run. */
export const loadScript = (src) => new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(el);
});

/**
 * js/script.js — the site's behaviours.
 *
 * Called immediately after the header/footer are in the DOM, and NOT at
 * the end of the boot sequence. It used to sit after `await startLenis()`,
 * which awaits a network fetch of the Lenis bundle — so `--hdr-h` (which
 * script.js measures and publishes) stayed at its CSS fallback until that
 * download finished, and every page visibly jumped once it landed.
 */
export function loadSiteScript() {
    // guard against a double load: product.html used to also include
    // script.js itself, which bound every listener twice
    if (document.querySelector('script[data-vayu-behaviours]')) return;
    const s = document.createElement('script');
    s.src = '/js/script.js';
    s.dataset.vayuBehaviours = '';
    document.body.appendChild(s);
}
