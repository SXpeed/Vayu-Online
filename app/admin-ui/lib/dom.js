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

/**
 * Confirm something irreversible by making the reader type DELETE.
 *
 * window.confirm() is one keystroke from "yes" and reads identically whether
 * it is about to hide a row or destroy an order and its line items. The
 * typing is the point: it cannot be dismissed by reflex, and copying the word
 * out of the prompt is deliberate in a way that pressing Enter is not.
 *
 * Resolves true only if DELETE was typed and Delete pressed; false on cancel,
 * on the veil, and on Escape. Never throws, so callers can `await` it in an
 * event handler without a try.
 *
 *   if (!await confirmDelete({ title: 'Delete order', body: '…' })) return;
 *
 * @param {{title: string, body: string, verb?: string}} opts
 *   body is INSERTED AS MARKUP, so callers escape anything from the database
 *   with esc() before passing it — the same rule every other template here
 *   follows.
 */
export function confirmDelete({ title, body, verb = 'Delete' }) {
    return new Promise((resolve) => {
        const modal = openModal(`
            <h3>${title}</h3>
            <div class="modal-body">
                ${body}
                <div class="field" style="margin-top:14px">
                    <label>Type <b>DELETE</b> to confirm</label>
                    <input id="cd-word" autocomplete="off" spellcheck="false" placeholder="DELETE">
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn" id="cd-cancel">Cancel</button>
                <button class="btn danger" id="cd-go" disabled>${verb}</button>
            </div>`, true);

        const word = $('#cd-word', modal);
        const go = $('#cd-go', modal);
        let settled = false;

        // One resolve, whichever way this ends. Without the flag the veil
        // handler in openModal() would resolve again after a confirm.
        const finish = (value) => {
            if (settled) return;
            settled = true;
            document.removeEventListener('keydown', onKey);
            closeModal();
            resolve(value);
        };

        // Exact match, not a case-insensitive compare: the whole value of
        // this is that it cannot be satisfied by accident.
        word.addEventListener('input', () => { go.disabled = word.value !== 'DELETE'; });
        word.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !go.disabled) finish(true);
        });
        go.addEventListener('click', () => finish(true));
        $('#cd-cancel', modal).addEventListener('click', () => finish(false));

        const onKey = (e) => { if (e.key === 'Escape') finish(false); };
        document.addEventListener('keydown', onKey);

        // Clicking the veil closes the modal without going through finish(),
        // so watch for the node leaving the document and settle as a cancel.
        new MutationObserver((_, obs) => {
            if (!modal.isConnected) { obs.disconnect(); finish(false); }
        }).observe($('#modal-root'), { childList: true });

        word.focus();
    });
}

/** Wire a modal's Cancel button and return its error slot. */
export function modalChrome(modal, cancelSel, errSel) {
    $(cancelSel, modal).addEventListener('click', closeModal);
    return $(errSel, modal);
}
