/**
 * Vayu — analytics beacon for the admin panel (/admin → Analytics).
 *
 * One POST per page view with the path and an anonymous visitor id — no
 * cookies, nothing personal. Fire-and-forget: if the API is down the
 * storefront never notices, and nothing in here may ever throw into the
 * page.
 */

const SID_KEY = 'vayu_sid';

/** A per-browser id, created on first use. '' when storage is blocked. */
export function sessionId() {
    try {
        let sid = localStorage.getItem(SID_KEY);
        if (!sid) {
            sid = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
            localStorage.setItem(SID_KEY, sid);
        }
        return sid;
    } catch {
        return '';
    }
}

/** Post one event to /api/track, preferring a beacon so it survives unload. */
export function track(event) {
    try {
        const payload = JSON.stringify(event);
        const sent = navigator.sendBeacon?.('/api/track', new Blob([payload], { type: 'application/json' }));
        if (sent) return;
        fetch('/api/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
        }).catch(() => { });
    } catch { /* analytics must never break the page */ }
}

export function trackPageView() {
    const send = () => track({
        path: location.pathname + location.search,
        ref: document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : '',
        sid: sessionId(),
    });

    // Wait for activation so prerendered pages don't count phantom views.
    if (document.prerendering) document.addEventListener('prerenderingchange', send, { once: true });
    else send();
}
