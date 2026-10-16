// LETTERS TO SOUNDS: the IPA of a word the dictionary has not -- an inflected form (comió, parlons, walked), a plural
// -- from the language's own rules, <lang>/rules/sounds.txt:
//
//   class NAME = x y z                 a set of letters (in a pattern: {NAME}) or of IPA symbols (a suffix's `after`)
//   suffix ING = IPA | IPA [after CLASS] ...   the word is a dictionary word + this ending: that word's IPA + the ending's
//                                      (the alternative whose `after` class has the base's last sound, else the plain one;
//                                      the base is tried as written, with an e put back -- making: make --, with ie -> y)
//   letters PATTERN = IPA [after /RE/]  the spelling read left to right, at each place the first rule whose PATTERN (a
//                                      regular expression, {NAME} a class) matches there; `after` a regular expression
//                                      the letters already read must end with (a d between vowels is ð); an empty IPA
//                                      says the letters are silent, `$` that they are said as written (a, m), `$1`
//                                      that the pattern's first group is (a doubled consonant once)
//   word X = IPA                       a word's own sound, said as written here (the irregular forms the dictionary has
//                                      no sound for: children, went, was)
//   stem ENDING = A B -                the word is a dictionary word's STEM + this ending, the dictionary word being the
//                                      stem + A (or B; `-` nothing): книги = книг + и, the dictionary has книг + а. The
//                                      base's STRESS is carried over (the same vowel of the stem; on the ending when
//                                      the base had it on its own) as an acute (U+0301) after the stressed letter, and
//                                      the letter rules read the word so marked (`letters а́ = ˈa`, `letters а = ə`):
//                                      Russian, whose vowels sound by their place against the stress
//   stress = accent | final | penult | none   where the stress mark goes when the rules made the word: `accent` -- an
//                                      accented letter's rule writes ˈ, else the Spanish rule (a word ending in a vowel,
//                                      n or s on its second-last syllable, any other on its last); `final` the last
//                                      syllable; `penult` the second-last always (Polish)
//
//   const ipaOf = await loadSounds("es/rules/sounds.txt", byWord)    (byWord: the dictionary's words -> entries)
//   ipaOf("comieron") -> "koˈmjeɾon"   ("" when nothing is known and there are no letter rules)
const VOWELS = "aeiouyæɒɜɑʌɪʊəøœɛɔʏɐɨɤ";
const isVowel = (ch) => VOWELS.includes(ch) || ch === "̃";
const ACUTE = "\u0301";

export async function loadSounds(url, byWord) {
  const R = { class: {}, suffix: [], letters: [], word: new Map(), stress: "none", stem: [], vowels: null };
  const text = await fetch(url).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  const cls = (s) => s.replace(/\{(\w+)\}/g, (_, n) => `[${(R.class[n] ?? "").replace(/\s+/g, "")}]`);
  for (const raw of text.split("\n")) {
    const s = raw.split(/\s--\s/)[0].trim();
    if (!s || s.startsWith("#")) continue;
    let m;
    if ((m = s.match(/^class (\w+) = (.*)$/))) R.class[m[1]] = m[2].trim();
    else if ((m = s.match(/^stress = (\w+)$/))) R.stress = m[1];
    else if ((m = s.match(/^word (\S+) = (\S+)$/))) R.word.set(m[1].toLowerCase(), m[2]);
    else if ((m = s.match(/^stem (\S+) = (.*)$/))) R.stem.push({ end: m[1], alts: m[2].trim().split(/\s+/).map((a) => (a === "-" ? "" : a)) });
    else if ((m = s.match(/^suffix (\S+) = (.*)$/))) R.suffix.push({ end: m[1], alts: m[2].split("|").map((a) => { const x = a.trim().match(/^(\S*)\s*(?:\[after (\w+)\])?$/); return { ipa: x[1], after: x[2] ?? null }; }) });
    else if ((m = s.match(/^letters (\S+) =(?: (\S*))?(?: after \/(.+)\/)?$/))) R.letters.push({ re: new RegExp("^(?:" + cls(m[1]) + ")", "u"), ipa: m[2] ?? "", after: m[3] ? new RegExp("(?:" + cls(m[3]) + ")$", "u") : null });
    else throw new Error(`${url}: cannot read "${s}"`);
  }
  const dictIPA = (w) => byWord.get(w)?.ipa || byWord.get(w.toLowerCase())?.ipa || R.word.get(w.toLowerCase()) || null;   // (a suffix on an irregular form too: children's)
  // the letters that are vowels in this language's spelling (its `class vowel`), for the stem rules
  const letterVowels = () => (R.vowels ??= new Set((R.class.vowel ?? "").split(/\s+/).filter(Boolean)));
  const nVowels = (w) => [...w].filter((ch) => letterVowels().has(ch)).length;
  // the base's stressed vowel, counted: how many IPA vowels stand before its ˈ (-1: none marked)
  const stressIndex = (ipa) => { const i = ipa.indexOf("ˈ"); return i < 0 ? -1 : [...ipa.slice(0, i)].filter(isVowel).length; };
  // the word with an acute after its n-th vowel letter (0-based)
  const marked = (w, n) => { let k = -1, out = ""; for (const ch of w) { out += ch; if (letterVowels().has(ch) && ++k === n) out += ACUTE; } return out; };
  // STEM RULES: the word as a dictionary word's stem + an ending; -> the word with the base's stress marked, or null
  function viaStem(w) {
    for (const r of R.stem) {
      if (!w.endsWith(r.end) || w.length <= r.end.length) continue;
      const stem = w.slice(0, w.length - r.end.length);
      for (const a of r.alts) {
        const ipa = dictIPA(stem + a);
        if (!ipa) continue;
        const at0 = stressIndex(ipa), inStem = nVowels(stem), at = at0 < 0 && nVowels(stem + a) === 1 ? 0 : at0;   // (a monosyllable: its one vowel)
        if (at < 0) return w;
        if (at < inStem) return marked(w, at);                             // (the stress stays on the stem's vowel)
        return nVowels(r.end) ? marked(w, inStem) : marked(w, inStem - 1);   // (on the ending: on the new ending's first vowel)
      }
    }
    return null;
  }
  const last = (ipa) => ipa.replace(/[ˈˌː]/g, "").slice(-2).match(/(tʃ|dʒ|.)$/)[1];
  function viaSuffix(w) {
    for (const r of R.suffix) {
      if (!w.endsWith(r.end) || w.length <= r.end.length) continue;
      const stem = w.slice(0, -r.end.length);
      for (const base of [stem, stem + "e", stem.replace(/i$/, "y"), stem.replace(/(.)\1$/, "$1")]) {
        const ipa = dictIPA(base);
        if (!ipa) continue;
        const l = last(ipa), alt = r.alts.find((a) => a.after && (R.class[a.after] ?? "").split(/\s+/).includes(l)) ?? r.alts.find((a) => !a.after);
        if (alt) return ipa + alt.ipa;
      }
    }
    return null;
  }
  function viaLetters(w) {
    if (!R.letters.length) return null;
    let out = "", i = 0;
    while (i < w.length) {
      const rest = w.slice(i), rule = R.letters.find((r) => r.re.test(rest) && (!r.after || r.after.test(w.slice(0, i))));
      if (!rule) { i++; continue; }   // (a letter no rule reads is left out)
      const got = rest.match(rule.re)[0];
      out += rule.ipa === "$" ? got : rule.ipa.includes("$1") ? rule.ipa.replace("$1", rest.match(rule.re)[1]) : rule.ipa; i += got.length;   // ($1ː: a doubled letter said once, long)
    }
    return stressed(out, w);
  }
  // the stress mark put before the stressed syllable's onset (the consonants before its vowel)
  function stressed(ipa, w) {
    const nuclei = [...ipa.matchAll(/[ˈ]?[jw]?[aeiouyæɒɜɑʌɪʊəøœɛɔʏɐɨɤ]̃?(?:[aeiouyæɒɜɑʌɪʊəøœɛɔʏɐɨɤ]̃?)*/gu)].filter((m) => m[0].replace("ˈ", ""));
    if (!nuclei.length) return ipa;
    let at = -1;
    if (ipa.includes("ˈ")) at = ipa.indexOf("ˈ");
    else if (R.stress === "accent") { const k = /[aeiouáéíóú]$|[ns]$/.test(w) && nuclei.length > 1 ? nuclei.length - 2 : nuclei.length - 1; at = nuclei[k].index; }
    else if (R.stress === "final") at = nuclei[nuclei.length - 1].index;
    else if (R.stress === "penult") at = nuclei[Math.max(0, nuclei.length - 2)].index;
    else return ipa;
    ipa = ipa.replace("ˈ", "");
    if (ipa.includes("ˈ")) return ipa;
    while (at > 0 && !isVowel(ipa[at - 1]) && ipa[at - 1] !== " ") at--;   // (back over the onset)
    return ipa.slice(0, at) + "ˈ" + ipa.slice(at);
  }
  // a word, a phrase (each word its own), a word with an apostrophe (l'ami: the parts joined)
  return function ipaOf(word) {
    const w = word.normalize("NFC").replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");   // (punctuation stuck to the word -- "dark," -- is not part of it)
    if (/\s/.test(w)) return w.split(/\s+/).map(ipaOf).join(" ").trim();
    const d = dictIPA(w);
    if (d) return d;
    if (!/\p{L}/u.test(w)) return "";
    const lw = w.toLowerCase(), plain = lw.replace(/[’']/g, "");
    return R.word.get(lw) ?? viaSuffix(lw) ?? viaLetters(R.stem.length ? viaStem(plain) ?? plain : plain) ?? "";
  };
}
