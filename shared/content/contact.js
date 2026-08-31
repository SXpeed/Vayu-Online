/**
 * Vayu — how to reach the shop: the phone number, the email address and the
 * social profiles.
 *
 * All of it was written into the markup, and not in one place: the phone and
 * the email appeared in the desktop footer, again in the mobile footer, again
 * on the press page, again in the home page's LocalBusiness markup and again
 * in llms.txt. Changing the shop's number meant finding five copies of it,
 * and a deploy. A phone number is exactly the kind of thing that changes
 * without warning and cannot wait for a release.
 *
 * The social links were worse than duplicated, they were wrong: every one of
 * them pointed at the network's own home page — `https://instagram.com`, not
 * the shop's profile — in both footers. Eight links that looked like social
 * proof and led nowhere.
 *
 * So this module is the single written-down copy. The pages paint what ships
 * here, the storefront repaints once the panel's values arrive, and the panel
 * edits them. Same shape as `home-artist.js` and `inside-vayu.js`, for the
 * same reason: three copies of one string is three chances for the panel to
 * describe a shop the page does not have.
 *
 * NOTE for the structured data. Google cross-checks a business's name,
 * address and phone against its Business Profile and every directory that
 * lists it, so the marked-up copy and the visible copy must be the same
 * characters. That is why the home page's JSON-LD derives from this too
 * rather than keeping its own copy — see app/routes/+page.svelte.
 */

/**
 * The contact details exactly as the pages paint them before any fetch.
 *
 * The social entries are the placeholder home pages the footer shipped with.
 * They are kept as the defaults so nothing changes the day this lands — the
 * footer looks exactly as it did until the shop puts its real profiles in.
 */
export const CONTACT_SHIPPED = {
    phone: '+91 8595977845',
    email: 'info@vayuonline.com',
    instagram: 'https://instagram.com',
    facebook: 'https://facebook.com',
    pinterest: 'https://pinterest.com',
    youtube: 'https://youtube.com',
};

/**
 * The networks the footer draws, in the order it draws them.
 *
 * A fixed list rather than free-form rows, because each one is rendered as
 * that network's own official mark — an arbitrary URL would have no glyph to
 * stand behind. Adding a network is a code change by design: it needs a
 * logo.
 */
export const SOCIAL_NETWORKS = [
    { key: 'instagram', label: 'Instagram' },
    { key: 'facebook', label: 'Facebook' },
    { key: 'pinterest', label: 'Pinterest' },
    { key: 'youtube', label: 'YouTube' },
];

/** Just the keys, for the places that only need to iterate the fields. */
export const SOCIAL_KEYS = SOCIAL_NETWORKS.map(n => n.key);

/**
 * The contact details as a page will show them: what the shop saved, then
 * what the page ships with, field by field.
 *
 * Field by field rather than whole, so correcting the phone number does not
 * oblige the shop to re-enter its email and four profile URLs beside it.
 * Empty is how "leave this one alone" is spelled — with one deliberate
 * exception, below.
 */
export function contactEffective(saved) {
    const s = saved || {};
    const out = {
        phone: String(s.phone || '').trim() || CONTACT_SHIPPED.phone,
        email: String(s.email || '').trim() || CONTACT_SHIPPED.email,
    };
    // The social links do NOT fall back, and that is the point. A shop that
    // clears Instagram means "we are not on Instagram" — falling back would
    // put the placeholder link to instagram.com straight back on the page,
    // and there would be no way to take a network off the footer at all.
    // `socialLinks()` then drops the empty ones rather than drawing a mark
    // that goes nowhere.
    for (const key of SOCIAL_KEYS) {
        out[key] = s[key] === undefined
            ? CONTACT_SHIPPED[key]
            : String(s[key] || '').trim();
    }
    return out;
}

/**
 * A `tel:` href for a number written for humans.
 *
 * "+91 8595977845" is how the number should READ; the href has to be the
 * bare digits or a phone will not dial it. Everything but digits and a
 * leading + is dropped, so the shop can write the number with spaces,
 * brackets or dashes and the link still works.
 */
export function telHref(phone) {
    const raw = String(phone || '').trim();
    const plus = raw.startsWith('+') ? '+' : '';
    return `tel:${plus}${raw.replace(/\D/g, '')}`;
}

/** A `mailto:` href. Separate only so no page has to remember the prefix. */
export const mailHref = (email) => `mailto:${String(email || '').trim()}`;

/**
 * The networks that actually have a URL, in footer order.
 *
 * Returned as `{ key, label, href }` so both footers iterate one list
 * instead of each repeating the four-way markup — which is how they drifted
 * apart in the first place (the desktop footer draws the brand-coloured
 * marks, the mobile one draws line icons, but they must agree on WHICH
 * networks are shown).
 */
export function socialLinks(contact) {
    const c = contact || {};
    return SOCIAL_NETWORKS
        .map(n => ({ ...n, href: String(c[n.key] || '').trim() }))
        .filter(n => n.href);
}
