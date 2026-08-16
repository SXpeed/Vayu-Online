<script>
  // Vayu — /pages/jenjum.html, ported from public/pages/jenjum.html.
  import { onMount } from 'svelte';

  // Emitted through {@html} rather than written as a component <style>:
  // Svelte scopes component styles, and these selectors target markup
  // that the global stylesheet and other components own.
  const pageCss = "<style>/* ---------- hero ---------- */\n            .jenjum-hero {\n                position: relative;\n                border-radius: 2px;\n                overflow: hidden;\n                margin-bottom: 32px;\n            }\n\n            .jenjum-hero img {\n                width: 100%;\n                height: auto;\n                display: block;\n            }\n\n            /* ---------- story ----------\n               .jenjum-title carries no styling of its own any more \u2014 it is\n               only the hook the capsule-heading script reads the name from.\n               The heading takes its type from .jenjum-h2. */\n            /* single column now that the stats panel beside it is gone */\n            .jenjum-story {\n                max-width: 900px;\n                margin-bottom: 48px;\n            }\n\n            .jenjum-h2 {\n                font-family: 'Cormorant Garamond', serif;\n                font-size: clamp(28px, 3vw, 40px);\n                font-weight: 500;\n                color: var(--ink);\n                margin: 0 0 18px;\n                line-height: 1.2;\n            }\n\n            .jenjum-story-text p {\n                font-size: 16px;\n                color: var(--body);\n                line-height: 1.8;\n                margin: 0 0 16px;\n            }</style>";

  onMount(() => {
    import('#lib/pages/jenjum.js').then(m => m.default?.());
  });
</script>

<svelte:head>
  <title>Jenjum Gadi — Vayu</title>
</svelte:head>

{@html pageCss}

<main class="wrap jenjum-page">
        <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="/index.html">Home</a>
            <span class="sep">|</span>
            <span>Jenjum Gadi</span>
        </nav>

        <!-- HERO / ARTIST BANNER -->
        <section class="jenjum-hero">
            <!-- No overlay: the artwork carries its own typography, and the
                 name is now the heading of the section below. -->
            <img src="/assets/images/jenjum_gadi.png" alt="Jenjum Gadi — Artist & Designer">
        </section>

        <!-- ARTIST STORY -->
        <section class="jenjum-story">
            <div class="jenjum-story-text">
                <!-- The page <h1>, and still .jenjum-title, so the capsule
                     heading script below keeps naming the collection after it. -->
                <h1 class="jenjum-h2 jenjum-title">Jenjum Gadi</h1>
                <p>Jenjum Gadi is a Nagaland-born contemporary artist and designer whose practice bridges indigenous
                    craft traditions with modern material language. Trained at the National Institute of Design, his
                    sculptural vessels, woven objects and mixed-media panels have been exhibited across India, London
                    and Milan.</p>
                <p>For Vayu, Jenjum presents an exclusive capsule — a series of collectible objects that echo the
                    textile geometry of Naga weaves while embracing book-form brass, hand-turned teak and unfired earth
                    finishes. Each piece is numbered and made in his Delhi studio.</p>
            </div>
        </section>

        <!-- THE COLLECTION -->
        <section class="curated-section" aria-label="Jenjum Gadi Collection" style="margin-bottom: 50px;">
            <div class="sec-head">
                <!-- The artist's name is fetched from the page <h1> rather than
                     written again here, so it is stated in exactly one place.
                     The fallback text below is what shows if scripting is
                     unavailable — still meaningful, just without the name.
                     .sec-title uppercases it, so "Jenjum Gadi Collection"
                     renders as "JENJUM GADI COLLECTION". -->
                <h2 class="sec-title" id="capsuleHeading">Collection</h2>
                <a class="link-cta" href="/pages/collection-detail.html?cat=materials&sub=textile">VIEW
                    ALL&nbsp;→</a>
            </div>
            <!-- The same product tiles as the collection grid, filled from the
                 catalogue by the script at the foot of this page so names,
                 prices and links stay in one place. -->
            <div class="prod-grid" id="jenjumGrid"></div>
        </section>

        
    </main>
