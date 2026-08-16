/**
 * Vayu — scrolling helpers that must NOT drag Lenis in with them.
 *
 * core/navigation.js and core/shell.js both scroll the page, and both are
 * part of app.js. If they imported these from core/lenis.js, the 14 KB
 * vendor bundle would be reachable from the entry and would end up either
 * inside it or in a chunk hanging off it — which is the whole problem this
 * refactor exists to remove. Lenis stays behind its own lazy entry; these
 * two functions only ever *use* it if it happens to be running.
 */

/** Scroll helper that routes through Lenis when it is active. */
export const scrollToTop = () => {
    if (window.lenis) window.lenis.scrollTo(0);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
};

/** Panels whose own list should scroll natively instead of driving the page. */
export function markNativeScrollAreas(selectors = ['.mobile-menu-body', '.nav-search-panel']) {
    for (const selector of selectors) {
        document.querySelectorAll(selector).forEach(el => {
            el.dataset.lenisPrevent = '';
        });
    }
}
