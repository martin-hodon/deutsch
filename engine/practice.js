// SENTENCE PRACTICE in the trainer: sentences planned for the language learned (engine/sentences.js, its words' level)
// and said in it (engine/say.js) --
//   a word's EXAMPLES: short sentences that say that word (engine/simple.js, the word said for its concept)
//   WORD ORDER: a sentence with a grammar structure (engine/structures.js) to put together again
//   FORMS: a sentence with one word left out and its right form among wrong ones (engine/forms.js)
//
//   const pr = createPractice({ loadLang })        loadLang(lang) -> its dictionary (app.js's; es, fr with .morph)
//   await pr.examples(entry, 3)                     -> [{ text, ipa, mark: [start, end] }]   (pr.canSay(entry): can it)
//   await pr.order(lang, level, structure | "all") -> { words, slots, orders, text, ipa } | null   (words: the ones to
//                                                     order, as written -- the first capitalised; slots: "w" for each of
//                                                     them, "=word" a word GIVEN, the punctuation itself where it stands;
//                                                     orders: every order the language says the same plan in with these
//                                                     very words and marks -- each one right). A sentence of two clauses
//                                                     gives one clause and asks the other; a sentence shows at most
//                                                     MAX_RULES grammar structures (engine/structures.js) -- simple ones
//   await pr.forms(lang, level, rule | "all", irregular)  -> { prompt, hint, options, answer, rule, text, ipa } | null
//   await pr.structures(), await pr.rules(lang)     -> what the exercises offer: [{ name, label, stage? }]
// THE LEVEL (FREQ 1, 2 or 3) is the level of what is practised: the word asked in forms, at least one word of a
// word-order sentence; the sentence's other words are no rarer (a sentence of only the rarest words would be nonsense).
import { loadSentences } from "./sentences.js";
import { sayerFor } from "./say.js";
import { structuresOf, structureList } from "./structures.js";
import { parseForms, formsQuestion, locate, planWords } from "./forms.js";
import { loadParadigms } from "./paradigm.js";
import { loadMeaning } from "./meaning.js";
import { createSimple } from "./simple.js";

const TRIES = { examples: 12, order: 100, forms: 120 };
const FRONTS = ["time", "manner", "sentence", "conn", "A", "pp", "gen", "role"];   // (what German may put first: de.front)
const FRONT_ARG = { A: "patient", gen: "because-of", role: "recipient" };
const SWAPPABLE = new Set(["because", "when", "if", "if-unreal", "although", "after", "before", "while", "until", "as-soon-as", "as-long-as", "when-past", "in-case"]);
const WORDS = { min: 3, max: 9 };    // (a word-order sentence: not too short to order, never more than nine words to place)
const MAX_RULES = 3;                 // (the grammar structures a syntax sentence may show at once: no tangles)
const BASE_RULES = new Set(["present", "object", "predicate", "pron-obj"]);   // (what nearly every sentence has: not counted)
// beside the structure in focus a sentence may only add time, place or manner words (the optional adjuncts) ...
const ADJUNCT_RULES = new Set(["time-basic", "time-phrases", "place-basic", "one-gladly-very"]);
// ... and a second clause only when the structure itself links clauses
const CLAUSE_RULES = new Set(["coord", "for", "that-because-if", "when-past", "relative", "relative-prep", "infinitive", "purpose", "conditional", "indirect", "although-so-that", "temporal", "causative", "conditional-past", "without-instead", "subject-drop", "reported", "relative-more", "so-that-the-more", "connectives", "paired"]);

export function createPractice({ loadLang }) {
  const once = new Map(), cached = (key, make) => once.get(key) ?? once.set(key, make()).get(key);
  // a generator for a language and a level: its plans said in that language
  const generator = (lang, level, complexity = 2) => cached(`gen|${lang}|${level}|${complexity}`, async () => {
    const gen = await loadSentences({ dict: await loadLang("de"), level, complexity, lang });
    return { gen, say: await sayerFor(gen, lang, Math.random) };
  });
  const paradigms = (lang) => cached(`pd|${lang}`, async () => { const d = await loadLang(lang); return { d, pd: await loadParadigms(lang, { morph: d.morph, nouns: d.entries }) }; });
  const syllabus = () => cached("syllabus", async () => (await fetch("world/syllabus.txt")).text());
  // one sentence: its plan said in the language (German: the planner's own text)
  const sentence = (g, lang, opts) => {
    const s = g.gen.sentence(opts);
    if (!s) return null;
    const plan = s.plan();
    return { plan, said: lang === "de" ? { text: s.text, tokens: s.tokens, ipa: s.ipa } : g.say(plan) };
  };
  const isWord = (t) => /\p{L}/u.test(t.w);
  // (a word of the level to steer a sentence to: one of exactly that FREQ, of a part of speech -- the planner's focus;
  //  above FREQ 1 the commoner words would else nearly always win)
  //  -- of a concept the world tells of: the planner's word for it annotated (world/meaning)
  const focusOf = (d, level, pos, gen) => {
    if (level === 1) return null;
    const usable = (e) => { const de = gen.word(e.concept.replace(/ /g, "_"), e.pos); return !!de && gen.meaning.annotated(de); };
    const k = `${level}|${pos}`, l = (d.byLevel ??= new Map()).get(k) ?? d.byLevel.set(k, d.entries.filter((e) => e.freq === level && !e.word.includes(" ") && (pos ? e.pos === pos : /^(V|N|AN)$/.test(e.pos)) && usable(e))).get(k);
    const e = l[Math.floor(Math.random() * l.length)];
    return e ? { pos: e.pos, concept: e.concept } : null;
  };

  // THE SIMPLE SENTENCES of a language (engine/simple.js): a word's examples -- the world's meanings on the language's own
  // dictionary, said by its realizer (German: the planner's, which is its realizer; it is loaded for the grammar anyway)
  const simple = (lang) => cached(`simple|${lang}`, async () => {
    const d = await loadLang(lang);
    if (lang === "de") { const g = await generator("de", 3); return { sg: await createSimple({ dict: d, meaning: g.gen.meaning, say: g.say }), say: g.say }; }
    const meaning = await loadMeaning("world/categories.txt", "world/meaning.tsv", d), say = await sayerFor({ meaning }, lang, Math.random);
    return { sg: await createSimple({ dict: d, meaning, say }), say };
  });
  // (can a simple sentence show a word: its concept, or another sense of its word, one the world tells of; a function
  //  word is said by the grammar -- then the examples are offered)
  async function canSay(entry) {
    if (!/^(V|N|AN|AV)$/.test(entry.pos)) return true;
    const { sg } = await simple(entry.lang), { d } = await paradigms(entry.lang);
    return [entry, ...d.entries.filter((e) => e.word === entry.word && e.pos === entry.pos)].some((e) => sg.can(e));
  }

  // (alive(): still wanted -- the learner went on: stop; between tries the page gets its turn)
  async function examples(entry, n = 3, { alive = () => true } = {}) {
    const lang = entry.lang, { sg, say } = await simple(lang), { d, pd } = await paradigms(lang);
    // (its forms: how the sentence is checked to say it -- a phrase by its first word's forms and the rest as written)
    const [head, ...rest] = entry.word.split(" "), heads = new Set([head, ...pd.forms(entry).map((f) => f.form.split(" ")[0])].map((w) => w.toLocaleLowerCase()));
    // (its concept, then its word's other senses -- one the world does not tell of yet has no sentences)
    const senses = [entry, ...d.entries.filter((e) => e.word === entry.word && e.pos === entry.pos && e.concept !== entry.concept)].filter((e) => sg.can(e));
    const out = [];
    for (const sense of senses) {
      const undo = say.use(entry.pos, sense.concept, entry.word);
      try {
        for (let t = 0; t < TRIES.examples && out.length < n; t++) {
          await new Promise((r) => setTimeout(r));
          if (!alive()) return out;
          const s = sg.sentence(sense);
          if (!s || out.some((o) => o.text === s.said.text)) continue;
          const i = s.said.tokens.findIndex((tk) => heads.has(tk.w.toLocaleLowerCase()));
          if (i < 0 || !rest.every((w) => s.said.tokens.some((tk) => tk.w === w))) continue;
          const at = locate(s.said, i);
          out.push({ text: s.said.text, ipa: s.said.ipa, mark: at < 0 ? null : [at, at + s.said.tokens[i].w.length] });
        }
      } finally { undo(); }
      if (out.length >= n) break;
    }
    return out;
  }

  // the words of a sentence AS WRITTEN: the realizers capitalise the text, not the tokens -- each word token's letters
  // taken from the text where it stands (Die, not die; a tile shows the capital where the sentence has it)
  const written = (said) => said.tokens.map((tk, i) => { if (!isWord(tk)) return tk; const at = locate(said, i); return at < 0 ? tk : { ...tk, w: said.text.slice(at, at + tk.w.length) }; });

  async function order(lang, level, structure = "all") {
    let g = await generator(lang, level);
    await levels(lang);
    for (let t = 0; t < TRIES.order; t++) {
      // (a structure not found among the simpler sentences: among the complex ones -- two or three clauses)
      if (t === TRIES.order / 2 && structure !== "all") g = await generator(lang, level, 3);
      let s;
      try { s = sentence(g, lang, { focus: focusOf(await levels(lang), level, null, g.gen) }); } catch { continue; }
      if (!s || (structure !== "all" && !structuresOf(s.plan).has(structure)) || !ofLevel(s.plan, lang, level)) continue;
      const rules = [...structuresOf(s.plan)].filter((r) => !BASE_RULES.has(r)), ids = s.plan.seq.filter((x) => s.plan.clauses[x]);
      if (s.said.tokens.some((tk) => /^[„“"«»‘’]$/.test(tk.w))) continue;
      if (structure === "all" ? rules.length > MAX_RULES || ids.length > 2
        : rules.some((r) => r !== structure && !ADJUNCT_RULES.has(r)) || ids.length > (CLAUSE_RULES.has(structure) ? 2 : 1)) continue;   // (the structure in focus, the rest simple)
      // (two clauses: one is given, the other -- drawn -- is to be ordered; a half too short to order leaves the whole
      //  sentence open)
      const toks = written(s.said).filter((tk) => tk.w), at = ids.length === 2 ? boundary(g, s, toks) : -1;
      let half = at > 0 ? (Math.random() < .5 ? "first" : "second") : null;
      let slots = slotsOf(toks, half, at), words = freeWords(slots, toks);
      if (half && words.length < WORDS.min) { half = null; slots = slotsOf(toks); words = freeWords(slots, toks); }
      if (words.length < WORDS.min || words.length > WORDS.max) continue;
      return { words, slots, orders: orders(g, lang, s, words, half, slots, at), text: s.said.text, ipa: s.said.ipa };
    }
    return null;
  }

  // (a plan of the level: one of its words -- by its concept's commonest word in the language -- of that FREQ)
  const levelOf = new Map();
  async function levels(lang) { if (!levelOf.has(lang)) { const { d } = await paradigms(lang); levelOf.set(lang, d); } return levelOf.get(lang); }
  const ofLevel = (plan, lang, level) => {
    const d = levelOf.get(lang);
    return !d || planWords(plan).some((w) => Math.min(...(d.byConcept.get(`${w.pos}|${w.concept}`) ?? []).map((e) => e.freq)) === level);
  };
  // the sentence's slots: "w" for a word to place, "=word" for a word given, a punctuation mark as it is (¿Dónde ... ?
  // -- the ¿ stands first); `half`: the half of a two-clause sentence left open, `at` the token the second clause begins at
  const slotsOf = (toks, half = null, at = -1) => toks.map((tk, i) => (!isWord(tk) ? tk.w : half && at > 0 && (half === "first" ? i >= at : i < at) ? "=" + tk.w : "w"));
  // where the second clause begins: after the comma between them, or -- no comma (English: ... because ...) -- after
  // as many words as the first clause has said alone (its order the same; checked word for word), else -1
  function boundary(g, s, toks) {
    const comma = toks.findIndex((tk) => tk.w === ",");
    if (comma > 0) return comma + 1;
    const [a] = s.plan.seq.filter((x) => s.plan.clauses[x]);
    try {
      const alone = written(g.say({ seq: [a, "."], clauses: s.plan.clauses })).filter(isWord).map((tk) => tk.w.toLocaleLowerCase());
      const ws = toks.filter(isWord).map((tk) => tk.w.toLocaleLowerCase());
      if (alone.length && alone.length < ws.length && alone.every((w, i) => w === ws[i])) { let n = 0; for (let i = 0; i < toks.length; i++) if (isWord(toks[i]) && ++n === alone.length) return i + 1; }
    } catch { /* (the clause cannot stand alone) */ }
    return -1;
  }
  const freeWords = (slots, toks) => toks.filter((tk, i) => slots[i] === "w").map((tk) => tk.w);
  // THE ORDERS a plan is said in, each a right one: a subordinate clause before or after its main clause (in every
  // language: Because she was ill, she stayed / She stayed because she was ill), and German puts another part first
  // (the time, the object, a phrase -- de.front). Only orders of these very words (the capital where it is) with the
  // marks where they stand count: the tiles are written as the sentence is, so the learner builds it exactly.
  function orders(g, lang, s, words, half, slots, at) {
    const out = new Set([words.join(" ")]), key = (ws) => ws.slice().sort().join(" "), same = key(words), pattern = slots.join(" ");
    const said = (plan) => { try { const toks = written(g.say(plan)).filter((tk) => tk.w), sl = slotsOf(toks, half, at), ws = freeWords(sl, toks); if (key(ws) === same && sl.join(" ") === pattern) out.add(ws.join(" ")); } catch { /* (an order the clause cannot have) */ } };
    for (const plan of [s.plan, ...swapped(s.plan)]) {
      said(plan);
      if (lang === "de") for (const [id, c] of Object.entries(plan.clauses)) for (const front of [null, ...FRONTS]) {
        if (front && !c.args[FRONT_ARG[front] ?? front]) continue;
        const args = { ...c.args };
        if (front) args["de.front"] = [front]; else delete args["de.front"];
        said({ ...plan, clauses: { ...plan.clauses, [id]: { ...c, args } } });
      }
    }
    return [...out];
  }
  // (a sentence of a main clause and a subordinate one -- MAIN , SUB . or SUB , MAIN . -- the other way round)
  const swapped = (plan) => {
    const q = plan.seq ?? [];
    if (q.length !== 4 || q[1] !== "," || !/^[.?!]$/.test(q[3])) return [];
    const [a, , b] = q, A = plan.clauses[a], B = plan.clauses[b], movable = (c) => c?.type === "SUB" && SWAPPABLE.has(c.args.link?.[0]);
    return (movable(A) && B?.type === "MAIN") || (movable(B) && A?.type === "MAIN") ? [{ ...plan, seq: [b, ",", a, q[3]] }] : [];
  };

  async function rules(lang) {
    return cached(`rules|${lang}`, async () => parseForms(await (await fetch(`${lang}/rules/forms.txt`)).text()));
  }
  // (what a rule set wishes the sentence to have: its `when` tense and mood, its `steer` -- link=so-that, mood=hypo,
  //  degree=comp --, the plural it asks)
  const steerOf = (r) => {
    const out = { plural: r.ask.every((a) => a.endsWith(".pl")), links: [] };
    for (const w of [...r.when, ...r.steer]) {
      const m = w.match(/^(tense|mood|link|degree|freq)=([\w-]+)$/);
      if (m && m[1] === "link") out.links.push(m[2]); else if (m) out[m[1]] = m[2];
    }
    return out;
  };
  // (`irregular`: irregular verbs only -- the rule sets that ask a verb's form, the form one the regular rule would not make)
  async function forms(lang, level, rule = "all", irregular = false) {
    const g = await generator(lang, level), { d, pd } = await paradigms(lang), all = await rules(lang);
    const chosen = (rule === "all" ? all : all.filter((r) => r.name === rule)).filter((r) => !irregular || r.ask.some((a) => a.startsWith("V.")));
    if (!chosen.length) return null;
    const entriesOf = (pos, concept) => d.byConcept.get(`${pos}|${concept}`) ?? [];
    const wordEntry = (w) => d.entries.find((e) => e.word === w && e.pos === "V") ?? null;
    for (let t = 0; t < TRIES.forms; t++) {
      // (one rule set a try, the sentence steered to a word of the level of the part of speech it asks: V, N, AN --
      //  and to its tense or mood: a rule's `when tense=past`, `when mood=hypo`; a plural asked: the plural)
      const r = chosen[Math.floor(Math.random() * chosen.length)], pos = r.word || r.also.length ? null : r.ask[0].split(".")[0];
      const steer = steerOf(r), gr = steer.links.length ? await generator(lang, level, 3) : g;   // (a link wished: among sentences of two or three clauses)
      let s, q;
      try { s = sentence(gr, lang, { focus: pos && pos !== "ART" ? focusOf(d, level, pos, gr.gen) : null, steer }); q = s && s.said.tokens.filter(isWord).length >= WORDS.min && formsQuestion(s.said, s.plan, [r], { pd, entriesOf, wordEntry, level, irregular }); } catch { continue; }
      if (q) return { ...q, text: s.said.text, ipa: s.said.ipa };
    }
    return null;
  }

  const structures = async () => structureList(await syllabus());
  return { examples, canSay, order, forms, rules, structures, generator };
}
