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
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
});

// sticky header shadow
const header = document.getElementById('header');
if (header) addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 8), { passive: true });

// expose the header + promo-banner heights so the fixed desktop bar can offset content correctly
const setBarHeights = () => {
    if (header) document.documentElement.style.setProperty('--hdr-h', header.offsetHeight + 'px');
    const banner = document.querySelector('.top-banner');
    if (banner) document.documentElement.style.setProperty('--banner-h', banner.offsetHeight + 'px');
};
setBarHeights();
addEventListener('resize', setBarHeights, { passive: true });

// mobile menu popup sheet
const burger = document.getElementById('burger');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
const mobileMenuClose = document.getElementById('mobileMenuClose');

if (mobileMenuOverlay) {
    const openMobileMenu = (e) => {
        if (e) e.preventDefault();
        mobileMenuOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    };
    const closeMobileMenu = () => {
        mobileMenuOverlay.classList.remove('active');
        document.body.style.overflow = '';
    };

    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openMobileMenu);
    if (burger) burger.addEventListener('click', openMobileMenu);
    if (mobileMenuClose) mobileMenuClose.addEventListener('click', closeMobileMenu);

    mobileMenuOverlay.addEventListener('click', e => {
        if (e.target === mobileMenuOverlay || e.target.closest('a')) {
            closeMobileMenu();
        }
    });

    // accordion: keep only one category open at a time
    mobileMenuOverlay.querySelectorAll('.macc-group').forEach(d => {
        d.addEventListener('toggle', () => {
            if (d.open) {
                mobileMenuOverlay.querySelectorAll('.macc-group[open]').forEach(o => {
                    if (o !== d) o.open = false;
                });
            }
        });
    });
}

// ===== Collection Detail Dynamic Page =====
const catData = {
    fashion: { title: 'Fashion', img: '/assets/images/cat_apparel.jpg', subs: ['Men', 'Women', 'Accessories'] },
    furniture: { title: 'Furniture', img: '/assets/images/cat_furniture.jpg', subs: ['Seating', 'Coffee Tables', 'Side Tables', 'Console Tables'] },
    home: { title: 'Home', img: '/assets/images/cat_tableware.jpg', subs: ['Tableware', 'Drinkware', 'Serveware', 'Home Linen', 'Lighting'] },
    decor: { title: 'Decor', img: '/assets/images/cat_art.jpg', subs: ['Artifacts', 'Wall Art', 'Vases', 'Bowls', 'Candle Holders'] },
    materials: { title: 'Materials', img: '/assets/images/cat_textiles.jpg', subs: ['Brass', 'Wood', 'Marble', 'Murano Glass', 'Ceramic', 'Textile'] }
};

const slugToSub = (slug) => {
    if (!slug) return '';
    return slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
};

const subToSlug = (s) => s.toLowerCase().replace(/\s+/g, '-');

const collectionGrid = document.getElementById('collectionGrid');
const crumbCategory = document.getElementById('crumbCategory');
const crumbSub = document.getElementById('crumbSub');
const crumbSep = document.getElementById('crumbSep');

if (collectionGrid) {
    const params = new URLSearchParams(location.search);
    const cat = (params.get('cat') || '').toLowerCase();
    const sub = (params.get('sub') || '').toLowerCase();
    const catInfo = catData[cat];

    if (catInfo) {
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
        } else {
            if (crumbCategory) crumbCategory.textContent = catInfo.title;
            document.title = `${catInfo.title} — Vayu`;
        }

        // Update hero banner image
        const catHeroImg = document.getElementById('catHeroImg');
        if (catHeroImg) catHeroImg.src = catInfo.img;

        // Inject sub-nav pills ("All" first → full category, then sub filters)
        const subNav = document.getElementById('subNav');
        if (subNav) {
            const allPill = `<a href="/pages/collection-detail.html?cat=${cat}" class="sub-pill${sub ? '' : ' active'}">All</a>`;
            subNav.innerHTML = allPill + catInfo.subs.map(s => {
                const slug = subToSlug(s);
                const isActive = sub === slug ? ' active' : '';
                return `<a href="/pages/collection-detail.html?cat=${cat}&sub=${slug}" class="sub-pill${isActive}">${s}</a>`;
            }).join('');
        }

        // ===== Product catalogue (shared data) =====
        const productData = {
            fashion: [
                { name: 'Sanganer Silk Stole', price: '₹ 3,200', img: '/assets/images/prod_throw.jpg', sub: 'women', isNew: true },
                { name: 'Heritage Linen Kurta', price: '₹ 5,400', img: '/assets/images/cat_apparel.jpg', sub: 'men' },
                { name: 'Handwoven Wool Shawl', price: '₹ 4,100', img: '/assets/images/cat_textiles.jpg', sub: 'women' },
                { name: 'Brass Cuff Bracelet', price: '₹ 2,800', img: '/assets/images/cat_jewelry.jpg', sub: 'accessories', isNew: true },
                { name: 'Black Obsidian Lamp', price: '₹ 14,500', img: '/assets/images/black_lamp.png', sub: 'accessories' }
            ],
            furniture: [
                { name: 'Teakwood Lounge Chair', price: '₹ 24,500', img: '/assets/images/prod_chair.jpg', sub: 'seating', isNew: true },
                { name: 'Carved Console Table', price: '₹ 32,000', img: '/assets/images/cat_furniture.jpg', sub: 'console-tables' },
                { name: 'Stone-Top Coffee Table', price: '₹ 28,400', img: '/assets/images/curated.jpg', sub: 'coffee-tables' },
                { name: 'Cane Side Table', price: '₹ 12,900', img: '/assets/images/cat_objects.jpg', sub: 'side-tables' }
            ],
            home: [
                { name: 'Ceramic Dinner Plate Set', price: '₹ 6,200', img: '/assets/images/banner_plate.jpg', sub: 'tableware' },
                { name: 'Murano Glassware Pair', price: '₹ 7,800', img: '/assets/images/card_glassware.jpg', sub: 'drinkware', isNew: true },
                { name: 'Lotus Urli Lamp', price: '₹ 6,900', img: '/assets/images/prod_lamp.jpg', sub: 'lighting' },
                { name: 'Raga Crimson Floor Lamp', price: '₹ 38,500', img: '/assets/images/prod_red_lamp.jpg', sub: 'lighting', isNew: true }
            ],
            decor: [
                { name: 'Terracotta Ritual Vase', price: '₹ 4,600', img: '/assets/images/hero_vase.jpg', sub: 'vases' },
                { name: 'Bronze Sculpture Study', price: '₹ 15,200', img: '/assets/images/card_sculpture.jpg', sub: 'artifacts', isNew: true },
                { name: 'Ritual Candle Stand', price: '₹ 3,400', img: '/assets/images/card_ritual.jpg', sub: 'candle-holders' },
                { name: 'Framed Miniature Art', price: '₹ 9,800', img: '/assets/images/cat_art.jpg', sub: 'wall-art' }
            ],
            materials: [
                { name: 'Hand-Beaten Brass Bowl', price: '₹ 3,900', img: '/assets/images/cat_objects.jpg', sub: 'brass' },
                { name: 'Marble Serving Board', price: '₹ 5,600', img: '/assets/images/curated.jpg', sub: 'marble', isNew: true },
                { name: 'Murano Glass Vessel', price: '₹ 8,200', img: '/assets/images/card_glassware.jpg', sub: 'murano-glass' },
                { name: 'Block-Print Textile Panel', price: '₹ 2,900', img: '/assets/images/cat_textiles.jpg', sub: 'textile' }
            ]
        };

        // Extract numeric price from formatted string (e.g. "₹ 3,200" → 3200)
        const parsePrice = (str) => Number(str.replace(/[^\d]/g, '')) || 0;

        // Sort comparators keyed by the data-sort attribute
        const sortComparators = {
            'featured': () => 0,
            'new-arrivals': (a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0),
            'price-asc': (a, b) => parsePrice(a.price) - parsePrice(b.price),
            'price-desc': (a, b) => parsePrice(b.price) - parsePrice(a.price)
        };

        // Reusable product-card template
        const productCardHTML = (p) => `<a class="product" href="/pages/product.html">
                <button class="wish-btn" aria-label="Add to Wishlist" onclick="event.preventDefault()">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                </button>
                <div class="ph"><img src="${p.img}" alt="${p.name}"></div>
                <div class="product-info">
                    <div>
                        <h3>${p.name}</h3>
                        <div class="price">${p.price}</div>
                    </div>
                    <button class="cart-btn" aria-label="Add to Cart" onclick="event.preventDefault()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>
                    </button>
                </div>
            </a>`;

        const emptyStateHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 80px 16px; color: var(--body); font-family: 'Jost', sans-serif; font-size: 14px; letter-spacing: 0.04em;">No pieces listed yet in this collection.<br>New arrivals coming soon.</div>`;

        const subGrid = document.getElementById('subGrid');
        const sortTrigger = document.getElementById('sortTrigger');
        const sortMenu = document.getElementById('sortMenu');
        const sortLabel = document.getElementById('sortLabel');

        let currentSort = 'featured';

        // Sort dropdown open/close
        if (sortTrigger && sortMenu) {
            const toggleMenu = (force) => {
                const show = force !== undefined ? force : sortMenu.style.display === 'none';
                sortMenu.style.display = show ? 'block' : 'none';
            };
            sortTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleMenu();
            });
            // Close on outside click
            document.addEventListener('click', () => toggleMenu(false));
            sortMenu.addEventListener('click', (e) => e.stopPropagation());

            // Option selection
            sortMenu.querySelectorAll('.sort-option').forEach(btn => {
                btn.addEventListener('click', () => {
                    currentSort = btn.dataset.sort;
                    if (sortLabel) sortLabel.textContent = btn.textContent;
                    sortMenu.querySelectorAll('.sort-option').forEach(o => o.style.fontWeight = '400');
                    btn.style.fontWeight = '600';
                    toggleMenu(false);
                    renderGrid();
                });
            });
        }

        // Render (and re-render on sort change)
        function renderGrid() {
            if (!subGrid) return;
            const all = productData[cat] || [];
            const items = sub ? all.filter(p => p.sub === sub) : all;
            subGrid.className = 'prod-grid';
            if (!items.length) {
                subGrid.innerHTML = emptyStateHTML;
                return;
            }
            const comparator = sortComparators[currentSort] || sortComparators.featured;
            const sorted = [...items].sort(comparator);
            subGrid.innerHTML = sorted.map(productCardHTML).join('');
        }

        renderGrid();
    }
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