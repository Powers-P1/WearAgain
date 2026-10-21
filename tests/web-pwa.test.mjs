import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const template = await readFile(new URL('../web/public/sw-template.js', import.meta.url), 'utf8');
const origin = 'https://wearagain.pages.dev';
const publicFiles = ['/app/index.html', '/assets/app.js', '/assets/app.css', '/demo/manifest.json', '/demo/renders/example.jpg', '/icons/icon-192.png', '/manifest.webmanifest'];

function worker(files = publicFiles) {
  const listeners = new Map();
  const stores = new Map();
  const fetched = [];
  let network = async request => new Response(`public:${new URL(request.url).pathname}`);
  let claimed = 0;
  let skipped = 0;
  const keyOf = value => new URL(typeof value === 'string' ? value : value.url, origin).href;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(key, response) { store.set(keyOf(key), response.clone()); },
        async match(key) { return store.get(keyOf(key))?.clone(); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const scope = {
    location: new URL(origin),
    addEventListener(name, listener) { listeners.set(name, listener); },
    clients: { async claim() { claimed += 1; } },
    async skipWaiting() { skipped += 1; },
  };
  const code = template.replace('__PRECACHE_FILES__', JSON.stringify(files)).replace('__CACHE_VERSION__', 'test-v2');
  vm.runInNewContext(code, {
    self: scope, caches, URL, Request, Response, Set, TypeError, Error,
    fetch: async request => { fetched.push(request); return network(request); },
  });
  async function lifecycle(name) {
    let waiting;
    listeners.get(name)({ waitUntil(promise) { waiting = promise; } });
    await waiting;
  }
  function handle(path, options = {}) {
    const request = {
      url: new URL(path, origin).href,
      method: options.method ?? 'GET',
      mode: options.mode ?? 'navigate',
      headers: new Headers(options.headers),
    };
    let result;
    listeners.get('fetch')({ request, respondWith(promise) { result = promise; } });
    return result;
  }
  return {
    stores, fetched, lifecycle, handle,
    setNetwork(value) { network = value; },
    get claimed() { return claimed; },
    get skipped() { return skipped; },
  };
}

test('PWA precaches only its explicit public list, without credentials or redirect following', async () => {
  const app = worker();
  await app.lifecycle('install');
  assert.deepEqual(app.fetched.map(request => new URL(request.url).pathname), publicFiles);
  for (const request of app.fetched) {
    assert.equal(request.method, 'GET');
    assert.equal(request.credentials, 'omit');
    assert.equal(request.redirect, 'error');
    assert.equal(request.cache, 'reload');
    assert.equal(request.headers.has('Authorization'), false);
  }
  assert.equal(app.skipped, 1);
  assert.equal(app.stores.get('wearagain-demo-test-v2').size, publicFiles.length);
});

test('PWA serves the default and named demo scenarios plus saved images offline', async () => {
  const app = worker();
  await app.lifecycle('install');
  app.setNetwork(async () => { throw new Error('offline'); });
  for (const path of ['/app', '/app/', '/app?scenario=zero', '/app?scenario=error', '/app?mode=demo&scenario=minimum', '/app?source=pwa', '/app?tour=1']) {
    const response = await app.handle(path);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'public:/app/index.html');
  }
  assert.equal(await (await app.handle('/demo/renders/example.jpg', { mode: 'no-cors' })).text(), 'public:/demo/renders/example.jpg');
  assert.equal(app.fetched.length, publicFiles.length);
});

test('PWA precaches canonical Pages directory URLs and resolves document aliases offline without following redirects', async () => {
  const files = ['/', '/app/', '/retailers/', '/assets/app.js'];
  const app = worker(files);
  app.setNetwork(async request => {
    const path = new URL(request.url).pathname;
    assert.ok(files.includes(path), `No redirecting HTML alias should be prefetched: ${path}`);
    return new Response(`canonical:${path}`);
  });
  await app.lifecycle('install');
  app.setNetwork(async () => { throw new Error('offline'); });
  for (const [path, canonical] of [
    ['/', '/'], ['/index.html', '/'],
    ['/app', '/app/'], ['/app/', '/app/'], ['/app/index.html', '/app/'], ['/app?scenario=zero', '/app/'],
    ['/retailers', '/retailers/'], ['/retailers/', '/retailers/'], ['/retailers/index.html', '/retailers/'],
  ]) {
    assert.equal(await (await app.handle(path)).text(), `canonical:${canonical}`);
  }
  for (const path of ['/retailers?token=personal', '/index.html?mode=live', '/?account=person', '/api/ledger', '/app?mode=live']) {
    assert.equal(app.handle(path), undefined, path);
  }
  assert.equal(app.fetched.length, files.length);
});

test('PWA never handles live mode, authenticated requests, API calls, uploads, ranges or other origins', async () => {
  const app = worker();
  await app.lifecycle('install');
  const ignored = [
    ['/app?mode=live'], ['/app?scenario=zero&mode=live'], ['/app?mode=demo&mode=live'],
    ['/api/ledger'], ['/api/renders'], ['/api/demo/renders'], ['/uploads/face.jpg'],
    ['/demo/renders/example.jpg', { method: 'POST' }],
    ['/assets/app.js', { headers: { Authorization: 'Bearer a-session-token' } }],
    ['/demo/renders/example.jpg', { headers: { Range: 'bytes=0-100' } }],
    ['https://provider.example/demo/renders/example.jpg'],
    ['https://api.example/api/renders'],
  ];
  for (const [path, options] of ignored) assert.equal(app.handle(path, options), undefined, path);
  assert.equal(app.fetched.length, publicFiles.length);
});

test('PWA refuses unknown and signed query variants and never caches arbitrary navigation', async () => {
  const app = worker();
  await app.lifecycle('install');
  const paths = ['/account', '/anything', '/app?token=personal', '/app?scenario=unknown', '/app?scenario=zero&scenario=error', '/app?tour=2', '/demo/renders/example.jpg?signature=secret', '/assets/app.js?v=2'];
  for (const path of paths) assert.equal(app.handle(path), undefined, path);
  assert.equal(app.handle('/app?scenario=zero', { mode: 'cors' }), undefined);
  assert.equal(app.stores.get('wearagain-demo-test-v2').size, publicFiles.length);
});

test('PWA cache misses use the network without creating runtime cache entries', async () => {
  const app = worker();
  await app.lifecycle('install');
  const store = app.stores.get('wearagain-demo-test-v2');
  store.delete(`${origin}/assets/app.js`);
  app.setNetwork(async () => new Response('fresh static response'));
  assert.equal(await (await app.handle('/assets/app.js', { mode: 'cors' })).text(), 'fresh static response');
  assert.equal(store.has(`${origin}/assets/app.js`), false);
});

test('PWA activation removes only old WearAgain demo caches', async () => {
  const app = worker();
  app.stores.set('wearagain-demo-old', new Map());
  app.stores.set('another-app-public-cache', new Map());
  await app.lifecycle('install');
  await app.lifecycle('activate');
  assert.deepEqual([...app.stores.keys()].sort(), ['another-app-public-cache', 'wearagain-demo-test-v2']);
  assert.equal(app.claimed, 1);
});

test('PWA failed installation removes partial cache and preserves the previous version', async () => {
  const app = worker();
  app.stores.set('wearagain-demo-old', new Map([['old', new Response('old')]]));
  app.setNetwork(async request => new URL(request.url).pathname === '/assets/app.js'
    ? new Response('unavailable', { status: 503 }) : new Response('public file'));
  await assert.rejects(app.lifecycle('install'), /public demo asset/);
  assert.equal(app.stores.has('wearagain-demo-test-v2'), false);
  assert.equal(app.stores.has('wearagain-demo-old'), true);
  assert.equal(app.skipped, 0);
});

test('PWA build list rejects accidental API, private, cross-origin and signed entries', () => {
  for (const path of ['/api/demo/renders', '/demo/uploads/photo.jpg', '/live/result.jpg', '/private/session.json', '//other.example/asset', 'https://other.example/asset', '/assets/app.js?token=personal', '/assets/../api/ledger', '/assets/%2e%2e/api/ledger']) {
    assert.throws(() => worker([...publicFiles, path]), /explicit, same-origin public files/, path);
  }
});

test('PWA manifest identifies the installable demo and both required raster icon sizes', async () => {
  const manifest = JSON.parse(await readFile(new URL('../web/public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/app?source=pwa');
  assert.equal(manifest.lang, 'en');
  assert.deepEqual(manifest.icons.map(icon => [icon.sizes, icon.type]), [['192x192', 'image/png'], ['512x512', 'image/png']]);
});
