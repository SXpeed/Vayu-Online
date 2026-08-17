/**
 * Vayu Admin — the detail accordion editor inside the product modal.
 *
 * The five sections a shopper opens on the product page: Description,
 * Dimensions, Materials & Origin, Care Instructions, Shipping & Returns.
 * Description already had a field of its own in the product form and stays
 * there; the other four are here.
 *
 * Two shapes, because the four are two kinds of thing:
 *
 *   spec rows   Dimensions and Materials & Origin are label/value pairs, and
 *               which pairs make sense differs per piece — a saree has a
 *               length and a fall, a chair has a seat height. So they are
 *               typed rows rather than fixed fields, with a starter set one
 *               click away for the common cases.
 *
 *   profiles    Shipping & Returns is shop policy. Re-typing the same four
 *               sentences against every product is how a returns window ends
 *               up saying 7 days on one page and 14 on the next, so it is
 *               chosen from a saved list and edited in one place.
 *
 * Every section is optional. Leaving one empty hides it on the storefront
 * rather than printing a placeholder, which is the whole point of the
 * exercise: the page used to swear that every object in the shop was 32 cm
 * wide and weighed 2.4 kg.
 */

import { $, esc, toast } from '../lib/dom.js';
import { api } from '../lib/api.js';

/* The rows most pieces want, so the common case is one click not six. */
const STARTERS = {
    dimensions: ['Length', 'Width', 'Height', 'Weight'],
    materials: ['Material', 'Origin'],
};

const SECTIONS = [
    { key: 'dimensions', title: 'Dimensions', hint: 'e.g. Length · 32 cm' },
    { key: 'materials', title: 'Materials & Origin', hint: 'e.g. Origin · Made in India' },
];

/**
 * Mount the editor into `host`.
 *
 * @param host      the container element inside the open modal
 * @param product   the product being edited (or the blank template)
 * @param presets   the shop's shipping profiles, as the products list sent them
 * @returns {{ read: () => ({ care, dimensions, materials, shippingPreset }) }}
 */
export function mountDetailsEditor(host, product, presets = []) {
    // Cloned, so backing out of the modal leaves the loaded product untouched.
    const rows = {
        dimensions: structuredClone(product.dimensions || []),
        materials: structuredClone(product.materials || []),
    };
    // Local, mutable copy of the profile list: adding one from inside this
    // modal should appear in the dropdown without reloading the screen.
    let profiles = structuredClone(presets);
    let chosenPreset = product.shippingPreset || '';

    host.innerHTML = `
        ${SECTIONS.map(s => `
            <div class="det-section" data-section="${s.key}">
                <div class="det-head">
                    <strong>${s.title}</strong>
                    <span class="help">${s.hint}</span>
                    <button type="button" class="btn small" data-act="starter">Add usual rows</button>
                    <button type="button" class="btn small" data-act="add">+ Row</button>
                </div>
                <div class="det-rows"></div>
            </div>`).join('')}

        <div class="det-section">
            <div class="det-head"><strong>Care Instructions</strong>
                <span class="help">Left empty, the section is hidden on the product page.</span></div>
            <textarea id="d-care" placeholder="Wipe with a soft dry cloth…">${esc(product.care || '')}</textarea>
        </div>

        <div class="det-section">
            <div class="det-head"><strong>Shipping &amp; Returns</strong>
                <span class="help">Saved profiles, shared by every product that uses them.</span>
                <button type="button" class="btn small" data-act="new-preset">+ New profile</button>
                <button type="button" class="btn small" data-act="edit-preset">Edit this one</button>
            </div>
            <select id="d-ship"></select>
            <div class="det-preview" id="d-ship-preview"></div>
        </div>`;

    /* ---------- spec rows ---------- */

    const rowsEl = (key) => $(`.det-section[data-section="${key}"] .det-rows`, host);

    function drawRows(key) {
        const list = rows[key];
        rowsEl(key).innerHTML = list.length
            ? list.map((r, i) => `
                <div class="det-row" data-i="${i}">
                    <input data-f="label" value="${esc(r.label)}" placeholder="Label">
                    <input data-f="value" value="${esc(r.value)}" placeholder="Value">
                    <button type="button" class="btn small danger" data-act="rm">✕</button>
                </div>`).join('')
            : '<div class="help">No rows — this section stays hidden on the product page.</div>';
    }

    for (const s of SECTIONS) drawRows(s.key);

    // Held on the array, not read back off the DOM, so a row typed but never
    // blurred is still there when Save is pressed.
    host.addEventListener('input', (e) => {
        const section = e.target.closest('.det-section')?.dataset.section;
        const row = e.target.closest('.det-row');
        if (!section || !row || !e.target.dataset.f) return;
        rows[section][Number(row.dataset.i)][e.target.dataset.f] = e.target.value;
    });

    host.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const key = btn.closest('.det-section')?.dataset.section;
        const act = btn.dataset.act;

        if (act === 'rm' && key) {
            rows[key].splice(Number(btn.closest('.det-row').dataset.i), 1);
            drawRows(key);
        } else if (act === 'add' && key) {
            rows[key].push({ label: '', value: '' });
            drawRows(key);
            // Focus the row just added — otherwise "+ Row" appears to do
            // nothing until you notice the empty pair at the bottom.
            [...rowsEl(key).querySelectorAll('.det-row input')].at(-2)?.focus();
        } else if (act === 'starter' && key) {
            // Only the ones not already present, so a second click on a
            // half-filled section tops it up instead of duplicating it.
            const have = new Set(rows[key].map(r => r.label.trim().toLowerCase()));
            for (const label of STARTERS[key]) {
                if (!have.has(label.toLowerCase())) rows[key].push({ label, value: '' });
            }
            drawRows(key);
        } else if (act === 'new-preset') {
            await editPreset(null);
        } else if (act === 'edit-preset') {
            const current = profiles.find(x => x.id === chosenPreset) || profiles[0];
            if (current) await editPreset(current);
        }
    });

    /* ---------- shipping profiles ---------- */

    const shipEl = $('#d-ship', host);
    const previewEl = $('#d-ship-preview', host);

    function drawShipping() {
        const defaultName = profiles[0]?.name;
        shipEl.innerHTML = [
            `<option value="">${defaultName
                ? `Shop default — ${esc(defaultName)}` : 'Shop default'}</option>`,
            ...profiles.map(p =>
                `<option value="${esc(p.id)}" ${chosenPreset === p.id ? 'selected' : ''}>${esc(p.name)}</option>`),
        ].join('');

        // Show what the shopper will actually read, including when the
        // choice is "shop default" and the text comes from elsewhere.
        const shown = profiles.find(x => x.id === chosenPreset) || profiles[0];
        previewEl.textContent = shown?.body || 'No profiles yet — the section will be hidden.';
    }
    drawShipping();

    shipEl.addEventListener('change', () => {
        chosenPreset = shipEl.value;
        drawShipping();
    });

    /**
     * Add or rename a profile without leaving the product.
     *
     * Deliberately a prompt pair rather than a nested modal: openModal()
     * replaces #modal-root wholesale, so opening a second one here would
     * discard the half-filled product behind it.
     */
    async function editPreset(preset) {
        const name = prompt(preset ? 'Profile name:' : 'Name for the new profile:',
            preset?.name || '');
        if (name === null || !name.trim()) return;

        const body = prompt('Shipping & returns text shown on the product page:',
            preset?.body || '');
        if (body === null || !body.trim()) return;

        try {
            const payload = { name: name.trim(), body: body.trim() };
            const saved = preset
                ? await api(`shipping-presets/${preset.id}`, 'PUT', payload)
                : await api('shipping-presets', 'POST', payload);

            const row = saved.preset;
            const at = profiles.findIndex(x => x.id === row.id);
            if (at === -1) profiles.push(row); else profiles[at] = row;
            chosenPreset = row.id;

            drawShipping();
            toast(preset ? 'Profile saved' : 'Profile added');
        } catch (err) {
            toast(err.message, true);
        }
    }

    return {
        /** What the product's save button folds into its body. */
        read() {
            const clean = (list) => list
                .map(r => ({ label: r.label.trim(), value: r.value.trim() }))
                .filter(r => r.label);
            return {
                care: $('#d-care', host).value.trim(),
                dimensions: clean(rows.dimensions),
                materials: clean(rows.materials),
                shippingPreset: chosenPreset,
            };
        },
    };
}
