// Deduplicate mobile bottom nav and overlay if multiple exist in DOM
const navs = document.querySelectorAll('.mobile-bottom-nav');
if (navs.length > 1) {
    for (let i = 1; i < navs.length; i++) navs[i].remove();
}
const overlays = document.querySelectorAll('.mobile-menu-overlay');
if (overlays.length > 1) {
    for (let i = 1; i < overlays.length; i++) overlays[i].remove();
}

// Prevent flickering reloads when tapping active bottom nav tab
document.querySelectorAll('.mobile-bottom-nav a').forEach(a => {
    const page = location.pathname.split('/').pop() || 'index.html';
    const href = a.getAttribute('href');
    if (href === page || (page === '' && href === 'index.html')) {
        a.classList.add('active');
        a.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.lenis) window.lenis.scrollTo(0);
            else window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
});

// sticky header shadow
const header = document.getElementById('header');
if (header) addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 8), { passive: true });

// Expose the header + promo-banner heights so the fixed desktop bar can
// offset content correctly. Four things depend on --hdr-h: the body's top
// padding on pages without the hero, the COLLECTION dropdown's `top`, and
// the sticky gallery / order summary on the product and cart pages.
const setBarHeights = () => {
    if (header) document.documentElement.style.setProperty('--hdr-h', header.offsetHeight + 'px');
    const banner = document.querySelector('.top-banner');
    if (banner) document.documentElement.style.setProperty('--banner-h', banner.offsetHeight + 'px');
};
setBarHeights();
addEventListener('resize', setBarHeights, { passive: true });

// The bar's height comes from the logo's Cormorant Garamond line box, so a
// measurement taken before the webfont settles is wrong — and it used to
// stay wrong for the life of the page, since this only ran on load/resize.
if (document.fonts?.ready) document.fonts.ready.then(setBarHeights);

// mobile menu popup sheet
const burger = document.getElementById('burger');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
const mobileMenuClose = document.getElementById('mobileMenuClose');

if (mobileMenuOverlay) {
    let scrollLockY = 0;

    const openMobileMenu = (e) => {
        if (e) e.preventDefault();
        mobileMenuOverlay.classList.add('active');
        if (mobileMenuBtn) mobileMenuBtn.classList.add('menu-open');
        // freeze the page at its current offset — plain overflow:hidden lets
        // iOS rubber-band the page, which drags the sheet off the nav bar
        if (window.lenis) window.lenis.stop();
        scrollLockY = window.scrollY;
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollLockY}px`;
        document.body.style.width = '100%';
        document.body.classList.add('menu-open');
    };
    const closeMobileMenu = () => {
        mobileMenuOverlay.classList.remove('active');
        if (mobileMenuBtn) mobileMenuBtn.classList.remove('menu-open');
        document.body.classList.remove('menu-open');
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollLockY);
        if (window.lenis) {
            // resync so Lenis does not animate back from a stale offset
            window.lenis.scrollTo(scrollLockY, { immediate: true });
            window.lenis.start();
        }
    };

    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openMobileMenu);
    if (burger) burger.addEventListener('click', openMobileMenu);
    if (mobileMenuClose) mobileMenuClose.addEventListener('click', closeMobileMenu);

    mobileMenuOverlay.addEventListener('click', e => {
        if (e.target === mobileMenuOverlay || e.target.closest('a')) {
            closeMobileMenu();
        }
    });

    // accordion: one category open at a time, with a smooth height reveal.
    // <details> snaps open natively, so the panel is animated by hand and the
    // open attribute is flipped at the edges of the animation.
    const accGroups = [...mobileMenuOverlay.querySelectorAll('.macc-group')];
    const stillMotion = matchMedia('(prefers-reduced-motion: reduce)');

    const panelHeight = (panel) => {
        // measure the natural height without disturbing the current animation
        const prev = panel.style.height;
        panel.style.height = 'auto';
        const h = panel.scrollHeight;
        panel.style.height = prev;
        return h;
    };

    const slide = (group, opening) => {
        const panel = group.querySelector('.macc-links');
        if (!panel) return;
        if (opening) group.open = true;

        if (stillMotion.matches) {
            group.open = opening;
            return;
        }

        group.classList.add('is-sliding');
        const full = panelHeight(panel);
        const pad = Number.parseFloat(getComputedStyle(panel).paddingBottom) || 0;

        const anim = panel.animate({
            height: opening ? ['0px', `${full}px`] : [`${full}px`, '0px'],
            paddingBottom: opening ? ['0px', `${pad}px`] : [`${pad}px`, '0px'],
            opacity: opening ? [0, 1] : [1, 0]
        }, {
            duration: opening ? 300 : 220,
            easing: opening ? 'cubic-bezier(0.25, 1, 0.5, 1)' : 'cubic-bezier(0.4, 0, 0.6, 1)'
        });

        anim.onfinish = () => {
            if (!opening) group.open = false;
            group.classList.remove('is-sliding');
        };
    };

    accGroups.forEach(group => {
        const summary = group.querySelector('summary');
        if (!summary) return;
        summary.addEventListener('click', e => {
            e.preventDefault();
            if (group.classList.contains('is-sliding')) return;
            if (group.open) {
                slide(group, false);
            } else {
                accGroups.forEach(other => {
                    if (other !== group && other.open && !other.classList.contains('is-sliding')) {
                        slide(other, false);
                    }
                });
                slide(group, true);
            }
        });
    });
}

// ===== Collection Detail Dynamic Page =====
// The category list is no longer written out here. It lives in
// js/taxonomy.js, which include.js publishes on window before this classic
// script loads (script.js cannot import). Every menu, the collection
// directory and this page now read that one object.
const catData = window.vayuTaxonomy?.categories || {};
const slugToSub = window.vayuTaxonomy?.slugToLabel || ((s) => s || '');
const subToSlug = window.vayuTaxonomy?.subToSlug || ((s) => String(s).toLowerCase().replace(/\s+/g, '-'));

const collectionGrid = document.getElementById('collectionGrid');
const crumbCategory = document.getElementById('crumbCategory');
const crumbSub = document.getElementById('crumbSub');
const crumbSep = document.getElementById('crumbSep');

if (collectionGrid) {
    const params = new URLSearchParams(location.search);
    const cat = (params.get('cat') || '').toLowerCase();
    const sub = (params.get('sub') || '').toLowerCase();
    const catInfo = catData[cat];

    // An unknown or missing ?cat= used to leave the page in a silent dead
    // state: the default banner image, the placeholder title "Collection",
    // an empty grid still carrying its initial flex-rail class, and no
    // message explaining any of it. Show a real not-found state instead.
    if (!catInfo) {
        const main = collectionGrid.closest('main') || document.body;
        const links = Object.entries(catData)
            .map(([slug, info]) =>
                `<a class="sub-pill" href="/pages/collection-detail.html?cat=${slug}">${info.title}</a>`)
            .join('');
        main.innerHTML = `
            <section class="cat-missing">
              <h1>We couldn't find that collection</h1>
              <p>The link may be out of date. Browse the collections instead:</p>
              <div class="cat-missing-links">${links}
                <a class="sub-pill" href="/pages/collection.html">All Collections</a>
              </div>
            </section>`;
        document.title = 'Collection not found — Vayu';
    }

    if (catInfo) {
        // Dynamic page header title (matches the collection page's styled card)
        const catTitle = document.getElementById('catTitle');
        if (sub) {
            const subLabel = slugToSub(sub);
            if (crumbCategory) {
                crumbCategory.textContent = catInfo.title;
                crumbCategory.style.color = '#8a8a86';
                crumbCategory.href = `/pages/collection-detail.html?cat=${cat}`;
            }
            if (crumbSub) { crumbSub.textContent = subLabel; crumbSub.style.display = 'inline'; }
            if (crumbSep) crumbSep.style.display = 'inline';
            document.title = `${subLabel} — Vayu`;
            if (catTitle) catTitle.textContent = subLabel;
        } else {
            if (crumbCategory) crumbCategory.textContent = catInfo.title;
            document.title = `${catInfo.title} — Vayu`;
            if (catTitle) catTitle.textContent = catInfo.title;
        }

        // Set the banner. The markup no longer ships a hardcoded src, so
        // there is no longer a wasted request for the home hero followed by
        // a visible flash as it was swapped out on every category load.
        const catHeroImg = document.getElementById('catHeroImg');
        if (catHeroImg) {
            catHeroImg.src = catInfo.banner;
            catHeroImg.alt = `${catInfo.title} collection`;
        }

        // Inject sub-nav pills ("All" first → full category, then sub filters)
        const subNav = document.getElementById('subNav');
        if (subNav) {
            const allPill = `<a href="/pages/collection-detail.html?cat=${cat}" class="sub-pill${sub ? '' : ' active'}">All</a>`;
            subNav.innerHTML = allPill + (catInfo.subs || []).map(s => {
                const slug = subToSlug(s.label);
                const isActive = sub === slug ? ' active' : '';
                return `<a href="/pages/collection-detail.html?cat=${cat}&sub=${slug}" class="sub-pill${isActive}">${s.label}</a>`;
            }).join('');
        }

        // ===== Product catalogue (shared data) =====
        // Shared catalogue, published on window by include.js before this
        // file loads (script.js is a classic script and cannot import).
        const productData = window.vayuCatalogue || {};

        // Extract numeric price from formatted string (e.g. "₹ 3,200" → 3200)
        const parsePrice = (str) => Number(str.replace(/[^\d]/g, '')) || 0;

        // Sort comparators keyed by the data-sort attribute
        const sortComparators = {
            'featured': () => 0,
            'new-arrivals': (a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0),
            'price-asc': (a, b) => parsePrice(a.price) - parsePrice(b.price),
            'price-desc': (a, b) => parsePrice(b.price) - parsePrice(a.price)
        };

        // The tile markup and its wishlist / add-to-cart handler now live in
        // js/product-card.js, published on window by include.js. The same
        // card is used by the product page's "You May Also Like" and the
        // artist capsule on jenjum.html — it used to be written out three
        // separate times.
        const productCardHTML = window.vayuProductCard?.productCardHTML
            || (() => '');

        const emptyStateHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 80px 16px; color: var(--body); font-family: 'Jost', sans-serif; font-size: 14px; letter-spacing: 0.04em;">No pieces listed yet in this collection.<br>New arrivals coming soon.</div>`;

        const noMatchHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 80px 16px; color: var(--body); font-family: 'Jost', sans-serif; font-size: 14px; letter-spacing: 0.04em;">No pieces match this filter.<br>Try a wider price range.</div>`;

        // Filter predicates keyed by the Filter By select's values. They
        // narrow the set; the sort comparators above only reorder it.
        const filterPredicates = {
            'all': () => true,
            'new': (p) => Boolean(p.isNew),
            'under-5000': (p) => parsePrice(p.price) < 5000,
            '5000-15000': (p) => {
                const v = parsePrice(p.price);
                return v >= 5000 && v <= 15000;
            },
            'above-15000': (p) => parsePrice(p.price) > 15000
        };

        const subGrid = document.getElementById('subGrid');
        const sortSelect = document.getElementById('collection-sort');
        const filterSelect = document.getElementById('collection-filter');

        let currentSort = 'featured';
        let currentFilter = 'all';

        // Native dropdowns, same UI as the collection page
        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                currentSort = sortSelect.value || 'featured';
                renderGrid();
            });
        }

        if (filterSelect) {
            filterSelect.addEventListener('change', () => {
                currentFilter = filterSelect.value || 'all';
                renderGrid();
            });
        }

        // Render (and re-render whenever a control changes)
        function renderGrid() {
            if (!subGrid) return;
            const all = productData[cat] || [];
            const inSub = sub ? all.filter(p => p.sub === sub) : all;
            const predicate = filterPredicates[currentFilter] || filterPredicates.all;
            const items = inSub.filter(predicate);
            subGrid.className = 'prod-grid';
            if (!items.length) {
                // a filter that matches nothing is a different dead end from an
                // empty category, and says so rather than claiming the
                // collection is unstocked
                subGrid.innerHTML = currentFilter === 'all' ? emptyStateHTML : noMatchHTML;
                return;
            }
            const comparator = sortComparators[currentSort] || sortComparators.featured;
            const sorted = [...items].map((p) => ({ ...p, _idx: all.indexOf(p) })).sort(comparator);
            subGrid.innerHTML = sorted.map(p => productCardHTML(cat, p._idx)).join('');
        }

        // Wishlist / add-to-cart on the tiles. Delegated inside the shared
        // module, so it survives every re-render (sorting, subcategory
        // switches) without rebinding.
        window.vayuProductCard?.bindProductTiles(subGrid, showToast);

        renderGrid();
    }
}

// ===== Toast =====
// Small confirmation used by the product tiles; the product detail page has
// its own copy because it runs in a separate module scope.
function showToast(message) {
    let toast = document.getElementById('vayuToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'vayuToast';
        toast.className = 'vayu-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toast._hide);
    toast._hide = setTimeout(() => toast.classList.remove('is-visible'), 2200);
}

// ===== Global scroll-reveal fade-up =====
// Fades top-level content blocks (and the footer) up as they enter the viewport.
// JS applies the initial hidden state, so content stays visible if JS/observer is unavailable.
(() => {
    if (!('IntersectionObserver' in window)) return;
    if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;

    const targets = document.querySelectorAll('main > *, .site-footer-container');
    if (!targets.length) return;

    const io = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                obs.unobserve(entry.target);
            }
        });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });

    targets.forEach(el => {
        el.classList.add('reveal');
        io.observe(el);
    });
})();

// ===== Cart & Wishlist header badges =====
// Reads localStorage directly (same keys as js/shop.js) since this script is not a module.
(() => {
    const CART_KEY = 'vayu_cart';
    const WISH_KEY = 'vayu_wishlist';

    function getCartCount() {
        try {
            const cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
            return cart.reduce((n, p) => n + (p.qty || 1), 0);
        } catch { return 0; }
    }

    function getWishlistCount() {
        try {
            return (JSON.parse(localStorage.getItem(WISH_KEY)) || []).length;
        } catch { return 0; }
    }

    function updateBadges() {
        const cartBadge = document.getElementById('cartCount');
        const wishBadge = document.getElementById('wishCount');
        const cartCount = getCartCount();
        const wishCount = getWishlistCount();
        if (cartBadge) {
            cartBadge.textContent = cartCount > 0 ? cartCount : '';
            cartBadge.style.display = cartCount > 0 ? 'flex' : 'none';
        }
        if (wishBadge) {
            wishBadge.textContent = wishCount > 0 ? wishCount : '';
            wishBadge.style.display = wishCount > 0 ? 'flex' : 'none';
        }
    }

    // Run now and when cart/wishlist changes
    updateBadges();
    window.addEventListener('vayu:cart-changed', updateBadges);
    window.addEventListener('vayu:wishlist-changed', updateBadges);
    window.addEventListener('storage', updateBadges);

    // A prerendered page reads localStorage while it is still hidden, so an
    // item added on the page the user is looking at would be missing from
    // these counts. Re-read them the moment the page is activated.
    if (document.prerendering) {
        document.addEventListener('prerenderingchange', updateBadges, { once: true });
    }
})();
