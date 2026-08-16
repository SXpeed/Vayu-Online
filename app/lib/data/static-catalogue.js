/**
 * Vayu — shared product catalogue.
 *
 * The live catalogue now comes from the admin panel via /api/catalogue
 * (see data/remote.js); the static object below is the offline fallback
 * and the seed for the admin database on first run. `idx` in
 * /pages/product.html?cat=&idx= is the position of an item in its category
 * array, so never reorder these lists.
 */

export const staticProductData = {
    fashion: [
        {
            name: 'Sanganer Silk Stole', price: '₹ 3,200', img: '/assets/images/prod_silk_stole.png', sub: 'women', isNew: true,
            gallery: ['/assets/images/prod_silk_stole.png', '/assets/images/cat_textiles.png', '/assets/images/prod_wool_shawl.png']
        },
        {
            name: 'Grey Patterned Linen Shirt', price: '₹ 4,800', img: '/assets/images/prod_grey_pattern_shirt.jpg', sub: 'men', isNew: true,
            gallery: ['/assets/images/prod_grey_pattern_shirt.jpg']
        },
        {
            name: 'Indigo Striped Kimono Jacket', price: '₹ 6,500', img: '/assets/images/prod_striped_jacket.jpg', sub: 'men', isNew: true,
            gallery: ['/assets/images/prod_striped_jacket.jpg']
        },
        {
            name: 'Heritage Linen Kurta', price: '₹ 5,400', img: '/assets/images/prod_linen_kurta.png', sub: 'men',
            gallery: ['/assets/images/prod_linen_kurta.png', '/assets/images/cat_apparel.png', '/assets/images/prod_silk_stole.png']
        },
        {
            name: 'Handwoven Wool Shawl', price: '₹ 4,100', img: '/assets/images/prod_wool_shawl.png', sub: 'women',
            gallery: ['/assets/images/prod_wool_shawl.png', '/assets/images/cat_textiles.png', '/assets/images/prod_silk_stole.png']
        },
        {
            name: 'Brass Cuff Bracelet', price: '₹ 2,800', img: '/assets/images/prod_brass_cuff.png', sub: 'accessories', isNew: true,
            gallery: ['/assets/images/prod_brass_cuff.png', '/assets/images/cat_jewelry.png', '/assets/images/cat_objects.png']
        },
        {
            name: 'Black Obsidian Lamp', price: '₹ 14,500', img: '/assets/images/black_lamp.png', sub: 'accessories',
            gallery: ['/assets/images/black_lamp.png', '/assets/images/prod_crimson_floor_lamp.png', '/assets/images/prod_lotus_urli_lamp.png']
        }
    ],
    furniture: [
        {
            name: 'Teakwood Lounge Chair', price: '₹ 24,500', img: '/assets/images/prod_teak_chair.png', sub: 'seating', isNew: true,
            gallery: ['/assets/images/prod_teak_chair.png', '/assets/images/cat_furniture.png', '/assets/images/prod_cane_side_table.png']
        },
        {
            name: 'Carved Console Table', price: '₹ 32,000', img: '/assets/images/prod_console_table.png', sub: 'console-tables',
            gallery: ['/assets/images/prod_console_table.png', '/assets/images/cat_furniture.png', '/assets/images/prod_stone_coffee_table.png']
        },
        {
            name: 'Stone-Top Coffee Table', price: '₹ 28,400', img: '/assets/images/prod_stone_coffee_table.png', sub: 'coffee-tables',
            gallery: ['/assets/images/prod_stone_coffee_table.png', '/assets/images/prod_console_table.png', '/assets/images/prod_cane_side_table.png']
        },
        {
            name: 'Cane Side Table', price: '₹ 12,900', img: '/assets/images/prod_cane_side_table.png', sub: 'side-tables',
            gallery: ['/assets/images/prod_cane_side_table.png', '/assets/images/prod_teak_chair.png', '/assets/images/cat_furniture.png']
        }
    ],
    home: [
        {
            name: 'Ceramic Dinner Plate Set', price: '₹ 6,200', img: '/assets/images/prod_ceramic_plate_set.png', sub: 'tableware',
            gallery: ['/assets/images/prod_ceramic_plate_set.png', '/assets/images/cat_tableware.png', '/assets/images/prod_murano_glassware.png']
        },
        {
            name: 'Murano Glassware Pair', price: '₹ 7,800', img: '/assets/images/prod_murano_glassware.png', sub: 'drinkware', isNew: true,
            gallery: ['/assets/images/prod_murano_glassware.png', '/assets/images/prod_ceramic_plate_set.png', '/assets/images/cat_tableware.png']
        },
        {
            name: 'Lotus Urli Lamp', price: '₹ 6,900', img: '/assets/images/prod_lotus_urli_lamp.png', sub: 'lighting',
            gallery: ['/assets/images/prod_lotus_urli_lamp.png', '/assets/images/prod_crimson_floor_lamp.png', '/assets/images/black_lamp.png']
        },
        {
            name: 'Raga Crimson Floor Lamp', price: '₹ 38,500', img: '/assets/images/prod_crimson_floor_lamp.png', sub: 'lighting', isNew: true,
            gallery: ['/assets/images/prod_crimson_floor_lamp.png', '/assets/images/prod_lotus_urli_lamp.png', '/assets/images/black_lamp.png']
        }
    ],
    decor: [
        {
            name: 'Terracotta Ritual Vase', price: '₹ 4,600', img: '/assets/images/prod_terracotta_vase.png', sub: 'vases',
            gallery: ['/assets/images/prod_terracotta_vase.png', '/assets/images/cat_objects.png', '/assets/images/cat_art.png']
        },
        {
            name: 'Bronze Sculpture Study', price: '₹ 15,200', img: '/assets/images/cat_objects.png', sub: 'artifacts', isNew: true,
            gallery: ['/assets/images/cat_objects.png', '/assets/images/prod_terracotta_vase.png', '/assets/images/cat_art.png']
        },
        {
            name: 'Ritual Candle Stand', price: '₹ 3,400', img: '/assets/images/cat_objects.png', sub: 'candle-holders',
            gallery: ['/assets/images/cat_objects.png', '/assets/images/prod_lotus_urli_lamp.png', '/assets/images/prod_terracotta_vase.png']
        },
        {
            name: 'Framed Miniature Art', price: '₹ 9,800', img: '/assets/images/cat_art.png', sub: 'wall-art',
            gallery: ['/assets/images/cat_art.png', '/assets/images/prod_silk_stole.png', '/assets/images/cat_textiles.png']
        }
    ],
    materials: [
        {
            name: 'Vintage Brass Shiva Mukhalingam', price: '₹ 18,500', img: '/assets/images/prod_brass_shiva_head.jpg', sub: 'brass', isNew: true,
            gallery: ['/assets/images/prod_brass_shiva_head.jpg', '/assets/images/cat_objects.png']
        },
        {
            name: 'Hand-Beaten Brass Bowl', price: '₹ 3,900', img: '/assets/images/cat_objects.png', sub: 'brass',
            gallery: ['/assets/images/cat_objects.png', '/assets/images/prod_brass_cuff.png', '/assets/images/prod_lotus_urli_lamp.png']
        },
        {
            name: 'Marble Serving Board', price: '₹ 5,600', img: '/assets/images/prod_stone_coffee_table.png', sub: 'marble', isNew: true,
            gallery: ['/assets/images/prod_stone_coffee_table.png', '/assets/images/prod_ceramic_plate_set.png', '/assets/images/cat_furniture.png']
        },
        {
            name: 'Murano Glass Vessel', price: '₹ 8,200', img: '/assets/images/prod_murano_glassware.png', sub: 'murano-glass',
            gallery: ['/assets/images/prod_murano_glassware.png', '/assets/images/prod_ceramic_plate_set.png', '/assets/images/prod_terracotta_vase.png']
        },
        {
            name: 'Block-Print Textile Panel', price: '₹ 2,900', img: '/assets/images/prod_silk_stole.png', sub: 'textile',
            gallery: ['/assets/images/prod_silk_stole.png', '/assets/images/cat_textiles.png', '/assets/images/prod_wool_shawl.png']
        }
    ],
    // Accents and Souvenir were listed in every menu with nothing behind
    // them, so both were dead ends — every route into them ended on the
    // "no pieces listed yet" empty state. These are opening pieces using
    // existing photography; replace names, prices and images as the real
    // inventory is shot. `sub` values match the slugs derived from
    // js/taxonomy.js.
    accents: [
        {
            name: 'Handwoven Cotton Cushion Cover', price: '₹ 1,900', img: '/assets/images/cat_textiles.png', sub: 'cushions', isNew: true,
            gallery: ['/assets/images/cat_textiles.png', '/assets/images/prod_wool_shawl.png', '/assets/images/prod_silk_stole.png']
        },
        {
            name: 'Block-Print Bolster Cushion', price: '₹ 2,400', img: '/assets/images/prod_wool_shawl.png', sub: 'cushions',
            gallery: ['/assets/images/prod_wool_shawl.png', '/assets/images/cat_textiles.png']
        },
        {
            name: 'Brass Inlay Serving Tray', price: '₹ 4,300', img: '/assets/images/cat_objects.png', sub: 'trays', isNew: true,
            gallery: ['/assets/images/cat_objects.png', '/assets/images/prod_brass_cuff.png', '/assets/images/cat_tableware.png']
        },
        {
            name: 'Teak Frame Wall Mirror', price: '₹ 11,800', img: '/assets/images/cat_furniture.png', sub: 'mirrors',
            gallery: ['/assets/images/cat_furniture.png', '/assets/images/prod_console_table.png']
        }
    ],
    souvenir: [
        {
            name: 'Miniature Brass Urli', price: '₹ 1,600', img: '/assets/images/prod_lotus_urli_lamp.png', sub: 'keepsakes', isNew: true,
            gallery: ['/assets/images/prod_lotus_urli_lamp.png', '/assets/images/cat_objects.png']
        },
        {
            name: 'Terracotta Bell Keepsake', price: '₹ 950', img: '/assets/images/prod_terracotta_vase.png', sub: 'keepsakes',
            gallery: ['/assets/images/prod_terracotta_vase.png', '/assets/images/cat_objects.png']
        },
        {
            name: 'Tea & Ceramic Gift Set', price: '₹ 3,800', img: '/assets/images/prod_ceramic_plate_set.png', sub: 'gift-sets',
            gallery: ['/assets/images/prod_ceramic_plate_set.png', '/assets/images/cat_tableware.png', '/assets/images/prod_murano_glassware.png']
        },
        {
            name: 'Hand-Bound Paper Journal', price: '₹ 1,200', img: '/assets/images/cat_art.png', sub: 'stationery',
            gallery: ['/assets/images/cat_art.png', '/assets/images/journal_craft_heritage.png']
        }
    ]
};
