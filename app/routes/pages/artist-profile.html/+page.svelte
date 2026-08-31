<script>
  /**
   * Vayu — /pages/artist-profile.html?id=<slug>: one artist.
   *
   * One document serves every artist, the same way event.html serves every
   * show. It replaces /pages/jenjum.html, which was one artist written into
   * markup: his name, his story and his photograph lived in the page, and
   * the four pieces of his capsule were [category, index] pairs in its
   * script. Adding a second artist meant a second file and a deploy, and
   * the capsule pointed at whatever sat in those positions today.
   *
   * The document ships empty and is filled by pages/artist-profile.js, so
   * there is nothing to prerender per artist.
   */
  import { onMount } from 'svelte';

  // Emitted through {@html} rather than a component <style>: Svelte scopes
  // component styles, and these selectors target markup this page's module
  // writes at runtime.
  //
  // Written as a template literal rather than the escaped one-liner the
  // ported pages carry — same output, and a rule can be read without
  // decoding it first.
  const pageCss = `<style>
    /* ---------- hero ----------
       21:9 and edge to edge. The frame is declared rather than taken from
       the picture: an artist page whose height came from whatever file was
       uploaded resized itself around each new portrait. Full bleed is the
       negative margin that cancels .wrap's gutter — 4px to 768, a flat 24px
       to 1023, then the proportional one — because that padding is the only
       horizontal space on the page. */
    .ap-hero {
      position: relative;
      overflow: hidden;
      background: #FAF8F5;
      margin-bottom: 32px;
      aspect-ratio: 21 / 9;
      width: calc(100% + 8px);
      margin-left: -4px;
      margin-right: -4px;
    }

    @media (min-width: 769px) and (max-width: 1023px) {
      .ap-hero {
        width: calc(100% + 48px);
        margin-left: -24px;
        margin-right: -24px;
      }
    }

    @media (min-width: 1024px) {
      .ap-hero {
        width: calc(100% + (var(--page-pad-breakout) * 2));
        margin-left: calc(var(--page-pad-breakout) * -1);
        margin-right: calc(var(--page-pad-breakout) * -1);
      }
    }

    .ap-hero img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    /* ---------- story ---------- */
    .ap-story {
      max-width: 900px;
      margin-bottom: 48px;
    }

    .ap-name {
      font-family: 'Cormorant Garamond', serif;
      font-size: clamp(28px, 3vw, 40px);
      font-weight: 500;
      color: var(--ink);
      margin: 0 0 6px;
      line-height: 1.2;
    }

    .ap-meta {
      font-size: 10.5px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: #8A8681;
      margin: 0 0 18px;
    }

    .ap-story-text p {
      font-size: 16px;
      color: var(--body);
      line-height: 1.8;
      margin: 0 0 16px;
    }
  </style>`;

  onMount(() => {
    import('#lib/pages/artist-profile.js').then(m => m.default?.());
  });
</script>

<svelte:head>
  <title>Artist — Vayu</title>
</svelte:head>

{@html pageCss}

<main class="wrap artist-profile-page">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="/index.html">Home</a>
    <span class="sep">|</span>
    <a href="/pages/artist.html">Artist</a>
    <span class="sep">|</span>
    <span id="apCrumb">Artist</span>
  </nav>

  <section class="ap-hero" id="apHero"></section>

  <section class="ap-story">
    <h1 class="ap-name" id="apName">Artist</h1>
    <p class="ap-meta" id="apMeta"></p>
    <div class="ap-story-text" id="apStory"></div>
  </section>

  <section class="curated-section" id="apCapsule" aria-label="The artist's collection"
    style="margin-bottom: 50px;">
    <div class="sec-head">
      <h2 class="sec-title" id="apCapsuleTitle">Collection</h2>
      <a class="link-cta" href="/pages/collection.html">VIEW ALL &nbsp;→</a>
    </div>
    <div class="prod-grid" id="apGrid"></div>
  </section>
</main>
