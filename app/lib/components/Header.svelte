<script>
  /**
   * Vayu — the site header.
   *
   * Ported from src/partials/header.html. The three category lists in here
   * used to be written into empty <div>s by js/nav-render.js *after* the
   * partial had been fetched over HTTP; they are {#each} blocks now, so they
   * are part of the prerendered document and there is nothing to fill in.
   */
  import { goto } from '$app/navigation';
  import { venues, eventsOf } from '#lib/data/events.js';
  import { categories, subsOf, catHref } from '#lib/taxonomy.js';
  import { onMount } from 'svelte';
  import { counts, watchCounts } from '#lib/stores/counts.svelte.js';

  const entries = $derived(Object.entries(categories()));

  onMount(watchCounts);
</script>

<header id="header">
  <nav class="nav">
    <button class="hamburger" id="burger" aria-label="Open navigation menu">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
        <circle cx="5" cy="6" r="1.2"></circle>
        <circle cx="5" cy="12" r="1.2"></circle>
        <circle cx="5" cy="18" r="1.2"></circle>
        <line x1="10" y1="6" x2="20" y2="6"></line>
        <line x1="10" y1="12" x2="20" y2="12"></line>
        <line x1="10" y1="18" x2="20" y2="18"></line>
      </svg>
    </button>
    <a class="logo" href="/index.html">
      <span class="word">V A Y U</span>
    </a>
    <ul class="menu" id="menu">
      <!-- MENU: same full-bleed shell as the COLLECTION panel (.cdrop), but
           the body is what is on right now — categories and their sub-lists
           belong to COLLECTION, and repeating them here made the two panels
           near-identical.

           Vayu keeps two rooms with separate programmes, so the panel runs
           them side by side: the store and the gallery, each with its
           current event and the edit of pieces gathered around it. Both
           columns are rendered from data/events.js right here in this
           component — adding a show is an entry in that file. -->
      <li class="nav-dropdown">
        <a href="/pages/collection.html">MENU</a>
        <div class="cdrop mdrop" aria-label="What's on at Vayu">
          <div class="cdrop-inner mdrop-inner">
            <!-- one .mdrop-venue per house, filled from js/events.js -->
            <div class="mdrop-venues">
              {#each venues as venue (venue.id)}
                <section class="mdrop-venue">
                  <a class="mdrop-venue-head" href={venue.href}>
                    <span class="mdrop-venue-kind">{venue.kind}</span>
                    <span class="mdrop-venue-name">{venue.name}</span>
                  </a>
                  {#each eventsOf(venue) as ev, i}
                    <article class="mdrop-event{i === 0 ? ' is-current' : ''}">
                      <a class="mdrop-event-media" href={ev.href}>
                        <img src={ev.image} alt={ev.title} loading="lazy">
                        <span class="mdrop-event-flag">{i === 0 ? 'Now on' : 'Also on'}</span>
                      </a>
                      <div class="mdrop-event-line">
                        <span class="mdrop-event-dates">{ev.dates}</span>
                        <a class="mdrop-event-cta" href={ev.href}>{ev.cta} &rarr;</a>
                      </div>
                    </article>
                  {/each}
                </section>
              {/each}
            </div>
            <div class="mdrop-side">
              <div class="mdrop-shop">
                <span class="mdrop-label">Shop by category</span>
                <!-- from the taxonomy, like every other category list -->
                <ul>
                  {#each entries as [slug, cat] (slug)}
                    <li><a href={catHref(slug)}>{cat.title}</a></li>
                  {/each}
                </ul>
                <a class="mdrop-all" href="/pages/collection.html">View all collections →</a>
              </div>
              <div class="mdrop-utility">
                <span class="mdrop-label">Your Vayu</span>
                <a href="/pages/user-profile.html">Account <em>Orders &amp; addresses</em></a>
                <a href="/pages/wishlist.html">Wishlist</a>
                <a href="/pages/cart.html">Cart</a>
                <a href="/pages/help.html">Help &amp; shipping</a>
              </div>
              <!-- the route, not the address: both houses print the full
                   address, hours and directions on their own pages -->
              <a class="mdrop-visit" href="/pages/gallery.html#visit">
                <span class="mdrop-visit-label">Visit</span>
                <span class="mdrop-visit-line">Directions &amp; hours →</span>
              </a>
            </div>
          </div>
        </div>
      </li>
      <li class="nav-dropdown">
        <a href="/pages/collection.html">COLLECTION</a>
        <div class="cdrop" aria-label="Collection categories">
          <div class="cdrop-inner">
            <!-- One column per category. This list, the MENU list, the
                 mobile sheet, both footers and the collection directory all
                 render from one taxonomy object — they used to be six
                 hand-written copies that had already drifted apart. -->
            <div class="cdrop-cols">
              {#each entries as [slug, cat] (slug)}
                <div class="cdrop-col">
                  <a class="cdrop-head" href={catHref(slug)}>{cat.title}</a>
                  {#if subsOf(slug).length}
                    <ul>
                      {#each subsOf(slug) as s (s.slug)}
                        <li><a href={catHref(slug, s.slug)}>{s.label}</a></li>
                      {/each}
                    </ul>
                  {/if}
                </div>
              {/each}
            </div>
            <a class="cdrop-feature" href="/pages/collection.html">
              <span class="cdrop-feature-media">
                <img src="/assets/images/cat_furniture.png" alt="" loading="lazy">
              </span>
              <span class="cdrop-feature-body">
                <span class="cdrop-feature-title">View All Collections</span>
                <span class="cdrop-feature-arrow">→</span>
              </span>
            </a>
          </div>
        </div>
      </li>
      <li class="nav-dropdown">
        <a href="/pages/artist.html">ARTIST</a>
        <!-- same image-tile panel as GALLERY, desktop only -->
        <div class="cdrop gdrop" aria-label="Artists">
          <div class="cdrop-inner gdrop-inner">
            <div class="gdrop-intro">
              <span class="gdrop-eyebrow">Artist · Vayu</span>
              <a class="gdrop-title" href="/pages/artist.html">Hands That Make</a>
              <p class="gdrop-note">Six studios across India — weavers, founders, carvers and potters we have kept
                company with for a decade.</p>
              <a class="gdrop-cta" href="/pages/artist.html">Meet All Artists →</a>
            </div>
            <div class="gdrop-tiles">
              <a class="gdrop-tile" href="/pages/jenjum.html">
                <span class="gdrop-tile-media"><img src="/assets/images/jenjum_gadi.png" alt="" loading="lazy"></span>
                <span class="gdrop-tile-body">
                  <span class="gdrop-tile-name">Jenjum Gadi</span>
                  <span class="gdrop-tile-tag">In Residence</span>
                </span>
              </a>
              <a class="gdrop-tile" href="/pages/artist.html#lakshmi-devi">
                <span class="gdrop-tile-media"><img src="/assets/images/prod_silk_stole.png" alt="" loading="lazy"></span>
                <span class="gdrop-tile-body">
                  <span class="gdrop-tile-name">Lakshmi Devi</span>
                  <span class="gdrop-tile-tag">Weaver</span>
                </span>
              </a>
              <a class="gdrop-tile" href="/pages/artist.html#imtiaz-ahmad">
                <span class="gdrop-tile-media"><img src="/assets/images/prod_brass_cuff.png" alt="" loading="lazy"></span>
                <span class="gdrop-tile-body">
                  <span class="gdrop-tile-name">Imtiaz Ahmad</span>
                  <span class="gdrop-tile-tag">Brass</span>
                </span>
              </a>
              <a class="gdrop-tile" href="/pages/artist.html#savita-kumar">
                <span class="gdrop-tile-media"><img src="/assets/images/prod_ceramic_plate_set.png" alt=""
                    loading="lazy"></span>
                <span class="gdrop-tile-body">
                  <span class="gdrop-tile-name">Savita Kumar</span>
                  <span class="gdrop-tile-tag">Ceramics</span>
                </span>
              </a>
            </div>
          </div>
        </div>
      </li>
      <li class="nav-dropdown">
        <a href="/pages/gallery.html">GALLERY</a>
        <!-- image-tile panel, desktop only (see .gdrop in styles.css) -->
        <div class="cdrop gdrop" aria-label="Gallery sections">
          <div class="cdrop-inner gdrop-inner">
            <div class="gdrop-intro">
              <span class="gdrop-eyebrow">Gallery Vayu · New Delhi</span>
              <a class="gdrop-title" href="/pages/gallery.html">Echoes of Craft</a>
              <p class="gdrop-note">A room of quiet objects — brass, clay, cane and handwoven cloth.</p>
              <a class="gdrop-cta" href="/pages/gallery.html">Enter the Gallery →</a>
            </div>
            <div class="gdrop-tiles">
              <a class="gdrop-tile" href="/pages/gallery.html#exhibition">
                <span class="gdrop-tile-media"><img src="/assets/images/gallery_tile1.png" alt="" loading="lazy"></span>
                <span class="gdrop-tile-body">
                  <span class="gdrop-tile-name">The Exhibition</span>
                  <span class="gdrop-tile-tag">Three rooms</span>
                </span>
              </a>
              <a class="gdrop-tile" href="/pages/gallery.html#hands">
                <span class="gdrop-tile-media"><img src="/assets/images/journal_ceramics.png" alt="" loading="lazy"></span>
                <span class="gdrop-tile-body">
                  <span class="gdrop-tile-name">The Hands Behind It</span>
                  <span class="gdrop-tile-tag">Makers</span>
                </span>
              </a>
              <a class="gdrop-tile" href="/pages/artist.html">
                <span class="gdrop-tile-media"><img src="/assets/images/journal_weaving.png" alt="" loading="lazy"></span>
                <span class="gdrop-tile-body">
                  <span class="gdrop-tile-name">The Artists</span>
                  <span class="gdrop-tile-tag">Profiles</span>
                </span>
              </a>
              <a class="gdrop-tile" href="/pages/gallery.html#visit">
                <span class="gdrop-tile-media"><img src="/assets/images/gallery_tile3.png" alt="" loading="lazy"></span>
                <span class="gdrop-tile-body">
                  <span class="gdrop-tile-name">Visit Us</span>
                  <span class="gdrop-tile-tag">Lodhi Road</span>
                </span>
              </a>
            </div>
          </div>
        </div>
      </li>
      <li><a href="/pages/journal.html">JOURNAL</a></li>
      <li><a href="/pages/about.html">ABOUT</a></li>
    </ul>
    <!-- search field: replaces the menu in the bar while open, and on phones
         the logo too (see body.search-open rules in styles.css) -->
    <div class="nav-search" id="navSearch">
      <svg class="nav-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="7"></circle>
        <line x1="16.5" y1="16.5" x2="21" y2="21"></line>
      </svg>
      <input type="search" class="nav-search-input" id="navSearchInput" placeholder="Search Vayu" autocomplete="off"
        aria-label="Search products" aria-controls="navSearchResults">
      <button type="button" class="nav-search-clear" id="navSearchClear" aria-label="Close search">&times;</button>
    </div>
    <div class="icons">
      <button class="icon-search" id="navSearchBtn" aria-label="Search" aria-expanded="false">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
          stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
          <circle cx="11" cy="11" r="7"></circle>
          <line x1="16.5" y1="16.5" x2="21" y2="21"></line>
        </svg>
      </button>
      <button aria-label="Wishlist" onclick={() => goto('/pages/wishlist.html')} style="position:relative;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
          stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
          <path
            d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z">
          </path>
        </svg>
        <span class="icon-badge" style:display={counts.wish ? 'flex' : 'none'}>{counts.wish || ''}</span>
      </button>
      <!-- desktop only: phones already reach this from the bottom nav's ACCOUNT tab -->
      <button class="icon-account" aria-label="My Account"
        onclick={() => goto('/pages/user-profile.html')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
          stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
          <circle cx="12" cy="8" r="3.6"></circle>
          <path d="M4.5 20a7.5 7.5 0 0 1 15 0"></path>
        </svg>
      </button>
      <button aria-label="Cart" onclick={() => goto('/pages/cart.html')} style="position:relative;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
          stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path>
          <path d="M3 6h18"></path>
          <path d="M16 10a4 4 0 0 1-8 0"></path>
        </svg>
        <span class="icon-badge" style:display={counts.cart ? 'flex' : 'none'}>{counts.cart || ''}</span>
      </button>
    </div>
  </nav>
  <section class="nav-search-panel" id="navSearchResults" aria-live="polite" aria-label="Search results"></section>
</header>
