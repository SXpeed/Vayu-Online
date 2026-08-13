/**
 * Vayu — live catalogue loader.
 *
 * One fetch of /api/catalogue shared by js/catalogue.js and js/taxonomy.js
 * (top-level await, so importers simply see the resolved data). When the
 * API is unreachable — file:// preview, or the admin data layer failing —
 * `remote` is null and both modules fall back to their built-in static
 * data, which is also what seeds the admin database on first run.
 */

export const remote = await (async () => {
    try {
        const res = await fetch('/api/catalogue', { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            if (data && data.products && data.categories) return data;
        }
    } catch {
        /* fall back to static data */
    }
    return null;
})();
