// THE NETWORK'S TRAINING FRAMES (tools/listen_train.py): recordings -> a PACK: OUT.x (each frame's features, float32,
// engine/listen.js frames()), OUT.y (each frame's class index, 255: none), OUT.json (the features, the classes, the
// utterances: name, speaker, frames). Two sources:
//   emodb: the Berlin database's phone labels (tools/listen_corpus.js) -- `mic`: through the cheap microphone too;
//   align: LIST.tsv (wav path, speaker, IPA of what was read -- tools/listen_voxforge.py) lined up with the text by the
//          engine's own aligner (forceAlign: the class chain of the IPA, Viterbi), the recordings it cannot align left out;
//          the frames judged by the profiles, or by NET.json (a network trained before: better labels, then train again);
//   again: a pack's recordings measured anew (the features changed), its classes kept -- CORPUS: an emodb pack's corpus.
//
//   gjs -m tools/listen_data.js emodb CORPUS OUT [mic]
//   gjs -m tools/listen_data.js align LIST.tsv OUT [NET.json] [mic]   (mic: each also through the microphone, the same labels)
//   gjs -m tools/listen_data.js again PACK OUT [CORPUS]
import Gio from "gi://Gio";
const L = await import("../engine/listen.js");
const { emodbFrames, microphone, readWav } = await import("./listen_corpus.js");
const { loadProsody } = await import("../engine/speak.js");
const TOP = import.meta.url.replace(/^file:\/\//, "").replace(/\/tools\/[^/]*$/, "");
const read = (p) => Gio.File.new_for_path(p).load_contents(null)[1];
globalThis.fetch ??= async (url) => { const b = read(TOP + "/" + url.replace(/^\.?\//, "")); return { text: async () => new TextDecoder().decode(b), json: async () => JSON.parse(new TextDecoder().decode(b)) }; };
await L.loadProfiles("engine/listen.json");
const [source, input, out, ...extra] = ARGV, mic = extra.includes("mic"), net = extra.find((a) => a.endsWith(".json"));
if (!out) { print("usage: gjs -m tools/listen_data.js emodb CORPUS OUT [mic] | align LIST.tsv OUT [NET.json] [mic] | again PACK OUT [CORPUS]"); throw new Error("arguments"); }

// (written as they come: the whole of VoxForge does not fit in memory)
const utterances = [], INDEX = Object.fromEntries(L.CLASS_NAMES.map((c, k) => [c, k]));
const stream = (p) => Gio.File.new_for_path(p).replace(null, false, Gio.FileCreateFlags.NONE, null);
const outX = stream(out + ".x"), outY = stream(out + ".y");
const keep = (name, speaker, F, cls) => {
  outX.write_all(new Uint8Array(F.x.buffer, F.x.byteOffset, F.n * L.DIMS * 4), null);
  outY.write_all(Uint8Array.from(cls, (c) => (c == null ? 255 : typeof c === "number" ? c : INDEX[c])), null);
  utterances.push({ name, speaker, n: F.n });
};
let skipped = 0;
if (source === "emodb") {
  const names = [], files = Gio.File.new_for_path(`${input}/wav`).enumerate_children("standard::name", 0, null);
  for (let info; (info = files.next_file(null)); ) { const n = info.get_name(); if (n.endsWith(".wav")) names.push(n.slice(0, -4)); }
  for (const name of names.sort()) for (const m of mic ? [false, true] : [false]) { const { F, cls } = emodbFrames(input, name, m); keep(name + (m ? "+mic" : ""), "emodb" + name.slice(0, 2), F, cls); }
} else if (source === "align") {
  const P = await loadProsody("de/rules/speech.txt");
  if (net) L.setNet(JSON.parse(new TextDecoder().decode(read(net))));
  for (const line of new TextDecoder().decode(read(input)).trim().split("\n")) {
    const [path, speaker, ipa] = line.split("\t"), w = readWav(path), F = L.frames(w.samples, w.rate, { margin: 1e6 }), cls = L.forceAlign(F, ipa, P);
    if (!cls) { skipped++; continue; }
    keep(path, speaker, F, cls);
    if (mic) { const M = L.frames(microphone(w.samples, w.rate, path), w.rate, { margin: 1e6 }); if (M.n === F.n) keep(path + "+mic", speaker, M, cls); }
  }
} else if (source === "again") {
  const meta = JSON.parse(new TextDecoder().decode(read(input + ".json"))), Y = read(input + ".y"), corpus = extra[0];
  let at = 0;
  for (const u of meta.utterances) {
    const name = u.name.replace(/\+mic$/, ""), m = u.name.endsWith("+mic");
    let F;
    if (meta.source === "emodb") F = emodbFrames(corpus, name, m).F;
    else { const w = readWav(name); F = L.frames(m ? microphone(w.samples, w.rate, name) : w.samples, w.rate, { margin: 1e6 }); }
    if (F.n === u.n) keep(u.name, u.speaker, F, Y.subarray(at, at + u.n)); else skipped++;
    at += u.n;
  }
} else throw new Error("source: emodb, align or again");

outX.close(null); outY.close(null);
const n = utterances.reduce((s, u) => s + u.n, 0);
const write = (p, bytes) => Gio.File.new_for_path(p).replace_contents(bytes, null, false, Gio.FileCreateFlags.NONE, null);
write(out + ".json", new TextEncoder().encode(JSON.stringify({ source: source === "again" ? JSON.parse(new TextDecoder().decode(read(input + ".json"))).source : source, features: L.FEATURES, classes: L.CLASS_NAMES, utterances })));
print(`${out}: ${utterances.length} utterances, ${n} frames (${(n / 360000).toFixed(2)} h)${skipped ? `, ${skipped} not aligned` : ""}`);
