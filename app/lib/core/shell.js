/**
 * Vayu — the shared shell's behaviours: the sticky header, the header
 * height variable, the mobile menu sheet and its accordion, the scroll
 * reveal and the cart/wishlist badges.
 *
 * This is the old js/script.js. It was a *classic* script appended to the
 * document at runtime by include.js, which is why the catalogue, taxonomy
 * and product tile all had to be published onto `window` for it to reach
 * them — it could not import. It is now an ordinary module inside the app
 * bundle, so the window bridge is gone and there is no third script
 * request. The collection-detail grid that used to live at the bottom of
 * the file moved to pages/collection-detail.js, because it is the only
 * part of it that needs the catalogue.
 */

import { scrollToTop } from './scroll.js';

/**
 * Expose the header + promo-banner heights so the fixed desktop bar can
 * offset content correctly. Four things depend on --hdr-h: the body's top
 * padding on pages without the hero, the COLLECTION dropdown's `top`, and
 * the sticky gallery / order summary on the product and cart pages.
 *
 * Module-level and exported rather than a closure inside initShell, because
 * the announcement bar is added to the header after this has already run —
 * core/site-content.js calls it once the bar is in, so the offsets account
 * for the extra height instead of staying a bar too short.
 */
export function measureBars() {
    const header = document.getElementById('header');
    if (header) document.documentElement.style.setProperty('--hdr-h', header.offsetHeight + 'px');
    const banner = document.querySelector('.top-banner');
    if (banner) document.documentElement.style.setProperty('--banner-h', banner.offsetHeight + 'px');
}

export function initShell() {
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
                scrollToTop();
            });
        }
    });

    // sticky header shadow
    const header = document.getElementById('header');
    if (header) addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 8), { passive: true });

    measureBars();
    addEventListener('resize', measureBars, { passive: true });

    // The bar's height comes from the logo's Cormorant Garamond line box, so a
    // measurement taken before the webfont settles is wrong — and it used to
    // stay wrong for the life of the page, since this only ran on load/resize.
    if (document.fonts?.ready) document.fonts.ready.then(measureBars);

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
}
