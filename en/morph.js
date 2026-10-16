// ENGLISH MORPHOLOGY BY RULE: the regular forms of a verb (-s, -ing, -ed), an adjective's -er/-est stem -- used by the
// realizer (en/realize.js) and the trainer (engine/questions.js: the regular form is the wrong option of an irregular
// verb, goed for went; engine/paradigm.js: a word's forms for the forms exercise).

export const syllables = (w) => Math.max(1, (w.toLowerCase().match(/[aeiouy]+/g) ?? []).length - (/[^aeiou]e$/.test(w) && !/le$/.test(w) ? 1 : 0));
// (a final consonant doubled only where the last syllable is stressed: stop -> stopped, preFER -> preferred, VOmit ->
//  vomited; British doubles a final l after one vowel: travel -> travelled)
//  (a syllabic n, l, m at the end is a syllable of its own, unstressed: burden [ˈbɜːdn] -> burdened)
const stressedEnd = (w, ipa) => syllables(w) <= 1 || /[^aeiou][aeiou]l$/.test(w) || (ipa ? ((ipa.split("ˈ").pop().match(/[aeiouæɑɒɔəɛɜɪʊʌ]+/g) ?? []).length <= 1 && !/[^aeiouæɑɒɔəɛɜɪʊʌːˈ][nlm]$/.test(ipa)) : /(fer|mit|gret|get|gin|cur|trol|pel|bel)$/.test(w));
export const doubles = (w, ipa = null) => /(^|[^aeiou])[aeiou][^aeiouwxy]$/.test(w) && stressedEnd(w, ipa);
// a verb's regular form: s (he reads), ing, ed (the past and participle); ipa: the verb's, for its stress
export function regular(w, form, ipa = null) {
  if (form === "s") return /(s|x|z|ch|sh|o)$/.test(w) ? w + "es" : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + "ies" : w + "s";
  if (form === "ing") return /ie$/.test(w) ? w.slice(0, -2) + "ying" : /[^aeiou]e$/.test(w) && !/(ee|ye|oe)$/.test(w) ? w.slice(0, -1) + "ing" : doubles(w, ipa) ? w + w.slice(-1) + "ing" : w + "ing";
  return /e$/.test(w) ? w + "d" : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + "ied" : /c$/.test(w) ? w + "ked" : doubles(w, ipa) ? w + w.slice(-1) + "ed" : w + "ed";
}

// a verb's form: base, s (the present, by person), past, pp, ing; were: the unreal past (if I were)
export function verbForm(v, form, person = "3sg", were = false) {
  const w = v.word, [h, ...rest] = w.split(" "), tail = rest.length ? " " + rest.join(" ") : "";
  const third = /^3sg/.test(person);
  if (h === "be") return { base: "be", pp: "been", ing: "being", s: person === "1sg" ? "am" : third ? "is" : "are", past: were ? "were" : person === "1sg" || third ? "was" : "were" }[form] + tail;
  if (h === "have") return { base: "have", pp: "had", ing: "having", s: third ? "has" : "have", past: "had" }[form] + tail;
  if (h === "do") return { base: "do", pp: "done", ing: "doing", s: third ? "does" : "do", past: "did" }[form] + tail;
  if ((form === "past" || form === "pp") && v.forms) { const [p, pp] = v.forms.split("/"); return form === "past" ? p : pp; }
  if (form === "base") return w;
  if (form === "s") return (third ? regular(h, "s") : h) + tail;
  return regular(h, form, rest.length ? null : v.ipa) + tail;
}
// a noun's plural: the dictionary's (children), else the word (a mass noun, one only plural)
export const plural = (n) => (!n.plural || n.plural === "-" || n.plural === "PL" ? n.word : n.plural);
// an adjective's comparative and superlative (comp, sup): the dictionary's or COMP's (the lexicon's comp list), by rule
export function compare(a, form, COMP = {}) {   // comp, sup: better / best; taller / tallest; more beautiful / most beautiful
  const w = a.word.replace(/^be /, ""), c = a.comparison || COMP[w];
  if (c) return c.split("/")[form === "comp" ? 0 : 1];
  if (!w.includes(" ") && (syllables(w) <= 1 || (/[^aeiou]y$/.test(w) && syllables(w) === 2))) {
    const stem = /e$/.test(w) ? w.slice(0, -1) : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + "i" : doubles(w) ? w + w.slice(-1) : w;
    return stem + (form === "comp" ? "er" : "est");
  }
  return (form === "comp" ? "more " : "most ") + w;
}
