/**
 * Vayu — escaping for the small HTML strings the boot modules build.
 *
 * Product names, slide titles and category labels all come from the admin
 * panel, so an apostrophe or an ampersand in one of them must not be able
 * to break out of the markup it is written into.
 */

export const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
