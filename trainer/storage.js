// What is kept in IndexedDB: the answer log, the learner's name and settings.
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

export async function openStorage() {
  const open = indexedDB.open(DB_NAME, 2);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains(ANSWERS)) db.createObjectStore(ANSWERS, { autoIncrement: true });
    if (!db.objectStoreNames.contains(PROFILE)) db.createObjectStore(PROFILE);
  };
  const db = await request(open);
  const store = (name, mode) => db.transaction(name, mode).objectStore(name);
  return {
    addAnswer: record => request(store(ANSWERS, "readwrite").add(record)),
    allAnswers: () => request(store(ANSWERS, "readonly").getAll()),           // oldest first
    getName: () => request(store(PROFILE, "readonly").get("name")),          // undefined on first use
    setName: name => request(store(PROFILE, "readwrite").put(name, "name")),
    // the learner's settings, by name (the voice: { level 0-3, kind })
    getSetting: key => request(store(PROFILE, "readonly").get("setting:" + key)),
    setSetting: (key, value) => request(store(PROFILE, "readwrite").put(value, "setting:" + key)),
  };
}
