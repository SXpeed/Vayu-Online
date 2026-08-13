/**
 * Vayu — page-to-page navigation: the current-page highlight and the soft
 * switch between documents.
 */

import { documentLinkFrom } from './links.js';
import { scrollToTop } from './lenis.js';

const TRANSITION_CLASS = 'page-transitioning';

/**
 * Shorter than it was (340ms): the delay is dead time on screen, so it
 * buys the fade only as much room as it genuinely needs.
 */
const EXIT_MS = 140;

/**
 * Fallback only. Where the browser supports cross-document view
 * transitions, styles.css opts in with `@view-transition` and the browser
 * crossfades between the two documents with no blank frame at all — the
 * click handler below must then stay out of the way, because holding the
 * page at opacity 0 for a moment before navigating is exactly the gap the
 * view transition exists to remove.
 */
const supportsViewTransitions =
    typeof CSS !== 'undefined' &&
    CSS.supports?.('view-transition-name: none') &&
    'startViewTransition' in document;

/**
 * Drop any leftover transitioning class, which otherwise strands the body
 * at opacity:0 when a page is restored from the back/forward cache.
 */
export function clearPageTransition() {
    document.body.classList.remove(TRANSITION_CLASS);
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) document.body.classList.remove(TRANSITION_CLASS);
    });
}

/** Mark the current page in the desktop menu and the mobile bottom nav. */
function highlightCurrentPage() {
    const page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.menu a, .mobile-bottom-nav a').forEach(a => {
        const href = a.getAttribute('href');
        if (href !== page && !(page === '' && href === 'index.html')) return;
        a.classList.add('active');
        a.addEventListener('click', (e) => {
            e.preventDefault();
            scrollToTop();
        });
    });
}

function fadeOutBeforeLeaving() {
    document.addEventListener('click', (e) => {
        if (supportsViewTransitions) return;
        // let the browser handle new-tab / download / modified clicks. Without
        // this, ctrl/cmd-click was hijacked and opened in the same tab.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

        // same-document and cross-origin links both skip the transition
        const url = documentLinkFrom(e.target);
        if (!url) return;
        if (url.pathname === location.pathname && url.search === location.search) return;

        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        e.preventDefault();
        document.body.classList.add(TRANSITION_CLASS);
        setTimeout(() => { window.location.href = url.href; }, EXIT_MS);
    });
}

export function initNavigation() {
    highlightCurrentPage();
    fadeOutBeforeLeaving();
}
