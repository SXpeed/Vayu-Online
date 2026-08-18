<script>
  // Vayu — /pages/curated-spaces.html.
  //
  // The third page in the .g-* editorial language, after Design for Living
  // and Gallery Vayu. It is reached from the "Curated Spaces" tile on the
  // home page, which used to point at the gallery: the tile said VIEW
  // SPACES and landed on an exhibition of objects, which is a different
  // promise.
  //
  // The styling is the shared venue block in public/css/styles.css — this
  // page declares no CSS of its own.
  import { onMount } from 'svelte';

  onMount(() => {
    import('#lib/pages/curated-spaces.js').then(m => m.default?.());
  });
</script>

<svelte:head>
  <title>Curated Spaces — Vayu</title>
</svelte:head>

<main class="wrap gallery-page">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/index.html">Home</a>
      <span class="sep">|</span>
      <span>Curated Spaces</span>
    </nav>

    <div class="g-head">
      <div>
        <h1 class="g-title">Curated Spaces</h1>
      </div>
      <div class="g-meta">Three settings</div>
    </div>

    <!-- A photographed room, not the category banner: banner_home_21_9.png
         is a row of cut-out objects on a pale ground, which at 16:9 reads
         as an empty page rather than as a space. -->
    <a class="g-hero" href="#spaces">
      <img src="/assets/images/cat_furniture.jpg" alt="A room set with cane and teak">
    </a>

    <p class="g-statement">
      Rooms rather than shelves — each one set from a single part of the
      collection, so a piece can be seen where it is meant to live.
    </p>

    <section id="spaces" aria-labelledby="spaces-title">
      <div class="g-sec-head">
        <h2 class="g-sec-title" id="spaces-title">The Spaces</h2>
        <span class="g-sec-note">Furniture · Home · Decor</span>
      </div>
      <!-- The three slugs here are the same three lib/pages/curated-spaces.js
           builds the rail below from, so the pictures and the pieces cannot
           describe different rooms. -->
      <!-- Rooms, not cut-outs. The obvious picks (cat_tableware.png,
           cat_objects.png) are catalogue shots of objects on white, and a
           plate of one reads as a blank tile beside a photographed room. -->
      <div class="g-grid">
        <figure class="g-card">
          <button type="button" class="g-card-media" aria-label="Enlarge image">
            <img src="/assets/images/journal_mindful_spaces.png"
              alt="A chair, a throw and a vase in a quiet corner" loading="lazy">
          </button>
          <figcaption>
            <span class="g-card-name">The Living Room</span>
            <span class="g-card-tag">Furniture</span>
          </figcaption>
        </figure>
        <figure class="g-card">
          <button type="button" class="g-card-media" aria-label="Enlarge image">
            <img src="/assets/images/journal_craft_heritage.png"
              alt="A brass urli set on a marble table" loading="lazy">
          </button>
          <figcaption>
            <span class="g-card-name">The Long Table</span>
            <span class="g-card-tag">Home</span>
          </figcaption>
        </figure>
        <figure class="g-card">
          <button type="button" class="g-card-media" aria-label="Enlarge image">
            <img src="/assets/images/cat_art.jpg"
              alt="Vessels and stone gathered on a plinth" loading="lazy">
          </button>
          <figcaption>
            <span class="g-card-name">The Quiet Corner</span>
            <span class="g-card-tag">Decor</span>
          </figcaption>
        </figure>
      </div>
    </section>

    <section id="edit" aria-labelledby="edit-title">
      <div class="g-sec-head">
        <h2 class="g-sec-title" id="edit-title">Shop the Spaces</h2>
        <a class="g-sec-note" href="/pages/collection.html" style="color:var(--accent);">All Collections →</a>
      </div>
      <!-- Built from the catalogue rather than a hand-written list: a piece
           added to Furniture in the panel turns up under The Living Room
           without anyone remembering to add it here too. -->
      <div class="prod-grid" id="spacesEdit"></div>
    </section>

  </main>

  <!-- Same native <dialog> as the other two venue pages: Escape, the focus
       trap and the inert backdrop come from the platform. -->
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
