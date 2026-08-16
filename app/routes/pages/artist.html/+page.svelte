<script>
  // Vayu — /pages/artist.html, ported from public/pages/artist.html.

  // Emitted through {@html} rather than written as a component <style>:
  // Svelte scopes component styles, and these selectors target markup
  // that the global stylesheet and other components own.
  const pageCss = "<style>/* ------------------------------------------------------------\n           Artist \u2014 follows the site language: flat surfaces, 2px radius,\n           Cormorant display + Jost labels, gold hairlines. Separators are\n           pseudo-element backgrounds because the global layer in styles.css\n           forces border-color: transparent !important.\n           ------------------------------------------------------------ */\n        /* This element is BOTH .wrap and .artist-page, so any horizontal\n           padding declared here replaces the page gutter instead of adding\n           to it \u2014 including `padding: 0`, which would remove the gutter\n           entirely. It therefore declares none: --page-pad in styles.css is\n           the single source of the gutter, so every page shares one content\n           width and the left edge no longer shifts on navigation.\n\n           The 72px bottom was mobile bottom-nav clearance that applied on\n           desktop too, leaving a large void above the footer; it is now\n           scoped to the widths where that bar exists. */\n        @media (max-width: 768px) {\n            .artist-page {\n                padding-bottom: 72px;\n            }\n        }\n\n        /* ---------- editorial header ---------- */\n        .a-head {\n            display: flex;\n            justify-content: space-between;\n            align-items: flex-end;\n            gap: 20px;\n            position: relative;\n            padding-bottom: 14px;\n            margin-bottom: 18px;\n        }\n\n        .a-head::after {\n            content: '';\n            position: absolute;\n            inset: auto 0 0 0;\n            height: 1px;\n            background: #EFEAE1;\n        }\n\n        .a-title {\n            font-family: 'Cormorant Garamond', serif;\n            font-size: clamp(26px, 3vw, 40px);\n            font-weight: 400;\n            line-height: 1.05;\n            color: var(--ink);\n            margin: 0;\n        }\n\n        .a-meta {\n            font-size: 10.5px;\n            letter-spacing: 0.16em;\n            text-transform: uppercase;\n            color: #8A8681;\n            white-space: nowrap;\n            padding-bottom: 3px;\n        }\n\n        /* ---------- hero ---------- */\n        .a-hero {\n            position: relative;\n            overflow: hidden;\n            background: #FAF8F5;\n            aspect-ratio: 21 / 9;\n            margin-bottom: 14px;\n        }\n\n        .a-hero img {\n            width: 100%;\n            height: 100%;\n            object-fit: cover;\n            object-position: center 62%;\n        }\n\n        .a-hero-label {\n            position: absolute;\n            inset: auto 0 0 0;\n            padding: 40px 18px 16px;\n            background: linear-gradient(to top, rgba(20, 18, 16, 0.72), rgba(20, 18, 16, 0));\n            color: #FFFFFF;\n            font-size: 10.5px;\n            letter-spacing: 0.2em;\n            text-transform: uppercase;\n            font-weight: 500;\n        }\n\n        /* ---------- statement ---------- */\n        .a-statement {\n            max-width: 640px;\n            margin: 26px auto 32px;\n            text-align: center;\n            font-family: 'Cormorant Garamond', serif;\n            font-size: clamp(16px, 1.6vw, 20px);\n            font-weight: 300;\n            font-style: italic;\n            line-height: 1.55;\n            color: var(--body);\n        }\n\n        /* ---------- section heads ---------- */\n        .a-sec-head {\n            display: flex;\n            justify-content: space-between;\n            align-items: baseline;\n            gap: 14px;\n            margin-bottom: 12px;\n        }\n\n        .a-sec-title {\n            font-family: 'Jost', sans-serif;\n            font-size: 11px;\n            letter-spacing: 0.22em;\n            text-transform: uppercase;\n            font-weight: 500;\n            color: var(--ink);\n        }\n\n        .a-sec-note {\n            font-size: 10px;\n            letter-spacing: 0.14em;\n            text-transform: uppercase;\n            color: #8A8681;\n        }\n\n        /* ---------- artist grid ---------- */\n        .a-grid {\n            display: grid;\n            grid-template-columns: repeat(3, minmax(0, 1fr));\n            gap: 16px 18px;\n            margin-bottom: 40px;\n        }\n\n        /* flat card: no frame, no shadow \u2014 the photograph is the object */\n        .a-card {\n            display: flex;\n            flex-direction: column;\n        }\n\n        .a-card-media {\n            display: block;\n            overflow: hidden;\n            background: #FAF8F5;\n            aspect-ratio: 4 / 5;\n        }\n\n        .a-card-media img {\n            width: 100%;\n            height: 100%;\n            object-fit: cover;\n            transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1);\n        }\n\n        /* ---- hover only where there is somewhere to go -------------------\n           This zoom used to apply to every .a-card, but only one of the six\n           artists has a page to link to. Five cards therefore animated\n           under the cursor and did nothing when clicked \u2014 a false\n           affordance that exists only on desktop, where hover exists.\n\n           `.a-card.is-linked` is set on cards that carry a real link (see\n           the .a-card-link markup), so the affordance and the destination\n           can never drift apart again: adding an artist page means adding\n           the class, and forgetting to means no misleading hover.\n           ------------------------------------------------------------------ */\n        .a-card.is-linked .a-card-media {\n            cursor: pointer;\n        }\n\n        .a-card.is-linked:hover .a-card-media img {\n            transform: scale(1.04);\n        }\n\n        .a-card.is-linked:hover .a-card-name {\n            color: var(--accent);\n        }\n\n        /* whole-card link: stretched over the card so the entire tile is the\n           target, instead of only the small \"View Capsule\" text */\n        .a-card.is-linked {\n            position: relative;\n        }\n\n        .a-card.is-linked .a-card-link::after {\n            content: '';\n            position: absolute;\n            inset: 0;\n        }\n\n        .a-card-body {\n            padding-top: 10px;\n        }\n\n        .a-card-tag {\n            font-size: 9px;\n            letter-spacing: 0.18em;\n            text-transform: uppercase;\n            color: var(--gold);\n            font-weight: 500;\n            line-height: 1;\n            margin-bottom: 5px;\n        }\n\n        .a-card-name {\n            font-family: 'Cormorant Garamond', serif;\n            font-size: 19px;\n            font-weight: 500;\n            color: var(--ink);\n            line-height: 1.15;\n            margin: 0 0 2px;\n            transition: color 0.2s ease;\n        }\n\n        .a-card-place {\n            font-size: 11px;\n            letter-spacing: 0.04em;\n            color: #8A8681;\n            margin-bottom: 7px;\n        }\n\n        .a-card-bio {\n            font-size: 12.5px;\n            line-height: 1.65;\n            color: var(--body);\n            margin: 0;\n        }\n\n        .a-card-link {\n            display: inline-block;\n            margin-top: 8px;\n            font-size: 10px;\n            letter-spacing: 0.16em;\n            text-transform: uppercase;\n            font-weight: 500;\n            color: var(--accent);\n            transition: opacity 0.2s ease;\n        }\n\n        .a-card-link:hover {\n            opacity: 0.65;\n        }\n\n        /* ---------- promise ---------- */\n        .a-promise {\n            position: relative;\n            display: grid;\n            grid-template-columns: repeat(3, minmax(0, 1fr));\n            gap: 20px;\n            padding-top: 22px;\n        }\n\n        .a-promise::before {\n            content: '';\n            position: absolute;\n            inset: 0 0 auto 0;\n            height: 1px;\n            background: #EFEAE1;\n        }\n\n        .a-promise-num {\n            font-family: 'Cormorant Garamond', serif;\n            font-size: 20px;\n            font-weight: 600;\n            color: var(--gold);\n            line-height: 1;\n            margin-bottom: 8px;\n        }\n\n        .a-promise-title {\n            font-family: 'Cormorant Garamond', serif;\n            font-size: 17px;\n            font-weight: 500;\n            color: var(--ink);\n            margin: 0 0 5px;\n        }\n\n        .a-promise-text {\n            font-size: 12.5px;\n            line-height: 1.65;\n            color: var(--body);\n            margin: 0;\n        }\n\n        /* ---------- responsive ---------- */\n        /* .artist-page and .wrap share the same <main>, so the desktop gutter\n           has to be restated rather than zeroed */\n        /* Two breakpoints only \u2014 1024 and 768 \u2014 matching styles.css. This\n           page previously switched at 900, 700 and 420 as well, so its\n           grid changed column count at widths where the site chrome did\n           not change at all. */\n        @media (min-width: 1024px) {\n            .a-grid {\n                gap: 20px 22px;\n            }\n        }\n\n        @media (max-width: 1023px) {\n            .a-grid {\n                grid-template-columns: repeat(2, minmax(0, 1fr));\n            }\n        }\n\n        @media (max-width: 768px) {\n            .a-head {\n                flex-direction: column;\n                align-items: flex-start;\n                gap: 6px;\n            }\n\n            .a-hero {\n                aspect-ratio: 16 / 10;\n            }\n\n            .a-grid {\n                gap: 14px 12px;\n            }\n\n            .a-promise {\n                grid-template-columns: 1fr;\n                gap: 16px;\n            }\n        }</style>";
</script>

<svelte:head>
  <title>Artist — Vayu</title>
</svelte:head>

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
            <div class="a-meta">Six studios · Across India</div>
        </div>

        <div class="a-hero">
            <img src="/assets/images/journal_hero.png" alt="A weaver working at a handloom">
            <span class="a-hero-label">At the loom · Chirala, Andhra Pradesh</span>
        </div>

        <p class="a-statement">
            Every object here begins with a pair of hands — from the back-strap looms of
            Nagaland to the brass foundries of Moradabad. These are not anonymous hands.
        </p>

        <section id="meet" aria-labelledby="meet-title">
            <div class="a-sec-head">
                <h2 class="a-sec-title" id="meet-title">Meet the Artists</h2>
                <span class="a-sec-note">Six studios</span>
            </div>
            <div class="a-grid">
                <!-- is-linked: this is the one artist with a page, so it is
                     the one card that gets the hover affordance and a
                     whole-tile click target. Add the class alongside an
                     .a-card-link when another artist page ships. -->
                <article class="a-card is-linked" id="jenjum-gadi">
                    <span class="a-card-media">
                        <img src="/assets/images/jenjum_gadi.png" alt="Jenjum Gadi" loading="lazy">
                    </span>
                    <div class="a-card-body">
                        <div class="a-card-tag">Artist in Residence</div>
                        <h3 class="a-card-name">Jenjum Gadi</h3>
                        <div class="a-card-place">New Delhi</div>
                        <p class="a-card-bio">Nagaland-born artist and designer trained at the National Institute of
                            Design. His sculptural vessels bridge indigenous craft with a modern material language.</p>
                        <a class="a-card-link" href="/pages/jenjum.html">View Capsule →</a>
                    </div>
                </article>

                <article class="a-card" id="lakshmi-devi">
                    <span class="a-card-media">
                        <img src="/assets/images/prod_silk_stole.png" alt="Lakshmi Devi" loading="lazy">
                    </span>
                    <div class="a-card-body">
                        <div class="a-card-tag">Master Weaver</div>
                        <h3 class="a-card-name">Lakshmi Devi</h3>
                        <div class="a-card-place">Chirala, Andhra Pradesh</div>
                        <p class="a-card-bio">A third-generation handloom weaver working in fine cotton and silk. Her
                            textiles carry the rhythm of coastal Andhra's weaving communities.</p>
                    </div>
                </article>

                <article class="a-card" id="imtiaz-ahmad">
                    <span class="a-card-media">
                        <img src="/assets/images/prod_brass_cuff.png" alt="Imtiaz Ahmad" loading="lazy">
                    </span>
                    <div class="a-card-body">
                        <div class="a-card-tag">Brass Founder</div>
                        <h3 class="a-card-name">Imtiaz Ahmad</h3>
                        <div class="a-card-place">Moradabad, Uttar Pradesh</div>
                        <p class="a-card-bio">Leads a small foundry practising lost-wax casting for over four decades.
                            His vessels celebrate the quiet warmth of hand-finished brass.</p>
                    </div>
                </article>

                <article class="a-card">
                    <span class="a-card-media">
                        <img src="/assets/images/prod_teak_chair.png" alt="Ramesh Suthar" loading="lazy">
                    </span>
                    <div class="a-card-body">
                        <div class="a-card-tag">Furniture Maker</div>
                        <h3 class="a-card-name">Ramesh Suthar</h3>
                        <div class="a-card-place">Jodhpur, Rajasthan</div>
                        <p class="a-card-bio">A master woodworker in reclaimed teak and acacia. He carves each joint by
                            hand, letting the grain of the wood guide the form.</p>
                    </div>
                </article>

                <article class="a-card" id="savita-kumar">
                    <span class="a-card-media">
                        <img src="/assets/images/prod_ceramic_plate_set.png" alt="Savita Kumar" loading="lazy">
                    </span>
                    <div class="a-card-body">
                        <div class="a-card-tag">Ceramicist</div>
                        <h3 class="a-card-name">Savita Kumar</h3>
                        <div class="a-card-place">Pondicherry</div>
                        <p class="a-card-bio">Trained at Golden Bridge Pottery, Savita works in stoneware and porcelain,
                            exploring the tension between thrown form and spontaneous glaze.</p>
                    </div>
                </article>

                <article class="a-card">
                    <span class="a-card-media">
                        <img src="/assets/images/prod_stone_coffee_table.png" alt="Mohan Lal" loading="lazy">
                    </span>
                    <div class="a-card-body">
                        <div class="a-card-tag">Stone Carver</div>
                        <h3 class="a-card-name">Mohan Lal</h3>
                        <div class="a-card-place">Makrana, Rajasthan</div>
                        <p class="a-card-bio">From the marble town of Makrana, Mohan works the same stone that built the
                            Taj Mahal. His objects celebrate marble in its quietest form.</p>
                    </div>
                </article>
            </div>
        </section>

        <section aria-labelledby="promise-title">
            <div class="a-sec-head">
                <h2 class="a-sec-title" id="promise-title">Our Promise</h2>
            </div>
            <div class="a-promise">
                <div>
                    <div class="a-promise-num">01</div>
                    <h3 class="a-promise-title">Fair Craft</h3>
                    <p class="a-promise-text">We pay above the industry standard and build long-term, direct
                        relationships with every studio we work with.</p>
                </div>
                <div>
                    <div class="a-promise-num">02</div>
                    <h3 class="a-promise-title">Living Heritage</h3>
                    <p class="a-promise-text">Each piece supports a craft tradition practised for generations — keeping
                        that knowledge alive in the modern world.</p>
                </div>
                <div>
                    <div class="a-promise-num">03</div>
                    <h3 class="a-promise-title">Natural Materials</h3>
                    <p class="a-promise-text">We champion teak, brass, marble, clay and hand-spun textile — materials
                        that age gracefully and return to the earth.</p>
                </div>
            </div>
        </section>
    </main>
