/**
 * Vayu — the shared header and footer.
 *
 * Every page ships an empty #site-header / #site-footer slot; the markup
 * itself lives in /partials and is fetched once per page load. Requires
 * the site to be served over HTTP — fetch() cannot read local files when
 * a page is opened directly via file://.
 */

/**
 * cache: 'no-cache' revalidates rather than refetching — the browser
 * still gets a 304 and its own copy when nothing changed, but it can
 * never serve a stale partial. Unlike styles.css these have no ?v= to
 * bump, so an edited header or footer used to keep showing the old links
 * until a hard reload (a new page in the footer, for instance, stayed
 * unreachable on any browser that had cached it).
 */
async function inject(id, file) {
    const slot = document.getElementById(id);
    if (!slot) return;
    const res = await fetch(file, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${file}: ${res.status}`);
    slot.outerHTML = await res.text();
}

/** Header and footer in parallel, so one round trip covers both. */
export async function injectPartials() {
    try {
        await Promise.all([
            inject('site-header', '/partials/header.html'),
            inject('site-footer', '/partials/footer.html'),
        ]);
    } catch (err) {
        console.error('Could not load shared header/footer. Serve the site over HTTP (Live Server), not file://.', err);
    }
}
