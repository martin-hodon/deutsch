// HOW WELL THE LISTENING RECOGNISES (engine/listen.js): real words of real voices -- cut from the sentences of the Berlin
// emotional speech database (its syllable labels, START times, and the ten sentences' texts), every word the German
// dictionary has -- recognised among all the German dictionary's words with profiles fitted WITHOUT those speakers
// (tools/listen_fit.js CORPUS 03,16 OUT.json). Words in running, acted speech (neutral, angry, sad ...) are harder than
// one word said alone; `content` counts the words of two syllables or more (the short function words are swallowed in a
// sentence). `mic`: each word through a cheap microphone in a room (a bass cut, a tilt, noise 30 dB under).
//
//   gjs -m tools/listen_eval.js CORPUS 03,16 OUT.json [NET.json] [mic] [net=1 ...]   (NET.json: the network judges the frames,
//                                                                                  trained with those speakers held out)
import Gio from "gi://Gio";
import GLib from "gi://GLib";
const TOP = GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace(/^file:\/\//, "")));
const read = (p) => Gio.File.new_for_path(p).load_contents(null)[1];
const text = (p) => new TextDecoder().decode(read(p));
globalThis.fetch = async (url) => { const b = read(url.startsWith("/") ? url : TOP + "/" + url.replace(/^\.?\//, "")); return { ok: true, text: async () => new TextDecoder().decode(b), json: async () => JSON.parse(new TextDecoder().decode(b)) }; };
const { loadProsody } = await import("../engine/speak.js");
const L = await import("../engine/listen.js");
const [corpus, speakers, profiles, ...rest] = ARGV, mic = rest.includes("mic"), net = rest.find((a) => a.endsWith(".json"));
if (!profiles) { print("usage: gjs -m tools/listen_eval.js CORPUS SPEAKERS PROFILES.json [NET.json] [mic]"); throw new Error("arguments"); }
await L.loadProfiles(profiles);
if (net) await L.loadNet(net);
for (const a of rest) { const [k, v] = a.split("="); if (v !== undefined && k in L.TUNING) L.TUNING[k] = +v; }   // (a cost tried: net=2)

// the ten sentences, a word's syllables after a colon (one when none)
const SENTENCES = { a01: "der Lappen:2 liegt auf dem Eisschrank:2", a02: "das will sie am Mittwoch:2 abgeben:3",
  a04: "heute:2 Abend:2 könnte:2 ich es ihm sagen:2", a05: "das schwarze:2 Blatt Papier:2 befindet:3 sich da oben:2 neben:2 dem Holzstück:2",
  a07: "in sieben:2 Stunden:2 wird es soweit:2 sein", b01: "was sind denn das für Tüten:2 die da unter:2 dem Tisch stehen:2",
  b02: "sie haben:2 es gerade:3 hochgetragen:4 und jetzt gehen:2 sie wieder:2 runter:2",
  b03: "an den Wochenenden:4 bin ich jetzt immer:2 nach Hause:2 gefahren:3 und habe:2 Agnes:2 besucht:2",
  b09: "ich will das eben:2 wegbringen:3 und dann mit Karl was trinken:2 gehen", b10: "die wird auf dem Platz sein wo wir sie immer:2 hinlegen:3" };
function readWav(p) {
  const b = read(p), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 12, rate = 16000, ch = 1, data = null;
  while (at + 8 <= b.length) {
    const id = String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]), size = dv.getUint32(at + 4, true);
    if (id === "fmt ") { ch = dv.getUint16(at + 10, true); rate = dv.getUint32(at + 12, true); }
    if (id === "data") { data = [at + 8, Math.min(size, b.length - at - 8)]; break; }
    at += 8 + size + (size & 1);
  }
  const n = Math.floor(data[1] / 2 / ch), s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = dv.getInt16(data[0] + i * 2 * ch, true) / 32768;
  return { samples: s, rate };
}
let seed = 5;
const noise = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1; };
function microphone(x, rate) {
  const y = new Float32Array(x.length), a = Math.exp(-2 * Math.PI * 250 / rate);
  let px = 0, py = 0, peak = 0;
  for (let i = 0; i < x.length; i++) { py = a * (py + x[i] - px); px = x[i]; y[i] = py; }
  for (let i = x.length - 1; i > 0; i--) y[i] -= .5 * y[i - 1];
  for (const v of y) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < y.length; i++) y[i] += noise() * peak * .0158;
  return y;
}

const rows = text(`${TOP}/de/dict.tsv`).trim().split("\n"), cols = rows[0].split("\t"), entries = rows.slice(1).map((r) => Object.fromEntries(r.split("\t").map((v, i) => [cols[i], v])));
const ipaOf = new Map(); for (const e of entries) if (e.ipa && !ipaOf.has(e.word)) ipaOf.set(e.word, e.ipa);
const lex = L.lexicon(entries, await loadProsody("de/rules/speech.txt"));
const want = speakers.split(","), stat = {}, t0 = Date.now();
const add = (k, rank) => { const s = (stat[k] ??= [0, 0, 0, 0]); s[0]++; if (rank === 0) s[1]++; if (rank >= 0 && rank < 5) s[2]++; if (rank >= 0) s[3]++; };
const files = Gio.File.new_for_path(`${corpus}/labsilb`).enumerate_children("standard::name", 0, null), names = [];
for (let info; (info = files.next_file(null)); ) names.push(info.get_name());
for (const f of names.sort()) {
  const name = f.slice(0, 7);
  if (!want.includes(name.slice(0, 2))) continue;
  const toks = text(`${corpus}/labsilb/${f}`).split("\n#")[1].trim().split("\n").map((l) => l.trim().split(/\s+/)).map(([t, , s]) => [+t, s ?? ""]);
  const syl = toks.map((x, k) => [...x, k]).filter(([, s]) => !["(", ".", ""].includes(s));
  const words = SENTENCES[name.slice(2, 5)].split(" ").map((w) => [w.split(":")[0], Number(w.split(":")[1] ?? 1)]);
  if (syl.length !== words.reduce((n, [, c]) => n + c, 0)) continue;   // (said otherwise than the text)
  const w = readWav(`${corpus}/wav/${name}.wav`);
  let k = 0;
  for (const [word, n] of words) {
    const a = syl[k][0], lastK = syl[k + n - 1][2], b = lastK + 1 < toks.length ? toks[lastK + 1][0] : syl[k + n - 1][0] + .3;
    k += n;
    if (!ipaOf.has(word)) continue;
    const cut = w.samples.slice(Math.round(a * w.rate), Math.round(b * w.rate));
    const res = L.recognizeAll(mic ? microphone(cut, w.rate) : cut, w.rate, lex, { top: 10 });
    const rank = res.findIndex((r) => r.i.some((i) => entries[i].word === word));
    const long = ipaOf.get(word).replace(/[ːˑ̯]/g, "").match(/[aeiouyɛɪɔʊøœɐəæɑɒʏ]+/g)?.length >= 2;
    add("all", rank); if (long) { add("content", rank); add("content " + name.slice(0, 2), rank); }
  }
}
for (const [k, [n, a, b, c]] of Object.entries(stat)) print(`${k}: ${n} words, top-1 ${(100 * a / n).toFixed(0)}%, top-5 ${(100 * b / n).toFixed(0)}%, top-10 ${(100 * c / n).toFixed(0)}%`);
print(`${((Date.now() - t0) / (stat.all?.[0] || 1)).toFixed(0)} ms a word, ${lex.list.length} words in the lexicon${mic ? ", through a microphone" : ""}`);
