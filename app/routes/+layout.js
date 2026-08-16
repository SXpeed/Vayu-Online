/**
 * Every page on this site is content, not a per-visitor render, so the whole
 * app is prerendered to static HTML at build time. That is what keeps the
 * network tree flat: the browser gets a complete document with the header
 * and footer already in it, exactly as the pre-SvelteKit build produced.
 */
export const prerender = true;
export const trailingSlash = 'never';
