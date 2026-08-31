<script>
  import Seo from '#lib/components/Seo.svelte';
  // Vayu — /pages/curated-spaces.html.
  //
  // The third page in the .g-* editorial language, after Design for Living
  // and Gallery Vayu. It is reached from the "Curated Spaces" tile on the
  // home page, which used to point at the gallery: the tile said VIEW
  // SPACES and landed on an exhibition of objects, which is a different
  // promise.
  //
  // The styling is the shared venue block in app/styles/styles.css — this
  // page declares no CSS of its own.
  //
  // The copy and the plates are no longer written here. They come from
  // shared/content/curated-spaces.js, which is what the admin panel edits
  // (Site → Curated Spaces) and what lib/pages/curated-spaces.js swaps in
  // once the saved version arrives. Rendering the shipped document at
  // build time keeps the prerendered HTML and the panel's starting point
  // the same words, so the page never flashes from one to another.
  import { onMount } from 'svelte';
  import { CURATED_SPACES_DEFAULT as c } from '#shared/content/curated-spaces.js';
  import { deliverySrc } from '#shared/content/picture.js';

  onMount(() => {
    import('#lib/pages/curated-spaces.js').then(m => m.default?.());
  });
</script>

<Seo
  title="Curated Spaces"
  description="Rooms rather than shelves — each set from a single part of the Vayu collection, so a piece can be seen where it is meant to live."
  path="/pages/curated-spaces.html"
/>

<main class="wrap gallery-page">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/index.html">Home</a>
      <span class="sep">|</span>
      <span>Curated Spaces</span>
    </nav>

    <div class="g-head" id="csHead">
      <div>
        <h1 class="g-title">{c.title}</h1>
      </div>
      <div class="g-meta">{c.meta}</div>
    </div>

    <a class="g-hero" href="#spaces" id="csHero">
      <img src={deliverySrc(c.heroImg)} alt={c.heroAlt}>
    </a>

    <p class="g-statement" id="csStatement">{c.statement}</p>

    <section id="spaces" aria-labelledby="spaces-title">
      <div class="g-sec-head">
        <h2 class="g-sec-title" id="spaces-title">{c.sectionTitle}</h2>
        <span class="g-sec-note" id="csSectionNote">{c.sectionNote}</span>
      </div>
      <div class="g-grid" id="csGrid">
        {#each c.rooms as room}
          <figure class="g-card">
            <button type="button" class="g-card-media" aria-label="Enlarge image">
              <img src={deliverySrc(room.img)} alt={room.alt} loading="lazy">
            </button>
            <figcaption>
              <span class="g-card-name">{room.name}</span>
              <span class="g-card-tag">{room.tag}</span>
            </figcaption>
          </figure>
        {/each}
      </div>
    </section>

    <section id="edit" aria-labelledby="edit-title">
      <div class="g-sec-head">
        <h2 class="g-sec-title" id="edit-title">{c.shopTitle}</h2>
        <a class="g-sec-note" href="/pages/collection.html" style="color:var(--accent);">All Collections →</a>
      </div>
      <!-- Built from the catalogue rather than a hand-written list: a piece
           added to a room's category in the panel turns up here without
           anyone remembering to add it twice. -->
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
