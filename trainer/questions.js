// The kinds of question. Each mode has
//   fits(entry)        can this entry be asked this way
//   make(entry, dict)  -> { prompt, hint, options (3, shuffled), answer, articles }
//   say: { ask(entry), answer(entry) } -> the IPA spoken when the question is shown / once it is answered (speak.js),
//        only ever the German; none: nothing said
// `articles`: the question is ABOUT der, die, das -- only then are they drawn in their colours (ui.js)
import { german, slovak, spoken, pluralIPA } from "./data.js";
import { countRules, wrongPlurals } from "./plurals.js";

const pick = list => list[Math.floor(Math.random() * list.length)];
const shuffle = list => list.map(x => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(pair => pair[1]);

// A value of a Map value -> weight, the heavier the likelier
function pickWeighted(weights) {
  let r = Math.random() * [...weights.values()].reduce((a, b) => a + b, 0);
  for (const [value, weight] of weights) if ((r -= weight) < 0) return value;
  return [...weights.keys()].at(-1);
}

const ARTICLES = ["der", "die", "das"];
let pluralRuleCounts = null;                    // counted over the dictionary's nouns on the first plural question

export const MODES = {
  article: {
    label: "der · die · das",
    fits: e => e.pos === "N" && ARTICLES.includes(e.article),
    make: e => ({ prompt: "___ " + e.word, hint: slovak(e), options: ARTICLES, answer: e.article, articles: true }),
    say: { answer: spoken },                                          // (the word with its article, once it is known)
  },

  plural: {
    label: "Plural",
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
    say: { ask: spoken, answer: e => { const p = pluralIPA(e); return p && "diː " + p; } },   // (the singular asked, the plural answered)
  },

  vocab: {
    label: "Deutsch → Slovensky",
    fits: () => true,
    make: (e, dict) => vocabulary(e, dict, german, slovak),
    say: { ask: spoken },                                             // (the German word asked)
  },

  vocabReverse: {
    label: "Slovensky → Deutsch",
    fits: () => true,
    make: (e, dict) => vocabulary(e, dict, slovak, german),
    say: { answer: spoken },                                          // (the German answer, once answered)
  },
};

// Options: the word, one other word of its category (its file) and one of the whole dictionary, each of the same
// part of speech when there is one. For a verb the second is a verb of the same root with another prefix when
// there is one (versprechen: besprechen, aussprechen).
function vocabulary(e, dict, ask, show) {
  const options = [show(e)];
  const unlike = o => o.word !== e.word && !options.includes(show(o)) && !o.sk.some(meaning => e.sk.includes(meaning));
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
  return { prompt: ask(e), hint: ask === german && e.ipa ? `[${e.ipa}]` : "", options: shuffle(options), answer: show(e) };
}

// The verb a prefixed verb is made from: ansprechen, versprechen -> sprechen; gehören -> hören
const PREFIXES = ["zusammen", "zurück", "wieder", "wider", "heraus", "herein", "hinaus", "herum", "durch", "unter",
                  "über", "fort", "nach", "miss", "auf", "aus", "bei", "ein", "ent", "emp", "her", "hin", "los", "mit",
                  "vor", "weg", "zer", "ver", "ab", "an", "be", "er", "ge", "um", "zu"].sort((a, b) => b.length - a.length);

function verbRoot(verb) {
  const prefix = PREFIXES.find(p => verb.startsWith(p) && verb.length - p.length >= 5);  // (a root keeps 5 letters: gehen stays)
  return prefix ? verbRoot(verb.slice(prefix.length)) : verb;
}
