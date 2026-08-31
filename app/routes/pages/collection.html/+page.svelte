<script>
  import Seo from '#lib/components/Seo.svelte';
  import CollectionDirectory from '#lib/components/CollectionDirectory.svelte';
  // Vayu — /pages/collection.html, ported from public/pages/collection.html.
</script>

<Seo
  title="Collection"
  description="Browse the Vayu collection — furniture, homeware, decor and fashion by master artisans and contemporary Indian makers, across every category we carry."
  path="/pages/collection.html"
/>

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
    <!-- The page had no <h1>: its only headings were the per-category <h2>s
         inside the directory, which left the document with no subject of its
         own. Visually hidden rather than printed, because the breadcrumb
         above already says "Collection" and a second heading saying the same
         word would be redundant on screen — clipped, not display:none, so it
         stays in the accessibility tree. -->
    <h1 class="visually-hidden">Collection</h1>
    <CollectionDirectory />
  </main>
