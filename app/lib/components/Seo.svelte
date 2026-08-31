<script>
  /**
   * Vayu — the head every page owes a search engine.
   *
   * Before this, seventeen of nineteen pages carried a <title> and nothing
   * else: no description, so Google wrote the snippet itself out of whatever
   * text it met first; no canonical; no Open Graph, so a link shared to
   * WhatsApp or Instagram showed no card. Four category pages shared one
   * title and every journal story shared another, which is how two pages end
   * up competing for the same result and suppressing each other.
   *
   * One component rather than seventeen copies of the same eleven tags: the
   * tags cannot drift apart, and the brand and origin come from
   * shared/content/brand.js so they agree with the structured data.
   *
   * @param title        the page's own name. " — Vayu" is appended unless the
   *                     title already names the brand.
   * @param description  the search snippet. Keep it under ~160 characters;
   *                     past that Google truncates mid-sentence.
   * @param path         site-relative, leading slash, for the canonical.
   * @param image        the card image for a shared link.
   * @param type         Open Graph type: website, article, product.
   * @param noindex      for pages with nothing to rank — a cart, an account,
   *                     a legacy URL rendering its fallback. `follow` stays
   *                     on so link equity still flows through them.
   */
  import { BRAND, BRAND_SHORT, SITE_ORIGIN, absolute } from '#shared/content/brand.js';

  let {
    title,
    description,
    path,
    image = '/assets/og/hero.jpg',
    type = 'website',
    noindex = false,
  } = $props();

  const fullTitle = $derived(
    /vayu/i.test(title) ? title : `${title} — ${BRAND_SHORT}`,
  );
  const canonical = $derived(SITE_ORIGIN + path);
  const cardImage = $derived(absolute(image));
</script>

<svelte:head>
  <title>{fullTitle}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  {#if noindex}<meta name="robots" content="noindex, follow" />{/if}

  <meta property="og:type" content={type} />
  <meta property="og:site_name" content={BRAND} />
  <meta property="og:title" content={fullTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonical} />
  <meta property="og:image" content={cardImage} />
  <meta property="og:locale" content="en_IN" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={fullTitle} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={cardImage} />
</svelte:head>
