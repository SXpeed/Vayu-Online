<script>
  import Seo from '#lib/components/Seo.svelte';
  import { deliverySrc } from '#shared/content/picture.js';
  // Vayu — /pages/about.html, ported from public/pages/about.html.

  // Emitted through {@html} rather than written as a component <style>:
  // Svelte scopes component styles, and these selectors target markup
  // that the global stylesheet and other components own.
  const pageCss = "<style>.about-split {\n      grid-template-columns: 1fr 1fr;\n      gap: clamp(30px, 4vw, 50px);\n      margin-bottom: 50px;\n      /* No padding on the card. It used to inset everything inside it,\n         the image included, so the photograph floated in a frame of card\n         background. The padding now belongs to the text column alone and\n         the image runs to the card's own edge. */\n      padding: 0;\n    }\n\n    /* the image column stretches to the row height, so no card background\n       shows beneath the photograph when the text column is the taller one */\n    .about-split>:first-child {\n      display: flex;\n    }\n\n    .about-split>:last-child {\n      padding: clamp(24px, 4vw, 48px) clamp(24px, 4vw, 48px) clamp(24px, 4vw, 48px) 0;\n    }\n\n    .about-img {\n      width: 100%;\n      height: 100%;\n      aspect-ratio: 4 / 5;\n      object-fit: cover;\n    }\n\n    .about-title {\n      font-family: 'Cormorant Garamond', serif;\n      font-size: clamp(32px, 3vw, 44px);\n      color: var(--ink);\n      font-weight: 500;\n      line-height: 1.2;\n      margin-bottom: 24px;\n    }\n\n    .about-copy {\n      font-size: 16.5px;\n      color: var(--body);\n      line-height: 1.8;\n      margin-bottom: 20px;\n    }\n\n    .about-copy:last-of-type {\n      margin-bottom: 0;\n    }\n\n    @media (max-width: 768px) {\n      .about-split {\n        grid-template-columns: 1fr;\n        margin-bottom: 32px;\n        /* stacked, the text column's own padding is the separation — the\n           gap would add a second band of card background under the image */\n        gap: 0;\n      }\n\n      .about-split>:last-child {\n        padding: clamp(20px, 6vw, 32px);\n      }\n    }</style>";
</script>

<Seo
  title="About Us"
  description="Vayu is a New Delhi cultural art and design space devoted to Indian craftsmanship — bridging heritage craft traditions with contemporary expression."
  path="/pages/about.html"
/>

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
         because the flat look is deliberate.

         All four paragraphs sit in the right column. The image is stretched
         to the text column's height so no card background shows beneath it,
         which means the taller the copy, the more `object-fit: cover` crops
         the photograph horizontally. -->
    <section class="about-split">
      <div>
        <img class="about-img" src={deliverySrc('/assets/images/hero.jpg')} alt="Inside the Vayu space, New Delhi" loading="lazy">
      </div>
      <div>
        <h1 class="about-title">Design For Living,<br>Rooted in Culture.</h1>
        <p class="about-copy">Vayu—Design for Living is a New Delhi based cultural art and design space devoted to
          celebrating the depth and diversity of Indian craftsmanship. Eclectic in spirit and rooted in authenticity,
          Vayu bridges India’s rich craft traditions with contemporary expression, offering a space where heritage and
          modernity meet with ease and intention.</p>
        <p class="about-copy">Working closely with master artisans, emerging artists, and established creatives from
          across the country, Vayu serves as a platform for preservation, innovation, and dialogue. Through
          thoughtfully curated exhibitions, collaborative projects, cultural initiatives, and sustainable design-led
          interventions, the space honours traditional skills while encouraging new creative pathways.</p>
        <p class="about-copy">Guided by the belief that craft is a living, evolving practice, Vayu is dedicated to
          nurturing artisans and artists, supporting endangered techniques, and building ethical, equitable models for
          creative livelihoods. Its mission extends beyond display—towards research, documentation, education, and
          creating meaningful public engagement with India’s artistic heritage.</p>
        <p class="about-copy">More than a gallery, Vayu is an experience. It offers a mindful, sensory journey through
          objects, stories, and materials inviting visitors to slow down, observe, and connect with the cultural memory
          embedded in every piece. Here, tradition is not preserved in isolation but celebrated as a vibrant,
          contemporary force that continues to shape the way we live, create, and imagine.</p>
      </div>
    </section>
  </main>
