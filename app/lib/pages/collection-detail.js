/**
 * Vayu — /pages/collection-detail.html: the category banner, the
 * sub-category pills and the product grid with its sort and filter.
 *
 * This is the tail of the old js/script.js. It was loaded on every page of
 * the site even though only this one has a #collectionGrid, and it read the
 * catalogue and taxonomy off `window` because a classic script cannot
 * import. It is now a page module, loaded by app.js only when
 * <body data-page="collection-detail">, and it awaits the catalogue itself.
 */

import { site } from '#lib/stores/site.svelte.js';
import { hydrateCatalogue } from '#lib/stores/site.svelte.js';
import { slugToLabel, subToSlug } from '../taxonomy.js';
import { productCardHTML, bindProductTiles } from '../product-card.js';
import { showToast } from '../core/toast.js';
import { setDescription, setCanonical, setOpenGraph } from '../core/head.js';

export default async function initCollectionDetail() {
    const collectionGrid = document.getElementById('collectionGrid');
    if (!collectionGrid) return;

    // The grid is the whole page, so there is nothing to paint before the
    // catalogue lands: awaiting here avoids rendering the static fallback
    // and then visibly replacing it a moment later.
    await hydrateCatalogue();

    const crumbCategory = document.getElementById('crumbCategory');
    const crumbSub = document.getElementById('crumbSub');
    const crumbSep = document.getElementById('crumbSep');

    const params = new URLSearchParams(location.search);
    const cat = (params.get('cat') || '').toLowerCase();
    const sub = (params.get('sub') || '').toLowerCase();
    const catInfo = site.categories[cat];

    // An unknown or missing ?cat= used to leave the page in a silent dead
    // state: the default banner image, the placeholder title "Collection",
    // an empty grid still carrying its initial flex-rail class, and no
    // message explaining any of it. Show a real not-found state instead.
    if (!catInfo) {
        const main = collectionGrid.closest('main') || document.body;
        const links = Object.entries(site.categories)
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
            const subLabel = slugToLabel(sub);
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

        // The rest of the head, which until now every category shared: one
        // description and no canonical across all of them, so four distinct
        // pages competed for the same result. See core/head.js for why this
        // has to happen here rather than at build time.
        const heading = sub ? slugToLabel(sub) : catInfo.title;
        const description = `${heading} at Vayu — handcrafted pieces by master `
            + `artisans and contemporary Indian makers, from our New Delhi shop.`;
        setDescription(description);
        setCanonical(location.pathname + location.search);
        setOpenGraph({ title: `${heading} — Vayu`, description });

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

        // Extract numeric price from formatted string (e.g. "₹ 3,200" → 3200)
        const parsePrice = (str) => Number(str.replace(/[^\d]/g, '')) || 0;

        // Sort comparators keyed by the data-sort attribute
        const sortComparators = {
            'featured': () => 0,
            'new-arrivals': (a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0),
            'price-asc': (a, b) => parsePrice(a.price) - parsePrice(b.price),
            'price-desc': (a, b) => parsePrice(b.price) - parsePrice(a.price)
        };

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
            const all = site.products[cat] || [];
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
        bindProductTiles(subGrid, showToast);

        renderGrid();
    }
}
