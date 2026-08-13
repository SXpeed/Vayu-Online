/**
 * Vayu — the checkout dialog.
 *
 * Three ways in, one way out. A shopper may sign in, create an account, or
 * carry on as a guest; whichever they pick, the same POST /api/checkout
 * places the order. Signing in is a convenience, never a gate — the guest
 * route is always one click from the first screen.
 *
 * What an account buys the shopper is typing. The server reports which
 * delivery details it already holds (`customer.details.missing`), and this
 * dialog asks only for the rest: nothing missing means a summary and a
 * Place order button, and the full form is always a click away under
 * "Use a different address".
 */

import { escapeHtml } from './boot/html.js';
import { currentAccount, signIn, register, signOut, googleSignInUrl } from './account.js';

/** Every delivery field, in the order they are shown. */
const FIELDS = [
    { name: 'name', label: 'Full name', autocomplete: 'name', required: true },
    { name: 'email', label: 'Email', type: 'email', autocomplete: 'email', required: true },
    { name: 'phone', label: 'Phone', type: 'tel', autocomplete: 'tel', required: true, placeholder: '10-digit mobile', minlength: 10 },
    { name: 'pin', label: 'PIN code', autocomplete: 'postal-code', required: true },
    { name: 'address', label: 'Address', autocomplete: 'street-address', required: true, full: true },
    { name: 'city', label: 'City', autocomplete: 'address-level2', full: true },
];

const byName = (name) => FIELDS.find(f => f.name === name);

const BLANK_DETAILS = { name: '', email: '', phone: '', address: '', city: '', pin: '', missing: [] };

/** Google's mark, inlined so the button needs no network request. */
const GOOGLE_MARK = `<svg viewBox="0 0 18 18" width="17" height="17" aria-hidden="true">
    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.33A9 9 0 0 0 9 18z"/>
    <path fill="#FBBC05" d="M3.95 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l2.99-2.33z"/>
    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.16 6.65 3.58 9 3.58z"/>
  </svg>`;

/**
 * Sent to Google, then back to the cart with the dialog reopened — the
 * cart itself is in localStorage, so it survives the round trip intact.
 */
const googleButton = (label = 'Continue with Google') =>
    `<a class="co-google" href="${escapeHtml(googleSignInUrl('/pages/cart.html?checkout=1'))}">
        ${GOOGLE_MARK}<span>${escapeHtml(label)}</span>
     </a>`;

/* ---------- markup ---------- */

function fieldHTML(field, value = '') {
    return `
        <label${field.full ? ' class="co-full"' : ''}>${field.label}
            <input name="${field.name}" value="${escapeHtml(value)}"
                   type="${field.type || 'text'}" autocomplete="${field.autocomplete}"
                   ${field.required ? 'required' : ''}
                   ${field.minlength ? `minlength="${field.minlength}"` : ''}
                   ${field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ''}>
        </label>`;
}

/** The details we already hold, shown as text rather than as inputs. */
function summaryHTML(details) {
    const lines = [
        details.name,
        details.email,
        details.phone,
        [details.address, details.city, details.pin].filter(Boolean).join(', '),
    ].filter(Boolean);
    return `<div class="co-summary">${lines.map(l => `<div>${escapeHtml(l)}</div>`).join('')}</div>`;
}

function addressPickerHTML(addresses, selectedId) {
    if (addresses.length < 2) return '';
    return `
        <label class="co-full co-picker">Deliver to
            <select name="addressId">
                ${addresses.map(a => `
                    <option value="${escapeHtml(a.id)}"${a.id === selectedId ? ' selected' : ''}>
                        ${escapeHtml(a.label)} — ${escapeHtml([a.address, a.city, a.pin].filter(Boolean).join(', '))}
                    </option>`).join('')}
            </select>
        </label>`;
}

/* ---------- the dialog ---------- */

/**
 * Open checkout over the current page.
 *
 * @param {() => Array} getItems     cart lines in the /api/checkout shape
 * @param {() => string|null} getCoupon  the applied coupon code, if any
 * @param {(data) => void} onPlaced  called once an order exists, to clear the cart
 */
export function openCheckout({ getItems, getCoupon, onPlaced }) {
    if (!getItems().length) return;

    const veil = document.createElement('div');
    veil.className = 'checkout-veil';
    veil.innerHTML = `<div class="checkout-card" role="dialog" aria-modal="true" aria-label="Checkout">
        <p class="co-loading">One moment…</p>
    </div>`;
    document.body.appendChild(veil);

    const card = veil.querySelector('.checkout-card');
    const close = () => veil.remove();
    veil.addEventListener('mousedown', (e) => { if (e.target === veil) close(); });
    document.addEventListener('keydown', function onEsc(e) {
        if (!veil.isConnected) return document.removeEventListener('keydown', onEsc);
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
    });

    /** Who is checking out. `account` is null for a guest. */
    let account = null;
    /** Whether the server has Google sign-in configured. */
    let googleReady = false;
    /** Which saved address is prefilling the form. */
    let addressId = null;

    const details = () => {
        if (!account) return BLANK_DETAILS;
        const chosen = (account.addresses || []).find(a => a.id === addressId);
        if (!chosen) return account.details;
        return {
            ...account.details,
            name: chosen.name || account.details.name,
            phone: chosen.phone || account.details.phone,
            address: chosen.address,
            city: chosen.city,
            pin: chosen.pin,
            missing: ['name', 'email', 'phone', 'address', 'pin']
                .filter(f => !String((f === 'address' || f === 'pin' || f === 'city' ? chosen[f] : account.details[f]) || '').trim()),
        };
    };

    /* ---- screens ---- */

    /** First screen for a signed-out shopper: every way forward, at once. */
    function renderChoice() {
        card.innerHTML = `
            <h2>Checkout</h2>
            <p class="co-lede">Sign in to use your saved details, or carry straight on.</p>
            <div class="co-choice">
                <button type="button" class="cart-checkout-btn co-guest"><span>Continue as guest</span></button>
                ${googleReady ? googleButton() : ''}
                <button type="button" class="co-alt" data-screen="signin">Sign in with email</button>
                <button type="button" class="co-alt" data-screen="register">Create an account</button>
            </div>`;
        card.querySelector('.co-guest').addEventListener('click', () => renderDetails('full'));
        card.querySelectorAll('[data-screen]').forEach(b => {
            b.addEventListener('click', () => (b.dataset.screen === 'signin' ? renderSignIn() : renderRegister()));
        });
    }

    function renderSignIn() {
        card.innerHTML = `
            <h2>Sign in</h2>
            ${googleReady ? `${googleButton('Sign in with Google')}<div class="co-or">or</div>` : ''}
            <form id="coAuth" class="co-auth">
                <label>Email<input name="email" type="email" required autocomplete="email"></label>
                <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
                <p class="co-error" aria-live="polite"></p>
                <div class="co-actions">
                    <button type="button" class="co-cancel" data-back>Back</button>
                    <button type="submit" class="cart-checkout-btn co-submit"><span>Sign in</span></button>
                </div>
            </form>
            <p class="co-lede">No account? <button type="button" class="co-link" data-register>Create one</button>
               or <button type="button" class="co-link" data-guest>continue as guest</button>.</p>`;
        wireAuthForm(async (fd) => signIn(fd.get('email'), fd.get('password')));
    }

    function renderRegister() {
        card.innerHTML = `
            <h2>Create an account</h2>
            <p class="co-lede">So your details and orders are here next time.</p>
            ${googleReady ? `${googleButton('Sign up with Google')}<div class="co-or">or</div>` : ''}
            <form id="coAuth" class="co-auth">
                <label>Full name<input name="name" required autocomplete="name"></label>
                <label>Email<input name="email" type="email" required autocomplete="email"></label>
                <label>Phone<input name="phone" type="tel" autocomplete="tel" placeholder="10-digit mobile"></label>
                <label>Password<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
                <p class="co-error" aria-live="polite"></p>
                <div class="co-actions">
                    <button type="button" class="co-cancel" data-back>Back</button>
                    <button type="submit" class="cart-checkout-btn co-submit"><span>Create account</span></button>
                </div>
            </form>
            <p class="co-lede">Already have one? <button type="button" class="co-link" data-signin>Sign in</button>
               or <button type="button" class="co-link" data-guest>continue as guest</button>.</p>`;
        wireAuthForm(async (fd) => register(Object.fromEntries(fd)));
    }

    /** Shared plumbing for the two auth forms. */
    function wireAuthForm(submitFn) {
        card.querySelector('[data-back]')?.addEventListener('click', renderChoice);
        card.querySelector('[data-guest]')?.addEventListener('click', () => renderDetails('full'));
        card.querySelector('[data-signin]')?.addEventListener('click', renderSignIn);
        card.querySelector('[data-register]')?.addEventListener('click', renderRegister);

        card.querySelector('#coAuth').addEventListener('submit', async (e) => {
            e.preventDefault();
            const errEl = card.querySelector('.co-error');
            const submit = card.querySelector('.co-submit');
            submit.disabled = true;
            errEl.textContent = '';
            try {
                const data = await submitFn(new FormData(e.target));
                account = data.customer;
                addressId = (account.addresses || []).find(a => a.isDefault)?.id || null;
                // Straight to whichever screen matches what we now know.
                renderDetails(account.details.missing.length ? 'fill' : 'summary');
            } catch (err) {
                errEl.textContent = err.message;
                submit.disabled = false;
            }
        });
    }

    /**
     * The delivery step.
     *
     *   summary — signed in, nothing missing: confirm and place
     *   fill    — signed in, some fields blank: ask for exactly those
     *   full    — the whole form (always the case for a guest)
     */
    function renderDetails(mode) {
        const known = details();
        const missing = account ? known.missing : [];
        const fields = mode === 'fill'
            ? missing.map(byName).filter(Boolean)
            : FIELDS;

        const heading = mode === 'fill' ? 'A couple more details' : 'Delivery details';
        const lede = {
            summary: 'Delivering to the details on your account.',
            fill: 'We have the rest from your account — we just need these.',
            full: '',
        }[mode];

        card.innerHTML = `
            <h2>${heading}</h2>
            ${account ? `<p class="co-who">Signed in as <b>${escapeHtml(account.email)}</b>
                 <button type="button" class="co-link" data-signout>Not you?</button></p>` : ''}
            ${lede ? `<p class="co-lede">${lede}</p>` : ''}
            <form id="checkoutForm">
                ${mode !== 'full' ? summaryHTML(known) : ''}
                <div class="co-grid">
                    ${account ? addressPickerHTML(account.addresses || [], addressId) : ''}
                    ${mode === 'summary' ? '' : fields.map(f => fieldHTML(f, known[f.name])).join('')}
                </div>
                ${account && mode !== 'summary' ? `
                    <label class="co-check"><input type="checkbox" name="saveAddress" checked>
                        Save this address to my account</label>` : ''}
                <p class="co-error" aria-live="polite"></p>
                <div class="co-actions">
                    ${mode === 'full'
                ? '<button type="button" class="co-cancel" data-cancel>Back to cart</button>'
                : '<button type="button" class="co-link" data-edit>Use a different address</button>'}
                    <button type="submit" class="cart-checkout-btn co-submit"><span>Place order</span></button>
                </div>
            </form>`;

        card.querySelector('[data-cancel]')?.addEventListener('click', close);
        card.querySelector('[data-edit]')?.addEventListener('click', () => renderDetails('full'));
        card.querySelector('[data-signout]')?.addEventListener('click', async () => {
            try { await signOut(); } catch { /* the dialog carries on as a guest either way */ }
            account = null;
            addressId = null;
            renderChoice();
        });
        card.querySelector('select[name="addressId"]')?.addEventListener('change', (e) => {
            addressId = e.target.value;
            renderDetails(mode);
        });

        card.querySelector('#checkoutForm').addEventListener('submit', (e) => {
            e.preventDefault();
            placeOrder(new FormData(e.target), known);
        });
    }

    function renderDone(data) {
        onPlaced?.(data);
        card.innerHTML = `
            <div class="co-done">
                <h2>Thank you</h2>
                <p>Your order <b>${escapeHtml(data.number)}</b> has been placed.<br>
                   ${data.discount ? `Coupon saved you ₹ ${Number(data.discount).toLocaleString('en-IN')}.<br>` : ''}
                   Total: ₹ ${Number(data.total).toLocaleString('en-IN')}. We'll be in touch at the email you provided.</p>
                ${account
                ? '<a href="/pages/user-profile.html?section=orders" class="cart-empty-btn">View my orders</a>'
                : '<a href="/pages/collection.html" class="cart-empty-btn">Continue Shopping</a>'}
            </div>`;
    }

    /* ---- placing it ---- */

    async function placeOrder(fd, known) {
        const errEl = card.querySelector('.co-error');
        const submit = card.querySelector('.co-submit');
        submit.disabled = true;
        errEl.textContent = '';

        // Whatever the shopper typed, over what the account already knew.
        // The server does the same merge again — this copy is only so a
        // guest's form and a member's edits arrive in one shape.
        const customer = {};
        for (const field of FIELDS) {
            customer[field.name] = String(fd.get(field.name) ?? known[field.name] ?? '').trim();
        }

        try {
            const res = await fetch('/api/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    items: getItems(),
                    customer,
                    coupon: getCoupon?.() || null,
                    saveAddress: fd.get('saveAddress') === 'on',
                    sid: localStorage.getItem('vayu_sid') || '',
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not place the order');

            if (data.payment === 'razorpay') return payWithRazorpay(data, errEl, submit);
            renderDone(data);
        } catch (err) {
            errEl.textContent = err.message;
            submit.disabled = false;
        }
    }

    /** Online payment: the order only exists once the signature verifies. */
    async function payWithRazorpay(data, errEl, submit) {
        await new Promise((resolve, reject) => {
            if (window.Razorpay) return resolve();
            const s = document.createElement('script');
            s.src = 'https://checkout.razorpay.com/v1/checkout.js';
            s.onload = resolve;
            s.onerror = () => reject(new Error('Could not load the payment window'));
            document.head.appendChild(s);
        });

        new Razorpay({
            key: data.keyId,
            amount: data.amount,
            currency: 'INR',
            name: data.name || 'Vayu',
            order_id: data.rzpOrderId,
            prefill: data.prefill,
            handler: async (resp) => {
                try {
                    const conf = await fetch('/api/checkout/confirm', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            rzpOrderId: resp.razorpay_order_id,
                            rzpPaymentId: resp.razorpay_payment_id,
                            rzpSignature: resp.razorpay_signature,
                        }),
                    });
                    const cj = await conf.json();
                    if (!conf.ok) throw new Error(cj.error || 'Payment confirmation failed');
                    renderDone(cj);
                } catch (err) {
                    errEl.textContent = err.message;
                    submit.disabled = false;
                }
            },
            modal: { ondismiss: () => { submit.disabled = false; } },
        }).open();
    }

    /* ---- open on whichever screen fits ---- */

    currentAccount().then(({ signedIn, customer, google }) => {
        if (!veil.isConnected) return;
        googleReady = !!google;
        if (!signedIn) return renderChoice();
        account = customer;
        addressId = (customer.addresses || []).find(a => a.isDefault)?.id || null;
        renderDetails(customer.details.missing.length ? 'fill' : 'summary');
    });
}
