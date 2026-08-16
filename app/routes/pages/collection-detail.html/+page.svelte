<script>
  // Vayu — /pages/collection-detail.html, ported from public/pages/collection-detail.html.
  import { onMount } from 'svelte';

  onMount(() => {
    import('#lib/pages/collection-detail.js').then(m => m.default?.());
  });
</script>

<svelte:head>
  <title>Collection Products — Vayu</title>
</svelte:head>

<main class="wrap collection-page">
        <nav class="breadcrumb" aria-label="Breadcrumb">
            <a href="/index.html">Home</a>
            <span class="sep">|</span>
            <a href="/pages/collection.html">Collection</a>
            <span class="sep">|</span>
            <a id="crumbCategory">Category</a>
            <span class="sep" id="crumbSep" style="display:none;">|</span>
            <span id="crumbSub" style="display:none;">Sub</span>
        </nav>
        <div class="collection-banner-219"
            style="width: 100%; aspect-ratio: 32 / 9; max-height: 380px; overflow: hidden; border-radius: 2px; margin-bottom: 4px; position: relative; background: #FAF8F5;">
            <!-- No src here on purpose. It used to be hardcoded to hero.jpg,
                 which script.js then replaced with the real category banner:
                 one wasted full-size request plus a visible flash of the
                 home hero on every category page load. script.js sets both
                 src and alt (see the catHeroImg block). -->
            <img id="catHeroImg" alt="" style="width: 100%; height: 100%; object-fit: cover;">
            <!-- The category name sits on the banner, bottom-left, the same
                 way it does on the collection directory. script.js still
                 fills #catTitle by id, so nothing there changes. -->
            <div class="cat-banner-overlay">
                <h1 id="catTitle">Collection</h1>
            </div>
        </div>

        <!-- Sub-category pills come first, then the controls: the pills choose
             which set is on the page, and Filter/Sort act on that set, so they
             now sit in that order. Pill styling is in section 16 of
             styles.css — it was an inline <style> block whose border-based
             hover could never render, because the flat-design layer forces
             border-color: transparent !important. -->
        <!-- Both bars ride in one sticky rail so they stay put together
             once the banner scrolls past — see .collection-sticky. -->
        <div class="collection-sticky">
        <div id="subNav" class="sub-nav"></div>

        <!-- page-header: the two grid controls. The title moved onto the
             banner above, so this bar carries the controls alone — Filter
             narrows the set, Sort orders what is left. -->
        <div class="page-header">
            <div class="ctrl-row">
                <div class="ctrl-group">
                    <label for="collection-filter">Filter By</label>
                    <select id="collection-filter">
                        <option value="all">All Pieces</option>
                        <option value="new">New Arrivals</option>
                        <option value="under-5000">Under ₹ 5,000</option>
                        <option value="5000-15000">₹ 5,000 — ₹ 15,000</option>
                        <option value="above-15000">Above ₹ 15,000</option>
                    </select>
                </div>
                <div class="ctrl-group">
                    <label for="collection-sort">Sort By</label>
                    <select id="collection-sort">
                        <option value="featured">Featured</option>
                        <option value="new-arrivals">New Arrivals</option>
                        <option value="price-asc">Price: Low to High</option>
                        <option value="price-desc">Price: High to Low</option>
                    </select>
                </div>
            </div>
        </div>
        </div>

        <!-- PRODUCT GRID
             script.js swaps this container's class to .prod-grid when it
             renders; it starts as .prod-grid so an unstyled flex rail can
             never be left behind if rendering does not run. -->
        <section id="collectionGrid" style="margin-bottom: 60px;">
            <div class="prod-grid" id="subGrid"></div>
        </section>
    </main>
