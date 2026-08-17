<script>
  // Vayu — /index.html, ported from public/index.html.
  import { onMount } from 'svelte';
  import CuratedGrid from '#lib/components/CuratedGrid.svelte';
  import { initHero } from '#lib/core/hero.js';

  // Starts the carousel over the two slides in the markup below. If the
  // admin panel has its own, core/site-content.js rebuilds the section once
  // /api/nav answers and starts it again over those.
  onMount(initHero);
</script>

<svelte:head>
  <title>Vayu — Design for Living</title>
</svelte:head>

<!-- FULL-BLEED DESKTOP HERO CAMPAIGN
       Two layers on purpose: .hero-full-content spans the whole hero and
       carries the darkening gradient, while .hero-full-inner holds the text
       inside the same 1440px column as the rest of the page. Putting the
       max-width on the gradient layer instead leaves the hero's outer strips
       undarkened, with two hard vertical seams where the gradient stops. -->
  <section class="hero-full" id="homeHero" aria-roledescription="carousel" aria-label="Featured">
    <div class="hero-slide is-active" data-hero-slide>
      <img src="/assets/images/hero.jpg" alt="Vayu Autumn / Winter Campaign 2026" fetchpriority="high">
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
      <img src="/assets/images/personal_heirlooms.jpg"
        alt="Personal Heirlooms — Sarees from the Collection of Malvika Singh, on view till 23 August 2026, Gallery Vayu" loading="lazy">
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
    <section class="gallery-tiles" aria-label="Inside Vayu">
      <div class="sec-head">
        <h2 class="sec-title">INSIDE VAYU</h2>
        <a class="link-cta" href="/pages/gallery.html">VISIT THE GALLERY &nbsp;→</a>
      </div>
      <a class="gallery-tiles-hero" href="/pages/gallery.html">
        <img src="/assets/images/gallery_hero.jpg" alt="Inside Vayu — New Delhi Atelier">
      </a>
      <div class="gallery-tiles-row">
        <a class="gallery-tiles-thumb" href="/pages/gallery.html">
          <img src="/assets/images/gallery_tile1.jpg" alt="Summer Ceramics Poster">
        </a>
        <a class="gallery-tiles-thumb" href="/pages/gallery.html">
          <img src="/assets/images/summer_cut.png" alt="Summer Cut — 21 May 2026, Vayu Design for Living, 14 Main Market">
        </a>
      </div>
    </section>

    <!-- JENJUM GADI SECTION -->
    <section class="jenjum-section" aria-label="Jenjum Gadi Artist">
      <a href="/pages/jenjum.html" style="display:block; text-decoration:none;">
        <img src="/assets/images/jenjum_gadi.png" alt="Jenjum Gadi Artist"
          style="width: 100%; height: auto; display: block; border-radius: 2px;">
      </a>
    </section>

    <!-- CURATED SPACES & STORIES (closing section) -->
    <section class="trio-minimal">
      <div class="sec-head">
        <h2 class="sec-title">STORIES OF MODERN HERITAGE</h2>
        <a class="link-cta" href="/pages/journal.html">VIEW ALL STORIES &nbsp;→</a>
      </div>

      <div class="trio-grid">
        <a class="trio-item" href="/pages/artist.html">
          <div class="trio-img-box">
            <img src="/assets/images/makers.jpg" alt="The Artists">
          </div>
          <div class="trio-meta">
            <h3>The Artists</h3>
            <p>Honouring master artists who carve, lathe and weave by living tradition.</p>
            <span class="trio-cta">DISCOVER ARTISTS &nbsp;→</span>
          </div>
        </a>

        <a class="trio-item" href="/pages/journal.html">
          <div class="trio-img-box">
            <img src="/assets/images/cat_art.jpg" alt="Atelier Journal">
          </div>
          <div class="trio-meta">
            <h3>Journal</h3>
            <p>Insights into natural materials, wabi-sabi philosophy and mindful living.</p>
            <span class="trio-cta">READ JOURNAL &nbsp;→</span>
          </div>
        </a>

        <a class="trio-item" href="/pages/gallery.html">
          <div class="trio-img-box">
            <img src="/assets/images/cat_furniture.jpg" alt="Curated Spaces">
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
