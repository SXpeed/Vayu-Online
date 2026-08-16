<script>
  /**
   * Vayu — the home page's Curated Categories rail.
   *
   * Rendered from the taxonomy, not written out by hand: this was once a
   * hardcoded rail of five cards, so it silently missed Accents and Souvenir
   * when those categories were added.
   *
   * It reads `categories()` from the store, so it is prerendered from the
   * static taxonomy and re-renders by itself if /api/nav comes back with a
   * different list.
   */
  import { categories, catHref } from '#lib/taxonomy.js';

  const entries = $derived(Object.entries(categories()));
</script>

<div class="curated-grid">
  {#each entries as [slug, cat] (slug)}
    <a class="curated-card" href={catHref(slug)}>
      <img src={cat.curated} alt={cat.title} />
      <div class="card-overlay">
        <span>{cat.title.toUpperCase()}</span>
      </div>
    </a>
  {/each}
</div>
