<script>
  // Vayu — /pages/about.html, ported from public/pages/about.html.

  // Emitted through {@html} rather than written as a component <style>:
  // Svelte scopes component styles, and these selectors target markup
  // that the global stylesheet and other components own.
  const pageCss = "<style>.about-split {\n      grid-template-columns: 1fr 1fr;\n      gap: clamp(30px, 4vw, 50px);\n      margin-bottom: 50px;\n      /* No padding on the card. It used to inset everything inside it,\n         the image included, so the photograph floated in a frame of card\n         background. The padding now belongs to the text column alone and\n         the image runs to the card's own edge. */\n      padding: 0;\n    }\n\n    /* the image column stretches to the row height, so no card background\n       shows beneath the photograph when the text column is the taller one */\n    .about-split>:first-child {\n      display: flex;\n    }\n\n    .about-split>:last-child {\n      padding: clamp(24px, 4vw, 48px) clamp(24px, 4vw, 48px) clamp(24px, 4vw, 48px) 0;\n    }\n\n    .about-img {\n      width: 100%;\n      height: 100%;\n      aspect-ratio: 4 / 5;\n      object-fit: cover;\n    }\n\n    .about-title {\n      font-family: 'Cormorant Garamond', serif;\n      font-size: clamp(32px, 3vw, 44px);\n      color: var(--ink);\n      font-weight: 500;\n      line-height: 1.2;\n      margin-bottom: 24px;\n    }\n\n    .about-copy {\n      font-size: 16.5px;\n      color: var(--body);\n      line-height: 1.8;\n      margin-bottom: 20px;\n    }\n\n    .about-copy:last-of-type {\n      margin-bottom: 30px;\n    }\n\n    .about-stats {\n      display: grid;\n      grid-template-columns: 1fr 1fr;\n      gap: 20px;\n      padding-top: 20px;\n      /* drawn as a background: the flat layer forces border-color to\n         transparent, so a border-top here would be invisible */\n      background-image: linear-gradient(#E8E2D8, #E8E2D8);\n      background-size: 100% 1px;\n      background-position: 0 0;\n      background-repeat: no-repeat;\n    }\n\n    .about-stat-num {\n      font-family: 'Cormorant Garamond', serif;\n      font-size: 26px;\n      color: var(--ink);\n      font-weight: 600;\n    }\n\n    .about-stat-label {\n      font-size: 13px;\n      color: #6A6A64;\n      text-transform: uppercase;\n      letter-spacing: 0.1em;\n      font-weight: 500;\n    }\n\n    @media (max-width: 768px) {\n      .about-split {\n        grid-template-columns: 1fr;\n        margin-bottom: 32px;\n        /* stacked, the text column's own padding is the separation \u2014 the\n           gap would add a second band of card background under the image */\n        gap: 0;\n      }\n\n      .about-split>:last-child {\n        padding: clamp(20px, 6vw, 32px);\n      }\n    }</style>";
</script>

<svelte:head>
  <title>About Us — Vayu</title>
</svelte:head>

{@html pageCss}

<main class="wrap">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/index.html">Home</a>
      <span class="sep">|</span>
      <span>About Us</span>
    </nav>

    <!-- Styling moved out of the style attributes into classes. The inline
         block also carried `border-radius: 20px` on the card and `14px` on
         the image plus `border: 1px solid var(--line)`, none of which ever
         rendered: --line is transparent, and the flat-design layer at the
         end of styles.css forces `border-radius: 2px !important`, which
         beats an inline style. They were removed rather than un-flattened,
         because the flat look is deliberate. Same for the two
         `border-top: 1px solid var(--line)` rules, which drew nothing —
         the stat divider is now a real hairline. -->
    <section class="about-split">
      <div>
        <img class="about-img" src="/assets/images/hero.jpg" alt="Inside the Vayu space, New Delhi" loading="lazy">
      </div>
      <div>
        <h2 class="about-title">Design For Living,<br>Rooted in Culture.</h2>
        <p class="about-copy">Vayu is a cultural art and design space from New Delhi, celebrating Indian
          craftsmanship in all its contemporary glory. We collaborate with independent designers and master artists
          across the subcontinent.</p>
        <p class="about-copy">Our philosophy is simple: surround yourself with objects that have a story. From
          hand-carved teakwood furniture to meticulously woven textiles, every piece in our curation is chosen for its
          integrity, beauty, and timelessness.</p>
        <div class="about-stats">
          <div>
            <div class="about-stat-num">2011</div>
            <div class="about-stat-label">Year Established</div>
          </div>
          <div>
            <div class="about-stat-num">45+</div>
            <div class="about-stat-label">Artist Partners</div>
          </div>
        </div>
      </div>
    </section>
  </main>
