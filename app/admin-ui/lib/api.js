/**
 * Vayu Admin — the API client and the little state the panel keeps.
 */

/**
 * Call /api/admin/<path>. Throws with the server's own message so callers
 * can show it verbatim; a 401 means the session went away, so the panel
 * bounces to the login page rather than rendering an empty view.
 */
export async function api(path, method = 'GET', body) {
    const res = await fetch('/api/admin/' + path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
        location.href = '/admin/login';
        throw new Error('Signed out');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

/**
 * `me` is the signed-in admin; `categories` is cached because the product
 * editor and its filters need the taxonomy on nearly every view.
 */
export const state = { categories: null, me: null, meId: null };

export async function loadCategories(force = false) {
    if (!state.categories || force) state.categories = (await api('categories')).categories;
    return state.categories;
}

export const catTitle = (slug) => state.categories?.[slug]?.title || slug;

/** 'murano-glass' → 'Murano Glass', matching the storefront's rule. */
export const slugToLabel = (slug) => String(slug || '')
    .split('-').filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');
