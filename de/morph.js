// MORPHOLOGY: a word's forms, spelled and spoken -- the tables and rules of sentences/morphology.txt applied to the
// dictionary's entries (data.js). Every form is { w, ipa }: the spelling and the IPA (what speak.js says).
//
//   await loadMorphology("sentences/morphology.txt")
//   noun(entry, "dat", "pl")              -> den Kindern's noun: { w: "Kindern", ipa: "ˈkɪndɐn" }
//   det("def", "dat", "pl")               -> { w: "den", ipa: "deːn", decl: "weak" }
//   adj(entry, "weak", "dat", "pl")       -> { w: "kleinen", ... }
//   finite(entry, "present", "3sg")       -> { w: "spricht", ipa, prefix }   (prefix: a separable verb's, or null)
//   participle(entry), infinitive(entry), imperative(entry, "2sg"), pron("3sg.f", "dat"), relpron("m", "acc")
//
// cases nom acc dat gen; genders m f n, and pl for the plural; persons 1sg 2sg 3sg 1pl 2pl 3pl
const CASE = { nom: 0, acc: 1, dat: 2, gen: 3 }, GENDER = { m: 0, f: 1, n: 2, pl: 3 };
const PERSON = { "1sg": 0, "2sg": 1, "3sg": 2, "1pl": 3, "2pl": 4, "3pl": 5 };
let M = null;

export async function loadMorphology(url) {
  const text = await (await fetch(url)).text();
  M = {};
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const at = s.indexOf(" = ");
    if (at > 0) M[s.slice(0, at)] = s.slice(at + 3);
  }
  readRules(text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
  readUmlaut();
  return M;
}

// ---- RULES: a form made by replacing a word's end (morphology.txt: group.*, pattern.*, rule.KIND pattern /sound/ =
// -cut > ending | ...). The exceptions of a kind in their order, then its standard (no pattern): the first that fits
// the word -- its pattern (a regular expression with {group} and {pattern}), its /sound/, its cut -- and does not say
// `.` for the person, wins.
let RULES = {}, GROUPS = {};
const soundOf = (x) => M["ipa." + x] ?? x.replace(/e/g, "ə").replace(/r/g, "ʁ");   // (an ending's IPA: its own, else its letters)
function readRules(lines) {
  const patterns = {};
  RULES = {}; GROUPS = {};
  const expand = (p) => p.replace(/\{([\w-]+)\}/g, (_, n) => {
    if (GROUPS[n]) return `[${[...GROUPS[n]].join("")}]`;
    if (patterns[n]) return `(?:${expand(patterns[n])})`;
    throw new Error(`morphology: no group or pattern {${n}}`);
  });
  // a group: letters, or other groups and [letters] taken away ({consonant} - {liquid} - [hj])
  const letters = (v) => v.split(/\s+-\s+/).map((part) => new Set(/^\{([\w-]+)\}$/.test(part) ? GROUPS[part.slice(1, -1)] : /^\[(.*)\]$/.test(part) ? [...part.slice(1, -1)] : part.split(/\s+/)))
    .reduce((a, b) => new Set([...a].filter((x) => !b.has(x))));
  const piece = (c) => { const m = c.trim().match(/^(\S+)(?: \[([^\]]*)\])?$/); return !m || m[1] === "-" ? { w: "", ipa: "" } : m[1] === "." ? { next: true } : { w: m[1], ipa: m[2] ?? soundOf(m[1]) }; };
  for (const line of lines) {
    let m = line.match(/^group\.([\w-]+) = (.+)$/);
    if (m) { GROUPS[m[1]] = letters(m[2].trim()); continue; }
    if ((m = line.match(/^pattern\.([\w-]+) = (.+)$/))) { patterns[m[1]] = m[2].trim(); continue; }
    if (!(m = line.match(/^rule\.([\w-]+)(.*?) = (.*)$/))) continue;
    const head = m[2].trim(), sound = head.match(/\/([^/]*)\/$/), pattern = head.replace(/\/[^/]*\/$/, "").trim();
    const body = m[3].match(/^(umlaut\s+)?(?:-(\S+(?: \[[^\]]*\])?)\s*)?>\s*(.*)$/);
    if (!body) throw new Error(`morphology: cannot read "${line}"`);
    (RULES[m[1]] ??= []).push({ re: new RegExp(expand(pattern) + "$"), sound: sound ? new RegExp(sound[1] + "$") : null, standard: !pattern && !sound,
      umlaut: !!body[1], cut: body[2] ? piece(body[2]) : { w: "", ipa: "" }, ends: body[3].split("|").map(piece) });
  }
  for (const k in RULES) RULES[k].sort((a, b) => a.standard - b.standard);   // (the standard last, wherever it is written)
}
// the rule of a kind for a word ({ w, ipa }): the stem its cut leaves and the ending for person i (or the only one)
function byRule(kind, word, i = 0) {
  const fits = (x) => x.re.test(word.w) && (!x.sound || x.sound.test(word.ipa)) && word.w.endsWith(x.cut.w);
  const r = (RULES[kind] ?? []).find((x) => fits(x) && !x.ends[Math.min(i, x.ends.length - 1)].next);   // (`.`: the next that fits)
  if (!r) return null;
  if (r.umlaut) word = { w: umlautWord(word.w) ?? word.w, ipa: umlautIPA(word.ipa) ?? word.ipa };   // (kam -> käm; ging stays)
  let cut = r.cut, end = r.ends[Math.min(i, r.ends.length - 1)];
  const plain = { w: word.w.slice(0, word.w.length - cut.w.length), ipa: word.ipa.endsWith(cut.ipa) ? word.ipa.slice(0, word.ipa.length - cut.ipa.length) : word.ipa };   // (the stem the cut leaves: halt)
  const ended = !!end.w;
  // (what the cut and the ending share stays on the stem: -eln > elst is -n > st -- sammelst, wechselst [ˈvɛksəlst])
  let k = 0;
  while (k < cut.w.length && k < end.w.length && cut.w[k] === end.w[k]) k++;
  const shared = soundOf(cut.w.slice(0, k));
  if (k && cut.ipa.startsWith(shared) && end.ipa.startsWith(shared)) {
    cut = { w: cut.w.slice(k), ipa: cut.ipa.slice(shared.length) };
    end = { w: end.w.slice(k), ipa: end.ipa.slice(shared.length) };
  }
  const ipa = word.ipa.endsWith(cut.ipa) ? word.ipa.slice(0, word.ipa.length - cut.ipa.length) : word.ipa;
  return { stem: { w: word.w.slice(0, word.w.length - cut.w.length), ipa }, end, cut, plain, ended };
}
const inGroup = (g, letter) => !!GROUPS[g]?.has(letter);

const cells = (key) => (M[key] ?? "").split("|").map((c) => c.trim());
const list = (key) => cells(key).filter(Boolean);
// a cell `form [ipa]`, or `form [ipa] / form [ipa]` (a stem and its form before a vowel); `-`: nothing
function cell(c) {
  if (!c || c === "-") return null;
  const [a, b] = c.split(" / ").map((x) => { const m = x.match(/^(\S+)(?: \[([^\]]*)\])?$/); return { w: m[1], ipa: m[2] ?? m[1] }; });
  return b ? { ...a, beforeVowel: b } : a;
}
const ending = (key, i) => { const e = cells(key)[i]; return e === "-" ? "" : e; };
const endingIPA = (e) => M["ipa." + e] ?? e;

// ---- sounds joined ---------------------------------------------------------------------------------------------------
const VOWEL = /^[əɐaeiouɛɔʊɪʏøœy]/;
const syllables = (ipa) => (ipa.replace(/aɪ|aʊ|ɔʏ|[aeiouɛɔʊɪʏøœyɐə]ː?/g, "V").match(/V/g) ?? []).length;
// THE STEM AND ITS ENDING, in sound: before a vowel, a final consonant spelled voiced is voiced again (Tag [taːk] ->
// Tage [taːɡə], Haus -> Häuser, König -> Könige) and a vocalised r comes back (unser [ˈʊnzɐ] -> unsere [ˈʊnzəʁə], ihr
// -> ihre [ˈiːʁə]); before a consonant, a voiced one is devoiced (leben -> lebt [leːpt], beruhigen -> beruhigt
// [-ɪçt]). A word grown past one syllable gets its stress mark on the stem.
export function joinIPA(stemW, stemIPA, end, e = endingIPA(end)) {
  if (!end) return stemIPA;
  let s = stemIPA;
  if (VOWEL.test(e)) {
    if (/ɐ$/.test(s)) s = /[ːaeiouɛɔʊɪʏøœy]ɐ$/.test(s) ? s.slice(0, -1) + "ʁ" : s.slice(0, -1) + "əʁ";
    else if (/[bdgsv]$/.test(stemW) && !/ss$/.test(stemW)) {
      const m = s.match(/(ç|[ptksf])$/);
      if (m) s = s.slice(0, -m[1].length) + { p: "b", t: "d", k: "ɡ", s: "z", f: "v", "ç": "ɡ" }[m[1]];
    }
  } else if (!/^[lʁ].*[əaeiouɛɔʊɪʏøœy]/.test(e)) s = devoiced(s);   // (not before l/r and a vowel: bündle [ˈbʏndlə], regle)
  return stressed(s + e);
}
// a consonant at the end, before a consonant or the word's end: voiceless (studieren -> studiert [-iːɐt]: an r after a
// vowel, vocalised)
const devoiced = (s) => s.replace(/ɪɡ$/, "ɪç").replace(/[bdɡzv]$/, (c) => ({ b: "p", d: "t", "ɡ": "k", z: "s", v: "f" })[c])
  .replace(/([ːaeiouɛɔʊɪʏøœy])ʁ$/, "$1ɐ");
const stressed = (ipa) => (syllables(ipa) < 2 ? ipa.replace(/ˈ/g, "") : ipa.includes("ˈ") ? ipa : "ˈ" + ipa);
// a stem as a word of its own (beug! [bɔʏk])
const asWord = (stem) => ({ w: stem.w, ipa: stressed(devoiced(stem.ipa)) });
const join = (stem, end) => ({ w: stem.w + end, ipa: joinIPA(stem.w, stem.ipa, end) });
const joinEnd = (stem, end) => ({ w: stem.w + end.w, ipa: joinIPA(stem.w, stem.ipa, end.w, end.ipa) });   // (an ending with its sound)
// a verb form by its rule: the stem and the ending -- no ending: the stem as a word (komm!, sprach, ich knie)
// (nothing cut and nothing put -- the dictionary's sprach -- the form as it is; cut and ending the same -- dachte --
//  the form as a word)
const verbForm = (kind, word, i) => { const x = byRule(kind, word, i); return !x ? null : x.end.w ? joinEnd(x.stem, x.end) : x.cut.w || x.ended ? asWord(x.stem) : word; };

// ---- nouns -----------------------------------------------------------------------------------------------------------
// THE PLURAL'S IPA, from the singular's (the dictionary writes only the singular's): its ending (-e, -en, -er...), the
// umlaut of one vowel of the stem (Haus -> Häuser, also in a compound), a Latin or Greek ending swapped (Museum ->
// Museen, Stadion -> Stadien). null when the plural is something else.
const PL_ENDINGS = new Set(["", "e", "en", "n", "er", "s", "nen", "se", "ten"]);
const SWAPS = [["um", /[ʊu]ː?m$/, "en", "ən"], ["us", /[ʊu]ː?s$/, "en", "ən"], ["um", /[ʊu]ː?m$/, "a", "a"], ["us", /[ʊu]ː?s$/, "i", "i"],
  ["a", /aː?$/, "en", "ən"], ["o", /oː?$/, "en", "ən"], ["is", /ɪs$/, "en", "ən"], ["on", /(oː|ɔ)n$/, "ien", "iən"], ["on", /(oː|ɔ)n$/, "en", "ən"]];
// the UMLAUT (morphology.txt umlaut, umlaut-ipa): of a letter (capitals too), of a sound
let UMLAUT = {}, UMLAUT_IPA = [];
function readUmlaut() {
  UMLAUT = {};
  for (const [a, b] of cells("umlaut").map((c) => c.split(/\s+/))) Object.assign(UMLAUT, { [a]: b, [a.toUpperCase()]: b.toUpperCase() });
  UMLAUT_IPA = cells("umlaut-ipa").map((c) => c.split(/\s+/));
}
function umlautIPA(ipa) {   // the stem's LAST vowel that can take an umlaut (a diphthong's whole: aʊ, not its ʊ)
  for (let k = ipa.length - 1; k >= 0; k--) for (const [from, to] of UMLAUT_IPA)
    if (ipa.startsWith(from, k) && !(from === "ʊ" && ipa[k - 1] === "a")) return ipa.slice(0, k) + to + ipa.slice(k + from.length);
  return null;
}
export function pluralIPA(e) {
  const sg = e.word, pl = e.plural.split("/")[0];
  if (!pl || pl === "-" || pl === "PL" || pl.includes(" ")) return null;
  if (pl === sg) return e.ipa;
  for (const [tail, re, plTail, plIPA] of SWAPS)
    if (sg.endsWith(tail) && pl === sg.slice(0, -tail.length) + plTail && re.test(e.ipa)) return e.ipa.replace(re, "") + plIPA;
  let stem = null, ipa = e.ipa;
  if (pl.startsWith(sg)) stem = sg;
  else for (let i = sg.length - 1; i >= 0 && !stem; i--) {
    if (!UMLAUT[sg[i]] || (sg[i] === "u" && sg[i - 1] === "a")) continue;   // (in au the a takes the umlaut)
    const cand = sg.slice(0, i) + UMLAUT[sg[i]] + sg.slice(i + 1);
    if (pl.startsWith(cand)) { stem = cand; ipa = umlautIPA(e.ipa); }
  }
  const end = stem && pl.slice(stem.length);
  if (!ipa || end === null || !PL_ENDINGS.has(end)) return null;
  const ss = end.startsWith("s") && ipa.endsWith("s");   // (Bus -> Busse: one s, and voiceless -- as after ss)
  return joinIPA(ss ? sg + "s" : sg, ipa, ss ? end.slice(1) : end);
}

// a masculine noun of the N-DECLENSION (der Junge, den Jungen, dem Jungen, des Jungen)
// (a compound declines as its last part: Stausee as See, Vorname as Name)
const endsAs = (word, key) => list(key).some((x) => word.toLowerCase().endsWith(x.toLowerCase()));
function isWeak(e) {
  if (e.article !== "der" || endsAs(e.word, "noun.mixed") || endsAs(e.word, "noun.not-weak")) return false;
  if (list("noun.weak-words").includes(e.word)) return true;
  const pl = e.plural.split("/")[0];
  return (pl === e.word + "n" || pl === e.word + "en") && list("noun.weak-endings").some((x) => e.word.endsWith(x));
}

// an ADJECTIVAL noun: declined as an adjective (der Beteiligte, ein Beteiligter, die Beteiligten) -- one the dictionary
// writes with its plural as itself, ending in -e, a person's (der, der/die)
export const isAdjectival = (e) => e.word.endsWith("e") && e.plural === e.word && /^der(\/die)?$/.test(e.article ?? "");

// a noun's form; an adjectival noun's by the declension of its determiner (`decl`) and its gender (`g`)
export function noun(e, kase, num, decl = "strong", g = "m") {
  if (isAdjectival(e)) return adj(e, decl, kase, num === "pl" ? "pl" : g);
  if (num === "pl") {
    const w = e.plural === "PL" ? e.word : e.plural.split("/")[0], base = { w, ipa: e.plural === "PL" ? e.ipa : pluralIPA(e) ?? e.ipa };
    // (the dative plural's -n: after -e, -el, -er or a consonant -- not after -n, -s or another vowel: den USA, den Autos)
    return kase === "dat" && !/[ns]$/i.test(w) && !/[aiouyäöü]$/i.test(w) ? join(base, "n") : base;   // (den USA)
  }
  const base = { w: e.word, ipa: e.ipa };
  if (isWeak(e)) {   // its ending: the plural's (Nachbar -> Nachbarn, Mensch -> Menschen; der Herr, den Herrn)
    const pl = e.plural.split("/")[0], tail = e.word !== "Herr" && pl.startsWith(e.word) && pl.slice(e.word.length);
    return kase === "nom" ? base : join(base, tail || (/e$|r$/.test(e.word) ? "n" : "en"));
  }
  if (e.article === "der" && endsAs(e.word, "noun.mixed")) return kase === "nom" ? base : join(base, kase === "gen" ? "ns" : "n");   // (der Name, den Namen, des Namens)
  if (kase === "gen" && /^(der|das)$/.test(e.article ?? "")) {
    const es = !list("noun.gen-s-only").includes(e.word) && (list("noun.gen-es-after").some((x) => e.word.endsWith(x)) || syllables(e.ipa) < 2);
    return join(base, es ? "es" : "s");
  }
  return base;
}

// ---- determiners -----------------------------------------------------------------------------------------------------
// def (der), indef (ein), kein, a possessive (its stem: mein, ihr...), a der-word (dies, jed, welch). `decl`: how the
// adjectives after it are declined
export function det(kind, kase, g, stemName) {
  const ci = CASE[kase], gi = GENDER[g];
  if (kind === "def") return { ...cell(cells("det.def." + kase)[gi]), decl: "weak" };
  if (kind === "der-word") {
    const stem = cell(M["derword." + stemName]);
    return { ...join(stem, ending("ending.der." + kase, gi)), decl: "weak" };
  }
  // ein, kein, possessives: a stem and the ein-endings (ein has no plural: none)
  const name = kind === "indef" ? "ein" : kind === "kein" ? "kein" : stemName;
  if (name === "ein" && g === "pl") return null;
  const stem = cell(M["einword." + name]), end = ending("ending.ein." + kase, gi);
  const before = end && VOWEL.test(endingIPA(end)) && stem.beforeVowel;
  return { w: (before ? stem.beforeVowel.w : stem.w) + end, ipa: before ? joinIPA(stem.beforeVowel.w, stem.beforeVowel.ipa, end) : joinIPA(stem.w, stem.ipa, end), decl: "mixed" };
}
// the possessive stem for a possessor (1sg, 3sg.f, formal...)
export const possessive = (who) => Object.fromEntries(cells("possessive").map((c) => c.split(" ")))[who];

// ---- adjectives ------------------------------------------------------------------------------------------------------
// an adjective's DEGREE stems: comparative (größer), superlative (größt -- am größten, der größte): the entry's
// comparison (größer/am größten) or the rule (schneller, am schnellsten; after -d, -t, -s, -z: am ältesten), spoken as
// the positive's sounds with the umlaut the spelling shows (größer [ˈɡʁøːsɐ]); the suppletive ones from adj.degree-ipa
export function degree(e, which) {
  const [cw, sw] = (e.comparison ?? "").split("/");
  const form = which === "comp" ? cw : sw?.replace(/^am /, "").replace(/en$/, "");   // (am größten -> größt)
  if (!form) {
    if (which === "comp") return join(adjStem(e, "er"), "er");
    return join({ w: e.word, ipa: e.ipa }, /([dtsßzxaeiouäöüy]|sch)$/.test(e.word) ? "est" : "st");   // (am ältesten, am neuesten)
  }
  const own = cells("adj.degree-ipa").map(cell).find((c) => c.w === form);
  if (own) return own;
  const stem = adjStem(e, "er"), um = umlautWord(e.word);
  for (const [w, ipa] of [[e.word, e.ipa], [stem.w, stem.ipa], [um, umlautIPA(e.ipa)]])
    if (w && ipa && form.startsWith(w)) return { w: form, ipa: joinIPA(w, ipa, form.slice(w.length)) };
  return { w: form, ipa: e.ipa };
}
const umlautWord = (w) => { for (let i = w.length - 1; i >= 0; i--) if (UMLAUT[w[i]] && !(w[i] === "u" && w[i - 1] === "a")) return w.slice(0, i) + UMLAUT[w[i]] + w.slice(i + 1); return null; };
// an adjective's stem before an ending: its own (adj.stem.hoch), or by rule.adj-stem (dunkel -> dunkl, leise -> leis)
function adjStem(e, end) {
  const special = M["adj.stem." + e.word] && cell(M["adj.stem." + e.word]);
  if (special) return special;
  const word = { w: e.word, ipa: e.ipa }, x = end ? byRule("adj-stem", word) : null;
  return !x ? word : { w: x.stem.w + x.end.w, ipa: x.stem.ipa + x.end.ipa };   // (a stem: its sounds as they are -- flexibl [flɛˈksiːbl])
}

// the adjective before a noun, declined; `deg` comp or sup (ein größeres Haus, der größte Baum)
export function adj(e, decl, kase, g, deg = null) {
  if (list("adj.invariant").includes(e.word)) return { w: e.word, ipa: e.ipa };
  const end = ending(`ending.adj.${decl}.${kase}`, GENDER[g]);
  if (deg) { const s = degree(e, deg); return s.w === "mehr" ? s : join(s, end); }   // (mehr: no ending)
  return join(adjStem(e, end), end);
}

// ---- pronouns --------------------------------------------------------------------------------------------------------
export const pron = (who, kase) => cell(cells("pron." + who)[CASE[kase]]);
export const reflexive = (who, kase) => cell(cells("reflexive." + (/^3|formal/.test(who) ? "3" : who))[kase === "dat" ? 1 : 0]);
export const relpron = (g, kase) => cell(cells((kase === "dat" || kase === "gen" ? "relative." : "det.def.") + kase)[GENDER[g]]);
export const wh = (kind, kase = "nom") => cell(cells("wh." + kind)[CASE[kase] ?? 0]);

// a preposition and a thing as its object, in one word (mit ihm -> damit; auf A -> darauf), or null (in A: none)
export function daWord(prep, kase) {
  const c = cells("da-word").find((x) => [prep, `${prep}.${kase}`].includes(x.split(":")[0].trim()));
  return c ? cell(c.split(":")[1].trim()) : null;
}

// ... the question's (womit, worauf): the da-word's form with wo
export function woWord(prep, kase) {
  const d = daWord(prep, kase);
  return d && { w: d.w.replace(/^da/, "wo"), ipa: d.ipa.replace(/^da/, "vo") };
}

// a preposition and the definite article it folds with (in dem -> im), or null
export function contraction(prep, article) {
  const c = cells("contraction").find((x) => x.split(":")[0].trim() === `${prep} ${article}`);
  return c ? cell(c.split(":")[1].trim()) : null;
}

// ---- verbs -----------------------------------------------------------------------------------------------------------
// a verb's PARTS: its separable prefix (an·rufen), whether it is reflexive (sich freuen) and its core (rufen) -- each
// spelled and spoken; the forms of the core: the rules (rule.present ...)
function parts(e) {
  const refl = e.word.startsWith("sich "), word = e.word.replace(/^sich /, ""), wordIPA = e.ipa.replace(/^zɪç /, "");
  let prefix = null, core = { w: word, ipa: wordIPA };
  if ((e.parts ?? "").includes("·")) {
    const pw = e.parts.replace(/^sich /, "").split("·")[0].replace(/\|/g, "");
    const known = list("verb.separable").map(cell).find((p) => p.w === pw);
    const bare = wordIPA.replace(/ˈ/g, "");
    if (known && bare.startsWith(known.ipa.replace(/ˈ/g, ""))) {
      prefix = known;
      const rest = bare.slice(known.ipa.replace(/ˈ/g, "").length), cw = word.slice(pw.length);
      // (the core's stress: on its first syllable, or past a never-stressed prefix -- be·wahren [bəˈvaːʁən])
      const un = list("verb.unstressed-prefix").map(cell).find((p) => cw.startsWith(p.w) && rest.startsWith(p.ipa));
      core = { w: cw, ipa: syllables(rest) < 2 ? rest : un ? un.ipa + "ˈ" + rest.slice(un.ipa.length) : "ˈ" + rest };
    }
  }
  return { refl, prefix, core, modal: list("verb.modal").includes(core.w) };
}
// an irregular form from the entry (its first word: `spricht an` -> spricht), with its IPA
function given(e, k) {
  if (!e.forms) return null;
  const w = e.forms.split("/")[k].split(" ")[0], ipa = (e.formsIpa ?? "").split("/")[k]?.split(" ")[0];
  return { w, ipa: ipa || w };
}

// the FINITE form: tense present, past, subj1 (Konjunktiv I: er sei, er komme) or subj2 (Konjunktiv II: hätte,
// wäre, könnte -- only the verbs with a paradigm for it; null for the rest, which take würde + infinitive)
export function finite(e, tense, person) {
  const p = parts(e), pi = PERSON[person];
  const paradigm = M[`paradigm.${p.core.w}.${tense}`];
  if (paradigm) return { ...cell(cells(`paradigm.${p.core.w}.${tense}`)[pi]), prefix: p.prefix, refl: p.refl };
  if (tense === "subj2") {   // (käme, fände, brächte: verb.subj2-own; null: würde + infinitive)
    const past = given(e, 1);
    if (!past || !list("verb.subj2-own").includes(p.core.w)) return null;
    return { ...verbForm(past.w.endsWith("te") ? "subj2-mixed" : "subj2", past, pi), prefix: apart(p.prefix), refl: p.refl };
  }
  let form;
  if (tense === "present") form = present(e, p, pi);
  else if (tense === "subj1") form = verbForm("subj1", p.core, pi);
  else form = past(e, p, pi);
  return { ...form, prefix: apart(p.prefix), refl: p.refl };
}
// a separated prefix as it is written: two words where it is two prefixes (wiederher -> stellt es wieder her)
const apart = (pre) => {
  if (!pre || !list("verb.separable-apart").includes(pre.w)) return pre;
  const first = list("verb.separable").map(cell).find((x) => x.w !== pre.w && pre.w.startsWith(x.w));
  return first ? { ...pre, w: first.w + " " + pre.w.slice(first.w.length) } : pre;
};
// a PARTICIPLE before a noun, declined: I (lachend -> die lachenden Kinder), II (gekocht -> das gekochte Ei), zu + I
// (das zu lesende Buch, die anzurufende Frau) -- tokens
export function participleAdj(e, kind, decl, kase, g) {
  const end = ending(`ending.adj.${decl}.${kase}`, GENDER[g]), inf = infinitive(e), p = parts(e);
  const one = { w: inf.w + "d", ipa: inf.ipa + "t" };   // (Partizip I: the infinitive and -d)
  if (kind === "II") { const pt = participle(e); return [join(pt, end)]; }
  if (kind === "I") return [join(one, end)];
  if (p.prefix) { const z = zuInfinitive(e)[0]; return [join({ w: z.w + "d", ipa: z.ipa + "t" }, end)]; }   // (anzurufende)
  return [{ w: "zu", ipa: M["ipa.zu"] ?? "tsu" }, join(one, end)];
}
// an ORDINAL declined (der dritte, am dritten): its stem from `ordinal`, by number 1-12 or 20
export function ordinal(n, decl, kase, g) {
  const stems = cells("ordinal").map(cell), stem = stems[n <= 12 ? n - 1 : 12];
  return join(stem, ending(`ending.adj.${decl}.${kase}`, GENDER[g]));
}
// the passive's participle of werden: worden
export const passiveParticiple = () => cell(M["verb.passive-participle"]);

// the present by rule.present -- but a STEM CHANGE the dictionary gives (er spricht): du and er from it
function present(e, p, pi) {
  const third = given(e, 0), regular3 = verbForm("present", p.core, 2), stem = byRule("present", p.core, 2).plain;
  if (third && third.w !== regular3.w && (pi === 1 || pi === 2)) {
    if (pi === 2) return third;
    const s = inGroup("s-sound", third.w.replace(/t$/, "").slice(-1));
    // (er spricht -> du sprichst; but a stem in -t keeps it: er hält -> du hältst, er rät -> du rätst)
    const base = third.w.endsWith("t") && !/tt$/.test(third.w) && !stem.w.endsWith("t") ? { w: third.w.slice(0, -1), ipa: third.ipa.replace(/t$/, "") } : third;
    return s && base !== third ? third : join(base, "st");
  }
  return verbForm("present", p.core, pi);
}

// the past: weak by rule.past; strong (sprach) and mixed (brachte) from the dictionary's past by their rules
function past(e, p, pi) {
  const given1 = given(e, 1);
  return given1 ? verbForm(given1.w.endsWith("te") ? "past-mixed" : "past-strong", given1, pi) : verbForm("past", p.core, pi);
}

export function participle(e) {
  const g = given(e, 2);
  if (g) return { w: e.forms.split("/")[2].split(" ").pop(), ipa: (e.formsIpa ?? "").split("/")[2]?.split(" ").pop() || g.ipa };
  // ge- only where the stress is on the first syllable: not besuchen, wiederholen, studieren [bəˈzuːxən, viːdɐˈhoːlən]
  const p = parts(e), ge = !p.core.ipa.startsWith("ˈ") && p.core.ipa.includes("ˈ") ? "" : "ge";
  const { stem, end } = byRule("participle", p.core);   // (its ending: rule.participle -- gearbeitet, gekniet)
  const core = { w: ge + stem.w, ipa: (ge ? "ɡə" : "") + stem.ipa.replace(/ˈ/g, "") };
  const done = { w: core.w + end.w, ipa: joinIPA(core.w, core.ipa, end.w, end.ipa) };
  const stressed = done.ipa.replace(/ˈ/g, ""), stemStart = ge ? 2 : 0;
  const ipa = ge ? "ɡəˈ" + stressed.slice(stemStart) : (stem.ipa.includes("ˈ") ? stem.ipa.replace(/ˈ.*/, "") + "ˈ" + stressed.slice(stem.ipa.indexOf("ˈ")) : done.ipa);
  return p.prefix ? { w: p.prefix.w + done.w, ipa: "ˈ" + p.prefix.ipa.replace(/ˈ/g, "") + ipa.replace(/ˈ/g, "") } : { w: done.w, ipa };
}

// the zu-INFINITIVE: zu before the infinitive (zu lesen), inside a separable one (anzurufen [ˈantsuʁuːfən])
export function zuInfinitive(e) {
  const p = parts(e), zu = { w: "zu", ipa: M["ipa.zu"] ?? "tsu" };
  if (!p.prefix) return [zu, infinitive(e)];
  return [{ w: p.prefix.w + "zu" + p.core.w, ipa: "ˈ" + p.prefix.ipa.replace(/ˈ/g, "") + zu.ipa + p.core.ipa.replace(/ˈ/g, "") }];
}

export function infinitive(e) {
  return { w: e.word.replace(/^sich /, ""), ipa: e.ipa.replace(/^zɪç /, "") };
}

// the imperative: du (the stem, or a changed e -> i stem: sprich!), ihr (as the present), Sie (the infinitive)
export function imperative(e, person) {
  const p = parts(e);
  const own = { sein: { "2sg": ["sei", "zaɪ"], "2pl": ["seid", "zaɪt"], formal: ["seien", "ˈzaɪən"] }, haben: { "2sg": ["hab", "haːp"] }, werden: { "2sg": ["werd", "veːɐt"] } }[p.core.w]?.[person];
  if (own) return { w: own[0], ipa: own[1], prefix: p.prefix, refl: p.refl };
  if (person === "formal") return { ...infinitiveCore(p), prefix: p.prefix, refl: p.refl };
  if (person === "2pl") return { ...present(e, p, 4), prefix: p.prefix, refl: p.refl };
  // (a stem changed to i -- er spricht: sprich!; else rule.imperative: arbeite! sammle! komm!)
  const third = given(e, 0), stem = byRule("present", p.core, 2).plain;
  if (third && /i/.test(third.w) && !/i/.test(stem.w) && third.w.endsWith("t")) return { w: third.w.slice(0, -1), ipa: third.ipa.replace(/t$/, ""), prefix: p.prefix, refl: p.refl };
  return { ...verbForm("imperative", p.core, 0), prefix: p.prefix, refl: p.refl };
}
const infinitiveCore = (p) => p.core;

export const isModal = (e) => parts(e).modal;
export const separable = (e) => parts(e).prefix;
export const isReflexive = (e) => parts(e).refl;
// a finite form with its separable prefix joined to it (in a subordinate clause: ..., dass er anruft)
export const joined = (f) => (f.prefix ? { w: f.prefix.w.replace(" ", "") + f.w, ipa: "ˈ" + f.prefix.ipa.replace(/ˈ/g, "") + f.ipa.replace(/ˈ/g, "") } : f);
