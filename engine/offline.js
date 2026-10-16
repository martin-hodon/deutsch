// THE OFFLINE COPY, from the page's side (sw.js keeps the files): the version kept, a check for a newer one online, and
// the update -- only when asked: the new files fetched into a new cache, the old one dropped once the new one is whole,
// the page reloaded. Without a network nothing changes, and the trainer keeps working from what it has.
const PREFIX = "trainer-";

// only on a real site (http/https): a page opened from a FILE cannot have a service worker -- the browser refuses one --
// and needs none (its files are on the disk); nor can an old browser. Either way the trainer just runs, with no copy kept.
export async function startOffline() {
  if (!/^https?:$/.test(location.protocol) || !("serviceWorker" in navigator) || !("caches" in self)) return false;
  try {
    await navigator.serviceWorker.register("sw.js");
  } catch (error) {
    console.warn("trainer: no offline copy --", error);
    return false;
  }
  navigator.storage?.persist?.();   // (asks the browser not to clear the kept copy when space runs short)
  return true;
}

// the version kept in the browser ("" while the first copy is still being made)
export async function keptVersion() {
  const keys = (await caches.keys()).filter((k) => k.startsWith(PREFIX));
  return keys.length ? keys[keys.length - 1].slice(PREFIX.length) : "";
}

// the version online now (null offline)
export async function onlineVersion() {
  try { return (await (await fetch("offline.json?" + Date.now(), { cache: "no-store" })).json()).version; } catch { return null; }
}

// THE UPDATE: every file of the online version into its own cache; only when all of them are there are the old ones
// dropped. A failure leaves the kept copy as it was.
export async function update() {
  const manifest = await (await fetch("offline.json?" + Date.now(), { cache: "no-store" })).json();
  const name = PREFIX + manifest.version, cache = await caches.open(name);
  try {
    await cache.addAll(manifest.files.map((f) => new Request(f, { cache: "reload" })));
  } catch (error) {
    await caches.delete(name);
    throw error;
  }
  for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== name) await caches.delete(k);
  location.reload();
}
