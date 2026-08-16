<script>
  // Vayu — /pages/gallery.html, ported from public/pages/gallery.html.

  // Emitted through {@html} rather than written as a component <style>:
  // Svelte scopes component styles, and these selectors target markup
  // that the global stylesheet and other components own.
  const pageCss = "<style>/* ------------------------------------------------------------\n       Gallery \u2014 follows the site language: flat surfaces, 2px radius,\n       Cormorant display + Jost labels, gold hairlines. Separators are\n       pseudo-element backgrounds because the global layer in styles.css\n       forces border-color: transparent !important.\n       ------------------------------------------------------------ */\n    /* No horizontal padding declared here at all \u2014 see the note in\n       artist.html: this element is both .wrap and .gallery-page, so even\n       `padding: 0` would wipe out the page gutter rather than leave it\n       alone. The 72px bottom-nav clearance applies only where that bar is. */\n    @media (max-width: 768px) {\n      .gallery-page {\n        padding-bottom: 72px;\n      }\n    }\n\n    /* ---------- editorial header ---------- */\n    .g-head {\n      display: flex;\n      justify-content: space-between;\n      align-items: flex-end;\n      gap: 20px;\n      position: relative;\n      padding-bottom: 14px;\n      margin-bottom: 18px;\n    }\n\n    .g-head::after {\n      content: '';\n      position: absolute;\n      inset: auto 0 0 0;\n      height: 1px;\n      background: #EFEAE1;\n    }\n\n    .g-title {\n      font-family: 'Cormorant Garamond', serif;\n      font-size: clamp(26px, 3vw, 40px);\n      font-weight: 400;\n      line-height: 1.05;\n      color: var(--ink);\n      margin: 0;\n    }\n\n    .g-meta {\n      font-size: 10.5px;\n      letter-spacing: 0.16em;\n      text-transform: uppercase;\n      color: #8A8681;\n      white-space: nowrap;\n      padding-bottom: 3px;\n    }\n\n    /* ---------- hero ---------- */\n    .g-hero {\n      display: block;\n      position: relative;\n      overflow: hidden;\n      background: #FAF8F5;\n      aspect-ratio: 16 / 9;\n      margin-bottom: 4px;\n    }\n\n    .g-hero img {\n      width: 100%;\n      height: 100%;\n      object-fit: cover;\n      transition: transform 0.7s cubic-bezier(0.25, 1, 0.5, 1);\n    }\n\n    .g-hero:hover img {\n      transform: scale(1.03);\n    }\n\n    .g-hero-label {\n      position: absolute;\n      inset: auto 0 0 0;\n      padding: 40px 18px 16px;\n      background: linear-gradient(to top, rgba(20, 18, 16, 0.72), rgba(20, 18, 16, 0));\n      color: #FFFFFF;\n      font-size: 10.5px;\n      letter-spacing: 0.2em;\n      text-transform: uppercase;\n      font-weight: 500;\n    }\n\n    /* ---------- statement ---------- */\n    .g-statement {\n      max-width: 620px;\n      margin: 26px auto 30px;\n      text-align: center;\n      font-family: 'Cormorant Garamond', serif;\n      font-size: clamp(16px, 1.6vw, 20px);\n      font-weight: 300;\n      font-style: italic;\n      line-height: 1.55;\n      color: var(--body);\n    }\n\n    /* ---------- section heads (matches .sec-head language) ---------- */\n    .g-sec-head {\n      display: flex;\n      justify-content: space-between;\n      align-items: baseline;\n      gap: 14px;\n      margin-bottom: 10px;\n    }\n\n    .g-sec-title {\n      font-family: 'Jost', sans-serif;\n      font-size: 11px;\n      letter-spacing: 0.22em;\n      text-transform: uppercase;\n      font-weight: 500;\n      color: var(--ink);\n    }\n\n    .g-sec-note {\n      font-size: 10px;\n      letter-spacing: 0.14em;\n      text-transform: uppercase;\n      color: #8A8681;\n    }\n\n    /* ---------- image grids ---------- */\n    /* 4px between plates at every size, matching the Inside Vayu tiles on\n       the home page. The 34px below each block is the section rhythm and is\n       deliberately left alone. */\n    .g-grid {\n      display: grid;\n      grid-template-columns: repeat(3, minmax(0, 1fr));\n      gap: 4px;\n      margin-bottom: 34px;\n    }\n\n    /* asymmetric pair: one wide plate beside a narrow one. The wide card's\n       3/2 ratio sets the row height and the narrow card stretches to match,\n       so the two captions sit on a shared baseline. */\n    .g-pair {\n      display: grid;\n      grid-template-columns: 1.55fr 1fr;\n      align-items: stretch;\n      gap: 4px;\n      margin-bottom: 34px;\n    }\n\n    .g-pair .g-card {\n      display: flex;\n      flex-direction: column;\n    }\n\n    .g-card {\n      display: block;\n      margin: 0;\n    }\n\n    /* A <button>, not a <span>: the tiles carried two hover affordances\n       (image zoom + caption colour) while being inert <figure>s, so every\n       tile invited a click and did nothing. They now open the lightbox. */\n    .g-card-media {\n      display: block;\n      overflow: hidden;\n      background: #FAF8F5;\n      aspect-ratio: 4 / 5;\n      width: 100%;\n      padding: 0;\n      border: none;\n      cursor: zoom-in;\n      font: inherit;\n      color: inherit;\n    }\n\n    .g-grid .g-card-media {\n      aspect-ratio: 4 / 5;\n    }\n\n    .g-pair .g-card:first-child .g-card-media {\n      aspect-ratio: 3 / 2;\n    }\n\n    /* no intrinsic ratio \u2014 it fills whatever height the wide card establishes */\n    .g-pair .g-card:last-child .g-card-media {\n      aspect-ratio: auto;\n      flex: 1 1 auto;\n      min-height: 0;\n    }\n\n    .g-card img {\n      width: 100%;\n      height: 100%;\n      object-fit: cover;\n      transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1);\n    }\n\n    .g-card:hover img {\n      transform: scale(1.04);\n    }\n\n    /* caption under the image, never over it \u2014 light plates stay readable */\n    .g-card figcaption {\n      display: flex;\n      align-items: baseline;\n      justify-content: space-between;\n      gap: 8px;\n      padding-top: 8px;\n    }\n\n    .g-card-name {\n      font-family: 'Cormorant Garamond', serif;\n      font-size: 15px;\n      font-weight: 500;\n      color: var(--ink);\n      line-height: 1.2;\n      transition: color 0.2s ease;\n    }\n\n    .g-card:hover .g-card-name {\n      color: var(--accent);\n    }\n\n    .g-card-tag {\n      font-size: 9px;\n      letter-spacing: 0.16em;\n      text-transform: uppercase;\n      color: var(--gold);\n      font-weight: 500;\n      white-space: nowrap;\n    }\n\n    /* ---------- lightbox ----------\n       A native <dialog> opened with showModal(), so Escape-to-close, the\n       focus trap and the inert backdrop all come from the platform. */\n    .g-lightbox {\n      padding: 0;\n      border: none;\n      background: transparent;\n      max-width: 100vw;\n      max-height: 100vh;\n      width: 100%;\n      height: 100%;\n      overflow: hidden;\n    }\n\n    .g-lightbox::backdrop {\n      background: rgba(16, 14, 12, 0.92);\n    }\n\n    .g-lightbox-inner {\n      width: 100%;\n      height: 100%;\n      display: grid;\n      grid-template-rows: 1fr auto;\n      place-items: center;\n      padding: 40px 56px 24px;\n      gap: 14px;\n    }\n\n    .g-lightbox img {\n      max-width: 100%;\n      max-height: 100%;\n      width: auto;\n      height: auto;\n      object-fit: contain;\n      display: block;\n    }\n\n    .g-lightbox-caption {\n      display: flex;\n      align-items: baseline;\n      gap: 10px;\n      color: #F4F1EC;\n      font-family: 'Jost', sans-serif;\n      font-size: 11px;\n      letter-spacing: 0.16em;\n      text-transform: uppercase;\n    }\n\n    .g-lightbox-caption .g-lb-count {\n      color: #BDB7AE;\n    }\n\n    .g-lb-btn {\n      position: absolute;\n      top: 50%;\n      transform: translateY(-50%);\n      width: 44px;\n      height: 44px;\n      display: grid;\n      place-items: center;\n      /* opaque dark chip rather than translucent white: the control has to\n         stay legible when a light-plated photograph sits behind it */\n      background: #1C1A17;\n      color: #FFFFFF;\n      border: none;\n      cursor: pointer;\n      font-size: 20px;\n      line-height: 1;\n      transition: background 0.2s ease;\n    }\n\n    .g-lb-btn:hover {\n      background: #3A3630;\n    }\n\n    .g-lb-prev {\n      left: 8px;\n    }\n\n    .g-lb-next {\n      right: 8px;\n    }\n\n    .g-lb-close {\n      position: absolute;\n      top: 8px;\n      right: 8px;\n      width: 44px;\n      height: 44px;\n      display: grid;\n      place-items: center;\n      background: #1C1A17;\n      color: #FFFFFF;\n      border: none;\n      cursor: pointer;\n      font-size: 24px;\n      line-height: 1;\n      transition: background 0.2s ease;\n    }\n\n    .g-lb-close:hover {\n      background: #3A3630;\n    }\n\n    @media (max-width: 768px) {\n      .g-lightbox-inner {\n        padding: 56px 12px 20px;\n      }\n\n      .g-lb-prev {\n        left: 2px;\n      }\n\n      .g-lb-next {\n        right: 2px;\n      }\n    }\n\n    /* ---------- visit strip ---------- */\n    .g-visit {\n      position: relative;\n      display: grid;\n      grid-template-columns: repeat(3, minmax(0, 1fr));\n      gap: 20px;\n      padding-top: 22px;\n    }\n\n    .g-visit::before {\n      content: '';\n      position: absolute;\n      inset: 0 0 auto 0;\n      height: 1px;\n      background: #EFEAE1;\n    }\n\n    .g-visit-label {\n      display: block;\n      font-size: 9px;\n      letter-spacing: 0.2em;\n      text-transform: uppercase;\n      color: var(--gold);\n      font-weight: 500;\n      margin-bottom: 6px;\n    }\n\n    .g-visit-body {\n      font-size: 12.5px;\n      line-height: 1.65;\n      color: var(--body);\n    }\n\n    .g-visit-body a {\n      color: var(--ink);\n      transition: color 0.2s ease;\n    }\n\n    .g-visit-body a:hover {\n      color: var(--accent);\n    }\n\n    .g-directions {\n      display: inline-block;\n      margin-top: 8px;\n      font-size: 10px;\n      letter-spacing: 0.16em;\n      text-transform: uppercase;\n      font-weight: 500;\n      color: var(--accent);\n      transition: opacity 0.2s ease;\n    }\n\n    .g-directions:hover {\n      opacity: 0.65;\n    }\n\n    /* ---------- responsive ---------- */\n    /* .gallery-page and .wrap share the same <main>, so the desktop gutter\n       has to be restated rather than zeroed */\n    @media (min-width: 1024px) {\n\n      .g-grid,\n      .g-pair {\n        gap: 4px;\n      }\n    }\n\n    /* normalised from 700px to the site's 768px content breakpoint */\n    @media (max-width: 768px) {\n      .g-head {\n        flex-direction: column;\n        align-items: flex-start;\n        gap: 6px;\n      }\n\n      .g-hero {\n        aspect-ratio: 16 / 9;\n      }\n\n      .g-grid {\n        grid-template-columns: 1fr 1fr;\n        gap: 4px;\n      }\n\n      /* the third plate runs full width so the row never leaves a hole */\n      .g-grid .g-card:last-child {\n        grid-column: 1 / -1;\n      }\n\n      .g-grid .g-card:last-child .g-card-media {\n        aspect-ratio: 16 / 10;\n      }\n\n      .g-pair {\n        grid-template-columns: 1fr;\n        gap: 4px;\n      }\n\n      /* stacked: both plates take the same ratio again. The :last-child\n         selector has to be repeated or the desktop `aspect-ratio: auto`\n         out-specifies this rule and the image keeps its intrinsic height. */\n      .g-pair .g-card:first-child .g-card-media,\n      .g-pair .g-card:last-child .g-card-media {\n        aspect-ratio: 3 / 2;\n        flex: 0 0 auto;\n      }\n\n      .g-visit {\n        grid-template-columns: 1fr;\n        gap: 16px;\n      }\n    }</style>";
</script>

<svelte:head>
  <title>Gallery Vayu — Vayu</title>
</svelte:head>

{@html pageCss}

<main class="wrap gallery-page">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/index.html">Home</a>
      <span class="sep">|</span>
      <span>Gallery Vayu</span>
    </nav>

    <!-- a <header> here would match the global `header &#123; position: fixed &#125;`
         desktop rule in styles.css and pin the title over the site nav -->
    <div class="g-head">
      <div>
        <h1 class="g-title">Personal Heirlooms</h1>
      </div>
      <!-- Must match the date printed on the hero poster on the home page
           (assets/images/personal_heirlooms.jpg). This read 10 August 2026
           while that poster advertised the same show running to the 23rd. -->
      <div class="g-meta">On view till 23 August 2026</div>
    </div>

    <a class="g-hero" href="#exhibition">
      <img src="/assets/images/gallery_hero.jpg" alt="Personal Heirlooms">
    </a>

    <p class="g-statement">
      A room of quiet objects — brass, clay, cane and handwoven cloth — gathered
      from the makers we have kept company with for a decade.
    </p>

    <section id="exhibition" aria-labelledby="exhibition-title">
      <div class="g-sec-head">
        <h2 class="g-sec-title" id="exhibition-title">The Exhibition</h2>
        <span class="g-sec-note">Three rooms</span>
      </div>
      <div class="g-grid">
        <figure class="g-card">
          <button type="button" class="g-card-media" aria-label="Enlarge image">
            <img src="/assets/images/gallery_tile1.png" alt="Exhibition room — bedroom setting" loading="lazy">
          </button>
          <figcaption>
            <span class="g-card-name">The Quiet Room</span>
            <span class="g-card-tag">Room 01</span>
          </figcaption>
        </figure>
        <figure class="g-card">
          <button type="button" class="g-card-media" aria-label="Enlarge image">
            <img src="/assets/images/gallery_tile2.png" alt="Exhibition room — living room setting" loading="lazy">
          </button>
          <figcaption>
            <span class="g-card-name">The Long Table</span>
            <span class="g-card-tag">Room 02</span>
          </figcaption>
        </figure>
        <figure class="g-card">
          <button type="button" class="g-card-media" aria-label="Enlarge image">
            <img src="/assets/images/gallery_tile3.png" alt="Exhibition room — ceramics display" loading="lazy">
          </button>
          <figcaption>
            <span class="g-card-name">The Clay Wall</span>
            <span class="g-card-tag">Room 03</span>
          </figcaption>
        </figure>
      </div>
    </section>

    <section id="hands" aria-labelledby="hands-title">
      <div class="g-sec-head">
        <h2 class="g-sec-title" id="hands-title">The Hands Behind It</h2>
        <a class="g-sec-note" href="/pages/artist.html" style="color:var(--accent);">All Artists →</a>
      </div>
      <div class="g-pair">
        <figure class="g-card">
          <button type="button" class="g-card-media" aria-label="Enlarge image">
            <img src="/assets/images/journal_ceramics.png" alt="Potter shaping a vessel" loading="lazy">
          </button>
          <figcaption>
            <span class="g-card-name">At the Wheel</span>
            <span class="g-card-tag">Craft</span>
          </figcaption>
        </figure>
        <figure class="g-card">
          <button type="button" class="g-card-media" aria-label="Enlarge image">
            <img src="/assets/images/journal_weaving.png" alt="Handloom weaving in progress" loading="lazy">
          </button>
          <figcaption>
            <span class="g-card-name">On the Loom</span>
            <span class="g-card-tag">Textile</span>
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

  <!-- Lightbox. A native <dialog>, so Escape, the focus trap and the inert
       backdrop are handled by the platform rather than by hand. -->
  <dialog class="g-lightbox" id="galleryLightbox" aria-label="Gallery image viewer">
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
