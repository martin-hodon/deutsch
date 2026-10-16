// SPEAKING A LANGUAGE: a word's IPA -> clear speech, at once. A small FORMANT SYNTHESIZER (the method of Klatt 1980,
// and of the clear, robotic reading machines that came of it): every sound is a target -- a vowel its three
// formants, a consonant its place (where the formants point from), its noise band, its closure and burst -- and the
// targets are joined by short glides. Rendered sample by sample: a glottal pulse (Rosenberg) through five resonators
// in a row for the voice, white noise through the same resonators for an h or an aspiration, white noise through a
// band-pass for a hiss. A word takes a few milliseconds to make.
//
//   const voice = createVoice();   voice.kind = "woman";   voice.level = 2;   voice.prosody = await loadProsody("es/rules/speech.txt")
//   voice.say("ˈhʊndə")   (stops what it was saying)   voice.say(ipa, { question: true })   (the pitch rises at the end)
//   level: 0 silent, 1 quiet, 2 medium, 3 loud (LEVELS);  voice.tempo = 1.2 (the listener's speed: 1 the language's own)
//   phrase(tokens, prosody) -> ipa   the words of a sentence joined, stressed as speech stresses them (weak words not)
//
// The SOUNDS are the same for every language (a sound is a sound); what differs between languages is in
// <lang>/rules/speech.txt, the PROSODY: the rhythm (stress-timed: German, English -- the stressed syllables come at even
// intervals and the unstressed ones between them are squeezed; syllable-timed: Spanish, French -- every syllable about
// as long as the next, the longer ones sped up), how long a long vowel is against a short one, how much a stressed vowel
// is lengthened, the pause between words, the pitch's accent and fall, the aspiration of p t k, and which sound a
// symbol of the language's IPA means (English r is ɹ). The voices are only how a body is built: the pitch, and a
// shorter throat (formants raised) for a woman, more for a child. Clarity is what is tuned for, not likeness.

const SR = 22050;
export const VOICES = { man: { f0: 112, scale: 1 }, woman: { f0: 205, scale: 1.16 }, child: { f0: 275, scale: 1.3 } };

// ---- THE SOUNDS (a man's formants, Hz; durations ms) -------------------------------------------------------------
// vowels: [F1, F2, F3, short duration]; a long one (ː) lasts P.long times as long
const V = (f1, f2, f3, d = 75) => ({ type: "vowel", f: [f1, f2, f3], d });
const D = (from, to, d = 140) => ({ ...V(...from, d), to });   // (a diphthong: from the first target to the second -- longer than a short vowel, about as a long one)
const SOUNDS = {
  i: V(280, 2250, 2950), "ɪ": V(390, 1950, 2600), e: V(340, 2120, 2700), "ɛ": V(530, 1780, 2550), a: V(740, 1300, 2500), "ɑ": V(700, 1100, 2500),
  "ɔ": V(560, 920, 2450), o: V(370, 760, 2350), "ʊ": V(410, 1020, 2350), u: V(300, 720, 2300), y: V(270, 1780, 2150), "ʏ": V(370, 1560, 2200),
  "ø": V(350, 1460, 2200), "œ": V(490, 1420, 2350), "ə": V(460, 1420, 2450, 50), "ɐ": V(600, 1250, 2450, 70), "ʌ": V(620, 1200, 2500),
  // English: cat, hot, bird (long by its ː)
  "æ": V(660, 1720, 2410), "ɒ": V(560, 820, 2500), "ɜ": V(500, 1400, 2500),
  // Russian ы (a central unrounded i), Mandarin e (ɤ, a mid back unrounded vowel: 河, 哥)
  "ɨ": V(330, 1650, 2400), "ɤ": V(500, 1150, 2500),
  // diphthongs: German, then English (day, go, boy, here, there, tour)
  "aɪ": D([740, 1300, 2500], [380, 2000, 2650]), "aʊ": D([740, 1300, 2500], [420, 900, 2350]), "ɔʏ": D([560, 920, 2450], [370, 1650, 2250]),
  "eɪ": D([450, 2000, 2650], [340, 2200, 2800]), "əʊ": D([500, 1300, 2450], [400, 850, 2350]), "ɔɪ": D([560, 920, 2450], [390, 1950, 2600]),
  "ɪə": D([390, 1950, 2600], [500, 1400, 2450]), "eə": D([530, 1780, 2550], [520, 1400, 2450]), "ʊə": D([410, 1020, 2350], [500, 1350, 2450]),
  // Mandarin ou (走, 有: o closing toward u; English GOAT is written əʊ)
  "oʊ": D([400, 800, 2350], [310, 740, 2300]),
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
  "ç": { type: "fric", place: "pal", band: [4800, 1400], gain: .55, d: 90 }, x: { type: "fric", place: "vel", band: [1300, 1000], gain: .85, d: 95, breath: .35 },
  // θ, ð (thin, this; Spanish cinco, nada): a weak flat hiss at the teeth; Spanish β, ɣ are hardly more than glides
  "θ": { type: "fric", place: "alv", band: [5500, 5000], gain: .15, d: 90 }, "ð": { type: "fric", place: "alv", band: [5500, 5000], gain: .07, d: 60, voiced: 1 },
  // the retroflex ʂ ʐ (Russian ш ж, Mandarin sh r: lower and duller than ʃ) and the alveolo-palatal ɕ ʑ (щ, ч; x j q:
  // higher, between ʃ and ç)
  "ʂ": { type: "fric", place: "pal", band: [2200, 1700], gain: .8, d: 100 }, "ʐ": { type: "fric", place: "pal", band: [2200, 1700], gain: .4, d: 75, voiced: 1 },
  "ɕ": { type: "fric", place: "pal", band: [3700, 2000], gain: .72, d: 100 }, "ʑ": { type: "fric", place: "pal", band: [3700, 2000], gain: .36, d: 75, voiced: 1 },
  "β": { type: "approx", place: "lab", f: [330, 900, 2300], d: 55, noise: [4500, 6000, .04] }, "ɣ": { type: "approx", place: "vel", f: [400, 1300, 2300], d: 55, noise: [1400, 1400, .08] },
  h: { type: "asp", d: 70 },   // breath through the next vowel's own formants
  // nasals: the murmur -- a low resonance alone (the mouth closed off: its upper formants drowned, see render)
  m: { type: "nasal", place: "lab", f: [250, 1100, 2300], d: 75 }, n: { type: "nasal", place: "alv", f: [250, 1600, 2500], d: 70 },
  "ŋ": { type: "nasal", place: "vel", f: [250, 2000, 2500], d: 80 }, "ɲ": { type: "nasal", place: "pal", f: [250, 2000, 2700], d: 80 }, "ɱ": { type: "nasal", place: "lab", f: [250, 1100, 2300], d: 70 },
  // l a clear one; ʁ voiced with some friction at the uvula (a ʁ that is only formants is not heard at all; a broad,
  // loud one hisses like a bad radio -- the friction is narrow, modest, pulsed with the voice (render) and sits where
  // the throat's own resonance is, scaled with the voice like the formants); after a voiceless consonant ʁ is
  // voiceless too (trinken, Brot's b aside: [tχ], [pχ], [ʃχ]) -- friction alone
  l: { type: "approx", place: "alv", f: [360, 1350, 2900], d: 80 }, "ʁ": { type: "approx", place: "uvu", f: [600, 1150, 2250], d: 70, noise: [1300, 1000, .32] },
  "ʎ": { type: "approx", place: "pal", f: [300, 2000, 2800], d: 80 },
  // the r's: ɹ the English glide, ɾ the Spanish tap (one quick closure), r the trill (three)
  "ɹ": { type: "approx", place: "alv", f: [450, 1300, 2000], d: 60 }, "ɻ": { type: "approx", place: "pal", f: [400, 1250, 1800], d: 60, noise: [2200, 1700, .08] },   // (ɻ: Mandarin r -- the retroflex glide with a trace of friction) "ɾ": { type: "tap", place: "alv", f: [400, 1500, 2500], taps: 1 }, r: { type: "tap", place: "alv", f: [400, 1500, 2500], taps: 3 },
  j: { type: "approx", place: "pal", f: [270, 2200, 3000], d: 50 }, "ʝ": { type: "approx", place: "pal", f: [270, 2200, 3000], d: 60, noise: [4800, 1400, .1] },
  w: { type: "approx", place: "lab", f: [320, 750, 2300], d: 50 }, "ɥ": { type: "approx", place: "pal", f: [270, 1800, 2200], d: 50 },
  "ʔ": { type: "gap", d: 35 },
};
const AFFRICATES = { ts: ["t", "s"], "ʦ": ["t", "s"], pf: ["p", "f"], "tʃ": ["t", "ʃ"], "dʒ": ["d", "ʒ"], "tɕ": ["t", "ɕ"], "tʂ": ["t", "ʂ"], "dʑ": ["d", "ʑ"], "dʐ": ["d", "ʐ"] };
// MODIFIERS after a sound: ʲ a palatalised consonant (Russian soft consonants -- the tongue raised toward the palate:
// its place moves palatal and a short j glides into the vowel), ʰ an aspirated one (Mandarin p t k c ch q against the
// plain ones: a long breath after the release, whatever the language's `aspiration`), a tone digit 1-5 after a
// Mandarin syllable (its pitch contour, on the rime -- the vowels and a nasal or ɹ coda; 5 the neutral tone: short,
// low; two third tones in a row: the first is said as a second). A rime with a full tone lasts at least TONED ms
// (rhythm): the contour needs the time to be heard -- a Mandarin syllable is long, whatever its one vowel's own length.
const RIME_CODA = new Set(["n", "ŋ", "ɹ"]);
const TONED = 130;
// where the formants stand at a consonant's place (the vowel glides from here): F2 and F3; a velar's follows its vowel
const LOCUS = { lab: [250, 850, 2300], alv: [280, 1700, 2650], pal: [270, 2100, 2900], vel: null, uvu: [500, 1250, 2350] };
const HISS = 1;   // (the hisses' level against the voice: the sounds' own gains are relative to it)
// THE VOICE'S FINISH (render `tune`; speak_ab.html lets one hear the variants): how smooth or rough the synthesis is,
// apart from what the sounds and the prosody say. Chosen by ear (2026-10-15, German): the voice had been rough, and the
// cause was the spike of the glottal pulse at each closure -- the kinked Rosenberg closing phase, the per-word level
// then budgeting for the spike and the peak rounding squashing it, so the vowel body came out quieter and duller. The
// raised-cosine closure (`soft`) was the clearest gain; the rest helped in combination. OLD below: the voice before.
// A language sets its own in <lang>/rules/speech.txt (`tune toneEase = 50`: Mandarin -- no finish suits every language).
export const TUNE = {
  oq: .55,         // the glottal pulse's open share of a period (more: a laxer, breathier voice)
  close: .2,       // its closing share (more: a softer closure, fewer high harmonics)
  emph: .75,       // the pre-emphasis coefficient (+6 dB an octave at .9; less: darker)
  glide: .06,      // s a formant glides between neighbouring sounds, at most each side (more: smoother coarticulation)
  onset: 7,        // ms the voice fades in and out at a sound's edges
  toneEase: 15,    // ms a tone target is eased toward (Mandarin)
  jitter: .006,    // the pitch's random change from one pulse to the next (share; .005 is natural)
  bw: 1,           // the formants' bandwidths (more: duller, less ringing)
  hiss: 1,         // the hisses' and bursts' level (less: lighter consonants)
  soft: 1,         // 1: the glottal closure a raised cosine (no kink -- a smoother, less spiky pulse)
  frame: 1,        // ms between the filters' retunings (less: smoother glides, no 200 Hz stepping)
  knee: .95,       // where the peaks are rounded off (level); nearer 1: no squashing of the pulses
  lp: .75,         // the final top cut's coefficient (less: a lower cutoff)
  nz: 450,         // Hz of the nasal zero in a nasal vowel (French ɑ̃ ɔ̃ ɛ̃ œ̃): the pole at 270 Hz is heard and F1 weakened; 270 = none
};
export const OLD = { oq: .4, close: .12, emph: .9, glide: .035, jitter: 0, soft: 0, frame: 5, knee: .7 };   // (the finish until 2026-10-15)

// ---- THE PROSODY of a language (<lang>/rules/speech.txt) ---------------------------------------------------------
// `key = value -- note`; `say X = Y`: the symbol X of the language's IPA is the sound Y; `tune X = Y`: the finish knob X
// (TUNE) is Y for this language. The defaults are German's.
export const PROSODY = {
  rhythm: "stress",   // stress | syllable
  even: .5,           // how far the timing is evened out (0 none; 1 even feet, or even syllables)
  long: 1.85,         // a long vowel (ː) against a short one
  stress: 1.25,       // a stressed vowel's length
  unstressed: .85,    // an unstressed vowel's
  final: 1.2,         // the last vowel of what is said, lengthened
  pause: 45,          // ms between words
  slow: 1.3,          // every sound this much longer than conversation: a word said for a learner, clearly
  accent: 1.08,       // the pitch on a stressed vowel (times the baseline) -- a little: a big rise sounds sung
  range: .15,         // the pitch's fall over a statement (start to end, share of the voice's pitch)
  aspiration: 1,      // p t k before a vowel: the breath after the burst (1 full: German, English; ~.15 Spanish, French)
  run: 3,             // the most syllables in a row without a beat: beyond it a weak word gets a half stress (phrase)
  weak: new Set(),    // the words that carry no stress in a phrase (articles, pronouns, prepositions, auxiliaries ...)
  say: {},            // symbol -> sound
  tune: {},           // the language's own finish, over TUNE (`tune toneEase = 50`: Mandarin's tones eased more slowly)
};
export async function loadProsody(url) {
  const P = { ...PROSODY, say: {}, weak: new Set(), tune: {} };
  for (const raw of (await (await fetch(url)).text()).split("\n")) {
    const s = raw.split("--")[0].trim(), m = s.match(/^(\w+)(?:\s+(\S+))?\s*=\s*(.+)$/);
    if (!s || s.startsWith("#") || !m) continue;
    if (m[1] === "say") P.say[m[2]] = m[3].trim();
    else if (m[1] === "tune") P.tune[m[2]] = Number(m[3]);
    else if (m[1] === "weak") for (const w of m[3].trim().split(/\s+/)) P.weak.add(w.toLocaleLowerCase());   // (several lines add up)
    else P[m[1]] = isNaN(Number(m[3])) ? m[3].trim() : Number(m[3]);
  }
  return P;
}

// ---- IPA -> sounds ----------------------------------------------------------------------------------------------
// [{ s: symbol, long, stress, nasal, gap }] -- ˈ marks the next syllable stressed (ˌ: half), ː makes the last sound
// long, a tilde makes it nasal, a space a pause; `auto`: nothing marked stressed -> the last word's first vowel is
// (a word said alone -- a monosyllable --, or der Hund: its noun; off for phrase(), which decides itself)
export function parse(ipa, P = PROSODY, { auto = true } = {}) {
  const out = [];
  let stress = 0, rime = 0, lastTone = null;
  const isV = (x) => SOUNDS[x.s]?.type === "vowel";
  const tone = (t) => {   // (the rime before the digit: back over the coda and the vowels to the onset)
    let j = out.length - 1;
    while (j >= 0 && RIME_CODA.has(out[j].s) && out[j].tone == null) j--;   // (back over the coda, then the vowels -- not the onset)
    while (j >= 0 && isV(out[j]) && out[j].tone == null) j--;
    const r = out.slice(j + 1);
    if (!r.some(isV)) return;
    if (t === 3 && lastTone?.[0]?.tone === 3) for (const x of lastTone) x.tone = 2;   // (3 + 3 -> 2 + 3)
    r.forEach((x, k) => { x.tone = t; x.tpos = k / r.length; x.rime = rime; });
    rime++; lastTone = r;
  };
  for (let i = 0; i < ipa.length; ) {
    const ch = ipa[i];
    if (ch === "ˈ" || ch === "ˌ") { stress = ch === "ˈ" ? 1 : .5; i++; continue; }
    if (ch === "ː") { if (out.length) out[out.length - 1].long = true; i++; continue; }
    if (ch === "̃") { if (out.length) out[out.length - 1].nasal = true; i++; continue; }
    if (ch === "ʲ") { if (out.length && !isV(out[out.length - 1])) out[out.length - 1].pal = true; i++; continue; }
    if (ch === "ʰ") { if (out.length && !isV(out[out.length - 1])) out[out.length - 1].asp = true; i++; continue; }
    if (ch >= "1" && ch <= "5") { tone(Number(ch)); i++; continue; }
    if (ch === "." || ch === "‿" || ch === "ˑ") { i++; continue; }
    if (ch === " ") { out.push({ s: " ", gap: true }); i++; continue; }
    const two = ipa.slice(i, i + 2), sym = SOUNDS[P.say[two] ?? two] || AFFRICATES[two] ? two : ch;
    i += sym.length;
    const said = P.say[sym] ?? (sym === "g" ? "ɡ" : sym);
    for (const s of AFFRICATES[said] ?? [said]) {
      if (!SOUNDS[s]) continue;   // (anything unknown is left out rather than guessed)
      // (an ɐ right after a vowel -- der, wir, Uhr: the vocalised r -- glides off that vowel in its syllable)
      const glide = s === "ɐ" && out.length > 0 && SOUNDS[out[out.length - 1].s]?.type === "vowel" && out[out.length - 1].s !== "ɐ";
      out.push(glide ? { s, stress, glide } : { s, stress });
    }
    if (SOUNDS[said]?.type === "vowel") stress = 0;   // (the stress belongs to the first vowel after its mark)
  }
  if (auto && !out.some((x) => x.stress)) {
    const last = out.reduce((k, x, i) => (x.gap ? i : k), -1), isV = (x) => SOUNDS[x.s]?.type === "vowel";
    const v = out.slice(last + 1).find(isV) ?? out.find(isV);
    if (v) v.stress = 1;
  }
  return out;
}

// ---- A PHRASE'S STRESS: the words' IPA joined, the stress where speech puts it ------------------------------------
// A dictionary marks a word's stress as said alone. In a phrase the WEAK words (P.weak: articles, pronouns,
// prepositions, conjunctions, the auxiliaries and modals, particles) carry none -- a native speaker does not stress
// einen or haben --, a content word without a mark (a monosyllable: Mann, sieht) gets one; and where more than P.run
// syllables in a row would have no beat, the weak word nearest their middle keeps a half stress (ˌ): speakers add a
// beat to a long stretch rather than let it run flat. `tokens` [{ w, ipa }] (punctuation is skipped); a word without
// IPA becomes `gap` (ʔ, a short gap) or is left out (null).
export function phrase(tokens, P = PROSODY, { gap = "ʔ" } = {}) {
  const words = tokens.filter((t) => /\p{L}/u.test(t.w)).map((t) => {
    const weak = P.weak.has(t.w.toLocaleLowerCase().replace(/[’']/g, ""));
    let ipa = t.ipa || "";
    if (!ipa) return { ipa: gap ?? "", half: null };
    const own = /[ˈˌ]/.test(ipa), half = weak ? (own ? ipa.replace(/ˈ/g, "ˌ") : "ˌ" + ipa) : null;   // (the weak word's beat, should it be needed)
    if (weak) ipa = ipa.replace(/[ˈˌ]/g, "");
    else if (!ipa.includes("ˈ")) ipa = ipa.includes("ˌ") ? ipa.replace("ˌ", "ˈ") : "ˈ" + ipa;
    return { ipa, half, own };
  });
  const isV = (x) => SOUNDS[x.s]?.type === "vowel";
  const syllables = () => words.flatMap((x, i) => parse(x.ipa, P, { auto: false }).filter((s) => isV(s) && !s.glide).map((s) => ({ i, stress: s.stress })));
  for (let pass = 0; pass < words.length; pass++) {   // (a beat added, the runs looked at again -- until none is too long)
    const syls = syllables();
    let added = false;
    for (let a = 0; a < syls.length && !added; ) {
      if (syls[a].stress) { a++; continue; }
      let b = a; while (b < syls.length && !syls[b].stress) b++;   // [a, b): a run without a beat
      if (b - a > P.run) {
        const mid = (a + b - 1) / 2, at = (i) => { const ks = syls.map((s, k) => (s.i === i ? k : -1)).filter((k) => k >= a && k < b); return ks.reduce((t, k) => t + k, 0) / ks.length; };
        // (the weak word nearest the middle -- one with a stressed syllable of its own (haben) before a monosyllable (wir))
        const cost = (i) => Math.abs(at(i) - mid) + (words[i].own ? 0 : 1.5);
        const best = [...new Set(syls.slice(a, b).map((s) => s.i))].filter((i) => words[i].half).sort((i, j) => cost(i) - cost(j))[0];
        if (best !== undefined) { words[best].ipa = words[best].half; words[best].half = null; added = true; }
      }
      a = b;
    }
    if (!added) break;
  }
  return words.map((x) => x.ipa).filter(Boolean).join(" ");
}

// ---- THE RHYTHM: every sound's length, from the language's prosody ------------------------------------------------
// A vowel's base length: its own, long or short, stressed or not, the last one of all lengthened. Then the timing is
// evened out: syllable-timed, every syllable is pulled toward the mean syllable (a long one sped up, a short one
// stretched -- its vowel and its consonants alike); stress-timed, every FOOT (a stressed syllable with the unstressed
// ones after it) is pulled toward the mean foot -- the unstressed syllables of a long foot squeezed, those of a short
// one stretched, the stressed syllable keeping its length: the beat. A syllable: a vowel with the consonants before it
// back to the vowel before (of several, the first stays with the vowel before).
// -> { len: a vowel's length (ms) by sound index, scale: a consonant's factor by sound index, syl: each sound's syllable }
function rhythm(sounds, P, consDur) {
  const isV = (x) => SOUNDS[x.s]?.type === "vowel";
  const lastVowel = sounds.reduce((k, x, i) => (isV(x) ? i : k), -1);
  // (a long vowel keeps its full length under stress; unstressed -- der, the article -- it is only somewhat longer than
  //  a short one: speakers shorten what carries no beat)
  //  the schwa and the ɐ are short of themselves (their own d) and not shortened again)
  const own = (x) => (x.tone && x.tone !== 5 ? Math.max(SOUNDS[x.s].d, TONED) : SOUNDS[x.s].d);   // (a toned vowel: TONED at least)
  const len = sounds.map((x, k) => (isV(x) ? own(x) * (x.long ? 1 + (P.long - 1) * (x.stress ? 1 : .45) : 1) * (x.stress ? 1 + (P.stress - 1) * x.stress : SOUNDS[x.s].d < 75 ? 1 : P.unstressed) * (k === lastVowel ? P.final : 1) * (x.tone === 5 ? .6 : x.tone === 3 ? 1.15 : 1) : 0));   // (a neutral tone is short, a third tone a little long)
  const scale = sounds.map(() => 1), syl = sounds.map(() => -1);
  // the syllables: [{ v: vowel index, cons: [indices], stress }]
  const syls = [];
  let cons = [], lastV = -1;
  sounds.forEach((x, k) => {
    if (x.gap) { if (syls.length && cons.length) syls[syls.length - 1].cons.push(...cons); cons = []; lastV = -1; return; }
    if (isV(x) && !x.glide) { if (cons.length > 1 && lastV >= 0) syls[syls.length - 1].cons.push(cons.shift()); syls.push({ v: k, cons, stress: x.stress }); cons = []; lastV = k; }
    else cons.push(k);   // (a consonant -- or the ɐ gliding off the vowel before: in its syllable)
  });
  if (syls.length && cons.length) syls[syls.length - 1].cons.push(...cons);
  syls.forEach((s, i) => { syl[s.v] = i; for (const k of s.cons) syl[k] = i; });
  if (syls.length < 2 || !P.even) return { len, scale, syl };
  const sylDur = (s) => len[s.v] + s.cons.reduce((t, k) => t + (len[k] || consDur(k)), 0);
  // (a vowel is never squeezed or stretched beyond this, a consonant less so: each must stay the sound it is -- and
  //  speakers even their timing out only so far; wider bounds made neighbouring syllables differ fourfold)
  const V = [.8, 1.25], C = [.85, 1.15], clamp = (f, [lo, hi]) => Math.min(hi, Math.max(lo, f));
  const stretch = (s, f) => { len[s.v] *= clamp(f, V); for (const k of s.cons) scale[k] = clamp(f, C); };
  if (P.rhythm === "syllable") {
    const ds = syls.map(sylDur), mean = ds.reduce((a, b) => a + b, 0) / ds.length;
    syls.forEach((s, i) => stretch(s, 1 + P.even * (mean / ds[i] - 1)));
  } else {
    // the feet: from each stressed syllable to the next; unstressed syllables before the first stress form one of their own
    const feet = [];
    for (const s of syls) { if (s.stress >= 1 || !feet.length) feet.push([s]); else feet[feet.length - 1].push(s); }
    if (feet.length < 2) return { len, scale, syl };
    const ds = feet.map((f) => f.reduce((t, s) => t + sylDur(s), 0)), mean = ds.reduce((a, b) => a + b, 0) / ds.length;
    feet.forEach((f, i) => {
      const free = f.filter((s) => s.stress < 1), freeDur = free.reduce((t, s) => t + sylDur(s), 0);
      if (!free.length) return;
      const factor = 1 + P.even * (mean - ds[i]) / freeDur;   // (the whole difference carried by the unstressed syllables)
      for (const s of free) stretch(s, factor);
    });
  }
  return { len, scale, syl };
}

// ---- sounds -> SEGMENTS: each a stretch of time with its formant targets and its sources --------------------------
// { d (s), f: [F1, F2, F3] target, av (voice), ah (breath), af (hiss), band: [centre, bw], stress (a stressed vowel) }
function segments(sounds, P, tempo = 1) {
  const segs = [], vowelAfter = (k) => sounds.slice(k + 1).find((x) => SOUNDS[x.s]?.type === "vowel");
  const locus = (place, k) => LOCUS[place] ?? (() => { const v = SOUNDS[vowelAfter(k)?.s ?? "a"].f; return [280, Math.min(2300, v[1] * 1.08), 2500]; })();
  const addMs = (d, f, src = {}) => segs.push({ d: d * P.slow / tempo / 1000, f, av: 0, ah: 0, af: 0, band: [4000, 2000], ...src });   // (tempo: the listener's, 1 the language's own)
  // a consonant's length in ms (for the rhythm's syllable sums)
  const consDur = (k) => { const S = SOUNDS[sounds[k].s]; return S.type === "stop" ? (S.voiced ? 60 : 60 + S.vot * P.aspiration) : S.type === "tap" ? S.taps * 38 : S.d; };
  const { len, scale, syl } = rhythm(sounds, P, consDur);
  sounds.forEach((x, k) => {
    const S = SOUNDS[x.s], add = (d, f, src = {}) => addMs(d * scale[k], f, { syl: syl[k], sym: x.s, ...src });   // (a consonant's length by its syllable's rhythm; sym: for the harness)
    if (x.gap) return addMs(P.pause, segs.at(-1)?.f ?? [500, 1500, 2500], { pause: true });
    if (S.type === "vowel") {
      // (a nasal vowel: the mouth's and the nose's resonances together -- a broad, damped F1, the voice a little dulled)
      const d = len[k], src = { av: x.nasal ? .8 : 1, stress: x.stress, nasalV: x.nasal ? 1 : 0, vowel: true, long: !!x.long, tone: x.tone, tpos: x.tpos, rime: x.rime };
      if (S.to) { add(d * .45, S.f, src); add(d * .55, S.to, src); } else add(d, S.f, src);
      return;
    }
    const next = vowelAfter(k);
    // (a palatalised consonant: its place moved toward the palate -- F2 and F3 raised --, a hiss a little higher)
    const L0 = locus(S.place, k), L = x.pal ? [L0[0], Math.max(L0[1], 1950), Math.max(L0[2], 2850)] : L0;
    const toneOf = { tone: x.tone, tpos: x.tpos, rime: x.rime };   // (a coda nasal or ɹ carries its syllable's tone)
    // (after a palatalised consonant a short j glides into the vowel: the softness heard)
    const glide = () => { if (x.pal && next && sounds[k + 1] === next) add(22, SOUNDS.j.f, { av: .8, ...toneOf }); };
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
      // tells a k from an h, whose breath has the vowel's own formants); a language without it (Spanish, French) has a
      // short, quiet one -- the place must still be heard
      // (ʰ: a long breath whatever the language's aspiration -- Mandarin's p t k against b d g)
      const vot = S.voiced ? 8 : x.asp ? 85 : Math.max(12, (next && !before ? S.vot : 35) * P.aspiration);
      add(vot, L, { ah: S.voiced ? .1 : x.asp ? .6 : .55 * Math.max(.4, P.aspiration) });
      glide();
    } else if (S.type === "fric") {
      add(S.d, L, { af: S.gain, band: x.pal ? [S.band[0] * 1.12, S.band[1]] : S.band, av: S.voiced ? .45 : 0, ah: S.breath ?? 0 });   // (x: also breath through the back of the mouth's formants)
      if (x.asp && next) add(45, SOUNDS[next.s].f, { ah: .55 });   // (an aspirated affricate's breath: c ch q)
      glide();
    }
    else if (S.type === "asp") add(S.d, next ? SOUNDS[next.s].f : [500, 1500, 2500], { ah: 1 });
    else if (S.type === "nasal") { add(S.d, x.pal ? [S.f[0], Math.max(S.f[1], 2000), Math.max(S.f[2], 2700)] : S.f, { av: .6, nasal: 1, ...toneOf }); glide(); }
    else if (S.type === "approx") {
      const unvoiced = x.s === "ʁ" && k > 0 && ["p", "t", "k", "f", "ʃ", "s", "ç", "x"].includes(sounds[k - 1].s);
      const f = x.pal ? [S.f[0], Math.max(S.f[1], 1900), Math.max(S.f[2], 2800)] : S.f;
      add(S.d, f, { av: unvoiced ? .15 : x.s === "l" ? .45 : .8, ...(S.noise ? { af: S.noise[2] * (unvoiced ? 1.4 : 1), band: S.noise.slice(0, 2), tract: true } : {}), ...toneOf });   // (tract: its noise is a resonance of the throat -- scaled with the voice in full)
      glide();
    }
    else if (S.type === "tap") {   // (the tongue tip strikes: a very short, quiet closure -- a trill, three of them with the vowel between)
      const open = next ? SOUNDS[next.s].f : [500, 1500, 2500], f = x.pal ? [S.f[0], 1900, 2800] : S.f;
      for (let t = 0; t < S.taps; t++) { if (t) add(20, open, { av: .9 }); add(18, f, { av: .25 }); }
      glide();
    }
    else if (S.type === "gap") add(S.d, segs.at(-1)?.f ?? [500, 1500, 2500]);
  });
  return segs;
}

// THE TIMING of what is said, for checking a language's prosody without ears (speak.html, the harness): each segment's
// length in seconds, whether it is a vowel (and stressed), a pause
export const timing = (ipa, P = PROSODY, tempo = 1) => segments(parse(ipa, P), P, tempo).map((s) => ({ d: s.d, vowel: !!s.vowel, long: !!s.long, stress: s.stress ?? 0, pause: !!s.pause, syl: s.syl ?? -1, sym: s.sym ?? "" }));

// ---- SEGMENTS -> SAMPLES -----------------------------------------------------------------------------------------
// two-pole resonator (Klatt's: unity gain at 0 Hz -- the cascade then has the vowel's natural spectrum)
function resonator() {
  let y1 = 0, y2 = 0, a = 1, b = 0, c = 0;
  return { set(f, bw) { c = -Math.exp(-2 * Math.PI * bw / SR); b = 2 * Math.exp(-Math.PI * bw / SR) * Math.cos(2 * Math.PI * f / SR); a = 1 - b - c; },
           run(x) { const y = a * x + b * y1 + c * y2; y2 = y1; y1 = y; return y; } };
}
// the inverse of a resonator: a notch (an anti-formant)
function antiresonator() {
  let x1 = 0, x2 = 0, a = 1, b = 0, c = 0;
  return { set(f, bw) { c = -Math.exp(-2 * Math.PI * bw / SR); b = 2 * Math.exp(-Math.PI * bw / SR) * Math.cos(2 * Math.PI * f / SR); a = 1 - b - c; },
           run(x) { const y = (x - b * x1 - c * x2) / a; x2 = x1; x1 = x; return y; } };
}
// band-pass with its peak at 0 dB (RBJ): the hiss of a fricative, the snap of a burst -- two in a row (BAND), so the
// noise stays in its band (a single two-pole band leaves a fuzz of low noise under every hiss that no mouth makes)
function bandpass() {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0 = 0, a1 = 0, a2 = 0;
  return { set(fc, bw) { const w = 2 * Math.PI * Math.min(fc, SR * .45) / SR, al = Math.sin(w) * bw / (2 * fc); b0 = al / (1 + al); a1 = -2 * Math.cos(w) / (1 + al); a2 = (1 - al) / (1 + al); },
           run(x) { const y = b0 * (x - x2) - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; } };
}

export function render(ipa, kind = "man", { prosody = PROSODY, question = false, tempo = 1, tune = TUNE } = {}) {
  const P = prosody, T = { ...TUNE, ...P.tune, ...tune }, voice = VOICES[kind] ?? VOICES.man, segs = segments(parse(ipa, P), P, tempo);
  if (!segs.length) return new Float32Array(0);
  const lead = .04, total = segs.reduce((t, s) => t + s.d, 0) + 2 * lead, n = Math.ceil(total * SR), out = new Float32Array(n);
  // the formants' path: each segment's target held in its middle, glided between neighbours (35 ms at most each side)
  const keys = [];
  let t = lead;
  for (const s of segs) { const g = Math.min(T.glide, s.d / 3); keys.push([t + g, s.f], [t + s.d - g, s.f]); s.t0 = t; t += s.d; }
  const F = (time) => {
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1][0] < time) i++;
    const [ta, fa] = keys[i], [tb, fb] = keys[Math.min(i + 1, keys.length - 1)], u = tb > ta ? Math.min(1, Math.max(0, (time - ta) / (tb - ta))) : 0;
    return fa.map((v, k) => (v + (fb[k] - v) * u) * voice.scale);
  };
  // THE PITCH: a baseline falling over the whole (P.range: a statement's declination; a question rises again at its
  // end), and on every stressed vowel an accent -- up from 60 ms before the vowel to its middle, down over 150 ms
  // after it (a gentle hump: a sudden jump on the first word sounds unnatural)
  const end = total - lead, accents = segs.filter((s) => s.stress).map((s) => ({ t0: s.t0, t1: s.t0 + s.d, a: 1 + (P.accent - 1) * s.stress }));
  if (!accents.length) { const v = segs.find((s) => s.av >= 1) ?? segs[0]; accents.push({ t0: v.t0, t1: v.t0 + v.d, a: P.accent }); }
  const baseline = (time) => {
    const u = Math.min(1, Math.max(0, (time - lead) / Math.max(.05, end - lead)));
    let b = 1 + P.range * (.5 - u);
    if (question) { const r = Math.max(0, (time - (end - .3)) / .3); b += P.range * 1.2 * r * r; }
    return b;
  };
  const accent = (time) => {
    let a = 1;
    for (const x of accents) {
      const mid = x.t0 + (x.t1 - x.t0) * .5;
      const up = time < x.t0 - .06 ? 0 : time < mid ? (time - (x.t0 - .06)) / (mid - x.t0 + .06) : Math.max(0, 1 - (time - mid) / .15);
      const s = .5 - .5 * Math.cos(Math.PI * Math.min(1, Math.max(0, up)));   // (smooth in and out)
      a = Math.max(a, 1 + (x.a - 1) * s);
    }
    return a;
  };
  // THE TONES (Mandarin): each rime's contour, as a factor on the baseline -- 1 high level, 2 rising, 3 low and
  // dipping, 4 falling, 5 the neutral tone low and short --, held between rimes and eased over ~15 ms
  const TONE = { 1: [1.3, 1.3], 2: [1, 1.08, 1.34], 3: [.9, .78, .9], 4: [1.38, 1.2, .82], 5: [.92, .88] };
  const rimes = new Map();
  for (const s of segs) if (s.rime != null) { const r = rimes.get(s.rime) ?? rimes.set(s.rime, { t0: s.t0, t1: s.t0 + s.d, tone: s.tone }).get(s.rime); r.t0 = Math.min(r.t0, s.t0); r.t1 = Math.max(r.t1, s.t0 + s.d); }
  const toneTarget = (s, time) => {
    if (s.rime == null) return null;
    const r = rimes.get(s.rime), c = TONE[r.tone] ?? [1], u = Math.min(1, Math.max(0, (time - r.t0) / Math.max(.01, r.t1 - r.t0))) * (c.length - 1), k = Math.min(c.length - 2, Math.floor(u));
    return c[k] + (c[k + 1] - c[k]) * (u - k);
  };
  let toneMul = 1, toneAim = 1;
  const easeT = 1 - Math.exp(-1 / (SR * T.toneEase / 1000));
  // (and a slight slow waver -- 0.8 % at 5 Hz -- or the voice buzzes like a machine)
  const pitch = (time) => voice.f0 * (1 + .008 * Math.sin(2 * Math.PI * 5 * time)) * baseline(time) * accent(time) * toneMul;
  const R = [resonator(), resonator(), resonator(), resonator(), resonator()], BP = [bandpass(), bandpass()];
  // NASALITY (Klatt): a nasal pole at 270 Hz and a nasal zero -- at the pole in an oral sound (they cancel: nothing
  // heard), moved up to T.nz in a nasal vowel, so the low nasal resonance comes through and F1 is weakened
  const NP = resonator(), NZ = antiresonator();
  let phase = 0, jit = 1, prev = 0, av = 0, ah = 0, af = 0, seg = 0, nasal = 0, yPrev = 0, lp = 0;
  // the sources come on and off softly -- the voice and breath over ~7 ms, a hiss or a burst over ~2.5 (it must stay crisp)
  const easeV = 1 - Math.exp(-1 / (SR * T.onset / 1000)), easeF = 1 - Math.exp(-1 / (SR * .0025));
  for (let i = 0; i < n; i++) {
    const time = i / SR;
    if (i % Math.round(SR * T.frame / 1000) === 0) {      // every T.frame ms: the filters retuned to where the sound now is
      while (seg < segs.length - 1 && time >= segs[seg].t0 + segs[seg].d) seg++;
      const f = F(time), s = segs[seg];
      nasal = s.nasal ? 1 : 0;
      const nv = s.nasalV ? 1 : 0;   // (a nasal vowel: F1 broad and a little raised, F2 damped some)
      R[0].set(f[0] * (nv ? 1.1 : 1), (nasal ? 90 : (70 + f[0] * .04) * (nv ? 2.2 : 1)) * T.bw); R[1].set(f[1], (nasal ? 600 : (90 + f[1] * .03) * (nv ? 1.5 : 1)) * T.bw); R[2].set(f[2], (nasal ? 700 : 130 + f[2] * .02) * T.bw);
      R[3].set(3500 * voice.scale, 250); R[4].set(4500 * voice.scale, 300);
      NP.set(270 * voice.scale, 100); NZ.set((nv ? T.nz : 270) * voice.scale, 100);
      for (const b of BP) b.set(s.band[0] * (s.af ? (s.tract ? voice.scale : Math.sqrt(voice.scale)) : 1), s.band[1]);   // (a hiss at the teeth moves less with the voice than the throat's resonances)
    }
    const s = segs[seg], inside = time >= s.t0 && time < s.t0 + s.d;
    av += ((inside ? s.av : 0) - av) * easeV; ah += ((inside ? s.ah : 0) - ah) * easeV; af += ((inside ? s.af : 0) - af) * easeF;
    if (rimes.size) { const tt = toneTarget(s, time); if (tt != null) toneAim = tt; toneMul += (toneAim - toneMul) * easeT; }
    // the glottal pulse (Rosenberg: open 40 %, closing in 12 % -- a softer closure than a click, a voice rather than a
    // buzz), differentiated -- the lips' radiation; a trace of breath in every voiced sound
    phase += pitch(time) * jit / SR; if (phase >= 1) { phase -= 1; jit = 1 + T.jitter * (Math.random() * 2 - 1); }   // (jitter: pulse by pulse)
    const g = phase < T.oq ? .5 * (1 - Math.cos(Math.PI * phase / T.oq)) : phase < T.oq + T.close ? (T.soft ? .5 * (1 + Math.cos(Math.PI * (phase - T.oq) / T.close)) : Math.cos(Math.PI * (phase - T.oq) / (2 * T.close))) : 0;
    // (the differentiated pulse is as strong as the pitch is high: without the factor a man's voice stood 8 dB weaker
    //  against the same breath and friction than a child's -- his ʁ hissed, hers did not)
    const src = (g - prev) * av * 9 * (275 / voice.f0); prev = g;
    const noise = Math.random() * 2 - 1;
    let y = src + noise * (ah + av * .04) * .35;
    for (const r of R) y = r.run(y);
    y = NZ.run(NP.run(y));
    const voiced = y - T.emph * yPrev; yPrev = y;   // (pre-emphasis, +6 dB an octave: the upper formants, which tell the vowels apart)
    // (a voiced sound's friction -- ʁ, z, v -- is pulsed by the glottis: the air flows when it is open; steady noise over
    //  a voice is heard as static)
    const pulsed = 1 - Math.min(1, av / .45) * (.45 - .75 * Math.max(0, g));
    const x = voiced * 4 + BP[1].run(BP[0].run(noise)) * af * HISS * T.hiss * pulsed;
    lp += (x - lp) * T.lp; out[i] = lp;           // (a gentle top cut, ~7 kHz: no glassy edge on anything)
  }
  return level(out, T.knee);
}

// EVERY WORD AS LOUD AS THE NEXT: scaled to one LOUDNESS -- the RMS of its sounding part (the 10 ms frames within 30 dB
// of its loudest), not its peak, so a word full of hissing is not made quiet by it -- its few peaks above .7 rounded off
// (tanh), never clipped; 10 ms in and out
const LOUDNESS = .13;
function level(out, knee = .7) {
  const fr = Math.round(SR * .01), rms = [];
  for (let i = 0; i + fr <= out.length; i += fr) { let t = 0; for (let k = i; k < i + fr; k++) t += out[k] * out[k]; rms.push(t / fr); }
  const top = Math.max(...rms, 1e-12), on = rms.filter((r) => r > top * 1e-3);
  const g = LOUDNESS / Math.sqrt(on.reduce((a, b) => a + b, 0) / Math.max(1, on.length));
  const fade = Math.round(SR * .01);
  for (let i = 0; i < out.length; i++) {
    let v = out[i] * g;
    const a = Math.abs(v); if (a > knee) v = Math.sign(v) * (knee + (1 - knee) * Math.tanh((a - knee) / (1 - knee)));
    out[i] = v * Math.min(1, i / fade, (out.length - 1 - i) / fade);
  }
  return out;
}

// THE VOICE in a page: say() renders and plays (the last word cut off by the next); `kind` man, woman, child; `level`
// how loud (0 says nothing); `prosody` the language's (loadProsody), German's until set
export const LEVELS = [0, .3, .6, 1];
export function createVoice({ kind = "man", level = 2, prosody = PROSODY, tempo = 1 } = {}) {
  let ctx = null, gain = null, playing = null;
  return {
    kind, level, prosody, tempo,
    say(ipa, { question = false } = {}) {
      if (!LEVELS[this.level] || !ipa) return 0;
      ctx ??= new AudioContext();
      if (ctx.state === "suspended") ctx.resume();
      if (!gain) { gain = ctx.createGain(); gain.connect(ctx.destination); }
      gain.gain.value = LEVELS[this.level];
      const samples = render(ipa, this.kind, { prosody: this.prosody, question, tempo: this.tempo });
      if (!samples.length) return 0;
      const buf = ctx.createBuffer(1, samples.length, SR);
      buf.copyToChannel(samples, 0);
      playing?.stop();
      playing = ctx.createBufferSource(); playing.buffer = buf; playing.connect(gain); playing.start();
      return buf.duration;   // (seconds: how long it speaks)
    },
    stop() { playing?.stop(); playing = null; },
  };
}
