/**
 * Vayu Admin — running the shop: storefront content, team access, and
 * store settings (including backups and the account password).
 */

import { $, viewEl, esc, dateFmt, toast, guard, openModal, closeModal, modalChrome } from '../lib/dom.js';
import { api, state } from '../lib/api.js';
import { pickImage } from '../lib/media.js';

/* ================= storefront content ================= */

const BLANK_SLIDE = { img: '', alt: '', title: '', ctaText: '', ctaHref: '' };

function slideCard(s, i, total) {
    const preview = s.img
        ? `<img src="${esc(s.img)}" alt="">`
        : '<div class="slide-img-empty">No image</div>';
    // A slide with neither heading nor button becomes a poster: the whole
    // image is one link. Say so, rather than leaving it to be discovered.
    const posterNote = !s.title && !s.ctaText
        ? '<div class="help">Poster slide — the whole image links to the button link above.</div>'
        : '';

    return `
        <div class="slide-row" data-i="${i}">
            <div class="slide-img">
                ${preview}
                <div class="slide-img-actions">
                    <button type="button" class="btn small" data-act="pick">Upload</button>
                </div>
            </div>
            <div class="slide-fields">
                <div class="slide-head">
                    <b>Slide ${i + 1}</b>
                    <div class="slide-move">
                        <button type="button" class="btn small" data-act="up" ${i === 0 ? 'disabled' : ''} title="Move up">↑</button>
                        <button type="button" class="btn small" data-act="down" ${i === total - 1 ? 'disabled' : ''} title="Move down">↓</button>
                        <button type="button" class="btn small danger" data-act="rm" title="Remove slide">✕</button>
                    </div>
                </div>
                <div class="field"><label>Image URL</label>
                    <input data-f="img" value="${esc(s.img)}" placeholder="/assets/images/hero.jpg"></div>
                <div class="field"><label>Heading</label>
                    <input data-f="title" value="${esc(s.title)}" placeholder="Empty = image-only poster slide"></div>
                <div class="slide-two">
                    <div class="field"><label>Button text</label>
                        <input data-f="ctaText" value="${esc(s.ctaText)}" placeholder="Empty = no button"></div>
                    <div class="field"><label>Button link</label>
                        <input data-f="ctaHref" value="${esc(s.ctaHref)}" placeholder="/pages/collection.html"></div>
                </div>
                ${posterNote}
                <div class="field"><label>Image description (for screen readers)</label>
                    <input data-f="alt" value="${esc(s.alt)}" placeholder="Vayu Autumn / Winter Campaign 2026"></div>
            </div>
        </div>`;
}

export async function renderContent() {
    const { content } = await api('content');
    let slides = structuredClone(content.heroSlides || []);

    viewEl.innerHTML = `
        <div class="card" style="max-width:760px;margin-bottom:16px">
            <h2>Announcement bar</h2>
            <p class="sub">A slim dark strip across the top of every page. Leave empty to hide it.</p>
            <div class="field">
                <input id="ct-ann" value="${esc(content.announcement)}" placeholder="e.g. Free shipping above ₹5,000 · Diwali dispatch till 18 Oct">
            </div>
        </div>
        <div class="card" style="max-width:760px">
            <h2>Home hero carousel</h2>
            <p class="sub">The full-width slideshow at the top of the home page. Each slide has its own
                image, heading, button text and button link — leave the heading and button empty to show
                the image alone as one big clickable poster.</p>
            <div id="ct-slides" class="slide-editor"></div>
            <button class="btn small" id="ct-slide-add" style="margin-top:12px">+ Add slide</button>
            <div class="modal-actions">
                <div class="form-error" id="ct-err"></div>
                <button class="btn primary" id="ct-save">Save content</button>
            </div>
        </div>`;

    const slidesEl = $('#ct-slides');
    const draw = () => {
        slidesEl.innerHTML = slides.map((s, i) => slideCard(s, i, slides.length)).join('')
            || '<div class="empty">No slides — the home page will show its built-in hero.</div>';
    };
    draw();

    // Typing updates the model in place without redrawing, so the caret
    // never jumps out of the field being edited.
    slidesEl.addEventListener('input', (e) => {
        const row = e.target.closest('[data-i]');
        if (row && e.target.dataset.f) slides[Number(row.dataset.i)][e.target.dataset.f] = e.target.value;
    });

    slidesEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const i = Number(btn.closest('[data-i]').dataset.i);

        switch (btn.dataset.act) {
            case 'pick': {
                const url = await pickImage();
                if (!url) return;
                slides[i].img = url;
                break;
            }
            case 'rm': slides.splice(i, 1); break;
            case 'up': if (i > 0) [slides[i - 1], slides[i]] = [slides[i], slides[i - 1]]; break;
            case 'down': if (i < slides.length - 1) [slides[i + 1], slides[i]] = [slides[i], slides[i + 1]]; break;
        }
        draw();
    });

    $('#ct-slide-add').addEventListener('click', () => {
        slides.push({ ...BLANK_SLIDE });
        draw();
    });

    $('#ct-save').addEventListener('click', async () => {
        const err = $('#ct-err');
        err.textContent = '';
        if (slides.some(s => !String(s.img).trim())) {
            err.textContent = 'Every slide needs an image (or remove the empty slide).';
            return;
        }
        try {
            const r = await api('content', 'PUT', {
                announcement: $('#ct-ann').value,
                heroSlides: slides,
            });
            slides = structuredClone(r.content.heroSlides || []);
            draw();
            toast('Saved — refresh the home page to see it');
        } catch (error_) { err.textContent = error_.message; }
    });
}

/* ================= team ================= */

const ROLES = ['owner', 'manager', 'staff'];

function addMemberModal(onDone) {
    const modal = openModal(`
        <h2>Add team member</h2>
        <div class="form-grid">
            <div class="field"><label>Name</label><input id="tm-name"></div>
            <div class="field"><label>Role</label><select id="tm-role">
                ${ROLES.slice().reverse().map(r => `<option value="${r}">${r}</option>`).join('')}</select></div>
            <div class="field full"><label>Email</label><input id="tm-email" type="email"></div>
            <div class="field full"><label>Temporary password (min 8 chars)</label><input id="tm-pass">
                <div class="help">They'll be asked to change it on first sign-in.</div></div>
        </div>
        <div class="modal-actions">
            <div class="form-error" id="tm-err"></div>
            <button class="btn" id="tm-cancel">Cancel</button>
            <button class="btn primary" id="tm-save">Add member</button>
        </div>`, true);

    const err = modalChrome(modal, '#tm-cancel', '#tm-err');
    $('#tm-save', modal).addEventListener('click', async () => {
        try {
            await api('team', 'POST', {
                name: $('#tm-name', modal).value.trim(),
                email: $('#tm-email', modal).value.trim(),
                role: $('#tm-role', modal).value,
                password: $('#tm-pass', modal).value,
            });
            closeModal();
            toast('Member added');
            onDone();
        } catch (error_) { err.textContent = error_.message; }
    });
}

export async function renderTeam() {
    const { team } = await api('team');

    const rows = team.map(m => `
        <tr data-id="${m.id}">
            <td><b>${esc(m.name)}</b>${m.id === state.meId ? ' <span class="chip">you</span>' : ''}</td>
            <td>${esc(m.email)}</td>
            <td><select class="status-select" data-act="role">
                ${ROLES.map(r => `<option ${m.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
            <td>${dateFmt(m.createdAt)}</td>
            <td><button class="btn small danger" data-act="del">Remove</button></td>
        </tr>`).join('');

    viewEl.innerHTML = `
        <div class="toolbar">
            <div class="spacer"></div>
            <button class="btn primary" id="new-member">+ Add member</button>
        </div>
        <div class="card">
            <p class="sub" style="margin-top:0"><b>owner</b> — everything · <b>manager</b> — everything except team, settings &amp; backups · <b>staff</b> — orders, customers, outbox &amp; analytics only.</p>
            <div class="table-scroll"><table class="grid">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Since</th><th></th></tr></thead>
                <tbody id="team-rows">${rows}</tbody>
            </table></div>
        </div>`;

    $('#new-member').addEventListener('click', () => addMemberModal(renderTeam));

    const rowsEl = $('#team-rows');
    rowsEl.addEventListener('change', async (e) => {
        const sel = e.target.closest('select[data-act=role]');
        if (!sel) return;
        const id = sel.closest('tr').dataset.id;
        // On failure the row still shows the new value, so re-render to
        // put the select back to what the server actually has.
        if (!await guard(() => api(`team/${id}`, 'PUT', { role: sel.value }), 'Role updated')) renderTeam();
    });
    rowsEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act=del]');
        if (!btn) return;
        if (!confirm('Remove this member? Their sessions end immediately.')) return;
        const id = btn.closest('tr').dataset.id;
        if (await guard(() => api(`team/${id}`, 'DELETE'), 'Member removed')) renderTeam();
    });
}

/* ================= settings ================= */

function storeCard(s) {
    return `
        <div class="card">
            <h2>Store</h2>
            <div class="form-grid">
                <div class="field full"><label>Store name</label><input id="s-name" value="${esc(s.storeName)}"></div>
                <div class="field"><label>Free shipping above (₹)</label><input id="s-free" type="number" min="0" value="${s.freeShippingAbove}"></div>
                <div class="field"><label>Flat shipping (₹)</label><input id="s-flat" type="number" min="0" value="${s.shippingFlat}"></div>
                <div class="field"><label>Low-stock alert at</label><input id="s-low" type="number" min="0" value="${s.lowStockThreshold}"></div>
                <div class="field"><label>Store email</label><input id="s-email" value="${esc(s.storeEmail)}"></div>
                <div class="field full"><label>Store phone</label><input id="s-phone" value="${esc(s.storePhone)}"></div>
                <div class="field full"><label>Store address (appears on invoices)</label><input id="s-addr" value="${esc(s.storeAddress)}"></div>
            </div>
            <h2 style="margin-top:22px">Shipping zones</h2>
            <p class="sub">Rates by PIN prefix — first match wins; anything else uses the flat rate. Free-shipping threshold still applies.</p>
            <div id="s-zones" style="display:grid;gap:8px"></div>
            <button class="btn small" id="s-zone-add" style="margin-top:8px">+ Add zone</button>
            <h2 style="margin-top:22px">Payments</h2>
            <div class="form-grid">
                <div class="field full"><label>Provider</label><select id="s-pay">
                    <option value="cod" ${s.payment.provider !== 'razorpay' ? 'selected' : ''}>Record orders only (pay on delivery / offline)</option>
                    <option value="razorpay" ${s.payment.provider === 'razorpay' ? 'selected' : ''}>Razorpay (online payment)</option></select></div>
                <div class="field"><label>Razorpay Key ID</label><input id="s-rzp-id" value="${esc(s.payment.razorpayKeyId)}" placeholder="rzp_live_…"></div>
                <div class="field"><label>Razorpay Key Secret</label><input id="s-rzp-secret" type="password" value="${esc(s.payment.razorpayKeySecret)}"></div>
                <div class="field full"><div class="help">Razorpay only takes effect when both keys are filled in — until then checkout records the order for offline payment.</div></div>
            </div>
            <div class="modal-actions"><button class="btn primary" id="s-save">Save settings</button></div>
        </div>`;
}

function backupsCard(backups) {
    const rows = backups.map(b => `
        <div class="mini-row"><div class="grow"><div class="nm" style="font-weight:400">${esc(b.file)}</div></div>
            <div class="meta">${Math.round(b.size / 1024)} KB</div>
            <a class="btn small" href="/api/admin/backup/${encodeURIComponent(b.file)}">Download</a></div>`).join('');

    return `
        <div class="card" style="margin-top:16px">
            <h2>Backups</h2>
            <p class="sub">A copy of the whole database (products, orders, customers…) — one is taken automatically at every server start; the newest 20 are kept in admin/data/backups.</p>
            <div class="toolbar"><button class="btn primary" id="bk-now">Back up now</button></div>
            ${backups.length ? `<div class="mini-list">${rows}</div>` : '<div class="empty">No backups yet.</div>'}
        </div>`;
}

/** Zones are edited as a small repeating list, like variants and subs. */
function wireZones(settings) {
    const zones = structuredClone(settings.zones || []);
    const zonesEl = $('#s-zones');

    const draw = () => {
        zonesEl.innerHTML = zones.map((z, i) => `
            <div style="display:grid;grid-template-columns:1.2fr 1.5fr .8fr auto;gap:8px" data-i="${i}">
                <input placeholder="Zone name" value="${esc(z.name)}" data-f="name">
                <input placeholder="PIN prefixes, e.g. 11, 12, 40" value="${esc(Array.isArray(z.pinPrefixes) ? z.pinPrefixes.join(', ') : z.pinPrefixes)}" data-f="pinPrefixes">
                <input placeholder="Rate ₹" type="number" min="0" value="${z.rate}" data-f="rate">
                <button class="btn small danger" data-act="rm">✕</button>
            </div>`).join('') || '<div class="empty" style="padding:10px">No zones — flat rate applies everywhere.</div>';
    };
    draw();

    zonesEl.addEventListener('input', (e) => {
        const row = e.target.closest('[data-i]');
        if (row) zones[Number(row.dataset.i)][e.target.dataset.f] = e.target.value;
    });
    zonesEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act=rm]');
        if (btn) { zones.splice(Number(btn.closest('[data-i]').dataset.i), 1); draw(); }
    });
    $('#s-zone-add').addEventListener('click', () => {
        zones.push({ name: '', pinPrefixes: '', rate: 150 });
        draw();
    });

    return zones;
}

export async function renderSettings() {
    const isOwner = state.me?.role === 'owner';

    // Store settings and backups are owner-only; a manager or staff member
    // still gets this page for their own password.
    const settings = isOwner ? (await api('settings')).settings : null;
    const backups = isOwner ? (await api('backup')).backups : [];

    const accountCard = `
        <div class="card">
            <h2>Account</h2>
            <p class="sub">Signed in as ${esc(state.me?.email || '')} (${esc(state.me?.role || '')})</p>
            <div class="form-grid">
                <div class="field full"><label>Current password</label><input id="pw-cur" type="password" autocomplete="current-password"></div>
                <div class="field full"><label>New password (min 8 chars)</label><input id="pw-new" type="password" autocomplete="new-password"></div>
            </div>
            <div class="modal-actions">
                <div class="form-error" id="pw-err"></div>
                <button class="btn primary" id="pw-save">Change password</button>
            </div>
        </div>`;

    viewEl.innerHTML = `
        ${state.me?.mustChangePassword ? `<div class="card" style="border-color:var(--warning);margin-bottom:16px">
            <b>Change your password.</b> You're still on the first-run password — set a new one below.</div>` : ''}
        <div class="dash-grid-2">
            ${settings ? storeCard(settings) : ''}
            ${accountCard}
        </div>
        ${settings ? backupsCard(backups) : ''}`;

    if (settings) {
        const zones = wireZones(settings);

        $('#s-save').addEventListener('click', () => guard(() => api('settings', 'PUT', {
            storeName: $('#s-name').value,
            freeShippingAbove: Number($('#s-free').value),
            shippingFlat: Number($('#s-flat').value),
            lowStockThreshold: Number($('#s-low').value),
            storeEmail: $('#s-email').value,
            storePhone: $('#s-phone').value,
            storeAddress: $('#s-addr').value,
            zones,
            payment: {
                provider: $('#s-pay').value,
                razorpayKeyId: $('#s-rzp-id').value.trim(),
                razorpayKeySecret: $('#s-rzp-secret').value.trim(),
            },
        }), 'Settings saved'));

        $('#bk-now').addEventListener('click', async () => {
            try {
                const r = await api('backup', 'POST', {});
                toast(`Backed up: ${r.file}`);
                renderSettings();
            } catch (err) { toast(err.message, true); }
        });
    }

    $('#pw-save').addEventListener('click', async () => {
        const err = $('#pw-err');
        err.textContent = '';
        try {
            await api('password', 'POST', { current: $('#pw-cur').value, next: $('#pw-new').value });
            toast('Password changed');
            state.me.mustChangePassword = false;
            $('#pw-cur').value = '';
            $('#pw-new').value = '';
        } catch (error_) { err.textContent = error_.message; }
    });
}
