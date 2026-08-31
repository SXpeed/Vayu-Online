/**
 * Vayu Admin — everything downstream of a sale: orders, customers,
 * coupons.
 */

import {
    $, viewEl, esc, money, dateFmt, timeFmt, toast, guard,
    openModal, closeModal, modalChrome, confirmDelete,
} from '../lib/dom.js';
import { api } from '../lib/api.js';

/** Toggle the expandable detail row beneath a clicked row. */
function toggleDetail(rows, tr) {
    const detail = rows.querySelector(`tr[data-detail="${tr.dataset.id}"]`);
    if (detail) detail.hidden = !detail.hidden;
}

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
        <tr class="detail-row" data-detail="${o.id}" hidden><td colspan="7">
            <div class="order-items">
                ${lines}${discount}
                <div class="order-line"><span style="color:var(--muted)">Shipping</span>
                    <span class="val">${o.shipping ? money(o.shipping) : 'Free'}</span></div>
                <div class="order-line"><b>Total</b><b class="val">${money(o.total)}</b></div>
            </div>
            ${paymentDetail(o)}
            <div style="font-size:13px;color:var(--body)"><b>Ship to:</b> ${shipTo}</div>
            <div class="timeline">${o.timeline.map(t =>
                `<div><b>${esc(t.status)}</b> · ${timeFmt(t.t)} — ${esc(t.note)}</div>`).join('')}</div>
            <div class="modal-actions" style="margin-top:14px">
                <button class="btn small" data-act="edit-order" data-id="${o.id}">Edit details</button>
                <button class="btn small danger" data-act="del-order" data-id="${o.id}">Delete order</button>
            </div>
        </td></tr>`;
}

/**
 * Correct where an order is going.
 *
 * Only the delivery details. The money and the payment ids are not on this
 * form and are stripped server-side too: they record what the customer was
 * charged and what the processor confirmed, and a wrong amount is a refund
 * rather than an edit.
 */
function editOrderModal(order, onSaved) {
    const c = order.customer;
    const field = (id, label, value, attrs = '') => `
        <div class="field"><label>${label}</label>
            <input id="eo-${id}" value="${esc(value || '')}" ${attrs}></div>`;

    const modal = openModal(`
        <h3>Edit order ${esc(order.number)}</h3>
        <div class="modal-body">
            <div class="form-grid">
                ${field('name', 'Name', c.name)}
                ${field('email', 'Email', c.email, 'type="email"')}
                ${field('phone', 'Phone', c.phone)}
                ${field('city', 'City', c.city)}
                <div class="field full">
                    <label>Address</label>
                    <input id="eo-address" value="${esc(c.address || '')}"></div>
                ${field('pin', 'PIN', c.pin)}
            </div>
            <div class="help">The change is written to this order's own timeline, so whoever
                opens it next can see the address moved after it was placed.</div>
        </div>
        <div class="modal-actions">
            <div class="form-error" id="eo-err"></div>
            <button class="btn" id="eo-cancel">Cancel</button>
            <button class="btn primary" id="eo-save">Save</button>
        </div>`);

    const err = modalChrome(modal, '#eo-cancel', '#eo-err');

    $('#eo-save', modal).addEventListener('click', async () => {
        err.textContent = '';
        const patch = {};
        for (const key of ['name', 'email', 'phone', 'address', 'city', 'pin']) {
            patch[key] = $(`#eo-${key}`, modal).value.trim();
        }
        try {
            const { order: fresh } = await api(`orders/${order.id}`, 'PUT', patch);
            closeModal();
            toast('Order updated');
            onSaved(fresh);
        } catch (e) {
            err.textContent = e.message;
        }
    });
}

/**
 * How a payment reads in the panel.
 *
 * 'cod' is the only method that collects nothing up front, so everything else
 * is shown as Prepaid rather than named by processor — an admin cares whether
 * the money is in, not which gateway carried it.
 */
const payMethod = (m) => (m === 'cod' ? 'COD' : 'Prepaid');

const PAY_LABEL = {
    paid: 'Paid',
    pending: 'Pending',
    failed: 'Failed',
    refunded: 'Refunded',
};

/** Method and payment state, for the list row. */
function paymentCell(o) {
    const p = o.payment || {};
    const state = p.status || 'pending';
    // The badge carries the state and the label carries the method, with no
    // special-casing between them. An earlier version said "On delivery" for
    // a pending COD order, which read as redundant once the two sat on one
    // line beside each other — "Pending · COD" already says it.
    return `<div class="pay-cell">
            <span class="status pay-${esc(state)}">${esc(PAY_LABEL[state] || state)}</span>
            <span class="pay-method">${esc(payMethod(p.method))}</span>
        </div>`;
}

/**
 * The payment block in the expanded panel: the transaction ids, and the
 * button that settles a disagreement with Razorpay's own record.
 */
function paymentDetail(o) {
    const p = o.payment || {};
    const prepaid = p.method !== 'cod';

    const ids = prepaid
        ? `<div class="pay-ids">
               <span>Payment <code>${esc(p.paymentId || '—')}</code></span>
               <span>Order <code>${esc(p.orderId || '—')}</code></span>
           </div>`
        : '';

    const paid = p.paidAt ? ` · paid ${timeFmt(p.paidAt)}` : '';

    // Only a prepaid order has anything at Razorpay to ask about.
    const verify = prepaid
        ? `<button class="btn small" data-act="verify" data-id="${o.id}">Check with Razorpay</button>`
        : '';

    return `<div class="pay-detail">
            <div><b>Payment:</b> ${esc(payMethod(p.method))} ·
                <span class="status pay-${esc(p.status || 'pending')}">${esc(PAY_LABEL[p.status] || p.status || 'pending')}</span>${paid}</div>
            ${ids}${verify}
        </div>`;
}

/**
 * How many product images the Items column shows before it stops counting.
 *
 * Four keeps the column to a fixed width whatever the order holds — a
 * fifteen-line order would otherwise stretch the table and push Total and
 * Status off the edge on a laptop.
 */
const MAX_THUMBS = 4;

/**
 * The Items column: the products themselves, not just how many there were.
 *
 * Recognising an order at a glance is the whole job of this column, and
 * "3 items" does not do it. Anything past MAX_THUMBS collapses into a +n
 * chip; the full list is one click away in the panel below, so nothing is
 * hidden, only deferred.
 *
 * A line with no image renders as an empty plate rather than the browser's
 * broken-image glyph — the same treatment .thumb-lg.is-missing already gives
 * a deleted product elsewhere in the panel. Order lines keep their own copy
 * of the image, so this shows what was bought even after the product itself
 * has been edited or deleted.
 */
function itemsCell(items) {
    const qty = items.reduce((n, i) => n + i.qty, 0);
    const shown = items.slice(0, MAX_THUMBS);
    const hidden = items.length - shown.length;

    // The name rides in `title` so hovering a thumbnail identifies it without
    // opening the row.
    const pics = shown.map(i => (i.img
        ? `<img class="thumb sm" src="${esc(i.img)}" alt="" loading="lazy" title="${esc(i.name)}">`
        : `<span class="thumb sm is-missing" title="${esc(i.name)}"></span>`
    )).join('');

    return `<div class="items-cell">
            <div class="item-stack">${pics}${hidden ? `<span class="more">+${hidden}</span>` : ''}</div>
            <span class="count">${qty} item${qty === 1 ? '' : 's'}</span>
        </div>`;
}

/** An order row followed by its hidden detail panel. */
function orderRow(o) {
    return `
        <tr data-id="${o.id}" style="cursor:pointer">
            <td><b>${esc(o.number)}</b></td>
            <td>${esc(o.customer.name)}<div style="font-size:12px;color:var(--muted)">${esc(o.customer.email)}</div></td>
            <td>${itemsCell(o.items)}</td>
            <td class="num">${money(o.total)}</td>
            <td>${paymentCell(o)}</td>
            <td>${timeFmt(o.createdAt)}</td>
            <td style="white-space:nowrap">
                <select class="status-select" data-id="${o.id}">
                    ${ORDER_STATUSES.map(s => `<option ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
                <a class="btn small" href="/api/admin/orders/${o.id}/invoice" target="_blank" rel="noopener"
                   title="Invoice" data-act="invoice">🧾</a></td>
        </tr>
        ${orderDetail(o)}`;
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
            <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th class="num">Total</th><th>Payment</th><th>Placed</th><th>Status</th></tr></thead>
            <tbody id="order-rows"></tbody>
        </table></div></div>`;

    const rowsEl = $('#order-rows');

    function draw() {
        const list = orders.filter(o => !statusFilter || o.status === statusFilter);
        if (!list.length) {
            const suffix = statusFilter ? ' with this status' : ' yet';
            rowsEl.innerHTML = `<tr><td colspan="7"><div class="empty">No orders${suffix}.</div></td></tr>`;
            return;
        }
        rowsEl.innerHTML = list.map(orderRow).join('');
    }
    draw();

    $('#o-status').addEventListener('change', (e) => { statusFilter = e.target.value; draw(); });

    // Clicking the row expands it — but not when the click was meant for
    // the status dropdown or the invoice link inside it.
    rowsEl.addEventListener('click', async (e) => {
        // Reconcile against Razorpay. Handled before the row-toggle below,
        // and it must not collapse the panel it was clicked inside.
        const verify = e.target.closest('[data-act=verify]');
        if (verify) {
            e.stopPropagation();
            verify.disabled = true;
            // guard() reports errors as a toast but returns only a boolean,
            // so the fresh order is caught here rather than from its return.
            let result = null;
            const ok = await guard(
                async () => { result = await api(`orders/${verify.dataset.id}/verify-payment`, 'POST'); },
                'Checked with Razorpay',
            );
            verify.disabled = false;
            if (ok && result?.order) {
                // Replace the local copy so the badge and the panel both
                // show what Razorpay just said, without a full reload.
                const i = orders.findIndex(o => o.id === verify.dataset.id);
                if (i > -1) orders[i] = result.order;
                draw();
            }
            return;
        }

        // Edit and delete live inside the expanded panel, so both stop the
        // click reaching the row toggle that would collapse it underneath.
        const edit = e.target.closest('[data-act=edit-order]');
        if (edit) {
            e.stopPropagation();
            const order = orders.find(o => o.id === edit.dataset.id);
            editOrderModal(order, (fresh) => {
                const i = orders.findIndex(o => o.id === fresh.id);
                if (i > -1) orders[i] = fresh;
                draw();
            });
            return;
        }

        const del = e.target.closest('[data-act=del-order]');
        if (del) {
            e.stopPropagation();
            const order = orders.find(o => o.id === del.dataset.id);
            const willRestock = order.status !== 'cancelled';
            const confirmed = await confirmDelete({
                title: `Delete order ${esc(order.number)}?`,
                body: `
                    <p>This removes the order, its ${order.items.length} line(s) and its
                       timeline. <b>It cannot be undone</b>, and the record of what
                       ${esc(order.customer.name || 'this customer')} was charged goes with it.</p>
                    <p style="color:var(--muted);font-size:13px">${willRestock
                        ? 'The stock it holds will be returned to the shelf.'
                        : 'This order is already cancelled, so its stock is already back.'}</p>`,
            });
            if (!confirmed) return;

            if (await guard(() => api(`orders/${order.id}`, 'DELETE'), 'Order deleted')) {
                const i = orders.findIndex(o => o.id === order.id);
                if (i > -1) orders.splice(i, 1);
                draw();
            }
            return;
        }

        if (e.target.closest('select, [data-act=invoice]')) return;
        const tr = e.target.closest('tr[data-id]');
        if (tr) toggleDetail(rowsEl, tr);
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

/** The orders, tags and notes panel shown under a customer row. */
function customerDetail(c, orders) {
    const theirOrders = orders.filter(o => o.email === c.email).map(o => `
        <div class="mini-row"><div class="grow"><div class="nm">${esc(o.number)}</div>
            <div class="meta">${timeFmt(o.createdAt)}</div></div>
            <span class="status ${o.status}">${o.status}</span>
            <div class="val">${money(o.total)}</div></div>`).join('')
        || '<div class="meta">None recorded.</div>';

    return `
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
}

/** A customer row followed by its hidden detail panel. */
function customerRow(c, orders) {
    return `
        <tr data-id="${c.id}" style="cursor:pointer">
            <td><b>${esc(c.name)}</b>${(c.tags || []).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</td>
            <td>${esc(c.email)}<div style="font-size:12px;color:var(--muted)">${esc(c.phone)}</div></td>
            <td class="num">${c.ordersCount}</td>
            <td class="num">${money(c.totalSpent)}</td>
            <td>${dateFmt(c.lastSeen)}</td>
        </tr>
        ${customerDetail(c, orders)}`;
}

/** One row in the newsletter subscribers list. */
function subscriberRow(s) {
    return `
                <div class="mini-row"><div class="grow"><div class="nm">${esc(s.email)}</div></div>
                <div class="meta">${dateFmt(s.t)}</div></div>`;
}

/** The newsletter subscribers card. */
function subscribersBlock(subscribers) {
    const exportLink = subscribers.length
        ? '<a class="link-btn" href="/api/admin/export/subscribers.csv" style="margin-left:8px">Export CSV</a>'
        : '';
    const list = subscribers.length
        ? `<div class="mini-list">${[...subscribers].reverse().map(subscriberRow).join('')}</div>`
        : '<div class="empty">No subscribers yet.</div>';
    return `
        <div class="card">
            <h2>Newsletter subscribers</h2>
            <p class="sub">${subscribers.length} signup(s) from the storefront footer.
                ${exportLink}</p>
            ${list}
        </div>`;
}

export async function renderCustomers() {
    const { customers, subscribers, orders } = await api('customers');

    const customerRows = [...customers]
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .map(c => customerRow(c, orders))
        .join('');

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
            ${subscribersBlock(subscribers)}
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
        if (tr) toggleDetail(rows, tr);
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

    let audience;
    if (named.length) {
        const shown = named.slice(0, 2).map(x => `<span class="chip">${esc(x)}</span>`).join('');
        const extra = named.length > 2 ? `<span class="chip">+${named.length - 2}</span>` : '';
        audience = shown + extra;
    } else {
        audience = '<span style="color:var(--muted);font-size:12.5px">everyone</span>';
    }

    const activeClass = c.active ? 'active' : 'draft';
    const activeText = c.active ? 'active' : 'off';
    const statusClass = expired ? 'archived' : activeClass;
    const statusText = expired ? 'expired' : activeText;

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
        if (!await confirmDelete({
            title: `Delete coupon ${esc(coupon.code)}?`,
            body: `<p>Anyone still holding the code will find it no longer works. Orders that already used it keep their discount.</p>`,
        })) return;
        if (await guard(() => api(`coupons/${coupon.id}`, 'DELETE'), 'Coupon deleted')) renderCoupons();
    });
}

/** Gather the coupon form fields into a request body. */
function readCouponForm(modal) {
    const list = (sel) => $(sel, modal).value.split(',').map(s => s.trim()).filter(Boolean);
    return {
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

    const err = modalChrome(modal, '#cp-cancel', '#cp-err');

    $('#cp-save', modal).addEventListener('click', async () => {
        try {
            const body = readCouponForm(modal);
            if (coupon) await api(`coupons/${coupon.id}`, 'PUT', body);
            else await api('coupons', 'POST', body);
            closeModal();
            toast(coupon ? 'Coupon saved' : 'Coupon created');
            renderCoupons();
        } catch (error_) { err.textContent = error_.message; }
    });
}

