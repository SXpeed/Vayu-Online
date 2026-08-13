/**
 * Vayu — make the next page ready before it is asked for.
 *
 * Two mechanisms, because no single one covers every engine:
 *
 *   prerender  (Chromium) builds the whole next page in a hidden tab, so
 *              activating it is a swap of an already painted frame.
 *   prefetch   (everywhere, phones included) pulls the document into the
 *              HTTP cache, so the load that remains is from memory rather
 *              than the network.
 *
 * Together with the cross-document view transition in styles.css, the
 * switch has no blank frame and no visible load on either platform.
 *
 * Skipped entirely on a metered or data-saver connection: speculative
 * loads that are never used spend the user's data.
 */

import { documentLinkFrom } from './links.js';

/**
 * Cart and My Account render from localStorage at load, so a copy built
 * before the user's last add would show stale contents. Everything else on
 * the site is static and safe to build early.
 */
const NO_SPECULATION = ['/pages/cart.html', '/pages/user-profile.html'];

const supportsRules = () => HTMLScriptElement.supports?.('speculationrules') === true;

function addSpeculationRules() {
    if (document.querySelector('script[type="speculationrules"]')) return;

    const rules = document.createElement('script');
    rules.type = 'speculationrules';
    rules.textContent = JSON.stringify({
        prerender: [{
            where: {
                and: [
                    { href_matches: '/*' },
                    ...NO_SPECULATION.map(p => ({ not: { href_matches: p } })),
                    { not: { selector_matches: '[target="_blank"], [download], [rel~="external"]' } }
                ]
            },
            // on hover (~200ms) and on pointerdown — intent, not sight
            eagerness: 'moderate'
        }]
    });
    document.head.appendChild(rules);
}

/**
 * Prefetch fallback for engines without speculation rules. pointerenter
 * covers a cursor; pointerdown covers a finger, where the head start is
 * the time between touch and release.
 */
function addPrefetchOnIntent() {
    const warmed = new Set();

    const warm = (e) => {
        const url = documentLinkFrom(e.target);
        if (!url) return;
        if (url.pathname === location.pathname) return;
        if (NO_SPECULATION.includes(url.pathname)) return;
        if (warmed.has(url.href)) return;

        warmed.add(url.href);
        const tag = document.createElement('link');
        tag.rel = 'prefetch';
        tag.href = url.href;
        document.head.appendChild(tag);
    };

    document.addEventListener('pointerenter', warm, { capture: true, passive: true });
    document.addEventListener('pointerdown', warm, { capture: true, passive: true });
}

export function enableSpeculation() {
    if (navigator.connection?.saveData) return;
    if (supportsRules()) addSpeculationRules();
    else addPrefetchOnIntent();
}
