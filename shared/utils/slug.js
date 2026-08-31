/**
 * Vayu — URL slugs.
 *
 * A product's public address is /products/<slug>, so the slug has to be
 * stable, unique and safe to put between two forward slashes. That is the
 * whole job; everything below is about the edge cases that break it.
 *
 * Stability matters more than prettiness. Once a slug is minted it is the
 * product's canonical URL — search engines index it, people link to it — so
 * `slugFor` only ever mints one for a product that has none. Renaming a
 * product in the panel does NOT move its URL, because silently changing a
 * ranked URL costs the accumulated link equity and 404s every existing link.
 * Changing the address is a deliberate act, which is what `slug` being an
 * editable field in the panel is for.
 */

/**
 * "Brass Lotus Diya" → "brass-lotus-diya".
 *
 * NFKD + stripping combining marks folds the accented characters a product
 * name can carry ("Café", "Jenjum") down to ASCII rather than dropping them,
 * so "Café Table" becomes "cafe-table" and not "caf-table".
 */
export function slugify(input) {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // combining marks left by NFKD
    .replace(/['’]/g, '')              // possessives join, they do not split
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')       // everything else is a separator
    .replace(/^-+|-+$/g, '')           // no leading or trailing hyphen
    .slice(0, 80)
    .replace(/-+$/, '');               // the slice may have left one
}

/**
 * A slug that no other product holds.
 *
 * The UNIQUE index on products(slug) is the real guarantee; this is what
 * keeps a collision from reaching it as a 500. Two products called "Lotus
 * Diya" are ordinary in a catalogue, so the second becomes lotus-diya-2.
 *
 * `excludeId` is the product being saved: without it, editing a product
 * would find its own row, decide its slug was taken, and rename it on every
 * save — lotus-diya, lotus-diya-2, lotus-diya-3.
 */
export async function uniqueSlug(store, base, excludeId = null) {
  const root = slugify(base) || 'product';

  const rows = await store.all(
    // The parentheses are load-bearing. AND binds tighter than OR, so
    // `WHERE slug = ? OR slug LIKE ? AND id != ?` parses as
    // `slug = ? OR (slug LIKE ? AND id != ?)` — the exact-match branch then
    // ignores excludeId entirely, every save finds the product's OWN slug
    // and concludes it is taken, and the product renames itself
    // teak-lounge-chair -> -2 -> -3 on each save, moving its own URL every
    // time. That is the failure excludeId exists to prevent.
    `SELECT slug FROM products WHERE (slug = ? OR slug LIKE ?) ${excludeId ? 'AND id != ?' : ''}`,
    ...(excludeId ? [root, `${root}-%`, excludeId] : [root, `${root}-%`]),
  );
  const taken = new Set(rows.map(r => r.slug));
  if (!taken.has(root)) return root;

  // Start at 2 — "lotus-diya" and "lotus-diya-2" reads better than a -1.
  for (let n = 2; n < 1000; n++) {
    const candidate = `${root}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  // A thousand identical names is not a catalogue, it is a bug — but never
  // fail a save over it.
  return `${root}-${Date.now().toString(36)}`;
}

/**
 * The slug to store for a product being written.
 *
 * Order matters: an explicit slug from the panel wins, then the one already
 * on the row (never re-minted — see the note above), and only a product with
 * neither gets one derived from its name.
 */
export async function slugFor(store, { requested, existing, name, id }) {
  if (requested) return uniqueSlug(store, requested, id);
  if (existing) return existing;
  return uniqueSlug(store, name, id);
}
