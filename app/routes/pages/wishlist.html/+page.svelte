<script>
  import Seo from '#lib/components/Seo.svelte';
  // Vayu — /pages/wishlist.html, ported from public/pages/wishlist.html.
  import { onMount } from 'svelte';

  // Emitted through {@html} rather than written as a component <style>:
  // Svelte scopes component styles, and these selectors target markup
  // that the global stylesheet and other components own.
  const pageCss = `<style>/* padding-bottom only: the \`0 0 80px\` shorthand also set the left\n           and right padding to 0, and because this element is .wrap too,\n           that removed the page gutter entirely */\n        .wish-page {\n            padding-bottom: 80px;\n        }\n\n        .wish-page-title {\n            font-family: 'Cormorant Garamond', serif;\n            font-size: clamp(28px, 3vw, 40px);\n            font-weight: 500;\n            color: var(--ink);\n            margin: 0 0 32px;\n        }\n\n        /* The saved pieces are drawn with the shared product tile now\n           (.prod-grid / .product, see lib/product-card.js), so this page no\n           longer styles a card of its own. What stood here — .wish-grid,\n           .wish-card and its two text buttons — went with the markup that\n           used it: a second tile design for the same object, which only ever\n           got half the improvements the real one did. */</style>`;

  onMount(() => {
    import('#lib/pages/wishlist.js').then(m => m.default?.());
  });
</script>

<Seo
  title="Your Wishlist"
  description="The pieces you have saved at Vayu."
  path="/pages/wishlist.html"
  noindex
/>

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
