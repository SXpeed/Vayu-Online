/**
 * Vayu — how a product is written into a CSV cell, and read back out.
 *
 * Both directions live here on purpose. The export used to encode these by
 * hand in services/users/admin.js and the import decoded a fraction of them
 * in services/products/admin.js, which is how the two ended up disagreeing:
 * the export grew to carry every field and the import still read nine of
 * them, so a file exported, edited in a spreadsheet and imported back came
 * home with its tags, options, variants and detail sections emptied.
 *
 * The separators are chosen so a cell survives a spreadsheet and so no
 * separator can occur in what it separates:
 *
 *   |    between items in a list        khadi|handwoven
 *   =    label from value               Chest=42 in
 *   ,    between an option's values     Colour(swatch)=Indigo,Natural
 *   :    a value from its swatch        Indigo:#35415E
 *   ;    between variants               ...x12 ; ...x8
 *        (a variant's own combo is pipe-joined, so it cannot be a pipe)
 *   @    variant price ('=' prefix = inherits the product's)
 *   x    variant stock
 */

const LIST = '|';
const VARIANT = ';';

const clean = (v) => String(v ?? '').trim();
const split = (v, sep = LIST) => clean(v).split(sep).map(s => s.trim()).filter(Boolean);

/* ---------- plain lists (tags, gallery) ---------- */

export const encodeList = (list) => (list || []).join(LIST);
export const decodeList = (cell) => split(cell);

/* ---------- yes / no ---------- */

export const encodeBool = (v) => (v ? 'yes' : 'no');
/** Tolerant on the way in: a spreadsheet may hand back TRUE, 1 or Y. */
export const decodeBool = (cell) => ['yes', 'y', 'true', '1'].includes(clean(cell).toLowerCase());

/* ---------- categories: fashion:men|decor ---------- */

export const encodeCategories = (cats) => (cats || [])
    .map(c => c.cat + (c.sub ? ':' + c.sub : ''))
    .join(LIST);

export const decodeCategories = (cell) => split(cell).map((part) => {
    const [cat, sub = ''] = part.split(':');
    return { cat: clean(cat).toLowerCase(), sub: clean(sub).toLowerCase() };
}).filter(c => c.cat);

/* ---------- spec rows: Chest=42 in|Length=40 in ---------- */

export const encodeSpecs = (rows) => (rows || [])
    .map(r => `${r.label}=${r.value ?? ''}`)
    .join(LIST);

export const decodeSpecs = (cell) => split(cell).map((part) => {
    const i = part.indexOf('=');
    return i === -1
        ? { label: part.trim(), value: '' }
        : { label: part.slice(0, i).trim(), value: part.slice(i + 1).trim() };
}).filter(r => r.label);

/* ---------- options: Colour(swatch)=Indigo:#35415E,Natural|Size(text)=S,M ---------- */

export const encodeOptions = (options) => (options || [])
    .map(o => `${o.name}(${o.kind || 'text'})=`
        + (o.values || []).map(v => v.label + (v.swatch ? ':' + v.swatch : '')).join(','))
    .join(LIST);

export const decodeOptions = (cell) => split(cell).map((part) => {
    const eq = part.indexOf('=');
    if (eq === -1) return null;
    const head = part.slice(0, eq).trim();
    const m = head.match(/^(.*?)\s*\((swatch|text)\)$/i);
    const name = (m ? m[1] : head).trim();
    if (!name) return null;
    return {
        name,
        kind: m ? m[2].toLowerCase() : 'text',
        values: part.slice(eq + 1).split(',').map((raw) => {
            const [label, swatch = ''] = raw.split(':');
            return { label: clean(label), swatch: clean(swatch), heading: '' };
        }).filter(v => v.label),
    };
}).filter(o => o && o.values.length);

/* ---------- variants: Colour=Indigo|Size=S @8500 x12 ; ... ---------- */

/** "Colour=Indigo|Size=S" -> "Indigo / S", the label a cart line shows. */
const labelFromCombo = (combo) => combo
    .split(LIST)
    .map(p => p.slice(p.indexOf('=') + 1).trim())
    .filter(Boolean)
    .join(' / ');

/**
 * `@9800` is a price this variant overrides with. `@=8500` is the product's
 * own price, shown for readability but marked as inherited.
 *
 * The mark matters: a variant's null price means "whatever the product
 * costs", and writing the resolved number without it turned every inheriting
 * variant into an override on the way back in — so a later change to the
 * product's price would have left them all behind at the old one.
 */
export const encodeVariants = (variants, basePrice) => (variants || [])
    .map((v) => {
        const price = v.price == null ? `=${basePrice ?? ''}` : String(v.price);
        return `${v.combo || v.label} @${price} x${v.stock ?? 0}`;
    })
    .join(` ${VARIANT} `);

export const decodeVariants = (cell) => split(cell, VARIANT).map((part) => {
    // Read the trailing "@price xstock" off the end; whatever precedes it is
    // the combo, which may itself contain '=' and '|'.
    const m = part.match(/^(.*?)\s*@\s*(=?[0-9.]*)\s*x\s*(\d+)\s*$/);
    if (!m) return null;
    const combo = m[1].trim();
    if (!combo) return null;
    // A leading '=' (or nothing at all) means the variant takes the
    // product's price rather than setting one of its own.
    const raw = m[2];
    return {
        combo: combo.includes('=') ? combo : '',
        label: combo.includes('=') ? labelFromCombo(combo) : combo,
        price: raw === '' || raw.startsWith('=') ? null : Number(raw),
        stock: Number(m[3]) || 0,
        image: '',
    };
}).filter(Boolean);
