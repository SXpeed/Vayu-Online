<script>
  import Seo from '#lib/components/Seo.svelte';
  // Vayu — /pages/gallery.html, ported from public/pages/gallery.html.
  import { onMount } from 'svelte';
  import { deliverySrc } from '#shared/content/picture.js';


  onMount(() => {
    import('#lib/pages/gallery.js').then(m => m.default?.());
  });
</script>

<Seo
  title="Gallery Vayu"
  description="Gallery Vayu, New Delhi — exhibitions of brass, clay, cane and handwoven cloth, gathered from the makers we have kept company with for a decade."
  path="/pages/gallery.html"
/>


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

    <!-- The hero opens the current show's own page, which is where its
         pictures now live. It used to jump to a plate section further down
         this page; that section has gone, and an anchor to an element that
         no longer exists is a link that silently does nothing.
         pages/venue.js sets the href from the show marked "Now on". -->
    <a class="g-hero" id="venueHero" href="/pages/gallery.html">
      <img src={deliverySrc('/assets/images/gallery_hero.jpg')} alt="Personal Heirlooms">
    </a>

    <p class="g-statement">
      A room of quiet objects — brass, clay, cane and handwoven cloth — gathered
      from the makers we have kept company with for a decade.
    </p>

    <!-- Two sections used to close this page: "The Hands Behind It", a pair
         of stock craft photographs that belonged to no particular show, and
         "The Exhibition's Edit", the curated product tiles. Both are gone, so
         this page and design-for-living.html now read the same way — head,
         hero, statement, the plates of the show that is on, and what has been
         shown before. The pieces gathered for a show are still listed, on the
         show's own page (/pages/event.html?id=), where they describe one
         exhibition rather than the venue in general. -->

    <!-- The Visit strip (address, hours, enquiries) used to close this page.
         It is gone for the same reason it went from design-for-living: the
         site footer already carries all three on every page, so this was a
         second copy to keep in step, and it did not stay in step. -->
  </main>

  <!-- The lightbox went with the plates. Nothing on this page enlarges any
       more: the past-show tiles are links to pages, and the pictures of each
       show are on the show's own page, which carries its own viewer. -->
