<script>
  // Vayu — /pages/journal.html, ported from public/pages/journal.html.
  import { onMount } from 'svelte';

  // Emitted through {@html} rather than written as a component <style>:
  // Svelte scopes component styles, and these selectors target markup
  // that the global stylesheet and other components own.
  const pageCss = "<style>/* ---- Journal page-specific styles ---- */\n\n    .journal-page {\n      padding-bottom: 80px;\n    }\n\n    /* --- Hero banner --- */\n    .journal-hero {\n      position: relative;\n      width: 100%;\n      aspect-ratio: 21 / 8;\n      overflow: hidden;\n      margin-bottom: 48px;\n    }\n\n    .journal-hero img {\n      width: 100%;\n      height: 100%;\n      object-fit: cover;\n      transition: transform 1.2s cubic-bezier(0.16, 1, 0.3, 1);\n    }\n\n    .journal-hero:hover img {\n      transform: scale(1.03);\n    }\n\n    .journal-hero-overlay {\n      position: absolute;\n      inset: 0;\n      background: linear-gradient(to top,\n          rgba(20, 18, 16, 0.82) 0%,\n          rgba(20, 18, 16, 0.25) 45%,\n          rgba(20, 18, 16, 0.08) 100%);\n      display: flex;\n      flex-direction: column;\n      justify-content: flex-end;\n      padding: clamp(24px, 5vw, 56px);\n    }\n\n    .journal-hero-kicker {\n      font-family: 'Jost', sans-serif;\n      font-size: 11px;\n      letter-spacing: 0.28em;\n      text-transform: uppercase;\n      color: var(--gold);\n      font-weight: 500;\n      margin-bottom: 10px;\n    }\n\n    .journal-hero-title {\n      font-family: 'Cormorant Garamond', serif;\n      font-size: clamp(32px, 5vw, 64px);\n      color: #FFFFFF;\n      font-weight: 300;\n      line-height: 1.05;\n      letter-spacing: 0.02em;\n      max-width: 14em;\n      margin-bottom: 10px;\n    }\n\n    .journal-hero-sub {\n      font-family: 'Jost', sans-serif;\n      font-size: clamp(13px, 1.1vw, 16px);\n      color: rgba(255, 255, 255, 0.72);\n      font-weight: 300;\n      max-width: 38em;\n      line-height: 1.6;\n    }\n\n    @media (max-width: 768px) {\n      .journal-hero {\n        aspect-ratio: 4 / 3;\n        margin-bottom: 24px;\n      }\n    }\n\n    /* --- Filter pills --- */\n    .journal-filters {\n      display: flex;\n      gap: 8px;\n      flex-wrap: wrap;\n      margin-bottom: 36px;\n      padding: 0 16px;\n    }\n\n    .journal-pill {\n      display: inline-flex;\n      align-items: center;\n      padding: 8px 20px;\n      background: #FAF8F5;\n      font-size: 12px;\n      letter-spacing: 0.12em;\n      text-transform: uppercase;\n      color: var(--ink);\n      font-weight: 500;\n      cursor: pointer;\n      transition: all 0.25s ease;\n    }\n\n    .journal-pill:hover,\n    .journal-pill.active {\n      background: var(--ink);\n      color: #FFFFFF;\n    }\n\n    @media (max-width: 768px) {\n      .journal-filters {\n        padding: 0 4px;\n        gap: 6px;\n        flex-wrap: nowrap;\n        overflow-x: auto;\n        scrollbar-width: none;\n        -webkit-overflow-scrolling: touch;\n      }\n\n      .journal-filters::-webkit-scrollbar {\n        display: none;\n      }\n\n      .journal-pill {\n        flex-shrink: 0;\n        padding: 7px 16px;\n        font-size: 11px;\n      }\n    }\n\n    /* --- Featured article (large) --- */\n    .journal-featured {\n      display: grid;\n      grid-template-columns: 1.2fr 1fr;\n      gap: clamp(24px, 4vw, 48px);\n      align-items: center;\n      margin-bottom: 56px;\n      padding: 0 16px;\n    }\n\n    .journal-featured-img {\n      position: relative;\n      width: 100%;\n      aspect-ratio: 4 / 3;\n      overflow: hidden;\n    }\n\n    .journal-featured-img img {\n      width: 100%;\n      height: 100%;\n      object-fit: cover;\n      transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);\n    }\n\n    .journal-featured:hover .journal-featured-img img {\n      transform: scale(1.04);\n    }\n\n    .journal-featured-badge {\n      position: absolute;\n      top: 16px;\n      left: 16px;\n      background: rgba(20, 18, 16, 0.7);\n      backdrop-filter: blur(6px);\n      padding: 5px 12px;\n      font-family: 'Jost', sans-serif;\n      font-size: 10px;\n      letter-spacing: 0.2em;\n      color: #FBF9F5;\n      text-transform: uppercase;\n      font-weight: 500;\n    }\n\n    .journal-featured-content {\n      display: flex;\n      flex-direction: column;\n    }\n\n    .journal-featured-cat {\n      font-family: 'Jost', sans-serif;\n      font-size: 11px;\n      letter-spacing: 0.2em;\n      text-transform: uppercase;\n      color: var(--accent);\n      font-weight: 500;\n      margin-bottom: 14px;\n    }\n\n    .journal-featured-title {\n      font-family: 'Cormorant Garamond', serif;\n      font-size: clamp(28px, 2.8vw, 42px);\n      color: var(--ink);\n      font-weight: 400;\n      line-height: 1.15;\n      margin-bottom: 18px;\n      transition: color 0.25s ease;\n    }\n\n    .journal-featured:hover .journal-featured-title {\n      color: var(--gold);\n    }\n\n    .journal-featured-excerpt {\n      font-size: clamp(14px, 1.05vw, 16px);\n      color: var(--body);\n      line-height: 1.75;\n      margin-bottom: 24px;\n      max-width: 32em;\n    }\n\n    .journal-featured-date {\n      font-size: 12px;\n      color: #8A8A84;\n      letter-spacing: 0.06em;\n      margin-bottom: 20px;\n    }\n\n    .journal-read-link {\n      font-family: 'Jost', sans-serif;\n      font-size: 12px;\n      letter-spacing: 0.16em;\n      text-transform: uppercase;\n      color: var(--ink);\n      font-weight: 500;\n      display: inline-flex;\n      align-items: center;\n      gap: 8px;\n      transition: color 0.25s ease, transform 0.25s ease;\n    }\n\n    .journal-read-link:hover {\n      color: var(--accent);\n      transform: translateX(4px);\n    }\n\n    .journal-read-link svg {\n      width: 16px;\n      height: 16px;\n      transition: transform 0.25s ease;\n    }\n\n    .journal-read-link:hover svg {\n      transform: translateX(3px);\n    }\n\n    @media (max-width: 768px) {\n      .journal-featured {\n        grid-template-columns: 1fr;\n        gap: 20px;\n        padding: 0 4px;\n        margin-bottom: 36px;\n      }\n\n      .journal-featured-img {\n        aspect-ratio: 16 / 10;\n      }\n\n      .journal-featured-title {\n        font-size: 26px;\n      }\n\n      .journal-featured-excerpt {\n        font-size: 14px;\n        margin-bottom: 16px;\n      }\n    }\n\n    /* --- Article grid --- */\n    .journal-grid {\n      display: grid;\n      grid-template-columns: repeat(3, 1fr);\n      gap: 28px;\n      margin-bottom: 56px;\n      padding: 0 16px;\n    }\n\n    .journal-card {\n      display: flex;\n      flex-direction: column;\n      cursor: pointer;\n    }\n\n    .journal-card-img {\n      position: relative;\n      width: 100%;\n      aspect-ratio: 4 / 3;\n      overflow: hidden;\n      margin-bottom: 16px;\n    }\n\n    .journal-card-img img {\n      width: 100%;\n      height: 100%;\n      object-fit: cover;\n      transition: transform 0.7s cubic-bezier(0.16, 1, 0.3, 1), filter 0.7s ease;\n    }\n\n    .journal-card:hover .journal-card-img img {\n      transform: scale(1.05);\n      filter: brightness(1.04);\n    }\n\n    .journal-card-cat {\n      font-family: 'Jost', sans-serif;\n      font-size: 10px;\n      letter-spacing: 0.2em;\n      text-transform: uppercase;\n      color: var(--accent);\n      font-weight: 500;\n      margin-bottom: 8px;\n    }\n\n    .journal-card-title {\n      font-family: 'Cormorant Garamond', serif;\n      font-size: clamp(20px, 1.6vw, 24px);\n      color: var(--ink);\n      font-weight: 400;\n      line-height: 1.2;\n      margin-bottom: 10px;\n      transition: color 0.25s ease;\n    }\n\n    .journal-card:hover .journal-card-title {\n      color: var(--gold);\n    }\n\n    .journal-card-excerpt {\n      font-size: 13.5px;\n      color: var(--body);\n      line-height: 1.6;\n      margin-bottom: 14px;\n      display: -webkit-box;\n      -webkit-line-clamp: 3;\n      line-clamp: 3;\n      -webkit-box-orient: vertical;\n      overflow: hidden;\n    }\n\n    .journal-card-meta {\n      margin-top: auto;\n      display: flex;\n      justify-content: space-between;\n      align-items: center;\n    }\n\n    .journal-card-date {\n      font-size: 11.5px;\n      color: #8A8A84;\n      letter-spacing: 0.04em;\n    }\n\n    .journal-card-arrow {\n      width: 28px;\n      height: 28px;\n      display: grid;\n      place-items: center;\n      color: var(--ink);\n      transition: transform 0.25s ease, color 0.25s ease;\n    }\n\n    .journal-card:hover .journal-card-arrow {\n      color: var(--gold);\n      transform: translateX(3px);\n    }\n\n    @media (max-width: 900px) {\n      .journal-grid {\n        grid-template-columns: 1fr 1fr;\n        gap: 20px;\n      }\n    }\n\n    @media (max-width: 600px) {\n      .journal-grid {\n        grid-template-columns: 1fr;\n        gap: 0;\n        padding: 0 4px;\n      }\n\n      .journal-card {\n        flex-direction: row;\n        gap: 14px;\n        align-items: center;\n        padding: 16px 0;\n      }\n\n      .journal-card-img {\n        flex: 0 0 110px;\n        width: 110px;\n        aspect-ratio: 1 / 1;\n        margin-bottom: 0;\n      }\n\n      .journal-card-content {\n        flex: 1;\n        min-width: 0;\n      }\n\n      .journal-card-title {\n        font-size: 18px;\n        margin-bottom: 6px;\n      }\n\n      .journal-card-excerpt {\n        font-size: 12.5px;\n        -webkit-line-clamp: 2;\n        line-clamp: 2;\n        margin-bottom: 8px;\n      }\n\n      .journal-card-meta {\n        margin-top: 0;\n      }\n    }\n\n    /* --- Press / News in the press --- */\n    .press-section {\n      margin-bottom: 56px;\n      padding: 0 16px;\n    }\n\n    .press-grid {\n      display: grid;\n      grid-template-columns: repeat(3, 1fr);\n      gap: 24px;\n    }\n\n    .press-card {\n      position: relative;\n      display: flex;\n      flex-direction: column;\n      overflow: hidden;\n      aspect-ratio: 4 / 3;\n      cursor: pointer;\n    }\n\n    .press-card img {\n      width: 100%;\n      height: 100%;\n      object-fit: cover;\n      transition: transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);\n    }\n\n    .press-card:hover img {\n      transform: scale(1.05);\n    }\n\n    .press-card-overlay {\n      position: absolute;\n      inset: 0;\n      background: linear-gradient(to top,\n          rgba(20, 18, 16, 0.80) 0%,\n          rgba(20, 18, 16, 0.15) 50%,\n          transparent 100%);\n      display: flex;\n      flex-direction: column;\n      justify-content: flex-end;\n      padding: clamp(16px, 2.5vw, 28px);\n      transition: background 0.3s ease;\n    }\n\n    .press-card:hover .press-card-overlay {\n      background: linear-gradient(to top,\n          rgba(20, 18, 16, 0.68) 0%,\n          rgba(20, 18, 16, 0.10) 50%,\n          transparent 100%);\n    }\n\n    .press-source {\n      font-family: 'Cormorant Garamond', serif;\n      font-size: clamp(22px, 2vw, 30px);\n      color: #FFFFFF;\n      font-weight: 400;\n      letter-spacing: 0.02em;\n      margin-bottom: 6px;\n      line-height: 1.15;\n    }\n\n    .press-snippet {\n      font-size: 12.5px;\n      color: rgba(255, 255, 255, 0.7);\n      line-height: 1.5;\n      display: -webkit-box;\n      -webkit-line-clamp: 2;\n      line-clamp: 2;\n      -webkit-box-orient: vertical;\n      overflow: hidden;\n    }\n\n    .press-external {\n      position: absolute;\n      top: 14px;\n      right: 14px;\n      width: 28px;\n      height: 28px;\n      display: grid;\n      place-items: center;\n      background: rgba(255, 255, 255, 0.15);\n      backdrop-filter: blur(6px);\n      color: #FFFFFF;\n      transition: background 0.25s ease;\n    }\n\n    .press-card:hover .press-external {\n      background: rgba(255, 255, 255, 0.3);\n    }\n\n    @media (max-width: 768px) {\n      .press-grid {\n        grid-template-columns: 1fr;\n        gap: 10px;\n      }\n\n      .press-card {\n        aspect-ratio: 16 / 9;\n      }\n\n      .press-section {\n        padding: 0 4px;\n      }\n    }\n\n    /* --- Divider line --- */\n    .journal-divider {\n      width: 100%;\n      max-width: 120px;\n      height: 1px;\n      background: linear-gradient(90deg, transparent, var(--gold), transparent);\n      margin: 0 auto 48px;\n      border: none !important;\n    }\n\n    @media (min-width: 1024px) {\n      .journal-page .sec-head {\n        padding: 0;\n      }\n    }</style>";

  onMount(() => {
    import('#lib/pages/journal.js').then(m => m.default?.());
  });
</script>

<svelte:head>
  <title>Journal — Vayu</title>
  <meta name="description" content="Stories of craft, heritage and mindful living. Insights into natural materials, artist traditions and the philosophy behind Vayu's curated collection." />
</svelte:head>

{@html pageCss}

<main class="wrap journal-page">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/index.html">Home</a>
      <span class="sep">|</span>
      <span>Journal</span>
    </nav>

    <!-- JOURNAL HERO -->
    <section class="journal-hero">
      <img src="/assets/images/journal_hero.png" alt="Vayu Journal — Stories of Craft & Heritage">
      <div class="journal-hero-overlay">
        <span class="journal-hero-kicker">THE VAYU JOURNAL</span>
        <h1 class="journal-hero-title">Stories of Craft, Heritage & Mindful Living</h1>
        <p class="journal-hero-sub">Insights into natural materials, artist traditions and the philosophy that shapes
          every piece in the Vayu collection.</p>
      </div>
    </section>

    <!-- FILTER PILLS -->
    <div class="journal-filters" id="journalFilters" role="group" aria-label="Filter stories by category">
      <button class="journal-pill active" data-filter="all" aria-pressed="true">All Stories</button>
      <button class="journal-pill" data-filter="craft" aria-pressed="false">Craft &amp; Heritage</button>
      <button class="journal-pill" data-filter="interiors" aria-pressed="false">Interiors</button>
      <button class="journal-pill" data-filter="materials" aria-pressed="false">Materials</button>
      <button class="journal-pill" data-filter="press" aria-pressed="false">In The Press</button>
    </div>

    <!-- FEATURED ARTICLE — rendered from js/journal-data.js so its href is a
         real article URL. It was hardcoded here with href="javascript:void(0)". -->
    <div id="journalFeatured"></div>

    <div class="journal-divider"></div>

    <!-- ARTICLE GRID -->
    <section>
      <!-- padding removed: it indented the heading 16px past the content it
           labels, since .wrap already supplies the page gutter -->
      <div class="sec-head" style="margin-bottom: 24px;">
        <h2 class="sec-title">LATEST STORIES</h2>
      </div>

      <div class="journal-grid" id="journalGrid"></div>
    </section>

    <div class="journal-divider"></div>

    <!-- IN THE PRESS -->
    <section class="press-section">
      <div class="sec-head" style="padding: 0; margin-bottom: 24px;">
        <h2 class="sec-title">IN THE PRESS</h2>
        <a class="link-cta" href="/pages/press.html">ALL PRESS &nbsp;→</a>
      </div>

      <div class="press-grid" id="pressGrid"></div>
    </section>

  </main>
