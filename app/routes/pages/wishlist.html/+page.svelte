<script>
  // Vayu — /pages/wishlist.html, ported from public/pages/wishlist.html.
  import { onMount } from 'svelte';

  // Emitted through {@html} rather than written as a component <style>:
  // Svelte scopes component styles, and these selectors target markup
  // that the global stylesheet and other components own.
  const pageCss = "<style>/* padding-bottom only: the `0 0 80px` shorthand also set the left\n           and right padding to 0, and because this element is .wrap too,\n           that removed the page gutter entirely */\n        .wish-page {\n            padding-bottom: 80px;\n        }\n\n        .wish-page-title {\n            font-family: 'Cormorant Garamond', serif;\n            font-size: clamp(28px, 3vw, 40px);\n            font-weight: 500;\n            color: var(--ink);\n            margin: 0 0 32px;\n        }\n\n        .wish-grid {\n            display: grid;\n            grid-template-columns: repeat(4, 1fr);\n            gap: 20px;\n        }\n\n        .wish-card {\n            text-decoration: none;\n            color: inherit;\n            display: block;\n            cursor: pointer;\n        }\n\n        .wish-card-img {\n            width: 100%;\n            aspect-ratio: 1 / 1;\n            overflow: hidden;\n            border-radius: 2px;\n            background: #FFFFFF;\n            position: relative;\n        }\n\n        .wish-card-img img {\n            width: 100%;\n            height: 100%;\n            object-fit: cover;\n            transition: transform 0.4s ease;\n        }\n\n        .wish-card:hover .wish-card-img img {\n            transform: scale(1.04);\n        }\n\n        .wish-card-name {\n            font-family: 'Cormorant Garamond', serif;\n            font-size: 16px;\n            font-weight: 500;\n            color: var(--ink);\n            margin: 10px 0 4px;\n        }\n\n        .wish-card-price {\n            font-family: 'Jost', sans-serif;\n            font-size: 13px;\n            color: var(--body);\n            font-weight: 500;\n            margin-bottom: 10px;\n        }\n\n        .wish-card-actions {\n            display: flex;\n            gap: 8px;\n        }\n\n        .wish-add-cart {\n            flex: 1;\n            padding: 8px 12px;\n            background: var(--ink);\n            color: #fff;\n            border: none;\n            border-radius: 2px;\n            font-family: 'Jost', sans-serif;\n            font-size: 10px;\n            letter-spacing: 0.1em;\n            text-transform: uppercase;\n            font-weight: 500;\n            cursor: pointer;\n            transition: background 0.25s ease;\n        }\n\n        .wish-add-cart:hover {\n            background: var(--accent);\n        }\n\n        .wish-remove-btn {\n            padding: 8px 14px;\n            background: #FAF8F5;\n            color: var(--ink);\n            border: 1px solid #D4CFC4;\n            border-radius: 2px;\n            font-family: 'Jost', sans-serif;\n            font-size: 10px;\n            cursor: pointer;\n            transition: all 0.25s ease;\n        }\n\n        @media (max-width: 900px) {\n            .wish-grid {\n                grid-template-columns: repeat(2, 1fr);\n                gap: 16px;\n            }\n        }</style>";

  onMount(() => {
    import('#lib/pages/wishlist.js').then(m => m.default?.());
  });
</script>

<svelte:head>
  <title>Your Wishlist — Vayu</title>
</svelte:head>

{@html pageCss}

<main class="wrap wish-page">
        <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="/index.html">Home</a>
            <span class="sep">|</span>
            <span>Your Wishlist</span>
        </nav>

        <h1 class="wish-page-title">Your Wishlist</h1>

        <div id="wishContent"></div>
    </main>
