// THE LISTENING CORPORA, read for tools/listen_fit.js (the profiles) and tools/listen_data.js (the network's training
// frames): WAV files, the Berlin emotional speech database's phone labels (lablaut/, START times, SAMPA) as the classes
// of engine/listen.js, and a cheap microphone in a room to hear a recording through.
import Gio from "gi://Gio";
const L = await import("../engine/listen.js");
const text = (p) => new TextDecoder().decode(Gio.File.new_for_path(p).load_contents(null)[1]);   // (the labels are ASCII; a syllable's umlaut is not read)

// a PCM16 WAV -> { samples, rate }
export function readWav(p) {
  const b = Gio.File.new_for_path(p).load_contents(null)[1], dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
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
// a SAMPA label -> [class] (a diphthong, or a vowel with the vocalised r: [first, second], split at its middle); null:
// a feature line (the phone before goes on); ["?"]: not used
const SAMPA = { m: "m", n: "n", N: "ŋ", NN: "ŋ", l: "l", L: "l", 4: "R", r: "R", R: "R", j: "j", f: "f", v: "v", B: "v", D: "v", V: "v", s: "s", z: "z", S: "ʃ", Z: "ʒ", C: "ç", x: "x", X: "x", G: "x", h: "h", H: "h", "?": "CL" };
const V1 = { a: "a", e: "e", E: "ɛ", i: "i", I: "ɪ", o: "o", O: "ɔ", u: "u", U: "ʊ", y: "y", Y: "ʏ", 2: "ø", 9: "œ", "@": "ə", 6: "ɐ" };
const DI = { aI: ["a", "ɪ"], aU: ["a", "ʊ"], OY: ["ɔ", "ʏ"], ao: ["a", "o"], aO: ["a", "ɔ"] };
function classOf(l) {
  if (!l || /^[+-]/.test(l)) return null;
  if (/^[.(]/.test(l)) return ["SIL"];
  const st = l.match(/^(!?)_?([ptkbdg])(asp)?$/);
  if (st) return st[1] || st[3] ? ["B" + st[2]] : ["CL"];   // (!t the release, tasp its breath; t _t the closure)
  if (SAMPA[l]) return [SAMPA[l]];
  if (V1[l]) return [V1[l]];
  if (DI[l]) return DI[l];
  if (l.length === 2 && V1[l[0]] && (l[1] === "6" || l[1] === "@")) return [V1[l[0]], V1[l[1]]];
  return ["?"];
}
// a cheap microphone in a room, the same for the same file every run (mulberry32 seeded by the name)
export function microphone(x, rate, name) {
  let seed = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const hp = 80 + 320 * rnd(), tilt = -.6 + 1.2 * rnd(), snr = 20 + 20 * rnd(), y = new Float32Array(x.length), a = Math.exp(-2 * Math.PI * hp / rate);
  let px = 0, py = 0, peak = 0;
  for (let i = 0; i < x.length; i++) { py = a * (py + x[i] - px); px = x[i]; y[i] = py; }
  for (let i = x.length - 1; i > 0; i--) y[i] += tilt * y[i - 1];
  for (const v of y) peak = Math.max(peak, Math.abs(v));
  const amp = peak * 10 ** (-snr / 20);
  for (let i = 0; i < y.length; i++) y[i] += (rnd() * 2 - 1) * amp;
  return y;
}
// an EmoDB recording's frames (all of them, the silence around kept) and the class of each one's middle (null: a phone
// with no class)
export function emodbFrames(corpus, name, mic) {
  const lab = text(`${corpus}/lablaut/${name}xx.lablaut`).split("\n#")[1].trim().split("\n").map((l) => l.trim().split(/\s+/));
  const segs = [];
  lab.forEach(([t, , l], k) => { const end = k + 1 < lab.length ? +lab[k + 1][0] : +t + .1, c = classOf(l); if (c) segs.push({ a: +t, b: end, c }); else if (segs.length) segs[segs.length - 1].b = end; });
  for (let k = segs.length - 1; k >= 0; k--) { const g = segs[k]; if (g.c.length === 2) { const mid = (g.a + g.b) / 2; segs.splice(k, 1, { a: g.a, b: mid, c: [g.c[0]] }, { a: mid, b: g.b, c: [g.c[1]] }); } }
  const w = readWav(`${corpus}/wav/${name}.wav`), F = L.frames(mic ? microphone(w.samples, w.rate, name) : w.samples, w.rate, { margin: 1e6 }), cls = [];
  for (let t = 0; t < F.n; t++) {
    const time = ((F.start + t) * L.HOP + L.FRAME / 2) / L.RATE, s = segs.find((x) => time >= x.a && time < x.b), c = s ? s.c[0] : "SIL";
    cls.push(c === "?" ? null : c);
  }
  return { F, cls };
}
