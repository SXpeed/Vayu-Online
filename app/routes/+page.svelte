<script>
  // Vayu — /index.html, ported from public/index.html.
  import { onMount } from 'svelte';
  import CuratedGrid from '#lib/components/CuratedGrid.svelte';
  import { initHero } from '#lib/core/hero.js';
  import { BRAND, SITE_DESCRIPTION, SITE_ORIGIN, STORE, absolute } from '#shared/content/brand.js';
  import { INSIDE_VAYU_SHIPPED } from '#shared/content/inside-vayu.js';
  import { ARTIST_BAND_SHIPPED } from '#shared/content/home-artist.js';
  import { imageSize, deliverySrc } from '#shared/content/picture.js';

  /**
   * A picture's own dimensions, from the manifest scripts/images.mjs writes.
   * Stated on every <img> below: without them the browser cannot reserve the
   * space, so the page shifts under the reader as each one arrives — which
   * is most of what a poor layout-shift score is made of.
   */
  const dim = (src) => imageSize(src) || {};

  /**
   * What a search engine is told about the site itself.
   *
   * Organization and WebSite rather than one blob: Organization is what a
   * brand panel is built from, WebSite is what the site name in a result is
   * taken from. Both name the brand identically — a disagreement between
   * them is how a result ends up titled "vayuindia.com" instead.
   */
  const siteLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        // Store, not plain Organization: this is a shop you can walk into,
        // and the address is what answers "concept stores in Lodhi Colony"
        // or "where to buy Indian craft in Delhi" — the queries an assistant
        // fields and a plain Organization cannot be the answer to. The
        // footer has printed this address all along with nothing marking it
        // up as a place.
        '@type': ['Store', 'Organization'],
        '@id': SITE_ORIGIN + '/#organization',
        name: BRAND,
        legalName: STORE.legalName,
        alternateName: 'Vayu',
        url: SITE_ORIGIN + '/',
        description: SITE_DESCRIPTION,
        logo: absolute('/assets/og/hero.jpg'),
        image: absolute('/assets/og/hero.jpg'),
        telephone: STORE.telephone,
        email: STORE.email,
        currenciesAccepted: 'INR',
        areaServed: 'IN',
        address: {
          '@type': 'PostalAddress',
          streetAddress: STORE.street,
          addressLocality: STORE.locality,
          addressRegion: STORE.region,
          postalCode: STORE.postalCode,
          addressCountry: STORE.country,
        },
        // The Maps place the footer's GET DIRECTIONS already points at. This
        // is what joins the markup to the Google Business Profile.
        sameAs: [STORE.maps],
      },
      {
        '@type': 'WebSite',
        '@id': SITE_ORIGIN + '/#website',
        name: BRAND,
        url: SITE_ORIGIN + '/',
        description: SITE_DESCRIPTION,
        publisher: { '@id': SITE_ORIGIN + '/#organization' },
      },
    ],
    // Escaped the same way the product page escapes its own block: a '<'
    // inside a JSON string would otherwise close the script element early.
  }).replace(/</g, '\u003c');

  const ldTag = (json) => '<script type="application/ld+json">' + json + '<\/script>';

  // Starts the carousel over the two slides in the markup below. If the
  // admin panel has its own, core/site-content.js rebuilds the section once
  // /api/nav answers and starts it again over those.
  onMount(initHero);
</script>

<svelte:head>
  <!-- The brand alone. Suffixing it with keywords pushed the title to 69
       characters, past where Google truncates, and left it reading with two
       em dashes in a row. The keywords belong in the description below. -->
  <title>{BRAND}</title>
  <!-- The snippet Google prints under the domain. Without it the crawler
       writes its own out of whatever text it meets first in the markup,
       which on this page was the hero campaign's alt text. -->
  <meta name="description" content={SITE_DESCRIPTION} />
  <link rel="canonical" href={SITE_ORIGIN + '/'} />

  <meta property="og:type" content="website" />
  <meta property="og:site_name" content={BRAND} />
  <meta property="og:title" content={BRAND} />
  <meta property="og:description" content={SITE_DESCRIPTION} />
  <meta property="og:url" content={SITE_ORIGIN + '/'} />
  <meta property="og:image" content={absolute('/assets/og/hero.jpg')} />
  <meta property="og:locale" content="en_IN" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={BRAND} />
  <meta name="twitter:description" content={SITE_DESCRIPTION} />
  <meta name="twitter:image" content={absolute('/assets/og/hero.jpg')} />

  {@html ldTag(siteLd)}
</svelte:head>

<!-- FULL-BLEED DESKTOP HERO CAMPAIGN
       Two layers on purpose: .hero-full-content spans the whole hero and
       carries the darkening gradient, while .hero-full-inner holds the text
       inside the same 1440px column as the rest of the page. Putting the
       max-width on the gradient layer instead leaves the hero's outer strips
       undarkened, with two hard vertical seams where the gradient stops. -->
  <section class="hero-full" id="homeHero" aria-roledescription="carousel" aria-label="Featured">
    <div class="hero-slide is-active" data-hero-slide>
      <img src={deliverySrc('/assets/images/hero.jpg')} alt="Vayu Autumn / Winter Campaign 2026"
        width={dim('/assets/images/hero.jpg').w} height={dim('/assets/images/hero.jpg').h}
        fetchpriority="high" decoding="async">
      <div class="hero-full-content">
        <div class="hero-full-inner">
          <h1 class="hero-full-title">ECHOES OF VAYU</h1>
          <a href="/pages/collection.html" class="hero-full-btn">DISCOVER THE CAMPAIGN</a>
        </div>
      </div>
    </div>
    <!-- The poster carries its own typography, so it gets no overlay and no
         darkening — and it is contained rather than cropped, or the hero's
         landscape frame would cut the dates off. -->
    <a class="hero-slide hero-slide-poster" data-hero-slide href="/pages/gallery.html">
      <img src={deliverySrc('/assets/images/personal_heirlooms.jpg')}
        alt="Personal Heirlooms — Sarees from the Collection of Malvika Singh, on view till 23 August 2026, Gallery Vayu"
        width={dim('/assets/images/personal_heirlooms.jpg').w} height={dim('/assets/images/personal_heirlooms.jpg').h}
        loading="lazy" decoding="async">
    </a>
    <!-- progress rails: the active one fills over the autoplay interval, so
         the shift to the next image is visible before it happens -->
    <div class="hero-bars" role="tablist" aria-label="Choose slide">
      <button type="button" class="hero-bar is-active" role="tab" aria-selected="true" aria-label="Echoes of Vayu">
        <span class="hero-bar-fill"></span>
      </button>
      <button type="button" class="hero-bar" role="tab" aria-selected="false" aria-label="Personal Heirlooms">
        <span class="hero-bar-fill"></span>
      </button>
    </div>
  </section>

  <main class="wrap home-main">

    <!-- CURATED COLLECTIONS -->
    <section class="curated-section" aria-label="Curated Collections">
      <div class="sec-head">
        <h2 class="sec-title">CURATED CATEGORIES</h2>
        <a class="link-cta" href="/pages/collection.html">VIEW ALL &nbsp;→</a>
      </div>
      <CuratedGrid />
    </section>

    <!-- INSIDE VAYU — GALLERY TILES -->
    <!-- Painted from shared/content/inside-vayu.js, which the repaint in
         core/site-content.js and the panel's Inside Vayu card read as well:
         what this block ships with, and what the panel tells the shop it
         ships with, cannot then disagree. -->
    <section class="gallery-tiles" aria-label="Inside Vayu">
      <div class="sec-head">
        <h2 class="sec-title">{INSIDE_VAYU_SHIPPED.title}</h2>
        <a class="link-cta" href={INSIDE_VAYU_SHIPPED.ctaHref}>{INSIDE_VAYU_SHIPPED.ctaText} &nbsp;→</a>
      </div>
      <a class="gallery-tiles-hero" href={INSIDE_VAYU_SHIPPED.heroHref}>
        <img src={deliverySrc(INSIDE_VAYU_SHIPPED.heroImg)} alt={INSIDE_VAYU_SHIPPED.heroAlt}
          width={dim(INSIDE_VAYU_SHIPPED.heroImg).w} height={dim(INSIDE_VAYU_SHIPPED.heroImg).h}
          loading="lazy" decoding="async">
      </a>
      <div class="gallery-tiles-row">
        {#each INSIDE_VAYU_SHIPPED.tiles as tile}
          <a class="gallery-tiles-thumb" href={tile.href}>
            <img src={deliverySrc(tile.img)} alt={tile.alt} width={dim(tile.img).w} height={dim(tile.img).h}
              loading="lazy" decoding="async">
          </a>
        {/each}
      </div>
    </section>

    <!-- ARTIST BAND — painted from shared/content/home-artist.js, which the
         repaint and the panel's Featured artist card read as well. -->
    <section class="jenjum-section" aria-label={ARTIST_BAND_SHIPPED.alt}>
      <a href={ARTIST_BAND_SHIPPED.href} style="display:block; text-decoration:none;">
        <img src={deliverySrc(ARTIST_BAND_SHIPPED.img)} alt={ARTIST_BAND_SHIPPED.alt}
          width={dim(ARTIST_BAND_SHIPPED.img).w} height={dim(ARTIST_BAND_SHIPPED.img).h}
          loading="lazy" decoding="async"
          style="width: 100%; height: auto; display: block; border-radius: 2px;">
      </a>
    </section>

    <!-- CURATED SPACES & STORIES (closing section) -->
    <section class="trio-minimal">
      <div class="sec-head">
        <h2 class="sec-title">STORIES OF MODERN HERITAGE</h2>
        <a class="link-cta" href="/pages/press.html">VIEW ALL STORIES &nbsp;→</a>
      </div>

      <div class="trio-grid">
        <a class="trio-item" href="/pages/artist.html">
          <div class="trio-img-box">
            <img src={deliverySrc('/assets/images/makers.jpg')} alt="The Artists"
              width={dim('/assets/images/makers.jpg').w} height={dim('/assets/images/makers.jpg').h}
              loading="lazy" decoding="async">
          </div>
          <div class="trio-meta">
            <h3>The Artists</h3>
            <p>Honouring master artists who carve, lathe and weave by living tradition.</p>
            <span class="trio-cta">DISCOVER ARTISTS &nbsp;→</span>
          </div>
        </a>

        <a class="trio-item" href="/pages/press.html">
          <div class="trio-img-box">
            <img src={deliverySrc('/assets/images/journal_nyt_press.png')} alt="Vayu in the press"
              width={dim('/assets/images/journal_nyt_press.png').w} height={dim('/assets/images/journal_nyt_press.png').h}
              loading="lazy" decoding="async">
          </div>
          <div class="trio-meta">
            <h3>Press</h3>
            <p>What has been written about the shop, the objects and the people who make them.</p>
            <span class="trio-cta">READ THE PRESS &nbsp;→</span>
          </div>
        </a>

        <a class="trio-item" href="/pages/curated-spaces.html">
          <div class="trio-img-box">
            <img src={deliverySrc('/assets/images/cat_furniture.jpg')} alt="Curated Spaces"
              width={dim('/assets/images/cat_furniture.jpg').w} height={dim('/assets/images/cat_furniture.jpg').h}
              loading="lazy" decoding="async">
          </div>
          <div class="trio-meta">
            <h3>Curated Spaces</h3>
            <p>Architectural interior concepts designed for soulful luxury living spaces.</p>
            <span class="trio-cta">VIEW SPACES &nbsp;→</span>
          </div>
        </a>
      </div>
    </section>

  </main>
