/**
 * Vayu Admin — the things you publish: products, categories, press, events.
 */

import {
    $, viewEl, esc, money, timeFmt, toast, guard,
    openModal, closeModal, modalChrome, confirmDelete,
} from '../lib/dom.js';
import { api, state, loadCategories, catTitle, slugToLabel } from '../lib/api.js';
import { pickImage, pickTextFile } from '../lib/media.js';
import { mountOptionsEditor } from './product-options.js';
import { mountDetailsEditor } from './product-details.js';

const STATUSES = ['active', 'draft', 'archived'];

/* ================= products ================= */

const stockOf = (p) => (p.variants?.length)
    ? p.variants.reduce((n, v) => n + (v.stock || 0), 0)
    : p.stock;

/**
 * Name the axes, not the crossings: "Colour · Size" tells the shopkeeper
 * what this piece offers, where "77 option(s)" did not. Products still on
 * the older flat list keep their count, since they have no axes to name.
 */
function optionSummary(p) {
    if (p.options?.length) return p.options.map(o => esc(o.name)).join(' · ');
    return p.variants?.length ? `${p.variants.length} option(s)` : '';
}

function productRow(p, lowStockAt, selected) {
    const stock = stockOf(p);
    const scheduled = p.publishAt && p.status === 'draft'
        ? ` · <span style="color:var(--series-3)">publishes ${timeFmt(p.publishAt)}</span>` : '';
    const meta = [
        esc(p.sku) || p.id,
        p.isNew ? '<span style="color:var(--accent)">NEW</span>' : '',
        optionSummary(p),
    ].filter(Boolean).join(' · ') + scheduled;

    return `
        <tr data-id="${p.id}">
            <td><input type="checkbox" class="sel-row" data-id="${p.id}" ${selected.has(p.id) ? 'checked' : ''}></td>
            <td><div class="prod-cell"><img class="thumb" src="${esc(p.img)}" alt="">
                <div><div class="nm">${esc(p.name)}</div><div class="meta">${meta}</div></div></div></td>
            <td>${p.categories.map(c => `<span class="chip">${esc(catTitle(c.cat))}${c.sub ? ' / ' + esc(slugToLabel(c.sub)) : ''}</span>`).join('')}</td>
            <td class="num">${money(p.price)}${p.compareAt ? `<div class="meta" style="text-decoration:line-through">${money(p.compareAt)}</div>` : ''}</td>
            <td class="num ${stock <= lowStockAt ? 'stock-low' : ''}">${stock}</td>
            <td class="num">${p.views || 0}</td>
            <td class="num">${p.sold || 0}</td>
            <td><span class="status ${p.status}">${p.status}</span></td>
            <td style="white-space:nowrap">
                <button class="btn small" data-act="edit">Edit</button>
                <button class="btn small" data-act="dup" title="Duplicate">⧉</button>
                <button class="btn small danger" data-act="del" title="Delete">✕</button>
            </td>
        </tr>`;
}

/**
 * Turn the bulk-action dropdown into a request body, prompting for the
 * extra input each action needs. Returns null when the user backs out.
 */
async function bulkPayload(choice, ids) {
    if (choice.startsWith('status:')) return { ids, action: 'status', status: choice.split(':')[1] };

    if (choice === 'price-adjust') {
        const percent = prompt('Adjust prices by percent (e.g. 10 for +10%, -15 for a sale):');
        return percent === null ? null : { ids, action: 'price-adjust', percent: Number(percent) || 0 };
    }
    if (choice === 'stock-set') {
        const stock = prompt('Set stock of every selected product to:');
        return stock === null ? null : { ids, action: 'stock-set', stock: Number(stock) || 0 };
    }
    if (choice === 'add-category') {
        const cat = prompt('Category slug to add (e.g. decor):\n' + Object.keys(state.categories).join(', '));
        return cat ? { ids, action: 'add-category', cat: cat.trim() } : null;
    }
    // Where a product sits in its category on the storefront. New products
    // already arrive at the top; these are for moving an older one up, or
    // pushing something down out of the way.
    if (choice === 'move-top' || choice === 'move-bottom') return { ids, action: choice };

    if (choice === 'delete') {
        const yes = await confirmDelete({
            title: `Delete ${ids.length} product(s)?`,
            body: `<p>Every selected piece is removed from the catalogue, along with its images, options and stock. <b>This cannot be undone.</b></p>`,
        });
        return yes ? { ids, action: 'delete' } : null;
    }
    return null;
}

export async function renderProducts() {
    const [{ products, settings, shippingPresets }] = await Promise.all([api('products'), loadCategories()]);
    const filters = { q: '', cat: '', status: '' };
    const selected = new Set();

    viewEl.innerHTML = `
        <div class="toolbar">
            <input type="search" id="f-q" placeholder="Search products, SKU…">
            <select id="f-cat"><option value="">All categories</option>
                ${Object.entries(state.categories).map(([slug, c]) => `<option value="${slug}">${esc(c.title)}</option>`).join('')}</select>
            <select id="f-status"><option value="">Any status</option>
                ${STATUSES.map(s => `<option value="${s}">${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select>
            <div class="spacer"></div>
            <button class="btn" id="import-csv">Import CSV</button>
            <a class="btn" href="/api/admin/export/products.csv">Export CSV</a>
            <button class="btn primary" id="new-prod">+ New product</button>
        </div>
        <div class="toolbar" id="bulk-bar" style="display:none;background:var(--accent-soft);border:1px solid var(--hairline);border-radius:8px;padding:8px 12px;">
            <b id="bulk-count"></b>
            <select id="bulk-action">
                <option value="">Bulk action…</option>
                <option value="status:active">Set active</option>
                <option value="status:draft">Set draft</option>
                <option value="status:archived">Archive</option>
                <option value="price-adjust">Adjust price by %…</option>
                <option value="stock-set">Set stock…</option>
                <option value="add-category">Add to category…</option>
                <option value="move-top">Move to top of shop</option>
                <option value="move-bottom">Move to bottom of shop</option>
                <option value="delete">Delete</option>
            </select>
            <button class="btn small primary" id="bulk-go">Apply</button>
            <button class="btn small" id="bulk-clear">Clear selection</button>
        </div>
        <div class="card" id="prod-table"><div class="table-scroll"><table class="grid">
            <thead><tr>
                <th><input type="checkbox" id="sel-all" title="Select all shown"></th>
                <th>Product</th><th>Categories</th><th class="num">Price</th><th class="num">Stock</th>
                <th class="num">Views</th><th class="num">Sold</th><th>Status</th><th></th>
            </tr></thead>
            <tbody id="prod-rows"></tbody>
        </table></div></div>`;

    const rowsEl = $('#prod-rows');
    const bulkBar = $('#bulk-bar');

    function draw() {
        const q = filters.q.toLowerCase();
        const list = products.filter(p =>
            (!q || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
            && (!filters.cat || p.categories.some(c => c.cat === filters.cat))
            && (!filters.status || p.status === filters.status));

        rowsEl.innerHTML = list.length
            ? list.map(p => productRow(p, settings.lowStockThreshold, selected)).join('')
            : '<tr><td colspan="9"><div class="empty">No products match.</div></td></tr>';
    }

    function syncBulk() {
        bulkBar.style.display = selected.size ? 'flex' : 'none';
        $('#bulk-count').textContent = `${selected.size} selected`;
    }

    draw();

    $('#f-q').addEventListener('input', (e) => { filters.q = e.target.value; draw(); });
    $('#f-cat').addEventListener('change', (e) => { filters.cat = e.target.value; draw(); });
    $('#f-status').addEventListener('change', (e) => { filters.status = e.target.value; draw(); });
    $('#new-prod').addEventListener('click', () => productEditor(null, shippingPresets));

    $('#import-csv').addEventListener('click', async () => {
        const csv = await pickTextFile();
        if (!csv) return;
        try {
            const r = await api('products/import', 'POST', { csv });
            toast(`Imported: ${r.created} new, ${r.updated} updated`);
            renderProducts();
        } catch (err) { toast(err.message, true); }
    });

    /* ---- selection ---- */
    $('#prod-table').addEventListener('change', (e) => {
        const track = (cb) => cb.checked ? selected.add(cb.dataset.id) : selected.delete(cb.dataset.id);
        if (e.target.id === 'sel-all') {
            rowsEl.querySelectorAll('.sel-row').forEach(cb => { cb.checked = e.target.checked; track(cb); });
        } else if (e.target.classList.contains('sel-row')) {
            track(e.target);
        } else return;
        syncBulk();
    });

    $('#bulk-clear').addEventListener('click', () => { selected.clear(); draw(); syncBulk(); });

    $('#bulk-go').addEventListener('click', async () => {
        const choice = $('#bulk-action').value;
        if (!choice || !selected.size) return;
        const payload = await bulkPayload(choice, [...selected]);
        if (!payload) return;
        try {
            const r = await api('products/bulk', 'POST', payload);
            toast(`Done — ${r.affected} product(s) updated`);
            selected.clear();
            renderProducts();
        } catch (err) { toast(err.message, true); }
    });

    /* ---- per-row actions ---- */
    rowsEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const id = btn.closest('tr').dataset.id;
        const prod = products.find(p => p.id === id);

        if (btn.dataset.act === 'edit') return productEditor(prod, shippingPresets);
        if (btn.dataset.act === 'dup') {
            if (await guard(() => api(`products/${id}/duplicate`, 'POST', {}), 'Duplicated as draft')) renderProducts();
            return;
        }
        if (!await confirmDelete({
            title: `Delete ${esc(prod.name)}?`,
            body: `<p>The product, its images, options and stock all go. Orders that already contain it keep their own copy of the line. <b>This cannot be undone.</b></p>`,
        })) return;
        if (await guard(() => api(`products/${id}`, 'DELETE'), 'Product deleted')) renderProducts();
    });
}

/* ---------- product editor ---------- */

const BLANK_PRODUCT = {
    name: '', description: '', price: '', compareAt: '', sku: '', stock: 10,
    status: 'active', isNew: true, img: '', gallery: [], categories: [],
    tags: [], variants: [], options: [], publishAt: null,
    care: '', dimensions: [], materials: [], shippingPreset: '',
    slug: '', metaTitle: '', metaDescription: '',
};

/** One row per category, with its sub-categories in a select beside it. */
function categoryPicker(chosen) {
    return Object.entries(state.categories).map(([slug, c]) => {
        const sel = chosen.find(x => x.cat === slug);
        const options = c.subs.map(s => {
            const sub = s.label.toLowerCase().replaceAll(/\s+/g, '-');
            return `<option value="${sub}" ${sel?.sub === sub ? 'selected' : ''}>${esc(s.label)}</option>`;
        }).join('');
        return `<div class="cat-pick-row ${sel ? '' : 'off'}" data-cat="${slug}">
            <label><input type="checkbox" ${sel ? 'checked' : ''}> ${esc(c.title)}</label>
            <select><option value="">— no sub-category —</option>${options}</select>
        </div>`;
    }).join('');
}

export function productEditor(prod, shippingPresets = []) {
    const p = prod || BLANK_PRODUCT;
    let gallery = [...(p.gallery || [])];
    if (!gallery.length && p.img) gallery = [p.img];

    const modal = openModal(`
        <h2>${prod ? 'Edit product' : 'New product'}</h2>
        <div class="form-grid">
            <div class="field full"><label>Name</label><input id="p-name" value="${esc(p.name)}"></div>
            <div class="field full"><label>Description</label><textarea id="p-desc">${esc(p.description)}</textarea>
                <div class="help">The first section of the product page's accordion. Empty hides it.</div></div>
            <div class="field"><label>Price (₹)</label><input id="p-price" type="number" min="0" value="${p.price}"></div>
            <div class="field"><label>Compare-at price (₹)</label><input id="p-compare" type="number" min="0" value="${p.compareAt ?? ''}" placeholder="optional"></div>
            <div class="field"><label>SKU</label><input id="p-sku" value="${esc(p.sku)}"></div>
            <div class="field"><label>Stock</label><input id="p-stock" type="number" min="0" value="${p.stock}">
                <div class="help" id="p-stock-note"></div></div>
            <div class="field"><label>Status</label><select id="p-status">
                ${STATUSES.map(s => `<option ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
            <div class="field"><label>Badge</label><label style="text-transform:none;letter-spacing:0;font-size:14px;display:flex;gap:8px;align-items:center;margin-top:8px">
                <input type="checkbox" id="p-new" ${p.isNew ? 'checked' : ''} style="width:auto"> Show “New” badge</label></div>
            <div class="field full"><label>Categories <span style="text-transform:none;letter-spacing:0">(a product can live in several)</span></label>
                <div class="cat-picker" id="p-cats">${categoryPicker(p.categories)}</div></div>
            <div class="field full"><label>Images <span style="text-transform:none;letter-spacing:0">(first = cover)</span></label>
                <div class="gallery-strip" id="p-gallery"></div>
                <div class="help">Click an image to make it the cover. Uploads are stored in R2 and served from /uploads/, resized on request.</div></div>
            <div class="field full"><label>Tags</label><input id="p-tags" value="${esc((p.tags || []).join(', '))}" placeholder="handloom, brass, gift"></div>
            <div class="field full"><label>Options <span style="text-transform:none;letter-spacing:0">(colour, size, finish — the pickers shown on the product page)</span></label>
                <div id="p-options"></div>
                <div class="help">With options, stock is tracked per combination and the base stock field is ignored.</div></div>
            <div class="field full"><label>Product details <span style="text-transform:none;letter-spacing:0">(the rest of the accordion a shopper opens)</span></label>
                <div class="det-editor" id="p-details"></div></div>
            <div class="field full"><label>Search &amp; sharing <span style="text-transform:none;letter-spacing:0">(how this product appears on Google and when linked)</span></label>
                <div class="seo-editor">
                    <label class="seo-lab">URL</label>
                    <div class="seo-url">
                        <span class="seo-origin">/products/</span>
                        <input id="p-slug" value="${esc(p.slug || '')}" placeholder="${prod ? '' : 'left blank — made from the name'}">
                    </div>
                    <div class="help">${prod
                        ? 'This is the product&rsquo;s address. Changing it breaks every existing link and loses its search ranking — only change it if the page is new.'
                        : 'Leave blank and one is made from the name.'}</div>

                    <label class="seo-lab">Meta title</label>
                    <input id="p-metatitle" maxlength="70" value="${esc(p.metaTitle || '')}" placeholder="${esc(p.name || 'Product name')} — Vayu">
                    <div class="help"><span id="p-mt-count">0</span>/70 — Google cuts it off past about 60. Blank uses the product name.</div>

                    <label class="seo-lab">Meta description</label>
                    <textarea id="p-metadesc" maxlength="160" rows="2">${esc(p.metaDescription || '')}</textarea>
                    <div class="help"><span id="p-md-count">0</span>/160 — the snippet under the title in search results. Blank uses the description.</div>
                </div></div>
            <div class="field full"><label>Schedule publish <span style="text-transform:none;letter-spacing:0">(a draft goes live automatically at this time)</span></label>
                <input id="p-publish" type="datetime-local" value="${p.publishAt ? new Date(p.publishAt).toISOString().slice(0, 16) : ''}"></div>
        </div>
        <div class="modal-actions">
            <div class="form-error" id="p-err"></div>
            <button class="btn" id="p-cancel">Cancel</button>
            <button class="btn primary" id="p-save">${prod ? 'Save changes' : 'Create product'}</button>
        </div>`);

    /* ---- options and the combination grid ---- */
    /**
     * Keep the Stock field honest.
     *
     * As soon as a product has variants the shop stops reading this number:
     * totalStock() sums the variant rows instead. Typing 99 here against a
     * product whose combinations are all zero left the panel saying 99 and
     * the shop saying Out of stock, with nothing on screen to explain the
     * disagreement — which is exactly the bug this fixes.
     *
     * The field is disabled rather than hidden, so its value is still
     * visible and comes back the moment the last option is removed.
     */
    const stockNote = () => $('#p-stock-note', modal);
    const syncStockField = ({ hasVariants, stock }) => {
        const input = $('#p-stock', modal);
        const note = stockNote();
        if (!input || !note) return;
        input.disabled = hasVariants;
        input.style.opacity = hasVariants ? '0.5' : '';
        note.textContent = hasVariants
            ? `Set per option below — this product sells ${stock} in total. `
              + 'This field is ignored while options exist.'
            : '';
    };

    const optionsEditor = mountOptionsEditor($('#p-options', modal), p, {
        onChange: syncStockField,
    });

    /* ---- dimensions, materials, care, shipping ---- */
    const detailsEditor = mountDetailsEditor($('#p-details', modal), p, shippingPresets);

    /* ---- gallery: first image is the cover ---- */
    const galEl = $('#p-gallery', modal);
    function drawGallery() {
        galEl.innerHTML = gallery.map((url, i) => `
            <div class="gal-item ${i === 0 ? 'primary' : ''}" data-i="${i}">
                <img src="${esc(url)}" alt="" title="${i === 0 ? 'Cover image' : 'Click to make cover'}">
                <button class="gal-x" title="Remove">✕</button>
            </div>`).join('') + '<button class="gal-add" id="gal-add" title="Add image">+</button>';

        $('#gal-add', modal).addEventListener('click', async () => {
            const url = await pickImage();
            if (url) { gallery.push(url); drawGallery(); }
        });
        galEl.querySelectorAll('.gal-item').forEach(item => {
            const i = Number(item.dataset.i);
            item.querySelector('img').addEventListener('click', () => {
                gallery.unshift(gallery.splice(i, 1)[0]);   // promote to cover
                drawGallery();
            });
            item.querySelector('.gal-x').addEventListener('click', () => {
                gallery.splice(i, 1);
                drawGallery();
            });
        });
    }
    drawGallery();

    // Greying a row out is purely visual; the checkbox is what is read on save.
    $('#p-cats', modal).addEventListener('change', (e) => {
        const row = e.target.closest('.cat-pick-row');
        if (row && e.target.type === 'checkbox') row.classList.toggle('off', !e.target.checked);
    });

    // Live length counters. The limits are what Google actually renders, so
    // the count is advisory rather than an error — a longer title is not
    // rejected anywhere, it is simply truncated in the result.
    for (const [input, out, limit] of [['#p-metatitle', '#p-mt-count', 70], ['#p-metadesc', '#p-md-count', 160]]) {
        const el = $(input, modal);
        const label = $(out, modal);
        const sync = () => {
            label.textContent = el.value.length;
            label.style.color = el.value.length > limit * 0.9 ? 'var(--warn, #b26a00)' : '';
        };
        el.addEventListener('input', sync);
        sync();
    }
    const err = modalChrome(modal, '#p-cancel', '#p-err');
    $('#p-save', modal).addEventListener('click', async () => {
        const cats = [...modal.querySelectorAll('.cat-pick-row')]
            .filter(r => r.querySelector('input[type=checkbox]').checked)
            .map(r => ({ cat: r.dataset.cat, sub: r.querySelector('select').value }));

        const body = {
            name: $('#p-name', modal).value.trim(),
            description: $('#p-desc', modal).value,
            price: Number($('#p-price', modal).value),
            compareAt: $('#p-compare', modal).value,
            sku: $('#p-sku', modal).value.trim(),
            stock: Number($('#p-stock', modal).value),
            status: $('#p-status', modal).value,
            isNew: $('#p-new', modal).checked,
            img: gallery[0] || '',
            gallery,
            categories: cats,
            tags: $('#p-tags', modal).value.split(',').map(t => t.trim()).filter(Boolean),
            ...optionsEditor.read(),
            ...detailsEditor.read(),
            publishAt: $('#p-publish', modal).value || null,
            // Sent on every save so clearing a field clears it server-side.
            // An empty slug is not 'no slug': writeProduct reads it as 'keep
            // the one this product already has', which is what stops a save
            // from silently moving a ranked URL.
            slug: $('#p-slug', modal).value.trim(),
            metaTitle: $('#p-metatitle', modal).value.trim(),
            metaDescription: $('#p-metadesc', modal).value.trim(),
        };

        if (!body.name) return err.textContent = 'Name is required';
        if (!cats.length) return err.textContent = 'Pick at least one category';
        if (!gallery.length) return err.textContent = 'Add at least one image';

        try {
            if (prod) await api(`products/${prod.id}`, 'PUT', body);
            else await api('products', 'POST', body);
            closeModal();
            toast(prod ? 'Product saved' : 'Product created');
            renderProducts();
        } catch (error_) { err.textContent = error_.message; }
    });
}

/* ================= categories ================= */

/**
 * Move a category one place earlier or later, and write the new order down.
 *
 * The whole list is renumbered from the top rather than the two neighbours
 * trading numbers. Stored positions are not guaranteed to run 0, 1, 2 — the
 * column defaults to 0, so a shop that has never reordered has every
 * category sitting on the same number, and swapping two zeroes moves
 * nothing at all. Renumbering also closes the gap a deleted category leaves
 * behind. Only the rows whose number actually changes are sent, so the
 * first move may write the whole list and every move after it writes two.
 */
async function moveCategory(ordered, slug, delta) {
    const i = ordered.findIndex(([s]) => s === slug);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ordered.length) return;

    const next = [...ordered];
    [next[i], next[j]] = [next[j], next[i]];

    const writes = next
        .map(([s, c], idx) => ({ slug: s, order: idx, was: c.order ?? 0 }))
        .filter(w => w.order !== w.was);

    const moved = ordered[i][1].title;
    const ok = await guard(async () => {
        // One PUT each: there is no endpoint that takes a whole ordering,
        // and a position is the only field being sent, so these are small.
        for (const w of writes) await api(`categories/${w.slug}`, 'PUT', { order: w.order });
    }, `"${moved}" is now ${j + 1} of ${ordered.length}`);

    if (ok) {
        state.categories = null;
        renderCategories();
    }
}

export async function renderCategories() {
    const { categories, counts } = await api('categories');
    state.categories = categories;

    // Sorted the way the storefront sorts them, because this list *is* the
    // storefront's order: the home page's Curated Categories rail, the
    // collection page and the COLLECTION menu are each Object.entries()
    // over the same taxonomy, served in sort_order. First here is first
    // in all three.
    const ordered = Object.entries(categories)
        .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));

    const cards = ordered.map(([slug, c], i) => `
            <div class="card cat-card" data-slug="${slug}">
                <div class="cat-head">
                    <img src="${esc(c.curated)}" alt="">
                    <div class="grow"><h2 style="margin:0">${esc(c.title)}</h2>
                        <div class="slug">/${slug} · ${counts[slug] || 0} product(s)</div></div>
                    <span class="chip" title="Where it comes on the home page">${i + 1}</span>
                </div>
                <div class="sub-list">${c.subs.map(s => `<span class="chip">${esc(s.label)}</span>`).join('')
                    || '<span class="slug">No sub-categories</span>'}</div>
                <div style="display:flex;gap:8px">
                    <button class="btn small" data-act="up" title="Move earlier"
                        ${i === 0 ? 'disabled' : ''}>←</button>
                    <button class="btn small" data-act="down" title="Move later"
                        ${i === ordered.length - 1 ? 'disabled' : ''}>→</button>
                    <button class="btn small" data-act="edit">Edit</button>
                    <button class="btn small danger" data-act="del">Delete</button>
                </div>
            </div>`).join('');

    viewEl.innerHTML = `
        <div class="toolbar">
            <div style="font-size:12px;color:var(--muted)">Numbered in the order they appear —
                on the home page, on the collection page and in the COLLECTION menu.
                &larr; and &rarr; move one earlier or later.</div>
            <div class="spacer"></div>
            <button class="btn primary" id="new-cat">+ New category</button>
        </div>
        <div class="cat-grid" id="cat-grid">${cards}</div>`;

    $('#new-cat').addEventListener('click', () => categoryEditor(null));
    $('#cat-grid').addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const slug = btn.closest('.cat-card').dataset.slug;
        const act = btn.dataset.act;

        if (act === 'edit') return categoryEditor(slug);
        if (act === 'up' || act === 'down') return moveCategory(ordered, slug, act === 'up' ? -1 : 1);

        if (!await confirmDelete({
            title: `Delete the ${esc(categories[slug].title)} category?`,
            body: `<p>Products in it are not deleted, but they stop appearing under this heading and any link to it will 404.</p>`,
        })) return;
        if (await guard(() => api(`categories/${slug}`, 'DELETE'), 'Category deleted')) {
            state.categories = null;
            renderCategories();
        }
    });
}

export function categoryEditor(slug) {
    const c = slug ? state.categories[slug] : { title: '', curated: '', banner: '', subs: [] };
    const subs = structuredClone(c.subs);

    const modal = openModal(`
        <h2>${slug ? 'Edit category' : 'New category'}</h2>
        <div class="form-grid">
            <div class="field"><label>Title</label><input id="c-title" value="${esc(c.title)}"></div>
            <div class="field"><label>Slug</label><input id="c-slug" value="${slug || ''}" ${slug ? 'disabled' : ''} placeholder="lowercase-with-dashes"></div>
            <div class="field"><label>Curated image</label><div style="display:flex;gap:8px">
                <input id="c-curated" value="${esc(c.curated)}"><button class="btn small" id="c-curated-up">Upload</button></div></div>
            <div class="field"><label>Banner image</label><div style="display:flex;gap:8px">
                <input id="c-banner" value="${esc(c.banner)}"><button class="btn small" id="c-banner-up">Upload</button></div></div>
            <div class="field full"><label>Sub-categories</label>
                <div id="c-subs" style="display:grid;gap:8px"></div>
                <button class="btn small" id="c-sub-add" style="margin-top:8px">+ Add sub-category</button></div>
        </div>
        <div class="modal-actions">
            <div class="form-error" id="c-err"></div>
            <button class="btn" id="c-cancel">Cancel</button>
            <button class="btn primary" id="c-save">${slug ? 'Save changes' : 'Create category'}</button>
        </div>`);

    const subsEl = $('#c-subs', modal);
    const drawSubs = () => {
        subsEl.innerHTML = subs.map((s, i) => `
            <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px" data-i="${i}">
                <input placeholder="Label" value="${esc(s.label)}" data-f="label">
                <input placeholder="Thumb URL" value="${esc(s.thumb)}" data-f="thumb">
                <button class="btn small danger" data-act="rm">✕</button>
            </div>`).join('') || '<div class="slug" style="font-size:12px;color:var(--muted)">None yet.</div>';
    };
    drawSubs();

    subsEl.addEventListener('input', (e) => {
        const row = e.target.closest('[data-i]');
        if (row) subs[Number(row.dataset.i)][e.target.dataset.f] = e.target.value;
    });
    subsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act=rm]');
        if (btn) { subs.splice(Number(btn.closest('[data-i]').dataset.i), 1); drawSubs(); }
    });
    $('#c-sub-add', modal).addEventListener('click', () => { subs.push({ label: '', thumb: '' }); drawSubs(); });
    $('#c-curated-up', modal).addEventListener('click', async () => {
        const u = await pickImage(); if (u) $('#c-curated', modal).value = u;
    });
    $('#c-banner-up', modal).addEventListener('click', async () => {
        const u = await pickImage(); if (u) $('#c-banner', modal).value = u;
    });

    const err = modalChrome(modal, '#c-cancel', '#c-err');
    $('#c-save', modal).addEventListener('click', async () => {
        const body = {
            title: $('#c-title', modal).value.trim(),
            slug: slug || $('#c-slug', modal).value.trim(),
            curated: $('#c-curated', modal).value.trim(),
            banner: $('#c-banner', modal).value.trim(),
            subs: subs.filter(s => s.label.trim()),
        };
        if (!body.title) return err.textContent = 'Title is required';
        try {
            if (slug) await api(`categories/${slug}`, 'PUT', body);
            else await api('categories', 'POST', body);
            closeModal();
            toast(slug ? 'Category saved' : 'Category created');
            state.categories = null;
            renderCategories();
        } catch (error_) { err.textContent = error_.message; }
    });
}

/* ================= press ================= */

/**
 * Coverage, in the order it appears on /pages/press.html.
 *
 * An entry that has not been read at source is listed here with an
 * "unverified" chip and renders bare on the site — publication, our own line
 * and the link. The rule is enforced by the handler as well as by this form,
 * because the one thing the press page must never do is print a headline or
 * a quotation nobody checked.
 */
export async function renderPress() {
    const { press } = await api('press');

    const rows = press.map(p => `
        <div class="mini-row" data-id="${p.id}">
            <img class="thumb" src="${esc(p.image)}" alt="">
            <div class="grow">
                <div class="nm">${esc(p.source)}${p.featured ? ' <span class="chip" style="color:var(--accent)">featured</span>' : ''}${p.verified ? '' : ' <span class="chip">unverified</span>'}</div>
                <div class="meta">${esc(p.headline || p.snippet || 'nothing on file yet')}${p.date ? ` · ${esc(p.date)}` : ''}</div>
            </div>
            <a class="btn small" href="${esc(p.url)}" target="_blank" rel="noopener">Read</a>
            <button class="btn small" data-act="edit">Edit</button>
            <button class="btn small danger" data-act="del">✕</button>
        </div>`).join('');

    viewEl.innerHTML = `
        <div class="toolbar">
            <div class="spacer"></div>
            <button class="btn primary" id="new-press">+ New entry</button>
        </div>
        <div class="card">
            ${press.length
        ? `<div class="mini-list" id="press-list">${rows}</div>`
        : '<div class="empty">No coverage listed yet — the press page is showing the list the site ships with. Anything added here replaces it.</div>'}
        </div>`;

    $('#new-press').addEventListener('click', () => pressEditor(null));
    $('#press-list')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const entry = press.find(x => x.id === btn.closest('[data-id]').dataset.id);

        if (btn.dataset.act === 'edit') return pressEditor(entry);
        if (!await confirmDelete({
            title: `Remove the ${esc(entry.source)} piece?`,
            body: `<p>It disappears from the press page. You can list it again, but the write-up here is not kept.</p>`,
        })) return;
        if (await guard(() => api(`press/${entry.id}`, 'DELETE'), 'Entry removed')) renderPress();
    });
}

const CHECK_LABEL = 'text-transform:none;letter-spacing:0;font-size:14px;display:flex;gap:8px;align-items:center;margin-top:8px';
const HINT = 'text-transform:none;letter-spacing:0;color:var(--muted)';

export function pressEditor(entry) {
    const v = entry || {
        source: '', url: '', headline: '', byline: '', date: '', quote: '',
        quoteAttribution: '', snippet: '', image: '', alt: '',
        featured: false, verified: false,
    };

    const modal = openModal(`
        <h2>${entry ? 'Edit entry' : 'New press entry'}</h2>
        <div class="form-grid">
            <div class="field"><label>Publication</label>
                <input id="pr-source" value="${esc(v.source)}" placeholder="The New York Times"></div>
            <div class="field"><label>Display date</label>
                <input id="pr-date" value="${esc(v.date)}" placeholder="30 October 2016"></div>
            <div class="field full"><label>Link to the article</label>
                <input id="pr-url" value="${esc(v.url)}" placeholder="https://…"></div>
            <div class="field full"><label>Headline</label>
                <input id="pr-headline" value="${esc(v.headline)}" placeholder="As printed"></div>
            <div class="field"><label>Byline</label>
                <input id="pr-byline" value="${esc(v.byline)}" placeholder="Guy Trebay"></div>
            <div class="field"><label>Quoted by</label>
                <input id="pr-attr" value="${esc(v.quoteAttribution)}" placeholder="Vivek Sahni"></div>
            <div class="field full"><label>Pull quote
                <span style="${HINT}">— the article's own words, printed in quotation marks</span></label>
                <textarea id="pr-quote">${esc(v.quote)}</textarea></div>
            <div class="field full"><label>Our line about it
                <span style="${HINT}">— one sentence, in Vayu's voice, never quoted</span></label>
                <textarea id="pr-snippet">${esc(v.snippet)}</textarea></div>
            <div class="field full"><label>Image</label><div style="display:flex;gap:8px">
                <input id="pr-img" value="${esc(v.image)}"><button type="button" class="btn small" id="pr-img-up">Upload</button></div></div>
            <div class="field full"><label>Image description</label>
                <input id="pr-alt" value="${esc(v.alt)}" placeholder="Left blank: the publication's name plus 'coverage of Vayu'"></div>
            <div class="field"><label>Featured</label><label style="${CHECK_LABEL}">
                <input type="checkbox" id="pr-feat" ${v.featured ? 'checked' : ''} style="width:auto"> Lead piece on the press page</label></div>
            <div class="field"><label>Verified</label><label style="${CHECK_LABEL}">
                <input type="checkbox" id="pr-ver" ${v.verified ? 'checked' : ''} style="width:auto"> Read at source</label>
                <div style="${HINT};font-size:12px;margin-top:6px">Off: the page shows only the publication, our line and the link — no headline, byline, date or quote.</div></div>
        </div>
        <div class="modal-actions">
            <div class="form-error" id="pr-err"></div>
            <button class="btn" id="pr-cancel">Cancel</button>
            <button class="btn primary" id="pr-save">${entry ? 'Save changes' : 'Add entry'}</button>
        </div>`);

    $('#pr-img-up', modal).addEventListener('click', async () => {
        const u = await pickImage(); if (u) $('#pr-img', modal).value = u;
    });

    const err = modalChrome(modal, '#pr-cancel', '#pr-err');
    $('#pr-save', modal).addEventListener('click', async () => {
        const body = {
            source: $('#pr-source', modal).value.trim(),
            url: $('#pr-url', modal).value.trim(),
            headline: $('#pr-headline', modal).value.trim(),
            byline: $('#pr-byline', modal).value.trim(),
            date: $('#pr-date', modal).value.trim(),
            quote: $('#pr-quote', modal).value.trim(),
            quoteAttribution: $('#pr-attr', modal).value.trim(),
            snippet: $('#pr-snippet', modal).value.trim(),
            image: $('#pr-img', modal).value.trim(),
            alt: $('#pr-alt', modal).value.trim(),
            featured: $('#pr-feat', modal).checked,
            verified: $('#pr-ver', modal).checked,
        };
        if (!body.source) return err.textContent = 'A publication is required';
        if (!body.url) return err.textContent = 'A link to the article is required';
        // Said here rather than silently corrected by the handler, which
        // would drop the quote and byline without explaining why.
        if (body.verified && !body.headline) {
            return err.textContent = 'A verified piece needs its headline — or untick Read at source';
        }
        try {
            if (entry) await api(`press/${entry.id}`, 'PUT', body);
            else await api('press', 'POST', body);
            closeModal();
            toast(entry ? 'Entry saved' : 'Entry added');
            renderPress();
        } catch (error_) { err.textContent = error_.message; }
    });
}

/* ================= events ================= */

/**
 * The two houses. Not editable: they are the addresses the shop trades
 * from, and each has a page that exists as a route — a third one invented
 * here would produce shows linking nowhere.
 */
const VENUES = [
    ['gallery-vayu', 'Gallery Vayu', '/pages/gallery.html'],
    ['design-for-living', 'Vayu — Design for Living', '/pages/design-for-living.html'],
];

const venueName = (id) => VENUES.find(([v]) => v === id)?.[1] || id;

/**
 * The programme, grouped by house.
 *
 * The venue page shows the show marked "Now on" — its title, dates, hero and
 * statement — and lists the rest underneath as tiles. Everything else a show
 * has, its pictures and the pieces gathered for it, is on its own page. The
 * rows below say which of those a show is missing, because a show with no
 * pictures has a page with nothing on it and that is invisible from here.
 */
export async function renderEvents() {
    const { events } = await api('events');

    const card = ([venueId, name, href]) => {
        const mine = events.filter(e => e.venue === venueId);
        const current = mine.find(e => e.current);
        const past = mine.filter(e => !e.current);

        const gaps = (e) => {
            const missing = [];
            if (!e.image) missing.push('no hero');
            if (!e.images?.length) missing.push('no pictures');
            if (!e.dates) missing.push('no dates');
            return missing.length
                ? ` · <span style="color:var(--critical)">${missing.join(' · ')}</span>`
                : '';
        };

        const row = (e) => `
            <div class="mini-row" data-id="${e.id}">
                <img class="thumb" src="${esc(e.image)}" alt="">
                <div class="grow">
                    <div class="nm">${esc(e.title)}${e.current ? ' <span class="chip" style="color:var(--accent)">now on</span>' : ''}</div>
                    <div class="meta">${esc(e.dates || '—')} · ${e.images?.length || 0} picture(s) · ${e.curated?.length || 0} piece(s)${gaps(e)}</div>
                </div>
                <a class="btn small" href="/pages/event.html?id=${encodeURIComponent(e.id)}" target="_blank" rel="noopener">View</a>
                <button class="btn small" data-act="edit">Edit</button>
                <button class="btn small danger" data-act="del">✕</button>
            </div>`;

        return `
            <div class="card" style="margin-bottom:16px">
                <div class="toolbar" style="margin-bottom:8px">
                    <h2 style="margin:0">${esc(name)}</h2>
                    <div class="spacer"></div>
                    <a class="btn small" href="${href}" target="_blank" rel="noopener">Open page</a>
                    <button class="btn primary small" data-new="${venueId}">+ New show</button>
                </div>
                <p class="sub" style="margin:0 0 10px">Now on — the show this venue page leads with.</p>
                ${current ? `<div class="mini-list">${row(current)}</div>`
        : '<div class="empty">Nothing marked as on. The page will lead with the newest show instead.</div>'}
                ${past.length ? `<p class="sub" style="margin:14px 0 6px">Previously — listed as tiles under it, each opening its own page.</p>
                    <div class="mini-list">${past.map(row).join('')}</div>` : ''}
            </div>`;
    };

    viewEl.innerHTML = VENUES.map(card).join('');

    viewEl.querySelectorAll('[data-new]').forEach(btn =>
        btn.addEventListener('click', () => eventEditor(null, btn.dataset.new)));

    viewEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const event = events.find(x => x.id === btn.closest('[data-id]').dataset.id);

        if (btn.dataset.act === 'edit') return eventEditor(event, event.venue);
        if (!await confirmDelete({
            title: `Delete ${esc(event.title)}?`,
            body: `<p>The exhibition page goes with it, along with its plates and the pieces curated into it. <b>This cannot be undone.</b></p>`,
        })) return;
        if (await guard(() => api(`events/${event.id}`, 'DELETE'), 'Show deleted')) renderEvents();
    });
}

/** One picture on the show's page: the plate, and the caption under it. */
const plateRow = (im = {}) => `
    <div class="ev-plate" style="display:grid;grid-template-columns:64px 1fr 1fr auto;gap:8px;align-items:center;margin-bottom:8px">
        <img src="${esc(im.img || '')}" alt="" style="width:64px;height:48px;object-fit:cover;background:var(--line)">
        <input class="ev-plate-name" value="${esc(im.name || '')}" placeholder="The Quiet Room">
        <input class="ev-plate-tag" value="${esc(im.tag || '')}" placeholder="Room 01">
        <button type="button" class="btn small danger" data-plate-del>✕</button>
        <input class="ev-plate-img" type="hidden" value="${esc(im.img || '')}">
        <input class="ev-plate-alt" value="${esc(im.alt || '')}" placeholder="Image description, for screen readers"
               style="grid-column:2 / -1">
    </div>`;

/** One piece gathered for the show: category slug and the product's name. */
const pieceRow = (c = {}) => `
    <div class="ev-piece" style="display:grid;grid-template-columns:160px 1fr auto;gap:8px;margin-bottom:8px">
        <input class="ev-piece-cat" value="${esc(c.cat || '')}" placeholder="fashion">
        <input class="ev-piece-name" value="${esc(c.name || '')}" placeholder="Heritage Linen Kurta">
        <button type="button" class="btn small danger" data-piece-del>✕</button>
    </div>`;

/**
 * The editor, grouped by where each field lands.
 *
 * It used to be one flat list of inputs whose labels described the database
 * rather than the site — "Section note", "One line for the menu card" — and
 * two of them named places that no longer exist: the venue pages stopped
 * carrying a plate grid and the curated tiles, and the menu card never
 * showed the one-line note at all. Anyone filling this in was writing copy
 * for pages that would not print it.
 *
 * So the form is in three parts, in the order a show is actually seen: what
 * appears wherever it is listed, what the venue page shows while it is on,
 * and what is on its own page.
 */
export function eventEditor(event, venueId) {
    const v = event || {
        title: '', dates: '', statement: '', image: '', imageMobile: '', alt: '',
        cta: 'Enter the exhibition', secNote: '', closing: '', images: [], curated: [], current: false,
    };
    const house = venueName(event?.venue || venueId);

    const modal = openModal(`
        <h2>${event ? `Edit — ${esc(v.title)}` : `New show — ${esc(house)}`}</h2>

        <p class="sub" style="margin:0 0 14px">Wherever this show is listed — the MENU panel, the
            top of ${esc(house)}, and its tile once it has finished.</p>
        <div class="form-grid">
            <div class="field full"><label>Title</label>
                <input id="ev-title" value="${esc(v.title)}" placeholder="Personal Heirlooms"></div>
            <div class="field"><label>Dates, as printed</label>
                <input id="ev-dates" value="${esc(v.dates)}" placeholder="On view till 23 August 2026"></div>
            <div class="field"><label>Link text <span style="${HINT}">— in the MENU panel</span></label>
                <input id="ev-cta" value="${esc(v.cta)}" placeholder="Enter the exhibition"></div>
            <div class="field full"><label>Hero image <span style="${HINT}">— cropped to 21:9 on a computer, so give it a wide one. Also the tile in every listing.</span></label>
                <div style="display:flex;gap:8px">
                    <input id="ev-img" value="${esc(v.image)}"><button type="button" class="btn small" id="ev-img-up">Upload</button></div></div>
            <div class="field full"><label>Hero image, phone <span style="${HINT}">— cropped to a square. Leave empty to use the wide one on phones too.</span></label>
                <div style="display:flex;gap:8px">
                    <input id="ev-img-m" value="${esc(v.imageMobile || '')}" placeholder="Empty = use the wide image on phones too"><button type="button" class="btn small" id="ev-img-m-up">Upload</button></div>
                <div style="${HINT};font-size:12px;margin-top:6px">A wide picture cropped to a square on a phone keeps its middle and loses both ends &mdash; which is where a poster puts its title. Give it a tall crop of the same photograph.</div></div>
            <div class="field full"><label>Hero description <span style="${HINT}">— for screen readers. Left blank: the title.</span></label>
                <input id="ev-alt" value="${esc(v.alt)}"></div>
        </div>

        <h3 style="margin:22px 0 4px">On the ${esc(house)} page</h3>
        <p class="sub" style="margin:0 0 12px">The page leads with one show: its title, dates, hero and
            the paragraph below. Every other show is a tile underneath.</p>
        <div class="form-grid">
            <div class="field full"><label>Now on</label>
                <label style="${CHECK_LABEL}">
                    <input type="checkbox" id="ev-current" ${v.current ? 'checked' : ''} style="width:auto">
                    Lead with this show</label>
                <div style="${HINT};font-size:12px;margin-top:6px">Only one show per house can lead. Marking this one steps the other down to a tile.</div></div>
            <div class="field full"><label>Statement <span style="${HINT}">— the paragraph in italics, on the venue page and again on this show's page</span></label>
                <textarea id="ev-statement" rows="3">${esc(v.statement)}</textarea></div>
        </div>

        <h3 style="margin:22px 0 4px">On the show's own page</h3>
        <p class="sub" style="margin:0 0 12px">Every show has a page at /pages/event.html?id= — the only
            place its pictures and its pieces appear, and where a finished show stays.</p>
        <div class="form-grid">
            <div class="field full"><label>Pictures <span style="${HINT}">— shown as plates; click one on the site to enlarge it</span></label>
                <div id="ev-plates">${(v.images || []).map(plateRow).join('')}</div>
                <button type="button" class="btn small" id="ev-plate-add">+ Add picture</button>
                <div style="${HINT};font-size:12px;margin-top:6px">With none, the show's page has words and a hero and nothing else.</div></div>
            <div class="field"><label>Heading beside them</label>
                <input id="ev-secnote" value="${esc(v.secNote)}" placeholder="Three rooms"></div>
            <div class="field full"><label>Closing line <span style="${HINT}">— the sentence that ends the page</span></label>
                <input id="ev-closing" value="${esc(v.closing || '')}"
                       placeholder="Left blank: &ldquo;Now on at ${esc(house)}: &lt;whatever is on&gt;&rdquo;">
                <div style="${HINT};font-size:12px;margin-top:6px">Leave it empty and the line writes itself from the show marked &ldquo;Now on&rdquo;, so it cannot go stale. Fill it in when this show wants its own ending.</div></div>
            <div class="field full"><label>Pieces gathered for it <span style="${HINT}">— category slug and the product's exact name, as in the catalogue</span></label>
                <div id="ev-pieces">${(v.curated || []).map(pieceRow).join('')}</div>
                <button type="button" class="btn small" id="ev-piece-add">+ Add piece</button>
                <div style="${HINT};font-size:12px;margin-top:6px">A name that matches nothing is dropped rather than shown wrong.</div></div>
        </div>

        <div class="modal-actions">
            <div class="form-error" id="ev-err"></div>
            <button class="btn" id="ev-cancel">Cancel</button>
            <button class="btn primary" id="ev-save">${event ? 'Save changes' : 'Add show'}</button>
        </div>`);

    $('#ev-img-m-up', modal).addEventListener('click', async () => {
        const u = await pickImage(); if (u) $('#ev-img-m', modal).value = u;
    });

    $('#ev-img-up', modal).addEventListener('click', async () => {
        const u = await pickImage(); if (u) $('#ev-img', modal).value = u;
    });

    // A new plate is uploaded straight away: an empty row with nowhere to
    // put a picture is a row that can only be filled by typing a path.
    $('#ev-plate-add', modal).addEventListener('click', async () => {
        const url = await pickImage();
        if (!url) return;
        $('#ev-plates', modal).insertAdjacentHTML('beforeend', plateRow({ img: url }));
    });
    $('#ev-piece-add', modal).addEventListener('click', () =>
        $('#ev-pieces', modal).insertAdjacentHTML('beforeend', pieceRow()));

    modal.addEventListener('click', (e) => {
        if (e.target.closest('[data-plate-del]')) e.target.closest('.ev-plate').remove();
        if (e.target.closest('[data-piece-del]')) e.target.closest('.ev-piece').remove();
    });

    const err = modalChrome(modal, '#ev-cancel', '#ev-err');
    $('#ev-save', modal).addEventListener('click', async () => {
        const body = {
            venue: event?.venue || venueId,
            title: $('#ev-title', modal).value.trim(),
            dates: $('#ev-dates', modal).value.trim(),
            statement: $('#ev-statement', modal).value.trim(),
            image: $('#ev-img', modal).value.trim(),
            imageMobile: $('#ev-img-m', modal).value.trim(),
            alt: $('#ev-alt', modal).value.trim(),
            cta: $('#ev-cta', modal).value.trim(),
            secNote: $('#ev-secnote', modal).value.trim(),
            closing: $('#ev-closing', modal).value.trim(),
            current: $('#ev-current', modal).checked,
            images: [...modal.querySelectorAll('.ev-plate')].map(row => ({
                img: row.querySelector('.ev-plate-img').value.trim(),
                alt: row.querySelector('.ev-plate-alt').value.trim(),
                name: row.querySelector('.ev-plate-name').value.trim(),
                tag: row.querySelector('.ev-plate-tag').value.trim(),
            })).filter(i => i.img),
            curated: [...modal.querySelectorAll('.ev-piece')].map(row => ({
                cat: row.querySelector('.ev-piece-cat').value.trim(),
                name: row.querySelector('.ev-piece-name').value.trim(),
            })).filter(c => c.cat && c.name),
        };
        if (!body.title) return err.textContent = 'A title is required';
        try {
            if (event) await api(`events/${event.id}`, 'PUT', body);
            else await api('events', 'POST', body);
            closeModal();
            toast(event ? 'Show saved' : 'Show added');
            renderEvents();
        } catch (error_) { err.textContent = error_.message; }
    });
}
