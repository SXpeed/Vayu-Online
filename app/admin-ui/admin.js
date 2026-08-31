/**
 * Vayu Admin — entry point: the view registry, the hash router and boot.
 *
 * Behaviour lives in the modules this imports, laid out to mirror the
 * server so the same names mean the same things on both sides:
 *
 *   lib/dom.js       element lookup, escaping, formatting, toast, modals
 *   lib/api.js       the /api/admin client and the panel's small state
 *   lib/media.js     image optimisation and upload, file pickers
 *   lib/charts.js    inline-SVG bar/line charts and ranked bars
 *   views/catalog.js   products, categories, press, events
 *   views/sales.js     orders, customers, coupons
 *   views/insights.js  dashboard, analytics, activity, inventory, outbox
 *   views/site.js      content, curated spaces, team, settings
 */

import { $, viewEl, esc } from './lib/dom.js';
import { api, state, loadCategories } from './lib/api.js';
import { renderProducts, renderCategories, renderPress, renderEvents } from './views/catalog.js';
import { renderArtists } from './views/artists.js';
import { renderOrders, renderCustomers, renderCoupons } from './views/sales.js';
import { renderDashboard, renderAnalytics, renderActivity, renderInventory, renderOutbox } from './views/insights.js';
import { renderContent, renderCuratedSpaces, renderTeam, renderSettings } from './views/site.js';

/** Hash route → page title + renderer. The keys match #/<name> and the
    `data-view` attributes on the sidebar links. */
const VIEWS = {
    dashboard: { title: 'Dashboard', render: renderDashboard },
    products: { title: 'Products', render: renderProducts },
    categories: { title: 'Categories', render: renderCategories },
    coupons: { title: 'Coupons', render: renderCoupons },
    orders: { title: 'Orders', render: renderOrders },
    customers: { title: 'Customers', render: renderCustomers },
    inventory: { title: 'Inventory', render: renderInventory },
    events: { title: 'What’s On', render: renderEvents },
    artists: { title: 'Artists', render: renderArtists },
    press: { title: 'Press', render: renderPress },
    content: { title: 'Site Content', render: renderContent },
    'curated-spaces': { title: 'Curated Spaces', render: renderCuratedSpaces },
    outbox: { title: 'Email Outbox', render: renderOutbox },
    team: { title: 'Team', render: renderTeam },
    analytics: { title: 'Analytics', render: renderAnalytics },
    activity: { title: 'Activity Log', render: renderActivity },
    settings: { title: 'Settings', render: renderSettings },
};

const DEFAULT_VIEW = 'dashboard';

async function route() {
    const hash = (location.hash.replace('#/', '') || DEFAULT_VIEW).split('?')[0];
    const name = VIEWS[hash] ? hash : DEFAULT_VIEW;
    const view = VIEWS[name];

    $('#view-title').textContent = view.title;
    document.querySelectorAll('#side-nav a').forEach(a =>
        a.classList.toggle('active', a.dataset.view === name));

    viewEl.innerHTML = '<div class="empty">Loading…</div>';
    try {
        await view.render();
    } catch (err) {
        viewEl.innerHTML = `<div class="card"><div class="empty">Could not load: ${esc(err.message)}</div></div>`;
    }
}

/** Drop nav entries this role cannot open. The server enforces the same
    rules regardless — hiding them only keeps the menu honest. */
function applyRoleToNav(role) {
    const rank = { staff: 0, manager: 1, owner: 2 };
    document.querySelectorAll('#side-nav a[data-need]').forEach(a => {
        if (rank[role] < rank[a.dataset.need]) a.remove();
    });
}

window.addEventListener('hashchange', route);

$('#logout-btn').addEventListener('click', async () => {
    try { await api('logout', 'POST', {}); } catch { /* session already gone */ }
    location.href = '/admin/login';
});

/* ---------- boot ---------- */

/**
 * Load the signed-in admin, trim the nav to what this role may open, warm the
 * category cache and run the first route. Named so a failed start can be
 * retried without reloading the page.
 */
async function boot() {
    state.me = await api('me');
    state.meId = state.me.id;
    $('#admin-name').textContent = `${state.me.name} · ${state.me.role}`;
    applyRoleToNav(state.me.role);

    if (state.me.mustChangePassword && !location.hash) location.hash = '#/settings';

    // Pre-warm the taxonomy: the product views need it and it rarely changes.
    await loadCategories().catch(() => {});
    route();
}

boot().catch((err) => {
    // api() has already bounced to the login page on a 401, so the only thing
    // that reaches here is a network or server failure. Say so and offer a
    // retry, rather than leaving the panel frozen on "Loading…".
    if (err.message === 'Signed out') return;
    viewEl.innerHTML = `<div class="card"><div class="empty">
        The admin panel could not start: ${esc(err.message)}.
        <button class="btn" id="boot-retry" style="margin-top:12px">Retry</button>
    </div></div>`;
    $('#boot-retry').addEventListener('click', () => boot().catch(() => {}));
});
