<script>
  /**
   * Vayu — the shared shell.
   *
   * The header and footer are components now, so they are part of the
   * prerendered document. Before the migration they were fetched from
   * /partials at runtime by js/boot/partials.js, which put two requests and
   * a module graph in front of the first paint.
   */
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import Header from '#lib/components/Header.svelte';
  import Footer from '#lib/components/Footer.svelte';
  import { site, hydrateNav, hydrateCatalogue } from '#lib/stores/site.svelte.js';
  import { renderRemoteSiteContent } from '#lib/core/site-content.js';
  import '../../public/css/styles.css';

  let { children } = $props();

  /**
   * Draw the announcement bar and the admin's own hero slides once that copy
   * arrives — whichever hydrator fetched it. Both hydrateNav and
   * hydrateCatalogue set site.content, and which one runs (and when it
   * finishes) depends on the route, so this watches the value rather than
   * chaining onto one of the promises. It must sit here in the component
   * body: $effect has to be created during initialisation, not inside the
   * async onMount below.
   *
   * Nothing called this module before — the migration left it orphaned — so
   * an announcement typed into the panel never appeared, and the home hero
   * never got past the two slides hard-coded in the markup.
   */
  $effect(() => {
    if (site.content) renderRemoteSiteContent();
  });

  /**
   * The search index is the whole catalogue, so it is not downloaded until
   * the visitor shows an interest in searching. Until then the button carries
   * a placeholder that loads the real handler and replays the click, so the
   * first press opens the field exactly as it always did.
   */
  function armSearch() {
    const btn = document.getElementById('navSearchBtn');
    const input = document.getElementById('navSearchInput');
    if (!btn) return;

    let started = null;
    const start = () => {
      started ??= Promise.all([
        import('#lib/search.js'),
        hydrateCatalogue(),
      ]).then(([{ initNavSearch }]) => {
        btn.removeEventListener('click', onFirstClick);
        input?.removeEventListener('focus', start);
        initNavSearch();
      });
      return started;
    };

    const onFirstClick = () => { start().then(() => btn.click()); };

    btn.addEventListener('click', onFirstClick);
    input?.addEventListener('focus', start);
  }

  /** Pages that render products fetch the catalogue themselves. */
  const CATALOGUE_ROUTES = /\/pages\/(product|collection-detail|jenjum|design-for-living|journal|journal-post)\.html$/;

  onMount(async () => {
    const { initShell } = await import('#lib/core/shell.js');
    initShell();

    const { enableSpeculation } = await import('#lib/core/speculation.js');
    enableSpeculation();

    if (!CATALOGUE_ROUTES.test(page.url.pathname)) hydrateNav();

    armSearch();

    // Smooth scroll and the analytics beacon are deliberately behind `load`:
    // neither may sit in front of the first paint.
    const after = async () => {
      const [{ startLenis }, { trackPageView }] = await Promise.all([
        import('#lib/core/lenis.js'),
        import('#lib/core/analytics.js'),
      ]);
      startLenis();
      trackPageView();
    };
    if (document.readyState === 'complete') after();
    else window.addEventListener('load', after, { once: true });
  });
</script>

<svelte:head>
  <link rel="preload" href="/assets/fonts/jost-400.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="preload" href="/assets/fonts/cormorant-garamond-400.woff2" as="font" type="font/woff2" crossorigin />
  <meta name="theme-color" content="#ffffff" />
</svelte:head>

<Header />
{@render children()}
<Footer />
