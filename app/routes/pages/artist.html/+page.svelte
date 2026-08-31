<script>
  import Seo from '#lib/components/Seo.svelte';
  import { onMount } from 'svelte';
  import { deliverySrc } from '#shared/content/picture.js';

  // The cards and the copy above them are repainted from the panel's list
  // once it lands. What ships below is the fallback, and what a crawler and
  // a reader with no JavaScript get.
  onMount(() => {
    import('#lib/pages/artist.js').then(m => m.default?.());
  });
  // Vayu — /pages/artist.html, ported from public/pages/artist.html.

  // Emitted through {@html} rather than written as a component <style>:
  // Svelte scopes component styles, and these selectors target markup
  // that the global stylesheet and other components own.
  const pageCss = "<style>/* ------------------------------------------------------------\n           Artist \u2014 follows the site language: flat surfaces, 2px radius,\n           Cormorant display + Jost labels, gold hairlines. Separators are\n           pseudo-element backgrounds because the global layer in styles.css\n           forces border-color: transparent !important.\n           ------------------------------------------------------------ */\n        /* This element is BOTH .wrap and .artist-page, so any horizontal\n           padding declared here replaces the page gutter instead of adding\n           to it \u2014 including `padding: 0`, which would remove the gutter\n           entirely. It therefore declares none: --page-pad in styles.css is\n           the single source of the gutter, so every page shares one content\n           width and the left edge no longer shifts on navigation.\n\n           The 72px bottom was mobile bottom-nav clearance that applied on\n           desktop too, leaving a large void above the footer; it is now\n           scoped to the widths where that bar exists. */\n        @media (max-width: 768px) {\n            .artist-page {\n                padding-bottom: 72px;\n            }\n        }\n\n        /* ---------- editorial header ---------- */\n        .a-head {\n            display: flex;\n            justify-content: space-between;\n            align-items: flex-end;\n            gap: 20px;\n            position: relative;\n            padding-bottom: 14px;\n            margin-bottom: 18px;\n        }\n\n        .a-head::after {\n            content: '';\n            position: absolute;\n            inset: auto 0 0 0;\n            height: 1px;\n            background: #EFEAE1;\n        }\n\n        .a-title {\n            font-family: 'Cormorant Garamond', serif;\n            font-size: clamp(26px, 3vw, 40px);\n            font-weight: 400;\n            line-height: 1.05;\n            color: var(--ink);\n            margin: 0;\n        }\n\n        .a-meta {\n            font-size: 10.5px;\n            letter-spacing: 0.16em;\n            text-transform: uppercase;\n            color: #8A8681;\n            white-space: nowrap;\n            padding-bottom: 3px;\n        }\n\n        /* ---------- hero ---------- */\n        .a-hero {\n            position: relative;\n            overflow: hidden;\n            background: #FAF8F5;\n            aspect-ratio: 21 / 9;\n            margin-bottom: 14px;\n        }\n\n        .a-hero img {\n            width: 100%;\n            height: 100%;\n            object-fit: cover;\n            object-position: center 62%;\n        }\n\n        .a-hero-label {\n            position: absolute;\n            inset: auto 0 0 0;\n            padding: 40px 18px 16px;\n            background: linear-gradient(to top, rgba(20, 18, 16, 0.72), rgba(20, 18, 16, 0));\n            color: #FFFFFF;\n            font-size: 10.5px;\n            letter-spacing: 0.2em;\n            text-transform: uppercase;\n            font-weight: 500;\n        }\n\n        /* ---------- statement ---------- */\n        .a-statement {\n            max-width: 640px;\n            margin: 26px auto 32px;\n            text-align: center;\n            font-family: 'Cormorant Garamond', serif;\n            font-size: clamp(16px, 1.6vw, 20px);\n            font-weight: 300;\n            font-style: italic;\n            line-height: 1.55;\n            color: var(--body);\n        }\n\n        /* ---------- section heads ---------- */\n        .a-sec-head {\n            display: flex;\n            justify-content: space-between;\n            align-items: baseline;\n            gap: 14px;\n            margin-bottom: 12px;\n        }\n\n        .a-sec-title {\n            font-family: 'Jost', sans-serif;\n            font-size: 11px;\n            letter-spacing: 0.22em;\n            text-transform: uppercase;\n            font-weight: 500;\n            color: var(--ink);\n        }\n\n        .a-sec-note {\n            font-size: 10px;\n            letter-spacing: 0.14em;\n            text-transform: uppercase;\n            color: #8A8681;\n        }\n\n        /* ---------- artist grid ---------- */\n        .a-grid {\n            display: grid;\n            grid-template-columns: repeat(3, minmax(0, 1fr));\n            gap: 16px 18px;\n            margin-bottom: 40px;\n        }\n\n        /* flat card: no frame, no shadow \u2014 the photograph is the object */\n        .a-card {\n            display: flex;\n            flex-direction: column;\n        }\n\n        .a-card-media {\n            display: block;\n            overflow: hidden;\n            background: #FAF8F5;\n            aspect-ratio: 4 / 5;\n        }\n\n        .a-card-media img {\n            width: 100%;\n            height: 100%;\n            object-fit: cover;\n            transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1);\n        }\n\n        /* ---- hover only where there is somewhere to go -------------------\n           This zoom used to apply to every .a-card, but only one of the six\n           artists has a page to link to. Five cards therefore animated\n           under the cursor and did nothing when clicked \u2014 a false\n           affordance that exists only on desktop, where hover exists.\n\n           `.a-card.is-linked` is set on cards that carry a real link (see\n           the .a-card-link markup), so the affordance and the destination\n           can never drift apart again: adding an artist page means adding\n           the class, and forgetting to means no misleading hover.\n           ------------------------------------------------------------------ */\n        .a-card.is-linked .a-card-media {\n            cursor: pointer;\n        }\n\n        .a-card.is-linked:hover .a-card-media img {\n            transform: scale(1.04);\n        }\n\n        .a-card.is-linked:hover .a-card-name {\n            color: var(--accent);\n        }\n\n        /* whole-card link: stretched over the card so the entire tile is the\n           target, instead of only the small \"View Capsule\" text */\n        .a-card.is-linked {\n            position: relative;\n        }\n\n        .a-card.is-linked .a-card-link::after {\n            content: '';\n            position: absolute;\n            inset: 0;\n        }\n\n        .a-card-body {\n            padding-top: 16px;\n        }\n\n        .a-card-tag {\n            font-size: 11px;\n            letter-spacing: 0.18em;\n            text-transform: uppercase;\n            color: var(--gold);\n            font-weight: 500;\n            line-height: 1;\n            margin-bottom: 8px;\n        }\n\n        .a-card-name {\n            font-family: 'Cormorant Garamond', serif;\n            font-size: 26px;\n            font-weight: 500;\n            color: var(--ink);\n            line-height: 1.15;\n            margin: 0 0 2px;\n            transition: color 0.2s ease;\n        }\n\n        .a-card-place {\n            font-size: 13.5px;\n            letter-spacing: 0.04em;\n            color: #8A8681;\n            margin-bottom: 11px;\n        }\n\n        .a-card-bio {\n            font-size: 15.5px;\n            line-height: 1.7;\n            color: var(--body);\n            margin: 0;\n        }\n\n        .a-card-link {\n            display: inline-block;\n            margin-top: 14px;\n            font-size: 12px;\n            letter-spacing: 0.16em;\n            text-transform: uppercase;\n            font-weight: 500;\n            color: var(--accent);\n            transition: opacity 0.2s ease;\n        }\n\n        .a-card-link:hover {\n            opacity: 0.65;\n        }\n\n        /* ---------- responsive ---------- */\n        /* .artist-page and .wrap share the same <main>, so the desktop gutter\n           has to be restated rather than zeroed */\n        /* Two breakpoints only \u2014 1024 and 768 \u2014 matching styles.css. This\n           page previously switched at 900, 700 and 420 as well, so its\n           grid changed column count at widths where the site chrome did\n           not change at all. */\n        @media (min-width: 1024px) {\n            .a-grid {\n                gap: 20px 22px;\n            }\n        }\n\n        @media (max-width: 1023px) {\n            .a-grid {\n                grid-template-columns: repeat(2, minmax(0, 1fr));\n            }\n        }\n\n        @media (max-width: 768px) {\n            .a-head {\n                flex-direction: column;\n                align-items: flex-start;\n                gap: 6px;\n            }\n\n            .a-hero {\n                aspect-ratio: 21 / 9;\n            }\n\n            /* One column, not two. Two was right for a grid of six; with a\n               single artist it left a half-width card and a measure too\n               narrow for the card's body text to read at. */\n            .a-grid {\n                grid-template-columns: 1fr;\n                gap: 14px 12px;\n            }\n        }\n        /* ---------- hero, edge to edge ----------\n           .wrap's padding is the only horizontal space on this page, so a\n           negative margin cancelling it IS full bleed. Each width grows by\n           the two gutters its margins pull back, or the box keeps its old\n           width and merely slides left. The three numbers are .wrap's own:\n           4px to 768, a flat 24px to 1023, then a proportional gutter. */\n        .a-hero {\n            width: calc(100% + 8px);\n            margin-left: -4px;\n            margin-right: -4px;\n        }\n\n        @media (min-width: 769px) and (max-width: 1023px) {\n            .a-hero {\n                width: calc(100% + 48px);\n                margin-left: -24px;\n                margin-right: -24px;\n            }\n        }\n\n        @media (min-width: 1024px) {\n            .a-hero {\n                width: calc(100% + (var(--page-pad-breakout) * 2));\n                margin-left: calc(var(--page-pad-breakout) * -1);\n                margin-right: calc(var(--page-pad-breakout) * -1);\n            }\n        }</style>";
</script>

<Seo
  title="Hands That Make"
  description="The artists and master craftspeople behind Vayu. Meet Jenjum Gadi, our artist in residence, working in brass from his New Delhi studio."
  path="/pages/artist.html"
/>

{@html pageCss}

<main class="wrap artist-page">
        <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="/index.html">Home</a>
            <span class="sep">|</span>
            <span>Artist</span>
        </nav>

        <!-- a <header> here would match the global `header &#123; position: fixed &#125;`
             desktop rule in styles.css and pin the title over the site nav -->
        <div class="a-head">
            <div>
                <h1 class="a-title">Hands That Make</h1>
            </div>
            <div class="a-meta">One studio · New Delhi</div>
        </div>

        <div class="a-hero">
            <img src={deliverySrc('/assets/images/journal_hero.png')} alt="A weaver working at a handloom">
            <span class="a-hero-label">At the loom · Chirala, Andhra Pradesh</span>
        </div>

        <p class="a-statement">
            Every object here begins with a pair of hands — from the back-strap looms of
            Nagaland to the brass foundries of Moradabad. These are not anonymous hands.
        </p>

        <section id="meet" aria-labelledby="meet-title">
            <div class="a-sec-head">
                <h2 class="a-sec-title" id="meet-title">Meet the Artists</h2>
                <span class="a-sec-note">One studio</span>
            </div>
            <div class="a-grid">
                <!-- is-linked: the card carries a real link, so it gets the
                     hover affordance and a whole-tile click target. Add the
                     class alongside an .a-card-link when another artist
                     ships; without it there is no misleading hover. -->
                <article class="a-card is-linked" id="jenjum-gadi">
                    <span class="a-card-media">
                        <img src={deliverySrc('/assets/images/jenjum_gadi.png')} alt="Jenjum Gadi" loading="lazy">
                    </span>
                    <div class="a-card-body">
                        <div class="a-card-tag">Artist in Residence</div>
                        <h3 class="a-card-name">Jenjum Gadi</h3>
                        <div class="a-card-place">New Delhi</div>
                        <p class="a-card-bio">Born in Tirbin, Arunachal Pradesh. Working primarily in brass, he makes
                            sculptural pieces rooted in memory, craft and cultural inheritance.</p>
                        <a class="a-card-link" href="/pages/artist-profile.html?id=jenjum-gadi">Know More →</a>
                    </div>
                </article>
            </div>
        </section>

    </main>
