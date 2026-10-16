// LISTENING: a single spoken word recognised among a language's dictionary words with no model to download -- the
// synthesizer (speak.js) says every word once, offline (tools/listen_templates.js, run with gjs), and what it said is
// kept as a compact FEATURE stream (<lang>/listen.json + listen.bin): 12 mel-cepstral coefficients a frame, 10 ms
// apart, normalised per word and quantised to a byte. What the microphone hears is turned into the same features and
// matched by dynamic time warping against every template of a plausible length; the nearest words are the answer, with
// a margin as confidence. An unknown word lands on something near -- or on nothing when every distance is poor.
//
//   features(samples, rate) -> Int8Array[frames * DIMS]      (the same here and in the builder: the shapes must match)
//   await loadTemplates("de/listen")  -> templates             (index: [{ i (the dictionary entry's row), word, pos }], frames)
//   recognize(feat, templates, { top: 5 })  -> [{ i, word, pos, dist, score }]   score 0..1 (1 near)
//   await record({ maxMs: 3000, silenceMs: 700, onLevel }) -> { samples, rate } | null   (the microphone, push to talk)
//
// Feature shape: 16 kHz, 25 ms Hamming frames every 10 ms, a 512-point spectrum, 26 mel bands (100-7000 Hz), log,
// DCT -> c1..c12 (c0, the loudness, dropped), the frames of the word only (trimmed by energy: 30 dB under the peak),
// each coefficient normalised to zero mean and unit variance over the word, times 20 into a byte.
export const RATE = 16000, FRAME = 400, HOP = 160, NFFT = 512, NMEL = 26, DIMS = 12, SCALE = 20;

// ---- the features -------------------------------------------------------------------------------------------------------
const hamming = Float32Array.from({ length: FRAME }, (_, i) => .54 - .46 * Math.cos(2 * Math.PI * i / (FRAME - 1)));
const mel = (f) => 2595 * Math.log10(1 + f / 700), hz = (m) => 700 * (10 ** (m / 2595) - 1);
// the mel filter bank: NMEL triangles over the NFFT/2 + 1 bins; `warp` scales the frequency axis -- a longer or shorter
// vocal tract (a child's formants lie 30 % higher than a man's): the listener tries several warps and keeps the best
const banks = new Map();
function bank(warp = 1) {
  if (banks.has(warp)) return banks.get(warp);
  const lo = mel(100), hi = mel(7000), pts = Float32Array.from({ length: NMEL + 2 }, (_, i) => Math.min(NFFT / 2, Math.floor((NFFT + 1) * warp * hz(lo + (hi - lo) * i / (NMEL + 1)) / RATE)));
  const b = Array.from({ length: NMEL }, (_, m) => ({ a: pts[m], b: pts[m + 1], c: pts[m + 2] }));
  banks.set(warp, b);
  return b;
}
export const WARPS = [.78, .86, .93, 1, 1.08, 1.17, 1.27];
// the DCT-II matrix for c1..c12 of NMEL log energies
const DCT = Array.from({ length: DIMS }, (_, k) => Float32Array.from({ length: NMEL }, (_, n) => Math.cos(Math.PI * (k + 1) * (n + .5) / NMEL)));

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
// samples at any rate -> 16 kHz (a 4-point windowed-sinc interpolation after a small box average when decimating)
export function resample(samples, rate) {
  if (rate === RATE) return samples;
  const ratio = rate / RATE, n = Math.floor(samples.length / ratio), out = new Float32Array(n);
  const box = Math.max(1, Math.round(ratio));   // (a crude anti-alias: average over the decimation span)
  for (let i = 0; i < n; i++) {
    const x = i * ratio, k = Math.floor(x);
    let s = 0, c = 0;
    for (let j = k - box + 1; j <= k; j++) if (j >= 0 && j < samples.length) { s += samples[j]; c++; }
    out[i] = c ? s / c : 0;
  }
  return out;
}
// the frames' log mel energies and log energy; `all`: every frame (before trimming)
function analyse(samples, warp = 1) {
  const BANK = bank(warp);
  const frames = Math.max(0, Math.floor((samples.length - FRAME) / HOP) + 1), re = new Float32Array(NFFT), im = new Float32Array(NFFT);
  const logmel = [], energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    re.fill(0); im.fill(0);
    let e = 0, prev = 0;
    for (let i = 0; i < FRAME; i++) { const x = samples[f * HOP + i], y = x - .97 * prev; prev = x; re[i] = y * hamming[i]; e += x * x; }   // (pre-emphasis)
    energy[f] = 10 * Math.log10(e / FRAME + 1e-10);
    fft(re, im);
    const pow = new Float32Array(NFFT / 2 + 1);
    for (let i = 0; i <= NFFT / 2; i++) pow[i] = re[i] * re[i] + im[i] * im[i];
    const lm = new Float32Array(NMEL);
    for (let m = 0; m < NMEL; m++) {
      const { a, b, c } = BANK[m];
      let s = 0;
      for (let i = a; i < b; i++) s += pow[i] * (i - a) / Math.max(1, b - a);
      for (let i = b; i < c; i++) s += pow[i] * (c - i) / Math.max(1, c - b);
      lm[m] = Math.log(s + 1e-10);
    }
    logmel.push(lm);
  }
  return { logmel, energy };
}
// the word's frames: from the first frame within 30 dB of the peak to the last, with 3 frames of margin either side
function trim(energy) {
  if (!energy.length) return [0, 0];
  let peak = -Infinity;
  for (const e of energy) peak = Math.max(peak, e);
  let a = 0, b = energy.length - 1;
  while (a < b && energy[a] < peak - 30) a++;
  while (b > a && energy[b] < peak - 30) b--;
  return [Math.max(0, a - 3), Math.min(energy.length, b + 4)];
}
export function features(samples, rate = RATE, { warp = 1 } = {}) {
  const s = resample(samples, rate), { logmel, energy } = analyse(s, warp), [a, b] = trim(energy);
  const n = b - a;
  if (n < 4) return new Int8Array(0);
  const cep = new Float32Array(n * DIMS);
  for (let f = 0; f < n; f++) for (let k = 0; k < DIMS; k++) { let s = 0; const lm = logmel[a + f], row = DCT[k]; for (let m = 0; m < NMEL; m++) s += lm[m] * row[m]; cep[f * DIMS + k] = s; }
  // the word's own mean and spread taken out of every coefficient: what the room, the microphone and the voice add
  const out = new Int8Array(n * DIMS);
  for (let k = 0; k < DIMS; k++) {
    let mu = 0, v = 0;
    for (let f = 0; f < n; f++) mu += cep[f * DIMS + k];
    mu /= n;
    for (let f = 0; f < n; f++) v += (cep[f * DIMS + k] - mu) ** 2;
    const sd = Math.sqrt(v / n) || 1;
    for (let f = 0; f < n; f++) out[f * DIMS + k] = Math.max(-127, Math.min(127, Math.round((cep[f * DIMS + k] - mu) / sd * SCALE)));
  }
  return out;
}

// ---- the templates and the matching ------------------------------------------------------------------------------------
// <lang>/listen.json: { version, dims, hop, index: [{ i, word, pos, n (frames) }] }; <lang>/listen.bin: the Int8 frames in order
export async function loadTemplates(base) {
  const [index, bin] = await Promise.all([fetch(base + ".json").then((r) => r.json()), fetch(base + ".bin").then((r) => r.arrayBuffer())]);
  const data = new Int8Array(bin), out = [];
  let at = 0;
  for (const x of index.index) { out.push({ ...x, feat: data.subarray(at, at + x.n * DIMS) }); at += x.n * DIMS; }
  return { ...index, list: out };
}
// the distance of two frames (squared Euclid over the DIMS bytes)
const dist = (a, ai, b, bi) => { let s = 0; for (let k = 0; k < DIMS; k++) { const d = a[ai + k] - b[bi + k]; s += d * d; } return s; };
// dynamic time warping within a band, the cost per step of the path (n + m steps at most)
export function dtw(a, b, band = .3) {
  const n = a.length / DIMS, m = b.length / DIMS, w = Math.max(6, Math.round(Math.max(n, m) * band));
  const INF = 1e18, prev = new Float64Array(m + 1).fill(INF), cur = new Float64Array(m + 1);
  prev[0] = 0;
  for (let i = 1; i <= n; i++) {
    cur.fill(INF);
    const lo = Math.max(1, Math.round(i * m / n) - w), hi = Math.min(m, Math.round(i * m / n) + w);
    for (let j = lo; j <= hi; j++) {
      const d = dist(a, (i - 1) * DIMS, b, (j - 1) * DIMS);
      cur[j] = d + Math.min(prev[j - 1], prev[j], cur[j - 1]);
    }
    prev.set(cur);
  }
  return prev[m] / (n + m);
}
// a coarse sketch of a feature stream: the mean frame of each of K equal slices, for a quick first pass
const K = 8;
export function sketch(feat) {
  const n = feat.length / DIMS, out = new Float32Array(K * DIMS);
  for (let s = 0; s < K; s++) {
    const a = Math.floor(s * n / K), b = Math.max(a + 1, Math.floor((s + 1) * n / K));
    for (let f = a; f < b; f++) for (let k = 0; k < DIMS; k++) out[s * DIMS + k] += feat[f * DIMS + k] / (b - a);
  }
  return out;
}
const sketchDist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return s; };
// the nearest words: the templates within half to double the length, the 400 nearest by sketch, then warped in full
// the word heard at every warp (features(samples, rate, { warp }) for WARPS): the nearest words over all of them
export function recognizeAll(samples, rate, templates, { top = 5, pool = 300, warps = WARPS } = {}) {
  const best = new Map();
  for (const warp of warps) for (const r of recognize(features(samples, rate, { warp }), templates, { top, pool })) { const k = r.i.join(","); if (!best.has(k) || best.get(k).dist > r.dist) best.set(k, { ...r, warp }); }
  return [...best.values()].sort((a, b) => a.dist - b.dist).slice(0, top);
}
export function recognize(feat, templates, { top = 5, pool = 400 } = {}) {
  const n = feat.length / DIMS;
  if (n < 4) return [];
  const sk = sketch(feat);
  const cands = [];
  for (const t of templates.list) {
    if (t.n < n * .5 || t.n > n * 2) continue;
    cands.push([sketchDist(sk, t.sketch ??= sketch(t.feat)), t]);
  }
  cands.sort((a, b) => a[0] - b[0]);
  const scored = cands.slice(0, pool).map(([, t]) => ({ i: t.i, word: t.word, pos: t.pos, dist: dtw(feat, t.feat) }));
  scored.sort((a, b) => a.dist - b.dist);
  // (the score: how the distance stands against a typical frame distance between unrelated words -- 2 * DIMS * SCALE^2 is
  //  two unit-variance streams apart; 0 at that, 1 at nothing)
  const far = 2 * DIMS * SCALE * SCALE;
  return scored.slice(0, top).map((x) => ({ ...x, score: Math.max(0, Math.min(1, 1 - x.dist / far)) }));
}

// ---- the microphone (the page only): push to talk, stopped by silence after speech or by the time limit ------------------
export async function record({ maxMs = 3000, silenceMs = 700, onLevel = null } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
  const ctx = new AudioContext(), src = ctx.createMediaStreamSource(stream), node = ctx.createScriptProcessor(2048, 1, 1);
  const chunks = [];
  let spoke = false, quiet = 0, done;
  const finished = new Promise((r) => (done = r));
  const t0 = performance.now();
  node.onaudioprocess = (ev) => {
    const d = ev.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(d));
    let e = 0; for (const x of d) e += x * x;
    const level = Math.sqrt(e / d.length);
    onLevel?.(level);
    if (level > .02) { spoke = true; quiet = 0; } else if (spoke) quiet += d.length / ctx.sampleRate * 1000;
    if ((spoke && quiet > silenceMs) || performance.now() - t0 > maxMs) done();
  };
  src.connect(node); node.connect(ctx.destination);
  await finished;
  node.disconnect(); src.disconnect(); stream.getTracks().forEach((t) => t.stop()); ctx.close();
  if (!spoke) return null;
  const n = chunks.reduce((s, c) => s + c.length, 0), samples = new Float32Array(n);
  let at = 0; for (const c of chunks) { samples.set(c, at); at += c.length; }
  return { samples, rate: ctx.sampleRate };
}
