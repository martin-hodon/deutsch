// THE OFFLINE COPY: a service worker that keeps every file of the trainer (offline.json lists them) in the browser and
// answers from there -- so the trainer opens with no network at all. It never updates on its own: the trainer checks for
// a newer version and offers it (engine/ui.js showVersion: a line over the page, and ⋯ Settings), and it is fetched only
// when the learner presses Update (engine/offline.js), into a new cache, the old one dropped once the new one is whole.
//
//   caches: "trainer-<version>" -- the one in use (the newest whole one)

const PREFIX = "trainer-";

// first visit: nothing kept yet -- keep the version that is online now
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    if ((await caches.keys()).some((k) => k.startsWith(PREFIX))) return;
    const manifest = await (await fetch("offline.json", { cache: "no-store" })).json();
    const name = PREFIX + manifest.version, cache = await caches.open(name);
    try { await cache.addAll(manifest.files.map((f) => new Request(f, { cache: "reload" }))); } catch (error) { await caches.delete(name); throw error; }   // (a file missing online: no copy, tried again next visit)
  })());
});
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// every request the trainer makes: the kept copy if there is one (a query string ignored), else the network
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;
  if (event.request.cache === "no-store" || event.request.cache === "reload") return;   // (the update asking the network itself)
  event.respondWith((async () => {
    const keys = (await caches.keys()).filter((k) => k.startsWith(PREFIX));
    for (const k of keys.reverse()) {   // (the newest first: during an update both may be there for a moment)
      const hit = await (await caches.open(k)).match(event.request, { ignoreSearch: true });
      if (hit) return hit;
    }
    return fetch(event.request);
  })());
});
