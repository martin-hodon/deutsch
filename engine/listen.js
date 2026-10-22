// LISTENING: a single spoken word recognised among a language's dictionary words, from the words' IPA alone -- no
// templates, no speech service. What the microphone heard is described frame by frame (10 ms) in RELATIVE terms that
// any voice keeps: how loud against the word's peak and against its own syllable, how periodic (the voice on), how the
// energy is spread over the spectrum (the shape, not the level) and how that shape is changing. Every word's IPA
// (speak.js parse) becomes a chain of speech-sound CLASSES -- German's sounds, the measured ones; another language's
// sounds read as the nearest -- with a stop as its closure and its release, each with a least length; the recording is
// aligned to every word's chain (Viterbi: a sound lasts as long as the frames fit it, a little a frame beyond its least
// length; a sound may be left out at a price), and the words whose chain explains the frames best are the answer. Two
// more checks: the SYLLABLES counted in the recording (the peaks of the voiced loudness) against the word's -- each
// syllable too many or too few costs --, and a commoner word (FREQ) a little likelier.
//
//   await loadProfiles("engine/listen.json")                (once: the classes' measured profiles)
//   await loadNet("engine/listen_net.json")                 (the network: when loaded, it judges the frames)
//   lexicon(entries, prosody) -> lex                        (entries: the dictionary's, each { word, pos, ipa, freq })
//   recognizeAll(samples, rate, lex, { top: 5 }) -> [{ i (entry rows), word, pos, cost, score }]   score: a share 0..1
//   await record({ maxMs: 3500, silenceMs: 700, onLevel }) -> { samples, rate } | null   (the microphone, push to talk)
//   voiceSample(ipa, prosody) -> sample | null; adaptVoice([sample...])   (the word just heard, confirmed: learning the voice)
//   forceAlign(frames(...), ipa, prosody) -> [class index a frame] | null   (a known text lined up: labels for training)
//
// The profiles (engine/listen.json) are measured by tools/listen_fit.js on a labelled corpus of real voices -- the
// Berlin emotional speech database (10 speakers, 5 men, 5 women, phone labels) --, each recording also heard through a
// random cheap microphone (a bass cut, a tilt, noise) so that a laptop's microphone is no surprise. How well it does:
// tools/listen_eval.js (words cut from the corpus, two speakers left out of the fit; DESIGN.md "Listening").
// The NETWORK (engine/listen_net.json, 500 KB) judges the frames instead when it is loaded: a small one trained from scratch
// (tools/listen_train.py) on the corpus and on VoxForge's people reading German at home into their own microphones (65 h
// with the microphone copies), its frames labelled by forceAlign; it reads FEATURES the profiles do not (MIXTURE_DIMS).
import { parse, SOUNDS, PROSODY } from "./speak.js";

export const RATE = 16000, FRAME = 400, HOP = 160, NFFT = 512, BANDS = 10, FINE = 8;
// a frame's features: eRel (dB under the word's peak), eLoc (dB under the loudest frame within 120 ms -- its syllable's),
// voi (0..1, how periodic), dE (dB a frame, the loudness's change over 40 ms -- a release is a jump), b0..b9 (the
// spectrum's shape: BANDS mel bands 100-7500 Hz in dB, less their mean), d0..d9 (the shape's change over 40 ms); then what
// tells consonants apart in a frame, for the network: lo (dB of 60-400 Hz against the whole: the voice under a closure or a
// hiss -- z, b, v), hi (dB of 2-7.5 kHz against the whole), hc, hs (the centre and the spread of 2-7.5 kHz in kHz: where
// a hiss sits -- s high, ʃ lower, f flat), on (dB, the steepest rise between the frame's 2.5 ms pieces of the sound's
// change -- the highs: a hum or a voice's pulse is no burst --, none counted under 50 dB below the word's peak), f0..f7
// (FINE mel bands 300-3500 Hz in dB, less their mean: the formants in detail -- a vowel bending into m, n or ŋ)
export const FEATURES = ["eRel", "eLoc", "voi", "dE", ...Array.from({ length: BANDS }, (_, k) => "b" + k), ...Array.from({ length: BANDS }, (_, k) => "d" + k),
  "lo", "hi", "hc", "hs", "on", ...Array.from({ length: FINE }, (_, k) => "f" + k)];
export const DIMS = FEATURES.length;
export const MIXTURE_DIMS = 4 + 2 * BANDS;   // (the profiles judge the first ones: the features they were measured on)
const EXTRA = DIMS - MIXTURE_DIMS, PIECE = 40, PIECES = FRAME / PIECE;

// ---- the signal ----------------------------------------------------------------------------------------------------------
const hann = Float32Array.from({ length: FRAME }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / (FRAME - 1)));
const melOf = (f) => 2595 * Math.log10(1 + f / 700), hzOf = (m) => 700 * (10 ** (m / 2595) - 1);
const melBands = (count, from, to) => Array.from({ length: count }, (_, m) => {
  const lo = melOf(from), hi = melOf(to), at = (j) => Math.round(hzOf(lo + (hi - lo) * j / (count + 1)) * NFFT / RATE);
  return { a: at(m), b: Math.max(at(m) + 1, at(m + 1)), c: Math.max(at(m) + 2, at(m + 2)) };
});
const MEL = melBands(BANDS, 100, 7500), MEL_FINE = melBands(FINE, 300, 3500);
const BIN = (hz) => Math.round(hz * NFFT / RATE);
// dB of each triangular band of a power spectrum, less their mean, into out[at..]
function bandShape(bands, pw, out, at) {
  let mb = 0;
  bands.forEach(({ a, b, c }, m) => {
    let p = 1e-12;
    for (let k = a; k <= c; k++) p += (k < b ? (k - a + 1) / (b - a + 1) : (c - k + 1) / (c - b + 1)) * pw[k];
    out[at + m] = 10 * Math.log10(p); mb += out[at + m];
  });
  for (let m = 0; m < bands.length; m++) out[at + m] -= mb / bands.length;
}
// an in-place radix-2 FFT (re, im of length NFFT)
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, ai = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k + len / 2] = re[i + k] - ar; im[i + k + len / 2] = im[i + k] - ai; re[i + k] += ar; im[i + k] += ai;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
// samples at any rate -> 16 kHz: a Hann-windowed sinc low pass under the lower of the two Nyquist frequencies (the
// corpus was made so; a plain average lets the hiss of s, ʃ, f above 8 kHz fold down onto the sounds below)
export function resample(samples, rate) {
  if (rate === RATE) return samples;
  const ratio = rate / RATE, c = .46 * Math.min(1, 1 / ratio), W = Math.ceil(4 / c), n = Math.floor(samples.length / ratio), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i * ratio, j0 = Math.max(0, Math.ceil(t - W)), j1 = Math.min(samples.length - 1, Math.floor(t + W));
    let s = 0, z = 0;
    for (let j = j0; j <= j1; j++) {
      const d = j - t, h = (d === 0 ? 1 : Math.sin(2 * Math.PI * c * d) / (2 * Math.PI * c * d)) * (.5 + .5 * Math.cos(Math.PI * d / W));
      s += samples[j] * h; z += h;
    }
    out[i] = s / z;
  }
  return out;
}
// how periodic an 8 kHz frame (`y`, n samples) is: the normalised autocorrelation's best peak at 70-400 Hz
function periodicity(y, n) {
  let best = 0;
  for (let l = 20; l <= 114; l++) {
    let xy = 0, xx = 0, yy = 0;
    for (let i = 0; i + l < n; i++) { xy += y[i] * y[i + l]; xx += y[i] * y[i]; yy += y[i + l] * y[i + l]; }
    const r = xy / Math.sqrt(xx * yy + 1e-12);
    if (r > best) best = r;
  }
  return best;
}
// the word's frames, described (FEATURES): { n, start (its first frame in the recording), syl (the syllables counted),
// x: Float32Array[n * DIMS] }; `margin` frames of what is around the word kept on either side (its silence)
export function frames(samples, rate = RATE, { margin = 8 } = {}) {
  const s = resample(samples, rate), all = Math.max(0, Math.floor((s.length - FRAME) / HOP) + 1);
  const e = new Float32Array(all), band = new Float32Array(all * BANDS), voi = new Float32Array(all), extra = new Float32Array(all * EXTRA);
  const re = new Float32Array(NFFT), im = new Float32Array(NFFT), y = new Float32Array(FRAME / 2), pw = new Float32Array(NFFT / 2 + 1), piece = new Float32Array(all * PIECES);
  for (let f = 0; f < all; f++) {
    re.fill(0); im.fill(0);
    let en = 0, mean = 0;
    for (let i = 0; i < FRAME; i++) mean += s[f * HOP + i];
    mean /= FRAME;
    let pe = 0;
    for (let i = 0; i < FRAME; i++) {
      const x = s[f * HOP + i] - mean, dx = s[f * HOP + i] - (s[f * HOP + i - 1] ?? s[f * HOP + i]); re[i] = x * hann[i]; en += x * x; pe += dx * dx;
      if (i % PIECE === PIECE - 1) { piece[f * PIECES + (i - PIECE + 1) / PIECE] = 10 * Math.log10(pe / PIECE + 1e-10); pe = 0; }
    }
    e[f] = 10 * Math.log10(en / FRAME + 1e-10);
    fft(re, im);
    for (let k = 0; k <= NFFT / 2; k++) pw[k] = re[k] * re[k] + im[k] * im[k];
    bandShape(MEL, pw, band, f * BANDS);
    // the extra features (EXTRA): lo, hi, hc, hs, (on: below, the word's peak known), the fine bands
    const ex = f * EXTRA, sum = (a, b, g = () => 1) => { let v = 0; for (let k = BIN(a); k <= BIN(b); k++) v += g(k) * pw[k]; return v; };
    const whole = sum(60, 7500) + 1e-12, high = sum(2000, 7500) + 1e-12, hz = (k) => k * RATE / NFFT / 1000;
    extra[ex] = 10 * Math.log10(sum(60, 400) / whole + 1e-6); extra[ex + 1] = 10 * Math.log10(high / whole + 1e-6);
    extra[ex + 2] = sum(2000, 7500, hz) / high; extra[ex + 3] = Math.sqrt(Math.max(0, sum(2000, 7500, (k) => hz(k) ** 2) / high - extra[ex + 2] ** 2));
    bandShape(MEL_FINE, pw, extra, ex + 5);
    for (let i = 0; i < FRAME / 2; i++) { const j = f * HOP + 2 * i; y[i] = .25 * (s[j - 1] ?? s[j]) + .5 * s[j] + .25 * s[j + 1] - mean; }   // (8 kHz: a [1 2 1] low pass, every other sample)
    voi[f] = periodicity(y, FRAME / 2);
  }
  // the word: from the first frame within 35 dB of the peak to the last, `margin` frames either side
  let peak = -Infinity; for (const v of e) peak = Math.max(peak, v);
  let a = 0, b = all - 1;
  while (a < b && e[a] < peak - 35) a++;
  while (b > a && e[b] < peak - 35) b--;
  a = Math.max(0, a - margin); b = Math.min(all - 1, b + margin);
  const n = Math.max(0, b - a + 1), x = new Float32Array(n * DIMS);
  for (let t = 0; t < n; t++) {
    const f = a + t, fa = Math.max(0, f - 2), fb = Math.min(all - 1, f + 2);
    let loc = -Infinity; for (let g = Math.max(0, f - 12); g <= Math.min(all - 1, f + 12); g++) loc = Math.max(loc, e[g]);
    const row = x.subarray(t * DIMS, (t + 1) * DIMS);
    row[0] = e[f] - peak; row[1] = e[f] - loc; row[2] = voi[f]; row[3] = (e[fb] - e[fa]) / 2;
    for (let m = 0; m < BANDS; m++) { row[4 + m] = band[f * BANDS + m]; row[4 + BANDS + m] = (band[fb * BANDS + m] - band[fa * BANDS + m]) / 2; }
    row.set(extra.subarray(f * EXTRA, (f + 1) * EXTRA), MIXTURE_DIMS);
    let rise = 0; const level = (i) => Math.max(peak - 50, piece[f * PIECES + i]);
    for (let i = 1; i < PIECES; i++) rise = Math.max(rise, level(i) - level(i - 1));
    row[MIXTURE_DIMS + 4] = rise;
  }
  // the SYLLABLES: the peaks of the voiced loudness (smoothed over 30 ms) within 25 dB of the word's peak, each standing
  // 3 dB above the dip toward the one before, at least 70 ms apart
  const vl = [];
  for (let f = a; f <= b; f++) { let v = 0; for (let g = f - 1; g <= f + 1; g++) { const gg = Math.min(b, Math.max(a, g)); v += voi[gg] > .5 ? e[gg] : peak - 60; } vl.push(v / 3); }
  const nuclei = [];
  for (let t = 1; t < vl.length - 1; t++) {
    if (!(vl[t] >= vl[t - 1] && vl[t] > vl[t + 1] && vl[t] > peak - 25)) continue;
    const last = nuclei[nuclei.length - 1];
    if (last !== undefined) {
      let dip = Infinity; for (let k = last; k <= t; k++) dip = Math.min(dip, vl[k]);
      if (t - last < 7 || Math.min(vl[last], vl[t]) - dip < 3) { if (vl[t] > vl[last]) nuclei[nuclei.length - 1] = t; continue; }
    }
    nuclei.push(t);
  }
  return { n, start: a, syl: nuclei.length, x };
}

// ---- the sound classes ----------------------------------------------------------------------------------------------------
// one class a speech sound of German (the measured voices'): SIL silence, CL a stop's closure (and ʔ), B* a stop's
// release (Bp Bb Bt Bd Bk Bg), the vowels, the consonants (R: any r)
export const VOWELS = ["i", "ɪ", "e", "ɛ", "a", "o", "ɔ", "u", "ʊ", "y", "ʏ", "ø", "œ", "ə", "ɐ"];
export const CLASS_NAMES = ["SIL", "CL", "Bp", "Bb", "Bt", "Bd", "Bk", "Bg", ...VOWELS, "m", "n", "ŋ", "l", "R", "j", "f", "v", "s", "z", "ʃ", "ʒ", "ç", "x", "h"];
// a class's broad group: what a class with few measured frames borrows from (tools/listen_fit.js), and its least length
export const GROUP = { SIL: "SIL", CL: "CL", Bp: "B", Bb: "B", Bt: "B", Bd: "B", Bk: "B", Bg: "B", m: "NAS", n: "NAS", "ŋ": "NAS", l: "LIQ", R: "LIQ", j: "LIQ", f: "FRW", v: "FRW", ç: "FRW", x: "FRW", h: "FRW", s: "SIB", z: "SIB", "ʃ": "SIB", "ʒ": "SIB" };
for (const v of VOWELS) GROUP[v] = "V";
// a vowel (its F1, F2: speak.js's targets) -> the nearest German vowel (F2 counted at a third)
export const vowelClass = ([f1, f2]) => VOWELS.reduce((best, v) => { const [g1, g2] = SOUNDS[v].f, d = (f1 - g1) ** 2 + ((f2 - g2) / 3) ** 2; return d < best[1] ? [v, d] : best; }, [null, Infinity])[0];
const CONS = { m: "m", "ɱ": "m", n: "n", "ɲ": "n", "ŋ": "ŋ", l: "l", "ʎ": "l", "ʁ": "R", "ɹ": "R", "ɻ": "R", "ɾ": "R", r: "R", j: "j", "ʝ": "j", "ɥ": "j",
  f: "f", "θ": "f", v: "v", "β": "v", "ð": "v", s: "s", z: "z", "ʃ": "ʃ", "ʂ": "ʃ", "ɕ": "ʃ", "ʒ": "ʒ", "ʐ": "ʒ", "ʑ": "ʒ", "ç": "ç", x: "x", "ɣ": "x", h: "h", "ʔ": "CL",
  p: "Bp", b: "Bb", t: "Bt", d: "Bd", k: "Bk", "ɡ": "Bg" };
// a sound of speak.js's table (its symbol) -> its class (w: a short u); null: none
export function classOfSound(sym) {
  const S = SOUNDS[sym];
  if (!S) return null;
  if (S.type === "vowel") return vowelClass(S.f);
  if (sym === "w") return "u";
  return CONS[sym] ?? null;
}

// the classes' profiles: each a mixture of Gaussians over the features -- [{ w (weight), m (mean), ic (the inverse
// covariance, MIXTURE_DIMS x MIXTURE_DIMS), ld (its log determinant) }]; engine/listen.json keeps ic's upper triangle
let PROFILES = null;
export function setProfiles(json) {
  MEASURED = null;
  PROFILES = Object.fromEntries(Object.entries(json.classes).map(([c, comps]) => [c, comps.map((g) => {
    const D = MIXTURE_DIMS, ic = new Float64Array(D * D);
    let k = 0;
    for (let i = 0; i < D; i++) for (let j = i; j < D; j++) { ic[i * D + j] = ic[j * D + i] = g.ic[k++]; }
    return { w: g.w, m: Float64Array.from(g.m), ic, ld: g.ld };
  })]));
}
export async function loadProfiles(url) { if (!PROFILES) setProfiles(await (await fetch(url)).json()); }
// the costs (tools/listen_eval.js tuned them on speakers left out of the fit): `loop` a frame lingered in a sound past its
// least length (a vowel less), `skip` a sound left out (a vowel more, h ʔ ʁ ə ɐ little), `syl` a syllable too many or too
// few, `prior` a FREQ level less common, `clip` the most a feature's deviation counts, `net` the weight of the network's
// costs (with it: net .2 and syl 4 -- the network alone is too sure of itself; at .4, 46 % of the corpus words right first,
// at .2 50 %, and of a learner's 19 words said into the 🎤 14 in the first five, not 13; .3 the same, .14 worse)
export const TUNING = { net: .2, loop: .4, loopVowel: .15, skip: 12, skipVowel: 24, skipWeak: 1.5, syl: 4, prior: 3, clip: 30 };

// ---- a word's chain -------------------------------------------------------------------------------------------------------
// a word's IPA -> [{ cls, min (frames), skip (the cost of leaving it out), syl (its share of a syllable) }], silence
// (free to skip) at either end and at a space
export function chain(ipa, P = PROSODY) {
  const T = TUNING, out = [{ cls: "SIL", min: 1, skip: 0 }];
  for (const x of parse(ipa, P)) {
    if (x.gap) { out.push({ cls: "SIL", min: 1, skip: 0 }); continue; }
    const S = SOUNDS[x.s], c = classOfSound(x.s);
    if (!c) continue;
    if (S.type === "vowel") {
      const red = x.s === "ə" || x.s === "ɐ", min = red ? 1 : x.long ? 5 : x.stress ? 3 : 2, skip = red || x.glide ? T.skipWeak * 2 : T.skipVowel;
      if (S.to) out.push({ cls: c, min: Math.ceil(min / 2) + 1, skip, syl: 1 }, { cls: vowelClass(S.to), min: Math.ceil(min / 2), skip: T.skipWeak * 2 });   // (a diphthong: its two ends)
      else out.push({ cls: c, min, skip, syl: x.glide ? 0 : red ? .5 : 1 });
    } else if (S.type === "stop") out.push({ cls: "CL", min: 2, skip: T.skipWeak }, { cls: c, min: x.asp ? 3 : 1, skip: T.skip });
    else if (x.s === "j" || x.s === "w" || x.s === "ɥ") out.push({ cls: c, min: 1, skip: T.skip });   // (a glide: short)
    else {
      const weak = x.s === "h" || x.s === "ʁ" || x.s === "ʔ";
      out.push({ cls: c, min: GROUP[c] === "SIB" ? 3 : GROUP[c] === "NAS" ? 2 : 1, skip: weak ? T.skipWeak : T.skip });
    }
  }
  out.push({ cls: "SIL", min: 1, skip: 0 });
  return out;
}

// ---- the lexicon and the alignment -------------------------------------------------------------------------------------------
// every entry's chain compiled to NODES (a sound repeated for its least length; the last one may repeat): each node's class,
// whether it is its sound's last, its cost a frame repeated; a sound's first and last node and its skip cost. Entries
// with the same IPA share one (their rows in `i`).
const CLASS_INDEX = Object.fromEntries(CLASS_NAMES.map((c, k) => [c, k]));
export function lexicon(entries, P = PROSODY) {
  const byIpa = new Map();
  entries.forEach((e, i) => {
    if (!e.ipa) return;
    const freq = Number(e.freq) || 3, had = byIpa.get(e.ipa);
    if (had) { had.i.push(i); had.freq = Math.min(had.freq, freq); return; }
    const w = compile(chain(e.ipa, P));
    if (w) byIpa.set(e.ipa, Object.assign(w, { i: [i], word: e.word, pos: e.pos, freq }));
  });
  return { list: [...byIpa.values()] };
}
function compile(states) {
  if (states.length < 3) return null;
  const T = TUNING, cls = [], last = [], loop = [], first = [], end = [], skip = [];
  for (const s of states) {
    first.push(cls.length);
    const l = s.cls === "SIL" ? 0 : GROUP[s.cls] === "V" ? T.loopVowel : T.loop;
    for (let k = 0; k < s.min; k++) { cls.push(CLASS_INDEX[s.cls]); last.push(k === s.min - 1 ? 1 : 0); loop.push(l); }
    end.push(cls.length - 1); skip.push(s.skip);
  }
  return { syl: states.reduce((n, s) => n + (s.syl ?? 0), 0),
    cls: Uint8Array.from(cls), last: Uint8Array.from(last), loop: Float32Array.from(loop), first: Int16Array.from(first), end: Int16Array.from(end), skip: Float32Array.from(skip) };
}
// a component's log likelihood of the frame at x[at..] (its squared distance clipped); d: room for the difference
function logOf(g, x, at, d, clip) {
  const D = MIXTURE_DIMS;
  for (let i = 0; i < D; i++) d[i] = x[at + i] - g.m[i];
  let q = 0;
  for (let i = 0; i < D; i++) { let s = 0; const row = i * D; for (let j = 0; j < D; j++) s += g.ic[row + j] * d[j]; q += d[i] * s; }
  return Math.log(g.w) - .5 * Math.min(clip, q) - .5 * g.ld;
}
// the cost of every frame under every class: the network's when it is loaded, else -log of the class's mixture
export const emissions = (F) => (NET ? netEmissions(F) : mixtureEmissions(F));   // (F: frames(); -> Float32Array[F.n x classes])
function mixtureEmissions(F) {
  const C = CLASS_NAMES.length, E = new Float32Array(F.n * C), d = new Float64Array(MIXTURE_DIMS), clip = TUNING.clip * 2;
  for (let t = 0; t < F.n; t++) {
    for (let c = 0; c < C; c++) {
      let mx = -Infinity;
      const ls = PROFILES[CLASS_NAMES[c]].map((g) => { const l = logOf(g, F.x, t * DIMS, d, clip); if (l > mx) mx = l; return l; });
      let z = 0; for (const l of ls) z += Math.exp(l - mx);
      E[t * C + c] = -(mx + Math.log(z));
    }
  }
  return E;
}
// the best alignment of the frames to one word's nodes (Viterbi): a node is entered from the one before it, the last of a
// sound repeats at its loop cost, a sound's first node is reached from the end of the sound before -- or of the one or two
// before that, the skipped sounds paid for -- and at the first frame from the start. `path` (an array, asked for): filled
// with each frame's class on the best alignment
function align(w, E, n, path = null) {
  const N = w.cls.length, S = w.first.length, C = CLASS_NAMES.length, INF = 1e30;
  let prev = new Float64Array(N).fill(INF), cur = new Float64Array(N);
  const stateOf = new Int16Array(N), back = path ? new Int32Array(n * N) : null;
  for (let k = 0; k < S; k++) for (let j = w.first[k]; j <= w.end[k]; j++) stateOf[j] = k;
  for (let t = 0; t < n; t++) {
    const row = t * C;
    for (let j = 0; j < N; j++) {
      const k = stateOf[j];
      let b = w.last[j] ? prev[j] + w.loop[j] : INF, from = j;
      if (j > w.first[k]) { if (prev[j - 1] < b) { b = prev[j - 1]; from = j - 1; } }
      else {
        let cost = 0;
        for (let m = k - 1; m >= k - 3; m--) {
          const c = m < 0 ? (t === 0 ? cost : INF) : prev[w.end[m]] + cost;
          if (c < b) { b = c; from = m < 0 ? -1 : w.end[m]; }
          if (m < 0) break;
          cost += w.skip[m];
        }
      }
      cur[j] = b + E[row + w.cls[j]];
      if (back) back[t * N + j] = from;
    }
    [prev, cur] = [cur, prev];
  }
  let best = INF, cost = 0, j = -1;   // (the end: the last sound, or one of the two before it with the rest skipped)
  for (let m = S - 1; m >= S - 3 && m >= 0; m--) { if (prev[w.end[m]] + cost < best) { best = prev[w.end[m]] + cost; j = w.end[m]; } cost += w.skip[m]; }
  if (back) for (let t = n - 1; t >= 0 && j >= 0; t--) { path[t] = w.cls[j]; j = back[t * N + j]; }
  return best;
}
let HEARD = null;   // (the last word heard: its frames, for voiceSample)
export function recognizeAll(samples, rate, lex, { top = 5 } = {}) {
  const F = (HEARD = frames(samples, rate));
  if (F.n < 6) return [];
  const E = emissions(F), T = TUNING;
  const scored = lex.list.map((w) => ({ w, cost: align(w, E, F.n) + T.prior * (w.freq - 1) + T.syl * Math.max(0, Math.abs(w.syl - F.syl) - .5) }));
  scored.sort((a, b) => a.cost - b.cost);
  // the score: the word's share among the 30 nearest (each weighted e^-(its cost - the best's) / 1.4 -- fitted on the left-out
  // speakers so a share says how often the word is right: words shown 40-60 % were right 50 % of the time, 80-100 % 96 %)
  const near = scored.slice(0, 30), weight = (x) => Math.exp(-(x.cost - near[0].cost) / 1.4), z = near.reduce((s, x) => s + weight(x), 0);
  return scored.slice(0, top).map((x) => ({ i: x.w.i, word: x.w.word, pos: x.w.pos, cost: x.cost / F.n, score: weight(x) / z }));
}

// ---- the network (engine/listen_net.json, tools/listen_train.py) ----------------------------------------------------------
// A frame's classes judged from a window of frames around it (NET.context: 0.2 s) -- the glide into a vowel, the lips
// closing, a burst, which one frame alone does not show. Two hidden layers (ReLU, int8 weights with a scale a unit), a
// softmax; the cost of a class: -(log its posterior - log its prior) x TUNING.net (a likelihood, as the mixtures give).
let NET = null;
const B64 = Object.fromEntries([..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"].map((c, k) => [c, k]));
function int8s(b64) {
  const s = b64.replace(/=+$/, ""), out = new Int8Array(Math.floor(s.length * 3 / 4));
  for (let i = 0, j = 0; i < s.length; i += 4) {
    const n = (B64[s[i]] << 18) | (B64[s[i + 1]] << 12) | ((B64[s[i + 2]] ?? 0) << 6) | (B64[s[i + 3]] ?? 0);
    for (const v of [n >> 16, n >> 8, n]) if (j < out.length) out[j++] = (v & 255) << 24 >> 24;
  }
  return out;
}
export function setNet(json) {
  NET = json && { context: json.context, d: json.mean.length, mean: Float32Array.from(json.mean), std: Float32Array.from(json.std),
    logPrior: Float32Array.from(json.prior, Math.log), at: CLASS_NAMES.map((c) => json.classes.indexOf(c)),
    layers: json.layers.map((l) => ({ in: l.in, out: l.out, w: int8s(l.w), scale: Float32Array.from(l.scale), b: Float32Array.from(l.b) })) };
}
export async function loadNet(url) { if (!NET) setNet(await (await fetch(url)).json()); }
function netEmissions(F) {
  const { context, d, mean, std, logPrior, at, layers } = NET, C = CLASS_NAMES.length, n = F.n, E = new Float32Array(n * C);
  const z = new Float32Array(n * d);   // (the first d features of each frame: the ones it was trained on)
  for (let t = 0; t < n; t++) for (let i = 0; i < d; i++) z[t * d + i] = (F.x[t * DIMS + i] - mean[i]) / std[i];
  const acts = [new Float32Array(layers[0].in), ...layers.map((l) => new Float32Array(l.out))];
  for (let t = 0; t < n; t++) {
    context.forEach((o, k) => { const u = Math.min(n - 1, Math.max(0, t + o)); acts[0].set(z.subarray(u * d, (u + 1) * d), k * d); });
    layers.forEach((l, k) => {
      const a = acts[k], y = acts[k + 1], last = k === layers.length - 1;
      for (let r = 0; r < l.out; r++) {
        let s = 0; const row = r * l.in;
        for (let j = 0; j < l.in; j++) s += l.w[row + j] * a[j];
        s = s * l.scale[r] + l.b[r];
        y[r] = last || s > 0 ? s : 0;
      }
    });
    const y = acts[layers.length];
    let mx = -Infinity; for (const v of y) mx = Math.max(mx, v);
    let lz = 0; for (const v of y) lz += Math.exp(v - mx);
    lz = mx + Math.log(lz);
    for (let c = 0; c < C; c++) E[t * C + c] = at[c] < 0 ? 50 : -TUNING.net * (y[at[c]] - lz - logPrior[at[c]]);
  }
  return E;
}

// ---- the voice: the profiles moved toward the one speaking ------------------------------------------------------------------
// The corpus's ten voices are not the learner's, nor its studio their room: on a learner's own recordings the right word
// fell to the thousands (DESIGN.md "Listening"). A word heard and then confirmed -- the one opened after the 🎤 -- is a
// SAMPLE: its frames and, aligned to the word's chain, each frame's class. adaptVoice(samples) moves the measured profiles
// toward them: first one shift for every class (the mean of each frame less its class's nearest component: the room, the
// microphone, the voice's colour), then each component's mean toward its own frames, VOICE_PRIOR frames of the corpus
// weighing against them (a sound said often moves far, one heard once a little). With the network loaded the profiles do
// not judge the frames and nothing here moves it (adaptVoice: 0) -- the samples are kept for a way that does (DESIGN.md).
export const VOICE_PRIOR = 20;
let MEASURED = null;   // (the profiles as measured, before any voice)
// the last word heard as a sample of the word whose IPA is given: { x: [frames' features, rounded to 0.1], cls: [class index a frame] }
export function voiceSample(ipa, P = PROSODY) {
  const path = HEARD && forceAlign(HEARD, ipa, P);
  return path && { x: Array.from(HEARD.x, (v) => Math.round(v * 10) / 10), cls: path };
}
// frames (frames()) lined up with a known text's IPA (words, spaces between): each frame's class index -- or null
export function forceAlign(F, ipa, P = PROSODY) {
  const w = F.n >= 6 && compile(chain(ipa, P));
  if (!w) return null;
  const path = new Array(F.n).fill(0);
  return align(w, emissions(F), F.n, path) < 1e29 ? path : null;
}
export function adaptVoice(samples) {
  if (NET) return 0;
  MEASURED ??= PROFILES;
  const D = MIXTURE_DIMS, d = new Float64Array(D), clip = TUNING.clip * 2, frames = [];
  for (const s of samples) s.cls.forEach((c, t) => frames.push([Float64Array.from(s.x.slice(t * DIMS, t * DIMS + D)), CLASS_NAMES[c]]));
  if (!frames.length) { PROFILES = MEASURED; return 0; }
  const shift = new Float64Array(D);
  for (const [x, c] of frames) {
    const comps = MEASURED[c], ls = comps.map((g) => logOf(g, x, 0, d, clip)), g = comps[ls.indexOf(Math.max(...ls))];
    for (let i = 0; i < D; i++) shift[i] += (x[i] - g.m[i]) / frames.length;
  }
  const moved = Object.fromEntries(Object.entries(MEASURED).map(([c, comps]) => [c, comps.map((g) => ({ ...g, m: g.m.map((v, i) => v + shift[i]) }))]));
  const acc = Object.fromEntries(Object.entries(moved).map(([c, comps]) => [c, comps.map(() => ({ n: 0, s: new Float64Array(D) }))]));
  for (const [x, c] of frames) {
    const ls = moved[c].map((g) => logOf(g, x, 0, d, clip)), mx = Math.max(...ls), p = ls.map((l) => Math.exp(l - mx)), z = p.reduce((a, b) => a + b, 0);
    p.forEach((v, k) => { const a = acc[c][k]; a.n += v / z; for (let i = 0; i < D; i++) a.s[i] += v / z * x[i]; });
  }
  for (const [c, comps] of Object.entries(moved)) comps.forEach((g, k) => { const a = acc[c][k]; g.m = g.m.map((v, i) => (VOICE_PRIOR * v + a.s[i]) / (VOICE_PRIOR + a.n)); });
  PROFILES = moved;
  return samples.length;
}

// ---- the microphone (the page only): push to talk, stopped by silence after speech or by the time limit ------------------
// The browser's own noise suppression, gain control and echo cancelling are off: they clip a word's quiet start and wipe
// the hiss of s, z, ʃ, f (the profiles were measured on plain recordings). Without them a microphone's own start comes
// through -- a laptop's opened at full scale and drifting back over 0.8 s, which counted as speech and ended the
// recording before the word: so a high pass at 60 Hz (the drift, a hum) and the first SETTLE ms not heard. Speech: two
// chunks in a row (85 ms: a click in the room is shorter, a vowel longer) 10 times (20 dB) above the quietest stretch heard
// so far (the room), at the least 0.003 -- or loud outright.
const SETTLE = 250;
export async function record({ maxMs = 3500, silenceMs = 700, onLevel = null } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const ctx = new AudioContext(), src = ctx.createMediaStreamSource(stream), node = ctx.createScriptProcessor(2048, 1, 1);
  const high = new BiquadFilterNode(ctx, { type: "highpass", frequency: 60, Q: Math.SQRT1_2 });
  const chunks = [];
  let spoke = false, quiet = 0, room = Infinity, heard = 0, loud = 0, done;
  const finished = new Promise((r) => (done = r));
  const t0 = performance.now();
  node.onaudioprocess = (ev) => {
    const d = ev.inputBuffer.getChannelData(0);
    heard += d.length;
    if (performance.now() - t0 > maxMs) done();
    if (heard / ctx.sampleRate * 1000 < SETTLE) return;
    chunks.push(new Float32Array(d));
    let e = 0; for (const x of d) e += x * x;
    const level = Math.sqrt(e / d.length);
    onLevel?.(level);
    if (level > 0) room = Math.min(room, level);
    loud = level > .02 || level > Math.max(.003, 10 * room) ? loud + 1 : 0;
    if (loud >= 2) { spoke = true; quiet = 0; } else if (spoke && !loud) quiet += d.length / ctx.sampleRate * 1000;
    if (spoke && quiet > silenceMs) done();
  };
  src.connect(high); high.connect(node); node.connect(ctx.destination);
  await finished;
  node.disconnect(); high.disconnect(); src.disconnect(); stream.getTracks().forEach((t) => t.stop()); ctx.close();
  if (!spoke) return null;
  const n = chunks.reduce((s, c) => s + c.length, 0), samples = new Float32Array(n);
  let at = 0; for (const c of chunks) { samples.set(c, at); at += c.length; }
  return { samples, rate: ctx.sampleRate };
}
