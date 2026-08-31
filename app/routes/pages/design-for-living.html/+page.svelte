<script>
  import Seo from '#lib/components/Seo.svelte';
  // Vayu — /pages/design-for-living.html, ported from public/pages/design-for-living.html.
  import { onMount } from 'svelte';
  import { deliverySrc } from '#shared/content/picture.js';


  onMount(() => {
    import('#lib/pages/design-for-living.js').then(m => m.default?.());
  });
</script>

<Seo
  title="Design for Living — The Shop"
  description="The Vayu shop in Lodhi Colony, New Delhi. A season of lighter cloth — linen, cotton and khadi — and the rooms we have set around them."
  path="/pages/design-for-living.html"
/>


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

    <!-- The hero opens the current show's own page, which is where its
         pictures now live. It used to jump to a plate section further down
         this page; that section has gone, and an anchor to an element that
         no longer exists is a link that silently does nothing.
         pages/venue.js sets the href from the show marked "Now on". -->
    <a class="g-hero" id="venueHero" href="/pages/design-for-living.html">
      <img src={deliverySrc('/assets/images/summer_cut.png')} alt="Summer Cut — from 21 May 2026, Vayu Design for Living">
    </a>

    <p class="g-statement">
      A season of lighter cloth — linen, cotton and khadi, cut for the heat, and
      the rooms we have set around them.
    </p>

    <!-- "The Season's Edit" — the curated product tiles — used to close the
         page. It is gone with the gallery's equivalent: the pieces gathered
         for a show now live on that show's own page, where they belong to
         one season rather than to the address. -->

  </main>

  <!-- The lightbox went with the plates. Nothing on this page enlarges any
       more: the past-show tiles are links to pages, and the pictures of each
       show are on the show's own page, which carries its own viewer. -->
