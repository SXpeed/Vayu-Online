/**
 * Vayu — category taxonomy.
 *
 * Single source of truth for every place a category or sub-category is
 * named. Before this file the same list was written out by hand in six
 * places — catData in script.js, the MENU and COLLECTION panels in
 * partials/header.html, the mobile sheet and footer column in
 * partials/footer.html, the directory in pages/collection.html, plus
 * label maps in cart.html, product.html and include.js — and they had
 * already drifted apart twice (?sub=linen and ?sub=glass were links to
 * slugs that exist nowhere in the taxonomy, so both landed on an empty
 * grid; Accents and Souvenir never reached the phone menu at all).
 *
 * Everything downstream is now rendered from this object, so adding a
 * category or a sub-category is one edit here.
 *
 * `slug` is not stored: it is always derived from `label` by subToSlug,
 * which is the same rule the URL ?sub= parameter uses. `sub` values in
 * js/catalogue.js must match those derived slugs.
 */

export const categories = {
    fashion: {
        title: 'Fashion',
        banner: '/assets/images/banner_fashion_32_9.png',
        subs: [
            { label: 'Men', thumb: '/assets/images/prod_linen_kurta.png' },
            { label: 'Women', thumb: '/assets/images/prod_silk_stole.png' },
            { label: 'Accessories', thumb: '/assets/images/cat_jewelry.png' }
        ]
    },
    furniture: {
        title: 'Furniture',
        banner: '/assets/images/banner_furniture_21_9.png?v=2',
        subs: [
            { label: 'Seating', thumb: '/assets/images/prod_teak_chair.png' },
            { label: 'Coffee Tables', thumb: '/assets/images/prod_stone_coffee_table.png' },
            { label: 'Side Tables', thumb: '/assets/images/prod_cane_side_table.png' },
            { label: 'Console Tables', thumb: '/assets/images/prod_console_table.png' }
        ]
    },
    home: {
        title: 'Home',
        banner: '/assets/images/banner_home_21_9.png?v=2',
        subs: [
            { label: 'Tableware', thumb: '/assets/images/prod_ceramic_plate_set.png' },
            { label: 'Drinkware', thumb: '/assets/images/prod_murano_glassware.png' },
            { label: 'Serveware', thumb: '/assets/images/cat_tableware.png' },
            { label: 'Home Linen', thumb: '/assets/images/cat_textiles.png' },
            { label: 'Lighting', thumb: '/assets/images/prod_lotus_urli_lamp.png' }
        ]
    },
    decor: {
        title: 'Decor',
        banner: '/assets/images/banner_decor_21_9.png?v=2',
        subs: [
            { label: 'Artifacts', thumb: '/assets/images/cat_objects.png' },
            { label: 'Wall Art', thumb: '/assets/images/cat_art.png' },
            { label: 'Vases', thumb: '/assets/images/prod_terracotta_vase.png' },
            { label: 'Bowls', thumb: '/assets/images/cat_tableware.png' },
            { label: 'Candle Holders', thumb: '/assets/images/prod_lotus_urli_lamp.png' }
        ]
    },
    materials: {
        title: 'Materials',
        banner: '/assets/images/banner_materials_21_9.png?v=2',
        subs: [
            { label: 'Brass', thumb: '/assets/images/prod_brass_cuff.png' },
            { label: 'Wood', thumb: '/assets/images/cat_furniture.png' },
            { label: 'Marble', thumb: '/assets/images/prod_stone_coffee_table.png' },
            { label: 'Murano Glass', thumb: '/assets/images/prod_murano_glassware.png' },
            { label: 'Ceramic', thumb: '/assets/images/prod_ceramic_plate_set.png' },
            { label: 'Textile', thumb: '/assets/images/prod_wool_shawl.png' }
        ]
    },
    // Accents and Souvenir were added to every menu while the catalogue held
    // nothing under either, so both were dead ends: each route ended on the
    // "no pieces listed yet" message. They now carry a sub-taxonomy and
    // stock in js/catalogue.js. The banner art is still a placeholder reusing
    // an existing image — swap `banner` when the 32:9 pieces are shot.
    accents: {
        title: 'Accents',
        banner: '/assets/images/cat_objects.png',
        subs: [
            { label: 'Cushions', thumb: '/assets/images/cat_textiles.png' },
            { label: 'Trays', thumb: '/assets/images/cat_objects.png' },
            { label: 'Mirrors', thumb: '/assets/images/cat_furniture.png' }
        ]
    },
    souvenir: {
        title: 'Souvenir',
        banner: '/assets/images/cat_art.png',
        subs: [
            { label: 'Keepsakes', thumb: '/assets/images/prod_terracotta_vase.png' },
            { label: 'Gift Sets', thumb: '/assets/images/prod_ceramic_plate_set.png' },
            { label: 'Stationery', thumb: '/assets/images/cat_art.png' }
        ]
    }
};

/** 'Murano Glass' → 'murano-glass'. The rule the ?sub= parameter follows. */
export const subToSlug = (label) => String(label).toLowerCase().replace(/\s+/g, '-');

/** 'murano-glass' → 'Murano Glass'. Used for breadcrumbs and page titles. */
export const slugToLabel = (slug) => String(slug || '')
    .split('-')
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');

/** Display name for a category slug, falling back to the slug itself. */
export const categoryTitle = (slug) => categories[slug]?.title || slug || '';

/** [slug, category] pairs in menu order. */
export const categoryEntries = () => Object.entries(categories);

/** Sub-categories of a category as {slug, label, thumb}; [] if unknown. */
export const subsOf = (slug) => (categories[slug]?.subs || [])
    .map(s => ({ ...s, slug: subToSlug(s.label) }));

/** Link to a category, or to one of its sub-categories. */
export const catHref = (cat, subSlug) =>
    `/pages/collection-detail.html?cat=${cat}${subSlug ? `&sub=${subSlug}` : ''}`;
