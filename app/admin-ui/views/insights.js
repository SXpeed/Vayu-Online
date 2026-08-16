/**
 * Vayu Admin — the read-only views: dashboard, analytics, activity log,
 * inventory movements and the email outbox.
 */

import { $, viewEl, esc, money, timeFmt, dayLabel, guard } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { barChart, lineChart, hBars } from '../lib/charts.js';

/* ================= dashboard ================= */

/** Week-on-week change under a KPI, coloured by direction. */
function delta(current, previous, fmt) {
    if (!previous) return '<div class="k-delta">— vs prior 7 days</div>';
    const pct = Math.round(((current - previous) / previous) * 100);
    const dir = pct > 0 ? 'up' : (pct < 0 ? 'down' : '');
    const arrow = pct > 0 ? '↑' : (pct < 0 ? '↓' : '·');
    return `<div class="k-delta ${dir}">${arrow} ${Math.abs(pct)}% vs prior 7 days (${fmt(previous)})</div>`;
}

const miniRow = (thumb, title, meta, right) => `
    <div class="mini-row">
        ${thumb ? `<img class="thumb" src="${esc(thumb)}" alt="">` : ''}
        <div class="grow"><div class="nm">${title}</div>${meta ? `<div class="meta">${meta}</div>` : ''}</div>
        ${right}
    </div>`;

export async function renderDashboard() {
    const d = await api('overview');
    const k = d.kpis;

    const badge = $('#orders-badge');
    badge.textContent = k.openOrders;
    badge.hidden = !k.openOrders;

    const recentOrders = d.recentOrders.map(o => miniRow(
        null,
        `${esc(o.number)} — ${esc(o.customer.name)}`,
        `${o.items.length} item(s) · ${timeFmt(o.createdAt)}`,
        `<span class="status ${o.status}">${o.status}</span><div class="val">${money(o.total)}</div>`,
    )).join('');

    const bestSellers = d.topProducts.map(p => miniRow(
        p.img, esc(p.name), `${p.sold} sold · ${p.views} views`, `<div class="val">${money(p.price)}</div>`,
    )).join('');

    const lowStock = d.lowStock.map(p => miniRow(
        p.img, esc(p.name), '', `<div class="val stock-low">${p.stock} left</div>`,
    )).join('');

    viewEl.innerHTML = `
        <div class="kpis">
            <div class="card kpi"><div class="k-label">Revenue · 7 days</div>
                <div class="k-value">${money(k.revenue7d)}</div>${delta(k.revenue7d, k.revenuePrev7d, money)}</div>
            <div class="card kpi"><div class="k-label">Orders · 7 days</div>
                <div class="k-value">${k.orders7d}</div>${delta(k.orders7d, k.ordersPrev7d, String)}</div>
            <div class="card kpi"><div class="k-label">Page views · 7 days</div>
                <div class="k-value">${k.views7d.toLocaleString('en-IN')}</div>
                <div class="k-delta">${k.customers} customers · ${k.subscribers} subscribers</div></div>
            <div class="card kpi"><div class="k-label">Catalogue</div>
                <div class="k-value">${k.activeProducts}<span style="font-size:16px;color:var(--muted)"> / ${k.products}</span></div>
                <div class="k-delta ${k.lowStockCount ? 'down' : ''}">${k.lowStockCount ? k.lowStockCount + ' low on stock' : 'Stock healthy'}</div></div>
        </div>
        <div class="dash-grid">
            <div class="card"><h2>Revenue — last 14 days</h2><div id="chart-sales"></div></div>
            <div class="card"><h2>Page views — last 14 days</h2><div id="chart-traffic"></div></div>
        </div>
        <div class="dash-grid-2">
            <div class="card"><h2>Recent orders</h2>
                ${d.recentOrders.length ? `<div class="mini-list">${recentOrders}</div>`
                    : '<div class="empty">No orders yet — they appear here the moment someone checks out.</div>'}</div>
            <div class="card"><h2>Best sellers</h2>
                ${d.topProducts.some(p => p.sold || p.views) ? `<div class="mini-list">${bestSellers}</div>`
                    : '<div class="empty">Sales and view counts will rank products here.</div>'}</div>
        </div>
        ${d.lowStock.length ? `
        <div class="card" style="margin-top:16px"><h2>Low stock</h2>
            <div class="mini-list">${lowStock}</div></div>` : ''}`;

    barChart($('#chart-sales'), d.salesSeries.map(s => ({ day: s.day, value: s.revenue })), {
        color: 'var(--series-1)',
        fmt: (v) => v >= 1000 ? '₹' + (v / 1000) + 'k' : '₹' + v,
        tipLine: (i) => `${dayLabel(d.salesSeries[i].day)}<br><b>${money(d.salesSeries[i].revenue)}</b> · ${d.salesSeries[i].orders} order(s)`,
    });
    lineChart($('#chart-traffic'), d.trafficSeries.map(s => ({ day: s.day, value: s.views })), {
        color: 'var(--series-2)',
        tipLine: (i) => `${dayLabel(d.trafficSeries[i].day)}<br><b>${d.trafficSeries[i].views}</b> views · ${d.trafficSeries[i].visitors} visitors`,
    });
}

/* ================= analytics ================= */

export async function renderAnalytics() {
    const d = await api('analytics');
    const f = d.funnel || { views: 0, atc: 0, checkoutStart: 0, orders: 0 };

    const funnel = [
        { label: 'Page views', value: f.views },
        { label: 'Added to cart', value: f.atc },
        { label: 'Started checkout', value: f.checkoutStart },
        { label: 'Orders placed', value: f.orders },
    ];
    const rate = (n) => f.views ? Math.round((n / f.views) * 1000) / 10 + '%' : '—';

    const topProducts = d.topProducts.map(p =>
        miniRow(p.img, esc(p.name), '', `<div class="val">${p.views} views</div>`)).join('');

    const searches = d.searches?.map(s =>
        miniRow(null, `<span style="font-weight:400">“${esc(s.q)}”</span>`, '',
            `<div class="meta">${s.results} result(s) · ${timeFmt(s.t)}</div>`)).join('') || '';

    const abandoned = d.abandoned?.map(c =>
        miniRow(null,
            `<span style="font-weight:400">${c.items.map(i => `${esc(i.name)} × ${i.qty}`).join(', ')}</span>`,
            `last touched ${timeFmt(c.t)}`, '')).join('') || '';

    const feed = d.recent.slice(0, 30).map(r =>
        miniRow(null, `<span style="font-weight:400">${esc(r.path)}</span>`,
            r.ref ? `from ${esc(r.ref)}` : '', `<div class="meta">${timeFmt(r.t)}</div>`)).join('');

    viewEl.innerHTML = `
        <div class="card" style="margin-bottom:16px">
            <h2>Conversion funnel — last 30 days</h2>
            <div>${hBars(funnel)}</div>
            <p class="sub" style="margin:10px 0 0">View → cart ${rate(f.atc)} · view → checkout ${rate(f.checkoutStart)} · view → order ${rate(f.orders)}</p>
        </div>
        <div class="card" style="margin-bottom:16px"><h2>Page views — last 30 days</h2><div id="an-chart"></div></div>
        <div class="dash-grid-2">
            <div class="card"><h2>Top pages · 30 days</h2><div id="an-pages"></div></div>
            <div class="card"><h2>Most viewed products · 30 days</h2>
                ${d.topProducts.length ? `<div class="mini-list">${topProducts}</div>`
                    : '<div class="empty">Product pages haven\'t been viewed yet.</div>'}</div>
        </div>
        <div class="dash-grid-2" style="margin-top:16px">
            <div class="card">
                <h2>Search log</h2>
                <p class="sub">What people type into header search. Zero-result terms tell you what to stock next.</p>
                ${d.zeroResults?.length ? `<div style="margin-bottom:12px">
                    <b style="font-size:12px;color:var(--critical)">Nothing found for:</b>
                    ${d.zeroResults.map(z => `<span class="chip">${esc(z.q)} ×${z.count}</span>`).join('')}</div>` : ''}
                ${searches ? `<div class="mini-list">${searches}</div>` : '<div class="empty">No searches recorded yet.</div>'}
            </div>
            <div class="card">
                <h2>Abandoned carts</h2>
                <p class="sub">Carts idle for over an hour that never became orders.</p>
                ${abandoned ? `<div class="mini-list">${abandoned}</div>` : '<div class="empty">No abandoned carts — good sign.</div>'}
            </div>
        </div>
        <div class="card" style="margin-top:16px">
            <h2>Live feed</h2>
            <p class="sub">The most recent page views, newest first.</p>
            ${d.recent.length ? `<div class="mini-list">${feed}</div>`
                : '<div class="empty">No traffic tracked yet — open the storefront to see it flow in.</div>'}
        </div>`;

    lineChart($('#an-chart'), d.series.map(s => ({ day: s.day, value: s.views })), {
        color: 'var(--series-2)',
        tipLine: (i) => `${dayLabel(d.series[i].day)}<br><b>${d.series[i].views}</b> views · ${d.series[i].visitors} visitors`,
    });
    $('#an-pages').innerHTML = hBars(d.topPages.map(p => ({ label: p.path, value: p.views })));
}

/* ================= activity ================= */

export async function renderActivity() {
    const { activity } = await api('activity');
    const rows = activity.map(a => miniRow(
        null,
        `<span style="font-weight:400">${esc(a.detail)}</span>`,
        `${esc(a.admin)} · ${esc(a.action)}`,
        `<div class="meta">${timeFmt(a.t)}</div>`,
    )).join('');

    viewEl.innerHTML = `
        <div class="card">
            <h2>Everything that happened</h2>
            ${activity.length ? `<div class="mini-list">${rows}</div>` : '<div class="empty">Nothing logged yet.</div>'}
        </div>`;
}

/* ================= inventory ================= */

export async function renderInventory() {
    const { log, alerts } = await api('inventory');

    const movements = log.map(l => `
        <tr><td>${esc(l.name)}</td>
            <td class="num" style="color:${l.delta > 0 ? 'var(--good-text)' : 'var(--critical)'}">${l.delta > 0 ? '+' : ''}${l.delta}</td>
            <td>${esc(l.reason)}</td><td>${esc(l.by)}</td><td>${timeFmt(l.t)}</td></tr>`).join('');

    const waiting = alerts.map(a => miniRow(
        null, esc(a.email), `${esc(a.productId)} · ${timeFmt(a.t)}`,
        `<span class="status ${a.notified ? 'delivered' : 'new'}">${a.notified ? 'notified' : 'waiting'}</span>`,
    )).join('');

    viewEl.innerHTML = `
        <div class="dash-grid">
            <div class="card">
                <h2>Stock movements</h2>
                <p class="sub">Every change to stock and why it happened.</p>
                ${log.length ? `<div class="table-scroll"><table class="grid">
                    <thead><tr><th>Product</th><th class="num">Change</th><th>Reason</th><th>By</th><th>When</th></tr></thead>
                    <tbody>${movements}</tbody></table></div>`
                    : '<div class="empty">No stock movements yet.</div>'}
            </div>
            <div class="card">
                <h2>Back-in-stock requests</h2>
                <p class="sub">Shoppers waiting on sold-out pieces. Emails queue in the Outbox when stock returns.</p>
                ${alerts.length ? `<div class="mini-list">${waiting}</div>` : '<div class="empty">No requests yet.</div>'}
            </div>
        </div>`;
}

/* ================= outbox ================= */

export async function renderOutbox() {
    const { outbox } = await api('outbox');

    const queued = outbox.filter(m => m.status === 'queued').length;
    const badge = $('#outbox-badge');
    badge.textContent = queued;
    badge.hidden = !queued;

    const rows = outbox.map(m => {
        const draft = `mailto:${encodeURIComponent(m.to)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
        return `
        <div class="mini-row" data-id="${m.id}" style="align-items:flex-start">
            <div class="grow">
                <div class="nm">${esc(m.subject)}</div>
                <div class="meta">to ${esc(m.to)} · ${timeFmt(m.t)}</div>
                <details style="margin-top:6px">
                    <summary style="cursor:pointer;font-size:12px;color:var(--muted)">Preview</summary>
                    <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;color:var(--body);margin-top:6px">${esc(m.body)}</pre>
                </details>
            </div>
            <span class="status ${m.status === 'sent' ? 'delivered' : 'new'}">${m.status}</span>
            <div style="display:flex;gap:6px">
                <a class="btn small" href="${draft}">Open draft</a>
                ${m.status !== 'sent' ? '<button class="btn small" data-act="sent">Mark sent</button>' : ''}
                <button class="btn small danger" data-act="del">✕</button>
            </div>
        </div>`;
    }).join('');

    viewEl.innerHTML = `
        <div class="card">
            <h2>Email outbox</h2>
            <p class="sub">Order confirmations, shipping updates and stock alerts queue here. Until an email provider is connected, send them from your own mail app — the button opens a pre-filled draft.</p>
            ${outbox.length ? `<div class="mini-list" id="mail-list">${rows}</div>` : '<div class="empty">Nothing queued.</div>'}
        </div>`;

    $('#mail-list')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const id = btn.closest('[data-id]').dataset.id;
        const call = btn.dataset.act === 'sent'
            ? () => api(`outbox/${id}`, 'PUT', { status: 'sent' })
            : () => api(`outbox/${id}`, 'DELETE');
        if (await guard(call)) renderOutbox();
    });
}
