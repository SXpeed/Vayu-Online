<script>
  // Vayu — /pages/gallery.html, ported from public/pages/gallery.html.
  import { onMount } from 'svelte';


  onMount(() => {
    import('#lib/pages/gallery.js').then(m => m.default?.());
  });
</script>

<svelte:head>
  <title>Gallery Vayu — Vayu</title>
</svelte:head>


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

    <section id="edit" aria-labelledby="edit-title">
      <div class="g-sec-head">
        <h2 class="g-sec-title" id="edit-title">The Exhibition's Edit</h2>
        <a class="g-sec-note" href="/pages/collection.html" style="color:var(--accent);">All Collections →</a>
      </div>
      <!-- The same tiles the collection grid uses, rendered from events.js
           by lib/pages/venue.js — the pieces the MENU panel lists for this
           show. The curated list has always been in the data; only the
           store page rendered its own, so the gallery's three were shown in
           the menu and nowhere else. -->
      <div class="prod-grid" id="galleryEdit"></div>
    </section>

    <!-- The Visit strip (address, hours, enquiries) used to close this page.
         It is gone for the same reason it went from design-for-living: the
         site footer already carries all three on every page, so this was a
         second copy to keep in step, and it did not stay in step. -->
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
