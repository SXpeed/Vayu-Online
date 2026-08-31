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
  import { page, updated } from '$app/state';
  import { beforeNavigate } from '$app/navigation';
  import Header from '#lib/components/Header.svelte';
  import Footer from '#lib/components/Footer.svelte';
  import { site, hydrateNav, hydrateCatalogue, hydrateEvents } from '#lib/stores/site.svelte.js';
  import { renderRemoteSiteContent } from '#lib/core/site-content.js';
  import '../styles/styles.css';

  let { children } = $props();

  /**
   * Leave a tab that has outlived its deploy, rather than breaking in it.
   *
   * Every build hashes its filenames, and a deploy uploads the new set and
   * removes the old — so the chunks a page loaded an hour ago stop existing
   * the moment the next deploy lands. A tab still holding that document goes
   * on believing in them: click a link and the client router tries to import
   * a URL that is now a 404, and the navigation dies with "Failed to fetch
   * dynamically imported module" and a console full of missing chunks.
   *
   * SvelteKit already knows when this has happened — it watches the
   * x-sveltekit-version header, rechecks when the tab regains focus, and
   * polls — and it will fall back to a full page load if a navigation
   * actually throws. This closes the gap where it does not throw: a full
   * navigation is forced instead, which fetches a fresh document and with it
   * the manifest that names chunks which exist.
   *
   * willUnload is excluded because the browser is already leaving the page,
   * and reassigning location during it would fight the navigation in flight.
   */
  beforeNavigate(({ willUnload, to }) => {
    if (updated.current && !willUnload && to?.url) location.href = to.url.href;
  });

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
    // Both, deliberately. The Inside Vayu block draws itself from the
    // gallery's current show, which arrives on its own schedule from
    // /api/events — reading only site.content would paint the block before
    // the programme existed and never paint it again.
    if (site.content || site.venues) renderRemoteSiteContent();
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
  const CATALOGUE_ROUTES = /\/pages\/(product|collection-detail|artist-profile|design-for-living|event)\.html$/;

  onMount(async () => {
    const { initShell } = await import('#lib/core/shell.js');
    initShell();

    const { enableSpeculation } = await import('#lib/core/speculation.js');
    enableSpeculation();

    if (!CATALOGUE_ROUTES.test(page.url.pathname)) hydrateNav();

    // The programme, for the MENU panel's two venue cards — which are on
    // every page, so this is fetched on every page. Small and edge-cached;
    // the panel falls back to the shipped shows until it answers.
    hydrateEvents();

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
