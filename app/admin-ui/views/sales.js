/**
 * Vayu Admin — everything downstream of a sale: orders, customers,
 * coupons and review moderation.
 */

import { $, viewEl, esc, money, dateFmt, timeFmt, toast, guard, openModal, closeModal, modalChrome } from '../lib/dom.js';
import { api } from '../lib/api.js';

/* ================= orders ================= */

const ORDER_STATUSES = ['new', 'processing', 'shipped', 'delivered', 'cancelled'];

/** The expandable panel under an order row: lines, address, timeline. */
function orderDetail(o) {
    const lines = o.items.map(i => `
        <div class="order-line"><img class="thumb" src="${esc(i.img)}" alt="">
            <span>${esc(i.name)}${i.variant ? ` <span style="color:var(--muted)">· ${esc(i.variant)}</span>` : ''} × ${i.qty}</span>
            <span class="val">${money(i.price * i.qty)}</span></div>`).join('');

    const discount = o.discount
        ? `<div class="order-line"><span style="color:var(--good-text)">Coupon ${esc(o.coupon || '')}</span>
             <span class="val" style="color:var(--good-text)">− ${money(o.discount)}</span></div>`
        : '';

    const shipTo = [
        esc(o.customer.name),
        esc(o.customer.address),
        o.customer.city ? esc(o.customer.city) : '',
    ].filter(Boolean).join(', ')
        + (o.customer.pin ? ` — ${esc(o.customer.pin)}` : '')
        + (o.customer.phone ? ` · ${esc(o.customer.phone)}` : '');

    return `
        <tr class="detail-row" data-detail="${o.id}" hidden><td colspan="6">
            <div class="order-items">
                ${lines}${discount}
                <div class="order-line"><span style="color:var(--muted)">Shipping</span>
                    <span class="val">${o.shipping ? money(o.shipping) : 'Free'}</span></div>
                <div class="order-line"><b>Total</b><b class="val">${money(o.total)}</b></div>
            </div>
            <div style="font-size:13px;color:var(--body)"><b>Ship to:</b> ${shipTo}</div>
            <div class="timeline">${o.timeline.map(t =>
                `<div><b>${esc(t.status)}</b> · ${timeFmt(t.t)} — ${esc(t.note)}</div>`).join('')}</div>
        </td></tr>`;
}

export async function renderOrders() {
    const { orders } = await api('orders');
    let statusFilter = '';

    viewEl.innerHTML = `
        <div class="toolbar">
            <select id="o-status"><option value="">All statuses</option>
                ${ORDER_STATUSES.map(s => `<option>${s}</option>`).join('')}</select>
            <div class="spacer"></div>
            <a class="btn" href="/api/admin/export/orders.csv">Export CSV</a>
        </div>
        <div class="card"><div class="table-scroll"><table class="grid">
            <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th class="num">Total</th><th>Placed</th><th>Status</th></tr></thead>
            <tbody id="order-rows"></tbody>
        </table></div></div>`;

    const rowsEl = $('#order-rows');

    function draw() {
        const list = orders.filter(o => !statusFilter || o.status === statusFilter);
        rowsEl.innerHTML = list.length ? list.map(o => `
            <tr data-id="${o.id}" style="cursor:pointer">
                <td><b>${esc(o.number)}</b></td>
                <td>${esc(o.customer.name)}<div style="font-size:12px;color:var(--muted)">${esc(o.customer.email)}</div></td>
                <td>${o.items.reduce((n, i) => n + i.qty, 0)} item(s)</td>
                <td class="num">${money(o.total)}</td>
                <td>${timeFmt(o.createdAt)}</td>
                <td style="white-space:nowrap">
                    <select class="status-select" data-id="${o.id}">
                        ${ORDER_STATUSES.map(s => `<option ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
                    <a class="btn small" href="/api/admin/orders/${o.id}/invoice" target="_blank" rel="noopener"
                       title="Invoice" data-act="invoice">🧾</a></td>
            </tr>
            ${orderDetail(o)}`).join('')
            : `<tr><td colspan="6"><div class="empty">No orders${statusFilter ? ' with this status' : ' yet'}.</div></td></tr>`;
    }
    draw();

    $('#o-status').addEventListener('change', (e) => { statusFilter = e.target.value; draw(); });

    // Clicking the row expands it — but not when the click was meant for
    // the status dropdown or the invoice link inside it.
    rowsEl.addEventListener('click', (e) => {
        if (e.target.closest('select, [data-act=invoice]')) return;
        const tr = e.target.closest('tr[data-id]');
        if (!tr) return;
        const detail = rowsEl.querySelector(`tr[data-detail="${tr.dataset.id}"]`);
        if (detail) detail.hidden = !detail.hidden;
    });

    rowsEl.addEventListener('change', async (e) => {
        const sel = e.target.closest('select.status-select');
        if (!sel) return;
        const ok = await guard(
            () => api(`orders/${sel.dataset.id}`, 'PUT', { status: sel.value }),
            `Order marked ${sel.value}`,
        );
        if (ok) orders.find(o => o.id === sel.dataset.id).status = sel.value;
    });
}

/* ================= customers ================= */

export async function renderCustomers() {
    const { customers, subscribers, orders } = await api('customers');

    const customerRows = [...customers]
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .map(c => {
            const theirOrders = orders.filter(o => o.email === c.email).map(o => `
                <div class="mini-row"><div class="grow"><div class="nm">${esc(o.number)}</div>
                    <div class="meta">${timeFmt(o.createdAt)}</div></div>
                    <span class="status ${o.status}">${o.status}</span>
                    <div class="val">${money(o.total)}</div></div>`).join('')
                || '<div class="meta">None recorded.</div>';

            return `
            <tr data-id="${c.id}" style="cursor:pointer">
                <td><b>${esc(c.name)}</b>${(c.tags || []).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</td>
                <td>${esc(c.email)}<div style="font-size:12px;color:var(--muted)">${esc(c.phone)}</div></td>
                <td class="num">${c.ordersCount}</td>
                <td class="num">${money(c.totalSpent)}</td>
                <td>${dateFmt(c.lastSeen)}</td>
            </tr>
            <tr class="detail-row" data-detail="${c.id}" hidden><td colspan="5">
                <div style="display:grid;gap:10px">
                    <div><b style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)">Orders</b>
                        <div class="mini-list">${theirOrders}</div></div>
                    <div class="field"><label>Tags (comma-separated)</label>
                        <input data-f="tags" data-id="${c.id}" value="${esc((c.tags || []).join(', '))}" placeholder="vip, wholesale"></div>
                    <div class="field"><label>Notes</label>
                        <textarea data-f="notes" data-id="${c.id}" placeholder="Private notes about this customer">${esc(c.notes || '')}</textarea></div>
                    <div><button class="btn small primary" data-act="save-cust" data-id="${c.id}">Save notes &amp; tags</button></div>
                </div>
            </td></tr>`;
        }).join('');

    viewEl.innerHTML = `
        <div class="dash-grid">
            <div class="card">
                <h2>Customers</h2>
                <p class="sub">Built automatically from checkouts — click a row for orders, notes and tags.</p>
                <div class="table-scroll"><table class="grid">
                    <thead><tr><th>Name</th><th>Contact</th><th class="num">Orders</th><th class="num">Spent</th><th>Last seen</th></tr></thead>
                    <tbody id="cust-rows">${customerRows
                        || '<tr><td colspan="5"><div class="empty">No customers yet.</div></td></tr>'}</tbody>
                </table></div>
            </div>
            <div class="card">
                <h2>Newsletter subscribers</h2>
                <p class="sub">${subscribers.length} signup(s) from the storefront footer.
                    ${subscribers.length ? '<a class="link-btn" href="/api/admin/export/subscribers.csv" style="margin-left:8px">Export CSV</a>' : ''}</p>
                ${subscribers.length ? `<div class="mini-list">${[...subscribers].reverse().map(s => `
                    <div class="mini-row"><div class="grow"><div class="nm">${esc(s.email)}</div></div>
                    <div class="meta">${dateFmt(s.t)}</div></div>`).join('')}</div>`
                    : '<div class="empty">No subscribers yet.</div>'}
            </div>
        </div>`;

    const rows = $('#cust-rows');
    if (!rows) return;

    rows.addEventListener('click', async (e) => {
        const saveBtn = e.target.closest('[data-act=save-cust]');
        if (saveBtn) {
            const id = saveBtn.dataset.id;
            return guard(() => api(`customers/${id}`, 'PUT', {
                notes: rows.querySelector(`textarea[data-id="${id}"]`).value,
                tags: rows.querySelector(`input[data-f=tags][data-id="${id}"]`).value
                    .split(',').map(t => t.trim()).filter(Boolean),
            }), 'Customer saved');
        }
        // Clicks inside the open panel must not collapse it.
        if (e.target.closest('input, textarea, .detail-row')) return;
        const tr = e.target.closest('tr[data-id]');
        if (!tr) return;
        const detail = rows.querySelector(`tr[data-detail="${tr.dataset.id}"]`);
        if (detail) detail.hidden = !detail.hidden;
    });
}

/* ================= coupons ================= */

function couponRow(c) {
    const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
    const named = [...(c.restrictTo?.emails || []), ...(c.restrictTo?.phones || [])];

    const rules = [
        c.minOrder ? `min ${money(c.minOrder)}` : '',
        c.usageLimit ? `max ${c.usageLimit} uses` : '',
        c.perCustomerLimit ? `${c.perCustomerLimit}/customer` : '',
        c.expiresAt ? `till ${dateFmt(c.expiresAt)}` : 'no expiry',
    ].filter(Boolean).join(' · ');

    const audience = named.length
        ? named.slice(0, 2).map(x => `<span class="chip">${esc(x)}</span>`).join('')
          + (named.length > 2 ? `<span class="chip">+${named.length - 2}</span>` : '')
        : '<span style="color:var(--muted);font-size:12.5px">everyone</span>';

    const statusClass = expired ? 'archived' : (c.active ? 'active' : 'draft');
    const statusText = expired ? 'expired' : (c.active ? 'active' : 'off');

    return `
        <tr data-id="${c.id}">
            <td><b style="letter-spacing:.08em">${esc(c.code)}</b></td>
            <td>${c.type === 'percent' ? c.value + '%' : money(c.value)} off</td>
            <td style="font-size:12.5px;color:var(--body)">${rules}</td>
            <td>${audience}</td>
            <td class="num">${c.usedCount || 0}</td>
            <td><span class="status ${statusClass}">${statusText}</span></td>
            <td style="white-space:nowrap">
                <button class="btn small" data-act="edit">Edit</button>
                <button class="btn small danger" data-act="del">✕</button></td>
        </tr>`;
}

export async function renderCoupons() {
    const { coupons } = await api('coupons');

    viewEl.innerHTML = `
        <div class="toolbar">
            <div class="spacer"></div>
            <button class="btn primary" id="new-coupon">+ New coupon</button>
        </div>
        <div class="card"><div class="table-scroll"><table class="grid">
            <thead><tr><th>Code</th><th>Discount</th><th>Rules</th><th>Restricted to</th><th class="num">Used</th><th>Status</th><th></th></tr></thead>
            <tbody id="coupon-rows">${coupons.length ? coupons.map(couponRow).join('')
                : '<tr><td colspan="7"><div class="empty">No coupons yet — create one to offer discounts, including customer-specific ones.</div></td></tr>'}</tbody>
        </table></div></div>`;

    $('#new-coupon').addEventListener('click', () => couponEditor(null));
    $('#coupon-rows').addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const coupon = coupons.find(c => c.id === btn.closest('tr').dataset.id);

        if (btn.dataset.act === 'edit') return couponEditor(coupon);
        if (!confirm(`Delete coupon ${coupon.code}?`)) return;
        if (await guard(() => api(`coupons/${coupon.id}`, 'DELETE'), 'Coupon deleted')) renderCoupons();
    });
}

export function couponEditor(coupon) {
    const v = coupon || {
        code: '', type: 'percent', value: 10, minOrder: 0, expiresAt: null,
        usageLimit: 0, perCustomerLimit: 0, active: true, restrictTo: { emails: [], phones: [] },
    };

    const modal = openModal(`
        <h2>${coupon ? 'Edit coupon' : 'New coupon'}</h2>
        <div class="form-grid">
            <div class="field"><label>Code</label><input id="cp-code" value="${esc(v.code)}" placeholder="WELCOME10" style="text-transform:uppercase"></div>
            <div class="field"><label>Active</label><label style="text-transform:none;letter-spacing:0;font-size:14px;display:flex;gap:8px;align-items:center;margin-top:8px">
                <input type="checkbox" id="cp-active" ${v.active ? 'checked' : ''} style="width:auto"> Coupon can be used</label></div>
            <div class="field"><label>Type</label><select id="cp-type">
                <option value="percent" ${v.type === 'percent' ? 'selected' : ''}>Percent off</option>
                <option value="flat" ${v.type === 'flat' ? 'selected' : ''}>Flat ₹ off</option></select></div>
            <div class="field"><label>Value</label><input id="cp-value" type="number" min="0" value="${v.value}"></div>
            <div class="field"><label>Minimum order (₹)</label><input id="cp-min" type="number" min="0" value="${v.minOrder || ''}" placeholder="none"></div>
            <div class="field"><label>Expires</label><input id="cp-exp" type="date" value="${v.expiresAt ? v.expiresAt.slice(0, 10) : ''}"></div>
            <div class="field"><label>Total usage limit</label><input id="cp-limit" type="number" min="0" value="${v.usageLimit || ''}" placeholder="unlimited"></div>
            <div class="field"><label>Uses per customer</label><input id="cp-percust" type="number" min="0" value="${v.perCustomerLimit || ''}" placeholder="unlimited"></div>
            <div class="field full"><label>Restrict to customers — emails</label>
                <input id="cp-emails" value="${esc((v.restrictTo?.emails || []).join(', '))}" placeholder="roshni@example.com, friend@example.com">
                <div class="help">Leave both restriction fields empty for a public coupon. When filled, the coupon works only for a matching email <i>or</i> phone.</div></div>
            <div class="field full"><label>Restrict to customers — phone numbers</label>
                <input id="cp-phones" value="${esc((v.restrictTo?.phones || []).join(', '))}" placeholder="9812345678, 9898989898"></div>
        </div>
        <div class="modal-actions">
            <div class="form-error" id="cp-err"></div>
            <button class="btn" id="cp-cancel">Cancel</button>
            <button class="btn primary" id="cp-save">${coupon ? 'Save changes' : 'Create coupon'}</button>
        </div>`);

    const list = (sel) => $(sel, modal).value.split(',').map(s => s.trim()).filter(Boolean);
    const err = modalChrome(modal, '#cp-cancel', '#cp-err');

    $('#cp-save', modal).addEventListener('click', async () => {
        const body = {
            code: $('#cp-code', modal).value,
            type: $('#cp-type', modal).value,
            value: Number($('#cp-value', modal).value),
            minOrder: Number($('#cp-min', modal).value) || 0,
            expiresAt: $('#cp-exp', modal).value || null,
            usageLimit: Number($('#cp-limit', modal).value) || 0,
            perCustomerLimit: Number($('#cp-percust', modal).value) || 0,
            active: $('#cp-active', modal).checked,
            restrictTo: { emails: list('#cp-emails'), phones: list('#cp-phones') },
        };
        try {
            if (coupon) await api(`coupons/${coupon.id}`, 'PUT', body);
            else await api('coupons', 'POST', body);
            closeModal();
            toast(coupon ? 'Coupon saved' : 'Coupon created');
            renderCoupons();
        } catch (error_) { err.textContent = error_.message; }
    });
}

/* ================= review moderation ================= */

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

const REVIEW_STATUS_CLASS = { approved: 'active', rejected: 'archived', pending: 'draft' };

export async function renderReviews() {
    const { reviews } = await api('reviews');

    const pending = reviews.filter(r => r.status === 'pending').length;
    const badge = $('#reviews-badge');
    badge.textContent = pending;
    badge.hidden = !pending;

    const rows = reviews.map(r => `
        <div class="mini-row" data-id="${r.id}" style="align-items:flex-start">
            <div class="grow">
                <div class="nm">${esc(r.productName)} — <span style="color:var(--accent);letter-spacing:2px">${stars(r.rating)}</span></div>
                <div style="font-size:13px;color:var(--body);margin:4px 0">${esc(r.text)}</div>
                <div class="meta">${esc(r.name)}${r.email ? ' · ' + esc(r.email) : ''} · ${timeFmt(r.t)}</div>
            </div>
            <span class="status ${REVIEW_STATUS_CLASS[r.status]}">${r.status}</span>
            <div style="display:flex;gap:6px">
                ${r.status !== 'approved' ? '<button class="btn small" data-act="approve">Approve</button>' : ''}
                ${r.status !== 'rejected' ? '<button class="btn small" data-act="reject">Reject</button>' : ''}
                <button class="btn small danger" data-act="del">✕</button>
            </div>
        </div>`).join('');

    viewEl.innerHTML = `
        <div class="card">
            <h2>Customer reviews</h2>
            <p class="sub">Reviews appear on the storefront only after approval.</p>
            ${reviews.length ? `<div class="mini-list" id="rev-list">${rows}</div>` : '<div class="empty">No reviews yet.</div>'}
        </div>`;

    $('#rev-list')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const id = btn.closest('[data-id]').dataset.id;
        const act = btn.dataset.act;

        if (act === 'del') {
            if (!confirm('Delete this review?')) return;
            if (await guard(() => api(`reviews/${id}`, 'DELETE'))) renderReviews();
            return;
        }
        const status = act === 'approve' ? 'approved' : 'rejected';
        if (await guard(() => api(`reviews/${id}`, 'PUT', { status }))) renderReviews();
    });
}
