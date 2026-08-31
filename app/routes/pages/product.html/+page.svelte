<script>
  import Seo from '#lib/components/Seo.svelte';
  // Vayu — /pages/product.html, ported from public/pages/product.html.
  import { onMount } from 'svelte';

  // Emitted through {@html} rather than written as a component <style>:
  // Svelte scopes component styles, and these selectors target markup
  // that the global stylesheet and other components own.
  const pageCss = "<style>.prod-suggest-section {\n                margin: 0 0 60px;\n            }\n\n            .prod-suggest-title {\n                font-family: 'Cormorant Garamond', serif;\n                font-size: clamp(24px, 2.5vw, 32px);\n                font-weight: 500;\n                color: var(--ink);\n                margin-bottom: 24px;\n                padding-bottom: 12px;\n                border-bottom: 1px solid #E8E2D8;\n            }\n\n            /* The grid and the cards are .prod-grid / .product from\n               styles.css \u2014 nothing to declare here. */\n.product-detail {\n                display: grid;\n                grid-template-columns: 1fr 1fr;\n                gap: 32px;\n                margin: 8px 0 60px;\n                align-items: start;\n            }\n\n            .product-gallery {\n                position: sticky;\n                top: calc(var(--hdr-h, 58px) + 16px);\n            }\n\n            .prod-gallery-wrapper {\n                position: relative;\n                width: 100%;\n                overflow: hidden;\n                border-radius: 2px;\n                background: #FFFFFF;\n            }\n\n            .prod-gallery-track {\n                display: flex;\n                scroll-snap-type: x mandatory;\n                overflow-x: scroll;\n                scroll-behavior: smooth;\n                scrollbar-width: none;\n                -ms-overflow-style: none;\n            }\n\n            .prod-gallery-track::-webkit-scrollbar {\n                display: none;\n            }\n\n            .prod-gallery-slide {\n                flex: 0 0 100%;\n                scroll-snap-align: center;\n                aspect-ratio: 1 / 1;\n                overflow: hidden;\n            }\n\n            .prod-gallery-slide img {\n                width: 100%;\n                height: 100%;\n                object-fit: cover;\n                pointer-events: none;\n            }\n\n            .prod-gallery-dots {\n                display: flex;\n                justify-content: center;\n                gap: 8px;\n                margin: 8px 0;\n            }\n\n            .prod-dot {\n                width: 8px;\n                height: 8px;\n                border-radius: 50%;\n                background: #D4CFC4;\n                border: none;\n                padding: 0;\n                cursor: pointer;\n                transition: all 0.25s ease;\n            }\n\n            .prod-dot.active {\n                background: var(--ink);\n                transform: scale(1.25);\n            }\n\n            .product-info-panel {\n                padding: 0;\n            }\n\n            /* Desktop only. The info column sits beside the gallery rather\n               than under it, so with no padding its badge ran flush with the\n               top edge of the image next to it, and flush against the gallery on the\n               left. Top and left only \u2014 the panel already ends on the\n               accordion's own rule, so bottom padding just lengthened the\n               column past the image, and right padding would pull the\n               accordion's rules in from the content column's own edge.\n               The gallery is sticky and the grid is align-items: start, so\n               this moves nothing else. Phones keep padding: 0 \u2014 stacked, the\n               same rule would only open a gap under the gallery and indent\n               the whole panel against the page gutter. */\n            @media (min-width: 769px) {\n                .product-info-panel {\n                    padding: 80px 0 0 40px;\n                }\n            }\n\n            .prod-badge {\n                display: inline-block;\n                font-size: 10px;\n                letter-spacing: 0.16em;\n                text-transform: uppercase;\n                color: var(--accent);\n                font-weight: 600;\n                margin-bottom: 10px;\n            }\n\n            .prod-title {\n                font-family: 'Cormorant Garamond', serif;\n                font-size: clamp(28px, 3vw, 40px);\n                font-weight: 500;\n                color: var(--ink);\n                line-height: 1.15;\n                margin: 0;\n            }\n\n            .prod-price {\n                font-size: 20px;\n                color: var(--ink);\n                font-weight: 500;\n                margin: 16px 0;\n            }\n\n            /* ---- Action bar --------------------------------------------\n               Stacked hierarchy instead of four controls fighting on one\n               line: qty + Add to Cart share a row, Buy Now sits full width\n               beneath it, and the wishlist drops to a quiet text button.\n               Outlines are inset box-shadows, not borders \u2014 the global layer\n               in styles.css forces border-color: transparent !important.\n               ------------------------------------------------------------ */\n            .prod-action-bar {\n                display: grid;\n                gap: 6px;\n                margin-bottom: 22px;\n            }\n\n            .prod-action-row {\n                display: flex;\n                align-items: stretch;\n                gap: 6px;\n            }\n\n            .prod-qty {\n                display: flex;\n                align-items: center;\n                background: #FAF8F5;\n                border-radius: 2px;\n                overflow: hidden;\n                height: 40px;\n                flex: 0 0 auto;\n            }\n\n            .prod-qty-btn {\n                width: 30px;\n                height: 100%;\n                border: none;\n                background: transparent;\n                color: #8A8681;\n                font-size: 15px;\n                line-height: 1;\n                cursor: pointer;\n                display: grid;\n                place-items: center;\n                transition: color 0.2s ease;\n            }\n\n            .prod-qty-btn:hover {\n                color: var(--accent);\n            }\n\n            .prod-qty-val {\n                min-width: 22px;\n                text-align: center;\n                font-family: 'Jost', sans-serif;\n                font-size: 12.5px;\n                font-weight: 500;\n                color: var(--ink);\n            }\n\n            /* primary \u2014 the one solid block on the page */\n            .prod-cart-btn {\n                flex: 1 1 auto;\n                min-width: 0;\n                padding: 0 18px;\n                height: 40px;\n                background: var(--ink);\n                color: #fff;\n                border: none;\n                border-radius: 2px;\n                font-family: 'Jost', sans-serif;\n                font-size: 10.5px;\n                letter-spacing: 0.16em;\n                text-transform: uppercase;\n                font-weight: 500;\n                cursor: pointer;\n                transition: background 0.25s ease;\n            }\n\n            .prod-cart-btn:hover {\n                background: var(--accent);\n            }\n\n            /* secondary \u2014 outlined so it does not compete with the primary */\n            .prod-buy-btn {\n                width: 100%;\n                height: 40px;\n                padding: 0 18px;\n                background: transparent;\n                color: var(--ink);\n                border: none;\n                border-radius: 2px;\n                box-shadow: inset 0 0 0 1px #D9D3C9;\n                font-family: 'Jost', sans-serif;\n                font-size: 10.5px;\n                letter-spacing: 0.16em;\n                text-transform: uppercase;\n                font-weight: 500;\n                cursor: pointer;\n                transition: box-shadow 0.25s ease, color 0.25s ease;\n            }\n\n            .prod-buy-btn:hover {\n                color: var(--accent);\n                box-shadow: inset 0 0 0 1px var(--accent);\n            }\n\n            /* tertiary \u2014 plain text, no chrome */\n            .prod-wish-btn {\n                display: inline-flex;\n                align-items: center;\n                justify-content: center;\n                gap: 6px;\n                padding: 3px 4px;\n                background: none;\n                border: none;\n                cursor: pointer;\n                color: #8A8681;\n                font-family: 'Jost', sans-serif;\n                font-size: 10px;\n                letter-spacing: 0.14em;\n                text-transform: uppercase;\n                font-weight: 500;\n                transition: color 0.2s ease;\n            }\n\n            .prod-wish-btn:hover,\n            .prod-wish-btn.is-wished {\n                color: var(--accent);\n            }\n\n            .prod-wish-btn.is-wished svg {\n                fill: currentColor;\n            }\n\n            /* ---- Accordion dropdowns ---- */\n            .prod-accordion {\n                border-top: 1px solid #E8E2D8;\n            }\n\n            .prod-acc-item {\n                border-bottom: 1px solid #E8E2D8;\n            }\n\n            .prod-acc-header {\n                width: 100%;\n                display: flex;\n                justify-content: space-between;\n                align-items: center;\n                padding: 16px 0;\n                background: none;\n                border: none;\n                cursor: pointer;\n                font-family: 'Jost', sans-serif;\n                font-size: 13px;\n                letter-spacing: 0.08em;\n                text-transform: uppercase;\n                font-weight: 500;\n                color: var(--ink);\n                transition: color 0.2s ease;\n            }\n\n            .prod-acc-header:hover {\n                color: var(--accent);\n            }\n\n            .prod-acc-icon {\n                transition: transform 0.3s ease;\n                flex-shrink: 0;\n            }\n\n            .prod-acc-item.open .prod-acc-icon {\n                transform: rotate(180deg);\n            }\n\n            .prod-acc-body {\n                max-height: 0;\n                overflow: hidden;\n                transition: max-height 0.35s ease, padding 0.35s ease;\n            }\n\n            .prod-acc-item.open .prod-acc-body {\n                max-height: 400px;\n                padding-bottom: 16px;\n            }\n\n            .prod-acc-body p {\n                font-size: 14px;\n                color: var(--body);\n                line-height: 1.7;\n                margin: 0;\n            }\n\n            .prod-meta-row {\n                display: flex;\n                gap: 24px;\n                padding: 6px 0;\n            }\n\n            .prod-meta-label {\n                font-size: 12px;\n                letter-spacing: 0.1em;\n                text-transform: uppercase;\n                color: var(--gold);\n                font-weight: 600;\n                min-width: 90px;\n            }\n\n            .prod-meta-val {\n                font-size: 14px;\n                color: var(--body);\n            }\n\n            @media (max-width: 768px) {\n                .product-detail {\n                    grid-template-columns: 1fr;\n                    gap: 16px;\n                }\n\n                .product-gallery {\n                    position: static;\n                }\n\n                /* the stacked bar already reflows; phones just get a slightly\n                   taller tap target than the desktop 40px */\n                .prod-qty,\n                .prod-cart-btn,\n                .prod-buy-btn {\n                    height: 42px;\n                }\n            }</style>";

  // The option rails, kept as their own readable block rather than folded
  // into the escaped string above. Same reason for the {@html}: the markup
  // is built by #lib/pages/product.js at runtime, so Svelte's scoping hash
  // would never be applied to it and a component <style> would not match.
  const optionCss = `<style>
    .prod-options {
      margin: 18px 0 22px;
      display: grid;
      gap: 14px;
      font-family: 'Jost', sans-serif;
    }

    /* The chosen pattern, spelled out — a 40px tile cannot say
       "Ripple Stripes — Dusty dark pink". */
    .prod-opt-caption {
      font-size: 14px;
      color: var(--body);
      letter-spacing: 0.01em;
    }

    .prod-opt-row {
      display: grid;
      grid-template-columns: 76px 1fr;
      align-items: center;
      gap: 12px;
    }

    .prod-opt-label {
      font-size: 13px;
      color: var(--body);
    }

    .prod-opt-rail {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    /* ---- swatches ---- */
    .prod-swatch {
      width: 42px;
      height: 42px;
      padding: 0;
      border: none;
      border-radius: 1px;
      cursor: pointer;
      background-size: cover;
      background-position: center;
      box-shadow: inset 0 0 0 1px rgba(20, 18, 16, 0.1);
      /* The selected marker is an underline drawn clear of the tile, which
         is why the box has room beneath it rather than a border on it. */
      background-clip: padding-box;
      position: relative;
      transition: box-shadow 0.2s ease;
    }

    .prod-swatch:hover {
      box-shadow: inset 0 0 0 1px rgba(20, 18, 16, 0.35);
    }

    .prod-swatch.is-on::after,
    .prod-opt-cell.is-on::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      bottom: -7px;
      height: 1.5px;
      background: var(--ink);
    }

    /* ---- label cells (sizes) ---- */
    .prod-opt-rail--divided {
      gap: 0;
    }

    .prod-opt-cell {
      position: relative;
      padding: 6px 18px;
      background: none;
      border: none;
      cursor: pointer;
      font-family: inherit;
      font-size: 14px;
      color: var(--ink);
      transition: color 0.2s ease;
    }

    /* Hairlines between cells, not around them: one continuous row. */
    .prod-opt-cell + .prod-opt-cell {
      box-shadow: inset 1px 0 0 #E3DDD2;
    }

    .prod-opt-cell:hover:not(:disabled) {
      color: var(--accent);
    }

    /* Unavailable, not invisible — a shopper should see that the size
       exists and is simply not stocked in the colour they picked. */
    .prod-swatch.is-out,
    .prod-opt-cell.is-out {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .prod-opt-cell.is-out {
      text-decoration: line-through;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }

    @media (max-width: 768px) {
      .prod-opt-row {
        grid-template-columns: 1fr;
        gap: 6px;
      }
    }
  </style>`;

  onMount(() => {
    import('#lib/pages/product.js').then(m => m.default?.());
  });
</script>

<Seo
  title="Product"
  description="A piece from the Vayu collection."
  path="/pages/product.html"
  noindex
/>

{@html pageCss}
{@html optionCss}

<main class="wrap product-page">
        <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="/index.html">Home</a>
            <span class="sep">|</span>
            <a href="/pages/collection.html">Collection</a>
            <span class="sep">|</span>
            <a id="crumbCategory" href="/pages/collection-detail.html">Category</a>
            <span class="sep">|</span>
            <span id="crumbProduct">Product</span>
        </nav>

        <section class="product-detail">
            <div class="product-gallery">
                <div class="prod-gallery-wrapper">
                    <div class="prod-gallery-track" id="prodGalleryTrack">
                        <!-- Images inserted dynamically -->
                    </div>
                </div>
                <div class="prod-gallery-dots" id="prodGalleryDots">
                    <!-- Dots inserted dynamically -->
                </div>
            </div>

            <div class="product-info-panel">
                <div id="prodBadge" class="prod-badge" style="display:none;">New Arrival</div>
                <h1 id="prodName" class="prod-title" aria-label="Product name">Loading…</h1>
                <div id="prodPrice" class="prod-price"></div>
                <div class="prod-action-bar">
                    <div class="prod-action-row">
                        <div class="prod-qty">
                            <button class="prod-qty-btn" id="qtyMinus" aria-label="Decrease quantity">−</button>
                            <span class="prod-qty-val" id="qtyVal">1</span>
                            <button class="prod-qty-btn" id="qtyPlus" aria-label="Increase quantity">+</button>
                        </div>
                        <button class="prod-cart-btn" id="prodCartBtn">Add to Cart</button>
                    </div>
                    <button class="prod-buy-btn" id="prodBuyBtn">Buy Now</button>
                    <button class="prod-wish-btn" id="prodWishBtn" aria-pressed="false">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                            <path
                                d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z">
                            </path>
                        </svg>
                        <span class="prod-wish-label">Add to Wishlist</span>
                    </button>
                </div>

                <!-- Description, Dimensions, Materials & Origin, Care and
                     Shipping & Returns, built by lib/pages/product.js from
                     what the panel was given for this piece. It used to be
                     five blocks of fixed markup here, which meant every
                     object in the shop measured 32 x 32 x 45 cm and weighed
                     2.4 kg. A section with nothing behind it is not
                     rendered at all. -->
                <div class="prod-accordion" id="prodAccordion"></div>
            </div>
        </section>

        <!-- Suggested Products -->
        <section class="prod-suggest-section">
            <h2 class="prod-suggest-title">You May Also Like</h2>
            <!-- .prod-grid, not a grid of its own: these are the same tiles as
                 the collection page, so they inherit its columns, its 4px
                 gaps and the .product card styling from styles.css -->
            <div class="prod-grid" id="prodSuggestGrid"></div>
        </section>

        

        
    </main>
