#!/bin/sh
# @sveltejs/adapter-cloudflare begins every build with rmSync on its own
# output directory. On Windows that intermittently fails with EPERM while the
# indexer, Defender or a just-stopped workerd still holds a handle -- and the
# adapter does not retry, so the whole build dies after the slow part has
# already succeeded. Clear it here, with retries, before Vite starts.
for i in 1 2 3 4 5 6 7 8 9 10; do
  rm -rf .svelte-kit/cloudflare 2>/dev/null
  [ -d .svelte-kit/cloudflare ] || break
  sleep 1
done
if [ -d .svelte-kit/cloudflare ]; then
  echo "could not clear .svelte-kit/cloudflare -- is a dev server still running?" >&2
  exit 1
fi
npx vite build "$@" || exit 1
test -f .svelte-kit/cloudflare/_worker.js || { echo "BUILD INCOMPLETE: no _worker.js" >&2; exit 1; }
echo "build ok: $(find .svelte-kit/cloudflare -name '*.html' | wc -l) pages, worker emitted"
