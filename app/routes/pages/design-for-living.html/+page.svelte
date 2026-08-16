<script>
  // Vayu — /pages/design-for-living.html, ported from public/pages/design-for-living.html.
  import { onMount } from 'svelte';

  // Emitted through {@html} rather than written as a component <style>:
  // Svelte scopes component styles, and these selectors target markup
  // that the global stylesheet and other components own.
  const pageCss = "<style>/* ------------------------------------------------------------\n       Design for Living \u2014 the store's own page, and the sibling of\n       gallery.html. It deliberately reuses that page's .g-* classes\n       rather than inventing a parallel set: the two rooms sit at the\n       same address and share one programme language, so a change to\n       the section rhythm should land on both. Nothing here is new:\n       the season's edit uses .prod-grid and the shared product tile\n       from js/product-card.js, both already in styles.css.\n       ------------------------------------------------------------ */\n    @media (max-width: 768px) {\n      .gallery-page {\n        padding-bottom: 72px;\n      }\n    }\n\n    /* ---------- editorial header ---------- */\n    .g-head {\n      display: flex;\n      justify-content: space-between;\n      align-items: flex-end;\n      gap: 20px;\n      position: relative;\n      padding-bottom: 14px;\n      margin-bottom: 18px;\n    }\n\n    .g-head::after {\n      content: '';\n      position: absolute;\n      inset: auto 0 0 0;\n      height: 1px;\n      background: #EFEAE1;\n    }\n\n    .g-title {\n      font-family: 'Cormorant Garamond', serif;\n      font-size: clamp(26px, 3vw, 40px);\n      font-weight: 400;\n      line-height: 1.05;\n      color: var(--ink);\n      margin: 0;\n    }\n\n    .g-eyebrow {\n      display: block;\n      font-size: 9.5px;\n      letter-spacing: 0.2em;\n      text-transform: uppercase;\n      color: var(--gold);\n      font-weight: 500;\n      margin-bottom: 6px;\n    }\n\n    .g-meta {\n      font-size: 10.5px;\n      letter-spacing: 0.16em;\n      text-transform: uppercase;\n      color: #8A8681;\n      white-space: nowrap;\n      padding-bottom: 3px;\n    }\n\n    /* ---------- hero ----------\n       16:9, matching the plate this page is reached from in the MENU\n       panel. assets/images/summer_cut.png is 1672x941, so the crop\n       takes nothing off the poster's own printed type. */\n    .g-hero {\n      display: block;\n      position: relative;\n      overflow: hidden;\n      background: #FAF8F5;\n      aspect-ratio: 16 / 9;\n      margin-bottom: 4px;\n    }\n\n    .g-hero img {\n      width: 100%;\n      height: 100%;\n      object-fit: cover;\n      transition: transform 0.7s cubic-bezier(0.25, 1, 0.5, 1);\n    }\n\n    .g-hero:hover img {\n      transform: scale(1.03);\n    }\n\n    /* ---------- statement ---------- */\n    .g-statement {\n      max-width: 620px;\n      margin: 26px auto 30px;\n      text-align: center;\n      font-family: 'Cormorant Garamond', serif;\n      font-size: clamp(16px, 1.6vw, 20px);\n      font-weight: 300;\n      font-style: italic;\n      line-height: 1.55;\n      color: var(--body);\n    }\n\n    /* ---------- section heads ---------- */\n    .g-sec-head {\n      display: flex;\n      justify-content: space-between;\n      align-items: baseline;\n      gap: 14px;\n      margin-bottom: 10px;\n    }\n\n    .g-sec-title {\n      font-family: 'Jost', sans-serif;\n      font-size: 11px;\n      letter-spacing: 0.22em;\n      text-transform: uppercase;\n      font-weight: 500;\n      color: var(--ink);\n    }\n\n    .g-sec-note {\n      font-size: 10px;\n      letter-spacing: 0.14em;\n      text-transform: uppercase;\n      color: #8A8681;\n    }\n\n    /* ---------- image grids ---------- */\n    .g-grid {\n      display: grid;\n      grid-template-columns: repeat(3, minmax(0, 1fr));\n      gap: 4px;\n      margin-bottom: 34px;\n    }\n\n    .g-pair {\n      display: grid;\n      grid-template-columns: 1.55fr 1fr;\n      align-items: stretch;\n      gap: 4px;\n      margin-bottom: 34px;\n    }\n\n    .g-pair .g-card {\n      display: flex;\n      flex-direction: column;\n    }\n\n    .g-card {\n      display: block;\n      margin: 0;\n    }\n\n    .g-card-media {\n      display: block;\n      overflow: hidden;\n      background: #FAF8F5;\n      aspect-ratio: 4 / 5;\n      width: 100%;\n      padding: 0;\n      border: none;\n      cursor: zoom-in;\n      font: inherit;\n      color: inherit;\n    }\n\n    .g-pair .g-card:first-child .g-card-media {\n      aspect-ratio: 3 / 2;\n    }\n\n    .g-pair .g-card:last-child .g-card-media {\n      aspect-ratio: auto;\n      flex: 1 1 auto;\n      min-height: 0;\n    }\n\n    .g-card img {\n      width: 100%;\n      height: 100%;\n      object-fit: cover;\n      transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1);\n    }\n\n    .g-card:hover img {\n      transform: scale(1.04);\n    }\n\n    .g-card figcaption {\n      display: flex;\n      align-items: baseline;\n      justify-content: space-between;\n      gap: 8px;\n      padding-top: 8px;\n    }\n\n    .g-card-name {\n      font-family: 'Cormorant Garamond', serif;\n      font-size: 15px;\n      font-weight: 500;\n      color: var(--ink);\n      line-height: 1.2;\n      transition: color 0.2s ease;\n    }\n\n    .g-card:hover .g-card-name {\n      color: var(--accent);\n    }\n\n    .g-card-tag {\n      font-size: 9px;\n      letter-spacing: 0.16em;\n      text-transform: uppercase;\n      color: var(--gold);\n      font-weight: 500;\n      white-space: nowrap;\n    }\n\n    /* ---------- lightbox ---------- */\n    .g-lightbox {\n      padding: 0;\n      border: none;\n      background: transparent;\n      max-width: 100vw;\n      max-height: 100vh;\n      width: 100%;\n      height: 100%;\n      overflow: hidden;\n    }\n\n    .g-lightbox::backdrop {\n      background: rgba(16, 14, 12, 0.92);\n    }\n\n    .g-lightbox-inner {\n      width: 100%;\n      height: 100%;\n      display: grid;\n      grid-template-rows: 1fr auto;\n      place-items: center;\n      padding: 40px 56px 24px;\n      gap: 14px;\n    }\n\n    .g-lightbox img {\n      max-width: 100%;\n      max-height: 100%;\n      width: auto;\n      height: auto;\n      object-fit: contain;\n      display: block;\n    }\n\n    .g-lightbox-caption {\n      display: flex;\n      align-items: baseline;\n      gap: 10px;\n      color: #F4F1EC;\n      font-family: 'Jost', sans-serif;\n      font-size: 11px;\n      letter-spacing: 0.16em;\n      text-transform: uppercase;\n    }\n\n    .g-lightbox-caption .g-lb-count {\n      color: #BDB7AE;\n    }\n\n    .g-lb-btn {\n      position: absolute;\n      top: 50%;\n      transform: translateY(-50%);\n      width: 44px;\n      height: 44px;\n      display: grid;\n      place-items: center;\n      background: #1C1A17;\n      color: #FFFFFF;\n      border: none;\n      cursor: pointer;\n      font-size: 20px;\n      line-height: 1;\n      transition: background 0.2s ease;\n    }\n\n    .g-lb-btn:hover {\n      background: #3A3630;\n    }\n\n    .g-lb-prev {\n      left: 8px;\n    }\n\n    .g-lb-next {\n      right: 8px;\n    }\n\n    .g-lb-close {\n      position: absolute;\n      top: 8px;\n      right: 8px;\n      width: 44px;\n      height: 44px;\n      display: grid;\n      place-items: center;\n      background: #1C1A17;\n      color: #FFFFFF;\n      border: none;\n      cursor: pointer;\n      font-size: 24px;\n      line-height: 1;\n      transition: background 0.2s ease;\n    }\n\n    .g-lb-close:hover {\n      background: #3A3630;\n    }\n\n    @media (max-width: 768px) {\n      .g-lightbox-inner {\n        padding: 56px 12px 20px;\n      }\n\n      .g-lb-prev {\n        left: 2px;\n      }\n\n      .g-lb-next {\n        right: 2px;\n      }\n    }\n\n    /* ---------- visit strip ---------- */\n    .g-visit {\n      position: relative;\n      display: grid;\n      grid-template-columns: repeat(3, minmax(0, 1fr));\n      gap: 20px;\n      padding-top: 22px;\n    }\n\n    .g-visit::before {\n      content: '';\n      position: absolute;\n      inset: 0 0 auto 0;\n      height: 1px;\n      background: #EFEAE1;\n    }\n\n    .g-visit-label {\n      display: block;\n      font-size: 9px;\n      letter-spacing: 0.2em;\n      text-transform: uppercase;\n      color: var(--gold);\n      font-weight: 500;\n      margin-bottom: 6px;\n    }\n\n    .g-visit-body {\n      font-size: 12.5px;\n      line-height: 1.65;\n      color: var(--body);\n    }\n\n    .g-visit-body a {\n      color: var(--ink);\n      transition: color 0.2s ease;\n    }\n\n    .g-visit-body a:hover {\n      color: var(--accent);\n    }\n\n    .g-directions {\n      display: inline-block;\n      margin-top: 8px;\n      font-size: 10px;\n      letter-spacing: 0.16em;\n      text-transform: uppercase;\n      font-weight: 500;\n      color: var(--accent);\n      transition: opacity 0.2s ease;\n    }\n\n    .g-directions:hover {\n      opacity: 0.65;\n    }\n\n    /* ---------- responsive ---------- */\n    @media (max-width: 768px) {\n      .g-head {\n        flex-direction: column;\n        align-items: flex-start;\n        gap: 6px;\n      }\n\n      .g-grid {\n        grid-template-columns: 1fr 1fr;\n        gap: 4px;\n      }\n\n      /* the third plate runs full width so the row never leaves a hole */\n      .g-grid .g-card:last-child {\n        grid-column: 1 / -1;\n      }\n\n      .g-grid .g-card:last-child .g-card-media {\n        aspect-ratio: 16 / 10;\n      }\n\n      .g-pair {\n        grid-template-columns: 1fr;\n        gap: 4px;\n      }\n\n      .g-pair .g-card:first-child .g-card-media,\n      .g-pair .g-card:last-child .g-card-media {\n        aspect-ratio: 3 / 2;\n        flex: 0 0 auto;\n      }\n\n      .g-visit {\n        grid-template-columns: 1fr;\n        gap: 16px;\n      }\n    }</style>";

  onMount(() => {
    import('#lib/pages/design-for-living.js').then(m => m.default?.());
  });
</script>

<svelte:head>
  <title>Vayu — Design for Living</title>
</svelte:head>

{@html pageCss}

<main class="wrap gallery-page">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/index.html">Home</a>
      <span class="sep">|</span>
      <span>Design for Living</span>
    </nav>

    <div class="g-head">
      <div>
        <span class="g-eyebrow">Vayu — Design for Living</span>
        <h1 class="g-title">Summer Cut</h1>
      </div>
      <!-- Must match the date printed on the poster itself
           (assets/images/summer_cut.png) and the one js/events.js gives
           the MENU panel. All three say the same thing or none of them
           are trustworthy. -->
      <div class="g-meta">From 21 May 2026</div>
    </div>

    <a class="g-hero" href="#season">
      <img src="/assets/images/summer_cut.png" alt="Summer Cut — from 21 May 2026, Vayu Design for Living">
    </a>

    <p class="g-statement">
      A season of lighter cloth — linen, cotton and khadi, cut for the heat, and
      the rooms we have set around them.
    </p>

    <section id="season" aria-labelledby="season-title">
      <div class="g-sec-head">
        <h2 class="g-sec-title" id="season-title">The Season</h2>
        <span class="g-sec-note">Three settings</span>
      </div>
      <div class="g-grid">
        <figure class="g-card">
          <button type="button" class="g-card-media" aria-label="Enlarge image">
            <img src="/assets/images/cat_textiles.jpg" alt="Summer cloth — linen and cotton" loading="lazy">
          </button>
          <figcaption>
            <span class="g-card-name">Lighter Cloth</span>
            <span class="g-card-tag">Setting 01</span>
          </figcaption>
        </figure>
        <figure class="g-card">
          <button type="button" class="g-card-media" aria-label="Enlarge image">
            <img src="/assets/images/cat_furniture.jpg" alt="Cane and teak seating" loading="lazy">
          </button>
          <figcaption>
            <span class="g-card-name">Cane &amp; Teak</span>
            <span class="g-card-tag">Setting 02</span>
          </figcaption>
        </figure>
        <figure class="g-card">
          <button type="button" class="g-card-media" aria-label="Enlarge image">
            <img src="/assets/images/cat_objects.png" alt="Objects set on a summer table" loading="lazy">
          </button>
          <figcaption>
            <span class="g-card-name">The Summer Table</span>
            <span class="g-card-tag">Setting 03</span>
          </figcaption>
        </figure>
      </div>
    </section>

    <section id="edit" aria-labelledby="edit-title">
      <div class="g-sec-head">
        <h2 class="g-sec-title" id="edit-title">The Season's Edit</h2>
        <a class="g-sec-note" href="/pages/collection.html" style="color:var(--accent);">All Collections →</a>
      </div>
      <!-- The site's own product tiles, rendered from js/events.js by
           lib/pages/design-for-living.js — the same pieces the MENU panel lists for this
           show, and the same card the collection grid uses, wishlist and
           add-to-cart included. -->
      <div class="prod-grid" id="dflEdit"></div>
    </section>

    <section id="rooms" aria-labelledby="rooms-title">
      <div class="g-sec-head">
        <h2 class="g-sec-title" id="rooms-title">In the Rooms</h2>
        <a class="g-sec-note" href="/pages/gallery.html" style="color:var(--accent);">Gallery Vayu →</a>
      </div>
      <div class="g-pair">
        <figure class="g-card">
          <button type="button" class="g-card-media" aria-label="Enlarge image">
            <img src="/assets/images/gallery_hero.jpg" alt="Inside the store" loading="lazy">
          </button>
          <figcaption>
            <span class="g-card-name">The Front Room</span>
            <span class="g-card-tag">Main Market</span>
          </figcaption>
        </figure>
        <figure class="g-card">
          <button type="button" class="g-card-media" aria-label="Enlarge image">
            <img src="/assets/images/cat_art.jpg" alt="Wall of works on paper" loading="lazy">
          </button>
          <figcaption>
            <span class="g-card-name">The Back Wall</span>
            <span class="g-card-tag">Works</span>
          </figcaption>
        </figure>
      </div>
    </section>

    <section id="visit" aria-labelledby="visit-title">
      <div class="g-visit">
        <div>
          <span class="g-visit-label" id="visit-title">Visit</span>
          <div class="g-visit-body">
            Shop No. 14, Main Market<br>
            Lodhi Road, Block 8, Lodi Colony<br>
            New Delhi — 110003
          </div>
          <a class="g-directions" href="https://maps.app.goo.gl/GdmtApHnAYBem1Cr8" target="_blank"
            rel="noopener noreferrer">Get Directions →</a>
        </div>
        <div>
          <span class="g-visit-label">Hours</span>
          <div class="g-visit-body">
            Tuesday — Sunday<br>
            11:00 — 19:00<br>
            Monday closed
          </div>
        </div>
        <div>
          <span class="g-visit-label">Enquiries</span>
          <div class="g-visit-body">
            <a href="tel:+918595977845">+91 8595977845</a><br>
            <a href="mailto:info@vayuonline.com">info@vayuonline.com</a>
          </div>
        </div>
      </div>
    </section>
  </main>

  <!-- Same native <dialog> as gallery.html: Escape, the focus trap and the
       inert backdrop come from the platform. -->
  <dialog class="g-lightbox" id="galleryLightbox" aria-label="Image viewer">
    <div class="g-lightbox-inner">
      <button type="button" class="g-lb-close" id="lbClose" aria-label="Close viewer">&times;</button>
      <button type="button" class="g-lb-btn g-lb-prev" id="lbPrev" aria-label="Previous image">&#8249;</button>
      <button type="button" class="g-lb-btn g-lb-next" id="lbNext" aria-label="Next image">&#8250;</button>
      <img id="lbImage" src="" alt="">
      <p class="g-lightbox-caption">
        <span id="lbCaption"></span>
        <span class="g-lb-count" id="lbCount"></span>
      </p>
    </div>
  </dialog>
