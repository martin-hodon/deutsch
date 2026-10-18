// SENTENCE PRACTICE in the trainer: sentences made for the language learned -- LIGHT, from grammar and the words'
// relations alone (engine/simple.js, engine/build.js; no planner, no scene, no story) -- and said in it (engine/say.js):
//   a word's EXAMPLES: short sentences that say that word (engine/simple.js, the word said for its concept)
//   WORD ORDER: a sentence with a grammar structure (engine/structures.js) to put together again
//   FORMS: a sentence with one word left out and its right form among wrong ones (engine/forms.js)
//   THE LADDER: a sentence grown from the simplest one, a grammar rule a step (engine/build.js), each step's rule
//   THE OVERVIEW: every structure and every rule set of forms with an example sentence (the grammar page)
//
//   const pr = createPractice({ loadLang })        loadLang(lang) -> its dictionary (app.js's; es, fr with .morph)
//   await pr.examples(entry, 3)                     -> [{ text, ipa, mark: [start, end] }]   (pr.canSay(entry): can it)
//   await pr.order(lang, level, structure | "all") -> { words, slots, orders, text, ipa, declared? } | null   (words: the
//                                                     ones to order, as written -- the first capitalised; slots: "w" for
//                                                     each of them, "=word" a word GIVEN, the punctuation itself where it
//                                                     stands; orders: every order the language says the same plan in with
//                                                     these very words and marks -- each one right). A sentence of two
//                                                     clauses gives one clause and asks the other; a sentence shows at
//                                                     most MAX_RULES grammar structures (engine/structures.js) -- simple
//                                                     ones. The grammar ladder's sentences first (engine/build.js: a
//                                                     word of the level, then any); for a structure no step brings, one
//                                                     of its declared example plans (world/structures.txt): a structure
//                                                     the language has always has a sentence (`declared`)
//   await pr.analyze(lang, level, text)            -> { exact, rungs } -- a sentence typed taken apart (engine/parse.js):
//                                                     rungs as ladder()'s; exact false: the words left out, unchecked
//   await pr.forms(lang, level, rule | "all", irregular)  -> { prompt, hint, options, answer, rule, text, ipa } | null
//   await pr.ladder(lang, level, structure | "all") -> [{ step, text, ipa, words: [{ w, pos, changed }], shows: [{ name,
//                                                     label, note }] }] | null -- every rung a sentence, `changed` the
//                                                     words the step brought or changed, `shows` the structures it
//                                                     brought with the language's rule (<lang>/rules/notes.txt)
//   await pr.structures(lang), await pr.rules(lang) -> what the exercises offer: [{ name, label, stage? }] -- the
//                                                     structures the LANGUAGE has (a declared example plan it says)
//   await pr.overview(lang, level)                  -> { structures: [{ name, stage, label, text, tokens: [{ w, pos }] }],
//                                                     rules: [{ name, label, example: { text, prompt, answer, hint } | null }] }
// THE LEVEL (FREQ 1, 2 or 3) is the level of what is practised: the word asked in forms, at least one word of a
// word-order sentence; the sentence's other words are no rarer (a sentence of only the rarest words would be nonsense).
import { loadSentences } from "./sentences.js";
import { sayerFor } from "./say.js";
import { structuresOf, structureList, loadStructures, IMPLIED, labelOf } from "./structures.js";
import { createBuilder } from "./build.js";
import { createParser } from "./parse.js";
import { treeOf, plainTree } from "./tree.js";
import { parseForms, formsQuestion, locate, planWords } from "./forms.js";
import { formsIndex, fold } from "./wordforms.js";
import { loadParadigms } from "./paradigm.js";
import { loadMeaning } from "./meaning.js";
import { createSimple } from "./simple.js";

const TRIES = { examples: 12, order: 30, forms: 60 };
const FRONTS = ["time", "manner", "sentence", "conn", "A", "pp", "gen", "role"];   // (what German may put first: de.front)
const FRONT_ARG = { A: "patient", gen: "because-of", role: "recipient" };
const SWAPPABLE = new Set(["because", "when", "if", "if-unreal", "although", "after", "before", "while", "until", "as-soon-as", "as-long-as", "when-past", "in-case"]);
const WORDS = { min: 3, max: 9 };    // (a word-order sentence: not too short to order, never more than nine words to place)
const MAX_RULES = 3;                 // (the grammar structures a syntax sentence may show at once: no tangles)
const BASE_RULES = new Set(["present", "object", "predicate", "pron-obj"]);   // (what nearly every sentence has: not counted)
// beside the structure in focus a sentence may only add time, place or manner words (the optional adjuncts) ...
const ADJUNCT_RULES = new Set(["time-basic", "time-phrases", "place-basic", "one-gladly-very", "frequency", "manner", "adverb-order"]);
// ... and a second clause only when the structure itself links clauses
const CLAUSE_RULES = new Set(["coord", "for", "that-because-if", "when-past", "relative", "relative-prep", "infinitive", "purpose", "conditional", "indirect", "although-so-that", "temporal", "causative", "conditional-past", "without-instead", "subject-drop", "reported", "relative-more", "so-that-the-more", "connectives", "paired"]);

export function createPractice({ loadLang }) {
  const once = new Map(), cached = (key, make) => once.get(key) ?? once.set(key, make()).get(key);
  // A LANGUAGE'S REALIZER, light: the world's meanings on its own dictionary and its realizer -- `say` choosing freely
  // (weil or da, a synonym), `exact` always the first choice (a ladder's rungs say the same words). German's realizer is
  // the German grammar of engine/sentences.js: its generator is loaded for that, without scenes, and never plans.
  const light = (lang) => cached(`light|${lang}`, async () => {
    const d = await loadLang(lang);
    if (lang === "de") {
      const gen = await loadSentences({ dict: d, level: 3, scenes: false, lang });
      return { d, meaning: gen.meaning, say: await sayerFor(gen, lang, Math.random), exact: await sayerFor({ ...gen, sayers: undefined }, lang, null) };
    }
    const meaning = await loadMeaning("world/categories.txt", "world/meaning.tsv", d);
    return { d, meaning, say: await sayerFor({ meaning }, lang, Math.random), exact: await sayerFor({ meaning }, lang, null) };
  });
  // the grammar ladder of a language and a level (engine/build.js): `exact` for the ladder shown, free for exercises
  const builder = (lang, level, exact = false) => cached(`build|${lang}|${level}|${exact}`, async () => {
    const L = await light(lang);
    return createBuilder({ dict: L.d, meaning: L.meaning, say: exact ? L.exact : L.say, level });
  });
  const paradigms = (lang) => cached(`pd|${lang}`, async () => { await light(lang); const d = await loadLang(lang); return { d, pd: await loadParadigms(lang, { morph: d.morph, nouns: d.entries }) }; });   // (light first: it loads the German morphology the paradigms need)
  const syllabus = () => cached("syllabus", async () => (await fetch("world/syllabus.txt")).text());
  const isWord = (t) => /\p{L}/u.test(t.w);

  // THE SIMPLE SENTENCES of a language (engine/simple.js): a word's examples -- the world's meanings on the language's own
  // dictionary, said by its realizer
  const simple = (lang) => cached(`simple|${lang}`, async () => {
    const { d, meaning, say } = await light(lang);
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

  // THE WORD-ORDER SENTENCE: the grammar ladder's -- a short ladder to the structure, a word of the level among its words
  // first, then of any level --; for a structure no step brings, one of its declared example plans (world/structures.txt):
  // a structure the language has always has a sentence
  async function order(lang, level, structure = "all") {
    const g = await light(lang), b = await builder(lang, level), target = structure === "all" ? null : structure;
    await levels(lang);
    if (!target || b.stepFor(target)) for (let t = 0; t < TRIES.order; t++) {
      const s = b.sentence({ target, extra: Math.floor(Math.random() * 2) });
      if (!s || (t < TRIES.order / 2 && !ofLevel(s.plan, lang, level))) continue;
      const task = taskOf(g, lang, s, structure);
      if (task) return task;
    }
    if (!target) return null;
    for (const p of shuffled(await declared(lang, structure))) {
      const s = sayPlan(g, p), task = s && taskOf(g, lang, s, structure, { declared: true });
      if (task) return { ...task, declared: true };
    }
    return null;
  }
  // the task of a sentence: its words to order, its slots, every right order -- null when it does not suit: a quote,
  // more structures than the one in focus (beside it only the base, the adjuncts and what it implies -- IMPLIED --, a
  // second clause only for a structure of clauses), too few or too many words. A declared plan shows its structure by
  // declaration; it may be short (Ho mangiato.)
  function taskOf(g, lang, s, structure, { declared = false } = {}) {
    const rules = [...structuresOf(s.plan)].filter((r) => !BASE_RULES.has(r)), ids = s.plan.seq.filter((x) => s.plan.clauses[x]);
    if (s.said.tokens.some((tk) => /^[„“"«»‘’]$/.test(tk.w))) return null;
    if (!declared && (structure === "all" ? rules.length > MAX_RULES || ids.length > 2
      : rules.some((r) => r !== structure && !ADJUNCT_RULES.has(r) && !(IMPLIED[structure] ?? []).includes(r)) || ids.length > (CLAUSE_RULES.has(structure) ? 2 : 1))) return null;   // (the structure in focus, the rest simple)
    // (two clauses: one is given, the other -- drawn -- is to be ordered; a half too short to order leaves the whole
    //  sentence open)
    const toks = written(s.said).filter((tk) => tk.w), at = ids.length === 2 ? boundary(g, s, toks) : -1;
    let half = at > 0 ? (Math.random() < .5 ? "first" : "second") : null;
    let slots = slotsOf(toks, half, at), words = freeWords(slots, toks);
    if (half && words.length < WORDS.min) { half = null; slots = slotsOf(toks); words = freeWords(slots, toks); }
    if (words.length < (declared ? 2 : WORDS.min) || words.length > WORDS.max) return null;
    return { words, slots, orders: orders(g, lang, s, words, half, slots, at), text: s.said.text, ipa: s.said.ipa };
  }
  const shuffled = (l) => l.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  // a declared example plan said in the language (null: its realizer cannot)
  const sayPlan = (g, p) => { const plan = { seq: p.seq, clauses: p.clauses }; try { const said = g.say(plan); return said?.text ? { plan, said } : null; } catch { return null; } };
  const structuresFile = () => cached("structures", () => loadStructures("world/structures.txt"));
  const declared = async (lang, structure) => ((await structuresFile()).get(structure) ?? []).filter((p) => !p.not.includes(lang));

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
    const b = await builder(lang, level), { d, pd } = await paradigms(lang), all = await rules(lang);
    const chosen = (rule === "all" ? all : all.filter((r) => r.name === rule)).filter((r) => !irregular || r.ask.some((a) => a.startsWith("V.")));
    if (!chosen.length) return null;
    const entriesOf = (pos, concept) => d.byConcept.get(`${pos}|${concept}`) ?? [];
    const wordEntry = (w) => d.entries.find((e) => e.word === w && e.pos === "V") ?? null;
    // (one rule set a try, the ladder steered to its tense, a link, the comparative, the plural, a habit -- a rule's `when
    //  tense=past`, `steer degree=comp`; then, for what no step makes -- the hypothetical, the subjunctive after a link --,
    //  the declared example plans of every structure)
    const pickRule = () => chosen[Math.floor(Math.random() * chosen.length)];
    const ask = (s, r) => { try { return s.said.tokens.filter(isWord).length >= WORDS.min && formsQuestion(s.said, s.plan, [r], { pd, entriesOf, wordEntry, level, irregular }); } catch { return null; } };
    for (let t = 0; t < TRIES.forms; t++) {
      const r = pickRule(), s = b.sentence({ steer: steerOf(r), extra: 1 + Math.floor(Math.random() * 3) }), q = s && ask(s, r);
      if (q) return { ...q, text: s.said.text, ipa: s.said.ipa };
    }
    const g = await light(lang), plans = [...(await structuresFile()).values()].flat().filter((p) => !p.not.includes(lang));
    for (const p of shuffled(plans)) {
      const s = sayPlan(g, p), q = s && chosen.map((r) => ask(s, r)).find(Boolean);
      if (q) return { ...q, text: s.said.text, ipa: s.said.ipa };
    }
    return null;
  }

  // THE LADDER: a sentence grown step by step (engine/build.js, said exactly -- the rungs keep their words), each rung's
  // words in their parts of speech with what the step brought marked, the structures it brought with the language's rule
  const notes = (lang) => cached(`notes|${lang}`, async () => {
    const r = await fetch(`${lang}/rules/notes.txt`).catch(() => null), out = new Map();
    for (const s of r?.ok ? (await r.text()).split("\n") : []) { const m = s.match(/^([\w-]+) = (.+)$/); if (m) out.set(m[1], m[2]); }
    return out;
  });
  async function ladder(lang, level, structure = "all") {
    const b = await builder(lang, level, true), { d } = await paradigms(lang);
    await formsIndex(d, lang);
    // (a structure no step brings -- or none found --: its declared example plan, taken apart down to its base)
    const target = structure === "all" ? null : structure;
    let rungs = !target || b.stepFor(target) ? b.ladder({ target }) : null;
    if (!rungs && target) { const L = await light(lang); for (const p of shuffled(await declared(lang, target))) if ((rungs = sayPlan(L, p) && b.unbuild({ seq: p.seq, clauses: p.clauses })) && rungs.length > 1) break; }
    return rungs ? withTree(shown(rungs, d, await notes(lang)), rungs.at(-1), await light(lang)) : null;
  }
  // (the last rung's tree, engine/tree.js: its words joined, a rule a node -- the parts found by saying the plan again
  //  without each, with the exact realizer the rungs were said by)
  function withTree(out, last, L) {
    const wordsOf = (p) => { try { const s = L.exact(p); return s?.text ? written(s).filter((tk) => tk.w).map((tk) => tk.w.toLocaleLowerCase()) : null; } catch { return null; } };
    let tree = null;
    try { tree = treeOf(last.plan, out.at(-1).words, wordsOf); } catch (e) { console.error(e); }
    out.tree = tree ? { root: tree, words: out.at(-1).words } : null;
    return out;
  }
  // (the rungs as the page shows them: the words by part of speech, those a step brought marked, its rules)
  function shown(rungs, d, ns) {
    let before = [];
    return rungs.map((r) => {
      const words = tagged({ plan: r.plan, said: r.said }, d), now = words.map((x) => x.w.toLocaleLowerCase()), kept = common(before, now);
      before = now;
      return { step: r.step, text: r.said.text, ipa: r.said.ipa, words: words.map((x, i) => ({ ...x, changed: r.step !== "base" && isWord(x) && !kept.has(i) })), shows: r.shows.map((name) => ({ name, label: labelOf(name), note: ns.get(name) ?? null })) };
    });
  }

  // A SENTENCE TYPED, TAKEN APART (engine/parse.js): read back into its plan by the language's own realizer -- when its
  // plan says it word for word, the ladder that leads to it (engine/build.js unbuild), each step's rule; else the words
  // typed by part of speech and a ladder of words left out -- not checked by the grammar (`exact: false`)
  const parser = (lang) => cached(`parse|${lang}`, async () => { const L = await light(lang), { d } = await paradigms(lang); await formsIndex(d, lang); return createParser({ d, meaning: L.meaning, say: L.exact, lang }); });
  async function analyze(lang, level, text) {
    const p = await parser(lang), b = await builder(lang, level, true), { d } = await paradigms(lang), ns = await notes(lang);
    const r = p.parse(text.trim());
    if (r?.exact) { const rungs = b.unbuild(r.plan); if (rungs) { const out = withTree(shown(rungs, d, ns), rungs.at(-1), await light(lang)); return { exact: true, rungs: out, tree: out.tree }; } }
    const rungs = leftOut(text.trim(), r?.plan ?? { clauses: {} }, d), top = rungs.at(-1);
    return { exact: false, rungs, tree: { root: plainTree(top.words), words: top.words } };
  }
  // (a ladder of words left out, from the sentence typed down: a second clause after a comma, then the adverbs, the
  //  phrases with a preposition, the adjectives -- each a sentence of fewer words, not checked)
  function leftOut(text, plan, d) {
    const toks = lang0(d) === "zh" ? zhTokens(text, d) : (text.match(/\p{L}[\p{L}\p{M}'’-]*|\p{N}+|[^\s\p{L}\p{N}]/gu) ?? []).map((w) => ({ w }));
    let words = tagged({ plan, said: { text, tokens: toks } }, d).map((x) => ({ ...x, changed: false }));
    const out = [{ step: "typed", text, ipa: null, words, shows: [] }];
    const steps = [
      ["clause", (ws) => { const i = ws.findIndex((x, k) => x.w === "," && k > 1); return i > 0 ? [...ws.slice(0, i), ws.at(-1)] : null; }],
      ["adverb", (ws) => (ws.some((x) => x.pos === "AV") ? ws.filter((x) => x.pos !== "AV") : null)],
      ["place", (ws) => { const i = ws.findIndex((x) => x.pos === "PRE"); if (i < 0) return null; let j = i + 1; while (j < ws.length && /^(ART|AN|N|P|NUM)$/.test(ws[j].pos ?? "") && !(ws[j - 1].pos === "N" && ws[j].pos !== "N")) j++; return [...ws.slice(0, i), ...ws.slice(j)]; }],
      ["adjective", (ws) => (ws.some((x) => x.pos === "AN") && ws.some((x) => x.pos === "N") ? ws.filter((x) => x.pos !== "AN") : null)],
    ];
    for (const [name, take] of steps) for (let next = take(words); next && next.length < words.length && next.some((x) => x.pos === "V"); next = take(words)) {
      words = next;
      out.push({ step: name, text: words.map((x) => x.w).join(" "), ipa: null, words, shows: [] });
    }
    // (read upwards: what each step put back marked)
    const up = out.reverse();
    return up.map((r, i) => { const kept = i ? common(up[i - 1].words.map((x) => x.w), r.words.map((x) => x.w)) : null; return { ...r, step: i ? r.step : "base", words: r.words.map((x, k) => ({ ...x, changed: !!kept && isWord(x) && !kept.has(k) })) }; });
  }
  const lang0 = (d) => d.lang ?? d.entries[0]?.lang;
  const zhTokens = (text, d) => { const out = []; for (let i = 0; i < text.length;) { if (!/[一-鿿]/.test(text[i])) { out.push({ w: text[i] }); i++; continue; } let n = 4; while (n > 1 && !d.index.has(text.slice(i, i + n))) n--; out.push({ w: text.slice(i, i + n) }); i += n; } return out.filter((x) => x.w.trim()); };
  // (the words of `b` that stand in `a` too, in the same order -- the longest common run: the rest is the step's)
  function common(a, b) {
    const L = a.map(() => b.map(() => 0));
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? 1 + (L[i + 1]?.[j + 1] ?? 0) : Math.max(L[i + 1]?.[j] ?? 0, L[i][j + 1] ?? 0);
    const out = new Set();
    for (let i = 0, j = 0; i < a.length && j < b.length;) {
      if (a[i] === b[j]) { out.add(j); i++; j++; } else if ((L[i + 1]?.[j] ?? 0) >= (L[i][j + 1] ?? 0)) i++; else j++;
    }
    return out;
  }

  // the structures the language has: those of the syllabus with a declared example plan the language says
  async function structures(lang) {
    const [text, plans] = await Promise.all([syllabus(), structuresFile()]);
    return structureList(text).filter((st) => (plans.get(st.name) ?? []).some((p) => !p.not.includes(lang)));
  }

  // THE OVERVIEW (the grammar page): every structure of the language with its example sentence, the words marked by part
  // of speech; every rule set of forms with a sentence where a form it asks stands -- all from the declared example plans
  async function overview(lang, level) {
    return cached(`overview|${lang}`, async () => {
      const g = await light(lang), { d, pd } = await paradigms(lang), plans = await structuresFile();
      await formsIndex(d, lang);
      const said = [], structuresOut = [];
      for (const st of await structures(lang)) {
        await new Promise((r) => setTimeout(r));   // (the page gets its turn)
        const s = (plans.get(st.name) ?? []).filter((p) => !p.not.includes(lang)).map((p) => sayPlan(g, p)).find(Boolean);
        if (!s) continue;
        said.push(s);
        structuresOut.push({ ...st, text: s.said.text, tokens: tagged(s, d) });
      }
      const entriesOf = (pos, concept) => d.byConcept.get(`${pos}|${concept}`) ?? [], wordEntry = (w) => d.entries.find((e) => e.word === w && e.pos === "V") ?? null;
      const rulesOut = [];
      for (const r of await rules(lang)) {
        let example = null;
        for (const s of shuffled(said)) {
          let q = null;
          try { q = formsQuestion(s.said, s.plan, [r], { pd, entriesOf, wordEntry }); } catch { q = null; }
          if (q) { example = { text: s.said.text, prompt: q.prompt, answer: q.answer, hint: q.hint }; break; }
        }
        rulesOut.push({ name: r.name, label: r.label, example });
      }
      return { structures: structuresOut, rules: rulesOut };
    });
  }
  // the words of a sentence with their parts of speech: each looked up among the language's forms (engine/wordforms.js --
  // the one index the reading page and the dictionary use), an entry of the plan's concepts first, else a closed-class word
  const POS_FIRST = ["ART", "P", "PRE", "CON", "PAR", "NUM", "INT", "AV", "V", "AN", "N", "PHR"];
  function tagged(s, d) {
    // (and the nouns of place and time phrases -- in:def:škola, on-day:sobota: a noun, not the verb schulen)
    const phrased = Object.values(s.plan.clauses).flatMap((c) => [...(c.args.place ?? []), ...(c.args.time ?? []), ...(c.args.pp ?? [])]).flatMap((v) => v.split(":").slice(1).filter((x) => !/^(def|indef|none|no)$/.test(x)).map((x) => `N|${x.split("+")[0].replace(/_/g, " ")}`));
    const concepts = new Set([...planWords(s.plan).map((w) => `${w.pos}|${w.concept}`), ...phrased]);
    return written(s.said).filter((tk) => tk.w).map((tk) => {
      if (!isWord(tk)) return { w: tk.w };
      const hits = (d.index.get(fold(tk.w)) ?? []).map((h) => h.e);
      const e = hits.find((x) => concepts.has(`${x.pos}|${x.concept}`)) ?? hits.slice().sort((a, b) => POS_FIRST.indexOf(a.pos) - POS_FIRST.indexOf(b.pos))[0];
      return { w: tk.w, pos: e?.pos ?? "" };
    });
  }

  return { examples, canSay, order, forms, ladder, analyze, rules, structures, overview };
}
