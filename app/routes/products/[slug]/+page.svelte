<script>
  import { BRAND } from '#shared/content/brand.js';
  import { onMount } from 'svelte';
  import { addToCart, toggleWishlist, isInWishlist } from '#lib/shop.js';
  import { findVariant, availableValues, openingVariant, parseCombo } from '#lib/options.js';
  import { showToast } from '#lib/core/toast.js';
  import { deliverySrc } from '#shared/content/picture.js';

  let { data } = $props();
  const p = $derived(data.product);
  const commerce = $derived(data.commerce);
  const related = $derived(data.related || []);
  const seo = $derived(data.seo);
  const category = $derived(data.category);

  let qty = $state(1);
  let active = $state(0);

  /**
   * The structured data. Emitted from the server-rendered document rather
   * than attached later by script: a crawler reads the HTML it is served,
   * and anything added after parse is not reliably seen.
   *
   * The stringified JSON is escaped for `<` before it goes into the tag. A
   * product description containing a literal closing script tag would
   * otherwise end this block early and spill the rest of the JSON into the
   * page as markup.
   */
  const productLd = $derived(JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    description: seo.description,
    image: p.gallery.map(g => new URL(g, seo.origin).href),
    sku: p.sku || undefined,
    brand: { '@type': 'Brand', name: 'Vayu' },
    offers: {
      '@type': 'Offer',
      url: seo.canonical,
      priceCurrency: commerce.currency,
      price: String(p.price),
      // Google treats an Offer with no priceValidUntil as one that may have
      // gone stale, and can stop showing the price. A year out is the
      // convention for a shop whose prices are not campaign-dated.
      priceValidUntil: new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10),
      availability: p.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@id': seo.origin + '/#organization' },
      // Shipping and returns are what Google Shopping now expects an Offer to
      // declare; without them a listing can show "shipping unknown" beside
      // competitors that state theirs. The numbers come from store settings,
      // not from here, so they cannot disagree with what checkout charges.
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: {
          '@type': 'MonetaryAmount',
          value: String(p.price >= commerce.freeShippingAbove ? 0 : commerce.shippingFlat),
          currency: commerce.currency,
        },
        shippingDestination: {
          '@type': 'DefinedRegion',
          addressCountry: 'IN',
        },
      },
      hasMerchantReturnPolicy: {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'IN',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: commerce.returnDays,
        returnMethod: 'https://schema.org/ReturnByMail',
      },
    },
  }).replace(/</g, '\\u003c'));

  const breadcrumbLd = $derived(JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: seo.origin + '/' },
      { '@type': 'ListItem', position: 2, name: 'Collection', item: seo.origin + '/pages/collection.html' },
      ...(category
        ? [{
            '@type': 'ListItem',
            position: 3,
            name: category.title,
            item: seo.origin + '/pages/collection-detail.html?cat=' + category.slug,
          }]
        : []),
      { '@type': 'ListItem', position: category ? 4 : 3, name: p.name, item: seo.canonical },
    ],
  }).replace(/</g, '\\u003c'));

  const ldTag = (json) => '<script type="application/ld+json">' + json + '<\/script>';

  /* ---------- options ---------- */

  /**
   * A product sold by colour and size was unbuyable on this page.
   *
   * The server has been sending `options` and `variants` all along and the
   * markup rendered neither, so there was nothing to choose with — and a
   * cart line with no variant is one the checkout refuses, because it would
   * price at the base rate against stock nobody tracks. The old
   * /pages/product.html had this picker; the page that replaced it, and that
   * crawlers are actually served, did not.
   *
   * The rules live in #lib/options.js, shared with the admin panel's combo
   * grid, so "what a combination is" is decided in exactly one place.
   */
  const options = $derived(p.options || []);

  /** name -> chosen value. Opens on the cheapest combination that can be bought. */
  let chosen = $state({});

  $effect(() => {
    // Re-seed when the product changes, not on every pick.
    // parseCombo, not a hand-rolled split: the stored key is
    // "Colour=Natural|Size=XXL" and the one parser for it lives in
    // options.js, shared with the admin panel's combo grid.
    const opening = openingVariant(p);
    chosen = opening?.combo ? parseCombo(opening.combo) : {};
  });

  const variant = $derived(findVariant(p, chosen));

  /** Every axis picked? Until then there is nothing to add to a cart. */
  const resolved = $derived(!options.length || options.every(o => chosen[o.name]));

  /**
   * With options, an unresolved selection is not "in stock by default": a
   * combination the shop never stocked has no variant row at all, and
   * treating that as buyable is how an order arrives for something that was
   * never made.
   */
  const canBuy = $derived(
    options.length ? (variant?.stock ?? 0) > 0 : p.inStock,
  );

  /** The variant's own price when it overrides, else the product's. */
  const shownPrice = $derived(
    variant && variant.price != null
      ? '₹ ' + Number(variant.price).toLocaleString('en-IN')
      : p.priceLabel,
  );

  const reachable = (option) => availableValues(p, option, chosen);

  /**
   * Pick a value, then move the other axes out of its way.
   *
   * Without this, choosing Natural while Small is selected lands on a
   * combination the shop does not stock: both rails show struck through, the
   * button is dead, and nothing says what to do about it. The shopper asked
   * for Natural, so Natural is what is honoured — the other axes step to
   * their first value that can actually be had with it.
   *
   * Only axes that have become unreachable are moved. A pick that is already
   * valid leaves the rest of the selection alone, so choosing a size does not
   * quietly change the colour underneath you.
   */
  function pick(optionName, value) {
    let next = { ...chosen, [optionName]: value };

    for (const other of options) {
      if (other.name === optionName) continue;
      const reachableNow = availableValues(p, other, next);
      if (!reachableNow.size || reachableNow.has(next[other.name])) continue;
      next = { ...next, [other.name]: [...reachableNow][0] };
    }
    chosen = next;
  }

  /**
   * The wishlist payload has to match what the product tiles send, or the
   * same piece saved from a tile and from this page would be two rows: the
   * list is keyed on id, falling back to cat/idx for products saved before
   * slugs existed.
   */
  const wishPayload = () => ({
    id: p.id, cat: category?.slug || '', idx: 0,
    name: p.name, price: p.priceLabel, img: p.img,
  });

  // Read once on mount rather than in $derived: isInWishlist reads
  // localStorage, which does not exist while the page is being prerendered.
  let wished = $state(false);
  onMount(() => { wished = isInWishlist(category?.slug || '', 0, p.id); });

  function wish() {
    wished = toggleWishlist(wishPayload());
    showToast?.(p.name + (wished ? ' added to wishlist' : ' removed from wishlist'));
  }

  function add(buyNow = false) {
    // The variant goes with the line. Without it the checkout prices at the
    // base rate against stock nobody tracks, which is why it refuses such a
    // line outright.
    addToCart({
      id: p.id,
      slug: p.slug,
      cat: category?.slug || '',
      idx: 0,
      name: variant ? `${p.name} — ${variant.label}` : p.name,
      price: variant && variant.price != null ? variant.price : p.price,
      img: variant?.image || p.img,
      variant: variant?.id || null,
      combo: variant?.combo || '',
      qty,
    });
    if (buyNow) {
      window.location.href = '/pages/cart.html';
      return;
    }
    showToast?.(p.name + ' added to cart');
  }

  onMount(() => {});
</script>

<svelte:head>
  <title>{seo.title}</title>
  <meta name="description" content={seo.description} />
  <link rel="canonical" href={seo.canonical} />

  <meta property="og:type" content="product" />
  <meta property="og:site_name" content={BRAND} />
  <meta property="og:title" content={seo.title} />
  <meta property="og:description" content={seo.description} />
  <meta property="og:url" content={seo.canonical} />
  {#if seo.image}<meta property="og:image" content={seo.image} />{/if}
  <meta property="product:price:amount" content={String(p.price)} />
  <meta property="product:price:currency" content="INR" />
  <meta property="product:availability" content={p.inStock ? 'in stock' : 'out of stock'} />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={seo.title} />
  <meta name="twitter:description" content={seo.description} />
  {#if seo.image}<meta name="twitter:image" content={seo.image} />{/if}

  {@html ldTag(productLd)}
  {@html ldTag(breadcrumbLd)}
</svelte:head>

<main class="wrap product-page">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="/index.html">Home</a>
    <span class="sep">|</span>
    <a href="/pages/collection.html">Collection</a>
    {#if category}
      <span class="sep">|</span>
      <a href={'/pages/collection-detail.html?cat=' + category.slug}>{category.title}</a>
    {/if}
    <span class="sep">|</span>
    <span aria-current="page">{p.name}</span>
  </nav>

  <section class="pd">
    <div class="pd-gallery">
      <div class="pd-main">
        <!-- Alt text is the product's own name, not "product image": it is
             what a screen reader announces and what image search indexes. -->
        <img src={deliverySrc(p.gallery[active] || p.img)} alt={p.name} width="800" height="800" />
      </div>
      {#if p.gallery.length > 1}
        <div class="pd-thumbs">
          {#each p.gallery as g, i}
            <button
              class="pd-thumb"
              class:is-on={i === active}
              onclick={() => (active = i)}
              aria-label={'Show image ' + (i + 1) + ' of ' + p.gallery.length}
            >
              <img src={deliverySrc(g)} alt={p.name + ' — view ' + (i + 1)} loading="lazy" width="120" height="120" />
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="pd-info">
      {#if p.isNew}<div class="pd-badge">New Arrival</div>{/if}
      <h1 class="pd-title">{p.name}</h1>

      <div class="pd-price">
        {shownPrice}
        {#if p.compareAt}<s class="pd-was">₹{p.compareAt.toLocaleString('en-IN')}</s>{/if}
      </div>

      <!-- Nothing is said when a piece is available: "In stock" is the
           default a shopper already assumes, and printing it draws attention
           to supply on a page selling considered objects. The count is not
           sent to the page at all (see +page.server.js).

           Sold out still speaks, because the buy buttons go dead and an
           unexplained disabled button reads as a broken page. schema.org and
           the product:availability meta above still declare InStock either
           way — those are read by Google, not by the visitor, and dropping
           them is what gets items suppressed in Shopping. -->
      {#each options as option}
        <div class="pd-option">
          <div class="pd-option-name">
            {option.name}{#if chosen[option.name]}<span>{chosen[option.name]}</span>{/if}
          </div>
          <div class="pd-option-rail" role="group" aria-label={option.name}>
            {#each option.values as value}
              {@const out = !reachable(option).has(value.label)}
              <button
                type="button"
                class="pd-opt {option.kind === 'swatch' ? 'is-swatch' : ''}"
                class:is-picked={chosen[option.name] === value.label}
                class:is-out={out}
                style={option.kind === 'swatch' && value.swatch ? `--sw:${value.swatch}` : ''}
                aria-pressed={chosen[option.name] === value.label}
                title={out ? `${value.label} — unavailable` : value.label}
                onclick={() => pick(option.name, value.label)}
              >{#if option.kind !== 'swatch'}{value.label}{/if}</button>
            {/each}
          </div>
        </div>
      {/each}

      {#if options.length && !resolved}
        <p class="pd-stock">Choose {options.filter(o => !chosen[o.name]).map(o => o.name).join(' and ')}</p>
      {:else if !canBuy}
        <p class="pd-stock is-out">Out of stock</p>
      {/if}

      <div class="pd-actions">
        <div class="pd-qty">
          <button onclick={() => (qty = Math.max(1, qty - 1))} aria-label="Decrease quantity">−</button>
          <span>{qty}</span>
          <button onclick={() => (qty = qty + 1)} aria-label="Increase quantity">+</button>
        </div>
        <button class="pd-add" onclick={() => add(false)} disabled={!canBuy || !resolved}>Add to Cart</button>
      </div>
      <div class="pd-secondary">
        <button class="pd-buy" onclick={() => add(true)} disabled={!canBuy || !resolved}>Buy Now</button>
        <button
          class="pd-wish"
          class:is-wished={wished}
          onclick={wish}
          aria-pressed={wished}
          aria-label={wished ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
          <span>{wished ? 'Saved' : 'Wishlist'}</span>
        </button>
      </div>

      {#if p.tags?.length}
        <!-- Below the accordions, not beside the title: these are how a piece
             is filed, not what it is called. Each one searches the shop for
             the rest of its kind. -->
        <ul class="pd-tags" aria-label="Tags">
          {#each p.tags as tag}
            <li><a href="/pages/collection.html?q={encodeURIComponent(tag)}">{tag}</a></li>
          {/each}
        </ul>
      {/if}

      <!-- The detail sections are native <details> dropdowns rather than the
           JS accordion the old /pages/product.html used. This page is the one
           crawlers are served, and <details> keeps every section's copy in the
           document whether it is open or shut, so none of it is hidden behind
           a click as far as a crawler is concerned. It also works with
           JavaScript off, is keyboard-operable for free, and has no
           max-height to cap — the old accordion clipped any section taller
           than 400px with no way to scroll to the rest.

           Description carries `open`; every other section starts closed. When
           a product has no description nothing starts open, rather than the
           next section inheriting it. -->
      {#snippet chevron()}
        <svg class="pd-chev" width="16" height="16" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      {/snippet}

      {#if p.description}
        <details class="pd-section" open>
          <summary><h2>Description</h2>{@render chevron()}</summary>
          <p>{p.description}</p>
        </details>
      {/if}

      {#if p.dimensions.length}
        <details class="pd-section">
          <summary><h2>Dimensions</h2>{@render chevron()}</summary>
          <dl class="pd-specs">
            {#each p.dimensions as d}<dt>{d.label}</dt><dd>{d.value}</dd>{/each}
          </dl>
        </details>
      {/if}

      {#if p.materials.length}
        <details class="pd-section">
          <summary><h2>Materials &amp; Origin</h2>{@render chevron()}</summary>
          <dl class="pd-specs">
            {#each p.materials as m}<dt>{m.label}</dt><dd>{m.value}</dd>{/each}
          </dl>
        </details>
      {/if}

      {#if p.care}
        <details class="pd-section">
          <summary><h2>Care</h2>{@render chevron()}</summary>
          <p>{p.care}</p>
        </details>
      {/if}

      {#if p.shipping}
        <details class="pd-section">
          <summary><h2>Shipping &amp; Returns</h2>{@render chevron()}</summary>
          <p>{p.shipping}</p>
        </details>
      {/if}
    </div>
  </section>

  {#if related.length}
    <!-- Server-rendered, unlike the rail the old product page built after
         load: these are four internal links into the catalogue, and a link a
         crawler cannot see is a link that does not count. The tiles reuse the
         .product classes the collection grid uses, so they follow the shop's
         tile setting (Site content -> Product tiles) without knowing about
         it. -->
    <section class="pd-related" aria-labelledby="related-title">
      <h2 class="pd-related-title" id="related-title">You May Also Like</h2>
      <div class="prod-grid">
        {#each related as r}
          <a class="product" href="/products/{r.slug}">
            <div class="ph">
              <span class="ph-slide"><img src={deliverySrc(r.img)} alt={r.name} loading="lazy"></span>
            </div>
            <div class="product-info">
              <div>
                <h3>{r.name}</h3>
                <div class="price">
                  {#if r.compareAtLabel}
                    <span class="price-sale">{r.priceLabel}</span>
                    <s class="price-was" style="color:#9b968c;font-weight:400">{r.compareAtLabel}</s>
                  {:else}{r.priceLabel}{/if}
                </div>
              </div>
            </div>
          </a>
        {/each}
      </div>
    </section>
  {/if}
</main>

<style>
  /* The row is two fixed things and a gap, and the PAGE GUTTER takes up
     whatever is left over.

     It used to be the other way round: the gallery column was `1fr`, so it
     swallowed all the slack and the photograph — capped — sat stranded at
     its left. The distance between photograph and panel therefore grew
     with the window: a measured 60px at 1440px, 406px at 1900px and 974px
     at 2560px. The gap declaration was never what moved; the column was.

     Now the two columns are sized quantities and the leftover goes to the
     gutter instead, so the space between photograph and panel is the 60px
     gap at every width, and what changes with the window is the margin at
     the sides. --page-pad is overridden here rather than on :root so this
     is the product page’s business alone, and because the breadcrumb and
     the related row live in the same .wrap, they narrow with the
     photograph and stay aligned to it.

     The 7% floor is the global --page-pad from styles.css. It is written
     out because a custom property cannot refer to the value it is
     replacing; if that token changes, change this with it. */
  @media (min-width: 1024px) {
    .product-page {
      --pd-photo: calc(100vh - var(--hdr-h, 64px) - 72px);
      --pd-panel: clamp(440px, 40vw, 500px);
      --page-pad: max(
        7%,
        calc((100% - (var(--pd-photo) + 60px + var(--pd-panel))) / 2)
      );
    }
  }

  .pd {
    display: grid;
    /* Even halves below 1024px, where each column lands near 460px anyway.
       Wider than that, the info column is pinned to its measure and the
       photograph takes the rest — see the min-width rule below. */
    grid-template-columns: 1fr 1fr;
    gap: 60px;
    margin: 8px 0 60px;
    align-items: start;
  }

  .pd-gallery {
    position: sticky;
    top: calc(var(--hdr-h, 58px) + 16px);
  }

  /* How big the photograph is allowed to get.

     It used to be a flat `max-width: 728px`. The trouble with a fixed cap
     is that the gallery column is `1fr` — it takes everything the panel
     and the gutter leave — so past about 1500px the picture stopped
     growing while its column kept going, and it sat stranded at the left
     of a column far wider than itself. Measured: 346px of dead space at
     1900px and 914px at 2560px, sitting between the photograph and the
     panel. The declared 60px gap was correct and invisible underneath it;
     what read as "a huge gap" was the cap.

     So the picture takes its column now, bounded by the height it may
     occupy rather than by a magic width. .pd-main is a 1/1 box, so a cap
     on width IS a cap on height — this is a height budget wearing a
     width’s clothes, which is why it is expressed against 100vh.

     The budget is the viewport less the header and a margin, which leaves
     the photograph stopping a little short of the panel’s last row rather
     than running past it. `min()` with 100% keeps the column the hard
     limit: on a 1440px screen the column is 678px, narrower than the
     budget, and nothing about this changes what was there before.

     Tied to the viewport rather than to the panel’s measured height
     because the gallery is `position: sticky` — it is the viewport this
     column has to live inside, and a photograph taller than the window
     cannot stick to anything useful. */
  @media (min-width: 1024px) {
    .pd-gallery {
      max-width: min(100%, var(--pd-photo));
    }
  }

  /* Drops the name and price below the top of the photograph, so the column
     reads as a caption beside the image rather than racing it to the top.

     px rather than a percentage: percentage padding resolves against the
     containing block's WIDTH, never its height, so `padding-top: 5%` here
     would be ~31px at 1440px and ~35px at 1920px — it would grow with the
     window and shrink on the narrow screens where the gap is least wanted.
     A fixed gap has to be a fixed unit. */
  .pd-info {
    padding-top: 80px;
  }

  .pd-main {
    background: #fff;
    border-radius: 2px;
    overflow: hidden;
    aspect-ratio: 1 / 1;
  }

  .pd-main img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* Above 1024px the photograph is shown WHOLE, whatever shape it is.

     `cover` above fills the 1/1 box by cropping. That is invisible on a
     square original and quietly takes the top and bottom off a landscape
     one; the shop cannot always reshoot, so the box gives rather than the
     picture. `contain` fits the long edge and centres what is left.

     This has to sit AFTER the rule it overrides, not in the media block
     further up that caps .pd-gallery. Both selectors are `.pd-main img`,
     a media query adds no specificity, and the tie is broken on source
     order — written above, `contain` loses to `cover` and the picture is
     still cropped. It was, until this was measured in the browser.

     The box keeps `aspect-ratio: 1 / 1` rather than collapsing onto the
     image. The square is what holds the column height still, so the info
     panel offset lands in the same place on every product and nothing
     reflows as the image decodes.

     The letterboxing costs nothing to look at: .pd-main is #fff and so is
     body, so the reserved space is the same white as the page and the
     photograph reads as floating in the column rather than as a picture
     with bars. If either background stops being #fff the bands become
     visible, and the two have to be decided together.

     Desktop only, as asked — below 1024px the square crop still applies.
     The thumbnails keep `cover` on purpose: they are 64px navigation
     chips, and fitting a landscape frame inside one leaves a stripe too
     small to read. */
  @media (min-width: 1024px) {
    .pd-main img {
      object-fit: contain;
    }
  }

  .pd-thumbs {
    display: flex;
    gap: 8px;
    margin-top: 8px;
    flex-wrap: wrap;
  }

  .pd-thumb {
    width: 64px;
    height: 64px;
    padding: 0;
    border: none;
    cursor: pointer;
    background: none;
    border-radius: 2px;
    overflow: hidden;
    box-shadow: inset 0 0 0 1px rgba(20, 18, 16, 0.12);
  }

  .pd-thumb.is-on {
    box-shadow: inset 0 0 0 2px var(--ink);
  }

  .pd-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .pd-badge {
    display: inline-block;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent);
    font-weight: 600;
    margin-bottom: 10px;
  }

  .pd-title {
    font-family: 'Cormorant Garamond', serif;
    font-size: clamp(28px, 3vw, 40px);
    font-weight: 500;
    color: var(--ink);
    line-height: 1.15;
    margin: 0;
  }

  .pd-price {
    font-size: 20px;
    color: var(--ink);
    font-weight: 500;
    margin: 16px 0 4px;
  }

  .pd-was {
    color: #8A8681;
    font-size: 15px;
    margin-left: 10px;
  }

  /* The sold-out line no longer carries the gap below it: it is only in the
     document when a piece is unavailable, so the space between the price and
     the buy buttons would have collapsed to 4px on every product that is in
     stock. .pd-actions owns that gap now, and holds it in both states. */
  .pd-stock {
    font-size: 13px;
    color: var(--body);
    margin: 0;
  }

  .pd-stock.is-out {
    color: #B3261E;
  }

  /* ---- you may also like ---- */
  .pd-related {
    margin: 20px 0 70px;
  }

  .pd-related-title {
    font-family: 'Jost', sans-serif;
    font-size: 11px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    font-weight: 500;
    color: var(--ink);
    margin: 0 0 16px;
  }

  /* ---- tags ---- */
  .pd-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    list-style: none;
    margin: 0 0 26px;
    padding: 0;
  }

  .pd-tags a {
    display: inline-block;
    padding: 5px 10px;
    background: #FAF8F5;
    border-radius: 2px;
    font-family: 'Jost', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #6A6A64;
    text-decoration: none;
    transition: color 0.2s ease, background 0.2s ease;
  }

  .pd-tags a:hover {
    background: #F1ECE3;
    color: var(--accent);
  }

  /* ---- option rails ---- */
  .pd-option {
    margin-top: 18px;
  }

  .pd-option-name {
    font-family: 'Jost', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #8A8681;
    margin-bottom: 8px;
  }

  /* The chosen value named in words beside the axis: a swatch is a colour,
     not a name, and "Natural" has to be readable somewhere. */
  .pd-option-name span {
    color: var(--ink);
    margin-left: 6px;
  }

  .pd-option-rail {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .pd-opt {
    min-width: 40px;
    height: 34px;
    padding: 0 12px;
    background: transparent;
    color: var(--ink);
    border: none;
    border-radius: 2px;
    box-shadow: inset 0 0 0 1px #D9D3C9;
    font-family: 'Jost', sans-serif;
    font-size: 11px;
    letter-spacing: 0.1em;
    cursor: pointer;
    transition: box-shadow 0.2s ease, color 0.2s ease, opacity 0.2s ease;
  }

  .pd-opt.is-swatch {
    width: 34px;
    min-width: 0;
    padding: 0;
    background: var(--sw, #EFEAE1);
  }

  .pd-opt:hover {
    box-shadow: inset 0 0 0 1px var(--ink);
  }

  .pd-opt.is-picked {
    box-shadow: inset 0 0 0 2px var(--ink);
  }

  /* Unreachable, not hidden: a shopper should see that the size exists and
     is simply not stocked in the colour they picked. Still clickable, so
     they can pivot to it and have the other axis re-resolve around it. */
  .pd-opt.is-out {
    opacity: 0.4;
    text-decoration: line-through;
  }

  .pd-actions {
    display: flex;
    gap: 8px;
    margin-top: 18px;
    margin-bottom: 8px;
  }

  .pd-qty {
    display: flex;
    align-items: center;
    background: transparent;
    border-radius: 2px;
    /* Same hairline as Buy Now and Wishlist. As a filled cream block with no
       edge it floated beside them, reading as a different kind of thing
       rather than as the fourth control in the set. */
    box-shadow: inset 0 0 0 1px #D9D3C9;
    overflow: hidden;
    /* matches the buttons beside it — a stepper a few px taller than the
       button it sits next to reads as a misalignment, not a size */
    height: 36px;
  }

  .pd-qty button {
    width: 32px;
    height: 100%;
    border: none;
    background: transparent;
    color: #8A8681;
    font-size: 15px;
    cursor: pointer;
  }

  .pd-qty button:hover {
    color: var(--accent);
  }

  .pd-qty span {
    min-width: 24px;
    text-align: center;
    font-family: 'Jost', sans-serif;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--ink);
  }

  .pd-add,
  .pd-buy,
  .pd-wish {
    height: 36px;
    padding: 0 14px;
    border: none;
    border-radius: 2px;
    font-family: 'Jost', sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.25s ease, box-shadow 0.25s ease, color 0.25s ease;
  }

  .pd-add {
    flex: 1 1 auto;
    background: var(--ink);
    color: #fff;
  }

  .pd-add:hover:not(:disabled) {
    background: var(--accent);
  }

  /* Buy Now and Wishlist share a row rather than each taking a full-width
     band. Three stacked full-width bars read as three equal decisions; the
     hierarchy is Add to Cart first, then these two. */
  .pd-secondary {
    display: flex;
    gap: 8px;
    margin-bottom: 30px;
  }

  .pd-buy {
    flex: 1 1 auto;
    background: transparent;
    color: var(--ink);
    box-shadow: inset 0 0 0 1px #D9D3C9;
  }

  .pd-wish {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: transparent;
    color: var(--ink);
    box-shadow: inset 0 0 0 1px #D9D3C9;
  }

  .pd-wish:hover {
    color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  /* Saved: the heart fills. The outline alone is easy to miss as a state,
     and this is the only signal that the piece is already on the list. */
  .pd-wish.is-wished {
    color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .pd-wish.is-wished svg {
    fill: currentColor;
  }

  .pd-buy:hover:not(:disabled) {
    color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .pd-add:disabled,
  .pd-buy:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .pd-section {
    border-top: 1px solid #E8E2D8;
    padding: 16px 0;
  }

  /* The row you click to open a section. list-style and the WebKit marker
     pseudo-element both have to go, or the browser's default triangle sits
     beside the chevron. */
  .pd-section > summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    cursor: pointer;
    list-style: none;
    color: var(--ink);
    transition: color 0.2s ease;
  }

  .pd-section > summary::-webkit-details-marker {
    display: none;
  }

  .pd-section > summary:hover {
    color: var(--accent);
  }

  /* An SVG rather than a CSS border triangle: the flat-design layer in
     styles.css forces border-color: transparent !important, so a chevron
     drawn with borders renders invisible on this site. */
  .pd-chev {
    flex-shrink: 0;
    transition: transform 0.3s ease;
  }

  .pd-section[open] .pd-chev {
    transform: rotate(180deg);
  }

  /* The heading sits inside the summary now, so its old bottom margin would
     push the chevron out of line. The gap moves to the body instead. */
  .pd-section > summary h2 {
    font-family: 'Jost', sans-serif;
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 500;
    /* inherit, not var(--ink): the summary's :hover colour has to reach the
       title, and an explicit colour here would win over it. */
    color: inherit;
    margin: 0;
  }

  .pd-section > :not(summary) {
    margin-top: 10px;
  }

  .pd-section p {
    font-size: 14px;
    color: var(--body);
    line-height: 1.7;
    margin: 0;
  }

  .pd-specs {
    display: grid;
    grid-template-columns: 110px 1fr;
    gap: 6px 24px;
    margin: 0;
  }

  .pd-specs dt {
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--gold);
    font-weight: 600;
  }

  .pd-specs dd {
    font-size: 14px;
    color: var(--body);
    margin: 0;
  }

  /* The whole gallery — the photograph AND the thumbnail strip — has to fit
     on screen at once.

     It is position: sticky, and a sticky element taller than the viewport
     cannot stick: it can only pin its top edge, so the rest scrolls away and
     the thumbnails are the first thing to go. At 1920x1080 the square shot
     alone was 1228px against a 1080px window, so the strip below it was
     never reachable without scrolling the image off the top.

     Capping the column and letting the photograph shrink into what is left
     keeps both in view. The thumbnails do not shrink — they are already
     small, and a strip that grew and shrank with the window would read as an
     accident. object-fit: cover on the image means a shorter window crops
     the shot rather than distorting it. */
  /* The thumbnail strip sits under the photograph — the base .pd-thumbs rule
     below the gallery does that, so desktop needs no override for it.

     It briefly lived beside the shot, to buy the square the 88px of window
     height the strip costs when stacked. That is no longer needed: the shot
     is not capped to the window any more (see .pd-main), so nothing is
     competing for that height. On a short window the foot of the image and
     the strip under it fall below the fold, which is an ordinary scroll. */

  /* The info column is a measure, not a half. Splitting the row evenly gave
     it 628px while its content wanted ~460 — capping the content instead
     left a 168px dead band between the panel and the page's right gutter.
     Pinning the column means the panel ends where the page ends, and the
     photograph gets the width the split was wasting. */
  @media (min-width: 1024px) {
    .pd {
      /* 520, not 460: the panel was the narrower half of the pair and the
         photograph was taking width the copy could use. The image keeps
         whatever is left, so this is one number rather than two that have to
         be kept adding up. */
      /* Scales rather than sitting at one number: a flat 580px is a fair
         share of a 1440px window and most of a 1024px one, where it would
         leave the photograph a stamp. 40vw tracks the window between the two
         bounds. */
      /* 500, down from 580. The upper bound was slack: the note above says
         the panel's content wants about 460, and the extra 120 was width the
         photograph could not have. Lowering it is what lets the 728 cap
         actually bind at 1440 rather than the row running out first — at
         580 the widest the image could ever be there was 656.

         The lower bound and the 40vw track are unchanged, so nothing moves
         on the narrow end where the panel already needs every pixel. */
      grid-template-columns: minmax(0, 1fr) var(--pd-panel);
    }
  }

  @media (max-width: 768px) {
    .pd {
      grid-template-columns: 1fr;
      gap: 16px;
    }

    .pd-gallery {
      position: static;
    }

    /* Stacked on a phone, the panel sits directly under the image and the
       grid gap is already the separation — 80px here would read as the two
       halves belonging to different sections. */
    .pd-info {
      padding-top: 0;
    }
  }
</style>
