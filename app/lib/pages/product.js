/**
 * Vayu — /pages/product.html.
 *
 * Lifted verbatim out of the page's inline <script type="module">. It used
 * to import straight from /js/, so every one of those imports was another
 * level of request chaining hanging off the HTML. It is now a bundled chunk
 * that app.js imports only when <body data-page="product">.
 */

import { addToCart, toggleWishlist, isInWishlist } from '../shop.js';
import { site } from '#lib/stores/site.svelte.js';
import { categoryTitle } from '../taxonomy.js';
import { productCardHTML, bindProductTiles } from '../product-card.js';
import { hydrateCatalogue } from '#lib/stores/site.svelte.js';
import { findVariant, openingVariant, parseCombo, availableValues } from '#lib/options.js';
import { detailSections } from '#lib/product-details.js';

/** Option names and labels are shopkeeper-entered, and go into attributes. */
const escapeHtml = (s) => String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

// The whole page is the product, so there is nothing to draw before the
// catalogue is here. This is the one await that was previously paid by
// *every* page on the site, through js/store-data.js's top-level await.
await hydrateCatalogue();

// catalogue lives in /js/catalogue.js and the category names in
// /js/taxonomy.js, so the grid, this page and header search all read
// the same lists. The local five-entry catData that used to sit here
// left the breadcrumb blank on an Accents or Souvenir product.

const params = new URLSearchParams(location.search);
let cat = (params.get('cat') || '').toLowerCase();
let idx = Number.parseInt(params.get('idx'), 10);

// Permanent id first — it survives catalogue re-ordering. cat/idx
// and name-matching remain as fallbacks for old links.
let product = null;
const wantedId = params.get('id');
if (wantedId) {
    for (const [c, items] of Object.entries(site.products)) {
        const i = items.findIndex(p => p.id === wantedId);
        if (i !== -1 && (c === cat || !product)) {
            product = items[i];
            if (c === cat || !cat) { cat = c; idx = i; }
            if (c === cat) break;
        }
    }
}
const allProducts = site.products[cat] || [];
if (!product) product = allProducts[idx];
if (!product) {
    const name = params.get('name') || '';
    product = allProducts.find(p => p.name === name);
}

/* ---------- the detail accordion ----------
 *
 * Five sections, all of them optional, all of them written in the admin
 * panel. This used to be fixed markup in the page, so every piece in the
 * shop claimed the same dimensions and the same materials whatever it
 * actually was. A section with nothing behind it is now left out entirely
 * rather than shown with placeholder copy — an empty row reads as a broken
 * page, and inventing a measurement is worse than admitting there isn't one.
 */

const CHEVRON = `<svg class="prod-acc-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.5"><polyline points="6 9 12 15 18 9"></polyline></svg>`;

const accordionItem = (id, title, bodyHtml) => `
    <div class="prod-acc-item">
        <button class="prod-acc-header" data-target="${id}" aria-expanded="false" aria-controls="${id}">
            <span>${escapeHtml(title)}</span>
            ${CHEVRON}
        </button>
        <div class="prod-acc-body" id="${id}">${bodyHtml}</div>
    </div>`;

/** Label/value rows — Dimensions, Materials & Origin. */
const metaRows = (rows) => rows
    .map(r => `<div class="prod-meta-row">
        <span class="prod-meta-label">${escapeHtml(r.label)}</span>
        <span class="prod-meta-val">${escapeHtml(r.value)}</span>
    </div>`)
    .join('');

const paragraphsHTML = (list) => list.map(p => `<p>${escapeHtml(p)}</p>`).join('');

function renderAccordion(p) {
    const host = document.getElementById('prodAccordion');
    if (!host) return;

    // Which sections survive, and what each falls back to, is decided in
    // lib/product-details.js — see the rule there. This function only
    // turns the answer into markup.
    const sections = detailSections(p, site.content?.productDefaults || {}, site.shippingPresets || []);

    host.innerHTML = sections
        .map(s => accordionItem(s.id, s.title,
            s.kind === 'rows' ? metaRows(s.rows) : paragraphsHTML(s.text)))
        .join('');
}

const crumbCategory = document.getElementById('crumbCategory');
const crumbProduct = document.getElementById('crumbProduct');

if (cat && crumbCategory) {
    crumbCategory.textContent = categoryTitle(cat);
    crumbCategory.href = `/pages/collection-detail.html?cat=${cat}`;
}

if (product) {
    document.getElementById('prodName').textContent = product.name;
    const priceEl = document.getElementById('prodPrice');
    const renderPrice = (price, compareAt) => {
        priceEl.innerHTML = compareAt
            ? `${price} <s style="color:#9b968c;font-weight:400;font-size:0.85em;margin-left:6px">${compareAt}</s>`
            : price;
    };
    renderPrice(product.price, product.compareAt);
    // Before the accordion is bound further down, so the toggles it wires up
    // are the ones this just wrote.
    renderAccordion(product);
    if (crumbProduct) crumbProduct.textContent = product.name;
    if (product.isNew) document.getElementById('prodBadge').style.display = 'inline-block';
    document.title = `${product.name} — Vayu`;

    // ---- Options (colour / size, configured per product in the admin panel)
    //
    // Nothing is drawn unless the panel gave this product options, which is
    // the whole contract: an object with one finish shows no pickers, and a
    // garment shows a swatch rail and a size rail. `chosenVariant` is what
    // the rest of the page — price, stock, cart line — reads, so the two
    // shapes (options grid, legacy flat list) converge on it here.
    const variants = product.variants || [];
    const options = (product.options || []).filter(o => o.values?.length);
    const chosen = {};
    let chosenVariant = null;

    if (options.length) {
        // Open on the cheapest combination that can actually be bought, so
        // the page never leads with a price or a colour nobody can order.
        const opening = openingVariant(product);
        Object.assign(chosen, opening?.combo ? parseCombo(opening.combo) : {});
        for (const o of options) chosen[o.name] ||= o.values[0].label;
        chosenVariant = findVariant(product, chosen);
    } else if (variants.length) {
        chosenVariant = variants.find(v => v.stock > 0) || variants[0];
    }
    if (chosenVariant) renderPrice(chosenVariant.price || product.price, product.compareAt);

    // ---- Stock: sold-out state + back-in-stock alert ----
    //
    // With options, an unresolved selection is not "in stock by default":
    // a combination the shop never stocked has no variant row at all, and
    // treating that as buyable is how an order arrives for something that
    // was never made.
    const inStock = () => {
        if (options.length) return (chosenVariant?.stock ?? 0) > 0;
        if (chosenVariant) return chosenVariant.stock > 0;
        return product.stock === undefined || product.stock > 0;
    };
    let notifyBox = null;
    function syncStockUI() {
        const ok = inStock();
        for (const btnId of ['prodCartBtn', 'prodBuyBtn']) {
            const b = document.getElementById(btnId);
            if (b) { b.disabled = !ok; b.style.opacity = ok ? '' : '0.45'; b.style.cursor = ok ? '' : 'not-allowed'; }
        }
        if (!ok && !notifyBox && product.id) {
            notifyBox = document.createElement('div');
            notifyBox.style.cssText = 'margin:14px 0;padding:14px 16px;background:#f4f1ea;border-radius:2px;font-family:Jost,sans-serif;';
            notifyBox.innerHTML = `
                <div style="font-size:13px;margin-bottom:8px;">Currently sold out — leave your email and we'll tell you when it returns.</div>
                <form style="display:flex;gap:8px;" novalidate>
                    <input type="email" required placeholder="Your email" style="flex:1;padding:9px 12px;border:1px solid #d9d3c7;border-radius:2px;font:inherit;font-size:13px;">
                    <button type="submit" style="padding:9px 18px;background:#141210;color:#fff;border:0;border-radius:2px;font:inherit;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;cursor:pointer;">Notify me</button>
                </form>
                <div data-note style="font-size:12px;color:#8d887e;margin-top:7px;min-height:14px;"></div>`;
            const anchor = document.getElementById('prodCartBtn')?.parentElement;
            (anchor || priceEl).after(notifyBox);
            notifyBox.querySelector('form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const note = notifyBox.querySelector('[data-note]');
                try {
                    const res = await fetch('/api/notify-me', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ productId: product.id, email: notifyBox.querySelector('input').value.trim() }),
                    });
                    const j = await res.json();
                    note.textContent = res.ok ? 'Noted — we\'ll be in touch.' : (j.error || 'Could not save that.');
                } catch { note.textContent = 'Could not save that.'; }
            });
        } else if (ok && notifyBox) {
            notifyBox.remove();
            notifyBox = null;
        }
    }
    syncStockUI();

    // Build gallery images — use product gallery array or fallback to main img
    const baseGallery = product.gallery && product.gallery.length > 0
        ? product.gallery
        : [product.img];

    const track = document.getElementById('prodGalleryTrack');
    const dotsContainer = document.getElementById('prodGalleryDots');

    /**
     * Draw the carousel. Called again whenever the chosen combination brings
     * its own photograph, which is why it rebuilds rather than appends — a
     * shopper cycling through eleven patterns would otherwise end up with a
     * carousel of every pattern they had looked at.
     */
    function renderGallery(images) {
        track.innerHTML = '';
        dotsContainer.innerHTML = '';

        images.forEach((imgSrc, i) => {
            const slide = document.createElement('div');
            slide.className = 'prod-gallery-slide';
            const img = document.createElement('img');
            img.src = imgSrc;
            img.alt = `${product.name} — View ${i + 1}`;
            slide.appendChild(img);
            track.appendChild(slide);

            const dot = document.createElement('button');
            dot.className = 'prod-dot' + (i === 0 ? ' active' : '');
            dot.setAttribute('aria-label', `Go to image ${i + 1}`);
            dot.dataset.index = i;
            dot.addEventListener('click', () => {
                track.scrollTo({ left: track.clientWidth * i, behavior: 'smooth' });
            });
            dotsContainer.appendChild(dot);
        });
    }

    /**
     * The chosen combination's own photo leads, with the rest of the gallery
     * behind it — the shopper still gets the detail shots, but the first
     * thing they see is the colour they actually picked.
     */
    function syncGallery() {
        const shot = chosenVariant?.image;
        renderGallery(shot ? [shot, ...baseGallery.filter(u => u !== shot)] : baseGallery);
        track.scrollTo({ left: 0 });
    }
    syncGallery();

    /* ---- The option rails ------------------------------------------------
       One block per option, sitting between the price and the buy buttons.
       A swatch option draws bands (the value's `heading` — "Solid",
       "Stripes"), because a rail of eleven patterns with no grouping is
       just a wall; a label option draws one divided row, as sizes read
       best that way. Built once, then repainted in place on each pick so
       focus and scroll position survive.
       -------------------------------------------------------------------- */
    if (options.length) {
        const box = document.createElement('div');
        box.className = 'prod-options';
        priceEl.after(box);

        // The chosen swatch is named in words above the rails: a colour
        // called "Ripple Stripes – Dusty dark pink" cannot be read off a
        // 40-pixel square, and it is what the shopper is buying.
        const caption = document.createElement('div');
        caption.className = 'prod-opt-caption';
        box.appendChild(caption);

        const blocks = options.map(o => {
            const block = document.createElement('div');
            block.className = 'prod-opt';
            box.appendChild(block);
            return { option: o, el: block };
        });

        const paint = () => {
            const swatchNames = options
                .filter(o => o.kind === 'swatch')
                .map(o => chosen[o.name])
                .filter(Boolean);
            caption.textContent = swatchNames.join(' · ');
            caption.style.display = swatchNames.length ? '' : 'none';

            for (const { option, el } of blocks) {
                const reachable = availableValues(product, option, chosen);
                // A rail with nothing behind it yet (a product mid-setup)
                // should stay usable rather than render every choice dead.
                const gate = reachable.size ? (label => reachable.has(label)) : (() => true);

                el.innerHTML = option.kind === 'swatch'
                    ? swatchRail(option, gate)
                    : labelRail(option, gate);
            }
        };

        // Values keep their given order inside each band, and the bands
        // appear in the order their first value does — so the panel's
        // ordering is what the page shows, with no sorting of its own.
        const bandsOf = (option) => {
            const bands = new Map();
            for (const v of option.values) {
                const key = v.heading || '';
                if (!bands.has(key)) bands.set(key, []);
                bands.get(key).push(v);
            }
            return [...bands];
        };

        const swatchRail = (option, gate) => bandsOf(option).map(([heading, values]) => `
            <div class="prod-opt-row">
                <span class="prod-opt-label">${escapeHtml(heading || option.name)}</span>
                <div class="prod-opt-rail">
                    ${values.map(v => {
            const on = chosen[option.name] === v.label;
            const okay = gate(v.label);
            return `<button type="button" class="prod-swatch${on ? ' is-on' : ''}${okay ? '' : ' is-out'}"
                                data-option="${escapeHtml(option.name)}" data-value="${escapeHtml(v.label)}"
                                aria-pressed="${on}" ${okay ? '' : 'disabled'}
                                title="${escapeHtml(v.label)}${okay ? '' : ' — unavailable'}"
                                style="${escapeHtml(swatchFill(v.swatch))}"><span class="sr-only">${escapeHtml(v.label)}</span></button>`;
        }).join('')}
                </div>
            </div>`).join('');

        const labelRail = (option, gate) => `
            <div class="prod-opt-row">
                <span class="prod-opt-label">${escapeHtml(option.name)}</span>
                <div class="prod-opt-rail prod-opt-rail--divided">
                    ${option.values.map(v => {
            const on = chosen[option.name] === v.label;
            const okay = gate(v.label);
            return `<button type="button" class="prod-opt-cell${on ? ' is-on' : ''}${okay ? '' : ' is-out'}"
                            data-option="${escapeHtml(option.name)}" data-value="${escapeHtml(v.label)}"
                            aria-pressed="${on}" ${okay ? '' : 'disabled'}
                            title="${okay ? escapeHtml(v.label) : escapeHtml(v.label) + ' — unavailable'}"
                        >${escapeHtml(v.label)}</button>`;
        }).join('')}
                </div>
            </div>`;

        // An image swatch is a pattern tile; a bare value is a colour.
        const swatchFill = (s) => s && /[/.]/.test(s)
            ? `background-image:url(${encodeURI(s)})`
            : `background:${s || '#e5e0d6'}`;

        box.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-option]');
            if (!btn || btn.disabled) return;

            chosen[btn.dataset.option] = btn.dataset.value;
            chosenVariant = findVariant(product, chosen);
            renderPrice(chosenVariant?.price || product.price, product.compareAt);
            paint();
            syncStockUI();
            syncGallery();
        });

        paint();
    }

    const getCurrentIndex = () => Math.round(track.scrollLeft / track.clientWidth);

    const updateDots = () => {
        const currentIdx = getCurrentIndex();
        dotsContainer.querySelectorAll('.prod-dot').forEach((d, i) => {
            d.classList.toggle('active', i === currentIdx);
        });
    };

    track.addEventListener('scroll', () => {
        window.requestAnimationFrame(updateDots);
    });

    // Quantity selector
    let qty = 1;
    const qtyVal = document.getElementById('qtyVal');
    document.getElementById('qtyMinus').addEventListener('click', () => {
        if (qty > 1) { qty--; qtyVal.textContent = qty; }
    });
    document.getElementById('qtyPlus').addEventListener('click', () => {
        qty++; qtyVal.textContent = qty;
    });

    // Accordion dropdowns. Delegated from the container rather than bound
    // per header: the sections are rendered from data now, so binding each
    // one would tie this to the order they happen to be built in.
    const accordion = document.getElementById('prodAccordion');
    accordion?.addEventListener('click', (e) => {
        const header = e.target.closest('.prod-acc-header');
        if (!header || !accordion.contains(header)) return;
        const open = header.parentElement.classList.toggle('open');
        header.setAttribute('aria-expanded', String(open));
    });

    // Description alone starts open; Dimensions, Materials, Care and
    // Shipping all start closed and are opened by the shopper.
    //
    // Addressed by id, not by position. This used to open whichever item was
    // first, which is only the description when the product has one — a
    // piece with no description opened onto its Dimensions table instead, so
    // what greeted the shopper changed product by product. Nothing opens
    // when there is no description rather than promoting the next section.
    const descHeader = accordion?.querySelector('.prod-acc-header[data-target="acc-desc"]');
    if (descHeader) {
        descHeader.parentElement.classList.add('open');
        descHeader.setAttribute('aria-expanded', 'true');
    }

    // ---- Toast helper ----
    function showToast(msg) {
        let toast = document.getElementById('vayuToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'vayuToast';
            toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;padding:12px 28px;border-radius:2px;font-family:Jost,sans-serif;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;z-index:10000;opacity:0;transition:opacity 0.3s ease;pointer-events:none;';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.style.opacity = '1';
        clearTimeout(toast._t);
        toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
    }

    // ---- Wishlist button ----
    const wishBtn = document.getElementById('prodWishBtn');
    const wishLabel = wishBtn ? wishBtn.querySelector('.prod-wish-label') : null;

    // state lives in a class now — the heart fill, colour and label
    // all follow from .is-wished rather than inline styles
    function syncWishState() {
        if (!wishBtn) return;
        const wished = isInWishlist(cat, idx);
        wishBtn.classList.toggle('is-wished', wished);
        wishBtn.setAttribute('aria-pressed', String(wished));
        if (wishLabel) wishLabel.textContent = wished ? 'In Wishlist' : 'Add to Wishlist';
    }
    syncWishState();

    if (wishBtn) {
        wishBtn.addEventListener('click', () => {
            const added = toggleWishlist({ cat, idx, name: product.name, price: product.price, img: product.img });
            syncWishState();
            showToast(added ? 'Added to Wishlist' : 'Removed from Wishlist');
        });
    }

    // ---- Add to Cart button ----
    // `variant` stays a plain string, because that is what the cart, the
    // checkout and every past order line already read. With options it is
    // the composed label ("Dusty pink / L"), which is also what the shopper
    // just clicked, so the line needs no translation to be legible.
    const cartPayload = () => ({
        id: product.id, cat, idx, name: product.name,
        price: chosenVariant?.price || product.price,
        img: chosenVariant?.image || product.img,
        variant: chosenVariant ? chosenVariant.label : null,
        qty,
    });

    const cartBtn = document.getElementById('prodCartBtn');
    if (cartBtn) {
        cartBtn.addEventListener('click', () => {
            if (!inStock()) return;
            addToCart(cartPayload());
            showToast('Added to Cart');
        });
    }

    // ---- Buy Now button ----
    const buyBtn = document.getElementById('prodBuyBtn');
    if (buyBtn) {
        buyBtn.addEventListener('click', () => {
            if (!inStock()) return;
            addToCart(cartPayload());
            window.location.href = '/pages/cart.html';
        });
    }

    // Suggested products — same category first, topped up from the
    // rest of the catalogue. Built as [cat, idx] pairs so the shared
    // tile can resolve each product itself.
    const suggestGrid = document.getElementById('prodSuggestGrid');
    if (suggestGrid) {
        // Rank the rest of the catalogue by affinity: same
        // sub-category, then same category, then shared tags.
        const myTags = new Set(product.tags || []);
        const scored = [];
        for (const [c, items] of Object.entries(site.products)) {
            items.forEach((p, i) => {
                if (p === product || p.id && product.id && p.id === product.id) return;
                let score = 0;
                if (c === cat) score += 2;
                if (c === cat && p.sub && p.sub === product.sub) score += 3;
                for (const t of p.tags || []) if (myTags.has(t)) score += 1;
                scored.push({ pair: [c, i], score, key: p.id || `${c}|${i}` });
            });
        }
        const seen = new Set();
        const pairs = scored
            .sort((a, b) => b.score - a.score)
            .filter(s => !seen.has(s.key) && seen.add(s.key))
            .slice(0, 4)
            .map(s => s.pair);

        // The same tile as the collection grid and the artist
        // capsule — one implementation in js/product-card.js rather
        // than three copies that drift apart.
        suggestGrid.innerHTML = pairs
            .map(([sCat, sIdx]) => productCardHTML(sCat, sIdx))
            .join('');
        bindProductTiles(suggestGrid, showToast);
    }

} else {
    const prodName = document.getElementById('prodName');
    if (prodName) prodName.textContent = 'Product Not Found';

    // The accordion is empty markup until a product fills it, so the
    // apology goes in as its own paragraph rather than into a #prodDesc
    // that no longer exists on the page.
    const host = document.getElementById('prodAccordion');
    if (host) {
        host.innerHTML = '<p id="prodDesc" style="padding:16px 0;color:var(--body)">'
            + 'This piece may have sold out or moved. Please browse our collections.</p>';
    }
}
