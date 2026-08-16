/**
 * Vayu — taxonomy helpers.
 *
 * Pure functions over the category object in stores/site.svelte.js. Reading
 * through `site` rather than taking a parameter keeps every call site
 * reactive: when /api/nav swaps the categories in, the menus re-render.
 */

import { site } from '#lib/stores/site.svelte.js';

export const categories = () => site.categories;

/** 'Murano Glass' → 'murano-glass'. The rule the ?sub= parameter follows. */
export const subToSlug = (label) => String(label).toLowerCase().replace(/\s+/g, '-');

/** 'murano-glass' → 'Murano Glass'. Used for breadcrumbs and page titles. */
export const slugToLabel = (slug) => String(slug || '')
    .split('-')
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');

/** Display name for a category slug, falling back to the slug itself. */
export const categoryTitle = (slug) => site.categories[slug]?.title || slug || '';

/** [slug, category] pairs in menu order. */
export const categoryEntries = () => Object.entries(site.categories);

/** Sub-categories of a category as {slug, label, thumb}; [] if unknown. */
export const subsOf = (slug) => (site.categories[slug]?.subs || [])
    .map(s => ({ ...s, slug: subToSlug(s.label) }));

/** Link to a category, or to one of its sub-categories. */
export const catHref = (cat, subSlug) =>
    `/pages/collection-detail.html?cat=${cat}${subSlug ? `&sub=${subSlug}` : ''}`;
