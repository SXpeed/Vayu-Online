<script>
  import Seo from '#lib/components/Seo.svelte';
  // Vayu — /pages/press.html, ported from public/pages/press.html.
  import { onMount } from 'svelte';

  // Emitted through {@html} rather than written as a component <style>:
  // Svelte scopes component styles, and these selectors target markup
  // that the global stylesheet and other components own.
  const pageCss = "<style>/* ------------------------------------------------------------\n       Press \u2014 the same language as the gallery page: flat surfaces,\n       2px radius, Cormorant display over Jost labels, gold hairlines.\n       Separators are pseudo-element backgrounds, never borders: the\n       global layer in styles.css forces border-color: transparent\n       !important, so a border here would never paint.\n       ------------------------------------------------------------ */\n    /* No horizontal padding declared \u2014 this element is both .wrap and\n       .press-page, so even `padding: 0` would wipe out the page gutter\n       rather than leave it alone (see the same note on gallery.html).\n       The 72px bottom clearance is for the phone bottom nav. */\n    @media (max-width: 768px) {\n      .press-page {\n        padding-bottom: 72px;\n      }\n    }\n\n    /* ---------- editorial header ---------- */\n    .pr-head {\n      display: flex;\n      justify-content: space-between;\n      align-items: flex-end;\n      gap: 20px;\n      position: relative;\n      padding-bottom: 14px;\n      margin-bottom: 18px;\n    }\n\n    .pr-head::after {\n      content: '';\n      position: absolute;\n      inset: auto 0 0 0;\n      height: 1px;\n      background: #EFEAE1;\n    }\n\n    /* Visually hidden, not deleted \u2014 the breadcrumb above already names the\n       page, but the document still needs an <h1>. Clipped rather than\n       display:none, which would take it out of the accessibility tree too. */\n    .pr-title {\n      position: absolute;\n      width: 1px;\n      height: 1px;\n      margin: -1px;\n      padding: 0;\n      overflow: hidden;\n      clip-path: inset(50%);\n      white-space: nowrap;\n    }\n\n    .pr-meta {\n      font-size: 10.5px;\n      letter-spacing: 0.16em;\n      text-transform: uppercase;\n      color: #8A8681;\n      white-space: nowrap;\n      padding-bottom: 3px;\n    }\n\n    .pr-statement {\n      max-width: 620px;\n      margin: 26px auto 34px;\n      text-align: center;\n      font-family: 'Cormorant Garamond', serif;\n      font-size: clamp(16px, 1.6vw, 20px);\n      font-weight: 300;\n      font-style: italic;\n      line-height: 1.55;\n      color: var(--body);\n    }\n\n    /* ---------- featured piece ----------\n       The most recent article, given the width the others share\n       between them. Image left, the article's own words right. */\n    .pr-feature {\n      display: grid;\n      grid-template-columns: 1.15fr 1fr;\n      gap: clamp(20px, 3vw, 44px);\n      align-items: center;\n      margin-bottom: 46px;\n    }\n\n    .pr-feature-media {\n      display: block;\n      overflow: hidden;\n      background: #FAF8F5;\n      aspect-ratio: 4 / 3;\n    }\n\n    .pr-feature-media img {\n      width: 100%;\n      height: 100%;\n      object-fit: cover;\n      transition: transform 0.7s cubic-bezier(0.25, 1, 0.5, 1);\n    }\n\n    .pr-feature:hover .pr-feature-media img {\n      transform: scale(1.03);\n    }\n\n    .pr-feature-body {\n      display: flex;\n      flex-direction: column;\n      align-items: flex-start;\n    }\n\n    .pr-badge {\n      display: inline-block;\n      font-size: 9px;\n      letter-spacing: 0.2em;\n      text-transform: uppercase;\n      color: var(--gold);\n      font-weight: 500;\n      margin-bottom: 12px;\n    }\n\n    .pr-feature-source {\n      font-family: 'Jost', sans-serif;\n      font-size: 11px;\n      letter-spacing: 0.22em;\n      text-transform: uppercase;\n      font-weight: 500;\n      color: var(--ink);\n      display: block;\n      margin-bottom: 10px;\n    }\n\n    .pr-feature-headline {\n      font-family: 'Cormorant Garamond', serif;\n      font-size: clamp(22px, 2.6vw, 34px);\n      font-weight: 400;\n      line-height: 1.18;\n      color: var(--ink);\n      margin: 0 0 14px;\n      text-wrap: balance;\n      transition: color 0.25s ease;\n    }\n\n    .pr-feature:hover .pr-feature-headline {\n      color: var(--accent);\n    }\n\n    /* ---------- the quoted passage ----------\n       Set off by a gold rule rather than a blockquote indent, so it\n       reads as the publication speaking rather than as body copy. */\n    .pr-quote {\n      position: relative;\n      padding-left: 16px;\n      margin: 0 0 16px;\n      font-family: 'Cormorant Garamond', serif;\n      font-size: clamp(15px, 1.5vw, 18px);\n      font-style: italic;\n      font-weight: 300;\n      line-height: 1.6;\n      color: var(--body);\n    }\n\n    .pr-quote::before {\n      content: '';\n      position: absolute;\n      inset: 2px auto 2px 0;\n      width: 1px;\n      background: var(--gold);\n    }\n\n    .pr-quote cite {\n      display: block;\n      margin-top: 8px;\n      font-family: 'Jost', sans-serif;\n      font-style: normal;\n      font-size: 10px;\n      letter-spacing: 0.16em;\n      text-transform: uppercase;\n      color: #8A8681;\n    }\n\n    .pr-byline {\n      font-family: 'Jost', sans-serif;\n      font-size: 10.5px;\n      letter-spacing: 0.14em;\n      text-transform: uppercase;\n      color: #8A8681;\n      margin-bottom: 16px;\n    }\n\n    .pr-read {\n      display: inline-flex;\n      align-items: center;\n      gap: 7px;\n      font-family: 'Jost', sans-serif;\n      font-size: 10.5px;\n      letter-spacing: 0.18em;\n      text-transform: uppercase;\n      font-weight: 500;\n      color: var(--ink);\n      transition: color 0.2s ease, gap 0.25s cubic-bezier(0.25, 1, 0.5, 1);\n    }\n\n    .pr-feature:hover .pr-read,\n    .pr-card:hover .pr-read {\n      color: var(--accent);\n      gap: 11px;\n    }\n\n    /* ---------- section head (matches .g-sec-head) ---------- */\n    .pr-sec-head {\n      display: flex;\n      justify-content: space-between;\n      align-items: baseline;\n      gap: 14px;\n      margin-bottom: 12px;\n    }\n\n    .pr-sec-title {\n      font-family: 'Jost', sans-serif;\n      font-size: 11px;\n      letter-spacing: 0.22em;\n      text-transform: uppercase;\n      font-weight: 500;\n      color: var(--ink);\n    }\n\n    .pr-sec-note {\n      font-size: 10px;\n      letter-spacing: 0.14em;\n      text-transform: uppercase;\n      color: #8A8681;\n    }\n\n    /* ---------- the rest of the coverage ---------- */\n    .pr-grid {\n      display: grid;\n      grid-template-columns: repeat(3, minmax(0, 1fr));\n      gap: 4px;\n      margin-bottom: 44px;\n    }\n\n    .pr-card {\n      display: flex;\n      flex-direction: column;\n      background: var(--card);\n      padding: 0 0 22px;\n    }\n\n    .pr-card-media {\n      display: block;\n      overflow: hidden;\n      background: #FAF8F5;\n      aspect-ratio: 3 / 2;\n      margin-bottom: 16px;\n    }\n\n    .pr-card-media img {\n      width: 100%;\n      height: 100%;\n      object-fit: cover;\n      transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1);\n    }\n\n    .pr-card:hover .pr-card-media img {\n      transform: scale(1.04);\n    }\n\n    .pr-card-body {\n      display: flex;\n      flex-direction: column;\n      flex: 1;\n      padding: 0 16px;\n    }\n\n    .pr-source {\n      font-family: 'Jost', sans-serif;\n      font-size: 10px;\n      letter-spacing: 0.22em;\n      text-transform: uppercase;\n      font-weight: 500;\n      color: var(--gold);\n      margin-bottom: 9px;\n    }\n\n    .pr-headline {\n      font-family: 'Cormorant Garamond', serif;\n      font-size: clamp(17px, 1.7vw, 21px);\n      font-weight: 500;\n      line-height: 1.22;\n      color: var(--ink);\n      margin: 0 0 10px;\n      text-wrap: balance;\n      transition: color 0.25s ease;\n    }\n\n    .pr-card:hover .pr-headline {\n      color: var(--accent);\n    }\n\n    /* pushes the read link to the bottom, so the links across a row\n       sit on one line however long the quotes above them run */\n    .pr-card .pr-read {\n      margin-top: auto;\n      padding-top: 14px;\n    }\n\n    /* ---------- an entry we have not read at source ----------\n       No headline, byline, date or quote is shown for these \u2014 the\n       card says what is known and links out. */\n    .pr-card.is-unverified .pr-headline {\n      font-style: italic;\n      font-weight: 400;\n      color: var(--body);\n    }\n\n    .pr-note {\n      font-size: 13.5px;\n      line-height: 1.6;\n      color: var(--body);\n      margin: 0 0 12px;\n    }\n\n    /* ---------- closing line ---------- */\n    .pr-contact {\n      text-align: center;\n      padding: 30px 20px 6px;\n      position: relative;\n    }\n\n    .pr-contact::before {\n      content: '';\n      position: absolute;\n      inset: 0 0 auto 0;\n      height: 1px;\n      background: #EFEAE1;\n    }\n\n    .pr-contact-title {\n      font-family: 'Cormorant Garamond', serif;\n      font-size: clamp(19px, 2vw, 25px);\n      font-weight: 400;\n      color: var(--ink);\n      margin: 0 0 8px;\n    }\n\n    .pr-contact-text {\n      font-size: 14.5px;\n      line-height: 1.7;\n      color: var(--body);\n      max-width: 480px;\n      margin: 0 auto 14px;\n    }\n\n    .pr-contact a {\n      color: var(--accent);\n    }\n\n    @media (max-width: 900px) {\n      .pr-grid {\n        grid-template-columns: repeat(2, minmax(0, 1fr));\n      }\n    }\n\n    @media (max-width: 640px) {\n      .pr-feature {\n        grid-template-columns: 1fr;\n        gap: 18px;\n      }\n\n      .pr-grid {\n        grid-template-columns: 1fr;\n        gap: 4px;\n      }\n\n      .pr-head {\n        flex-direction: column;\n        align-items: flex-start;\n        gap: 6px;\n      }\n\n      .pr-meta {\n        white-space: normal;\n      }\n    }</style>";

  onMount(() => {
    import('#lib/pages/press.js').then(m => m.default?.());
  });
</script>

<Seo
  title="Press"
  description="What has been written about Vayu — the shop, the objects and the people who make them. For images, interviews or a visit, get in touch."
  path="/pages/press.html"
/>

{@html pageCss}

<main class="wrap press-page">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/index.html">Home</a>
      <span class="sep">|</span>
      <span>Press</span>
    </nav>

    <!-- a <header> here would match the global `header &#123; position: fixed &#125;`
         desktop rule in styles.css and pin the title over the site nav -->
    <div class="pr-head">
      <!-- The heading is kept in the document but not shown: the breadcrumb
           directly above already says Press, so printing it twice was
           redundant. Removing the <h1> outright would leave the page with
           no top-level heading for screen readers and search engines, so it
           is visually hidden instead (see .pr-title). -->
      <h1 class="pr-title">Press</h1>
      <div class="pr-meta" id="prRange">Selected coverage</div>
    </div>

    <p class="pr-statement">
      What has been written about the shop, the objects and the people who
      make them — in their own words.
    </p>

    <!-- featured piece, filled from data/press-data.js -->
    <div id="prFeature"></div>

    <section aria-labelledby="pr-more-title">
      <div class="pr-sec-head">
        <h2 class="pr-sec-title" id="pr-more-title">Further Coverage</h2>
        <span class="pr-sec-note" id="prCount"></span>
      </div>
      <div class="pr-grid" id="prGrid"></div>
    </section>

    <section class="pr-contact" aria-labelledby="pr-contact-title">
      <h2 class="pr-contact-title" id="pr-contact-title">Press Enquiries</h2>
      <p class="pr-contact-text">
        For images, interviews or to arrange a visit to the shop, write to us
        and we will come back to you.
      </p>
      <p class="pr-contact-text">
        <a href="mailto:info@vayuonline.com">info@vayuonline.com</a>
        &nbsp;·&nbsp;
        <a href="tel:+918595977845">+91 8595977845</a>
      </p>
    </section>

  </main>
