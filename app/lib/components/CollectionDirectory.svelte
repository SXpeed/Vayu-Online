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
  import { imageSize, deliverySrc } from '#shared/content/picture.js';

  /**
   * This page is banners, and the banners are the heaviest pictures the
   * site ships — banner_fashion_32_9 alone was 2MB as a PNG, and there is
   * one per category. AVIF takes the same page from about 14MB to under
   * one, and the dimensions stop each banner shoving the next one down the
   * page as it arrives.
   *
   * A <picture> with an AVIF <source> over a PNG <img> is what used to be
   * here. There is no PNG any more — `deliverySrc` resolves a banner to the
   * AVIF that is actually on disk — so the wrapper had one source to choose
   * from and is gone. A banner uploaded through the panel passes through
   * untouched, and the Worker negotiates its format from Accept instead.
   */
  const dim = (src) => imageSize(src) || {};

  const entries = $derived(Object.entries(categories()));
</script>

<section class="collection-directory">
  {#each entries as [slug, cat], i (slug)}
    <div class="collection-cat-block">
      <a class="collection-cat-banner" href={catHref(slug)}>
        <!-- The first banner is what the page is measured by, so it is not
             lazy; the rest are below the fold. -->
        <img src={deliverySrc(cat.banner)} alt={cat.title} decoding="async"
          width={dim(cat.banner).w} height={dim(cat.banner).h}
          loading={i === 0 ? null : 'lazy'} fetchpriority={i === 0 ? 'high' : null} />
        <div class="collection-cat-overlay">
          <h2>{cat.title}</h2>
        </div>
      </a>

      {#if subsOf(slug).length}
        <div class="collection-sub-carousel">
          {#each subsOf(slug) as sub (sub.slug)}
            <a class="collection-sub-link" href={catHref(slug, sub.slug)}>
              <span class="collection-sub-thumb">
                <!-- Only when there is one. An <img src=""> is not an empty
                     box: the browser resolves the empty string against the
                     page and requests the document again. -->
                {#if sub.thumb}
                <img src={deliverySrc(sub.thumb)} alt="" loading="lazy" decoding="async"
                  width={dim(sub.thumb).w} height={dim(sub.thumb).h} />
                {/if}
              </span>
              <span class="collection-sub-name">{sub.label}</span>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</section>
