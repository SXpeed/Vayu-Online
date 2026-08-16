<script>
  import CollectionDirectory from '#lib/components/CollectionDirectory.svelte';
  // Vayu — /pages/collection.html, ported from public/pages/collection.html.
</script>

<svelte:head>
  <title>Collection - Vayu</title>
</svelte:head>

<main class="wrap collection-page">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/index.html">Home</a>
      <span class="sep">|</span>
      <span>Collection</span>
    </nav>

    <!-- The Sort control that used to sit here was inert twice over: this
         page is a directory of category banners with no product grid, so
         the sort code in script.js (gated on #collectionGrid) never bound
         to it; and its <option>s had no value attributes, so even wired it
         would have fallen through to "featured" on every choice. Sorting
         belongs on collection-detail.html, which has both. -->
    <CollectionDirectory />
  </main>
