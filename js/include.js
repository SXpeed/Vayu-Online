// Injects the shared header/footer from /partials into every page,
// marks the current page as active in both menus, then loads script.js.
// Requires the site to be served over HTTP (e.g. Live Server) — fetch()
// cannot read local files when a page is opened directly via file://.

// relative to this module's own URL (/js/), so it resolves from any page depth
import { productData, allProducts } from './catalogue.js';
import { addToCart, toggleWishlist, isInWishlist } from './shop.js';
import { categories, categoryTitle, subToSlug, slugToLabel } from './taxonomy.js';
import { renderTaxonomyNav } from './nav-render.js';
import { productCardHTML, bindProductTiles } from './product-card.js';

// script.js is a classic script and cannot import, so hand it the catalogue,
// the taxonomy, the shared tile and the cart/wishlist helpers through globals
// before it loads below
window.vayuCatalogue = productData;
window.vayuShop = { addToCart, toggleWishlist, isInWishlist };
window.vayuTaxonomy = { categories, categoryTitle, subToSlug, slugToLabel };
window.vayuProductCard = { productCardHTML, bindProductTiles };

// Inject theme-color meta tag for mobile browsers
if (!document.querySelector('meta[name="theme-color"]')) {
    const themeMeta = document.createElement('meta');
    themeMeta.name = 'theme-color';
    themeMeta.content = '#ffffff';
    document.head.appendChild(themeMeta);
}

// ---- make the next page ready before it is asked for ----
// Two mechanisms, because no single one covers every engine:
//
//   prerender  (Chromium) builds the whole next page in a hidden tab, so
//              activating it is a swap of an already painted frame.
//   prefetch   (everywhere, phones included) pulls the document into the
//              HTTP cache, so the load that remains is from memory rather
//              than the network.
//
// Together with the cross-document view transition in styles.css, the
// switch has no blank frame and no visible load on either platform.
//
// Skipped entirely on a metered or data-saver connection: speculative
// loads that are never used spend the user's data.
const speculationOK = !navigator.connection?.saveData;

// Cart and My Account render from localStorage at load, so a copy built
// before the user's last add would show stale contents. Everything else on
// the site is static and safe to build early.
const NO_SPECULATION = ['/pages/cart.html', '/pages/user-profile.html'];

if (speculationOK && HTMLScriptElement.supports?.('speculationrules') &&
    !document.querySelector('script[type="speculationrules"]')) {
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

// Prefetch fallback for engines without speculation rules. pointerenter
// covers a cursor; pointerdown covers a finger, where the head start is
// the time between touch and release.
if (speculationOK && !HTMLScriptElement.supports?.('speculationrules')) {
    const warmed = new Set();

    const warm = (e) => {
        const link = e.target.closest?.('a[href]');
        if (!link || link.target === '_blank' || link.hasAttribute('download')) return;

        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript') ||
            href.startsWith('tel') || href.startsWith('mailto')) return;

        const url = new URL(href, location.href);
        if (url.origin !== location.origin) return;
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

const inject = async (id, file) => {
    const slot = document.getElementById(id);
    if (!slot) return;
    const res = await fetch(file);
    if (!res.ok) throw new Error(`${file}: ${res.status}`);
    slot.outerHTML = await res.text();
};

// Load header and footer in parallel for faster page load
try {
    await Promise.all([
        inject('site-header', '/partials/header.html'),
        inject('site-footer', '/partials/footer.html')
    ]);
} catch (err) {
    console.error('Could not load shared header/footer. Serve the site over HTTP (Live Server), not file://.', err);
}

// Fill every category list from js/taxonomy.js — both header panels, the
// mobile sheet, both footer columns and the collection directory. Must run
// before loadSiteScript() below, because script.js binds the mobile
// accordion to the .macc-group elements this creates.
renderTaxonomyNav();

// Remove any leftover page-transitioning class (fixes back/forward cache issue
// where body stays at opacity:0 after navigating back to a page)
document.body.classList.remove('page-transitioning');
window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
        document.body.classList.remove('page-transitioning');
    }
});

// ---- site behaviours ----
// Loaded here, immediately after the header/footer are in the DOM, and
// NOT at the end of this module. It used to sit after `await startLenis()`,
// which awaits a network fetch of the Lenis bundle — so `--hdr-h` (which
// script.js measures and publishes) stayed at its CSS fallback until that
// download finished, and every page visibly jumped once it landed.
const loadSiteScript = () => {
    // guard against a double load: product.html used to also include
    // script.js itself, which bound every listener twice
    if (document.querySelector('script[data-vayu-behaviours]')) return;
    const s = document.createElement('script');
    s.src = '/js/script.js';
    s.dataset.vayuBehaviours = '';
    document.body.appendChild(s);
};
loadSiteScript();

// ---- Lenis smooth scroll ----
// Loaded on every page from the local vendor copy. Touch is left native
// (syncTouch defaults to false) so phones keep their normal momentum feel.
const loadScript = (src) => new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(el);
});

const startLenis = async () => {
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
};

await startLenis();

// let the menu sheet's own list scroll natively instead of driving the page
document.querySelectorAll('.mobile-menu-body').forEach(el => {
    el.dataset.lenisPrevent = '';
});

// ---- header search ----
(() => {
    const btn = document.getElementById('navSearchBtn');
    const field = document.getElementById('navSearch');
    const input = document.getElementById('navSearchInput');
    const clear = document.getElementById('navSearchClear');
    const panel = document.getElementById('navSearchResults');
    if (!btn || !input || !panel) return;

    // both from js/taxonomy.js — the local copies here listed only five
    // categories, so a search hit in Accents or Souvenir was labelled with
    // its raw slug and could not be matched by typing the category name
    const catLabel = categoryTitle;
    const prettySub = slugToLabel;

    if (panel) panel.dataset.lenisPrevent = '';

    let hits = [];
    let active = -1;

    const search = (raw) => {
        const q = raw.trim().toLowerCase();
        if (!q) return [];
        // match on product name, category and subcategory
        return allProducts
            .filter(p => `${p.name} ${catLabel(p.cat)} ${prettySub(p.sub)}`
                .toLowerCase().includes(q))
            .slice(0, 8);
    };

    const render = () => {
        if (!input.value.trim()) { panel.innerHTML = ''; return; }
        if (!hits.length) {
            panel.innerHTML = `<p class="nav-search-note">No matches for “${input.value.trim()}”</p>`;
            return;
        }
        panel.innerHTML = hits.map((p, i) => `
            <a class="nav-search-hit${i === active ? ' is-active' : ''}"
               href="/pages/product.html?cat=${p.cat}&idx=${p.idx}">
              <img class="nav-search-thumb" src="${p.img}" alt="" loading="lazy">
              <span class="nav-search-text">
                <span class="nav-search-name">${p.name}</span>
                <span class="nav-search-cat">${catLabel(p.cat)} · ${prettySub(p.sub)}</span>
              </span>
              <span class="nav-search-price">${p.price}</span>
            </a>`).join('');
    };

    const open = () => {
        document.body.classList.add('search-open');
        btn.classList.add('is-active');
        btn.setAttribute('aria-expanded', 'true');
        // the field is visibility:hidden until the class lands, and a hidden
        // element cannot take focus — read a layout property to flush the
        // style change through before focusing
        if (field) field.getBoundingClientRect();
        input.focus();
    };

    const close = () => {
        document.body.classList.remove('search-open');
        btn.classList.remove('is-active');
        btn.setAttribute('aria-expanded', 'false');
        input.value = '';
        panel.innerHTML = '';
        hits = [];
        active = -1;
    };

    btn.addEventListener('click', () => {
        if (document.body.classList.contains('search-open')) close();
        else open();
    });

    if (clear) clear.addEventListener('click', close);

    input.addEventListener('input', () => {
        hits = search(input.value);
        active = -1;
        render();
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { close(); return; }
        if (!hits.length) return;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            active = e.key === 'ArrowDown'
                ? (active + 1) % hits.length
                : (active - 1 + hits.length) % hits.length;
            render();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const pick = hits[Math.max(active, 0)];
            location.href = `/pages/product.html?cat=${pick.cat}&idx=${pick.idx}`;
        }
    });

    // clicking anywhere outside the bar closes it
    document.addEventListener('click', (e) => {
        if (!document.body.classList.contains('search-open')) return;
        if (btn.contains(e.target) || field?.contains(e.target) || panel.contains(e.target)) return;
        close();
    });
})();

// scroll helper that routes through Lenis when it is active
const scrollToTop = () => {
    if (window.lenis) window.lenis.scrollTo(0);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
};

// highlight the current page in the desktop menu and mobile bottom nav
const page = location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.menu a, .mobile-bottom-nav a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === page || (page === '' && href === 'index.html')) {
        a.classList.add('active');
        a.addEventListener('click', (e) => {
            e.preventDefault();
            scrollToTop();
        });
    }
});

// ---- Soft page switch ----
// Fallback only. Where the browser supports cross-document view
// transitions, styles.css opts in with `@view-transition` and the browser
// crossfades between the two documents with no blank frame at all — this
// handler must then stay out of the way, because holding the page at
// opacity 0 for a moment before navigating is exactly the gap the view
// transition exists to remove.
const supportsViewTransitions =
    typeof CSS !== 'undefined' &&
    CSS.supports?.('view-transition-name: none') &&
    'startViewTransition' in document;

// Shorter than it was (340ms): the delay is dead time on screen, so it
// buys the fade only as much room as it genuinely needs.
const EXIT_MS = 140;

document.addEventListener('click', (e) => {
    if (supportsViewTransitions) return;
    // let the browser handle new-tab / download / modified clicks. Without
    // this, ctrl/cmd-click was hijacked and opened in the same tab.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const link = e.target.closest('a[href]');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;

    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript') ||
        href.startsWith('tel') || href.startsWith('mailto')) return;

    // same-document and cross-origin links both skip the transition
    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return;

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    e.preventDefault();
    document.body.classList.add('page-transitioning');
    setTimeout(() => { window.location.href = url.href; }, EXIT_MS);
});

// script.js is loaded near the top of this module (see loadSiteScript), so
// that the header measurement it publishes lands before the Lenis fetch.