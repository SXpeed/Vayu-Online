<script>
  // Vayu — /pages/design-for-living.html, ported from public/pages/design-for-living.html.
  import { onMount } from 'svelte';


  onMount(() => {
    import('#lib/pages/design-for-living.js').then(m => m.default?.());
  });
</script>

<svelte:head>
  <title>Vayu — Design for Living</title>
</svelte:head>


<main class="wrap gallery-page">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/index.html">Home</a>
      <span class="sep">|</span>
      <span>Design for Living</span>
    </nav>

    <div class="g-head">
      <div>
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
