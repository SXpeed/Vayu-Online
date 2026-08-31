<script>
  /**
   * Vayu — /pages/event.html?id=<slug>: one show, at either house.
   *
   * Every show now has a page of its own, current or finished. That is the
   * point of the programme being in the database rather than in markup: a
   * season that ends used to vanish along with the photographs of it, and
   * the only record that it happened was a line in a menu that no longer
   * mentioned it.
   *
   * Written in the same `.g-*` language as the two venue pages, because it
   * is the same thing at a different scale — a head, a 16:9 hero, an italic
   * statement, plates, and the pieces gathered for it. The document ships
   * empty and is filled by pages/event.js: one file serves every show, so
   * there is nothing to prerender per event.
   */
  import { onMount } from 'svelte';

  onMount(() => {
    import('#lib/pages/event.js').then(m => m.default?.());
  });
</script>

<svelte:head>
  <title>Exhibition — Vayu</title>
</svelte:head>

<main class="wrap gallery-page">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="/index.html">Home</a>
    <span class="sep">|</span>
    <a id="evVenueCrumb" href="/pages/gallery.html">Gallery Vayu</a>
    <span class="sep">|</span>
    <span id="evCrumb">Exhibition</span>
  </nav>

  <div class="g-head">
    <div>
      <h1 class="g-title" id="evTitle">Exhibition</h1>
    </div>
    <div class="g-meta" id="evDates"></div>
  </div>

  <div class="g-hero" id="evHero"></div>

  <p class="g-statement" id="evStatement"></p>

  <section id="exhibition" aria-labelledby="ev-plates-title">
    <div class="g-sec-head">
      <h2 class="g-sec-title" id="ev-plates-title">The Show</h2>
      <span class="g-sec-note" id="evSecNote"></span>
    </div>
    <div class="g-grid" id="evPlates"></div>
  </section>

  <section id="edit" aria-labelledby="ev-edit-title">
    <div class="g-sec-head">
      <h2 class="g-sec-title" id="ev-edit-title">The Edit</h2>
      <a class="g-sec-note" href="/pages/collection.html" style="color:var(--accent);">All Collections →</a>
    </div>
    <div class="prod-grid" id="evEdit"></div>
  </section>

  <!-- Where a finished show sends you next: the house it was held at, and
       whatever is on there now. -->
  <p class="g-statement" id="evBack"></p>

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
</main>
