/**
 * Vayu — every admin panel screen, exercised against a live worker.
 *
 *   npx wrangler dev --port 8787
 *   ADMIN_PASSWORD=... node scripts/admin-smoke.mjs
 *
 * This exists because four separate features were dead in the panel and
 * nothing said so. The request schemas in lib/schemas/admin.js had drifted
 * from what the panel actually posts — a price declared as a display string
 * where the form sends a number, a coupon's fields named after fields that
 * exist nowhere, a journal body declared as an array where the textarea
 * sends a string — and the gate rejected each write before its handler ran.
 * Adding a product, adding a coupon and publishing a story all returned
 * "Invalid input" for reasons no one could act on. Separately the schema
 * router matched on a path prefix, so it applied the product schema to
 * /products/bulk, /products/import and /products/<id>/duplicate, killing
 * those three as well.
 *
 * All of that is invisible to a unit test of the schemas alone, and to a
 * test of the handlers alone. It only shows up end to end, which is what
 * this is: the panel's exact payloads, through the real gate, into the real
 * handlers, against a real database.
 *
 * It writes and then deletes its own rows. Point it at a local wrangler,
 * never at production.
 */
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const PASSWORD = process.env.ADMIN_PASSWORD || 'local-test-pass';
let cookie = '';
let pass = 0, fail = 0;

async function req(path, method = 'GET', body) {
  const res = await fetch(`${BASE}/api/admin/${path}`, {
    method,
    // Origin, because SvelteKit's CSRF check rejects same-site-less writes
    // with "Cross-site DELETE form submissions are forbidden". A browser
    // always sends it; fetch() from Node does not.
    headers: {
      origin: BASE,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setC = res.headers.get('set-cookie');
  if (setC) cookie = setC.split(';')[0];
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}

async function step(name, fn) {
  try {
    const msg = await fn();
    pass++; console.log(`PASS  ${name}${msg ? ` — ${msg}` : ''}`);
  } catch (e) {
    fail++; console.log(`FAIL  ${name} — ${e.message}`);
  }
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

await step('login', async () => {
  const r = await req('login', 'POST', { email: 'admin@vayu.com', password: PASSWORD });
  must(r.status === 200 && r.data.ok, `status ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.name;
});

/* ---------------- products ---------------- */

let newId = null;
await step('ADD PRODUCT (the panel exact payload)', async () => {
  const r = await req('products', 'POST', {
    name: 'E2E Test Piece', description: 'A test description.', price: 2499, compareAt: '',
    sku: 'E2E-1', stock: 7, status: 'active', isNew: true,
    img: '/assets/images/cat_objects.png', gallery: ['/assets/images/cat_objects.png'],
    categories: [{ cat: 'decor', sub: '' }], tags: ['test'],
    options: [], variants: [],
    care: 'Wipe clean.', dimensions: [{ label: 'Height', value: '12 cm' }],
    materials: [{ label: 'Material', value: 'Brass' }], shippingPreset: '',
    publishAt: null,
  });
  must(r.status === 201, `status ${r.status} ${JSON.stringify(r.data)}`);
  newId = r.data.product.id;
  must(r.data.product.name === 'E2E Test Piece', 'name not saved');
  must(r.data.product.dimensions.length === 1, 'dimensions not saved');
  must(r.data.product.care === 'Wipe clean.', 'care not saved');
  return newId;
});

await step('ADD PRODUCT with options + combinations', async () => {
  const r = await req('products', 'POST', {
    name: 'E2E Optioned', price: 3000, status: 'active',
    img: '/assets/images/cat_objects.png', gallery: ['/assets/images/cat_objects.png'],
    categories: [{ cat: 'decor', sub: '' }],
    options: [{ name: 'Size', kind: 'text', values: [{ label: 'S' }, { label: 'M' }] }],
    variants: [
      { label: 'S', combo: 'Size=S', price: null, stock: 2, image: '' },
      { label: 'M', combo: 'Size=M', price: 3500, stock: 0, image: '' },
    ],
  });
  must(r.status === 201, `status ${r.status} ${JSON.stringify(r.data)}`);
  must(r.data.product.options[0].values.length === 2, 'option values lost');
  must(r.data.product.variants.length === 2, 'variants lost');
  await req(`products/${r.data.product.id}`, 'DELETE');
  return 'options + 2 combinations round-tripped';
});

await step('add product rejected without a category', async () => {
  const r = await req('products', 'POST', { name: 'No Cat', price: 100, status: 'active', categories: [] });
  must(r.status === 400, `expected 400, got ${r.status}`);
  return r.data.error;
});

await step('add product rejected with options but no combinations', async () => {
  const r = await req('products', 'POST', {
    name: 'Bad Options', price: 100, status: 'active', categories: [{ cat: 'decor', sub: '' }],
    options: [{ name: 'Size', kind: 'text', values: [{ label: 'S' }] }], variants: [],
  });
  must(r.status === 400, `expected 400, got ${r.status}`);
  return r.data.error;
});

await step('edit product', async () => {
  const r = await req(`products/${newId}`, 'PUT', {
    name: 'E2E Test Piece (edited)', price: 2599, status: 'active',
    img: '/assets/images/cat_objects.png', gallery: ['/assets/images/cat_objects.png'],
    categories: [{ cat: 'decor', sub: '' }],
  });
  must(r.status === 200, `status ${r.status} ${JSON.stringify(r.data)}`);
  must(r.data.product.price === 2599, 'price not updated');
  must(r.data.product.care === 'Wipe clean.', 'partial edit wiped care');
  return 'price changed, details preserved';
});

let dupId = null;
await step('duplicate product', async () => {
  const r = await req(`products/${newId}/duplicate`, 'POST', {});
  must(r.status === 201, `status ${r.status}`);
  dupId = r.data.product.id;
  must(r.data.product.status === 'draft', 'copy should be a draft');
  must(r.data.product.dimensions.length === 1, 'copy lost its details');
  return r.data.product.name;
});

await step('bulk status change', async () => {
  const r = await req('products/bulk', 'POST', { ids: [dupId], action: 'status', status: 'archived' });
  must(r.status === 200 && r.data.affected === 1, JSON.stringify(r.data));
  return '1 archived';
});

await step('bulk stock set', async () => {
  const r = await req('products/bulk', 'POST', { ids: [dupId], action: 'stock-set', stock: 42 });
  must(r.status === 200, JSON.stringify(r.data));
  const list = await req('products');
  must(list.data.products.find(p => p.id === dupId).stock === 42, 'stock not applied');
  return 'stock = 42';
});

await step('CSV import', async () => {
  const csv = 'name,price,stock,status,categories\nE2E Imported,1500,3,draft,decor\n';
  const r = await req('products/import', 'POST', { csv });
  must(r.status === 200, JSON.stringify(r.data));
  must(r.data.created + r.data.updated >= 1, 'nothing imported');
  return `${r.data.created} created, ${r.data.updated} updated`;
});

await step('delete product', async () => {
  must((await req(`products/${dupId}`, 'DELETE')).status === 200, 'delete failed');
  const list = await req('products');
  const imported = list.data.products.find(p => p.name === 'E2E Imported');
  if (imported) await req(`products/${imported.id}`, 'DELETE');
  await req(`products/${newId}`, 'DELETE');
  return 'cleaned up';
});

/* ---------------- everything else ---------------- */

await step('categories: create, edit, delete', async () => {
  must((await req('categories', 'POST', {
    slug: 'e2e-cat', title: 'E2E Cat', curated: '/a.png', banner: '/b.png',
    subs: [{ label: 'Sub One', thumb: '' }],
  })).status === 201, 'create failed');
  must((await req('categories/e2e-cat', 'PUT', { title: 'E2E Cat 2', subs: [] })).status === 200, 'update failed');
  must((await req('categories/e2e-cat', 'DELETE')).status === 200, 'delete failed');
  return 'round-trip';
});

await step('journal: create, edit, delete', async () => {
  const c = await req('journal', 'POST', {
    title: 'E2E Story', category: 'craft', categoryLabel: 'Craft & Heritage',
    readingTime: '4 min read', date: 'August 17, 2026', featured: false,
    image: '/a.png', excerpt: 'x', body: 'Para one.\n\nPara two.',
  });
  must(c.status === 201, `create ${c.status} ${JSON.stringify(c.data)}`);
  must(c.data.story.body.length === 2, 'paragraphs not split');
  const id = c.data.story.id;
  must((await req(`journal/${id}`, 'PUT', { title: 'E2E Story 2', body: 'One.' })).status === 200, 'update failed');
  must((await req(`journal/${id}`, 'DELETE')).status === 200, 'delete failed');
  return '2 paragraphs split from one textarea';
});

await step('coupons: create, edit, delete', async () => {
  const c = await req('coupons', 'POST', {
    code: 'E2ETEST', type: 'percent', value: 10, minOrder: 0, expiresAt: null,
    usageLimit: 0, perCustomerLimit: 0, active: true, restrictTo: { emails: [], phones: [] },
  });
  must(c.status === 201, `create ${c.status} ${JSON.stringify(c.data)}`);
  const id = c.data.coupon?.id ?? c.data.id;
  must((await req(`coupons/${id}`, 'PUT', { code: 'E2ETEST', type: 'flat', value: 200 })).status === 200, 'update failed');
  must((await req(`coupons/${id}`, 'DELETE')).status === 200, 'delete failed');
  return 'percent -> flat';
});

await step('shipping profiles: create, edit, delete', async () => {
  const c = await req('shipping-presets', 'POST', { name: 'E2E Profile', body: 'Ships eventually.' });
  must(c.status === 201, `create ${c.status}`);
  const id = c.data.preset.id;
  must((await req(`shipping-presets/${id}`, 'PUT', { name: 'E2E Profile 2', body: 'Ships sooner.' })).status === 200, 'update failed');
  must((await req(`shipping-presets/${id}`, 'DELETE')).status === 200, 'delete failed');
  return 'round-trip';
});

/*
 * Content and settings are singleton documents: there is one of each, and
 * it is the live one. Everything above this point creates a row, checks it
 * and deletes it; these two have nothing to create, so they are snapshotted
 * first and put back afterwards.
 *
 * Written the hard way because the easy way did real damage. An earlier
 * version of this file simply PUT its test values, which replaced the shop's
 * hero carousel with one placeholder slide and blanked the product detail
 * defaults. A smoke test that leaves the shop different from how it found it
 * is not a test, it is an edit.
 */
await step('content save (snapshot and restore)', async () => {
  const before = (await req('content')).data.content;

  const r = await req('content', 'PUT', {
    announcement: 'E2E announcement',
    heroSlides: [{ img: '/assets/images/cat_objects.png', alt: 'a', title: 't', ctaText: 'Go', ctaHref: '/x' }],
    productDefaults: { description: 'dd', care: 'cc', dimensions: [{ label: 'L', value: '1 cm' }], materials: [] },
  });
  must(r.status === 200, `status ${r.status} ${JSON.stringify(r.data)}`);
  must(r.data.content.productDefaults.description === 'dd', 'defaults not saved');
  must(r.data.content.heroSlides.length === 1, 'slides not saved');

  const restored = await req('content', 'PUT', {
    announcement: before.announcement ?? '',
    heroSlides: before.heroSlides ?? [],
    productDefaults: before.productDefaults ?? {},
  });
  must(restored.status === 200, 'restore failed');
  const now = restored.data.content;
  must((now.heroSlides ?? []).length === (before.heroSlides ?? []).length, 'slides not restored');
  must(JSON.stringify(now.productDefaults ?? {}) === JSON.stringify(before.productDefaults ?? {}),
    'product defaults not restored');
  return `saved, then put back ${(before.heroSlides ?? []).length} slide(s)`;
});

await step('settings save (snapshot and restore)', async () => {
  const before = (await req('settings')).data.settings;

  const r = await req('settings', 'PUT', { ...before, storeName: 'E2E Store Name' });
  must(r.status === 200, `status ${r.status} ${JSON.stringify(r.data)}`);
  must(r.data.settings.storeName === 'E2E Store Name', 'not saved');

  const restored = await req('settings', 'PUT', before);
  must(restored.status === 200 && restored.data.settings.storeName === before.storeName, 'restore failed');
  return `saved, then put back "${before.storeName}"`;
});

for (const name of [
  'overview', 'analytics', 'activity', 'orders', 'customers',
  'inventory', 'reviews', 'outbox', 'team', 'me',
]) {
  await step(`read ${name}`, async () => {
    const r = await req(name);
    must(r.status === 200, `status ${r.status}`);
    return 'ok';
  });
}

await step('CSV export', async () => {
  const res = await fetch(`${BASE}/api/admin/export/products.csv`, { headers: { cookie, origin: BASE } });
  must(res.status === 200, `status ${res.status}`);
  const body = await res.text();
  must(body.split('\n').length > 1, 'empty export');
  return `${body.split('\n').length - 1} rows`;
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
