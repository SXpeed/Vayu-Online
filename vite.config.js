import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';

/**
 * Vayu — Vite + SvelteKit config.
 *
 * SvelteKit 3 dropped svelte.config.js, and dropped the `kit` namespace with
 * it: adapter and files are passed straight to the sveltekit() plugin.
 *
 * The app lives under app/ rather than SvelteKit's default src/. The server
 * modules (db, catalogue, checkout, sessions …) live in app/lib/server, the
 * storefront and its shared logic in app/lib, and the admin panel's source in
 * app/admin-ui — routes, server logic and the UI kept together under app/.
 */
export default {
  build: {
    rollupOptions: {
      output: {
        /**
         * Keep Better Auth in a chunk of its own.
         *
         * Without this, rolldown hoists its internals (generateRandomString,
         * signJWT, …) into whichever route chunk first pulls them in and
         * re-exports them from it — and SvelteKit validates a +server.js
         * module's exports, so the build fails with "Invalid export 'a'".
         * Isolating the package means the route chunk exports only GET/POST.
         */
        manualChunks(id) {
          if (id.includes('better-auth') || id.includes('@better-auth')) {
            return 'better-auth';
          }
        },
      },
    },
  },
  plugins: [
    sveltekit({
      adapter: adapter({
        // The admin panel's own files must not be plain public assets: the
        // pre-SvelteKit Worker claimed /admin* so index.html and the view
        // modules were only ever handed to someone with a session. Listing
        // it here keeps the Worker in front of those paths, so the gate in
        // routes/admin/[...path] still runs.
        // `/css/*` was excluded here too, until the stylesheet stopped being
        // a static asset. It lived in public/ from the pre-SvelteKit site,
        // which linked /css/styles.css directly — but the layout *imports*
        // it, so Vite was already bundling and minifying it into a hashed
        // asset while a second, unminified 132KB copy rode along in the
        // deploy that nothing ever requested. It is source now
        // (app/styles/styles.css) and there is no /css/ to exclude.
        routes: {
          include: ['/*'],
          exclude: ['/_app/immutable/*', '/assets/*'],
        },
      }),
      // Listed rather than crawled. The crawler starts at / and follows
      // links, which silently misses any page not linked from another one --
      // and a page that fails to prerender falls back to being rendered by
      // the Worker on every request, which is the compute this site exists
      // without. An explicit list fails the build instead.
      prerender: {
        entries: [
          '/',
          '/pages/about.html',
          '/pages/artist.html',
          '/pages/cart.html',
          '/pages/collection-detail.html',
          '/pages/collection.html',
          '/pages/curated-spaces.html',
          '/pages/design-for-living.html',
          '/pages/event.html',
          '/pages/gallery.html',
          '/pages/help.html',
          '/pages/artist-profile.html',
          '/pages/legal.html',
          '/pages/press.html',
          '/pages/product.html',
          '/pages/user-profile.html',
          '/pages/wishlist.html',
        ],
        handleHttpError: 'warn',
      },
      files: {
        routes: 'app/routes',
        appTemplate: 'app/app.html',
        assets: 'public',
        hooks: { server: 'app/hooks.server' },
      },
    }),
  ],
};
