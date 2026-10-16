// A PLAN SAID in a language: its realizer (de/realize.js for German, <lang>/realize.js for the others) for a
// generator's plans (engine/sentences.js) -- one per generator and language, loaded when first asked.
//
//   const say = await sayerFor(gen, "es", Math.random)
//   say(plan) -> { text, tokens: [{ w, ipa }], ipa }    (ipa: the words' sounds, stressed as speech stresses them --
//                                                       speak.js phrase() with the language's prosody; a word without
//                                                       a sound is a short gap, in German left out)
//   say.use(pos, concept, word) -> undo: that word said for its concept until undone (a word's example sentences)
//   vary: a random source for the realizer's free choices (weil or da, its synonyms); none: always the first -- the tests
import { loadProsody, phrase } from "./speak.js";
import { LANGS } from "./langs.js";

export const sayerFor = (gen, lang, vary = null) => ((gen.sayers ??= {})[lang] ??= (async () => {
  const P = await loadProsody(LANGS[lang].speech);
  if (lang === "de") {
    const de = await (await import("../de/realize.js")).loadGerman("", gen, gen.frames, { vary });
    return Object.assign((b) => { const o = de.realize(b, { full: true }); return { text: o.text, tokens: o.tokens, ipa: phrase(o.tokens, P, { gap: null }) }; }, { use: gen.use });
  }
  const r = await (await import(`../${lang}/realize.js`)).load("", { meaning: gen.meaning, vary });
  return Object.assign((b) => { const o = r.realize(b); return { text: o.text, tokens: o.tokens, ipa: phrase(o.tokens, P) }; }, { use: r.use });
})());
