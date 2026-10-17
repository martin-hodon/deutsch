// The kinds of question, for a pair of languages -- the one learned and the one it is learned with (modesFor). Each
// mode has
//   group              "words" (a word asked, spaced repetition) or "sentences" (a sentence made: engine/practice.js)
//   kind               a sentence mode's exercise: "order" (word order), "forms" (the form left out) or "overview" (the examples)
//   filter             the choice beside the level that narrows it: "category", "structure", "rule"
//   fits(entry)        can this entry be asked this way
//   label              what the tab says: a key of the learner's language (engine/text.js) or words as they are
//   make(entry, dict)  -> { prompt, hint, options (3, shuffled), answer, articles }
//   say: { ask(entry, dict), answer(entry, dict) } -> the IPA spoken when the question is shown / once it is answered
//        (speak.js, in the language learned); none: nothing said
// `articles`: the question is ABOUT der, die, das -- only then are they drawn in their colours (ui.js)
import { german, shown, slovak, spoken } from "./data.js";
import { LANGS } from "./langs.js";
import { pluralIPA } from "../de/morph.js";
import { countRules, wrongPlurals } from "../de/plurals.js";

const pick = list => list[Math.floor(Math.random() * list.length)];
const shuffle = list => list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(pair => pair[1]);

// A value of a Map value -> weight, the heavier the likelier
function pickWeighted(weights) {
  let r = Math.random() * [...weights.values()].reduce((a, b) => a + b, 0);
  for (const [value, weight] of weights) if ((r -= weight) < 0) return value;
  return [...weights.keys()].at(-1);
}

const ARTICLES = ["der", "die", "das"];
const IT_ARTICLES = ["il", "lo", "la", "l'"];   // (Italian: the singular ones)
// the Slavic genders and the nouns whose ending does not tell the gender: Russian -ь, a masculine on -а/-я, an
// indeclinable, a non-neuter on -о/-е; Polish a feminine on a consonant (noc, sól), a masculine on -a (mężczyzna), an
// indeclinable, a neuter on -um
const GENDERS = { ru: ["м", "ж", "с"], pl: ["m", "ż", "n"] };
const UNTOLD = {
  ru: (e) => /ь$/.test(e.word) || (e.gender === "м" && /[ая]$/.test(e.word)) || e.model === "нескл" || (e.gender !== "с" && /[ое]$/.test(e.word)),
  pl: (e) => (e.gender === "ż" && /[^aeiouyąęó]$/.test(e.word)) || (e.gender === "m" && /a$/.test(e.word)) || e.model === "ndm" || /um$/.test(e.word) || (e.gender === "n" && !/[oeę]$|um$/.test(e.word)),
};
const slavic = (e) => (e.lang === "pl" ? "pl" : "ru");
let pluralRuleCounts = null;                    // counted over the dictionary's nouns on the first plural question
let classifierCounts = null;                    // (Chinese: how common each measure word is in the dictionary)

export const MODES = {
  article: {
    label: "articles", group: "words", filter: "category",
    fits: e => e.pos === "N" && ARTICLES.includes(e.article),
    make: e => ({ prompt: "___ " + e.word, hint: slovak(e), options: ARTICLES, answer: e.article, articles: true }),
    say: { answer: spoken },                                          // (the word with its article, once it is known)
  },

  plural: {
    label: "plural", group: "words", filter: "category",
    fits: e => e.pos === "N" && e.plural !== "-" && e.plural !== "PL" && !e.plural.includes(" ") && wrongPlurals(e).size >= 2,
    make: (e, dict) => {
      pluralRuleCounts ??= countRules(dict.entries.filter(MODES.plural.fits));
      const wrong = wrongPlurals(e, pluralRuleCounts);
      const wrong1 = pickWeighted(wrong);
      wrong.delete(wrong1);
      const wrong2 = pickWeighted(wrong);
      const right = e.plural.split("/")[0];
      return { prompt: german(e), hint: slovak(e), options: shuffle([right, wrong1, wrong2].map(p => "die " + p)), answer: "die " + right };
    },
    say: { ask: spoken, answer: (e) => { const p = pluralIPA(e); return p && "diː " + p; } },   // (the singular asked, the plural answered)
  },

  // ITALIAN: the article of a noun -- il, lo, la or l' (the colours are German's: none here)
  itArticle: {
    label: "articles-it", group: "words", filter: "category",
    fits: e => e.pos === "N" && IT_ARTICLES.includes(e.article),
    make: e => ({ prompt: "___ " + e.word, hint: slovak(e), options: shuffle([e.article, ...shuffle(IT_ARTICLES.filter(a => a !== e.article)).slice(0, 2)]), answer: e.article }),
    say: { answer: spoken },
  },
  // RUSSIAN, POLISH: the gender of the nouns whose ending does not tell it (день, ночь; папа; кофе -- noc, sól; mężczyzna)
  gender: {
    label: "gender", group: "words", filter: "category",
    fits: e => e.pos === "N" && GENDERS[slavic(e)].includes(e.gender) && !e.word.includes(" ") && UNTOLD[slavic(e)](e),
    make: e => ({ prompt: "___ " + e.word, hint: slovak(e), options: GENDERS[slavic(e)], answer: e.gender }),
    say: { ask: spoken },
  },
  // RUSSIAN, POLISH: the aspect pair -- the imperfective asked, its perfective among two other verbs' perfectives
  aspect: {
    label: "aspect", group: "words", filter: "category",
    fits: e => e.pos === "V" && !!e.forms && !e.forms.replace(/ się$/, "").includes(" ") && !e.word.replace(/ się$/, "").includes(" "),
    make: (e, dict) => {
      const others = dict.entries.filter(o => o.pos === "V" && o.forms && !o.forms.includes(" ") && o.forms !== e.forms && o.word !== e.word);
      const near = others.filter(o => o.category === e.category), pool = near.length >= 2 ? near : others;
      const wrong = shuffle(pool).slice(0, 2).map(o => o.forms);
      return { prompt: e.word, hint: slovak(e), options: shuffle([e.forms, ...wrong]), answer: e.forms };
    },
    say: { ask: spoken },
  },
  // CHINESE: the measure word -- 一 ___ 书: 本, not 个 or 张 (the wrong ones the dictionary's commonest other measure words)
  classifier: {
    label: "measure-words", group: "words", filter: "category",
    fits: e => e.pos === "N" && !!e.classifier,
    make: (e, dict) => {
      classifierCounts ??= dict.entries.filter(MODES.classifier.fits).reduce((m, o) => m.set(o.classifier, (m.get(o.classifier) ?? 0) + 1), new Map());
      const wrong = new Map([...classifierCounts].filter(([c]) => c !== e.classifier));
      const w1 = pickWeighted(wrong); wrong.delete(w1);
      const w2 = pickWeighted(wrong);
      return { prompt: "一 ___ " + e.word, hint: slovak(e) + (e.pinyin ? ` · ${e.pinyin}` : ""), options: shuffle([e.classifier, w1, w2]), answer: e.classifier };
    },
    say: { ask: spoken },
  },

};

// THE MODES OF A PAIR: the learned language's own (German: der/die/das, the plural), and the
// words both ways -- with Slovak, an entry's own translations; with another language, the words of its concept there.
// (German with Slovak keeps the names it always had, vocab and vocabReverse: the answers given are kept by them.)
// dicts: { de, en, ... } the loaded dictionaries
export function modesFor(learn, other, dicts) {
  const there = other === "sk" ? null : dicts[other];
  const meaning = there ? (e) => (there.byConcept.get(`${e.pos}|${e.concept}`) ?? []).slice(0, 2).map(shown).join(", ") : slovak;
  const fits = there ? (e) => there.byConcept.has(`${e.pos}|${e.concept}`) : () => true;
  const name = (l) => LANGS[l].name;
  const old = learn === "de" && other === "sk";
  return {
    ...(learn === "de" ? { article: MODES.article, plural: MODES.plural } : {}),
    ...(learn === "ru" || learn === "pl" ? { [`gender:${learn}`]: MODES.gender, [`aspect:${learn}`]: MODES.aspect } : {}),
    ...(learn === "it" ? { "article:it": MODES.itArticle } : {}),
    ...(learn === "zh" ? { "classifier:zh": MODES.classifier } : {}),
    [old ? "vocab" : `vocab:${learn}-${other}`]: {
      label: `${name(learn)} → ${name(other)}`, group: "words", filter: "category", fits,
      make: (e, dict) => vocabulary(e, dict, shown, meaning),
      say: { ask: spoken },                                           // (the learned word asked)
      examples: "shown",                                              // (its sentences with the question, the word marked)
    },
    [old ? "vocabReverse" : `vocab:${other}-${learn}`]: {
      label: `${name(other)} → ${name(learn)}`, group: "words", filter: "category", fits,
      make: (e, dict) => vocabulary(e, dict, meaning, shown),
      say: { answer: spoken },                                        // (the learned word, once answered)
      examples: "hidden",                                             // (its sentences with the question, the word a blank till answered)
    },
    // the grammar: sentences made for the language learned (engine/practice.js) -- its syntax (the word order), its
    // morphology (a form left out); the labels are keys of the learner's language (engine/text.js)
    [`order:${learn}`]: { label: "syntax", group: "sentences", kind: "order", filter: "structure" },
    [`forms:${learn}`]: { label: "morphology", group: "sentences", kind: "forms", filter: "rule" },
    [`overview:${learn}`]: { label: "overview", group: "sentences", kind: "overview", filter: null },   // (every structure and form with an example: no question)
  };
}

// Options: the word, one other word of its category (its file) and one of the whole dictionary, each of the same
// part of speech when there is one. For a verb the second is a verb of the same root with another prefix when
// there is one (versprechen: besprechen, aussprechen).
function vocabulary(e, dict, ask, show) {
  const options = [show(e)];
  const unlike = o => o.word !== e.word && show(o) && !options.includes(show(o)) && !o.sk.some(meaning => e.sk.includes(meaning));
  const addOption = (...lists) => {
    for (const list of lists) {
      const candidates = list.filter(unlike), samePos = candidates.filter(o => o.pos === e.pos);
      if (candidates.length) return options.push(show(pick(samePos.length ? samePos : candidates)));
    }
  };
  const elsewhere = dict.entries.filter(o => o.category !== e.category);
  const sameRoot = e.pos === "V" ? dict.entries.filter(o => o.pos === "V" && verbRoot(o.word) === verbRoot(e.word)) : [];
  addOption(dict.byCategory[e.category], dict.entries);
  addOption(sameRoot, elsewhere, dict.entries);
  return { prompt: ask(e), hint: ask === shown && e.ipa ? (e.pinyin ? e.pinyin : `[${e.ipa}]`) : "", options: shuffle(options), answer: show(e) };
}

// The verb a prefixed verb is made from: ansprechen, versprechen -> sprechen; gehören -> hören
const PREFIXES = ["zusammen", "zurück", "wieder", "wider", "heraus", "herein", "hinaus", "herum", "durch", "unter",
                  "über", "fort", "nach", "miss", "auf", "aus", "bei", "ein", "ent", "emp", "her", "hin", "los", "mit",
                  "vor", "weg", "zer", "ver", "ab", "an", "be", "er", "ge", "um", "zu"].sort((a, b) => b.length - a.length);

function verbRoot(verb) {
  const prefix = PREFIXES.find(p => verb.startsWith(p) && verb.length - p.length >= 5);  // (a root keeps 5 letters: gehen stays)
  return prefix ? verbRoot(verb.slice(prefix.length)) : verb;
}
