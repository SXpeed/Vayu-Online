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

const subDescMap = {
    men: 'Contemporary menswear crafted with natural fabrics and artisanal detailing.',
    women: 'Elegant womenswear exploring heritage textiles with modern silhouettes.',
    accessories: 'Handcrafted bags, belts and finishing touches for the considered wardrobe.',
    seating: 'Hand-carved chairs, lounges and benches in solid teak and cane.',
    'coffee-tables': 'Sculptural coffee tables centred on material and craft.',
    'side-tables': 'Compact side tables for everyday use and display.',
    'console-tables': 'Slim console tables for entries and corridors.',
    tableware: 'Plates, bowls and serving pieces for the considered table.',
    drinkware: 'Glassware and cups for every pour and occasion.',
    serveware: 'Boards, platters and servers for graceful hosting.',
    'home-linen': 'Block-printed and hand-woven linens for bed, bath and table.',
    lighting: 'Ambient lamps and luminaires casting a warm, living glow.',
    artifacts: 'Sculptural objects and curiosities with cultural resonance.',
    'wall-art': 'Framed works and wall pieces from emerging Indian artists.',
    vases: 'Vessels in ceramic, brass and glass for stems and stems alone.',
    bowls: 'Decorative and functional bowls in marble, wood and ceramic.',
    'candle-holders': 'Candle holders and lanterns in brass and clay.',
    brass: 'Hand-finished brassware from traditional foundries.',
    wood: 'Solid-wood pieces celebrating grain, joinery and patina.',
    marble: 'Carved marble and stone from Rajasthan workshops.',
    'murano-glass': 'Hand-blown Murano glass with luminous colour.',
    ceramic: 'Wheel-thrown and glazed ceramics for home and table.',
    textile: 'Hand-loomed and block-printed textiles from across India.'
};

const slugToSub = (slug) => {
    if (!slug) return '';
    return slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
};

const subToSlug = (s) => s.toLowerCase().replace(/\s+/g, '-');

const collTitle = document.getElementById('collTitle');
const collDesc = document.getElementById('collDesc');
const crumbCategory = document.getElementById('crumbCategory');
const crumbSub = document.getElementById('crumbSub');
const crumbSep = document.getElementById('crumbSep');

if (collTitle) {
    const params = new URLSearchParams(location.search);
    const cat = (params.get('cat') || '').toLowerCase();
    const sub = (params.get('sub') || '').toLowerCase();
    const catInfo = catData[cat];

    if (catInfo) {
        collTitle.textContent = catInfo.title;
        if (sub) {
            const subLabel = slugToSub(sub);
            collTitle.textContent = subLabel;
            collDesc.textContent = subDescMap[sub] || `${catInfo.title} — curated pieces.`;
            if (crumbCategory) {
                crumbCategory.textContent = catInfo.title;
                crumbCategory.style.color = '#8a8a86';
                crumbCategory.href = `/pages/collection-detail.html?cat=${cat}`;
            }
            if (crumbSub) { crumbSub.textContent = subLabel; crumbSub.style.display = 'inline'; }
            if (crumbSep) crumbSep.style.display = 'inline';
        } else {
            collDesc.textContent = `Curated pieces across ${catInfo.subs.join(', ').toLowerCase()}.`;
            if (crumbCategory) crumbCategory.textContent = catInfo.title;
        }
        document.title = `${collTitle.textContent} — Vayu`;

        // Update hero banner image
        const catHeroImg = document.getElementById('catHeroImg');
        if (catHeroImg) catHeroImg.src = catInfo.img;

        // Inject sub-nav pills
        const subNav = document.getElementById('subNav');
        if (subNav) {
            subNav.innerHTML = catInfo.subs.map(s => {
                const slug = subToSlug(s);
                const isActive = sub === slug ? ' active' : '';
                return `<a href="/pages/collection-detail.html?cat=${cat}&sub=${slug}" class="sub-pill${isActive}">${s}</a>`;
            }).join('');
        }

        // Inject sub-category cards into the grid
        const subGrid = document.getElementById('subGrid');
        if (subGrid) {
            if (sub) {
                subGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 80px 16px; color: var(--body); font-family: 'Jost', sans-serif; font-size: 14px; letter-spacing: 0.04em;">No pieces listed yet in this collection.<br>New arrivals coming soon.</div>`;
            } else {
                subGrid.innerHTML = catInfo.subs.map(s => {
                    const slug = subToSlug(s);
                    return `<a class="curated-card" href="/pages/collection-detail.html?cat=${cat}&sub=${slug}">
                        <img src="${catInfo.img}" alt="${s}">
                        <div class="card-overlay"><span>${s.toUpperCase()}</span></div>
                    </a>`;
                }).join('');
            }
        }
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