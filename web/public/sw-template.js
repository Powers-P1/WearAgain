/* Build substitutes this immutable, public-file allowlist. No runtime responses are cached. */
const PRECACHE_FILES = __PRECACHE_FILES__;
const CACHE_NAME = "wearagain-demo-__CACHE_VERSION__";
const CACHE_PREFIX = "wearagain-demo-";
const ORIGIN = self.location.origin;

function validPublicFile(path) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return false;
  const url = new URL(path, ORIGIN);
  if (url.origin !== ORIGIN || url.pathname !== path || url.search || url.hash || path.includes("\\")) return false;
  if (/(?:^|\/)(?:api|uploads?|live)(?:\/|$)/i.test(path) || /%/i.test(path)) return false;
  return /^(?:\/(?:assets|demo|icons)\/[^?#]+|\/(?:app|retailers)(?:\/index\.html|\/)?|\/index\.html|\/manifest\.webmanifest|\/)$/u.test(path);
}

if (!Array.isArray(PRECACHE_FILES) || !PRECACHE_FILES.every(validPublicFile)) {
  throw new TypeError("The demo precache must contain only explicit, same-origin public files.");
}
const ALLOWED = new Set(PRECACHE_FILES);
const APP_DOCUMENT = ["/app/", "/app", "/app/index.html"].find(path => ALLOWED.has(path));
const SHOPPERS_DOCUMENT = ["/", "/index.html"].find(path => ALLOWED.has(path));
const RETAILERS_DOCUMENT = ["/retailers/", "/retailers", "/retailers/index.html"].find(path => ALLOWED.has(path));

function cacheKey(request) {
  if (request.method !== "GET" || request.headers.has("Authorization") || request.headers.has("Range")) return null;
  const url = new URL(request.url);
  if (url.origin !== ORIGIN || /(?:^|\/)(?:api|uploads?|live)(?:\/|$)/i.test(url.pathname)) return null;
  if (["/app", "/app/", "/app/index.html"].includes(url.pathname)) {
    if (request.mode !== "navigate") return url.search ? null : ALLOWED.has(url.pathname) ? url.pathname : null;
    const parameters = new Set();
    for (const [name, value] of url.searchParams) {
      if (parameters.has(name)) return null;
      parameters.add(name);
      if (name === "mode" && value === "demo") continue;
      if (name === "scenario" && ["minimum", "zero", "error"].includes(value)) continue;
      if (name === "source" && value === "pwa") continue;
      if (name === "tour" && value === "1") continue;
      return null;
    }
    return APP_DOCUMENT ?? null;
  }
  // A signed URL, cache-busting query, or unfamiliar navigation gets the normal network path.
  if (url.search || url.hash) return null;
  if (request.mode === "navigate") {
    if (["/", "/index.html"].includes(url.pathname)) return SHOPPERS_DOCUMENT ?? null;
    if (["/retailers", "/retailers/", "/retailers/index.html"].includes(url.pathname)) return RETAILERS_DOCUMENT ?? null;
  }
  if (!ALLOWED.has(url.pathname)) return null;
  return url.pathname;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      for (const path of ALLOWED) {
        const request = new Request(new URL(path, ORIGIN), {
          method: "GET", credentials: "omit", cache: "reload", redirect: "error",
        });
        const response = await fetch(request);
        if (!response.ok || response.type === "opaque" || response.redirected) throw new Error("A public demo asset could not be cached.");
        await cache.put(new URL(path, ORIGIN).href, response);
      }
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const key = cacheKey(event.request);
  if (key === null) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const saved = await cache.match(new URL(key, ORIGIN).href);
    // A cache miss is fetched but never saved. API traffic, live requests and uploads bypass this handler entirely.
    return saved ?? fetch(event.request);
  })());
});
