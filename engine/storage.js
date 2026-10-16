// What is kept: the answer log in IndexedDB; the learner's name and settings in localStorage (plain, synchronous,
// kept across visits) AND in IndexedDB's profile store, each value with the time it was written -- read from both, the
// newer one wins (one store blocked or cleared, or a browser closed before the other reached the disk).
//
// The answer log: one record per answered question, never changed afterwards. The repetition schedule (srs.js)
// and the statistics (stats.js) are computed from it.
//   a record: { time, mode, card, entry, category, prompt, answer, chosen, correct, ms }
// The profile: { name, setting:<key> }

const DB_NAME = "deutsch-trainer";
const ANSWERS = "answers", PROFILE = "profile";

const request = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

// the profile in localStorage, under "trainer:" -- a key read from IndexedDB once when localStorage has it not yet
const LS = "trainer:", local = {
  get(key) { try { const v = localStorage.getItem(LS + key); return v === null ? undefined : JSON.parse(v); } catch { return undefined; } },
  set(key, value) { try { localStorage.setItem(LS + key, JSON.stringify(value)); } catch { /* (storage blocked: the setting lasts the visit) */ } },
  keys() { try { return Object.keys(localStorage).filter((k) => k.startsWith(LS)).map((k) => k.slice(LS.length)); } catch { return []; } },
};
// (a stored value: { t: when, v: it }; one stored before this wrapper counts as the oldest)
const stamped = (x) => (x && typeof x === "object" && "t" in x && "v" in x ? x : x === undefined ? null : { t: 0, v: x });
// a setting read and written synchronously from localStorage alone (pages without the IndexedDB log: the dictionary,
// the reading page); a write is stamped now, so the trainer takes it over its IndexedDB copy
export const peekSetting = (key) => stamped(local.get("setting:" + key))?.v;
export const pokeSetting = (key, value) => local.set("setting:" + key, { t: Date.now(), v: value });
// the learner's pair { learn, other }: the ONE language chosen across the trainer, the dictionary and the reading page
export const peekName = () => stamped(local.get("name"))?.v;   // (the learner's name, for a page without the IndexedDB log)
export const keptPair = () => ({ learn: "de", other: "sk", ...(peekSetting("pair") ?? {}) });
export const keepLearn = (learn) => { if (learn && learn !== keptPair().learn) pokeSetting("pair", { ...keptPair(), learn }); };

export async function openStorage() {
  const open = indexedDB.open(DB_NAME, 2);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains(ANSWERS)) db.createObjectStore(ANSWERS, { autoIncrement: true });
    if (!db.objectStoreNames.contains(PROFILE)) db.createObjectStore(PROFILE);
  };
  const db = await request(open);
  const store = (name, mode) => db.transaction(name, mode).objectStore(name);
  const get = async (key) => {
    const a = stamped(local.get(key)), b = stamped(await request(store(PROFILE, "readonly").get(key)).catch(() => undefined));
    const best = !a ? b : !b ? a : b.t > a.t ? b : a;
    if (best && best !== a) local.set(key, best);
    return best?.v;
  };
  const set = (key, value) => { const x = { t: Date.now(), v: value }; local.set(key, x); return request(store(PROFILE, "readwrite").put(x, key)).catch(() => {}); };
  return {
    addAnswer: record => request(store(ANSWERS, "readwrite").add(record)),
    allAnswers: () => request(store(ANSWERS, "readonly").getAll()),           // oldest first
    getName: () => get("name"),                                              // undefined on first use
    setName: name => set("name", name),
    // the learner's settings (the voice, the pair, the view ...), kept across visits
    getSetting: key => get("setting:" + key),
    setSetting: (key, value) => set("setting:" + key, value),
    // the whole profile: { name, settings: { key: value } } (the recorded data view, its download)
    profile: async () => {
      const out = { settings: {} };
      for (const k of local.keys()) { if (k === "name") out.name = stamped(local.get(k))?.v; else if (k.startsWith("setting:")) out.settings[k.slice(8)] = stamped(local.get(k))?.v; }
      out.name ??= await get("name");
      return out;
    },
  };
}
