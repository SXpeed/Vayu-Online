/**
 * Vayu Admin — the small vocabulary every view is written in: element
 * lookup, escaping, formatting, toasts and modals.
 */

export const $ = (sel, root = document) => root.querySelector(sel);

/** The panel's content area; every view renders into it. */
export const viewEl = $('#view');

/**
 * Escape before interpolating into a template. Views build HTML as
 * strings, so anything that came from the database goes through here —
 * a product named `Brass "Diya" <set>` must not break the markup.
 */
export const esc = (s) => String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/* ---------- formatting ---------- */

export const money = (n) => '₹ ' + Number(n || 0).toLocaleString('en-IN');
export const dateFmt = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const timeFmt = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
export const dayLabel = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/* ---------- toast ---------- */

let toastTimer;

export function toast(msg, isErr = false) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/**
 * Run an API call and report it: a toast on success, the server's own
 * message on failure. Returns true when it worked, so callers can decide
 * whether to re-render — this is the shape almost every button wants.
 */
export async function guard(fn, okMsg) {
    try {
        await fn();
        if (okMsg) toast(okMsg);
        return true;
    } catch (err) {
        toast(err.message, true);
        return false;
    }
}

/* ---------- modal ---------- */

/** Opens a modal and returns its veil element, to scope lookups into it. */
export function openModal(html, narrow = false) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-veil"><div class="modal${narrow ? ' narrow' : ''}">${html}</div></div>`;
    const veil = root.firstElementChild;
    // mousedown, not click: a drag that starts inside and ends on the veil
    // should not be read as "clicked outside".
    veil.addEventListener('mousedown', (e) => {
        if (e.target === veil) closeModal();
    });
    return veil;
}

export function closeModal() {
    $('#modal-root').innerHTML = '';
}

/** Wire a modal's Cancel button and return its error slot. */
export function modalChrome(modal, cancelSel, errSel) {
    $(cancelSel, modal).addEventListener('click', closeModal);
    return $(errSel, modal);
}
