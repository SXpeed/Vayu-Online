/**
 * Vayu Admin — enquiries left on the pieces sold at a price on request.
 *
 * This is a working queue rather than a report: every row is somebody
 * waiting for an answer, so the screen is built around getting to them.
 * The contact details are links (mailto:, tel:) because the reply happens
 * outside the panel, and the status is what stops two people ringing the
 * same customer about the same piece.
 *
 * A closed enquiry stays on the list. It is correspondence — the record of
 * what was asked and what came of it — and the filter is what puts it out
 * of the way, not the ✕.
 */

import {
    $, viewEl, esc, timeFmt, toast, guard, confirmDelete,
} from '../lib/dom.js';
import { api } from '../lib/api.js';

/** status → the .status modifier that colours its dot. */
const DOT = { new: 'new', contacted: 'processing', closed: 'delivered' };

/** What the button offers to do next, in the order an enquiry moves. */
const NEXT = {
    new: { to: 'contacted', label: 'Mark contacted' },
    contacted: { to: 'closed', label: 'Mark closed' },
    closed: { to: 'new', label: 'Reopen' },
};

/** ?id= alone resolves — the product page searches every category by id. */
const productHref = (id) => `/pages/product.html?id=${encodeURIComponent(id)}`;

/**
 * The two ways to answer, as links rather than as text to copy out.
 *
 * The mailto: carries a subject naming the piece, because the reply is
 * written in a mail client that knows nothing about this screen and the
 * customer asked about one specific thing, sometimes weeks earlier.
 */
function contactLinks(q) {
    const out = [];
    if (q.email) {
        const subject = encodeURIComponent(`Vayu — your enquiry about ${q.productName}`);
        out.push(`<a class="btn small" href="mailto:${encodeURIComponent(q.email)}?subject=${subject}">Email</a>`);
    }
    if (q.phone) out.push(`<a class="btn small" href="tel:${encodeURIComponent(q.phone)}">Call</a>`);
    return out.join('');
}

/**
 * The piece the enquiry is about.
 *
 * `productName` is the snapshot taken when it arrived, so this reads
 * correctly even after the product is renamed or deleted — which is the
 * whole reason the column exists (migration 0023). The link and the plate
 * only appear while there is still a product to open.
 */
function pieceBlock(q) {
    const plate = q.productImg
        ? `<img class="thumb thumb-lg" src="${esc(q.productImg)}" alt="" loading="lazy">`
        : '<span class="thumb thumb-lg is-missing"></span>';

    const name = q.productId
        ? `<a href="${productHref(q.productId)}" target="_blank" rel="noopener noreferrer">${esc(q.productName)}</a>`
        : `${esc(q.productName)} <span class="meta">(no longer in the catalogue)</span>`;

    const state = q.productStatus && q.productStatus !== 'active'
        ? `<span class="status ${esc(q.productStatus)}">${esc(q.productStatus)}</span>` : '';

    return { plate, name, state };
}

function inquiryCard(q) {
    const { plate, name, state } = pieceBlock(q);
    const next = NEXT[q.status] || NEXT.new;

    // Both, separated, and neither invented: a shopper gives one or the
    // other and often both, and the endpoint requires only that one of them
    // is there. Printing an empty "·" between them reads as a missing value
    // rather than as a choice they made.
    const reach = [
        q.email ? `<a href="mailto:${encodeURIComponent(q.email)}">${esc(q.email)}</a>` : '',
        q.phone ? `<a href="tel:${encodeURIComponent(q.phone)}">${esc(q.phone)}</a>` : '',
    ].filter(Boolean).join(' · ');

    return `
    <div class="alert-card" data-id="${esc(q.id)}">
        ${q.productId ? `<a href="${productHref(q.productId)}" target="_blank" rel="noopener noreferrer">${plate}</a>` : plate}
        <div class="grow">
            <div class="nm">${name} ${state}</div>
            ${q.variant ? `<div class="meta"><span class="chip">${esc(q.variant)}</span></div>` : ''}
            <div class="meta"><strong>${esc(q.name)}</strong> · ${reach}</div>
            <div class="meta">${timeFmt(q.t)}${q.handledAt ? ` · answered ${timeFmt(q.handledAt)}` : ''}</div>
            ${q.message ? `<p style="margin:8px 0 0;white-space:pre-wrap;color:var(--body);font-size:13.5px">${esc(q.message)}</p>` : ''}
            <div class="field" style="margin-top:10px">
                <label>Notes <span style="text-transform:none;letter-spacing:0">(yours — the customer never sees these)</span></label>
                <textarea data-notes rows="2" placeholder="What was quoted, what they wanted…">${esc(q.notes)}</textarea>
            </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
            <span class="status ${DOT[q.status] || 'new'}">${esc(q.status)}</span>
            ${contactLinks(q)}
            <button class="btn small" data-act="advance" data-to="${next.to}">${next.label}</button>
            <button class="btn small" data-act="notes">Save notes</button>
            <button class="btn small danger" data-act="del" title="Delete">✕</button>
        </div>
    </div>`;
}

export async function renderInquiries() {
    const { inquiries, newCount } = await api('inquiries');

    // The sidebar badge, kept in step with the screen the moment it is
    // opened — the same contract the Orders and Outbox badges follow.
    const badge = $('#inquiries-badge');
    if (badge) {
        badge.textContent = newCount;
        badge.hidden = !newCount;
    }

    let filter = 'new';

    const counts = {
        all: inquiries.length,
        new: inquiries.filter(q => q.status === 'new').length,
        contacted: inquiries.filter(q => q.status === 'contacted').length,
        closed: inquiries.filter(q => q.status === 'closed').length,
    };

    /**
     * Open on New when there is anything waiting, and on All when there is
     * not. Landing on an empty New list and having to work out that the
     * enquiries are one tab over is a worse first second than seeing them.
     */
    if (!counts.new) filter = 'all';

    const tabs = () => ['new', 'contacted', 'closed', 'all']
        .map(k => `<option value="${k}" ${filter === k ? 'selected' : ''}>
            ${k[0].toUpperCase() + k.slice(1)} (${counts[k]})</option>`)
        .join('');

    function draw() {
        const shown = filter === 'all' ? inquiries : inquiries.filter(q => q.status === filter);
        $('#inq-list').innerHTML = shown.length
            ? shown.map(inquiryCard).join('')
            : `<div class="empty">No ${filter === 'all' ? '' : filter + ' '}enquiries.</div>`;
    }

    viewEl.innerHTML = `
        <div class="toolbar">
            <select id="inq-filter">${tabs()}</select>
            <div class="spacer"></div>
        </div>
        <div class="card">
            <h2>Enquiries</h2>
            <p class="sub">Questions left on pieces priced on request. Reply by email or phone, then mark the enquiry so the rest of the team knows it is handled.</p>
            <div class="mini-list" id="inq-list"></div>
        </div>`;

    draw();

    $('#inq-filter').addEventListener('change', (e) => { filter = e.target.value; draw(); });

    $('#inq-list').addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const card = btn.closest('[data-id]');
        const id = card.dataset.id;
        const row = inquiries.find(q => q.id === id);

        if (btn.dataset.act === 'del') {
            if (!await confirmDelete({
                title: 'Delete this enquiry?',
                body: `<p>The message from <b>${esc(row.name)}</b> about <b>${esc(row.productName)}</b>, and their contact details, are removed. <b>This cannot be undone.</b></p>`,
            })) return;
            if (await guard(() => api(`inquiries/${id}`, 'DELETE'), 'Enquiry deleted')) renderInquiries();
            return;
        }

        // Notes ride along with a status change as well as going on their
        // own, so typing a note and pressing Mark contacted does not throw
        // the note away — which is the order these two actually happen in.
        const notes = card.querySelector('[data-notes]').value;

        if (btn.dataset.act === 'notes') {
            if (await guard(() => api(`inquiries/${id}`, 'PUT', { notes }), 'Notes saved')) {
                row.notes = notes;
            }
            return;
        }

        const to = btn.dataset.to;
        if (await guard(() => api(`inquiries/${id}`, 'PUT', { status: to, notes }))) {
            toast(`Marked ${to}`);
            renderInquiries();
        }
    });
}
