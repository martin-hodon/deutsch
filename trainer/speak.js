// SPEAKING GERMAN: a word's IPA -> clear speech, at once. A small FORMANT SYNTHESIZER (the method of Klatt 1980,
// and of the clear, robotic reading machines that came of it): every sound is a target -- a vowel its three
// formants, a consonant its place (where the formants point from), its noise band, its closure and burst -- and the
// targets are joined by short glides. Rendered sample by sample: a glottal pulse (Rosenberg) through five resonators
// in a row for the voice, white noise through the same resonators for an h or an aspiration, white noise through a
// band-pass for a hiss. A word takes a few milliseconds to make.
//
//   const voice = createVoice();     voice.kind = "woman";   voice.level = 2;   voice.say("ˈhʊndə")   (stops what it was saying)
//   level: 0 silent, 1 quiet, 2 medium, 3 loud (LEVELS)
//
// The voices are only how a body is built: the pitch, and a shorter throat (formants raised) for a woman, more for a
// child. Clarity is what is tuned for, not likeness: precise targets, full bursts, long enough sounds.

const SR = 22050, FRAME = .005;
export const VOICES = { man: { f0: 112, scale: 1 }, woman: { f0: 205, scale: 1.16 }, child: { f0: 275, scale: 1.3 } };

// ---- THE SOUNDS (a man's formants, Hz; durations ms) -------------------------------------------------------------
// vowels: [F1, F2, F3, short duration]; a long one (ː) lasts LONG times as long
const V = (f1, f2, f3, d = 75) => ({ type: "vowel", f: [f1, f2, f3], d });
const SOUNDS = {
  i: V(280, 2250, 2950), "ɪ": V(390, 1950, 2600), e: V(340, 2120, 2700), "ɛ": V(530, 1780, 2550), a: V(740, 1300, 2500), "ɑ": V(700, 1100, 2500),
  "ɔ": V(560, 920, 2450), o: V(370, 760, 2350), "ʊ": V(410, 1020, 2350), u: V(300, 720, 2300), y: V(270, 1780, 2150), "ʏ": V(370, 1560, 2200),
  "ø": V(350, 1460, 2200), "œ": V(490, 1420, 2350), "ə": V(460, 1420, 2450, 50), "ɐ": V(600, 1250, 2450, 70), "ʌ": V(620, 1200, 2500),
  // diphthongs: from the first target to the second
  "aɪ": { ...V(740, 1300, 2500, 170), to: [380, 2000, 2650] }, "aʊ": { ...V(740, 1300, 2500, 170), to: [420, 900, 2350] },
  "ɔʏ": { ...V(560, 920, 2450, 170), to: [370, 1650, 2250] },
  // consonants: place (the formants it points from), and how it is made
  // a burst is short, loud and broad: its centre and width say the place (lips low, the ridge high, a velar at its vowel)
  p: { type: "stop", place: "lab", burst: [1000, 2000], vot: 55 }, b: { type: "stop", place: "lab", burst: [1000, 2000], voiced: 1 },
  t: { type: "stop", place: "alv", burst: [4500, 3500], vot: 60 }, d: { type: "stop", place: "alv", burst: [4500, 3500], voiced: 1 },
  k: { type: "stop", place: "vel", burst: "vowel", vot: 70 }, "ɡ": { type: "stop", place: "vel", burst: "vowel", voiced: 1 },   // (a velar's burst: at its vowel's F2)
  // f, v: weak and flat -- a band as wide as the hiss's range (a narrow one is heard as s)
  f: { type: "fric", place: "lab", band: [4500, 7000], gain: .13, d: 90 }, v: { type: "fric", place: "lab", band: [4500, 7000], gain: .06, d: 65, voiced: 1 },
  s: { type: "fric", place: "alv", band: [6200, 2800], gain: .75, d: 100 }, z: { type: "fric", place: "alv", band: [6200, 2800], gain: .4, d: 75, voiced: 1 },
  // ʃ low and broad (the lips rounded), ç higher and narrower (the tongue's palatal slit), x low (the back of the mouth)
  "ʃ": { type: "fric", place: "pal", band: [2600, 2200], gain: .8, d: 100 }, "ʒ": { type: "fric", place: "pal", band: [2600, 2200], gain: .4, d: 75, voiced: 1 },
  "ç": { type: "fric", place: "pal", band: [4800, 1400], gain: .55, d: 90 }, x: { type: "fric", place: "vel", band: [1400, 1400], gain: 1, d: 95, breath: .35 },
  "θ": { type: "fric", place: "alv", band: [5500, 5000], gain: .15, d: 90 },
  h: { type: "asp", d: 70 },   // breath through the next vowel's own formants
  // nasals: the murmur -- a low resonance alone (the mouth closed off: its upper formants drowned, see render)
  m: { type: "nasal", place: "lab", f: [250, 1100, 2300], d: 75 }, n: { type: "nasal", place: "alv", f: [250, 1600, 2500], d: 70 },
  "ŋ": { type: "nasal", place: "vel", f: [250, 2000, 2500], d: 80 },
  // l a clear German one; ʁ voiced with audible friction at the uvula (a ʁ that is only formants is not heard at all)
  // after a voiceless consonant ʁ is voiceless too (trinken, Brot's b aside: [tχ], [pχ], [ʃχ]) -- friction alone
  l: { type: "approx", place: "alv", f: [360, 1350, 2900], d: 80 }, "ʁ": { type: "approx", place: "uvu", f: [600, 1150, 2250], d: 70, noise: [1500, 1600, .5] },
  r: { type: "approx", place: "alv", f: [450, 1300, 2000], d: 50 }, j: { type: "approx", place: "pal", f: [270, 2200, 3000], d: 50 }, w: { type: "approx", place: "lab", f: [320, 750, 2300], d: 50 },
  "ʔ": { type: "gap", d: 35 },
};
const AFFRICATES = { ts: ["t", "s"], "ʦ": ["t", "s"], pf: ["p", "f"], "tʃ": ["t", "ʃ"], "dʒ": ["d", "ʒ"] };
// where the formants stand at a consonant's place (the vowel glides from here): F2 and F3; a velar's follows its vowel
const LOCUS = { lab: [250, 850, 2300], alv: [280, 1700, 2650], pal: [270, 2100, 2900], vel: null, uvu: [500, 1250, 2350] };
const LONG = 1.85, STRESS = 1.25, FINAL = 1.2;
const SLOW = 1.3;   // (every sound this much longer than conversation: a word said for a learner, clearly)
const HISS = 1;   // (the hisses' level against the voice: the sounds' own gains are relative to it)

// ---- IPA -> sounds ----------------------------------------------------------------------------------------------
// [{ s: symbol, long, stress, gap }] -- ˈ marks the next syllable stressed, ː makes the last sound long, a space a pause
export function parse(ipa) {
  const out = [];
  let stress = false;
  for (let i = 0; i < ipa.length; ) {
    const two = ipa.slice(i, i + 2), ch = ipa[i];
    if (ch === "ˈ" || ch === "ˌ") { stress = ch === "ˈ"; i++; continue; }
    if (ch === "ː") { if (out.length) out[out.length - 1].long = true; i++; continue; }
    if (ch === "̃" || ch === "." || ch === "‿") { i++; continue; }   // (a nasal vowel read as its oral one)
    if (ch === " ") { out.push({ s: " ", gap: true }); i++; continue; }
    const sym = SOUNDS[two] || AFFRICATES[two] ? two : ch;
    i += sym.length;
    for (const s of AFFRICATES[sym] ?? [sym === "g" ? "ɡ" : sym]) {
      if (!SOUNDS[s]) continue;   // (anything unknown is left out rather than guessed)
      out.push({ s, stress });
    }
    if (SOUNDS[sym]?.type === "vowel") stress = false;   // (the stress belongs to the first vowel after its mark)
  }
  return out;
}

// ---- sounds -> SEGMENTS: each a stretch of time with its formant targets and its sources --------------------------
// { d (s), f: [F1, F2, F3] target, av (voice), ah (breath), af (hiss), band: [centre, bw], f0 (share of the voice's) }
function segments(sounds) {
  const segs = [], vowelAfter = (k) => sounds.slice(k + 1).find((x) => SOUNDS[x.s]?.type === "vowel");
  const lastVowel = sounds.reduce((k, x, i) => (SOUNDS[x.s]?.type === "vowel" ? i : k), -1);
  const locus = (place, k) => LOCUS[place] ?? (() => { const v = SOUNDS[vowelAfter(k)?.s ?? "a"].f; return [280, Math.min(2300, v[1] * 1.08), 2500]; })();
  const add = (d, f, src = {}) => segs.push({ d: d * SLOW / 1000, f, av: 0, ah: 0, af: 0, band: [4000, 2000], ...src });
  sounds.forEach((x, k) => {
    const S = SOUNDS[x.s];
    if (x.gap) return add(90, segs.at(-1)?.f ?? [500, 1500, 2500]);
    if (S.type === "vowel") {
      const d = S.d * (x.long ? LONG : 1) * (x.stress ? STRESS : 1) * (k === lastVowel ? FINAL : 1);
      if (S.to) { add(d * .45, S.f, { av: 1, f0: x.stress ? 1.2 : 1 }); add(d * .55, S.to, { av: 1, f0: x.stress ? 1.12 : 1 }); }
      else add(d, S.f, { av: 1, f0: x.stress ? 1.2 : 1 });
      return;
    }
    const L = locus(S.place, k), next = vowelAfter(k);
    if (S.type === "stop") {
      const before = k + 1 < sounds.length && SOUNDS[sounds[k + 1].s]?.type !== "vowel";
      // the closure: silent -- a voiced one hums low only between voiced sounds (German b, d, g at a word's start are
      // voiceless, unaspirated: a hum there is heard as the word's first sound)
      const between = k > 0 && SOUNDS[sounds[k - 1].s] && !["stop", "fric", "asp", "gap"].includes(SOUNDS[sounds[k - 1].s].type) && !sounds[k - 1].gap;
      add(S.voiced ? 45 : 60, L, { av: S.voiced && between ? .08 : 0 });
      // the burst, measured against espeak-ng's: a voiceless one some 16 dB under the vowel, a voiced one 10 (it has no
      // aspiration after it to carry the place) -- a velar's longer, at its vowel's F2
      const burst = S.burst === "vowel" ? [Math.max(1400, SOUNDS[next?.s ?? "a"].f[1] * 1.05), 900] : S.burst;
      add(S.burst === "vowel" ? 18 : 10, L, { af: S.voiced ? .8 : S.burst === "vowel" ? .7 : .45, band: burst });
      // aspiration: full before a vowel -- its formants AT THE PLACE, gliding from there into the vowel (the glide is what
      // tells a k from an h, whose breath has the vowel's own formants)
      const vot = S.voiced ? 8 : (next && !before ? S.vot : 35);
      add(vot, L, { ah: S.voiced ? .1 : .55 });
    } else if (S.type === "fric") add(S.d, L, { af: S.gain, band: S.band, av: S.voiced ? .45 : 0, ah: S.breath ?? 0 });   // (x: also breath through the back of the mouth's formants)
    else if (S.type === "asp") add(S.d, next ? SOUNDS[next.s].f : [500, 1500, 2500], { ah: 1 });
    else if (S.type === "nasal") add(S.d, S.f, { av: .6, nasal: 1 });
    else if (S.type === "approx") {
      const unvoiced = x.s === "ʁ" && k > 0 && ["p", "t", "k", "f", "ʃ", "s", "ç", "x"].includes(sounds[k - 1].s);
      add(S.d, S.f, { av: unvoiced ? .15 : x.s === "l" ? .45 : .8, ...(S.noise ? { af: S.noise[2] * (unvoiced ? 1.4 : 1), band: S.noise.slice(0, 2) } : {}) });
    }
    else if (S.type === "gap") add(S.d, segs.at(-1)?.f ?? [500, 1500, 2500]);
  });
  return segs;
}

// ---- SEGMENTS -> SAMPLES -----------------------------------------------------------------------------------------
// two-pole resonator (Klatt's: unity gain at 0 Hz -- the cascade then has the vowel's natural spectrum)
function resonator() {
  let y1 = 0, y2 = 0, a = 1, b = 0, c = 0;
  return { set(f, bw) { c = -Math.exp(-2 * Math.PI * bw / SR); b = 2 * Math.exp(-Math.PI * bw / SR) * Math.cos(2 * Math.PI * f / SR); a = 1 - b - c; },
           run(x) { const y = a * x + b * y1 + c * y2; y2 = y1; y1 = y; return y; } };
}
// band-pass with its peak at 0 dB (RBJ): the hiss of a fricative, the snap of a burst -- two in a row (BAND), so the
// noise stays in its band (a single two-pole band leaves a fuzz of low noise under every hiss that no mouth makes)
function bandpass() {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 0, a1 = 0, a2 = 0;
  return { set(fc, bw) { const w = 2 * Math.PI * Math.min(fc, SR * .45) / SR, al = Math.sin(w) * bw / (2 * fc); b0 = al / (1 + al); a1 = -2 * Math.cos(w) / (1 + al); a2 = (1 - al) / (1 + al); },
           run(x) { const y = b0 * (x - x2) - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; } };
}

export function render(ipa, kind = "man") {
  const voice = VOICES[kind] ?? VOICES.man, segs = segments(parse(ipa));
  const lead = .04, total = segs.reduce((t, s) => t + s.d, 0) + 2 * lead, n = Math.ceil(total * SR), out = new Float32Array(n);
  // the formants' path: each segment's target held in its middle, glided between neighbours (35 ms at most each side)
  const keys = [];
  let t = lead;
  for (const s of segs) { const g = Math.min(.035, s.d / 3); keys.push([t + g, s.f], [t + s.d - g, s.f]); s.t0 = t; t += s.d; }
  // the pitch: up to the stressed vowel, down to the end (a statement)
  const F = (time) => {
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1][0] < time) i++;
    const [ta, fa] = keys[i], [tb, fb] = keys[Math.min(i + 1, keys.length - 1)], u = tb > ta ? Math.min(1, Math.max(0, (time - ta) / (tb - ta))) : 0;
    return fa.map((v, k) => (v + (fb[k] - v) * u) * voice.scale);
  };
  const peak = segs.find((s) => s.f0 > 1.1) ?? segs.find((s) => s.av >= 1) ?? segs[0];
  const tPeak = peak.t0 + peak.d * .4;
  // (and a slight slow waver -- 0.8 % at 5 Hz -- or the voice buzzes like a machine)
  const pitch = (time) => voice.f0 * (1 + .008 * Math.sin(2 * Math.PI * 5 * time))
    * (time < tPeak ? 1.02 + .16 * time / tPeak : 1.18 - .36 * Math.min(1, (time - tPeak) / Math.max(.05, total - lead - tPeak)));
  const R = [resonator(), resonator(), resonator(), resonator(), resonator()], BP = [bandpass(), bandpass()];
  let phase = 0, prev = 0, av = 0, ah = 0, af = 0, seg = 0, nasal = 0, yPrev = 0, lp = 0;
  // the sources come on and off softly -- the voice and breath over ~7 ms, a hiss or a burst over ~2.5 (it must stay crisp)
  const easeV = 1 - Math.exp(-1 / (SR * .007)), easeF = 1 - Math.exp(-1 / (SR * .0025));
  for (let i = 0; i < n; i++) {
    const time = i / SR;
    if (i % Math.round(SR * FRAME) === 0) {      // every 5 ms: the filters retuned to where the sound now is
      while (seg < segs.length - 1 && time >= segs[seg].t0 + segs[seg].d) seg++;
      const f = F(time), s = segs[seg];
      nasal = s.nasal ? 1 : 0;
      R[0].set(f[0], nasal ? 90 : 70 + f[0] * .04); R[1].set(f[1], nasal ? 600 : 90 + f[1] * .03); R[2].set(f[2], nasal ? 700 : 130 + f[2] * .02);
      R[3].set(3500 * voice.scale, 250); R[4].set(4500 * voice.scale, 300);
      for (const b of BP) b.set(s.band[0] * (s.af ? Math.sqrt(voice.scale) : 1), s.band[1]);
    }
    const s = segs[seg], inside = time >= s.t0 && time < s.t0 + s.d;
    av += ((inside ? s.av : 0) - av) * easeV; ah += ((inside ? s.ah : 0) - ah) * easeV; af += ((inside ? s.af : 0) - af) * easeF;
    // the glottal pulse (Rosenberg: open 40 %, closing in 12 % -- a softer closure than a click, a voice rather than a
    // buzz), differentiated -- the lips' radiation; a trace of breath in every voiced sound
    phase += pitch(time) / SR; if (phase >= 1) phase -= 1;
    const g = phase < .4 ? .5 * (1 - Math.cos(Math.PI * phase / .4)) : phase < .52 ? Math.cos(Math.PI * (phase - .4) / .24) : 0;
    const src = (g - prev) * av * 9; prev = g;
    const noise = Math.random() * 2 - 1;
    let y = src + noise * (ah + av * .04) * .35;
    for (const r of R) y = r.run(y);
    const voiced = y - .9 * yPrev; yPrev = y;   // (pre-emphasis, +6 dB an octave: the upper formants, which tell the vowels apart)
    const x = voiced * 4 + BP[1].run(BP[0].run(noise)) * af * HISS;
    lp += (x - lp) * .75; out[i] = lp;           // (a gentle top cut, ~7 kHz: no glassy edge on anything)
  }
  return level(out);
}

// EVERY WORD AS LOUD AS THE NEXT: scaled to one LOUDNESS -- the RMS of its sounding part (the 10 ms frames within 30 dB
// of its loudest), not its peak, so a word full of hissing is not made quiet by it -- its few peaks above .7 rounded off
// (tanh), never clipped; 10 ms in and out
const LOUDNESS = .13;
function level(out) {
  const fr = Math.round(SR * .01), rms = [];
  for (let i = 0; i + fr <= out.length; i += fr) { let t = 0; for (let k = i; k < i + fr; k++) t += out[k] * out[k]; rms.push(t / fr); }
  const top = Math.max(...rms, 1e-12), on = rms.filter((r) => r > top * 1e-3);
  const g = LOUDNESS / Math.sqrt(on.reduce((a, b) => a + b, 0) / Math.max(1, on.length));
  const fade = Math.round(SR * .01);
  for (let i = 0; i < out.length; i++) {
    let v = out[i] * g;
    const a = Math.abs(v); if (a > .7) v = Math.sign(v) * (.7 + .3 * Math.tanh((a - .7) / .3));
    out[i] = v * Math.min(1, i / fade, (out.length - 1 - i) / fade);
  }
  return out;
}

// THE VOICE in a page: say() renders and plays (the last word cut off by the next); `kind` man, woman, child; `level`
// how loud (0 says nothing)
export const LEVELS = [0, .3, .6, 1];
export function createVoice({ kind = "man", level = 2 } = {}) {
  let ctx = null, gain = null, playing = null;
  return {
    kind, level,
    say(ipa) {
      if (!LEVELS[this.level] || !ipa) return 0;
      ctx ??= new AudioContext();
      if (ctx.state === "suspended") ctx.resume();
      if (!gain) { gain = ctx.createGain(); gain.connect(ctx.destination); }
      gain.gain.value = LEVELS[this.level];
      const samples = render(ipa, this.kind), buf = ctx.createBuffer(1, samples.length, SR);
      buf.copyToChannel(samples, 0);
      playing?.stop();
      playing = ctx.createBufferSource(); playing.buffer = buf; playing.connect(gain); playing.start();
      return buf.duration;   // (seconds: how long it speaks)
    },
    stop() { playing?.stop(); playing = null; },
  };
}
