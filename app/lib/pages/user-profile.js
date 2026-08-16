/**
 * Vayu — /pages/user-profile.html.
 *
 * Lifted verbatim out of the page's inline <script type="module">. It used
 * to import straight from /js/, so every one of those imports was another
 * level of request chaining hanging off the HTML. It is now a bundled chunk
 * that app.js imports only when <body data-page="user-profile">.
 */

/* ============================================================
   Account page behaviour
   ------------------------------------------------------------
   Everything here is server-backed through js/account.js: the
   profile, the address book and the order history all belong to
   the signed-in customer, not to this browser. Signing in is only
   ever a convenience — the cart checks out as a guest without it.

   Details and addresses that older visits left in localStorage are
   carried up to the account once, on the first sign-in, so nobody
   loses what they had already typed.
   ============================================================ */
import {
  currentAccount, signIn, register, signOut,
  updateProfile, changePassword, addAddress, removeAddress, myOrders, googleSignInUrl,
} from '../account.js';
import { escapeHtml as esc } from '../core/html.js';

const LEGACY_PROFILE_KEY = 'vayu_profile';
const LEGACY_ADDR_KEY = 'vayu_addresses';

const $ = (id) => document.getElementById(id);
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

const flash = (el) => {
  if (!el) return;
  el.classList.add('is-visible');
  setTimeout(() => el.classList.remove('is-visible'), 2000);
};

const showError = (el, message) => { if (el) el.textContent = message; };

/** The signed-in customer, refreshed by every call that returns one. */
let account = null;

/* ---- tabs ---- */
(() => {
  const tabs = [...document.querySelectorAll('.acct-tab[role="tab"]')];
  const panelFor = (tab) => document.getElementById(tab.getAttribute('aria-controls'));

  const select = (tab) => {
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      const panel = panelFor(t);
      if (panel) panel.hidden = !on;
    });
    // reflect the section in the URL so a tab is linkable and survives reload
    const id = tab.id.replace('tab-', '');
    history.replaceState(null, '', `?section=${id}`);
  };

  tabs.forEach(tab => tab.addEventListener('click', () => select(tab)));

  // left/right arrows move between tabs, per the ARIA tabs pattern
  tabs.forEach((tab, i) => {
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      next.focus();
      select(next);
    });
  });

  const wanted = new URLSearchParams(location.search).get('section');
  const initial = tabs.find(t => t.id === `tab-${wanted}`);
  if (initial) select(initial);
})();

/* ---- sign in / create account ---- */

const gate = $('acctGate');
const wrap = $('accountWrap');
let gateMode = 'signin';

/** Set by /api/account/me — the button only appears if it will work. */
let googleReady = false;

function renderGateMode() {
  const creating = gateMode === 'register';
  $('gateGoogleLabel').textContent = creating ? 'Sign up with Google' : 'Continue with Google';
  $('gateTitle').textContent = creating ? 'Create an account' : 'Sign in';
  $('gateLede').textContent = creating
    ? 'So your details, addresses and orders are waiting next time.'
    : 'Your orders, details and saved addresses in one place.';
  $('gateSubmit').textContent = creating ? 'Create account' : 'Sign in';
  $('gateSwitch').textContent = creating ? 'I already have an account' : 'Create an account';
  $('gateNameField').hidden = !creating;
  $('gatePhoneField').hidden = !creating;
  $('gateName').required = creating;
  $('gatePassword').autocomplete = creating ? 'new-password' : 'current-password';
  showError($('gateError'), '');
}

$('gateSwitch').addEventListener('click', () => {
  gateMode = gateMode === 'signin' ? 'register' : 'signin';
  renderGateMode();
});

$('gateForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const submit = $('gateSubmit');
  submit.disabled = true;
  showError($('gateError'), '');
  const fd = new FormData(e.target);
  try {
    const data = gateMode === 'register'
      ? await register(Object.fromEntries(fd))
      : await signIn(fd.get('email'), fd.get('password'));
    account = data.customer;
    await carryOverLocalData();
    showAccount();
  } catch (err) {
    showError($('gateError'), err.message);
  } finally {
    submit.disabled = false;
  }
});

/**
 * One-time lift of anything the old browser-only account page saved.
 * Runs after a sign-in, keeps the server's data untouched when it
 * already has some, and clears the local copies once they are up.
 */
async function carryOverLocalData() {
  try {
    const profile = JSON.parse(localStorage.getItem(LEGACY_PROFILE_KEY) || 'null');
    if (profile && !account.phone && profile.phone) {
      account = (await updateProfile({ phone: profile.phone })).customer;
    }
    localStorage.removeItem(LEGACY_PROFILE_KEY);

    const saved = JSON.parse(localStorage.getItem(LEGACY_ADDR_KEY) || '[]');
    if (Array.isArray(saved) && saved.length && !account.addresses.length) {
      for (const a of saved) {
        if (!a?.body && !a?.address) continue;
        account = (await addAddress({
          label: a.label || 'Address',
          address: a.address || a.body,
          city: a.city || '',
          pin: a.pin || '',
        })).customer;
      }
    }
    localStorage.removeItem(LEGACY_ADDR_KEY);
  } catch { /* nothing here is worth blocking a sign-in over */ }
}

/* ---- account details ---- */

function fillDetails() {
  $('acctName').value = account.name || '';
  $('acctEmail').value = account.email || '';
  $('acctPhone').value = account.phone || '';

  // Whatever Google told us about them, shown above the tabs.
  const whoami = $('acctWhoami');
  const avatar = $('acctAvatar');
  $('acctWhoName').textContent = account.name || account.email;
  $('acctWhoEmail').textContent = account.email;
  avatar.hidden = !account.picture;
  if (account.picture) avatar.src = account.picture;
  whoami.hidden = false;

  // A Google-only account has no password, so it is not offered one.
  const hasPassword = account.hasPassword !== false;
  $('passwordHeading').hidden = !hasPassword;
  $('passwordForm').hidden = !hasPassword;
}

$('detailsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError($('detailsError'), '');
  try {
    const data = await updateProfile({ name: $('acctName').value, phone: $('acctPhone').value });
    account = data.customer;
    fillDetails();
    flash($('detailsSaved'));
  } catch (err) {
    showError($('detailsError'), err.message);
  }
});

$('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError($('detailsError'), '');
  try {
    await changePassword($('pwCurrent').value, $('pwNext').value);
    e.target.reset();
    flash($('passwordSaved'));
  } catch (err) {
    showError($('detailsError'), err.message);
  }
});

/* ---- saved addresses ---- */

function renderAddresses() {
  const list = $('addrList');
  const items = account.addresses || [];
  if (!items.length) {
    list.innerHTML = '<li class="acct-empty">No saved addresses yet.</li>';
    return;
  }
  list.innerHTML = items.map(a => `
    <li class="addr-card">
      <button type="button" class="addr-remove" data-remove="${esc(a.id)}"
              aria-label="Remove ${esc(a.label)} address">&times;</button>
      <strong>${esc(a.label)}${a.isDefault ? ' <span class="addr-default">Default</span>' : ''}</strong>
      ${esc(a.address).replaceAll('\n', '<br>')}
      ${a.city ? `<br>${esc(a.city)}` : ''}${a.pin ? ` — ${esc(a.pin)}` : ''}
    </li>`).join('');
}

$('addrList').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-remove]');
  if (!btn) return;
  showError($('addrError'), '');
  try {
    account = (await removeAddress(btn.dataset.remove)).customer;
    renderAddresses();
  } catch (err) {
    showError($('addrError'), err.message);
  }
});

$('addrForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  showError($('addrError'), '');
  const fd = new FormData(e.target);
  try {
    account = (await addAddress({
      label: fd.get('label'),
      address: fd.get('address'),
      city: fd.get('city'),
      pin: fd.get('pin'),
      isDefault: fd.get('isDefault') === 'on',
    })).customer;
    e.target.reset();
    renderAddresses();
    flash($('addrSaved'));
  } catch (err) {
    showError($('addrError'), err.message);
  }
});

/* ---- order history ----
   Real orders now, from /api/account/orders. A guest order placed
   before the account existed is matched on the email, so it appears
   here too. */

const STAGES = ['Placed', 'Packed', 'In Transit', 'Delivered'];

/** How far along the four-step rail an admin status sits. */
const STAGE_OF = { new: 1, processing: 2, shipped: 3, delivered: 4, cancelled: 0 };

const STATUS_LABEL = {
  new: 'Placed', processing: 'Packed', shipped: 'In Transit',
  delivered: 'Delivered', cancelled: 'Cancelled',
};

function orderHTML(o, i) {
  const first = o.items[0] || { name: '—', qty: 0 };
  const stage = STAGE_OF[o.status] ?? 1;
  const label = STATUS_LABEL[o.status] || o.status;
  const date = new Date(o.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const more = o.items.length > 1 ? ` + ${o.items.length - 1} more` : '';

  return `
  <div class="order-row-wrap">
    <button type="button" class="order-row${o.status === 'delivered' ? ' delivered' : ''}"
            aria-expanded="false" aria-controls="order-detail-${i}">
      <img src="${esc(first.img || '/assets/images/prod_lamp.jpg')}" alt="" class="order-thumb">
      <div class="order-meta">
        <div class="order-id">#${esc(o.number)}</div>
        <div class="order-date">${esc(date)}</div>
      </div>
      <div class="order-desc">
        <h4>${esc(first.name)}${more}</h4>
        <span class="qty">${first.qty} · ${inr(o.total)}</span>
      </div>
      <div class="order-status">${esc(label)}</div>
    </button>
    <div class="order-detail" id="order-detail-${i}" hidden>
      <div class="order-detail-inner">
        <div class="order-track" id="order-track-${i}" role="img"
             aria-label="Status: ${esc(label)}, step ${stage} of ${STAGES.length}">
          ${STAGES.map((s, si) => `<span class="order-track-step${si < stage ? ' is-done' : ''}">${s}</span>`).join('')}
        </div>
        <ul class="order-lines">
          ${o.items.map(l => `
            <li class="order-line">
              <span>${esc(l.name)}${l.variant ? ` — ${esc(l.variant)}` : ''} × ${l.qty}</span>
              <span>${inr(l.price * l.qty)}</span>
            </li>`).join('')}
          ${o.discount ? `<li class="order-line"><span>Discount</span><span>− ${inr(o.discount)}</span></li>` : ''}
          <li class="order-line">
            <span>Shipping</span>
            <span>${o.shipping ? inr(o.shipping) : 'Complimentary'}</span>
          </li>
          <li class="order-line order-line-total">
            <span>Total</span>
            <span>${inr(o.total)}</span>
          </li>
        </ul>
        <p style="margin-bottom:14px;">Delivering to ${esc(o.address || '—')}</p>
        <div class="order-detail-actions">
          <button type="button" class="btn-outline" data-track="${i}">Track Order</button>
          <button type="button" class="btn-outline" data-print="${i}">Print Invoice</button>
          <a class="btn-outline" href="/pages/help.html">Need help with this order</a>
        </div>
      </div>
    </div>
  </div>`;
}

async function renderOrders() {
  const host = $('orderList');
  if (!host) return;
  host.innerHTML = '<p class="acct-empty">Loading your orders…</p>';

  let orders = [];
  try {
    orders = (await myOrders()).orders;
  } catch (err) {
    host.innerHTML = `<p class="acct-empty">${esc(err.message)}</p>`;
    return;
  }

  if (!orders.length) {
    host.innerHTML = `<p class="acct-empty">No orders yet.
      <a href="/pages/collection.html">Explore the collections</a>.</p>`;
    return;
  }

  host.innerHTML = orders.map(orderHTML).join('');

  host.querySelectorAll('.order-row').forEach(row => {
    row.addEventListener('click', () => {
      const panel = document.getElementById(row.getAttribute('aria-controls'));
      const open = row.getAttribute('aria-expanded') === 'true';
      row.setAttribute('aria-expanded', String(!open));
      if (panel) panel.hidden = open;
    });
  });

  host.querySelectorAll('[data-print]').forEach(btn => {
    btn.addEventListener('click', () => window.print());
  });

  /* Track brings the status timeline into view and flashes it. The
     timeline sits at the top of the same panel, so on a long order it
     is often scrolled past by the time the buttons are reached. When
     real carrier tracking exists, give the order a `trackUrl` and open
     that instead. */
  host.querySelectorAll('[data-track]').forEach(btn => {
    btn.addEventListener('click', () => {
      const track = $(`order-track-${btn.dataset.track}`);
      if (!track) return;
      track.scrollIntoView({ behavior: 'smooth', block: 'center' });
      track.classList.add('is-flash');
      setTimeout(() => track.classList.remove('is-flash'), 1200);
    });
  });
}

/* ---- sign out ---- */

$('acctSignOut')?.addEventListener('click', async () => {
  try { await signOut(); } catch { /* the session is gone either way */ }
  account = null;
  location.href = '/index.html';
});

/* ---- boot ---- */

function showAccount() {
  gate.hidden = true;
  wrap.hidden = false;
  fillDetails();
  renderAddresses();
  renderOrders();
}

function showGate() {
  renderGateMode();
  wrap.hidden = true;
  gate.hidden = false;
}

const { signedIn, customer, google } = await currentAccount();

googleReady = !!google;
$('gateGoogle').hidden = !googleReady;
// Land back on this page, on whichever tab they were heading for.
$('gateGoogleLink').href = googleSignInUrl(location.pathname + location.search);

if (signedIn) {
  account = customer;
  showAccount();
} else {
  showGate();

  // A cancelled or failed Google round trip comes back with a flag
  // rather than silently doing nothing. Set after showGate(), because
  // renderGateMode() clears the error line as it draws.
  const outcome = new URLSearchParams(location.search).get('signin');
  if (outcome === 'cancelled') showError($('gateError'), 'Google sign-in was cancelled.');
  if (outcome === 'failed') showError($('gateError'), 'Google sign-in did not complete. Please try again.');
}
