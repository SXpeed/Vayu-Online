<script>
  /**
   * Vayu — /pages/collection.html: a banner per category with a carousel of
   * its sub-categories.
   *
   * Rendered from the taxonomy for the same reason as everything else that
   * lists categories. This directory used to be hand-written alongside five
   * other copies of the same list and had drifted furthest: it was missing
   * Bowls, Candle Holders, Ceramic and Textile, and linked ?sub=linen and
   * ?sub=glass — two slugs that exist nowhere in the taxonomy, so both landed
   * on an empty grid.
   */
  import { categories, subsOf, catHref } from '#lib/taxonomy.js';

  const entries = $derived(Object.entries(categories()));
</script>

<section class="collection-directory">
  {#each entries as [slug, cat] (slug)}
    <div class="collection-cat-block">
      <a class="collection-cat-banner" href={catHref(slug)}>
        <img src={cat.banner} alt={cat.title} />
        <div class="collection-cat-overlay">
          <h2>{cat.title}</h2>
        </div>
      </a>

      {#if subsOf(slug).length}
        <div class="collection-sub-carousel">
          {#each subsOf(slug) as sub (sub.slug)}
            <a class="collection-sub-link" href={catHref(slug, sub.slug)}>
              <span class="collection-sub-thumb">
                <img src={sub.thumb} alt="" loading="lazy" />
              </span>
              <span class="collection-sub-name">{sub.label}</span>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</section>
