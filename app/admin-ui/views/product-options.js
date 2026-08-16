/**
 * Vayu Admin — the options editor inside the product modal.
 *
 * Two panels that stay in step with each other:
 *
 *   Options        the pickers the shopper will see — "Colour" as a rail of
 *                  swatches, "Size" as a rail of labels. Empty by default,
 *                  which is what keeps the storefront clean: a product only
 *                  grows a size row once someone here says it has sizes.
 *
 *   Combinations   one line per crossing of those options, carrying the
 *                  price, the stock and (for a colour) the photograph. This
 *                  is generated, never typed: the shopkeeper's job is to
 *                  fill in numbers, not to remember that eleven patterns
 *                  times seven sizes is seventy-seven rows.
 *
 * Regeneration is a merge, not a reset. Rows are matched on the combo key,
 * so renaming an option or inserting a size in the middle does not throw
 * away the stock counts already entered against the combinations that
 * survive — losing those to a stray keystroke is the failure mode that
 * makes people stop trusting a grid like this.
 */

import { $, esc } from '../lib/dom.js';
import { pickImage } from '../lib/media.js';
// ../shared/options.js is app/lib/options.js, re-served through the admin
// gate — the same module the product page imports, so the panel cannot write
// a combo key in a format the storefront then fails to match.
import { comboKey, comboLabel, expandCombos } from '../shared/options.js';

/* Presets, so the common cases are one click rather than fourteen fields. */
const PRESETS = {
    size: {
        name: 'Size', kind: 'text',
        values: ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'].map(label => ({ label, swatch: '', heading: '' })),
    },
    colour: {
        name: 'Colour', kind: 'swatch',
        values: [{ label: 'Natural', swatch: '#EFE7DC', heading: 'Solid' }],
    },
};

/**
 * Mount the editor into `host`.
 *
 * @param host      the container element inside the open modal
 * @param product   the product being edited (or the blank template)
 * @returns {{ read: () => ({ options, variants }) }}
 */
export function mountOptionsEditor(host, product) {
    const options = structuredClone(product.options || []);

    /**
     * Every option and value gets an identity that is not its name.
     *
     * The combination the *server* stores is keyed by labels, because that
     * is what has to survive a page reload and match what the storefront
     * looks up. But inside this editor, keying on labels means correcting a
     * typo in "Dusty pink" re-keys every combination under it and drops the
     * stock already typed against them. These uids are local, never sent,
     * and exist purely so a rename is a rename rather than a delete.
     */
    let uidSeq = 0;
    const identify = (o) => {
        o.uid ||= `o${++uidSeq}`;
        for (const v of o.values) v.uid ||= `v${++uidSeq}`;
        return o;
    };
    options.forEach(identify);

    /** The uid-space twin of comboKey — same crossing, stable under renames. */
    const uidKey = (live, chosen) => live
        .map(o => `${o.uid}:${o.values.find(v => v.label === chosen[o.name])?.uid}`)
        .join('|');

    // Rows already filled in, held by uid so they outlive a relabelling.
    // The objects here are the same ones the inputs mutate, so an edit lands
    // in this map without a second write path.
    const held = new Map();

    let variants = structuredClone(product.variants || []);

    host.innerHTML = `
        <div class="opt-editor">
            <div class="opt-groups" id="opt-groups"></div>
            <div class="opt-actions">
                <button type="button" class="btn small" data-add="blank">+ Add option</button>
                <button type="button" class="btn small" data-add="size">+ Size</button>
                <button type="button" class="btn small" data-add="colour">+ Colour</button>
            </div>
            <div class="help">
                Nothing here means no pickers on the product page — the piece just
                sells at its base price and stock.
            </div>
            <div class="opt-combos" id="opt-combos"></div>
        </div>`;

    const groupsEl = $('#opt-groups', host);
    const combosEl = $('#opt-combos', host);

    /* ---------- options ---------- */

    function drawGroups() {
        groupsEl.innerHTML = options.map((o, i) => `
            <div class="opt-group" data-o="${i}">
                <div class="opt-group-head">
                    <input class="opt-name" data-f="name" value="${esc(o.name)}" placeholder="Option name (e.g. Size)">
                    <select data-f="kind">
                        <option value="text" ${o.kind === 'text' ? 'selected' : ''}>Labels</option>
                        <option value="swatch" ${o.kind === 'swatch' ? 'selected' : ''}>Swatches</option>
                    </select>
                    <button type="button" class="btn small danger" data-act="rm-opt">Remove</button>
                </div>
                <div class="opt-values">
                    ${o.values.map((v, j) => valueRow(o, v, j)).join('')}
                </div>
                <button type="button" class="btn small" data-act="add-val">+ Add ${esc(o.name || 'value')}</button>
            </div>`).join('');
    }

    // A swatch value gets a colour well and an image button; a label value
    // gets neither, because "L" has nothing to show.
    const valueRow = (o, v, j) => `
        <div class="opt-value" data-v="${j}">
            ${o.kind === 'swatch' ? `
                <span class="opt-chip" style="${esc(swatchStyle(v.swatch))}"></span>
                <input class="opt-swatch" data-f="swatch" value="${esc(v.swatch)}"
                       placeholder="#colour or image" title="A CSS colour, or an image for a pattern">
                <button type="button" class="btn small" data-act="pick-swatch">Image…</button>
                <input class="opt-heading" data-f="heading" value="${esc(v.heading)}"
                       placeholder="Group (e.g. Stripes)" title="Optional heading that bands the rail">
            ` : ''}
            <input class="opt-label" data-f="label" value="${esc(v.label)}" placeholder="Label">
            <button type="button" class="btn small danger" data-act="rm-val">✕</button>
        </div>`;

    // An image swatch is a background, a colour swatch is a fill. Anything
    // unrecognised falls back to a neutral so the row never renders blank.
    //
    // Returns raw CSS: one caller assigns it to .style.cssText, where HTML
    // escaping would put a literal `&quot;` into the declaration. Escaping
    // belongs at the point of interpolation, and the template above does it.
    const swatchStyle = (s) => s && /[/.]/.test(s)
        ? `background-image:url(${s});background-size:cover;background-position:center`
        : `background:${s || '#E5E0D6'}`;

    groupsEl.addEventListener('input', (e) => {
        const group = e.target.closest('[data-o]');
        const value = e.target.closest('[data-v]');
        const field = e.target.dataset.f;
        if (!group || !field) return;

        const o = options[Number(group.dataset.o)];
        if (value) {
            o.values[Number(value.dataset.v)][field] = e.target.value;
            if (field === 'swatch') {
                value.querySelector('.opt-chip').style.cssText = swatchStyle(e.target.value);
            }
        } else {
            o[field] = e.target.value;
        }
    });

    // Regeneration happens on commit, not on keystroke. Redrawing the grid
    // per character would rebuild seventy-odd rows while someone types a
    // colour name, and would show them combinations for "D", "Du", "Dus".
    groupsEl.addEventListener('change', (e) => {
        const field = e.target.dataset.f;
        if (field === 'kind') {
            options[Number(e.target.closest('[data-o]').dataset.o)].kind = e.target.value;
            drawGroups();
            return;
        }
        // A swatch or heading is decoration; only a label or an option name
        // changes which combinations exist.
        if (field === 'label' || field === 'name') drawCombos();
    });

    groupsEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const group = btn.closest('[data-o]');
        const o = options[Number(group.dataset.o)];

        if (btn.dataset.act === 'rm-opt') options.splice(Number(group.dataset.o), 1);
        else if (btn.dataset.act === 'add-val') {
            o.values.push({ label: '', swatch: '', heading: '', uid: `v${++uidSeq}` });
        }
        else if (btn.dataset.act === 'rm-val') {
            o.values.splice(Number(btn.closest('[data-v]').dataset.v), 1);
        } else if (btn.dataset.act === 'pick-swatch') {
            const url = await pickImage();
            if (!url) return;
            o.values[Number(btn.closest('[data-v]').dataset.v)].swatch = url;
        }
        drawGroups();
        drawCombos();
    });

    $('.opt-actions', host).addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-add]');
        if (!btn) return;
        const preset = PRESETS[btn.dataset.add];
        // Adding "Size" twice would collide on the option name, so the
        // second click focuses the existing group instead of duplicating it.
        const existing = preset && options.find(o => o.name.toLowerCase() === preset.name.toLowerCase());
        if (existing) {
            $(`.opt-group[data-o="${options.indexOf(existing)}"] .opt-name`, host)?.focus();
            return;
        }

        options.push(identify(preset
            ? structuredClone(preset)
            : { name: '', kind: 'text', values: [{ label: '', swatch: '', heading: '' }] }));
        drawGroups();
        drawCombos();
    });

    /* ---------- combinations ---------- */

    /** Only options that are fully named and have named values can be crossed. */
    const usableOptions = () => options
        .filter(o => o.name.trim())
        .map(o => ({ ...o, values: o.values.filter(v => v.label.trim()) }))
        .filter(o => o.values.length);

    function drawCombos() {
        const live = usableOptions();
        if (!live.length) {
            // No options: fall back to the flat list this editor replaced, so
            // a product that just needs "Small / Large" is still editable.
            drawFlatVariants();
            return;
        }

        const rows = expandCombos(live);

        // Two ways in. `held` is how a row survives a rename within this
        // session; the label map is how it survives the round trip from the
        // database, where uids do not exist. It also carries a legacy flat
        // variant ("Small") onto its new single-option row of the same name,
        // so converting an old product keeps its counts.
        const loaded = new Map(variants.map(v => [v.combo || v.label, v]));

        variants = rows.map(chosen => {
            const key = comboKey(live, chosen);
            const uid = uidKey(live, chosen);
            const label = comboLabel(live, chosen);
            const kept = held.get(uid) ?? loaded.get(key) ?? loaded.get(label);

            const row = {
                label,
                combo: key,
                uid,
                price: kept?.price ?? '',
                stock: kept?.stock ?? 0,
                image: kept?.image ?? '',
            };
            held.set(uid, row);
            return row;
        });

        const inStock = variants.filter(v => Number(v.stock) > 0).length;
        combosEl.innerHTML = `
            <div class="opt-combos-head">
                <strong>Combinations</strong>
                <span class="help">${variants.length} total · ${inStock} in stock</span>
                <button type="button" class="btn small" data-act="fill-stock">Set all stock…</button>
            </div>
            <div class="opt-combo-rows">
                ${variants.map((v, i) => `
                    <div class="opt-combo" data-i="${i}">
                        <span class="opt-combo-label">${esc(v.label)}</span>
                        <input data-f="price" type="number" min="0" value="${v.price ?? ''}" placeholder="Price ₹">
                        <input data-f="stock" type="number" min="0" value="${v.stock ?? 0}" placeholder="Stock">
                        <button type="button" class="btn small" data-act="pick-img"
                            title="${v.image ? 'Change photo shown for this combination' : 'Photo for this combination'}">
                            ${v.image ? '🖼 change' : '🖼'}
                        </button>
                    </div>`).join('')}
            </div>
            <div class="help">Leave a price empty to use the base price. Stock 0 shows as sold out.</div>`;
    }

    /** The pre-options shape: labelled rows with no axes behind them. */
    function drawFlatVariants() {
        const flat = variants.filter(v => !v.combo);
        variants = flat;
        if (!flat.length) {
            combosEl.innerHTML = '';
            return;
        }

        combosEl.innerHTML = `
            <div class="opt-combos-head"><strong>Variants</strong>
                <span class="help">This product uses the older flat list. Add an option above to convert it to a grid.</span></div>
            <div class="opt-combo-rows">
                ${flat.map((v, i) => `
                    <div class="opt-combo" data-i="${i}">
                        <input data-f="label" value="${esc(v.label)}" placeholder="Label">
                        <input data-f="price" type="number" min="0" value="${v.price ?? ''}" placeholder="Price ₹">
                        <input data-f="stock" type="number" min="0" value="${v.stock ?? 0}" placeholder="Stock">
                    </div>`).join('')}
            </div>`;
    }

    combosEl.addEventListener('input', (e) => {
        const row = e.target.closest('[data-i]');
        if (row && e.target.dataset.f) variants[Number(row.dataset.i)][e.target.dataset.f] = e.target.value;
    });

    combosEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;

        if (btn.dataset.act === 'fill-stock') {
            const n = prompt('Set stock for every combination to:', '10');
            if (n === null) return;
            for (const v of variants) v.stock = Math.max(0, Math.round(Number(n) || 0));
            drawCombos();
            return;
        }
        if (btn.dataset.act === 'pick-img') {
            const url = await pickImage();
            if (!url) return;
            variants[Number(btn.closest('[data-i]').dataset.i)].image = url;
            drawCombos();
        }
    });

    drawGroups();
    drawCombos();

    return {
        /**
         * What the save button sends. Read fresh from the arrays rather than
         * from the DOM, so a half-typed row that was never blurred is still
         * included — and empties are dropped here, not on the server.
         */
        read() {
            const live = usableOptions();
            return {
                // uids are an editor-local device; the server keys on labels
                // and would only have to strip them back out again.
                options: live.map(o => ({
                    name: o.name.trim(),
                    kind: o.kind,
                    values: o.values.map(v => ({
                        label: v.label.trim(),
                        swatch: v.swatch || '',
                        heading: v.heading || '',
                    })),
                })),
                variants: variants
                    .filter(v => String(v.label || '').trim())
                    .map(v => ({
                        label: String(v.label).trim(),
                        combo: v.combo || '',
                        image: v.image || '',
                        price: v.price === '' || v.price == null ? null : Math.max(0, Number(v.price) || 0),
                        stock: Math.max(0, Math.round(Number(v.stock) || 0)),
                    })),
            };
        },
    };
}
