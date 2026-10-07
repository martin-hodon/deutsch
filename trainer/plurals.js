// German plurals by rule: the common ways a plural is made, and how often each is the right one for nouns like a
// given noun (same article, same ending) in the dictionary. A plural question's wrong options are other rules'
// forms, picked by that weight, so they look as possible as the right one.

// Each rule makes a plural from the singular, or null where it cannot apply
export const PLURAL_RULES = [
  { name: "unchanged",  make: w => w },                                           // der Lehrer, die Lehrer
  { name: "umlaut",     make: w => umlaut(w) },                                   // der Vater, die Väter
  { name: "-e",         make: w => (takesEnding(w) ? w + "e" : null) },             // der Tag, die Tage
  { name: "umlaut -e",  make: w => (takesEnding(w) && umlaut(w) ? umlaut(w) + "e" : null) },   // der Baum, die Bäume
  { name: "-er",        make: w => (takesEnding(w) ? w + "er" : null) },            // das Kind, die Kinder
  { name: "umlaut -er", make: w => (takesEnding(w) && umlaut(w) ? umlaut(w) + "er" : null) },  // das Haus, die Häuser
  { name: "-n",         make: w => (/(e|el|er)$/.test(w) ? w + "n" : null) },       // die Lampe, die Lampen
  { name: "umlaut -n",  make: w => (/(e|el|er)$/.test(w) && umlaut(w) ? umlaut(w) + "n" : null) }, // (never right: a lookalike)
  { name: "-en",        make: w => (takesEnding(w) && !/[aoiy]$/.test(w) ? w + "en" : null) },  // die Frau, die Frauen
  { name: "-nen",       make: w => (w.endsWith("in") ? w + "nen" : null) },         // die Lehrerin, die Lehrerinnen
  { name: "-se",        make: w => (w.endsWith("nis") ? w + "se" : null) },         // das Ergebnis, die Ergebnisse
  { name: "-s",         make: w => (/[sßxz]$/.test(w) ? null : w + "s") },          // das Auto, die Autos
  { name: "-a -o -um -us to -en", make: w => (/(?<!a)(um|us)$/.test(w) && w.length >= 5 || /[ao]$/.test(w) && w.length >= 4
                                              ? w.replace(/(a|o|um|us)$/, "en") : null) },  // das Museum, die Museen; das Konto, die Konten (not Haus)
];

// -e, -er, -en go on a stressed end (Tag, Tier, Frau), not after a vowel or an unstressed -el, -er, -en (Lehrer, Garten)
const takesEnding = w => !/[aeiouyäöü]$/.test(w) && !/[^aeiouäöü](el|er|en)$/.test(w);

// Garten -> Gärten, Haus -> Häus: the last a, o, u or au before the ending; null if there is none, or the word ends
// in a suffix that never takes one (Zeitung, Museum)
export function umlaut(word) {
  if (/(ung|(?<!a)um|(?<!a)us|ion|nis|schaft|heit|keit|tät|ling|tum)$/.test(word)) return null;
  const stem = word.replace(/(chen|lein|el|er|en|e)$/, "");
  const m = stem.match(/(au|a|o|u)([^aeiouäöüy]+)$/i);
  if (!m) return null;
  const vowel = m[1], plain = { au: "äu", a: "ä", o: "ö", u: "ü" }[vowel.toLowerCase()];
  const replaced = vowel[0] === vowel[0].toUpperCase() ? plain[0].toUpperCase() + plain.slice(1) : plain;
  return word.slice(0, m.index) + replaced + word.slice(m.index + vowel.length);
}

// Nouns of one class form their plurals alike: article + the ending that matters
const ENDINGS = ["chen", "lein", "schaft", "heit", "keit", "ung", "ion", "tät", "nis", "ie", "in", "um", "us",
                 "el", "er", "en", "e", "a", "o", "i", "y", "u"];
const nounClass = e => `${e.article} -${ENDINGS.find(ending => e.word.endsWith(ending)) ?? ""}`;
const rightPlurals = e => e.plural.split("/");          // `Wörter/Worte`: both are right

// For each noun class, how many nouns of the dictionary form their plural by each rule
export function countRules(nouns) {
  const counts = {};
  for (const e of nouns) {
    const byRule = (counts[nounClass(e)] ??= {});
    for (const rule of PLURAL_RULES) {
      if (rightPlurals(e).includes(rule.make(e.word))) byRule[rule.name] = (byRule[rule.name] ?? 0) + 1;
    }
  }
  return counts;
}

// The wrong plurals of a noun -> their weight: how often their rules are right in its class (+ a little for any rule)
export function wrongPlurals(e, counts = {}) {
  const inClass = counts[nounClass(e)] ?? {}, weights = new Map();
  for (const rule of PLURAL_RULES) {
    const form = rule.make(e.word);
    if (form && !rightPlurals(e).includes(form)) weights.set(form, (weights.get(form) ?? 0) + (inClass[rule.name] ?? 0) + 0.5);
  }
  return weights;
}
