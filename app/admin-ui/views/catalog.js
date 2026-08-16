/**
 * Vayu Admin — the things you publish: products, categories, journal.
 */

import { $, viewEl, esc, money, timeFmt, toast, guard, openModal, closeModal, modalChrome } from '../lib/dom.js';
import { api, state, loadCategories, catTitle, slugToLabel } from '../lib/api.js';
import { pickImage, pickTextFile } from '../lib/media.js';
import { mountOptionsEditor } from './product-options.js';

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
function bulkPayload(choice, ids) {
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
    if (choice === 'delete') {
        return confirm(`Delete ${ids.length} product(s)? This cannot be undone.`) ? { ids, action: 'delete' } : null;
    }
    return null;
}

export async function renderProducts() {
    const [{ products, settings }] = await Promise.all([api('products'), loadCategories()]);
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
    $('#new-prod').addEventListener('click', () => productEditor(null));

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
        const payload = bulkPayload(choice, [...selected]);
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

        if (btn.dataset.act === 'edit') return productEditor(prod);
        if (btn.dataset.act === 'dup') {
            if (await guard(() => api(`products/${id}/duplicate`, 'POST', {}), 'Duplicated as draft')) renderProducts();
            return;
        }
        if (!confirm(`Delete "${prod.name}"? This cannot be undone.`)) return;
        if (await guard(() => api(`products/${id}`, 'DELETE'), 'Product deleted')) renderProducts();
    });
}

/* ---------- product editor ---------- */

const BLANK_PRODUCT = {
    name: '', description: '', price: '', compareAt: '', sku: '', stock: 10,
    status: 'active', isNew: true, img: '', gallery: [], categories: [],
    tags: [], variants: [], options: [], publishAt: null,
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

export function productEditor(prod) {
    const p = prod || BLANK_PRODUCT;
    let gallery = [...(p.gallery || [])];
    if (!gallery.length && p.img) gallery = [p.img];

    const modal = openModal(`
        <h2>${prod ? 'Edit product' : 'New product'}</h2>
        <div class="form-grid">
            <div class="field full"><label>Name</label><input id="p-name" value="${esc(p.name)}"></div>
            <div class="field full"><label>Description</label><textarea id="p-desc">${esc(p.description)}</textarea></div>
            <div class="field"><label>Price (₹)</label><input id="p-price" type="number" min="0" value="${p.price}"></div>
            <div class="field"><label>Compare-at price (₹)</label><input id="p-compare" type="number" min="0" value="${p.compareAt ?? ''}" placeholder="optional"></div>
            <div class="field"><label>SKU</label><input id="p-sku" value="${esc(p.sku)}"></div>
            <div class="field"><label>Stock</label><input id="p-stock" type="number" min="0" value="${p.stock}"></div>
            <div class="field"><label>Status</label><select id="p-status">
                ${STATUSES.map(s => `<option ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
            <div class="field"><label>Badge</label><label style="text-transform:none;letter-spacing:0;font-size:14px;display:flex;gap:8px;align-items:center;margin-top:8px">
                <input type="checkbox" id="p-new" ${p.isNew ? 'checked' : ''} style="width:auto"> Show “New” badge</label></div>
            <div class="field full"><label>Categories <span style="text-transform:none;letter-spacing:0">(a product can live in several)</span></label>
                <div class="cat-picker" id="p-cats">${categoryPicker(p.categories)}</div></div>
            <div class="field full"><label>Images <span style="text-transform:none;letter-spacing:0">(first = cover)</span></label>
                <div class="gallery-strip" id="p-gallery"></div>
                <div class="help">Click an image to make it the cover. Uploads land in /assets/images/uploads/.</div></div>
            <div class="field full"><label>Tags</label><input id="p-tags" value="${esc((p.tags || []).join(', '))}" placeholder="handloom, brass, gift"></div>
            <div class="field full"><label>Options <span style="text-transform:none;letter-spacing:0">(colour, size, finish — the pickers shown on the product page)</span></label>
                <div id="p-options"></div>
                <div class="help">With options, stock is tracked per combination and the base stock field is ignored.</div></div>
            <div class="field full"><label>Schedule publish <span style="text-transform:none;letter-spacing:0">(a draft goes live automatically at this time)</span></label>
                <input id="p-publish" type="datetime-local" value="${p.publishAt ? new Date(p.publishAt).toISOString().slice(0, 16) : ''}"></div>
        </div>
        <div class="modal-actions">
            <div class="form-error" id="p-err"></div>
            <button class="btn" id="p-cancel">Cancel</button>
            <button class="btn primary" id="p-save">${prod ? 'Save changes' : 'Create product'}</button>
        </div>`);

    /* ---- options and the combination grid ---- */
    const optionsEditor = mountOptionsEditor($('#p-options', modal), p);

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
            publishAt: $('#p-publish', modal).value || null,
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

export async function renderCategories() {
    const { categories, counts } = await api('categories');
    state.categories = categories;

    const cards = Object.entries(categories)
        .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0))
        .map(([slug, c]) => `
            <div class="card cat-card" data-slug="${slug}">
                <div class="cat-head">
                    <img src="${esc(c.curated)}" alt="">
                    <div class="grow"><h2 style="margin:0">${esc(c.title)}</h2>
                        <div class="slug">/${slug} · ${counts[slug] || 0} product(s)</div></div>
                </div>
                <div class="sub-list">${c.subs.map(s => `<span class="chip">${esc(s.label)}</span>`).join('')
                    || '<span class="slug">No sub-categories</span>'}</div>
                <div style="display:flex;gap:8px">
                    <button class="btn small" data-act="edit">Edit</button>
                    <button class="btn small danger" data-act="del">Delete</button>
                </div>
            </div>`).join('');

    viewEl.innerHTML = `
        <div class="toolbar">
            <div class="spacer"></div>
            <button class="btn primary" id="new-cat">+ New category</button>
        </div>
        <div class="cat-grid" id="cat-grid">${cards}</div>`;

    $('#new-cat').addEventListener('click', () => categoryEditor(null));
    $('#cat-grid').addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const slug = btn.closest('.cat-card').dataset.slug;

        if (btn.dataset.act === 'edit') return categoryEditor(slug);
        if (!confirm(`Delete category "${categories[slug].title}"?`)) return;
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

/* ================= journal ================= */

const JOURNAL_CATS = [
    ['craft', 'Craft & Heritage'], ['interiors', 'Interiors'],
    ['materials', 'Materials'], ['press', 'Press'],
];

export async function renderJournal() {
    const { stories } = await api('journal');

    const rows = stories.map(s => `
        <div class="mini-row" data-id="${s.id}">
            <img class="thumb" src="${esc(s.image)}" alt="">
            <div class="grow">
                <div class="nm">${esc(s.title)}${s.featured ? ' <span class="chip" style="color:var(--accent)">featured</span>' : ''}</div>
                <div class="meta">${esc(s.categoryLabel)} · ${esc(s.date)} · ${s.body?.length ? s.body.length + ' paragraph(s)' : 'no body yet'}</div>
            </div>
            <a class="btn small" href="/pages/journal-post.html?id=${s.id}" target="_blank" rel="noopener">View</a>
            <button class="btn small" data-act="edit">Edit</button>
            <button class="btn small danger" data-act="del">✕</button>
        </div>`).join('');

    viewEl.innerHTML = `
        <div class="toolbar">
            <div class="spacer"></div>
            <button class="btn primary" id="new-story">+ New story</button>
        </div>
        <div class="card">
            ${stories.length ? `<div class="mini-list" id="story-list">${rows}</div>` : '<div class="empty">No stories yet.</div>'}
        </div>`;

    $('#new-story').addEventListener('click', () => storyEditor(null));
    $('#story-list')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const story = stories.find(x => x.id === btn.closest('[data-id]').dataset.id);

        if (btn.dataset.act === 'edit') return storyEditor(story);
        if (!confirm(`Delete "${story.title}"?`)) return;
        if (await guard(() => api(`journal/${story.id}`, 'DELETE'), 'Story deleted')) renderJournal();
    });
}

export function storyEditor(story) {
    const v = story || {
        title: '', excerpt: '', category: 'craft', categoryLabel: 'Craft & Heritage',
        date: '', image: '', readingTime: '4 min read', featured: false, body: [],
    };

    const modal = openModal(`
        <h2>${story ? 'Edit story' : 'New story'}</h2>
        <div class="form-grid">
            <div class="field full"><label>Title</label><input id="st-title" value="${esc(v.title)}"></div>
            <div class="field"><label>Category</label><select id="st-cat">
                ${JOURNAL_CATS.map(([slug, label]) => `<option value="${slug}" ${v.category === slug ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
            <div class="field"><label>Reading time</label><input id="st-read" value="${esc(v.readingTime)}"></div>
            <div class="field"><label>Display date</label><input id="st-date" value="${esc(v.date)}" placeholder="August 12, 2026"></div>
            <div class="field"><label>Featured</label><label style="text-transform:none;letter-spacing:0;font-size:14px;display:flex;gap:8px;align-items:center;margin-top:8px">
                <input type="checkbox" id="st-feat" ${v.featured ? 'checked' : ''} style="width:auto"> Lead story on the journal page</label></div>
            <div class="field full"><label>Cover image</label><div style="display:flex;gap:8px">
                <input id="st-img" value="${esc(v.image)}"><button type="button" class="btn small" id="st-img-up">Upload</button></div></div>
            <div class="field full"><label>Excerpt</label><textarea id="st-excerpt">${esc(v.excerpt)}</textarea></div>
            <div class="field full"><label>Body <span style="text-transform:none;letter-spacing:0">(paragraphs separated by a blank line)</span></label>
                <textarea id="st-body" style="min-height:180px">${esc((v.body || []).join('\n\n'))}</textarea></div>
        </div>
        <div class="modal-actions">
            <div class="form-error" id="st-err"></div>
            <button class="btn" id="st-cancel">Cancel</button>
            <button class="btn primary" id="st-save">${story ? 'Save changes' : 'Publish story'}</button>
        </div>`);

    $('#st-img-up', modal).addEventListener('click', async () => {
        const u = await pickImage(); if (u) $('#st-img', modal).value = u;
    });

    const err = modalChrome(modal, '#st-cancel', '#st-err');
    $('#st-save', modal).addEventListener('click', async () => {
        const cat = $('#st-cat', modal).value;
        const body = {
            title: $('#st-title', modal).value.trim(),
            category: cat,
            categoryLabel: JOURNAL_CATS.find(([slug]) => slug === cat)?.[1] || cat,
            readingTime: $('#st-read', modal).value,
            date: $('#st-date', modal).value
                || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            featured: $('#st-feat', modal).checked,
            image: $('#st-img', modal).value.trim(),
            excerpt: $('#st-excerpt', modal).value,
            body: $('#st-body', modal).value,
        };
        if (!body.title) return err.textContent = 'Title is required';
        try {
            if (story) await api(`journal/${story.id}`, 'PUT', body);
            else await api('journal', 'POST', body);
            closeModal();
            toast(story ? 'Story saved' : 'Story published');
            renderJournal();
        } catch (error_) { err.textContent = error_.message; }
    });
}
