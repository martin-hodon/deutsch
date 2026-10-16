// SENTENCES: sentences made by rule -- grammatical (the grammar and the morphology) and sensible (the meaning).
// The PLANNING is language-free (roles, relations, link codes, the shared syllabus world/syllabus.txt, the target
// language's gates and FREQ: lang); planOf hands a plan to a language's realizer (<lang>/realize.js). The German
// token path below (M.*, particles, negation tokens) is the legacy direct German output, kept beside it.
// For every clause the grammar asks for, a PLAN: a verb and one of its frames, a subject and objects whose meaning fits
// the frame's categories, perhaps an adjective that can describe its noun, adverbs, a tense, a mood, a voice, a modal
// verb, a negation. The grammar (grammar.js, sentences/grammar.txt) puts the plan's parts in their fields; the
// morphology (morph.js) gives every word its form, spelled and spoken.
//
//   const gen = await loadSentences({ dict, base: "" })
//   gen.sentence() -> { text: "Der Hund frisst das Fleisch.", ipa: "deːɐ hʊnt ...", tokens, trace, plan() }
//   gen.sentence({ focus: { pos: "N", concept: "pes" } }): a sentence that says that concept when it can (its situations,
//   its word taken wherever it fits); gen.use(pos, concept, word): that German word said for the concept -> undo;
//   gen.sentence({ steer: { tense: "past", mood: "hypo" } }): that tense or mood wherever a clause can have it
//   (trace: each clause's verb, frame and words with their categories -- why the sentence is what it is)
//   options: level (the commonest words only: FREQ 1, 2, 3), complexity (1 one clause, 2 now and then two, 3 often
//   two or three; with more relative clauses), stage (the grammar learnt so far: A1.1 ... B2.2 -- grammar.txt's
//   SYLLABUS; none: all of it), rnd (a random source)
import { parseGrammar, expand } from "./grammar.js";
import { loadMeaning } from "./meaning.js";
import * as M from "../de/morph.js";
import { splitTop, call } from "./realize.js";
import { loadFrames } from "../de/frames.js";
import { parseScenes } from "./scenes.js";
import { loadDictionary } from "./data.js";

const KASE = { N: "nom", A: "acc", D: "dat", G: "gen", "A=": "acc", A0: "acc", "N=": "nom" };
const PERSONS = ["1sg", "2sg", "3sg.m", "3sg.f", "1pl", "2pl", "3pl", "formal"];
// the INDEFINITE pronouns, the verb in the 3rd person singular (man sagt, jemand kommt)
const INDEF = new Set(["man", "jemand", "niemand", "etwas", "nichts", "alles", "wer", "der", "das"]);   // (and wer, der, das: Wer kommt, der ...)
const verbPerson = (who) => (who === "formal" ? "3pl" : INDEF.has(who) ? "3sg" : who.replace(/\.[mfn]$/, ""));   // (er/sie/es: 3sg)
// a noun's gender (der/die: a person either -- der Bekannte, die Bekannte; der/das: the first)
const genderOf = (noun, num, rnd) => (num === "pl" ? "pl" : noun.article === "der/die" ? (rnd() < .5 ? "m" : "f") : { der: "m", die: "f", das: "n", "(das)": "n" }[noun.article.split("/")[0]] ?? "n");
const cap = (t) => ({ ...t, w: t.w.charAt(0).toUpperCase() + t.w.slice(1) });

export async function loadSentences({ dict, base = "", level = 2, complexity = 2, stage = null, scenes: useScenes = true, rnd = Math.random, lang = "de" } = {}) {
  await M.loadMorphology(base + "de/rules/morphology.txt");
  const meaning = await loadMeaning(base + "world/categories.txt", base + "world/meaning.tsv", dict);
  // (the German grammar, and the world's lists -- of concepts: the everyday verbs, the states ... world/lists.txt)
  const syllabus = await (await fetch(base + "world/syllabus.txt")).text();   // (the shared syllabus: what a stage has learnt)
  const grammar = parseGrammar((await (await fetch(base + "de/rules/grammar.txt")).text()) + "\n" + (await (await fetch(base + "world/lists.txt")).text()) + "\n" + syllabus);
  const german = await loadFrames(base + "de/rules/frames.txt", base + "de/rules/roles.txt", dict, meaning);   // (how German says a frame: its realizer's)
  // THE PLANNER'S FRAMES: the world's (world/meaning: roles), each slot given the code the planner works with -- a
  // plain object (A), an indirect one (D), a bare noun (A0), what the object is taken for (A=), a clause (dass, ob, zu,
  // inf, inf.obj), a predicate (adj, N=), a name, an age, the clock, fixed words (=); every other role a phrase of that
  // role (prep "@role"): how a language marks it -- its case, its preposition -- is the language's realizer's
  const CODE = { patient: "A", second: "A", recipient: "D", bare: "A0", as: "A=", that: "dass", whether: "ob", inf: "zu", "inf.subj": "zu.subj", "inf.bare": "inf", "inf.obj": "inf.obj", adj: "adj", pred: "N=", name: "name", age: "age", clock: "clock", fixed: "=" };
  const frames = meaning.frames;
  const framesCache = new Map();   // (asked thousands of times a sentence)
  meaning.frames = (v) => {
    if (!framesCache.has(v)) framesCache.set(v, frames(v).map((f) => ({ ...f, slots: f.slots.map((sl) => (CODE[sl.role] ? { ...sl, kase: CODE[sl.role], prep: null } : { ...sl, kase: "D", prep: "@" + sl.role })) })));
    return framesCache.get(v);
  };
  // (the scenes, when there are any: one situation a sentence)
  let scenes = null;
  if (useScenes) { const r = await fetch(base + "world/scenes.tsv").catch(() => null); if (r?.ok) scenes = parseScenes(await r.text(), dict); }
  // (German's word for a concept where it is not the commonest: de/rules/prefer.txt -- kaputt, not defekt)
  const prefer = new Map();
  for (const s of (await (await fetch(base + "de/rules/prefer.txt")).text()).split("\n")) { const m = s.match(/^(\S+) (.+?) = (.+)$/); if (m) prefer.set(`${m[1]}|${m[2]}`, m[3]); }
  // (the sentence's shapes: the world's -- world/shapes.txt --, gated by the target language's syllabus)
  const shapes = parseGrammar((await (await fetch(base + "world/shapes.txt")).text()) + "\n" + syllabus);
  // (the TARGET language -- whose learner the sentences are for: its words' level, which of its verbs need a feature first)
  const target = lang === "de" ? null : await loadDictionary(`${base}${lang}/dict.tsv`, `${base}${lang}/order.tsv`, lang);
  const gen = createGenerator(dict, meaning, grammar, { level, complexity, stage, scenes, rnd, prefer, shapes, target });
  gen.frames = german;
  // (the plans said in German: de/realize.js -- choosing freely: its word order, its synonyms)
  const de = await (await import("../de/realize.js")).loadGerman(base, gen, german, { vary: rnd });
  gen.setSay((b) => de.realize(b, { free: true, full: true }));
  return gen;
}

export function createGenerator(dict, meaning, grammar, { level = 2, complexity = 2, stage = null, scenes = null, rnd = Math.random, prefer = new Map(), shapes = grammar, target = null } = {}) {
  grammar.complexity = complexity;
  grammar.stage = stage;
  shapes.complexity = complexity;
  shapes.stage = stage;
  let say = null;   // (a plan -> its sentence: the language's realizer, set by loadSentences)
  const has = grammar.has;   // (a feature of the syllabus unlocked at this stage)
  // how much a sentence may hold: its clauses (relative and object clauses too), how often a noun takes a relative
  // clause, an adjective, an owner (every free choice a chance of nonsense -- the critic rounds); how often a clause is
  // passive, a sentence in the Konjunktiv II
  const BUDGET = { clauses: [1, 2, 3][complexity - 1], rel: [0, .04, .06][complexity - 1], adj: [.12, .18, .25][complexity - 1], attr: [0, .05, .08][complexity - 1] };
  const RATE = { passive: .12, subj2: [.05, .08, .1][complexity - 1], polite: .2, wish: .05 };
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const chance = (p) => rnd() < p;
  // the commoner a word, the likelier (its rank in order.tsv): verbs gently (the commonest have the broadest frames),
  // nouns and adjectives sharply (the rare ones -- Blumentopf, bürgerlich -- made most odd pairs)
  const LOCAL = 8;
  const focusOnly = new Set(grammar.words["focus-only"] ?? []);
  let focus = null;   // (sentence({ focus: { pos, concept } }): a concept the sentence is to say -- a word's examples)
  const isFocus = (e) => !!focus && !!e && e.pos === focus.pos && e.concept === focus.concept;
  let steer = {};     // (sentence({ steer: { tense, mood, plural, links, degree } }): what the sentence is wished to have --
                      //  a tense, a mood, the focus noun's plural, links (although, so-that), an adjective's degree)
  const pickCommon = (list, sharp = false) => {
    if (!list.length) return null;
    // (the focus: taken whenever a list holds it -- now and then not, so it is not always in the same place)
    if (focus) { const f = list.find((e) => e.pos === focus.pos && e.concept === focus.concept); if (f && chance(.85)) return f; }
    // (a word the world tells of only roughly -- world/lists.txt focus-only: said when asked for, never by chance)
    if (focusOnly.size) { list = list.filter((e) => !focusOnly.has(e.cid)); if (!list.length) return null; }
    // (in a scene, its own words far more often than the words of every setting: der Kellner, not always der Mann)
    const w = list.map((e) => (sharp ? 1 / (Math.min(e.rank, 1e6) + 50) : 1 / Math.sqrt(Math.min(e.rank, 1e6) + 20)) * (scene && scenes.local(scene, e) ? LOCAL : 1));
    let r = rnd() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) if ((r -= w[i]) < 0) return list[i];
    return list[list.length - 1];
  };
  // (a word, or a word=its first Slovak meaning where it has more senses: Leiter=rebrík -- die Leiter; or a CONCEPT's
  //  ID -- the world's data names concepts -- its commonest word: hladný -> hungrig, voľný_čas -> Freizeit)
  const byConcept = new Map();
  // (a concept's word: its commonest -- never a word's other sense when the concept has another word: öffnen, not eröffnen)
  const better = (e, o) => (prefer.get(`${o.pos}|${o.concept}`) === o.word) - (prefer.get(`${e.pos}|${e.concept}`) === e.word) || (e.sense > 0) - (o.sense > 0) || e.rank - o.rank;
  const allOf = new Map();   // (pos|concept -> its words, the one said by default first)
  for (const e of dict.entries) { const k = `${e.pos}|${e.concept}`; if (!byConcept.has(k) || better(e, byConcept.get(k)) < 0) byConcept.set(k, e); (allOf.get(k) ?? allOf.set(k, []).get(k)).push(e); }
  for (const es of allOf.values()) es.sort(better);
  const synonyms = (w, pos) => allOf.get(`${pos}|${w.replace(/_/g, " ")}`) ?? [];
  const word = (w, pos) => { const [x, sk] = w.split("="); return dict.entries.find((e) => e.word === x && e.pos === pos && (!sk || e.sk[0] === sk)) ?? byConcept.get(`${pos}|${w.replace(/_/g, " ")}`); };
  const tok = (e) => ({ w: e.word, ipa: e.ipa });
  // a function word of any part of speech (doch, mal, sondern, seit), spoken as the dictionary has it
  const POS_ORDER = ["PAR", "AV", "CON", "PRE", "P", "NUM", "ART", "INT", "AN", "PHR", "N", "V"];
  // (a German word of any part of speech first -- von the preposition --, only then a concept's: von the Slovak "out")
  const anyWord = (w) => { const [x] = w.split("="); for (const p of POS_ORDER) { const e = dict.entries.find((d) => d.word === x && d.pos === p); if (e) return word(w, p); } for (const p of POS_ORDER) { const e = word(w, p); if (e) return e; } return null; };
  const words = (s) => s.split(" ").map((w) => anyWord(w)).filter(Boolean).map(tok);   // ("doch mal" -> two tokens)
  // (one word a concept: its commonest -- the plan is of concepts, a word says it; a rarer synonym -- wandeln beside
  //  ändern -- is not drawn on its own: phase 1c's stand-in for the concept planner, DESIGN.md)
  const isMain = (e) => byConcept.get(`${e.pos}|${e.concept}`) === e;
  // (a concept in the level: by its word's FREQ in the target language -- German's when it is German)
  const targetFreq = (e) => { const es = target?.byConcept.get(`${e.pos}|${e.concept}`); return es ? Math.min(...es.map((x) => x.freq)) : 9; };
  const inLevel = (e) => (target ? targetFreq(e) : e.freq) <= level && isMain(e);
  // (the level first: of a pool, the words of the level that fit -- and when none fits, those above it that do; a slot
  //  no word of the level can fill is filled from the next level rather than left unsaid)
  const levelFirst = (pool, fits = () => true) => { const a = pool.filter((e) => inLevel(e) && fits(e)); return a.length ? a : pool.filter((e) => isMain(e) && fits(e)); };

  // ---- the vocabulary the plans draw on -------------------------------------------------------------------------------
  const aux = { haben: word("haben", "V"), sein: word("sein", "V"), werden: word("werden", "V") };
  const modals = ["können", "müssen", "wollen", "dürfen", "sollen"].map((w) => word(w, "V")).filter(Boolean);
  const usableVerb = (v) => isMain(v) && !M.isModal(v) && !/ /.test(v.word.replace(/^sich /, ""));
  const verbsAll = dict.entries.filter((e) => e.pos === "V" && usableVerb(e) && meaning.frames(e).length), verbs = verbsAll.filter(inLevel);
  // a noun the generator can decline: one article, a plural it can make (or none)
  const usableNoun = (n) => isMain(n) && (["der", "die", "das", "(das)", "der/das"].includes(n.article) || M.isAdjectival(n)) && !/ /.test(n.word);
  // the nouns for a category; for one under a slot-exact category (abstract) only those of exactly that one (an `event`
  // slot: no illness, no celebration)
  const exact = (cat) => (grammar.words["slot-exact"] ?? []).some((c) => meaning.isA(cat, c));
  const nounsFor = (cat) => levelFirst(meaning.nouns(cat).filter((n) => usableNoun(n) && (!exact(cat) || meaning.catsOf(n).includes(cat)) && inScene(n)));
  const listed = (name) => new Set(grammar.words[name] ?? []);
  const notUsed = listed("adj.not-used");
  const anyAdjective = dict.entries.filter((e) => e.pos === "AN" && inLevel(e) && !/ /.test(e.word) && meaning.annotated(e) && !notUsed.has(e.cid));
  // the adjectives the planner adds of its own: the everyday ones (adj.free; all when it is empty)
  const freeAdj = listed("adj.free"), stateAdj = listed("adj.state"), ungradable = listed("adj.ungradable");
  const adjectives = freeAdj.size ? anyAdjective.filter((e) => freeAdj.has(e.cid)) : anyAdjective;
  const gradable = (a) => !ungradable.has(a.cid) && !meaning.attributiveOnly(a);
  // (the free adjectives, and an adjective in focus beside them -- one the world tells of, not of the everyday list)
  const freeOr = () => { if (focus?.pos !== "AN") return adjectives; const f = anyAdjective.find((e) => e.concept === focus.concept); return f && !adjectives.includes(f) ? [...adjectives, f] : adjectives; };
  // (a category, a capitalised noun, or -x: none of these)
  const catNames = new Set(meaning.categories());   // (a list's item: a category, else a concept -- or a German noun)
  const inCats = (name) => { const its = (c) => (noun) => meaning.fits(noun, catNames.has(c) ? c : `{${c.replace(/_/g, " ")}}`), l = grammar.words[name] ?? [];
    const yes = l.filter((c) => c[0] !== "-").map(its), no = l.filter((c) => c[0] === "-").map((c) => its(c.slice(1)));
    return (noun) => yes.some((f) => f(noun)) && !no.some((f) => f(noun)); };
  const mass = inCats("mass"), defOnly = inCats("def-only"), rarePlural = inCats("rare-plural"), possessable = inCats("possessable"), vonHead = inCats("attr.von"), participlePersons = inCats("participle.persons"), notCounted = inCats("uncounted");
  // not counted, said bare where a thing takes ein (Geld, Wasser, Mehl: "kaufte Mehl"); and what is rarely counted
  const isUncounted = (noun) => meaning.flag(noun, "mass") || (noun.plural === "-" && mass(noun)) || notCounted(noun);
  const substance = (noun) => isUncounted(noun) || mass(noun);
  let owners = null;
  const ownerNouns = () => (owners ??= meaning.nouns("person").filter(inCats("owner")));   // (whose a thing is: kin and friends)
  // ADVERBS: of the everyday list only (adv.free; all when it is empty), a comment adverb or a connective of its own
  // kind; an adjective on the list is a manner adverb as it is (schnell, laut: Er fährt schnell)
  const free = listed("adv.free"), freeKinds = new Set(["time", "frequency", "manner", "place", "sentence"]);
  const adverbs = {};
  const adverbsAll = {};
  for (const e of dict.entries) if (e.pos === "AV" && isMain(e) && !/ /.test(e.word)) {
    const k = meaning.adverbKind(e);
    if (k && (!free.size || !freeKinds.has(k) || free.has(e.cid))) { (adverbsAll[k] ??= []).push(e); if (inLevel(e)) (adverbs[k] ??= []).push(e); }
  }
  for (const e of anyAdjective) if (free.has(e.cid)) (adverbs.manner ??= []).push(e);
  const everyday = (v) => routineSet.has(v.cid) || gernVerbs.has(v.cid);
  // VALENCE (sentences/valence.txt): good 1, bad -1 -- a CLAUSE's: its state's, its predicate's, its verb's, or for a verb
  // that carries (haben, bekommen) its object's; negated, the other way
  const val = (e) => (scenes && e ? scenes.valence(e) : 0);
  function clauseValence(p) {
    const st = p.atomName && !p.atomName.startsWith("A:") && scenes.state(p.atomName);
    let v = st ? Math.sign(st.forms.reduce((t, [k, w]) => t + val(word(w, k === "adj" ? "AN" : "N")), 0)) : val(p.predAdj);
    if (!v) v = val(p.verb);
    if (!v && scenes?.carries(p.verb) && p.objs.A?.kind === "np") v = val(p.objs.A.noun);
    return negatedBy(p) ? -v : v;
  }
  // a sentence whose parts agree: a reason with its action (weil er froh ist, lacht er -- not "weil er traurig ist,
  // lacht er"), a concession against it (obwohl er krank ist, arbeitet er -- not "obwohl er traurig ist, weint er"), a
  // comment with its clause (leider: bad; glücklicherweise: good), a verb of liking with its object (freut sich über
  // das Geschenk -- not "über den Unfall")
  function consistent(plans) {
    if (!scenes) return true;
    const tops = plans.filter((p) => ["MAIN", "INVERTED", "YESNO", "WH", "DROP", "IMP"].includes(p.type) && !["whether", "that"].includes(p.conjWord));
    for (const p of plans) {
      const c = p.type === "CONDV" ? "when" : p.conjWord, other = tops.find((t) => t !== p);
      const a = clauseValence(p), b = other ? clauseValence(other) : 0;
      if (a && b && ["because", "for", "when"].includes(c) && a !== b) return false;
      if (a && b && (c === "although" || c === "zwar") && a === b) return false;
      if (p.adv.conn?.word === "deshalb" && p.atomName && a && b && a !== b) return false;
      const s = p.adv.sentence && val(p.adv.sentence), cv = clauseValence(p);
      if (s && cv && s !== cv) return false;
      const att = scenes.attitude(p.verb);
      if (att) for (const o of [...Object.values(p.objs), ...p.pobj.map((x) => x.np)]) {
        const ov = o?.kind === "np" ? val(o.noun) : 0;
        if (ov && ov !== (att === "like" ? 1 : -1)) return false;
      }
    }
    return true;
  }
  let everydayList = null;
  const everydayVerbs = () => (everydayList ??= verbs.filter(everyday));   // (a relative clause tells of one: der Mann, der dort wohnt)   // (an everyday action: the routine verbs, what one does gladly)
  const imperativeVerbs = dict.entries.filter((e) => e.pos === "V" && (listed("verb.routine").has(e.cid) || listed("manner.rád").has(e.cid)));
  const zuVerbs = listed("participle.zu"), partII = listed("participle.II"), routineSet = listed("verb.routine"), gernVerbs = listed("manner.rád");
  const BROAD = new Set(["person", "animal", "agent", "living", "entity", "concrete"]);
  const vague = listed("noun.vague"), genericPerson = new Set([...listed("noun.generic-person"), ...listed("noun.rank"), ...listed("noun.collective")]), infantVerbs = listed("infant.verbs"), childVerbs = listed("child.verbs"), once = listed("verb.once"), correlates = listed("correlate.verbs"), stative = listed("stative"), changeVerbs = listed("verb.change"), directed = listed("verb.directed"), notOfPerson = listed("pred.not-person"), noCommand = listed("verb.no-command"), noPassive = listed("verb.no-passive");
  const ersatz = listed("verb.ersatz"), sayVerbs = listed("verb.say"), indirectVerbs = listed("verb.indirect"), relThing = listed("rel.thing");
  const byWords = (name, pos) => (grammar.words[name] ?? []).map((w) => word(w, pos)).filter(Boolean);
  const routineVerbs = byWords("verb.routine", "V").filter((v) => verbs.includes(v)), stateNouns = byWords("noun.state", "N"), lackNouns = byWords("noun.lack", "N");
  // a clause that says a STATE of its subject (weil er müde ist, obwohl sie Hunger hat): sein/bleiben + a state, or
  // haben + a state's noun
  const stateVerbs = [aux.sein, word("bleiben", "V"), aux.haben].filter(Boolean);
  const negative = listed("adv.negative"), noNeg = listed("adv.no-neg"), noTowns = listed("prep.no-towns");
  // a word of a grammar list, by its weight (WORDS coord: und {3} | aber ...)
  const pickWord = (name) => {
    const ws = grammar.words[name] ?? [], wt = grammar.weights[name] ?? [];
    let r = rnd() * wt.reduce((a, b) => a + b, 0);
    for (let i = 0; i < ws.length; i++) if ((r -= wt[i]) < 0) return ws[i];
    return ws[ws.length - 1];
  };
  const conjWord = (name) => word(pickWord(name), "CON") ?? anyWord(pickWord(name));
  const prepEntry = (w) => (w.startsWith("@") ? { word: w, pos: "ROLE", cid: w.slice(1), ipa: "" } : word(w, "PRE") ?? word(w, "CON"));   // (@location: a role's phrase; als: a conjunction)
  // (a list item with its sounds written: `Peter [ˈpeːtɐ]`)
  const spelled = (s) => { const m = s.match(/^(.*?)\s*\[(.*)\]$/); return m ? { w: m[1], ipa: m[2] } : { w: s, ipa: "" }; };
  const names = [...(grammar.words["name.m"] ?? []).map((s) => ({ ...spelled(s), g: "m" })), ...(grammar.words["name.f"] ?? []).map((s) => ({ ...spelled(s), g: "f" }))];
  const nameGen = (n) => (/[sxzß]$/.test(n.w) ? { w: n.w + "'", ipa: n.ipa } : { w: n.w + "s", ipa: n.ipa + "s" });   // (Peters, Thomas')
  // a slot a personal pronoun (ich, du, wir, ihn) can fill: a person's, or one above it that is still a living or
  // acting one (animal, agent) -- not `concrete`, not `entity`
  const personable = (cat) => cat !== "es" && (meaning.isA(cat, "person") || (meaning.isA("person", cat) && (meaning.isA(cat, "animal") || meaning.isA(cat, "agent"))));
  // the pronoun for a noun phrase or a name (er, sie, es, sie): its gender and number
  const whoOf = (np) => (np.num === "pl" ? "3pl" : "3sg." + np.g);
  // whether a person is a man or a woman, if said (die Frau, er, Anna -- not ich, die Leute): "m", "f" or null
  const sexOf = (o) => o?.kind === "rel" ? sexOf(o.head) : o?.kind === "np" ? ({ der: "m", die: "f" })[o.noun.article] ?? null
    : o?.kind === "name" ? o.g : o?.kind === "pron" ? ({ "3sg.m": "m", "3sg.f": "f" })[o.who] ?? null : null;
  const sameSex = (a, b) => !sexOf(a) || !sexOf(b) || sexOf(a) === sexOf(b);
  // an object with no article stands after nicht, like a bare state noun (spielt nicht Schach; hat keinen Hunger)
  // a THING: what two of a kind join (Kaffee oder Tee, sowohl den Koffer als auch den Rucksack) and a quantifier counts
  // (jedes Buch, viele Äpfel) -- not people ("jeder gute Bürgermeister", "viele gute Ehefrauen"), places, ideas
  const isThing = (n) => meaning.fits(n, "concrete") && !meaning.fits(n, "animal") && !meaning.fits(n, "place");
  // a prepositional phrase -- and the noun phrase paired with its noun after it (mit Knoblauch und Basilikum)
  // what follows a noun phrase that is paired or listed: und Basilikum / , Thymian und Basilikum (all in its case)
  const COMMA = { w: ",", ipa: "" };
  const pairTail = (np, kase = np.kase) => {
    if (!np.pair) return [];
    const nps = (o) => expand(grammar, "NP", hooks, rnd, { ...o, kase }, true) ?? [];
    const items = [np.pair.np, ...(np.more ?? [])], last = items.pop();
    return [...items.flatMap((x) => [COMMA, ...nps(x)]), ...(np.pair.second.startsWith(",") && !items.length ? [COMMA] : []), ...words(np.pair.second.replace(/^, /, "")), ...nps(last)];
  };
  // a prepositional phrase -- with its pair or list after it (mit Knoblauch und Basilikum), a postposition (über das
  // Zischen hinweg)
  const ppPhrase = (np, prep, post = null) => [...(expand(grammar, "PP", hooks, rnd, { ...np, prep }, true) ?? []), ...pairTail(np), ...(post ? words(post) : [])];
  const bareObj = (plan, o) => !!o && (o.bare || (o.kind === "np" && !o.det && !o.pair && plan.neg));
  // whose a possessive is: the clause's subject (Er wäscht sein Auto; ich gebe meinem Freund mein Buch)
  // (a zu-infinitive's subject is CONTROLLED -- the clause's subject or object it goes with: `ctrl`, standing for it)
  const subjOf = (plan) => (plan.subj?.kind === "ctrl" ? plan.subj.of : plan.subj);
  const ownerOf = (plan) => {
    const s = subjOf(plan);
    if (!s || s.es) return plan.imp ?? null;
    if (s.kind === "pron") return INDEF.has(s.who) ? "3sg.m" : s.who;
    return s.kind === "rel" ? whoOf(s.head) : whoOf(s);
  };
  // the noun a subject or object stands for, if any (a name, a pronoun: none)
  const nounOf = (o) => (o?.kind === "np" ? o.noun : o?.kind === "rel" ? o.head.noun : o?.thingOf ?? null);

  // ---- noun phrases ---------------------------------------------------------------------------------------------------
  // THE NOUN PHRASE for a role: a noun fitting the category, its number, its determiner, maybe an adjective that can
  // describe it (in a degree: sehr groß, größer, der größte), an owner after it, a relative clause -- or null
  //   owner: whose a possessive determiner is (the subject's person; none: no possessive)
  //   names: only a name (a noun without an article: nach Berlin)
  //   not: categories the noun must not be (a slot's or a subject's exclusions: person -child)
  //   prep: the preposition before it, for a place: `in` takes no place one is ON or AT (auf dem Bahnsteig, am Strand),
  //   `auf` only those one is on, `an` none one is on; `in` + accusative no bare name (nach Russland, not "in Russland gehen")
  //   need, words: a slot's requirements (+openable) or its word list ({Hund})
  //   plain: no adjective, owner or relative clause (a time phrase's noun, a comparison's)
  //   role: a person with that role in the scene (the guest orders, the staff serves)
  function nounPhrase(cat, kase, { neg = false, rel = false, owner = null, names: nameOnly = false, not = [], need = [], words: list = null, prep = null, plain = false, avoid = null, role = null, verb = null, one = false } = {}) {
    const place = prep && meaning.isA(cat, "place");
    const placeOk = (n) => {
      if (!place) return true;
      const on = meaning.flag(n, "auf"), at = meaning.flag(n, "an");
      if (prep === "auf") return on;
      if (prep === "an") return !on;
      if (prep === "in") return !on && !at && !(kase === "acc" && n.article === "(das)");
      if (noTowns.has(prep)) return !meaning.fits(n, "country") && !meaning.fits(n, "settlement");   // (not "zur Ukraine": in die Ukraine)
      return true;
    };
    // (a nominalised infinitive for an activity as such: das Lesen, das Schwimmen -- not for a kind of one, a game, a
    //  crime: not "Schlafen spielen", "Lesen tun")
    if (has("nominal") && !list && !nameOnly && !prep && cat === "activity" && !need.length && chance(.15)) {
      const v = pickCommon(routineVerbs.filter((x) => !M.isReflexive(x) && !M.separable(x)));
      if (v) return { kind: "np", noun: nominal(v), num: "sg", kase, det: chance(.7) ? { kind: "def" } : null, adj: null, cat, g: "n", neg: false };
    }
    // (a broad slot -- any person, any animal, any agent -- takes no ROLE, NATIONALITY or GROUP noun (die Herde, die
    //  Presse: where a frame names groups), and a profession only of the scene
    //  doing an action its own setting lists (der Arzt untersucht at the doctor's -- not "Der Soldat wählt"): those where a frame or a list names them, or
    //  a scene's role asks -- not "Der Helfer liest", "Der Koch beleidigt ...", "Der Bürgermeister weint")
    const broad = !list && !role && BROAD.has(cat);
    // (an adjective in focus: a noun it describes, when the slot has one -- now and then not)
    const fa = focus?.pos === "AN" && !plain ? byConcept.get(`AN|${focus.concept}`) : null;
    const described = (ns) => { if (!fa) return ns; const d = ns.filter((n) => meaning.describesIn(fa, n, cat)); return d.length && chance(.85) ? d : ns; };
    const noun = pickCommon(described(nounsFor(cat).filter((n) => n !== avoid && (list || !vague.has(n.cid)) && (list || !genericPerson.has(n.cid)) && !(broad && (meaning.fits(n, "role") || meaning.fits(n, "national") || meaning.fits(n, "group") || (meaning.fits(n, "professional") && !(scene && scenes.local(scene, n) && (!verb || scenes.together(n, verb)))))) && (!role || scenes.role(scene, n) === role) && (!nameOnly || n.article === "(das)") && !not.some((x) => meaning.fits(n, x)) && need.every((x) => meaning.fits(n, x)) && (!list || list.includes(n) || (n.word.endsWith("in") && list.some((w) => w.word === n.word.slice(0, -2)))) && placeOk(n))), true);
    if (!noun) return null;
    const proper = noun.article === "(das)" || meaning.flag(noun, "bare"), noPlural = noun.plural === "-", onlyPlural = noun.plural === "PL";
    // a MEASURE with its number (zehn Euro, drei Stunden): a numeral, the singular form for der/das units, no adjective
    if (meaning.fits(noun, "measure") && !proper) {
      const n = word(pick(["zwei", "drei", "vier", "fünf", "zehn", "zwanzig", "hundert"]), "NUM");
      if (!n) return null;
      const g = genderOf(noun, "sg", rnd), form = g === "f" && noun.plural !== "-" ? "pl" : "sg";
      return { kind: "np", noun, num: "pl", form, kase, det: { kind: "num", tok: tok(n), e: n }, adj: null, cat, g: "pl", neg: false };
    }
    const uncounted = isUncounted(noun);
    const num = onlyPlural ? "pl" : proper || noPlural || one ? "sg" : steer.plural && focus?.concept === noun.concept ? "pl" : chance(substance(noun) || rarePlural(noun) ? .05 : .25) ? "pl" : "sg";   // (Stähle, Abschiede: rarely)
    let det = proper ? null : defOnly(noun) ? { kind: "def" } : pickDet(num, uncounted, possessable(noun) ? owner : null, plain);
    // (no counting of what one cannot count: not "jede Freude", "viele Hoffnungen" -- a quantifier only of a concrete noun)
    if (det && (det.kind === "q" || det.kind === "q.mass" || (det.kind === "der-word" && det.stem !== "dies" && det.stem !== "welch")) && (!isThing(noun) || (det.stem === "jed" && noun.plural === "-"))) det = { kind: "def" };   // (not "jede Menschheit")
    // (a plural dative with its article: "den Gästen", not "gibt die Uhr Gästen")
    if (!det && num === "pl" && kase === "dat" && !proper) det = { kind: "def" };
    if (det?.kind === "indef" && (noPlural || uncounted)) det = { kind: "def" };   // (not "ein Personal", "ein Geld")
    if (neg && has("no-det") && det && (det.kind === "indef" || det.kind === "none")) det = { kind: "kein" };
    if (neg && has("no-det") && !det && !proper) det = { kind: "kein" };
    const np = { kind: "np", noun, num, kase, det, adj: null, cat, g: genderOf(noun, num, rnd), neg: neg && det?.kind === "kein" };
    if (plain || proper) return np;
    // the adjective: one that describes the noun in the sense the slot took it (Pass the document, not the ball pass),
    // maybe with a degree word (ein sehr großes Haus) or in a degree (ein größeres Haus, der größte Baum)
    const adjs = has("adjective") ? freeOr().filter((a) => !meaning.predicativeOnly(a) && meaning.describesIn(a, noun, cat) && val(a) * val(noun) >= 0) : [];   // (not "ein schöner Unfall")
    // (an adjective in focus: whenever it can describe the noun)
    const focusAdj = focus?.pos === "AN" && adjs.some((a) => a.concept === focus.concept);
    if (adjs.length && (focusAdj || chance(BUDGET.adj))) {
      np.adj = pickCommon(adjs, true);
      if (gradable(np.adj)) {
        if (det?.kind === "def" && has("comparison") && (steer.degree === "sup" || chance(.08))) np.adjDeg = "sup";
        else if ((det?.kind === "indef" || !det) && has("comparison") && (steer.degree === "comp" || chance(.08))) np.adjDeg = "comp";
        else if (has("one-gladly-very") && chance(.07)) np.deg = degreeWord(false);
      }
    } else if (has("participle") && chance(BUDGET.adj / 8)) participleAttr(np);   // (die lachenden Kinder, das gekochte Ei)
    // an OWNER after it (das Auto meines Vaters, Peters Fahrrad, ein Freund von mir)
    if (chance(BUDGET.attr) && !np.neg) {
      if (vonHead(noun) && (!det || det.kind === "indef") && has("recipient")) np.attr = { kind: "von", of: chance(.5) ? { kind: "pron", who: addressed(pick(["1sg", "2sg", "1pl"].filter(addressOk))) } : nounPhrase("person", "dat", { plain: true, words: ownerNouns() }) };
      else if (possessable(noun) && (!meaning.fits(noun, "person") || meaning.fits(noun, "relative")) && num === "sg" && chance(.4) && names.length && has("possessive")) { const nm = pick(names); np.det = { kind: "name", tok: nameGen(nm), name: nm.w }; }
      // (a person's owner only for kin and friends: die Mutter des Freundes -- not "der Raucher eines Arztes")
      else if (possessable(noun) && has("owner") && (!meaning.fits(noun, "person") || meaning.fits(noun, "relative"))) {   // (a plural owner with its article: die Hüte der Nachbarn, not "die Hüte Nachbarn")
        const of = nounPhrase("person", "gen", { plain: true, avoid: noun, words: ownerNouns() });
        if (of) { if (!of.det) of.det = { kind: "def" }; np.det = { kind: "def" }; np.attr = { kind: "gen", of }; }
      }
    }
    if (rel && has("relative") && chance(BUDGET.rel) && room()) np.rel = relativePlan(np);
    return np;
  }
  // a PARTICIPLE before the noun: I of a verb it does (die lachenden Kinder), II of one done to it (das gekochte Ei),
  // zu + I of one to be done to it (das zu lesende Buch); extended with the doer or a time (der vom Arzt empfohlene Tee,
  // das gestern gekaufte Buch)
  function participleAttr(np) {
    // (zu + participle I -- das zu lösende Problem -- of things only: not "der zu hörende Sohn")
    const noun = np.noun, kind = pick(["I", "II", "II", ...(has("participle-ext") && !meaning.fits(np.noun, "person") ? ["zuI"] : [])]);
    let frame = null;
    const person = meaning.fits(noun, "person"), allowed = listed(kind === "zuI" ? "participle.zu" : (person ? "participle.person-" : "participle.") + kind);
    if (person && !participlePersons(noun)) return;   // (lachende Kinder, wartende Gäste -- not "der lachende Sponsor", "die schwimmende Freundin")
    const pool = levelFirst(verbsAll, (v) => !M.isReflexive(v) && !stative.has(v.cid) && allowed.has(v.cid) && inScene(v) && meaning.frames(v).some((f) => {
      const ok = kind === "I" ? f.slots.length === 0 && f.subj !== "es" && slotFits(noun, f) : f.subj !== "es" && f.slots.some((s) => s.kase === "A" && !s.prep && !s.words && meaning.fitsSlot(noun, s));
      return ok;
    }));
    const v = pickCommon(pool);
    if (!v) return;
    frame = meaning.frames(v).find((f) => f.subj !== "es" && f.slots.some((s) => s.kase === "A" && !s.prep && meaning.fitsSlot(noun, s)));
    np.part = { verb: v, kind, ext: [] };
    if (kind === "II" && has("participle-ext") && chance(.5)) {
      const by = frame && personable(frame.subj) && chance(.6) ? nounPhrase(frame.subj, "dat", { plain: true }) : null;
      const advE = by ? null : word(pick(["gestern", "früher", "oft"]), "AV") ?? anyWord("gestern");
      np.part.ext = by ? expand(grammar, "PP", hooks, rnd, { ...by, det: by.det ?? { kind: "def" }, prep: word("von", "PRE") }, true) : [tok(advE)];
      Object.assign(np.part, { by, advE });   // (what it was made of: the plan's record)
    }
  }
  // a verb as a noun (das Lesen): neuter, no plural, spoken as the infinitive
  const nominal = (v) => ({ word: v.word.charAt(0).toUpperCase() + v.word.slice(1), pos: "N", article: "das", plural: "-", ipa: v.ipa, rank: v.rank, freq: v.freq, verb: v });
  // a determiner (null: none -- a plural's, a mass noun's: Wasser); quantifiers among them (alle, viele, jeder, viel)
  function pickDet(num, isMass, owner, plain) {
    const d = pickDetAny(num, isMass, owner, plain), q = d && QUANT[d.kind === "q" || d.kind === "q.mass" ? d.stem : d.kind === "der-word" ? d.stem : d.kind];
    return q && !has(q) ? { kind: "def" } : d;
  }
  // (the determiners the syllabus brings later: possessives, dieser and jeder, the quantifiers)
  const QUANT = { poss: "possessive", dies: "object", jed: "quantifiers", all: "quantifiers", viel: "quantifiers", einig: "quantifiers-more", manch: "quantifiers-more", beid: "quantifiers-more", wenig: "quantifiers-more" };
  function pickDetAny(num, isMass, owner, plain) {
    const r = rnd(), poss = owner ? { kind: "poss", stem: M.possessive(owner), who: owner } : { kind: "def" };
    if (plain) return num === "pl" ? (r < .6 ? { kind: "def" } : null) : r < .6 ? { kind: "def" } : isMass ? null : { kind: "indef" };
    if (num === "pl") return r < .45 ? { kind: "def" } : r < .62 ? null : r < .72 ? poss : r < .8 ? { kind: "der-word", stem: "all" } : r < .87 ? { kind: "q", stem: "viel" }
      : r < .92 ? { kind: "q", stem: "einig" } : r < .95 ? { kind: "der-word", stem: "manch" } : r < .97 ? { kind: "der-word", stem: "beid" } : null;
    if (isMass) return r < .5 ? { kind: "def" } : r < .72 ? null : r < .85 ? poss : r < .95 ? { kind: "q.mass", stem: chance(.7) ? "viel" : "wenig" } : { kind: "der-word", stem: "dies" };
    return r < .45 ? { kind: "def" } : r < .72 ? { kind: "indef" } : r < .86 ? poss : r < .92 ? { kind: "der-word", stem: "jed" } : { kind: "der-word", stem: "dies" };
  }
  // a DEGREE word (sehr, ziemlich, zu ...); `predicate`: zu only there (Er ist zu müde)
  const degreeWord = (predicative) => { let w; do w = pickWord("adv.degree"); while ((w === "príliš" || w === "tak") && !predicative); const e = anyWord(w); return { ...tok(e), e }; };   // (no "der so große Wald")
  // a subject: a personal pronoun (when a person may be it), an indefinite one (man, jemand, niemand), a name, `es`,
  // or a noun phrase
  // (er, sie, es only for someone named before: an earlier clause's subject -- clausePlan's subjAs)
  function subject(frame, rel, role = null, verb = null) {
    const cat = frame.subj;
    if (cat === "es") return { kind: "pron", who: "3sg.n", es: true };
    if (cat === "das") return { kind: "pron", who: "das", es: true };   // (Das ist mein Bruder.)
    if (personable(cat) && !frame.subjWords) {
      const r = rnd();
      if (r < .26) return { kind: "pron", who: addressed(pick(["1sg", "2sg", "1pl", "2pl", "formal"].filter(addressOk))) };
      if (r < .31 && has("one-gladly-very")) return { kind: "pron", who: "man" };
      if (r < .34 && has("indefinite")) return { kind: "pron", who: chance(.6) ? "jemand" : "niemand" };
      if (r < .40 && meaning.isA("person", cat) && names.length) { const n = pick(names); return { kind: "name", ...n, num: "sg" }; }
    }
    return nounPhrase(cat, "nom", { rel, not: frame.subjNot, need: frame.subjNeed, words: frame.subjWords, role, verb });
  }
  // THE SENTENCE'S ADDRESS: du/ihr or Sie -- one way to the listener in the whole sentence (not "ihr ..., Sie ...")
  const informalP = (p) => p === "2sg" || p === "2pl";
  const addressOk = (p) => !address || (address === "formal" ? !informalP(p) : p !== "formal");
  const addressed = (p) => { if (p === "formal") address = "formal"; else if (informalP(p)) address = "informal"; return p; };
  // room for one more clause in the sentence (the plans made, and the ones being made)
  const room = () => made.length + open < BUDGET.clauses;
  // a negation in the clause already (nicht, kein, nie, niemand, nichts, weder ... noch)
  const negatedBy = (plan) => plan.neg || plan.kein || Object.values(plan.adv).some((a) => negative.has(a.cid));

  // ---- clause plans ---------------------------------------------------------------------------------------------------
  // A PLAN: the verb and a frame it can fill, the subject, the objects, adverbs, tense, mood, voice, modal, negation.
  //   need: { subjFits (a relative clause's head as its subject), relRole (the head's role in a relative clause: acc,
  //   dat, prep, wo), subjNP (a given subject: dessen Auto), subjAs (the subject an earlier clause had: this one's is
  //   its pronoun -- ..., weil er müde ist), control (a zu-infinitive's), imperative, noNeg, negate, conn (after
  //   und/aber), state / routine (what a linked clause says), tense, mood (subj1, subj2), polite, verbs, depth }
  // (a verb in focus joins the everyday ones a clause may ask for -- after damit, bevor, je: so a rarer verb can be there)
  const withFocusVerb = (pool) => { if (focus?.pos !== "V") return pool; const f = verbs.find((v) => v.concept === focus.concept); return f && !pool.includes(f) ? [...pool, f] : pool; };
  function clausePlan(type, need = {}) {
    open++;
    try { return makePlan(type, need); } finally { open--; }
  }
  function makePlan(type, need) {
    const mark = made.length;   // (a failed try's clauses -- a relative clause made for it -- are not the sentence's)
    for (let tries = 0; tries < 40; tries++) {
      made.length = mark;
      const verb = pickCommon(levelFirst(need.verbs ?? (need.state ? stateVerbs : need.routine ? withFocusVerb(routineVerbs) : verbsAll), (v) => verbLearnt(v) && (type !== "ZU" || !noCommand.has(v.cid))));
      if (!verb) return null;
      if (need.notVerb === verb && tries < 39) continue;   // (a second clause says something else: not the first one's verb again)
      need.verbWord = verb.word;
      const frames = meaning.frames(verb).filter((f) => frameOk(f, need) && (!need.state || stateFrame(verb, f)));
      if (!frames.length) continue;
      // (a frame naming its typical nouns -- a word list -- three times likelier than a broad one: the typical object)
      const fw = frames.map((f) => (f.subjWords || f.slots.some((s) => s.words) ? 3 : 1));
      let fr = rnd() * fw.reduce((a, b) => a + b, 0), frame = frames[frames.length - 1];
      for (let i = 0; i < frames.length; i++) if ((fr -= fw[i]) < 0) { frame = frames[i]; break; }
      const plan = { type, verb, frame, objs: {}, pobj: [], adv: {}, depth: need.depth ?? 0, mood: need.mood ?? "ind", front: need.front, noNeg: need.noNeg };
      // THE PASSIVE: the object is the subject (Das Auto wird repariert; von ihm: now and then the doer); a thing one
      // opens, breaks, cooks... also in its state (Das Fenster ist geöffnet)
      const passiveSlot = canPassive(verb, frame, type, need) && chance(RATE.passive) ? frame.slots.find((s) => s.kase === "A" && !s.prep) : null;
      if (passiveSlot) {
        const r = rnd();   // (the passive; the state passive; sein + zu: Das Problem ist zu lösen; sich lassen: Das Fenster lässt sich öffnen)
        // (sein + zu, sich lassen: of what one does to a thing -- the verbs of participle.zu / participle.II: Das Problem
        //  ist zu lösen, Das Fenster lässt sich öffnen -- not "Wo sind wir zu operieren?", "Ihr lasst euch meinen")
        const thingy = !personable(passiveSlot.cat) || !!passiveSlot.words;
        plan.voice = passiveSlot.need?.length && has("passive-more") && r < .35 ? "state" : has("be-to") && r < .5 && thingy && zuVerbs.has(verb.cid) ? "seinzu"
          : has("can-be-done") && r < .65 && thingy && partII.has(verb.cid) ? "sichlassen" : "passive";
        if (plan.voice === "sichlassen") plan.refl = "acc";
        plan.skip = passiveSlot;
        plan.subj = personable(passiveSlot.cat) && !passiveSlot.words && plan.voice === "passive" && chance(.25) ? { kind: "pron", who: addressed(pick(["1sg", "2sg", "1pl", "2pl", "formal"].filter(addressOk))) }
          : nounPhrase(passiveSlot.cat, "nom", { rel: true, not: passiveSlot.not, need: passiveSlot.need, words: passiveSlot.words, verb });
        if (plan.voice === "passive" && frame.subj !== "es" && !frame.subjWords && chance(.2)) {   // (von a person; durch a cause: durch ein Feuer)
          const durch = !personable(frame.subj) && has("passive-more");
          const by = nounPhrase(frame.subj, durch ? "acc" : "dat", { plain: true, not: frame.subjNot, verb });
          // (von a profession, an institution -- "von der Polizei verhaftet", not "von der Sängerin gezeichnet")
          if (by && (durch || meaning.fits(by.noun, "professional") || meaning.fits(by.noun, "institution"))) plan.pobj.push({ prep: word(durch ? "durch" : "von", "PRE"), np: by, agent: durch ? "through" : "by" });
        }
      }
      else if (need.control) plan.subj = { kind: "ctrl", of: need.control };
      else if (need.subjFits) plan.subj = { kind: "rel", head: need.subjFits };
      else if (need.subjNP) plan.subj = need.subjNP;
      else if (need.wer) plan.subj = { kind: "pron", who: "wer", hidden: true };   // (Wer Hunger hat, ...: wer is the relative)
      else if (need.subjAs) {   // (thingOf: the noun a thing's pronoun stands for -- what it can do is the noun's)
        const a = need.subjAs;
        plan.subj = a.kind === "pron" ? (a.who === "jemand" ? { kind: "pron", who: "3sg.m" } : { ...a }) : a.kind === "name" ? { kind: "pron", who: whoOf(a) } : { kind: "pron", who: whoOf(a), thingOf: meaning.fits(a.noun, "person") ? null : a.noun };
      }
      else if (type === "IMP") { plan.imp = addressed(pick(["2sg", "2pl", "formal"].filter(addressOk))); plan.subj = plan.imp === "formal" ? { kind: "pron", who: "formal" } : null; }
      else if (need.polite) plan.subj = { kind: "pron", who: addressed(pick(["2sg", "2pl", "formal"].filter(addressOk))) };
      else plan.subj = subject(frame, type !== "REL", scene && scenes.role(scene, verb), verb);
      if (plan.subj === undefined || (type !== "IMP" && !need.subjFits && !plan.subj)) continue;
      if (plan.subj?.kind === "np" && !plan.voice && meaning.fits(plan.subj.noun, "infant") && !infantVerbs.has(verb.cid)) continue;   // (not "das Baby feiert")
      if (plan.subj?.kind === "np" && !plan.voice && meaning.fits(plan.subj.noun, "child") && !frame.subjWords && !meaning.isA(frame.subj, "child") && !(everyday(verb) || infantVerbs.has(verb.cid) || childVerbs.has(verb.cid))) continue;   // (not "das Kind kündigt den Vertrag")
      const S = subjOf(plan);
      plan.person = personOf(plan);
      if (S?.who === "niemand") plan.kein = true;   // (niemand: the clause's negation)
      plan.neg = has("negation") && (need.negate ?? (type !== "REL" && type !== "ZU" && !need.noNeg && !plan.kein && chance(.15)));   // (no "nicht zu ...": "begann, es noch nicht zu integrieren")   // (negate: aber's contrast)
      plan.relRole = need.relRole;
      if (!fillSlots(plan, need)) continue;
      // (nichts, niemand as an object: the negation already -- not "hat niemanden nicht gesehen")
      if (Object.values(plan.objs).some((o) => o?.kind === "pron" && (o.who === "nichts" || o.who === "niemand"))) plan.neg = false;
      if (need.objWord && plan.objs.A?.noun?.word !== need.objWord) continue;
      if (need.otherThan && plan.objs.A?.kind !== "np") continue;
      // (after a feeling, no other feeling named: not "Weil sie glücklich war, weinte sie vor Angst")
      if (need.noFeeling && [...Object.values(plan.objs), ...plan.pobj.map((p) => p.np)].some((o) => o?.noun && meaning.fits(o.noun, "feeling"))) continue;   // (entweder ... oder: another object of the same action)   // (the thing needed, not a pronoun for something else)
      // (no noun twice in a clause: not "unterscheidet das Los vom Los", "die Bank passt zur Bank")
      const nouns = [subjOf(plan), ...Object.values(plan.objs), ...plan.pobj.map((p) => p.np)].filter((o) => o?.kind === "np").map((o) => o.noun);
      if (new Set(nouns).size < nouns.length) continue;
      // (a state's object: after "weil er Hunger hat", food -- not "bestellt er Wasser")
      if (need.objOf?.length && plan.objs.A && !(plan.objs.A.kind === "np" && need.objOf.some((c) => meaning.fits(plan.objs.A.noun, c)))) continue;
      // the TENSE: an imperative and a zu-infinitive have none; a reported clause, a Konjunktiv II one, a linked one
      // their own; else the sentence's time (past, or not past) chooses
      plan.tense = type === "IMP" || type === "ZU" ? "present" : need.tense ?? pickTense(TENSES[plan.mood !== "ind" ? plan.mood : time === "past" && type === "SUB" ? "pastSub" : time]);
      // (not "wird kurz werden werden"; a state no future, no modal: not "wird haben", "muss gehören"; the state passive
      //  is a state)
      plan.tense = tenseLearnt(plan, plan.tense);
      if (type === "REL" && (plan.tense === "future" || plan.tense === "future2")) plan.tense = "present";   // (a relative clause says what is: not "das er hören wird")
      if ((plan.voice === "seinzu" || plan.voice === "sichlassen") && plan.tense !== "past") plan.tense = "present";
      // a ZU-VERB instead of a modal: haben zu (Ich habe zu arbeiten), scheinen zu (Er scheint müde zu sein), brauchen
      // nicht zu (Du brauchst nicht zu kommen)
      if (!plan.voice && !plan.inf && !need.noModal && (type === "MAIN" || type === "INVERTED" || type === "SUB" || type === "YESNO") && (plan.tense === "present" || plan.tense === "past") && plan.mood === "ind" && chance(.03)) {
        const zv = pick([...(has("be-to") ? ["haben", "scheinen"] : []), ...(has("need-to") ? ["brauchen"] : [])]);
        // (haben zu: something to do -- "hat einen Brief zu schreiben", not "hat zu spazieren", "hat zu stürzen")
        if (zv && !(zv === "brauchen" && (plan.kein || Object.values(plan.objs).some((o) => o?.pair))) && (zv === "scheinen" || subjectFits(plan, "person")) && !(zv === "haben" && (stative.has(plan.verb.cid) || !plan.objs.A || noCommand.has(plan.verb.cid)))) {
          plan.zuVerb = word(zv, "V");
          if (zv === "brauchen") { plan.neg = true; plan.kein = false; }
        }
      }
      const state = stative.has(plan.verb.cid);
      if (plan.tense === "future" && (plan.verb === aux.werden || state || plan.voice === "state")) plan.tense = "present";
      if (plan.voice === "state" && plan.tense === "perfect") plan.tense = "present";
      const modal = need.modal ?? pick(plan.voice ? modals.filter((m) => m.word !== "wollen" && m.word !== "mögen") : modals);   // (a passive does not want: not "Das Stück will aufgeführt werden")
      const modalTense = plan.tense === "present" || (plan.tense === "past" && has("past-basic")) || ((plan.tense === "perfect" || plan.tense === "pluperfect") && has("modal-perfect"));
      if (!plan.zuVerb && plan.voice !== "seinzu" && plan.voice !== "sichlassen") if (need.modal || (has("modal") && modalTense && (!plan.voice || has("passive-more")) && type !== "IMP" && type !== "ZU" && plan.mood !== "subj1" && !state && !need.noModal && plan.voice !== "state" && !plan.inf && plan.tense !== "future" && chance(.15)
        && (plan.voice === "passive" || subjectFits(plan, meaning.frames(modal)[0]?.subj)))) plan.modal = modal;
      if (plan.modal) plan.tense = tenseLearnt(plan, plan.tense);   // (a modal's tenses: its perfect later)
      // ADVERBS: a time or a frequency (not both; a command: a time), manner, place, a comment, a connective after
      // und/aber -- each only where it fits:
      //   time     its tenses (damals: past, perfect) hold the clause's tense, and the sentence's time (not damals in a
      //            sentence about now, even in its perfect); or a time PHRASE (am Montag, letzte Woche, seit zwei Jahren)
      //   manner   its subject (gern: a person; else an agent -- not "das Jahr endete umgehend")
      //   place    a clause about a living subject with no place of its own (placeable): an adverb or a PHRASE (im Garten)
      //   comment  a statement's, not a question's or a command's (vermutlich)
      //   with a negation (nicht, kein, nie) none that clashes with it (bereits, nie nicht)
      //   a command takes a time to come (bald, morgen), a manner adverb made of an adjective one that describes the
      //   subject (schnell: a car, a dog)
      // (a time or frequency adverb in focus: its kind whenever the clause can have one)
      const focusWhen = type !== "IMP" && type !== "ZU" && (focus && ["time", "frequency"].find((k) => (adverbs[k] ?? []).some((x) => x.pos === focus.pos && x.concept === focus.concept)) || (steer.freq && isFocus(plan.verb) ? "frequency" : null));   // (or a habit wished for: the imperfect's)
      const when = !need.atomName && !need.desto && type !== "JE" && (focusWhen ? (focusWhen === "frequency" ? "freq" : "time") : chance(.15) && (type !== "IMP" && type !== "ZU" && chance(.3) ? "freq" : type === "ZU" ? null : "time"));
      const tenseOk = (tenses) => !tenses || (tenses.includes(plan.tense === "pluperfect" ? "past" : plan.tense) && (time === "past" || tenses.some((t) => t === "present" || t === "future")) && (type !== "IMP" || tenses.includes("future")));
      const fits = (x, kind) => {
        if ((negatedBy(plan) || need.negate === false) && (negative.has(x.cid) || noNeg.has(x.cid))) return false;
        if (need.noNeg && negative.has(x.cid)) return false;   // (not "Weil er Durst hat, trinkt er nie")
        // (how often -- nie too: of what one does regularly, the routine verbs, those one does gladly: not "heiratet
        //  immer", "flieht oft", "kennt manchmal", "halbiert nie")
        if (kind === "freq" && plan.kein) return false;   // (not "liest nichts immer")
        if (kind === "freq" && (stative.has(plan.verb.cid) || once.has(plan.verb.cid) || !(routineSet.has(plan.verb.cid) || gernVerbs.has(plan.verb.cid) || isFocus(plan.verb)))) return false;   // (a verb in focus: as a habit too)
        const tenses = meaning.adverbTenses(x);
        if (!tenseOk(tenses)) return false;
        if (plan.mood !== "ind" && meaning.adverbIndicative(x)) return false;   // (not "hätte hoffentlich ...")
        if (type === "IMP" && kind === "time" && !tenses) return false;
        if (kind === "time" && !everyday(plan.verb) && plan.verb !== aux.sein) return false;   // (when, of an everyday action or a state: not "entlastete heute", "bedingt jetzt")
        if (kind === "manner" && x.pos === "AN" && !subjectDescribed(plan, x)) return false;
        if (kind === "manner" && x.pos !== "AN" && !subjectFits(plan, meaning.adverbSubject(x) ?? "agent")) return false;
        if (kind === "manner" && x.word === "gern" && (plan.modal || plan.kein || type === "IMP" || (plan.tense !== "present" && plan.mood !== "subj2"))) return false;   // (a habit now or a wish: not "aß gern", "Fahrt nicht gern!")   // (not "muss gern", "keinen Bericht gern", "Fahrt nicht gern!")
        if (kind === "manner" && grammar.words["manner." + x.cid] && !grammar.words["manner." + x.cid].includes(plan.verb.cid)) return false;   // (its verbs only)
        if (x.word === "gern" && !has("one-gladly-very")) return false;
        return true;
      };
      const statement = type === "MAIN" || type === "SUB" || type === "INVERTED" || type === "REL" || type === "REP" || type === "DROP";
      // (no manner in a passive, a state, a clause saying a state: not "wird gern gebracht", "hatte vorsichtig Angst")
      const mannerOk = !plan.voice && !need.state && !plan.pred && !plan.objs.A?.bare;
      for (const [kind, p] of [[when, 1], ["manner", mannerOk ? .06 : 0], ["place", placeable(plan.frame, plan.verb) && everyday(plan.verb) && type !== "JE" ? .08 : 0], ["sentence", type === "MAIN" || type === "INVERTED" || type === "DROP" ? .04 : 0]]) {   // (a comment on a statement of one's own: not "Warum ... hoffentlich", "weil ... möglicherweise")
        const inFocus = !!kind && !!focus && (adverbs[kind === "freq" ? "frequency" : kind] ?? []).some((x) => x.pos === focus.pos && x.concept === focus.concept && fits(x, kind));   // (an adverb in focus: whenever it fits)
        if (!kind || !(inFocus || chance(p))) continue;
        if (!inFocus && kind === "time" && has("time-basic") && (everyday(plan.verb) || plan.verb === aux.sein) && chance(.5)) { const t = timePhrase(tenseOk, everyday(plan.verb)); if (t) { plan.adv.time = t; continue; } }
        if (!inFocus && kind === "place" && has("place-basic") && type !== "IMP" && chance(.5)) { const t = placePhrase(); if (t) { plan.adv.place = t; continue; } }   // (no place phrase in a command: "Wandern Sie in der Kabine!")
        const a = pickCommon(levelFirst(adverbsAll[kind === "freq" ? "frequency" : kind] ?? [], (x) => fits(x, kind)));
        if (a && negative.has(a.cid)) plan.neg = false;
        if (a) plan.adv[kind] = a;
      }
      if (has("cause-phrases") && statement && !need.atomName && !need.oneOfMany && chance(.05)) {   // (one clause's: not "trotz der Warnung ..., obwohl ...")   // (wegen des Regens, trotz der Kälte, während des Konzerts)
        // (in a scene, by the action's conditions: wegen what it needs, trotz its opposite -- Trotz seines Fiebers arbeitet
        //  er; a word of the list was mostly unrelated: "versprach wegen des Lärmes Unterstützung")
        const [prep, np] = scene ? causePhrase(plan) : (() => { const p = pick(["because-of", "despite", "during"]); return [p, nounPhrase("entity", "gen", { plain: true, words: byWords("gen." + p, "N") })]; })();
        const GEN_DE = { "because-of": "wegen", despite: "trotz", during: "während", "instead-of": "statt" }, pw = prep && word(GEN_DE[prep] ?? prep, "PRE");
        if (np && pw) plan.adv.gen = { phrase: [tok(pw), ...expand(grammar, "NP", hooks, rnd, { ...np, det: np.det ?? { kind: "def" } }, true)], key: prep, spec: npSpec({ ...np, det: np.det ?? { kind: "def" } }) };
      }
      if (need.conn && has("connectives") && chance(.5)) { const c = word(pickWord("conn." + need.conn), "AV"); if (c) plan.adv.conn = c; }
      if (need.gern && !plan.voice && !plan.kein && subjectFits(plan, "person") && gernVerbs.has(plan.verb.cid)) plan.adv.manner = word("gern", "AV");
      // NEGATION beyond nicht: no longer, not yet, not at all
      if (plan.neg && has("negation-more") && plan.adv.manner?.word !== "gern" && chance(.25)) {   // (not "noch nicht gern")
        const t = plan.tense, opts = [["neg.all", true], ["neg.longer", t === "present" || t === "past"], ["neg.yet", t === "present" || t === "perfect"]].filter(([, ok]) => ok);
        const nk = pick(opts)[0]; plan.negWords = words(pickWord(nk)); plan.negKind = nk;
      }
      // a MODAL PARTICLE, as spoken: Komm doch mal! Was machst du denn? Das ist ja schön. Das wird schon gehen.
      // (a command's bitte from the start: Komm bitte!)
      const pc = type === "IMP" ? (has("particles") ? ["part.imp", .4] : ["part.bitte", .3]) : !has("particles") ? null : type === "YESNO" || type === "WH" ? ["part.question", .25]
        : (type === "MAIN" || type === "INVERTED") && plan.mood === "ind" ? (plan.tense === "future" ? ["part.future", .3] : ["part.statement", .07]) : null;
      // (not "natürlich ja"; no "doch mal" beside a time: not "Komm doch mal jetzt")
      if (pc && chance(pc[1]) && (type === "IMP" || !negatedBy(plan)) && !plan.adv.sentence && !(type === "IMP" && (plan.adv.time || plan.neg))) { const pw = pickWord(pc[0]); plan.part = words(pw); plan.partWords = pw; }
      made.push(plan);
      return plan;
    }
    return null;
  }
  // a verb the stage knows how to use: a separable or reflexive one only once those are learnt
  // (a verb the target language's learner meets once a feature is learnt: a German separable or reflexive one, an
  //  English phrasal one, a Spanish or French reflexive one)
  const gates = (v) => {
    if (!target) return [...(M.separable(v) ? ["particle-verbs"] : []), ...(M.isReflexive(v) ? ["reflexive"] : [])];
    const w = target.byConcept.get(`V|${v.concept}`)?.[0]?.word ?? "";
    const head = w.split(" ")[0], refl = /^(se |s')/.test(w) || (target.lang === "es" && /se$/.test(head));
    return [...(target.lang === "en" && / /.test(w) ? ["particle-verbs"] : []), ...(refl ? ["reflexive"] : [])];
  };
  const verbLearnt = (v) => gates(v).every((f) => has(f)) && inScene(v);
  // a word of the sentence's SCENE (its setting, above or below it, or of every setting); sein, haben, werden always
  const inScene = (e) => !scene || scenes.has(scene, e) || e === aux.sein || e === aux.haben || e === aux.werden;
  // a frame the stage can fill: each kind of slot unlocked (the accusative, the dative, a preposition, a clause ...)
  const TWO_WAY = new Set(["in", "an", "auf", "über", "unter", "vor", "hinter", "neben", "zwischen"]);
  function slotLearnt(s) {
    if (s.prep) return s.role === "goal" ? has("direction") : has("place-basic");
    return ({ A: "object", "A=": "object", A2: "object", D: "recipient", G: "owner", A0: "idioms", "=": "idioms", sich: "reflexive", "sich.D": "reflexive",
      dass: "that-because-if", ob: "that-because-if", zu: "infinitive", "zu.subj": "infinitive", inf: "causative", "inf.obj": "causative", adj: "predicate",
      "N=": "predicate", name: "name-age-clock", age: "name-age-clock", clock: "name-age-clock" })[s.kase] ?? null;
  }
  const frameLearnt = (f) => f.slots.every((s) => { const k = slotLearnt(s); return typeof k === "boolean" ? k : typeof k === "string" ? has(k) : true; });
  // a TENSE the stage has learnt -- else the nearest it has (the simple past of sein, haben and the modals before
  // that of every verb: A2 says "ich war", but "ich habe gegessen")
  function tenseLearnt(plan, t) {
    if (plan.voice && !has("passive-more") && t !== "present" && t !== "past") return "past";   // (the passive first in the present and the past)
    if (plan.mood === "subj2" && t === "perfect" && !has("conditional-past")) return "present";   // (hätte gemacht with B1.2)
    if (plan.mood === "subj2" && t === "perfect" && plan.modal && !has("modal-perfect")) return "present";
    // (Futur II of a done everyday action only: "wird gegessen haben" -- not "wird gewusst haben")
    if (t === "future2" && !routineSet.has(plan.verb.cid)) t = "future";
    // (to du, ihr the perfect: "habt ihr gelesen" -- not "ihr last", "ihr schient"; sein, haben, the modals keep it: warst, konntet)
    if (t === "past" && (plan.person === "2sg" || plan.person === "2pl") && plan.verb !== aux.sein && plan.verb !== aux.haben && !plan.modal && has("perfect")) t = "perfect";
    const ok = { present: true, perfect: has("perfect"), past: has("past") || (has("past-basic") && (plan.verb === aux.sein || plan.verb === aux.haben || !!plan.modal)),
      pluperfect: has("pluperfect"), future: has("future"), future2: has("future-perfect") }[t];
    if (ok) return t;
    if (t === "pluperfect" || t === "past") return has("perfect") ? "perfect" : "present";
    if (t === "future2") return has("future") ? "future" : "present";
    return "present";
  }
  // the person the finite verb agrees with: the subject's (a pronoun's, a name's, a noun phrase's number; a relative
  // clause's head; a command's addressee)
  function personOf(plan) {
    const S = subjOf(plan);
    return S?.kind === "pron" ? verbPersonOf(S.who) : S?.kind === "name" ? "3sg" : (S?.kind === "np" && plan.subj.kind === "ctrl") ? whoOf(S)
      : plan.subj?.kind === "rel" ? (plan.subj.head.num === "pl" ? "3pl" : "3sg") : plan.imp ?? (S?.num === "pl" ? "3pl" : "3sg");
  }
  const verbPersonOf = (who) => (INDEF.has(who) ? "3sg" : who);
  // a clause may be PASSIVE: an accusative object to make its subject, a doer, no reflexive, a verb that has a passive
  function canPassive(verb, frame, type, need) {
    if (!has("passive") || (need.mood === "subj2" && !has("passive-subj2"))) return false;
    if (need.control || need.subjFits || need.subjNP || need.subjAs || need.relRole || need.state || need.routine || need.polite || need.mood === "subj1") return false;
    if (!["MAIN", "INVERTED", "SUB", "YESNO", "WH", "REP"].includes(type) || noPassive.has(verb.cid) || M.isReflexive(verb) || !(verb.aux ?? "").includes("hat")) return false;
    if (frame.subj === "es" || frame.slots.some((s) => ["sich", "sich.D", "A0", "A=", "inf", "inf.obj", "=", "adj"].includes(s.kase))) return false;
    if (frame.slots.some((s) => s.role === "source")) return false;
    // (a thing that acts on a person has no passive: "Die Eltern werden interessiert", "Er wird gefreut" -- a person's, a cause's on a thing do)
    if (!personable(frame.subj) && frame.slots.some((s) => s.kase === "A" && !s.prep && (s.cat ? personable(s.cat) : s.words?.some((w) => meaning.fits(w, "person"))))) return false;   // (its von would read as the doer: "Die Meinung wird von der Tatsache unterschieden")
    return frame.slots.some((s) => s.kase === "A" && !s.prep);
  }
  // an adjective can be said of the subject (a manner adverb made of it: Das Auto fährt schnell; a predicate)
  function subjectDescribed(plan, adj) {
    const s = subjOf(plan);
    if (!s) return plan.imp ? meaning.describesCat(adj, "person") : false;
    if (s.es) return false;
    if (s.kind === "pron" || s.kind === "name") return s.thingOf ? meaning.describes(adj, s.thingOf) : meaning.describesCat(adj, "person");
    return meaning.describes(adj, nounOf(s));
  }
  // the subject fits a category (a modal's: a Sonnenfinsternis does not want)
  function subjectFits(plan, cat) {
    const s = subjOf(plan);
    if (!cat) return true;
    if (!s && plan.imp) return personable(cat);   // (a command's subject: who is told)
    if (!s || s.es) return false;
    if (s.kind === "pron" || s.kind === "name") return s.thingOf ? meaning.fits(s.thingOf, cat) : personable(cat);
    return meaning.fits(nounOf(s), cat);
  }
  // a frame that says a state: sein/bleiben + an adjective, haben + a noun
  // (a state's frame: sein + adj; haben + a state -- a bare noun, a feeling, an illness: not "haben A furniture")
  const stateWords = new Set([...stateNouns, ...lackNouns].map((n) => n.word));
  const stateFrame = (v, f) => f.slots.length === 1 && (v === aux.haben
    ? f.slots[0].kase === "A0" || (f.slots[0].kase === "A" && (f.slots[0].cat === "illness" || f.slots[0].cat === "feeling" || !!f.slots[0].words?.some((w) => stateWords.has(w.word ?? w))))
    : f.slots[0].kase === "adj");
  // ---- CONDITIONS: clause links from what actions need and give (scenes.tsv) ------------------------------------------
  // an atom's equal: a state, has:Noun, has:A (any object had), the money state and has:peniaze
  const atomEq = (a, b) => a === b || (a === "peniaze" && b === "has:peniaze") || (b === "peniaze" && a === "has:peniaze");
  const meets = (list, atom) => (list ?? []).some((x) => atomEq(x, atom));
  // what makes a clause say a state: its verb (sein / haben) and the adjective or the noun -- or, for an object's
  // state, the object as the subject (weil es kaputt ist)
  // (a state said plainly: now, or then -- not "durstig gewesen ist", not "gesund sein sollen")
  // (a state said then when the action before it is done: "Er hat mitgemacht, weil er Lust hatte")
  const stateTense = () => (mood === "subj2" ? lastTop?.tense ?? "present" : time === "past" || ["perfect", "past", "pluperfect"].includes(lastTop?.tense) ? "past" : "present");
  function stateNeed(atom, plan = null) {
    if (atom.startsWith("A:")) {
      const o = plan?.objs.A, adj = o?.kind === "np" && word(atom.slice(2), "AN");
      if (!adj || meaning.attributiveOnly(adj) || !meaning.describes(adj, o.noun)) return null;   // (said of one: not "Das Büro ist ganz")   // (said only of what the adjective is for: not "der Kraftstoff ist voll")
      // (its noun again where er/sie would be the main clause's subject too: "Der Arzt behandelt den Mann, weil der Mann
      //  krank ist", not "weil er krank ist")
      const S = subjOf(plan), same = S && (S.kind === "pron" ? S.who : S.kind === "np" || S.kind === "name" ? whoOf(S) : null) === whoOf(o);
      const np = same && { ...o, det: { kind: "def" }, adj: null, rel: null, attr: null, part: null, kase: "nom", pair: null };
      return { state: true, verbs: [aux.sein], forceAdj: atom.slice(2), ...(np ? { subjNP: np } : { subjAs: o }), noNeg: true, noModal: true, atomName: atom, tense: stateTense() };
    }
    const st = scenes.state(atom);
    if (!st) return null;
    const [kind, w] = pick(st.forms);
    // (not the main clause's own word again: not "schreit vor Angst, weil er Angst hat")
    if (plan && [...Object.values(plan.objs), ...plan.pobj.map((p) => p.np)].some((o) => o?.noun?.cid === w)) return null;
    const who = st.person || kind === "noun" ? { personState: true } : {};   // (a state said as a noun -- Kopfschmerzen, Hunger, Angst -- a person's: not "Der Schwan hat Kopfschmerzen")
    return kind === "adj" ? { ...who, state: true, verbs: [aux.sein], forceAdj: w, noNeg: true, noModal: true, atomName: atom, tense: stateTense() } : { state: true, verbs: [aux.haben], forceNoun: w, noNeg: true, noModal: true, atomName: atom, tense: stateTense(), ...who };
  }
  // (a normal state is no reason: not "weil er gesund ist", "zahlt, weil er Geld hat" -- but a condition: Wenn ich Zeit hätte)
  const reason = (atom) => atom && (mood === "subj2" || !scenes.state(atom)?.default);
  const opposite = (atom) => (atom.startsWith("A:") ? (scenes.objstate(atom.slice(2))?.opposite ? "A:" + scenes.objstate(atom.slice(2)).opposite : null) : scenes.state(atom)?.opposite ?? null);
  // the scene's verbs that need what `atom` is (forward: it enables them) or give it (backward: they enable it)
  // -- a verb that gives has:A gives what it is done to: its object then is the thing needed (kaufen -> die Fahrkarte)
  const condCache = new Map();   // (a scene's verbs with conditions: asked for each link)
  const condVerbs = () => { if (!condCache.has(scene)) condCache.set(scene, verbs.filter((v) => scenes.has(scene, v) && scenes.cond(v))); return condCache.get(scene); };
  const verbsThat = (key, atoms) => condVerbs().filter((v) => atoms.some((a) => meets(scenes.cond(v)?.[key], a)
    || (key === "gives" && a.startsWith("has:") && meets(scenes.cond(v)?.gives, "has:A"))));
  const hadThing = (atoms) => atoms.find((a) => a.startsWith("has:") && a !== "has:A")?.slice(4);
  // what a planned clause gives: has:A as has:<its object> (Er kauft eine Fahrkarte: has:Fahrkarte)
  const givesOf = (plan) => (scenes.cond(plan.verb)?.gives ?? []).flatMap((g) => (g !== "has:A" ? [g] : plan.objs.A?.kind === "np" ? ["has:" + plan.objs.A.noun.word] : []));
  const plainAtoms = (list) => list.filter((a) => !a.startsWith("A:") && !a.startsWith("has:"));
  // (a step in TIME -- nachdem, bevor, und dann -- is no feeling: not "Nachdem er erschrocken war, schrie er vor Freude")
  const steps = (list) => list.filter((a) => !scenes.state(a)?.feeling);
  // (what happens to one -- husten, einschlafen -- is never AGAINST its need: not "hustet, obwohl er gesund ist")
  const willing = (vs) => vs.filter((v) => !scenes.cond(v)?.involuntary);
  const AFTER = new Set(["after", "when-past", "as-soon-as", "when"]);   // (a time clause the main one comes after)
  // (a step in time -- nachdem, bevor, und dann -- joins everyday actions: the critic found the others' chains thin,
  //  "hat die Ausbildung beendet, bevor er die Erklärung abgibt")
  // THE LINK of a clause to the one before by their conditions -- or null (none fits: the usual links)
  //   Er isst, weil er Hunger hat / obwohl er satt ist; Er isst nicht, weil er satt ist / obwohl er Hunger hat
  //   Er isst, nachdem er gekocht hat; Er arbeitet, bevor er einkauft; Er spart, um ein Auto zu kaufen
  //   Er arbeitet, und deshalb ist er müde; Weil er müde ist, schläft er; Nachdem er gearbeitet hatte, schlief er
  function conditionLink(type, prev, parent) {
    if (prev?.voice) return null;   // (a passive's subject is not the doer: not "Das Essen ist zu essen, weil es hungrig ist")
    if (prev?.modal || prev?.zuVerb) return null;   // (a modal changes the logic: not "durfte sich nicht bewerben, weil er Arbeit hatte")
    // (aber against a state only after "zwar": "Er hat zwar Angst, aber er rettet dich" -- after an action the critic
    //  found it weak: "lernte nie, aber hatte Lust")
    const against = type === "MAIN" && parent?.zwar;
    // (after a state -- Weil er müde ist, ...; Obwohl er satt ist, ...; Er ist zwar müde, aber ... -- an action that
    //  needs it, or, against it, one that needs its opposite)
    const afterWer = type === "MAIN" && prev?.type === "WERREL";
    if (afterWer && !prev.atomName) {   // (Wer arbeitet, der ist müde: what it gives)
      const g = plainAtoms(scenes.cond(prev.verb)?.gives ?? []).map((a) => stateNeed(a)).filter(Boolean);
      return g.length ? { need: pick(g) } : null;
    }
    // (entweder ... oder: the same everyday action, another thing -- Entweder trinkt er Kaffee, oder er trinkt Tee; two
    //  different actions were mostly no real alternative, nor "ermordet ... oder einen Vorsitzenden", "verbringt die Woche")
    if (type === "MAIN" && parent?.shape?.includes("w.entweder") && prev) {
      const o = prev.objs.A;
      return o?.kind === "np" && !negatedBy(prev) && everyday(prev.verb) && meaning.fits(o.noun, "concrete") ? { need: { verbs: [prev.verb], noNeg: true, noModal: true, otherThan: o.noun } } : null;
    }
    if (prev?.atomName && (type === "INVERTED" || against || afterWer)) {
      const despite = prev.conjWord === "although" || against;
      const atom = despite ? opposite(prev.atomName) : prev.atomName;
      const next = atom && (despite ? willing : (x) => x)(verbsThat("needs", [atom]));
      return next?.length ? { need: { verbs: next, noNeg: true, noModal: true, objOf: scenes.state(atom)?.of, noFeeling: !!scenes.state(prev.atomName)?.feeling, ...(mood === "ind" ? { tense: prev.tense === "past" ? "past" : "present" } : {}) } } : null;
    }
    // (je ... desto: the more one does it, the more of the state it gives -- Je mehr er arbeitet, desto müder wird er)
    if (type === "JE" && !prev) {
      // (an action that lasts or repeats: not "je länger er erschrickt", "je mehr er siegt")
      const opts = condVerbs().filter((v) => !scenes.cond(v).involuntary && !once.has(v.cid) && (routineSet.has(v.cid) || gernVerbs.has(v.cid))).flatMap((v) => plainAtoms(scenes.cond(v).gives).flatMap((a) => (scenes.state(a)?.forms ?? []).filter(([k, w]) => k === "adj" && word(w, "AN") && gradable(word(w, "AN"))).map(([, w]) => ({ v, w }))));
      const o = opts.length && pick(opts);
      return o ? { need: { verbs: [o.v], destoAdj: o.w } } : null;
    }
    if (type === "DESTO") return prev?.destoAdj ? { need: { destoAdj: prev.destoAdj } } : null;
    // (the state first -- Weil er müde ist, ...; Hätte ich Zeit, ...; Er ist zwar müde, aber ...: one some verb of the
    //  scene needs, that the next clause follows from)
    const first = !prev && (type === "SUB" || type === "CONDV" || type === "WERREL" || (type === "MAIN" && parent?.zwar));
    if (first) {
      const opts = [];
      for (const v of condVerbs()) {
        const vc = scenes.cond(v);
        for (const a of plainAtoms(vc.needs)) {
          const sn = reason(a) && stateNeed(a), op = opposite(a), on = op && stateNeed(op);
          if (type !== "SUB" || mood === "subj2") { if (sn) opts.push(() => ({ conj: type === "SUB" ? "when" : null, need: sn })); continue; }
          if (sn && has("that-because-if")) opts.push(() => ({ conj: "because", need: sn }));
          if (on && has("although-so-that")) opts.push(() => ({ conj: "although", need: on }));
        }
        if (type === "WERREL" && plainAtoms(vc.gives).some((g) => stateNeed(g))) opts.push(() => ({ need: { verbs: [v], noNeg: true, noModal: true } }));   // (Wer arbeitet, der ist müde)
        if (type === "SUB" && mood !== "subj2" && everyday(v) && steps(plainAtoms(vc.gives)).length && has("pluperfect")) opts.push(() => ({ conj: "after", need: { verbs: [v], tense: time === "past" ? "pluperfect" : "perfect", noNeg: true, noModal: true } }));
      }
      return opts.length ? pick(opts)() : null;
    }
    if (type === "INVERTED" && prev && AFTER.has(prev.conjWord)) {   // (Nachdem er gearbeitet hatte, schlief er)
      const next = verbsThat("needs", steps(givesOf(prev).filter((g) => !g.startsWith("A:")))).filter(everyday);
      return next?.length ? { need: { verbs: next, noNeg: true, noModal: true } } : null;
    }
    const c = prev && scenes.cond(prev.verb), neg = prev && negatedBy(prev);
    if (!c) return null;
    // (the states that fit the action's object: hungry for food, thirsty for a drink)
    const needs = c.needs.filter((a) => fitsObject(a, prev));
    // (a main clause that names a feeling has its reason: not "schrie vor Angst, weil er wütend war")
    const feels = [...Object.values(prev.objs), ...prev.pobj.map((p) => p.np)].some((o) => o?.noun && meaning.fits(o.noun, "feeling"));
    if (feels && (type === "SUB" || type === "MAIN")) return null;
    if (type === "SUB" || (type === "MAIN" && parent?.coord === "for") || against) {
      // weil / da / denn: what it needs -- or, negated, the opposite (Er isst nicht, weil er satt ist); obwohl, aber:
      // the other way round (Er isst, obwohl er satt ist; Er isst nicht, aber er hat Hunger)
      const opts = [];
      for (const a of needs) {
        const op = opposite(a), why = neg ? op : a, despite = neg ? a : op;
        // (no concession on an object's state: not "stellte sie wieder her, obwohl sie ganz waren")
        const sn = reason(why) && stateNeed(why, prev), on = despite && !despite.startsWith("A:") && !c.involuntary && stateNeed(despite, prev);
        if (against) { if (on) opts.push(() => ({ need: on })); continue; }
        if (sn && (type === "MAIN" || has("that-because-if"))) opts.push(() => ({ conj: mood === "subj2" ? "when" : "because", need: sn }));
        if (type === "MAIN" || mood === "subj2") continue;   // (Er würde essen, wenn er Hunger hätte)
        if (on && has("although-so-that")) opts.push(() => ({ conj: "although", need: on }));
        // (an object's state is no step between two actions: their objects differ -- not "stellt die Ruhe wieder her,
        //  nachdem er die Scheibe kaputtgemacht hat")
        const before = !neg && everyday(prev.verb) && !a.startsWith("A:") && steps([a]).length && verbsThat("gives", [a]).filter(everyday), thing = hadThing([a]);
        if (before?.length && has("pluperfect")) opts.push(() => ({ conj: "after", need: { verbs: before, tense: time === "past" ? "pluperfect" : "perfect", noNeg: true, noModal: true, ...(thing ? { objWord: thing } : {}) } }));
      }
      const after = !neg && type === "SUB" && mood !== "subj2" && everyday(prev.verb) && verbsThat("needs", steps(givesOf(prev).filter((g) => !g.startsWith("A:")))).filter(everyday);
      // (in the main clause's time: not "ist aufgewacht, bevor sie aufsteht")
      if (after?.length && has("temporal")) opts.push(() => ({ conj: "before", need: { verbs: after, noNeg: true, noModal: true, tense: ["past", "perfect", "pluperfect"].includes(prev.tense) ? "past" : "present" } }));
      if (!opts.length) return null;
      const l = pick(opts)();
      if (type === "MAIN") delete l.conj;   // (denn, aber: the coordinator is the link)
      return l;
    }
    if (type === "ZUADV") {   // (um ... zu: what the action gives, another needs -- a thing or a GOAL
      //  state (Geld, stark), not any: not "rennt, um einzuschlafen")
      const goal = !neg && verbsThat("needs", givesOf(prev).filter((g) => g.startsWith("has:") || scenes.state(g)?.goal));
      return goal?.length ? { need: { verbs: goal } } : null;
    }
    if ((type === "MAIN" && parent?.coord === "and") || type === "DROP") {   // (..., und deshalb ist er müde; ... und schläft dann)
      // (not the action's own result again: "ist erkrankt, und deshalb ist er krank" -- ermüden, müde; aufwachen, wach)
      const own = (g) => (scenes.state(g)?.forms ?? []).some(([k, w]) => { const e = word(w, k === "adj" ? "AN" : "N"); return !!e && prev.verb.word.toLowerCase().includes(e.word.toLowerCase().replace(/e$/, "")); });
      const gives = !neg ? givesOf(prev).filter((g) => !g.startsWith("A:") && !own(g)) : [];
      const stepGives = steps(gives);
      const done = ["past", "perfect", "pluperfect"].includes(prev.tense);   // (deshalb after what is done: not "wird rudern, und deshalb ist sie müde")
      const g = gives.length && pick(gives), sn = g && type === "MAIN" && done && !c.involuntary && chance(.5) && stateNeed(g), next = g && stepGives.includes(g) && everyday(prev.verb) && verbsThat("needs", [g]).filter(everyday);
      if (sn) return { need: sn, conn: "deshalb" };
      return next?.length ? { need: { verbs: next, noNeg: true, noModal: true }, conn: "dann" } : null;
    }
    return null;
  }
  // a state that fits the action's object -- STATE ... ; of food: only when it is food (hungrig), drink (durstig)
  // wegen / trotz + a state's noun by the clause's conditions (wegen seiner Angst, trotz des Fiebers) -- [prep, np] or []
  function causePhrase(plan) {
    const c = scenes.cond(plan.verb);
    if (!c || negatedBy(plan) || plan.mood !== "ind") return [];
    // (wegen a plain state -- wegen des Fiebers; a feeling, a goal one acts out of: aus Lust, not "wegen seiner Lust")
    const why = (a) => reason(a) && !scenes.state(a)?.feeling && !scenes.state(a)?.goal;
    const nouns = (atom, prep) => (scenes.state(atom)?.forms ?? []).filter(([k]) => k === "noun").map(([, w]) => [prep, word(w, "N")]);
    const used = new Set([...Object.values(plan.objs), ...plan.pobj.map((p) => p.np)].map((o) => o?.noun?.word));
    const opts = plainAtoms(c.needs).filter((a) => fitsObject(a, plan)).flatMap((a) => [...(why(a) ? nouns(a, "because-of") : []), ...(opposite(a) && !c.involuntary ? nouns(opposite(a), "despite") : [])])
      .filter(([, n]) => n && !used.has(n.word));
    if (!opts.length) return [];
    const [prep, n] = pick(opts), owner = ownerOf(plan);
    // (the state's noun as the state clauses have it: no scene word -- seiner Angst, des Fiebers)
    return [prep, { kind: "np", noun: n, num: "sg", kase: "gen", det: owner && possessable(n) ? { kind: "poss", stem: M.possessive(owner), who: owner } : { kind: "def" }, adj: null, cat: "entity", g: genderOf(n, "sg", rnd), neg: false }];
  }
  function fitsObject(atom, plan) {
    const of = scenes.state(atom)?.of;
    if (!of?.length) return true;
    const o = plan.objs.A;
    return !o || (o.kind === "np" && of.some((c) => meaning.fits(o.noun, c)));
  }
  const slotFits = (noun, f) => meaning.fitsSlot(noun, { cat: f.subj, not: f.subjNot, need: f.subjNeed ?? [], words: f.subjWords });
  function frameOk(f, need) {
    if (!frameLearnt(f)) return false;
    // (one clause inside another, no deeper; not past the sentence's budget; a command none: "Setzen Sie voraus!")
    if (f.slots.some((s) => (s.kase === "dass" || s.kase === "ob") && ((need.depth ?? 0) > 0 || need.imperative || !room()))) return false;
    if (f.slots.some((s) => (s.kase === "zu" || s.kase === "zu.subj") && ((need.depth ?? 0) > 0 || !room()))) return false;
    // (a zu-infinitive's frame: its subject must be what the controller is -- a person for "ihm erlauben, zu gehen")
    if (need.control) {
      const c = need.control, noun = c.kind === "np" ? c.noun : c.thingOf;
      if (f.subj === "es" || !(noun ? slotFits(noun, f) : personable(f.subj) && !f.subjWords)) return false;
    }
    // (a relative clause's head as its subject: its noun in the sense its own slot took it -- Geflügel the meat stays
    //  meat; a given subject -- dessen Auto -- the same)
    const head = need.subjFits ?? need.subjNP;
    if (head && !(f.subj !== "es" && slotFits(head.noun, f) && meaning.fitsIn(head.noun, head.cat, f.subj))) return false;
    if (need.relRole && !relSlot(f, need.relHead, need.relRole)) return false;
    if (need.imperative && (!personable(f.subj) || f.subjWords)) return false;
    // (a command of an everyday action -- the routine verbs, what one does gladly: not "Nehmen Sie zu!", "Versuchen Sie,
    //  die Straßen zu verschmutzen!")
    if (need.imperative && !routineSet.has(need.verbWord) && !gernVerbs.has(need.verbWord)) return false;
    if (need.rel && f.subj === "es") return false;   // (no "das es gibt" in a relative clause)
    if ((need.imperative || need.polite) && noCommand.has(need.verbWord)) return false;   // (no command of a state: "Haben Sie ...!")
    if ((need.polite || need.living || need.wer) && !personable(f.subj)) return false;
    if (need.desto && !f.slots.some((s) => s.kase === "adj")) return false;   // (desto müder wird er -- not "desto Ingenieure")
    if (need.subjAs) {   // (the earlier subject must fit this frame's: its noun, or a person)
      const a = need.subjAs, noun = a.kind === "np" ? a.noun : a.thingOf;
      if (f.subj === "es" || a.es || !(noun ? slotFits(noun, f) : personable(f.subj) && !f.subjWords)) return false;
    }
    if (f.slots.some((s) => s.prep && !prepEntry(s.prep))) return false;
    return true;
  }
  // the slot a relative clause's head fills (den ich kenne, dem ich helfe, mit dem ich spreche, wo ich wohne)
  function relSlot(f, head, role) {
    if (role === "wo") return placeable(f) ? { wo: true } : null;
    const fitsHead = (s) => (head.indef ? !personable(s.cat) && !s.words : meaning.fitsSlot(head.noun, s));
    return f.slots.find((s) => s.cat && (role === "acc" ? s.kase === "A" && !s.prep : role === "dat" ? s.kase === "D" && !s.prep : s.prep && (s.kase === "A" || s.kase === "D")) && fitsHead(s)) ?? null;
  }
  function fillSlots(plan, need) {
    const relS = need.relRole && relSlot(plan.frame, need.relHead, need.relRole);
    if (relS?.wo) { plan.relpron = [M.wh("place")]; plan.relSpec = "where"; }
    for (const s of plan.frame.slots) {
      if (s === plan.skip) continue;   // (the passive's subject)
      if (s === relS) {   // (the relative pronoun stands for it: den, dem, mit dem; was after alles)
        const h = need.relHead, k = KASE[s.kase], pr = h.indef ? M.wh("thing", k === "dat" ? "acc" : k) : M.relpron(h.g, k);
        plan.relpron = s.prep ? [tok(prepEntry(s.prep)), pr] : [pr]; plan.relSpec = h.indef ? "what" : s.role;
        if (!s.prep) plan.objs[s.kase] = { kind: "rel", head: h };
        continue;
      }
      if (s.kase === "sich" || s.kase === "sich.D") { plan.refl = s.kase === "sich" ? "acc" : "dat"; continue; }
      if (s.kase === "adj" && need.forceAdj) {   // (a condition's state: weil er müde ist)
        const a = word(need.forceAdj, "AN"); if (!a || meaning.attributiveOnly(a)) return false;
        if (!need.atomName?.startsWith("A:") && !subjectFits(plan, "animal")) return false;   // (not "Weil der Abend krank war")
        const S = subjOf(plan);   // (and one the adjective is for: not "die Ägypterin ist faul" -- faul: -national)
        if (S?.kind === "np" && !meaning.describes(a, S.noun)) return false;
        plan.pred = [tok(a)]; plan.predAdj = a; plan.predSpec = "adj:" + a.cid; continue;
      }
      if (s.kase === "adj") { if (!(plan.pred = predicate(plan, need))) return false; continue; }
      if (s.kase === "=") { const fw = pick(s.words); plan.fixed = words(fw); plan.fixedWords = fw; continue; }   // (es tut mir leid)
      if (s.kase === "N=") {   // (a noun said of the subject: Ich bin Lehrer -- a job bare; Das ist ein Tisch / mein Bruder)
        const n = nounPhrase(s.cat, "nom", { plain: true, not: s.not, need: s.need, words: s.words });
        if (!n) return false;
        const job = meaning.fits(n.noun, "professional") && plan.subj?.who !== "das";
        if (job && !sameSex(n, subjOf(plan))) return false;   // (Sie wurde Trainerin -- not "Die Freundinnen wurden Trainer")
        Object.assign(n, { num: plan.person === "3pl" || plan.person === "1pl" || plan.person === "2pl" ? "pl" : "sg" });
        n.g = genderOf(n.noun, n.num, rnd);
        n.det = job ? null : n.num === "pl" ? { kind: "def" } : has("possessive") && chance(.3) && plan.subj?.who === "das" ? (() => { const w = pick(["1sg", "2sg", "3sg.m", "3sg.f"]); return { kind: "poss", stem: M.possessive(w), who: w }; })() : { kind: chance(.6) ? "indef" : "def" };
        if (n.noun.plural === "-" && n.det?.kind === "indef") n.det = { kind: "def" };
        plan.predNP = n; plan.pred = expand(grammar, "NP", hooks, rnd, n, true);
        continue;
      }
      if (s.kase === "name") { const nm = pick(names); if (!nm) return false; plan.pred = [{ w: nm.w, ipa: nm.ipa }]; plan.asks = "name"; plan.predSpec = "name:" + nm.w; continue; }   // (Ich heiße Anna.)
      if (s.kase === "age") { const n = word(pickWord("age"), "NUM"), j = word("Jahr", "N"), a = word("alt", "AN"); if (!n || !j || !a) return false; plan.pred = [tok(n), M.noun(j, "nom", "pl"), tok(a)]; plan.asks = "age"; plan.predSpec = "age:" + n.cid; continue; }
      if (s.kase === "clock") { const n = word(pickWord("time.hour"), "NUM"), u = word("Uhr", "N"); if (!n || !u) return false; plan.pred = [tok(n), tok(u)]; plan.asks = "clock"; plan.predSpec = "clock:" + n.cid; continue; }
      if (need.state && plan.verb === aux.haben) {   // (weil er Hunger hat: the state's noun, bare)
        // (a living subject's: not "Obwohl der Ausschuss Zeit hat"; a LACK only negated: weil er keine Zeit hat)
        if (!subjectFits(plan, need.personState ? "person" : "animal")) return false;
        const lack = !need.forceNoun && chance(.4), n = need.forceNoun ? word(need.forceNoun, "N") : pick(lack ? lackNouns : stateNouns), num = n?.plural === "PL" ? "pl" : "sg";
        if (!n) return false;
        if (lack) plan.neg = true;
        // (negated: kein -- "obwohl er keinen Hunger hatte", not "Hunger nicht")
        const det = plan.neg ? { kind: "kein" } : null;
        if (plan.neg) { plan.neg = false; plan.kein = true; }
        plan.objs.A = { kind: "np", noun: n, num, kase: "acc", det, adj: null, cat: s.cat, g: genderOf(n, num, rnd), bare: true }; (plan.roleOf ??= {}).A = "bare";
        continue;
      }
      if (s.kase === "dass" || s.kase === "ob") {
        // REPORTED SPEECH after a verb of saying (Er sagt, er sei krank), an INDIRECT QUESTION after ob or a verb of
        // knowing (Ich weiß nicht, wo er wohnt), else a dass/ob clause
        const S = subjOf(plan), third = S && (S.kind === "np" || S.kind === "name" || (S.kind === "pron" && /^3/.test(S.who)));
        if (s.kase === "dass" && has("reported") && sayVerbs.has(plan.verb.cid) && plan.mood === "ind" && chance(.6)) {
          const sub = clausePlan("REP", { depth: plan.depth + 1, mood: "subj1", subjAs: third && !S.es && chance(.6) ? S : null });
          if (sub) { plan.clause = sub; continue; }
        }
        const indirect = has("indirect") && indirectVerbs.has(plan.verb.cid) && chance(s.kase === "ob" ? .5 : .35);
        const sub = clausePlan("SUB", { depth: plan.depth + 1, noNeg: indirect });
        if (!sub) return false;
        if (indirect) askFor(sub, true); else sub.conjWord = s.kase === "dass" ? "that" : "whether";
        plan.clause = sub;
        continue;
      }
      if (s.kase === "zu" || s.kase === "zu.subj") {   // (its subject: a person object before it -- erlaubt IHM zu gehen -- or the clause's own; zu.subj: always the clause's)
        const obj = s.kase === "zu" && [plan.objs.D, plan.objs.A].find((o) => o && (o.kind === "pron" || (o.kind === "np" && meaning.fits(o.noun, "animal"))));
        let control = obj ?? subjOf(plan) ?? (plan.imp ? { kind: "pron", who: plan.imp } : null);
        if (control?.es) control = { kind: "pron", who: "man" };   // (Es ist schwer, Deutsch zu lernen: anyone's)
        if (!control) return false;
        const sub = clausePlan("ZU", { depth: plan.depth + 1, control, verbs: everydayVerbs() });   // (an everyday action: lernt schwimmen, fängt an zu arbeiten -- not "lernt, ein Gerücht zu verbreiten")
        if (!sub) return false;
        plan.clause = sub;
        continue;
      }
      // a BARE INFINITIVE with the verb (geht schwimmen, hört ihn singen, lässt das Auto reparieren): its subject the
      // object before it or the clause's -- or, after lassen (inf.obj), the object is the infinitive's own
      if (plan.type === "IMP" && s.role === "source") return false;   // (a command goes somewhere: not "Kommen Sie aus der Gemeinde!")
      if (s.kase === "inf" || s.kase === "inf.obj") {
        if (plan.type === "REL") return false;   // (not in a relative clause: "den ein Junge hat eintreffen hören")
        const obj = plan.objs.A;
        const w = s.kase === "inf.obj" ? infVerbFor(nounOf(obj), "obj", s.words) : infVerbFor(obj ? nounOf(obj) ?? "person" : subjOf(plan) ? nounOf(subjOf(plan)) ?? "person" : "person", "subj", s.words);
        if (!w) return false;
        plan.inf = w;
        continue;
      }
      // a SECOND accusative (lehrt die Kinder Deutsch), or one saying what the first is (nennt ihn einen Lügner: A=,
      // indefinite, in the first one's number)
      if (s.kase === "A=" || (s.kase === "A" && !s.prep && plan.objs.A)) {
        const first = plan.objs.A, pl = s.kase === "A=" && (first?.num === "pl" || first?.kind === "pron" && /pl|formal/.test(first.who));
        const np = nounPhrase(s.cat, "acc", { not: s.not, need: s.need, words: s.words, owner: s.kase === "A=" ? null : ownerOf(plan) });
        if (!np || plan.objs.A2) return false;
        if (s.kase === "A=") Object.assign(np, { det: pl ? null : np.noun.plural === "-" ? null : { kind: "indef" }, num: pl ? "pl" : "sg", g: genderOf(np.noun, pl ? "pl" : "sg", rnd), rel: null, adj: null, attr: null });
        plan.objs.A2 = np; (plan.roleOf ??= {}).A2 = s.kase === "A=" ? "as" : "second";
        continue;
      }
      // a BARE accusative (Angst haben, Sport treiben, Bescheid sagen): no article, no adjective
      if (s.kase === "A0") {
        const np = nounPhrase(s.cat, "acc", { plain: true, not: s.not, need: s.need, words: s.words });
        if (!np || plan.objs.A) return false;
        plan.objs.A = Object.assign(np, { det: plan.neg ? { kind: "kein" } : null, num: np.noun.plural === "PL" ? "pl" : "sg", g: genderOf(np.noun, np.noun.plural === "PL" ? "pl" : "sg", rnd), bare: true });
        (plan.roleOf ??= {}).A = "bare";
        if (plan.neg) { plan.neg = false; plan.kein = true; }
        continue;
      }
      const kase = s.prep === "als" && plan.voice ? "nom" : KASE[s.kase], pron = objectPronoun(plan, s);   // (als agrees with what it is said of: er wird als Freund betrachtet)
      if (pron) {
        if (s.prep) plan.pobj.push({ prep: prepEntry(s.prep), kase, ...pron, role: s.role });
        else if (plan.objs[s.kase]) return false;
        else { plan.objs[s.kase] = pron; (plan.roleOf ??= {})[s.kase] = s.role; }
        if (pron.who === "nichts" || pron.who === "niemand") { plan.neg = false; plan.kein = true; }
        continue;
      }
      // a CORRELATE: the prepositional object as a da-word and a clause (Ich freue mich darauf, dass du kommst; Er
      // denkt daran, das Licht auszumachen)
      if (s.prep && has("correlate") && correlates.has(plan.verb.cid) && !plan.clause && plan.depth === 0 && room() && meaning.isA(s.cat, "abstract") && personable(plan.frame.subj) && chance(.07)) {
        const da = { w: "", ipa: "" }, control = subjOf(plan);
        const sub = da && (chance(.5) && control && !control.es ? clausePlan("ZU", { depth: plan.depth + 1, control, verbs: everydayVerbs() }) : clausePlan("SUB", { depth: plan.depth + 1, noNeg: true }));
        if (sub) { if (sub.type === "SUB") sub.conjWord = "that"; plan.pobj.push({ kind: "da", da, role: s.role }); plan.clause = sub; continue; }
      }
      const np = nounPhrase(s.cat, kase, { verb: plan.verb, one: !!s.prep && !!s.cat && meaning.isA(s.cat, "place"), neg: plan.neg && !s.prep && s.kase === "A", rel: plan.type !== "REL" && !s.prep, owner: ownerOf(plan),
        names: s.role === "goal" && !!s.cat && (meaning.isA(s.cat, "settlement") || meaning.isA(s.cat, "country")) && chance(.5), not: s.not, need: s.need, prep: s.prep,
        words: need.objWord && s.kase === "A" && !s.prep ? [word(need.objWord, "N")] : s.words, avoid: s.kase === "A" && !s.prep && need.otherThan ? need.otherThan : nounOf(need.subjAs) });   // (not the one the subject stands for: "..., beleidigt er den Mann")   // (the thing a condition needs: kauft eine Fahrkarte)
      if (!np) return false;
      if (np.neg) {   // (negated by kein: no nicht as well -- and now and then no longer: keine Zeit mehr)
        plan.neg = false; plan.kein = true;
        if ((plan.tense ?? time) !== "future" && has("negation-more") && chance(.2)) np.more = true;
      }
      // two objects joined (sowohl Kaffee als auch Tee, weder Brot noch Milch); nicht ..., sondern ... for a negated one
      if (!s.prep && s.kase === "A" && !np.neg && plan.type === "YESNO" && isThing(np.noun) && has("coord") && chance(.1)) {   // (Möchtest du Kaffee oder Tee?)
        const np2 = nounPhrase(s.cat, kase, { not: s.not, need: s.need, words: s.words, avoid: np.noun, plain: true });
        if (np2) np.pair = { kind: "or", ...PAIR_DE.or, np: np2 };
      }
      else if (!s.prep && s.kase === "A" && !np.neg && isThing(np.noun) && (plan.neg ? has("negation-more") : has("paired")) && chance(plan.neg ? .2 : .05)) {   // (of things: sowohl Kaffee als auch Tee -- not "sowohl das Problem als auch den Fehler", "sowohl ihre Männer als auch den Präsidenten")
        const np2 = nounPhrase(s.cat, kase, { not: s.not, need: s.need, words: s.words, avoid: np.noun, owner: ownerOf(plan) });
        if (np2) {
          const kind = plan.neg ? "not-but" : pickWord("pair");
          np.pair = { kind, ...PAIR_DE[kind], np: np2 };
          if (plan.neg || kind === "neither-nor") { plan.neg = false; plan.kein = true; }   // (the negation is in the pair)
        }
      }
      if (s.prep) plan.pobj.push({ prep: prepEntry(s.prep), np, role: s.role });
      else if (plan.objs[s.kase]) return false;
      else { plan.objs[s.kase] = np; (plan.roleOf ??= {})[s.kase] = s.role; }
    }
    return true;
  }
  // the verb of a bare infinitive: listed with the frame, or one whose subject is `about` (subj: geht schwimmen, hört
  // den Vogel singen -- a verb with no object) or whose object it is (obj: lässt das Auto reparieren)
  function infVerbFor(about, as, list) {
    const pool = levelFirst(list ?? verbsAll, (v) => !M.isModal(v) && meaning.frames(v).some((f) => {
      if (as === "obj") return about && f.slots.some((s) => s.kase === "A" && !s.prep && meaning.fitsSlot(about, s));
      if (list) return true;
      return f.slots.length === 0 && (typeof about === "string" ? personable(f.subj) : slotFits(about, f));
    }));
    return pickCommon(pool);
  }
  // AN OBJECT AS A PRONOUN, now and then: a person -- any but the subject itself (that is the reflexive: ich sehe
  // mich) -- mich, ihm, für dich, jemanden; a thing -- es, sie, ihn in the accusative, and after a preposition its
  // da-word (damit, darauf), or etwas, nichts, alles (etwas Neues; alles, was ...). null: a noun phrase it is
  function objectPronoun(plan, s) {
    if (s.kase === "G" || s.words) return null;
    // (an imperative's subject: who is told; not a group with its own member -- wir/mich, ihr/dich; one clause speaks
    // to its listener one way -- du/ihr or Sie, not both)
    const S = subjOf(plan), self = S?.kind === "pron" ? S.who : plan.imp;
    const informal = (p) => p === "2sg" || p === "2pl", first = (p) => p === "1sg" || p === "1pl";
    const clash = (p) => p === self || (first(p) && first(self)) || (informal(p) && informal(self)) || (self === "formal" && informal(p)) || (informal(self) && p === "formal");
    // a person: me, you, us -- or him, her, them only as someone an earlier clause named (Der Arzt kommt, und wir
    // fragen ihn); a thing only as what an earlier clause named (Er kauft einen Apfel, und sie isst ihn)
    const before = made.flatMap((p) => [p.subj, ...Object.values(p.objs), ...p.pobj.map((pp) => pp.np)]).filter((o) => o?.kind === "np");
    const pronLearnt = s.prep ? has("place-basic") : s.kase === "D" ? has("recipient") : has("pron-obj");
    if (personable(s.cat) && pronLearnt && chance(.3)) {
      if (!s.prep && chance(.12) && !negatedBy(plan) && has("indefinite")) return { kind: "pron", who: chance(.7) || plan.noNeg ? "jemand" : "niemand" };   // (no niemand where the clause takes no negation)
      const named = before.find((o) => meaning.fits(o.noun, "person") && meaning.fitsSlot(o.noun, s));
      const who = pick([...PERSONS.filter((p) => !p.startsWith("3") && !clash(p) && addressOk(p)), ...(named ? [whoOf(named)] : [])]);
      if (who) return { kind: "pron", who: addressed(who) };
    }
    // a thing, not named: etwas, nichts, alles (an accusative object of a thing, a piece of knowledge, food...)
    if (!s.prep && s.kase === "A" && !personable(s.cat) && !meaning.isA(s.cat, "place") && has("indefinite") && chance(.07)) {
      const who = !negatedBy(plan) && !plan.noNeg && chance(.3) ? "nichts" : chance(.6) ? "etwas" : "alles";
      const o = { kind: "pron", who };
      if (who === "etwas" && has("indefinite-adj") && chance(.35)) { const a = pickCommon(adjectives.filter((x) => meaning.describesCat(x, s.cat)), true); if (a) o.adj = a; }   // (etwas Neues)
      if (who === "alles" && has("relative-more") && chance(.4) && room()) o.rel = relativePlan({ indef: true, g: "n", num: "sg" });   // (alles, was er sagt)
      return o;
    }
    const ante = before.find((o) => !meaning.fits(o.noun, "person") && meaning.fitsSlot(o.noun, s) && meaning.fitsIn(o.noun, o.cat, s.cat));
    if (ante && !s.prep && s.kase === "A" && has("pron-obj") && chance(.7)) return { kind: "pron", who: whoOf(ante), thing: true, ref: ante.noun };
    if (ante && s.prep && has("pronominal-adverbs") && chance(.7)) return { kind: "da", da: { w: "", ipa: "" }, role: s.role };
    return null;
  }
  // an adjective said of the subject (Der Apfel ist rot): one that can describe it, and its words -- maybe in a degree
  // (sehr müde, zu teuer), compared (größer als sein Bruder, so groß wie ..., am größten); a je...desto clause's in
  // the comparative (desto müder), a so ... dass one with its clause (so müde, dass er schläft)
  //   (werden, bleiben, scheinen -- and a clause saying a state -- only a state: müde, krank, leer)
  function predicate(plan, need) {
    const states = need.state || need.desto || changeVerbs.has(plan.verb.cid);
    const person = subjectFits(plan, "person");   // (not of a person: "Die Tochter ist gut" -- good at what?)
    const a = pickCommon(freeOr().filter((x) => (!states || stateAdj.has(x.cid)) && subjectDescribed(plan, x) && !meaning.attributiveOnly(x) && (!need.desto || gradable(x)) && !(person && notOfPerson.has(x.cid))), true);
    if (!a) return null;
    plan.predAdj = a;
    if (need.desto) { const d = need.destoAdj ? word(need.destoAdj, "AN") ?? a : a; plan.predSpec = `adj:${d.cid}+comp.bare`; return [M.degree(d, "comp")]; }   // (the state the je-clause's action gives: desto müder)
    plan.predSpec = "adj:" + a.cid;
    if (!gradable(a)) return [tok(a)];
    const r = rnd();
    if (r < .2 && has("one-gladly-very")) { const d = degreeWord(true); plan.predSpec += "+deg:" + d.e.cid; return predWords(a, "deg", d); }
    if (r < .37 && r >= .2 && !has("comparison")) return [tok(a)];
    if (r < .32) {   // (größer als ..., so groß wie ...)
      const t = compareTarget(plan, a);
      if (t) plan.predSpec += r < .28 ? `+comp+than(${plan.compared})` : `+so+as(${plan.compared})`;
      return t ? predWords(a, r < .28 ? "comp" : "so", t) : [tok(a)];
    }
    if (r < .37) { plan.predSpec += "+sup"; return predWords(a, "sup"); }
    if (r < .45 && has("so-that-the-more") && plan.mood === "ind" && (plan.type === "MAIN" || plan.type === "INVERTED") && !plan.clause && room() && states) {   // (so müde, dass er schläft)
      const sub = clausePlan("SUB", { depth: plan.depth + 1, routine: true, noNeg: true, subjAs: subjOf(plan)?.kind === "pron" || subjOf(plan)?.kind === "np" ? subjOf(plan) : null });
      if (sub) { sub.conjWord = "that"; plan.clause = sub; plan.predSpec += "+so.that"; return [tok(anyWord("so")), tok(a)]; }
    }
    return [tok(a)];
  }
  // a predicative adjective's words in a form: deg (sehr müde), comp (größer als X), so (so groß wie X), sup (am größten)
  function predWords(a, form, extra) {
    const w = (x) => tok(anyWord(x));
    if (form === "deg") return [extra, tok(a)];
    if (form === "comp") return [M.degree(a, "comp"), w("als"), ...extra];
    if (form === "so") return [w("so"), tok(a), w("wie"), ...extra];
    if (form === "sup") return [M.contraction("an", "dem") ?? { w: "am", ipa: "am" }, M.adj(a, "weak", "dat", "m", "sup")];
    return [tok(a)];
  }
  // what a subject is compared with: another of its kind the adjective can describe (Der Apfel ist süßer als die Birne)
  function compareTarget(plan, a) {
    const S = subjOf(plan), noun = nounOf(S), cat = noun ? meaning.catsOf(noun)[0] : "relative";
    const t = noun || S?.kind === "pron" || S?.kind === "name" ? nounPhrase(cat, "nom", { plain: true, avoid: noun, owner: noun ? null : ownerOf(plan) }) : null;
    if (!t || (noun && !meaning.describes(a, t.noun))) return null;
    plan.compared = npSpec(t);   // (the plan's record: what it is compared with)
    return expand(grammar, "NP", hooks, rnd, t, true);
  }
  // a RELATIVE clause for a noun phrase: the noun's role in it -- its subject (der Hund, der schläft), its object (den
  // ich kenne), the dative (dem ich helfe), after a preposition (mit dem ich spreche), a place (wo ich wohne), an owner
  // (dessen Auto kaputt ist); after alles: was
  //   (a person: any verb as its subject; a thing: one of rel.thing -- liegen, gehören; an abstract noun: none)
  function relativePlan(head) {
    if (!head.indef && !meaning.fits(head.noun, "concrete")) return null;
    const roles = head.indef ? ["acc"] : ["nom", "nom", "acc", "acc", ...(has("recipient") ? ["dat"] : []), ...(has("relative-prep") ? ["prep"] : []),
      ...(has("relative-more") && meaning.fits(head.noun, "place") ? ["wo", "wo"] : []), ...(has("relative-more") && meaning.fits(head.noun, "person") && !meaning.fits(head.noun, "child") ? ["gen"] : [])];   // (not "das Mädchen, dessen Kind")
    for (let i = 0; i < 3; i++) {
      const role = pick(roles);
      let plan = null;
      // (not whose an owned thing is: "seine Postkarte, die dem Russen gehört")
      const owned = head.det?.kind === "poss" || head.det?.kind === "name" || !!head.attr;
      if (role === "nom") plan = clausePlan("REL", { rel: true, subjFits: head, depth: 1, verbs: meaning.fits(head.noun, "animal") ? everydayVerbs() : verbs.filter((v) => relThing.has(v.cid) && !(owned && v.word === "gehören")) });
      else if (role === "gen") {   // (dessen Auto, deren Mutter: the subject is what the head has)
        const own = nounPhrase(pick(["relative", "pet"]), "nom", { plain: true });   // (kin, a pet: deren Sohn, dessen Hund -- not "deren Rakete")
        if (!own) continue;
        own.det = { kind: "relgen", tok: M.relpron(head.g, "gen") };
        plan = clausePlan("REL", { rel: true, subjNP: own, depth: 1, verbs: everydayVerbs() });
        if (plan) { plan.relpron = null; plan.relSubj = true; plan.relSpec = "owner"; }
      } else plan = clausePlan("REL", { rel: true, relHead: head, relRole: role, depth: 1, verbs: everydayVerbs() });
      if (!plan) continue;
      if (role === "nom") { plan.relpron = [M.relpron(head.g, "nom")]; plan.relSpec = "subj"; }
      if (head.indef && plan.relpron) { plan.relpron = [M.wh("thing", "acc")]; plan.relSpec = "what"; }
      return plan;
    }
    return null;
  }
  // a clause a place may be said of (hier, dort, wo?): a living subject's, with no place of its own and no clause, of
  // a verb that has no direction instead (not "kommt in einem Saal")
  function placeable(f, v = null) {
    return meaning.isA(f.subj, "animal") && !(v && directed.has(v.cid)) && !f.slots.some((s) => (s.cat && meaning.isA(s.cat, "place")) || s.kase === "dass" || s.kase === "ob");
  }
  // A QUESTION WORD in place of a part (main or indirect: ..., wo er wohnt): who, what, whom; which / what kind of /
  // how many + a noun; with whom, about what (worüber); when, where, why, how
  function askFor(plan, indirect = false) {
    const opts = [];
    const copula = plan.frame.slots.some((s) => s.kase === "adj");   // (not "Was bleibt bekannt?")
    const np = (o) => o?.kind === "np" && !o.pair && !o.bare && !o.attr;
    // (welches Buch, was für ein Auto, wie viele Kinder -- and the number the verb then agrees with)
    const nounQ = (o, kase) => {
      const r = rnd(), plain = { ...o, kase, adj: null, rel: null, adjDeg: null, deg: null };
      if (!has("which")) return null;
      const A = kase === "acc" ? "A." : "";   // (the record: which:NP, what-kind:NP, how-many:NP -- an object's A.)
      if (r < .4) return [expand(grammar, "NP", hooks, rnd, { ...plain, det: { kind: "der-word", stem: "welch" } }, true), o.num, `which:${A}${npSpec({ ...plain, det: { kind: "def" } })}`];
      if (r < .7 && o.num === "sg" && o.noun.plural !== "-" && !mass(o.noun) && !meaning.flag(o.noun, "mass")) return [[...words("was für"), ...expand(grammar, "NP", hooks, rnd, { ...plain, det: { kind: "indef" } }, true)], "sg", `what-kind:${A}${npSpec({ ...plain, det: { kind: "indef" } })}`];
      if (o.noun.plural !== "-" && o.noun.plural !== "PL" && !meaning.flag(o.noun, "mass") && meaning.fits(o.noun, "concrete")) return [[...words("wie viele"), ...expand(grammar, "NP", hooks, rnd, { ...plain, det: null, num: "pl", g: "pl" }, true)], "pl", `how-many:${A}${npSpec({ ...plain, det: { kind: "def" }, num: "pl" })}`];
      return null;
    };
    if (np(plan.subj) && !copula) {
      const who = personable(plan.frame.subj) && (meaning.fits(plan.subj.noun, "person") || meaning.fits(plan.subj.noun, "institution"));
      opts.push(["subj", [who ? M.wh("person", "nom") : M.wh("thing", "nom")], "3sg", who ? "who" : "what"]);
      const q = nounQ(plan.subj, "nom"); if (q) opts.push(["subj", q[0], q[1] === "pl" ? "3pl" : "3sg", q[2]]);
    }
    if (np(plan.objs.A)) {
      const who = meaning.fits(plan.objs.A.noun, "person");
      opts.push(["obj.A", [who ? M.wh("person", "acc") : M.wh("thing", "acc")], undefined, who ? "whom" : "what"]);
      const q = nounQ(plan.objs.A, "acc"); if (q) opts.push(["obj.A", q[0], undefined, q[2]]);
    }
    if (np(plan.objs.D) && meaning.fits(plan.objs.D.noun, "person") && has("recipient")) opts.push(["obj.D", [M.wh("person", "dat")], undefined, `${plan.roleOf?.D ?? "recipient"}:who`]);
    for (const pp of plan.pobj) if (np(pp.np) && pp.prep) {   // (with whom; about what; where from, where to, where -- by the role)
      const place = meaning.fits(pp.np.noun, "place"), r = pp.role;
      if (place && r === "source") opts.push([pp, [M.wh("from")], undefined, "whence"]);
      else if (place && r === "goal") opts.push([pp, [M.wh("whither")], undefined, "whither"]);
      else if (place && r === "location") opts.push([pp, [M.wh("place")], undefined, "where"]);
      else if (meaning.fits(pp.np.noun, "person")) opts.push([pp, [M.wh("person", "dat")], undefined, `${r}:who`]);
      else if (!place && has("pronominal-adverbs")) opts.push([pp, [M.wh("thing", "acc")], undefined, `${r}:what`]);
    }
    if (!plan.adv.time && everyday(plan.verb)) opts.push(["adv.time", [M.wh("time")], undefined, "when"]);   // (wann of an action: not "Wann gehört ...?")
    if (placeable(plan.frame, plan.verb) && !plan.adv.place && everyday(plan.verb)) opts.push(["adv.place", [M.wh("place")], undefined, "where"]);
    opts.push(["why", [M.wh("reason")], undefined, "why"]);
    if (copula && plan.pred) opts.push(["pred", [M.wh("manner")], undefined, "how"]);
    if (plan.asks) { opts.length = 0; opts.push(["pred", plan.asks === "name" ? [M.wh("manner")] : [M.wh("manner"), tok(word(plan.asks === "age" ? "alt" : "spät", "AN") ?? anyWord("spät"))], undefined, { name: "how", age: "how-old", clock: "how-late" }[plan.asks]]); }   // (Wie heißt du? Wie alt bist du? Wie spät ist es?)
    else if (plan.adv.freq) opts.push(["adv.freq", [M.wh("manner"), tok(anyWord("oft"))], undefined, "how-often"]);   // (Wie oft ...?)
    if (plan.adv.manner) opts.push(["adv.manner", [M.wh("manner")], undefined, "how"]);
    const [role, w, person, spec] = pick(opts);
    plan.wh = w; plan.whSpec = spec; plan.whRole = role;
    if (typeof role === "object") plan.pobj = plan.pobj.filter((p) => p !== role);
    else if (role !== "why") { (plan.used ??= new Set()).add(role); if (role.startsWith("obj.")) plan.used.add(role + ".new"); }   // (not "Wie viele Mütter beobachten Sie eine Mutter")
    if (role === "why" && !indirect && chance(.25)) plan.neg = true;   // (Warum kommst du nicht?)
    if (person) plan.person = person;
    if (indirect) plan.conjWord = null;
  }

  // ---- phrases of time and place ---------------------------------------------------------------------------------------
  // TIME PHRASES, each made by its MAKER from given words (a noun, a number) -- the planner's random ones and the
  // tests' alike: am Montag, im Sommer, um acht Uhr, am dritten Mai, letzte Woche, nächstes Jahr, jeden Tag, seit zwei
  // Jahren, vor einer Woche, in drei Tagen
  const fold = (prep, g) => M.contraction(prep, M.det("def", "dat", g).w);
  const TIME = {
    am: (n) => [fold("an", genderOf(n, "sg", rnd)), M.noun(n, "dat", "sg")],
    im: (n) => [fold("in", genderOf(n, "sg", rnd)), M.noun(n, "dat", "sg")],
    um: (h) => [tok(word("um", "PRE")), tok(h), tok(word("Uhr", "N"))],
    date: (k, n) => [fold("an", "m"), M.ordinal(k, "weak", "dat", "m"), M.noun(n, "dat", "sg")],
    letzte: (n) => [M.adj(word("letzte", "AN"), "strong", "acc", genderOf(n, "sg", rnd)), M.noun(n, "acc", "sg")],
    nächste: (n) => [M.adj(word("nächste", "AN"), "strong", "acc", genderOf(n, "sg", rnd)), M.noun(n, "acc", "sg")],
    jed: (n) => [M.det("der-word", "acc", genderOf(n, "sg", rnd), "jed"), M.noun(n, "acc", "sg")],
    // (seit / vor / in + a number of units, or one: seit zwei Jahren, vor einer Woche)
    span: (prep, count, n) => [tok(word(prep, "PRE")), ...(count ? [tok(count), M.noun(n, "dat", "pl")] : [M.det("indef", "dat", genderOf(n, "sg", rnd)), M.noun(n, "dat", "sg")])],
  };
  // A TIME PHRASE whose tenses the clause has -- or null
  // (lasting: seit ... only of what one does on and on -- "arbeitet seit drei Jahren", not "umarmt seit drei Monaten")
  function timePhrase(tenseOk, lasting = true) {
    const N = (name) => pick(byWords(name, "N")), count = () => chance(.4) ? null : word(pickWord("time.count"), "NUM");
    const basic = (t) => t, more = (t) => (has("time-phrases") ? t : null);
    const opts = [
      basic([null, () => { const n = N(chance(.6) ? "time.day" : "time.daypart"); return n && [TIME.am(n), "on-day:" + n.cid]; }]),
      basic([null, () => { const n = N(chance(.5) ? "time.month" : "time.season"); return n && [TIME.im(n), "in-period:" + n.cid]; }]),
      basic([null, () => { const h = word(pickWord("time.hour"), "NUM"); return [TIME.um(h), "at-hour:" + h?.cid]; }]),
      more([null, () => { const n = N("time.month"), k = n && 1 + Math.floor(rnd() * 12); return n && [TIME.date(k, n), `date:${k}:${n.cid}`]; }]),
      more([["past", "perfect"], () => { const n = N("time.unit.next"); return n && [TIME.letzte(n), "last:" + n.cid]; }]),
      more([["present", "future"], () => { const n = N("time.unit.next"); return n && [TIME.nächste(n), "next:" + n.cid]; }]),
      more([["present", "past"], () => { const n = N(chance(.5) ? "time.unit" : "time.day"); return n && [TIME.jed(n), "every:" + n.cid]; }]),
      lasting && more([["present", "perfect"], () => { const n = N("time.unit"), c = n && count(); return n && [TIME.span("seit", c, n), `since:${c ? c.cid : "ein"}:${n.cid}`]; }]),
      more([["past", "perfect"], () => { const n = N("time.unit"), c = n && count(); return n && [TIME.span("vor", c, n), `ago:${c ? c.cid : "ein"}:${n.cid}`]; }]),
      more([["present", "future"], () => { const n = N("time.unit"), c = n && count(); return n && [TIME.span("in", c, n), `in-time:${c ? c.cid : "ein"}:${n.cid}`]; }]),
    ].filter((o) => o && tenseOk(o[0]));
    const [, make] = pick(opts) ?? [];
    const [toks, spec] = make?.() || [];
    return toks && !toks.some((t) => !t) ? { phrase: toks, spec } : null;
  }
  // A PLACE PHRASE a clause happens in: zu Hause, draußen, or in/auf/an + a place (im Garten, auf dem Markt, am Strand)
  function placePhrase() {
    if (chance(.3)) { const w = pickWord("place.fixed"); return { phrase: w === "home" ? [spelled("zu Hause [tsuː ˈhaʊzə]")] : [tok(anyWord(w))], spec: w }; }
    const cat = pick(grammar.words["place.where"] ?? []);
    const np = cat && nounPhrase(cat, "dat", { plain: true });
    if (!np) return null;
    if (np.num === "pl" && np.noun.plural !== "PL") Object.assign(np, { num: "sg", g: genderOf(np.noun, "sg", rnd), det: null });   // (one place: im Bad, not "in den Bädern")
    const prep = meaning.flag(np.noun, "auf") ? "auf" : meaning.flag(np.noun, "an") ? "an" : "in";
    return { phrase: expand(grammar, "PP", hooks, rnd, { ...np, det: np.det ?? { kind: "def" }, prep: word(prep, "PRE") }, true), spec: `${{ auf: "on", an: "at", in: "in" }[prep]}:${npSpec({ ...np, det: np.det ?? { kind: "def" } })}` };
  }

  // ---- the grammar's hooks ------------------------------------------------------------------------------------------
  const hooks = {
    // a clause at the sentence's level: the second of two goes on with the first one's subject (Der Hund bellt, weil
    // er Hunger hat); after und/aber, a connective may join it (und deshalb ...)
    clause(type, parent) {
      // (a second clause at the top: room for it, and it goes on with the first one's subject -- never a clause about
      //  something else: the critic found those all unrelated; after aber the one negated that the first is not)
      const need = { imperative: type === "IMP", noNeg: type === "WH", oneOfMany: (parent?.shape?.filter((s) => shapes.clauses.has(s)).length ?? 1) > 1 };
      if (type === "IMP") need.verbs = imperativeVerbs;   // (a command of an everyday action)
      if (mood === "subj2" && ["MAIN", "INVERTED", "SUB", "DROP"].includes(type)) need.mood = "subj2";
      if (lastTop) {
        if (!room() || !lastTop.subj || lastTop.subj.kind === "rel" || lastTop.subj.es || lastTop.subj.who === "niemand") return null;
        need.subjAs = lastTop.subj; need.notVerb = lastTop.verb;
        if (parent?.coord === "but") need.negate = !negatedBy(lastTop);
      }
      if (type === "MAIN" && (parent?.coord === "and" || parent?.coord === "but")) need.conn = parent.coord;
      // THE LINK of two clauses (the critic found unrelated ones all odd):
      //   aber, denn      the second says a state (Er arbeitet, aber er ist müde; ..., denn er ist krank)
      //   weil, da        a state, explaining a negated or a routine main clause (Er kommt nicht, weil er krank ist)
      //   obwohl          a state, against any main clause (Er arbeitet, obwohl er müde ist)
      //   wenn (Konj. II) a state, the condition (Wenn ich Zeit hätte, würde ich kommen)
      //   wenn, bevor ... a routine (Bevor ich gehe, ...; Er ruft an, sobald er ankommt); während, bis too
      //   nachdem         a routine before (pluperfect: Nachdem er gegessen hatte, ging er); seit: now (Seit er hier wohnt)
      //   damit           a routine as the purpose, maybe with können (..., damit er schlafen kann)
      let conj = null;
      if (type === "MAIN" && (parent?.coord === "but" || parent?.coord === "for")) need.state = true;
      if (type === "MAIN" && parent?.zwar && !lastTop) need.state = true;   // (Er ist zwar müde, aber er arbeitet)
      if (type === "DROP") { need.subjAs = lastTop?.subj; if (parent?.dropAber) need.state = true; }
      if (type === "CONDV") { mood = "subj2"; need.mood = "subj2"; need.state = true; }   // (Hätte ich Zeit, ...)
      if (type === "WERREL") need.wer = true;
      if (type === "MAIN" && lastTop?.type === "WERREL") { need.subjAs = { kind: "pron", who: "der" }; need.front = "subj"; }   // (..., der isst -- der first: not "..., diesen Schritt wagt der")
      // (in a scene, the link by the conditions first: weil what the action needs ...)
      const cl = scene && type !== "IMP" ? conditionLink(type, lastTop, parent) : null;
      if (cl) {
        Object.assign(need, cl.need);
        if (cl.conj) conj = cl.conj;
        if (cl.conn) need.forceConn = cl.conn;
        if (cl.need.subjAs || cl.need.subjNP || cl.need.otherThan) need.notVerb = null;   // (the object's state: Er repariert das Auto, weil es kaputt ist)
        if (cl.need.subjNP) delete need.subjAs;
        if (cl.need.noNeg) delete need.negate;   // (aber by the conditions: Er lacht, aber er ist traurig)
        if (cl.need.verbs && !cl.need.state) delete need.state;
      }
      // (a first clause before another: in a scene, one with conditions, that the next one can follow from)
      if (scene && !lastTop && parent?.shape?.filter((s) => shapes.clauses.has(s)).length > 1 && !need.verbs) {
        const withCond = condVerbs();
        if (withCond.length) need.verbs = withCond;
        if (!need.tense && mood === "ind") need.tense = pick(time === "past" ? ["past", "past", "perfect"] : ["present", "present", "present", "perfect", "future"]);   // (no Futur II before a reason)
      }
      // (in a scene, a purpose only by the conditions; another link only now and then -- the critic found the
      //  usual links between a scene's actions mostly unrelated)
      if (scene && !cl) {
        if (type === "ZUADV" || type === "SUB" || type === "CONDV" || type === "WERREL" || type === "JE" || type === "DESTO" || ((lastTop?.atomName || lastTop?.linked) && type === "INVERTED")) return null;
        if (type === "MAIN" && (lastTop?.type === "WERREL" || parent?.shape?.includes("w.entweder"))) return null;
        if (type === "DROP") return null;   // (..., und würde nichts finden: of nothing before)
        if (type === "MAIN" && (parent?.coord === "but" || parent?.coord === "for" || parent?.zwar)) return null;
        if (type === "DROP" && parent?.dropAber) return null;
        if (type === "MAIN" && parent?.coord === "and") return null;   // (two actions side by side read unrelated)
      }
      if (type === "SUB" && conj) { /* (by the conditions) */ }
      else if (type === "SUB") {
        // (each link once its feature is learnt -- weil, dass, wenn first; obwohl, damit, bevor ... with B1; indem,
        //  sodass, als ob with B2)
        const explains = lastTop && (negatedBy(lastTop) || routineVerbs.includes(lastTop.verb));
        const links = [];
        // (a verb in focus, its link or mood wished for: in that clause too, not only a state -- si entrenara, bien qu'ils
        //  affinent)
        const focusIn = (link, n) => (focus?.pos === "V" && (steer.links?.includes(link) || (link === "when" && steer.mood === "hypo")) ? {} : n);
        if (need.mood === "subj2") links.push(["when", 1, focusIn("when", { state: true })]);
        else {
          if (has("that-because-if")) links.push(["because", explains ? 2 : .6, { state: true }], ["when", 1, { routine: true, noNeg: true, tense: time === "past" ? "past" : "present" }]);
          if (has("although-so-that")) links.push(["although", 1.5, focusIn("although", { state: true })], ...(lastTop ? [["so-that", .5, { routine: true, noNeg: true, modal: chance(.5) ? word("môcť", "V") : undefined }]] : []));
          if (has("when-past") && time === "past") links.push(["when-past", 1, { routine: true, noNeg: true }]);
          if (has("pluperfect")) links.push(["after", .7, { routine: true, noNeg: true, tense: time === "past" ? "pluperfect" : "perfect" }]);
          if (has("temporal")) links.push([pickWord("conj"), 1.5, { routine: true, noNeg: true, tense: time === "past" ? "past" : "present" }], ...(time === "now" ? [[pickWord("conj.since"), .4, { routine: true, noNeg: true, tense: "present" }]] : []));
          if (has("clauses-b2") && lastTop) links.push([pickWord("conj.b2"), .8, { routine: true, noNeg: true }], [pickWord("conj.as-if"), .5, { state: true, mood: "subj2" }]);
        }
        if (!links.length) return null;
        const lw = (l) => l[1] * (steer.links?.includes(l[0]) ? 10 : 1);   // (a link wished for: ten times likelier)
        let r = rnd() * links.reduce((t, l) => t + lw(l), 0), link = links[links.length - 1];
        for (const l of links) if ((r -= lw(l)) < 0) { link = l; break; }
        conj = link[0];
        for (const [k, v] of Object.entries(link[2])) if (v !== undefined) need[k] = v;
      }
      if (type === "YESNO" && has("polite") && chance(RATE.polite)) { need.mood = "subj2"; need.polite = true; if (chance(.5)) need.modal = word("können", "V"); }
      // (Ich möchte ... with the modals; Ich würde gern ... with the polite forms)
      if (type === "MAIN" && !lastTop && !parent?.zwar && parent?.shape?.filter((s) => shapes.clauses.has(s)).length === 1 && mood === "ind" && has("modal") && chance(RATE.wish)) { need.mood = "subj2"; need.polite = false; need.living = true; if (!has("polite") || chance(.5)) need.modal = word("mögen", "V"); else need.gern = true; }
      if (need.mood === "subj2" && type === "MAIN" && !lastTop && !need.modal && (!need.oneOfMany || chance(.5))) need.gern = true;   // (Ich würde gern ...; alone, always a wish)
      if (need.gern && !need.verbs) need.verbs = byWords("manner.rád", "V").filter((v) => verbs.includes(v));   // (... what one does gladly)
      if (need.gern) need.noModal = true;   // (a wish is gern or a modal: not "müssten Sie gern schreiben")
      // (two clauses joined by und, aber, oder, or a dropped subject: one tense -- not "wird gegessen haben, und sie rutscht")
      // (and in Konjunktiv II, every clause: "Hätte er Lust gehabt, hätte er gelernt", not "Hätte er Lust, hätte er gelernt")
      if (lastTop && (type === "DROP" || (type === "MAIN" && (parent?.coord || parent?.shape?.includes("w.entweder"))) || mood === "subj2") && !need.tense && lastTop.mood === (need.mood ?? "ind")) need.tense = lastTop.tense;
      if (type === "JE") { need.routine = true; need.noNeg = true; need.tense = "present"; need.living = true; }   // (Je länger er arbeitet, ...)
      if (type === "DESTO") { need.verbs = [aux.werden]; need.desto = true; need.tense = "present"; need.noNeg = true; need.noModal = true; }
      if (type === "ZUADV") {   // (um ... zu, ohne ... zu: an infinitive whose subject is the main clause's)
        const c = lastTop && subjOf(lastTop);   // (a person's: not "Das Silber glänzt, um ...")
        if (!c || c.es || !room() || !subjectFits(lastTop, "person") || stative.has(lastTop.verb.cid) || lastTop.pred || lastTop.voice) return null;
        const plan = clausePlan("ZU", { depth: 1, control: c, noNeg: true, ...(cl?.need.verbs ? { verbs: cl.need.verbs } : {}) });   // (not "ohne nicht zu ...")
        if (plan) { plan.conjWord = has("without-instead") && !cl ? pickWord("conj.zu") : "purpose"; plan.isTop = true; }   // (a purpose by the conditions)
        return plan;
      }
      const plan = clausePlan(type, need);
      if (!plan) return null;
      if (conj) plan.conjWord = conj;   // (the link's code: because, as-if -- world/CLAUSES.md)
      // (the state a clause says -- by a condition, or a link's state that is one: the next clause can follow from it)
      plan.linked = !!cl;
      if (need.destoAdj) plan.destoAdj = need.destoAdj;   // (a clause linked by the conditions: the clause after it must follow from it too)
      plan.atomName = need.atomName ?? (scene && (conj || need.state) && !negatedBy(plan) ? scenes.stateOf(plan.predAdj?.cid ?? (plan.objs.A?.bare && plan.objs.A.noun.cid)) : null);
      if (need.forceConn) plan.adv.conn = word(need.forceConn, "AV");
      if (type === "WERREL") plan.relpron = [M.wh("person", "nom")];
      if (type === "MAIN" && parent?.zwar && lastTop === null) plan.adv.conn = word("síce", "AV");
      if (type === "WH") askFor(plan);
      if (type === "DROP") plan.dropSubj = true;
      if (type === "JE") { const a = word(pick(["dlhý", "veľa"]), "AN"); plan.jecomp = a && [M.degree(a, "comp")]; plan.jecompE = a; }
      lastTop = plan; tops++; plan.isTop = true;
      return plan;
    },
    role(plan, name) {
      if (name === "here") return null;   // (a clause of the shapes: planned, said by the realizer)
      if (name.startsWith("w.")) { const e = anyWord(name.slice(2)); return e ? [tok(e)] : null; }
      if (plan.top) {
        if (name === "coord") {   // (denn: when the second clause can explain the first -- as weil)
          const explains = lastTop && (negatedBy(lastTop) || routineVerbs.includes(lastTop.verb));
          const c = explains && has("for") && chance(.2) ? pickWord("coord.because") : pickWord("coord");
          plan.coord = c; return [{ w: c, ipa: "" }];
        }
        if (name === "zwarmark") { plan.zwar = true; return null; }
        if (name === "dropcoord") { const w = pickWord("coord.drop"); plan.dropAber = w === "but"; return [{ w, ipa: "" }]; }
        return null;
      }
      if (plan.kind === "np") return npRole(plan, name);
      const verbLast = plan.type === "SUB" || plan.type === "REL" || plan.type === "JE" || plan.type === "WERREL";
      const ppWords = (pp) => (pp.kind === "da" ? [pp.da] : pp.kind === "pron" ? [tok(pp.prep), M.pron(pp.who, pp.kase)] : ppPhrase(pp.np, pp.prep, pp.post));
      switch (name) {
        case "subj": return plan.dropSubj || plan.relSubj || plan.subj?.hidden ? null : arg(plan.subj, "nom");
        // the objects: as noun phrases in their place, as pronouns at the middle field's start (pron.A, pron.D)
        // (an indefinite pronoun -- alles, etwas, jemandem -- stands where a noun object would: hat dir alles gesagt)
        // (a known object here, a new one -- ein, kein, no article -- after the time and the place: obj.A.new)
        case "obj.A": case "obj.D": case "obj.G": case "obj.A.new": case "obj.D.new": {
          const k = name.slice(4, 5), o = plan.objs[k];
          if (!o || (o.kind === "pron" && !INDEF.has(o.who)) || o.kind === "rel" || bareObj(plan, o)) return null;
          return isNew(o) === name.endsWith(".new") ? arg(o, KASE[k]) : null;
        }
        case "obj.bare": return bareObj(plan, plan.objs.A) ? arg(plan.objs.A, "acc") : null;   // (after the adverbs: wir haben manchmal Durst; spielt nicht Schach)
        case "front.A": {   // (the object in front: a noun phrase -- not a bare state noun: "denn er hat keinen Hunger")
          const o = plan.objs.A;
          if (o?.kind !== "np" || o.bare || o.pair) return null;
          (plan.used ??= new Set()).add("obj.A"); plan.used.add("obj.A.new");
          return arg(o, "acc");
        }
        case "obj.A2": return plan.objs.A2 ? arg(plan.objs.A2, "acc") : null;
        case "vzu": return plan.type === "ZU" ? M.zuInfinitive(plan.verb) : null;
        // (a pronoun object before a noun subject: Passiert uns ein Unfall? Gestern hat ihn der Arzt gesehen -- pron.A.pre)
        case "pron.A": case "pron.D": case "pron.A.pre": case "pron.D.pre": {
          const k = name.slice(5, 6), o = plan.objs[k], nounSubj = plan.subj?.kind === "np" || plan.subj?.kind === "name";
          return o?.kind === "pron" && !INDEF.has(o.who) && nounSubj === name.endsWith(".pre") ? arg(o, KASE[k]) : null;
        }
        case "pobj": { const pps = plan.pobj.filter((pp) => pp !== plan.frontPP); return pps.length ? pps.flatMap(ppWords) : null; }
        case "front.pp": {   // (the first prepositional phrase in front: Mit einem Löffel probierte er die Suppe.)
          const pp = plan.pobj[0];
          if (!pp || pp.kind === "da") return null;
          plan.frontPP = pp;
          return ppWords(pp);
        }
        // (a reflexive verb with an accusative object: the reflexive in the dative -- leiste dir das; before a noun
        //  subject in the middle field: Nun freute sich Max -- refl.pre)
        case "refl": case "refl.pre": {
          const k = plan.refl ?? (M.isReflexive(plan.verb) ? (plan.objs.A ? "dat" : "acc") : null);
          const nounSubj = plan.subj?.kind === "np" || plan.subj?.kind === "name";
          return k && nounSubj === (name === "refl.pre") ? [M.reflexive(verbPerson(plan.person), k)] : null;
        }
        case "pred": return plan.pred ?? null;
        case "fixed": return plan.fixed ?? null;
        case "part": return plan.part ?? null;
        case "jecomp": return plan.jecomp ?? null;
        case "neg": return plan.neg ? plan.negWords ?? [tok(word("nicht", "AV"))] : null;
        // (the manner before a NEW object -- trank langsam einen Schluck --, else after the objects: legte es vorsichtig hin)
        case "adv.manner.pre": {
          const a = plan.adv.manner, nw = ["A", "D"].some((k) => plan.objs[k]?.kind === "np" && isNew(plan.objs[k]) && !bareObj(plan, plan.objs[k]));
          if (!a || !nw || plan.mannerSaid) return null;
          plan.mannerSaid = true;
          return a.phrase ?? [tok(a)];
        }
        case "adv.time": case "adv.freq": case "adv.manner": case "adv.place": case "adv.sentence": case "adv.conn": case "adv.gen": case "adv.role": {
          if (name === "adv.manner" && plan.mannerSaid) return null;
          const a = plan.adv[name.slice(4)];
          if (a && name === "adv.manner") plan.mannerSaid = true;   // (in front: Vorsichtig schob sie ... -- once)
          return a ? a.phrase ?? [tok(a)] : null;
        }
        case "vfin": { const v = verbParts(plan, verbLast); return v.finFirst ? [v.fin, ...v.rest] : [v.fin]; }
        case "vrest": { const v = verbParts(plan, verbLast); return v.finFirst || !v.rest.length ? null : v.rest; }
        case "clause": return plan.clause ? { rule: plan.clause.type === "ZU" ? "ZU" : plan.clause.type === "REP" ? "REP" : "SUB", plan: plan.clause, before: [{ w: ",", ipa: "" }] } : null;
        case "conj": return plan.conjToks ?? (plan.conj ? [tok(plan.conj)] : plan.wh ?? null);
        case "wh": return plan.wh ?? null;
        case "relpron": return plan.relSubj ? arg(plan.subj, "nom") : plan.relpron ?? null;
        default: return null;
      }
    },
  };
  // an object that is new information: indefinite, kein, a number, a quantity, no article at all (not a pronoun)
  // (etwas, nichts, jemanden: new too -- "hat jetzt nichts gesehen", not "nichts jetzt")
  const isNew = (o) => (o.kind === "np" && (!o.det || ["indef", "kein", "num", "q", "q.mass"].includes(o.det.kind))) || (o.kind === "pron" && ["etwas", "nichts", "jemand", "niemand"].includes(o.who));
  // a subject's or an object's words: a pronoun (with its etwas Neues, its alles, was ...), a name, a noun phrase (and
  // the one joined to it: sowohl ... als auch ...; keine Zeit mehr)
  const arg = (a, kase) => {
    if (!a || a.kind === "rel" || a.kind === "ctrl") return null;
    if (a.kind === "pron") {
      const out = [M.pron(a.who, kase)];
      if (a.adj) out.push(cap(M.adj(a.adj, "strong", kase, "n")));
      if (a.rel) out.push(...(expand(grammar, "REL", hooks, rnd, a.rel, true) ?? []));
      return out;
    }
    if (a.kind === "name") return [kase === "gen" ? nameGen(a) : { w: a.w, ipa: a.ipa }];
    const np = (o) => expand(grammar, "NP", hooks, rnd, { ...o, kase }, true) ?? [];
    if (a.pair) return [...words(a.pair.first), ...np(a), ...pairTail(a, kase)];
    return a.more ? [...np(a), ...words("mehr")] : { rule: "NP", plan: { ...a, kase } };
  };
  function npRole(np, name) {
    if (name === "prep") {   // in dem -> im: the article goes into the preposition
      const d = np.det?.kind === "def" && M.det("def", np.kase, np.g), fold = d && M.contraction(np.prep.word, d.w);
      if (!fold) return [tok(np.prep)];
      (np.used ??= new Set()).add("det"); np.decl = "weak";
      return [fold];
    }
    if (name === "det") {
      if (!np.det) return null;
      if (np.det.kind === "num" || np.det.kind === "name" || np.det.kind === "relgen") { np.decl = "strong"; return [np.det.tok]; }
      if (np.det.kind === "q") { np.decl = "strong"; return [M.adj(word(np.det.stem, "AN"), "strong", np.kase, "pl")]; }   // (viele, einige: the adjective after them strong)
      if (np.det.kind === "q.mass") { np.decl = "strong"; return [tok(word(np.det.stem, "AN"))]; }   // (viel Wasser)
      const d = M.det(np.det.kind, np.kase, np.g, np.det.stem);
      np.decl = d?.decl ?? "strong";
      return d ? [d] : null;
    }
    if (name === "adj") {
      const decl = np.decl ?? (np.det ? "weak" : "strong");
      if (np.part) return [...np.part.ext, ...M.participleAdj(np.part.verb, np.part.kind, decl, np.kase, np.g)];
      // (dieser eine: ein declined as the adjective; more adjectives, comma-joined: einen samtigen, dunklen Spiegel)
      const one = np.one ? [{ w: "ein" + (decl === "weak" ? (np.kase === "nom" || (np.kase === "acc" && np.g !== "m")) && np.g !== "pl" ? "e" : "en" : M.adj(word("klein", "AN"), decl, np.kase, np.g).w.slice(5)), ipa: "" }] : [];
      if (!np.adj) return one.length ? one : null;
      return [...one, ...(np.deg ? [np.deg] : []), M.adj(np.adj, decl, np.kase, np.g, np.adjDeg), ...(np.adjs ?? []).flatMap((a) => [COMMA, M.adj(a, decl, np.kase, np.g)])];
    }
    if (name === "noun") return [M.noun(np.noun, np.kase, np.form ?? np.num, np.decl ?? (np.det ? "weak" : "strong"), np.g), ...(np.of ? expand(grammar, "NP", hooks, rnd, { ...np.of, kase: np.kase, det: null }, true) ?? [] : [])];
    if (name === "attr") {   // (das Auto meines Vaters; ein Freund von mir, von meinem Bruder)
      const a = np.attr;
      if (!a) return null;
      if (a.kind === "gen") return { rule: "NP", plan: { ...a.of, kase: "gen" } };
      const von = word("von", "PRE");
      return a.of.kind === "pron" ? [tok(von), M.pron(a.of.who, "dat")] : expand(grammar, "PP", hooks, rnd, { ...a.of, kase: "dat", prep: von }, true);
    }
    if (name === "rel") return np.rel ? { rule: "REL", plan: np.rel } : null;
    return null;
  }

  // ---- the verb's parts ---------------------------------------------------------------------------------------------
  // THE VERB CLUSTER of a clause: the finite verb and the rest, from one CHAIN -- the main verb at the bottom (with a
  // bare infinitive below it: lässt ... reparieren), above it the passive's werden (or the state's sein), a modal, the
  // perfect's haben/sein, the future's werden, the Konjunktiv II's würde. Each head asks for a form of the one below:
  // the infinitive (modal, werden, würde, lassen), the participle (haben, sein, the passive's werden) -- the passive's
  // werden below a perfect is `worden`; a modal or lassen/sehen/hören with an infinitive below it stays an infinitive
  // in the perfect (hat ... reparieren lassen), its finite verb then first in a clause with the verb last (..., dass
  // er das Auto hat reparieren lassen). The top is finite: present, past, Konjunktiv I or II; a separable prefix at the
  // end of a main clause, joined in a clause with the verb last.
  function verbParts(plan, verbLast) {
    if (plan._verb) return plan._verb;
    const person = verbPerson(plan.person);
    if (plan.type === "IMP") {
      const fin = M.imperative(plan.verb, plan.imp);
      return (plan._verb = { fin, rest: [...(plan.inf ? [M.infinitive(plan.inf)] : []), ...(fin.prefix ? [fin.prefix] : [])], finFirst: false });
    }
    const chain = [];
    if (plan.inf) chain.push({ v: plan.inf });
    chain.push({ v: plan.verb, sel: plan.inf ? "inf" : null });
    if (plan.voice === "passive") chain.push({ v: aux.werden, sel: "part", passive: true });
    if (plan.voice === "state") chain.push({ v: aux.sein, sel: "part" });
    if (plan.voice === "seinzu") chain.push({ v: aux.sein, sel: "zu" });
    if (plan.voice === "sichlassen") chain.push({ v: word("lassen", "V"), sel: "inf" });
    if (plan.zuVerb) chain.push({ v: plan.zuVerb, sel: "zu" });
    if (plan.modal) chain.push({ v: plan.modal, sel: "inf" });
    const perfect = plan.tense === "perfect" || plan.tense === "pluperfect" || plan.tense === "future2";
    if (perfect) chain.push({ v: perfectAux(plan, chain[chain.length - 1]), sel: "part" });
    if (plan.tense === "future" || plan.tense === "future2") chain.push({ v: aux.werden, sel: "inf" });
    let finTense = plan.tense === "past" || plan.tense === "pluperfect" ? "past" : "present";
    if (plan.mood === "subj1") {   // (a Konjunktiv I like the indicative -- sie haben -- gives way to the Konjunktiv II)
      const top = chain[chain.length - 1].v, s1 = M.finite(top, "subj1", person);
      finTense = s1.w !== M.finite(top, "present", person).w ? "subj1" : "subj2";
    }
    if (plan.mood === "subj2") finTense = "subj2";
    // (würde + infinitive -- also for werden itself as the main verb: würde gesünder werden)
    const topV = chain[chain.length - 1].v;
    if (finTense === "subj2" && (!M.finite(topV, "subj2", person) || (topV === aux.werden && chain.length === 1))) chain.push({ v: aux.werden, sel: "inf" });
    const rest = [];
    let finFirst = false;
    for (let i = 0; i < chain.length - 1; i++) {
      const below = chain[i], head = chain[i + 1];
      if (head.sel === "inf") rest.push(M.infinitive(below.v));
      else if (head.sel === "zu") rest.push(...M.zuInfinitive(below.v));   // (ist zu lösen, hat zu arbeiten)
      else if (below.passive) rest.push(M.passiveParticiple());
      else if (below.sel === "inf" && (M.isModal(below.v) || ersatz.has(below.v.word))) { rest.push(M.infinitive(below.v)); finFirst = verbLast; }   // (hat ... lesen müssen)
      else rest.push(M.participle(below.v));
    }
    let fin = M.finite(chain[chain.length - 1].v, finTense, person);
    if (fin.prefix) { if (verbLast) fin = M.joined(fin); else rest.push(fin.prefix); }
    return (plan._verb = { fin, rest, finFirst });
  }
  // the perfect's auxiliary: sein after the passive's werden, for a verb of motion or change (ist gekommen); haben else
  function perfectAux(plan, below) {
    if (below.passive) return aux.sein;
    if (M.isModal(below.v) || (below.sel === "inf" && ersatz.has(below.v.word)) || M.isReflexive(below.v) || plan.refl) return aux.haben;
    const a = below.v.aux ?? "hat";
    return a === "ist" || (a === "hat/ist" && !plan.objs.A) ? aux.sein : aux.haben;
  }

  // ---- a sentence -----------------------------------------------------------------------------------------------------
  // THE SENTENCE'S TIME: past or not, one for all its clauses (not "Als er kam, wird sie gehen"); its MOOD: now and
  // then the Konjunktiv II (Wenn ich Zeit hätte, würde ich kommen; Ich würde gern schwimmen)
  // (a subordinate clause in a past sentence: the simple past, nachdem's the pluperfect; a reported clause, a
  //  Konjunktiv II one: present or perfect)
  const TENSES = { past: ["past", "past", "perfect"], now: ["present", "present", "present", "present", "present", "present", "perfect", "perfect", "future", "future", "future2"], pastSub: ["past"],
    subj1: ["present", "present", "perfect"], subj2: ["present", "present", "present", "perfect"] };
  const SINGLE_AGAIN = { 2: .35, 3: .7 };
  let tops = 0, made = [], lastTop = null, time = "now", open = 0, address = null, mood = "ind", scene = null;   // (the clause plans of the sentence being made: its trace; the last clause at its top level)
  // (a focus's situations: those whose words hold it -- none: any words)
  const focusScenes = new Map();
  const sceneOf = (f) => {
    const e = byConcept.get(`${f.pos}|${f.concept}`);
    if (!e) return scenes.pick(rnd);
    if (!focusScenes.has(e)) focusScenes.set(e, scenes.usable.filter((s) => scenes.has(s, e)));
    const l = focusScenes.get(e);
    return l.length ? l[Math.floor(rnd() * l.length)] : null;
  };
  function sentence({ focus: want = null, steer: wish = {} } = {}) {
    focus = want; steer = wish ?? {};
    try { return sentenceTry(); } finally { focus = null; steer = {}; }
  }
  // (a tense from a list: the wished one when the list has it -- now and then not)
  const pickTense = (list) => (steer.tense && list.includes(steer.tense) && chance(.85) ? steer.tense : pick(list));
  function sentenceTry() {
    for (let tries = 0; tries < 40; tries++) {
      made = []; lastTop = null; tops = 0; address = null;
      time = steer.tense ? (/^(past|pluperfect)$/.test(steer.tense) ? "past" : "now") : chance(.35) ? "past" : "now";
      mood = has("conditional") && (steer.mood === "hypo" || chance(RATE.subj2)) ? "subj2" : "ind";
      scene = scenes && tries < 30 ? (focus ? sceneOf(focus) : scenes.pick(rnd)) : null;   // (one situation; after many tries, any)
      const top = { top: true };
      const tokens = expand(shapes, "S", hooks, rnd, top, true);
      // (a scene's links are strict: more two-clause shapes fail than without it -- a one-clause sentence is drawn
      //  again now and then, so the sentences stay as complex as the complexity asks)
      if (tokens?.length && scene && tops === 1 && tries < 20 && chance(SINGLE_AGAIN[grammar.complexity] ?? 0)) continue;
      // (a Konjunktiv II statement says a wish or what would be under a condition: not "Die Filiale hätte existiert")
      if (!consistent(made)) continue;   // (valence: the parts agree)
      const wish = (p) => p.adv.manner?.word === "gern" || p.modal?.word === "mögen";
      if (made.some((p) => p.mood === "subj2" && ["MAIN", "INVERTED", "DROP"].includes(p.type) && !wish(p)) && !made.some((p) => p.mood === "subj2" && (p.type === "CONDV" || p.conjWord === "when"))) continue;
      if (!tokens?.length) continue;
      const b = planOf(top, made), said = say ? say(b) : null;
      if (said) return { ...said, trace: (scene ? `[${scene}] ` : "") + made.map(describe).join(" || "), scene, plan: () => b };
    }
    return null;
  }
  // a plan in words: verb [frame] and each part with its categories -- `Offizier(professional)`
  const cats = (e) => `${e.word}(${meaning.catsOf(e).join(",") || meaning.adverbKind(e) || "?"})`;
  const part = (o) => !o ? "-" : o.kind === "ctrl" ? "ctrl->" + part(o.of) : o.kind === "np" ? cats(o.noun) + (o.adj ? " adj " + cats(o.adj) : "") + (o.part ? ` part${o.part.kind} ${o.part.verb.word}` : "") + (o.pair ? " + " + part(o.pair.np) : "")
    : o.kind === "pron" ? "pron " + o.who : o.kind === "name" ? "name " + o.w : o.kind === "da" ? o.da.w : o.kind === "rel" ? "rel->" + (o.head.noun?.word ?? "alles") : "?";
  function describe(p) {
    const list = (ws) => ws && "{" + ws.slice(0, 3).map((w) => w.word ?? w).join("|") + (ws.length > 3 ? "|…" : "") + "}";   // (a word list, shortened)
    const frame = `${list(p.frame.subjWords) ?? p.frame.subj} > ${p.frame.slots.map((s) => [s.prep, s.kase, list(s.words) ?? s.cat].filter(Boolean).join(" ")).join(", ")}`;
    const how = [p.modal?.word, p.tense, p.mood !== "ind" && p.mood, p.voice, p.inf && "inf " + p.inf.word, p.relRole && "rel " + p.relRole, negatedBy(p) && "neg"].filter(Boolean).join(" ");
    const out = [`${p.type} ${p.verb.word} [${frame}] ${how}`, "subj " + part(p.subj)];
    for (const [k, o] of Object.entries(p.objs)) out.push(k + " " + part(o));
    for (const pp of p.pobj) out.push((pp.prep?.word ?? "da-word") + " " + part(pp.np ?? pp));
    if (p.predAdj) out.push("pred " + cats(p.predAdj));
    for (const [k, a] of Object.entries(p.adv)) out.push("adv " + (a.phrase ? a.phrase.map((t) => t.w).join(" ") : cats(a)));
    if (p.conj) out.push("conj " + p.conj.word);
    else if (p.conjWord) out.push("conj " + p.conjWord);
    if (p.atomName) out.push("state " + p.atomName);
    return out.join(" | ");
  }

  // ---- THE PLAN, language-free (world/CLAUSES.md): the planner's clauses written out -- concepts, roles, relations,
  //      links -- as any language's realizer reads them (de/realize.js). (Phase 1d: from the German planner's records.)
  const PRON_N = { man: "one", jemand: "someone", niemand: "noone", etwas: "something", nichts: "nothing", alles: "everything", das: "this", der: "that-one", wer: "who" };
  const DER_N = { dies: "this", jed: "every", all: "all", manch: "some", beid: "both", welch: "which" };
  const LINK_N = { weil: "because", da: "because", denn: "for", obwohl: "although", wenn: "when", als: "when-past", bevor: "before", nachdem: "after", sobald: "as-soon-as", falls: "in-case", während: "while", bis: "until", solange: "as-long-as", seit: "since", seitdem: "since", damit: "so-that", indem: "by-doing", sodass: "with-result", "ohne dass": "without-that", "anstatt dass": "instead-that", "als ob": "as-if", "als wenn": "as-if", dass: "that", ob: "whether", um: "purpose", ohne: "without", statt: "instead" };

  const FRONT_N = { subj: "subj", "adv.time": "time", "adv.sentence": "sentence", "adv.conn": "conn", "front.A": "A", "adv.gen": "gen", "front.pp": "pp", "adv.manner": "manner", "adv.role": "role" };
  // (a pair's German words, for the German clause realizer below)
  const PAIR_DE = { or: { first: "", second: "oder" }, "both-and": { first: "sowohl", second: "als auch" }, "neither-nor": { first: "weder", second: "noch" }, "not-only-but-also": { first: "nicht nur", second: ", sondern auch" }, "either-or": { first: "entweder", second: "oder" }, "not-but": { first: "nicht", second: ", sondern" } };
  const PAIR_N = (first, second) => ({ "|oder": "or", "|und": "and", "entweder|oder": "either-or", "sowohl|als auch": "both-and", "weder|noch": "neither-nor", "nicht|, sondern": "not-but", "nicht nur|, sondern auch": "not-only-but-also" })[`${first}|${second}`] ?? `${first}|${second}`;
  function detSpec(d) {
    if (!d) return "none";
    if (d.kind === "def" || d.kind === "indef") return d.kind;
    if (d.kind === "kein") return "no";
    if (d.kind === "poss") return "poss." + d.who;
    if (d.kind === "der-word") return DER_N[d.stem];
    if (d.kind === "q") return { viel: "many", einig: "several", wenig: "few" }[d.stem];
    if (d.kind === "q.mass") return { viel: "much", wenig: "little" }[d.stem];
    if (d.kind === "num") return "num." + d.e.cid;
    if (d.kind === "name") return "name." + d.name;
    return "def";   // (relgen: dessen -- the relative clause's owner role says it)
  }
  let ids = null;
  const idOf = (p) => { if (!ids.has(p)) ids.set(p, String(ids.size + 1)); return ids.get(p); };
  function npSpec(np) {
    const n = np.noun, out = [`${detSpec(np.det)}:${n.verb ? "@" + n.verb.cid : n.cid}`];
    if (np.num === "pl" && np.det?.kind !== "num") out.push("pl");
    if (np.g === "f" && n.article === "der/die") out.push("female");
    if (np.one) out.push("one");
    if (np.deg) out.push("deg:" + np.deg.e.cid);
    if (np.adj) out.push("adj:" + np.adj.cid);
    for (const a of np.adjs ?? []) out.push("adj:" + a.cid);
    if (np.adjDeg) out.push(np.adjDeg);
    if (np.part) out.push(`part(${[np.part.kind, np.part.verb.cid, ...(np.part.by ? [`by(${valueSpec(np.part.by)})`] : np.part.advE ? [np.part.advE.cid] : [])].join(",")})`);
    if (np.attr?.kind === "gen") out.push(`owner(${npSpec(np.attr.of)})`);
    if (np.attr?.kind === "von") out.push(`owner.von(${valueSpec(np.attr.of)})`);
    if (np.of) out.push(`of(${npSpec(np.of)})`);
    if (np.pair) { const pk = np.pair.kind ?? PAIR_N(np.pair.first, np.pair.second); out.push(`pair(${pk},${npSpec(np.pair.np)})`); for (const m of np.more ?? []) out.push(`pair(${pk},${npSpec(m)})`); }
    if (np.more === true) out.push("more");
    if (np.rel) out.push(`rel(${idOf(np.rel)})`);
    return out.join("+");
  }
  function valueSpec(o) {
    if (!o) return null;
    if (o.kind === "pron") {
      if (o.ref || o.thingOf) { const t = o.ref ?? o.thingOf; return `${o.who === "3pl" ? "them" : "it"}:${t.cid}`; }
      return [PRON_N[o.who] ?? o.who, ...(o.adj ? ["adj:" + o.adj.cid] : []), ...(o.rel ? [`rel(${idOf(o.rel)})`] : [])].join("+");
    }
    if (o.kind === "name") return "name:" + o.w;
    if (o.kind === "np") return npSpec(o);
    return null;
  }
  // (a where-role says its relation: in, on, at a place -- liegt in / auf dem Bett -- from the German preposition)
  const WHERE = new Set(["location", "goal", "source", "path"]);
  // (the language-free relation of a where-role by what the noun is: a room, a building, a container, a country -- in
  //  / into; a surface, furniture, an open place -- on / onto; a person -- near / to; where from -- from; a path -- through)
  const whereRel = (role, n) => {
    // (the world's flags say how one is there: auf -- ON it, a platform, a market; an -- AT it, a shore; else a place,
    //  a room, a container is gone INTO -- the park, the garden, the town)
    const k = (c) => meaning.fits(n, c), person = k("person");
    const onTop = meaning.flag(n, "auf") || k("furniture"), atSide = meaning.flag(n, "an");
    const inside = !onTop && !atSide && (k("place") || k("room") || k("building") || k("container") || k("vehicle"));
    if (role === "source") return "from";
    if (role === "path") return "through";
    if (role === "goal") return person ? "to" : k("country") || k("settlement") ? "to" : onTop ? "onto" : atSide ? "to-side" : inside ? "into" : null;
    if (role === "location") return person ? "near" : onTop ? "on" : atSide ? "at" : inside ? "in" : null;
    return null;
  };
  const relOfPrep = (prep, kase) => ({ "in.dat": "in", "in.acc": "into", "auf.dat": "on", "auf.acc": "onto", "an.dat": "at", "an.acc": "to-side", "unter.dat": "under", "unter.acc": "under-to", "über.dat": "above", "über.acc": "above-to", "hinter.dat": "behind", "hinter.acc": "behind-to", "vor.dat": "front", "vor.acc": "front-to", "neben.dat": "beside", "neben.acc": "beside-to", "zwischen.dat": "between" })[`${prep}.${kase}`]
    ?? { zu: "to", nach: "to", aus: "from", von: "from", durch: "through", um: "around", bei: "near", entlang: "along", gegenüber: "opposite" }[prep] ?? null;
  const advSpec = (a) => (a.spec ?? (a.pos === "AN" ? "adj:" + a.cid : a.cid));   // (a manner said by an adjective: schnell -- adj:rýchly)
  function clauseSpec(p) {
    const A = [], put = (k, v) => v != null && v !== "" && A.push([k, v]);
    const type = { MAIN: "MAIN", INVERTED: "MAIN", SUB: "SUB", REL: "REL", YESNO: "YESNO", WH: "WH", IMP: "IMP", ZU: "INF", REP: "REP", DROP: "MAIN", JE: "SUB", DESTO: "MAIN", CONDV: "SUB", WERREL: "WHOEVER" }[p.type];
    if (p.type === "JE") put("link", "the-more");
    if (p.type === "DESTO") put("link", "the-more-so");
    if (p.type === "CONDV") { put("link", "if-unreal"); put("de.form", "verb-first"); }
    const cw = p.conjWord ?? null;
    if (cw && p.type !== "CONDV") put("link", cw === "when" && p.mood === "subj2" ? "if-unreal" : cw);
    put("verb", p.verb.cid);
    if (p.type === "DROP") put("drop", "yes");
    if (p.subj?.kind === "ctrl") put("ctrl", valueSpec(p.subj.of));
    else if (p.type !== "IMP" && p.type !== "WERREL" && p.subj && p.subj.kind !== "rel" && !p.relSubj && p.whRole !== "subj") put("subj", valueSpec(p.subj));
    else if (p.relSubj) put("subj", valueSpec(p.subj));
    if (p.relSpec) put("relrole", p.relSpec);
    else if (p.subj?.kind === "rel") put("relrole", "subj");
    for (const [k, o] of Object.entries(p.objs)) if (o.kind !== "rel" && p.whRole !== "obj." + k) put(p.roleOf?.[k] ?? { A: "patient", D: "recipient", G: "topic", A2: "second" }[k], valueSpec(o));
    for (const pp of p.pobj) {
      if (pp.kind === "da") put(pp.role, "it");
      else if (pp.agent) put(pp.agent, valueSpec(pp.np));
      else { const o = pp.np ?? pp, r = WHERE.has(pp.role) && o.kind === "np" && whereRel(pp.role, o.noun); put(pp.role ?? "pp", (r ? r + ":" : "") + valueSpec(pp.np ?? pp)); }
    }
    if (p.whRole === "pred") { /* (asked: wie) */ } else if (p.predSpec) put("pred", p.predSpec); else if (p.predNP) put("pred", valueSpec(p.predNP));
    for (const k of ["time", "freq", "manner", "place", "sentence", "conn"]) if (p.adv[k] && p.whRole !== "adv." + k) put(k, advSpec(p.adv[k]));   // (not the one asked)
    if (p.adv.gen) put(p.adv.gen.key, p.adv.gen.spec);
    if (p.modal) put("modal", p.modal.cid);
    if (p.zuVerb) put("raise", p.zuVerb.cid);
    if (p.inf) put("inf", p.inf.cid);
    if (p.voice) put("voice", p.voice);
    if (p.refl) put("refl", p.refl);
    if (p.imp) put("imp", p.imp);
    if (p.type !== "IMP" && p.type !== "ZU") put("tense", p.tense);
    if (p.mood !== "ind") put("mood", { subj1: "reported", subj2: "hypo" }[p.mood]);
    if (p.neg) put("neg", { "neg.all": "not-at-all", "neg.longer": "no-more", "neg.yet": "not-yet" }[p.negKind] ?? "yes");
    if (p.whSpec) put("wh", p.whSpec);
    if (p.jecompE) put("jecomp", p.jecompE.cid);
    if (p.clause) put("clause", idOf(p.clause));
    const front = p.front ?? FRONT_N[p.filled?.FRONT];
    if (front && front !== "subj") put("de.front", front);
    if (p.partWords) put("de.part", p.partWords.replace(/ /g, "_"));
    if (p.fixedWords) put("fixed", p.fixedWords.split(" ").map((w) => anyWord(w)?.cid ?? w).join(" ").replace(/ /g, "_"));   // (a frame's fixed word, as its concept: es tut mir leid -> ľúto)
    return { type, args: Object.fromEntries(Object.entries(A.reduce((m, [k, v]) => ((m[k] ??= []).push(v), m), {}))) };
  }
  function planOf(top, plans) {
    ids = new Map();
    const tops = plans.filter((p) => p.isTop);
    for (const p of tops) idOf(p);
    const seq = [];
    let i = 0;
    for (const sym of top.shape ?? []) {
      if (shapes.clauses.has(sym)) seq.push(idOf(tops[i++]));
      else if (sym.startsWith('"')) seq.push(sym.slice(1, -1));
      else if (sym === "coord") seq.push(top.coord);
      else if (sym === "dropcoord") seq.push(...(top.dropAber ? [",", "but"] : ["and"]));
      else if (sym === "w.entweder") seq.push("either");
      else if (sym === "w.oder") seq.push("or");
      else if (sym === "w.aber") seq.push("but");
    }
    const clauses = {};
    const todo = [...tops];
    while (todo.length) {
      const p = todo.shift(), c = clauseSpec(p);
      clauses[idOf(p)] = c;
      for (const q of plans) if (!clauses[ids.get(q)] && ids.has(q) && !todo.includes(q)) todo.push(q);
    }
    return { seq, clauses };
  }
  const planText = (b) => `S: ${b.seq.join(" ")}\n` + Object.entries(b.clauses).map(([id, c]) => `${id} ${c.type} ${Object.entries(c.args).flatMap(([k, vs]) => vs.map((v) => `${k}=${v}`)).join(" ")}`).join("\n");

  // ---- REALIZE: a sentence from a given structure ---------------------------------------------------------------------
  // The planner's choices written out (sentences/tests.txt, read by trainer/realize.js) and made by the same rules and
  // morphology: can the grammar build this sentence? Returns its text.
  const PRON = { ich: "1sg", du: "2sg", er: "3sg.m", sie: "3sg.f", es: "3sg.n", wir: "1pl", ihr: "2pl", "sie.pl": "3pl", Sie: "formal" };
  const WH = { wer: ["person", "nom"], wen: ["person", "acc"], wem: ["person", "dat"], was: ["thing", "nom"], wann: ["time"], wo: ["place"], warum: ["reason"], wie: ["manner"], woher: ["from"], wohin: ["whither"] };
  const FRONT_OF = { subj: "subj", time: "adv.time", sentence: "adv.sentence", conn: "adv.conn", A: "front.A", gen: "adv.gen", pp: "front.pp", manner: "adv.manner", role: "adv.role" };
  hooks.choose = (name, plan, alts) => (name === "FRONT" && plan?.front ? alts.find((a) => a.syms[0] === FRONT_OF[plan.front]) ?? null : null);
  // (free: the realizer chooses -- what stands first, by the grammar's weights; full: its words and sounds too)
  function realize(test, { free = false, full = false } = {}) {
    const plans = {};
    const need = (e, what) => { if (!e) throw new Error(`no ${what}`); return e; };
    const noun = (w) => need(word(w, "N"), "noun " + w), verbE = (w) => need(word(w, "V"), "verb " + w);
    const clauseOf = (id, head) => (plans[id] ??= buildClause(need(test.clauses[id], "clause " + id), head));
    // a value: a pronoun, a name, an indefinite (etwas+adj:neu), or a noun phrase
    function value(str, kase) {
      const [head, ...mods] = splitTop(str);
      if (PRON[head] || INDEF.has(head)) {
        const o = { kind: "pron", who: PRON[head] ?? head };
        for (const m of mods) if (m.startsWith("adj:")) o.adj = need(word(m.slice(4), "AN"), "adjective " + m); else if (call(m)[0] === "rel") o.rel = clauseOf(call(m)[1], o);   // (alles, was ...)
        return o;
      }
      if (head.startsWith("name:")) return { kind: "name", ...need(names.find((x) => x.w === head.slice(5)), "name " + head), num: "sg" };
      return npOf(str, kase);
    }
    function npOf(str, kase) {
      const [head, ...mods] = splitTop(str);
      const i = head.indexOf(":"), d = head.slice(0, i), nw = head.slice(i + 1);
      const n = nw.startsWith("@") ? nominal(verbE(nw.slice(1))) : noun(nw);   // (@lesen: das Lesen)
      const pl = mods.includes("pl") || ["all", "manch", "beid", "viel", "einig"].includes(d) || n.plural === "PL";
      const det = ["def", "indef", "kein"].includes(d) ? { kind: d } : d === "viel.mass" || d === "wenig.mass" ? { kind: "q.mass", stem: d.split(".")[0] } : d.startsWith("poss.") ? { kind: "poss", stem: M.possessive(d.slice(5)) }
        : ["dies", "jed", "all", "manch", "beid", "welch"].includes(d) ? { kind: "der-word", stem: d } : d === "viel" || d === "einig" ? { kind: "q", stem: d }
        : d.startsWith("num.") ? { kind: "num", tok: tok(need(anyWord(d.slice(4)), "number " + d)) } : d.startsWith("name.") ? { kind: "name", tok: nameGen(names.find((x) => x.w === d.slice(5))) } : null;
      const num = pl || det?.kind === "num" ? "pl" : "sg";
      const np = { kind: "np", noun: n, num, kase, det, adj: null, cat: meaning.catsOf(n)[0] ?? "entity", g: mods.includes("female") && num !== "pl" ? "f" : genderOf(n, num, () => 0) };
      // (a number: a measure stays singular unless feminine -- zwei Glas, zwei Tassen --; things counted, +pl: zwei Eier)
      if (det?.kind === "num") { np.form = mods.includes("pl") || genderOf(n, "sg", () => 0) === "f" ? "pl" : "sg"; }
      for (const m of mods) {
        const [f, a] = call(m);
        if (m.startsWith("adj:")) { const a = need(word(m.slice(4), "AN"), "adjective " + m); if (np.adj) (np.adjs ??= []).push(a); else np.adj = a; }   // (a second: einen samtigen, dunklen ...)
        else if (m === "one") np.one = true;   // (dieser eine Teller)
        else if (f === "of") np.of = npOf(a, kase);   // (a measure and its stuff, in the same case: eine Prise Salz, ein Stück kalte Butter)
        else if (m.startsWith("deg:")) np.deg = tok(need(anyWord(m.slice(4)), "word " + m));
        else if (m === "comp" || m === "sup") np.adjDeg = m;
        else if (m === "mehr") np.more = true;
        else if (f === "gen") np.attr = { kind: "gen", of: npOf(a, "gen") };
        else if (f === "von") np.attr = { kind: "von", of: value(a, "dat") };
        else if (f === "rel") np.rel = clauseOf(a, np);
        else if (f === "part") { const [k, v, ...ext] = splitTop(a, ","); np.part = { verb: verbE(v), kind: k, ext: ext.flatMap(extWords) }; }
        else if (f === "pair") { const [w, other] = splitTop(a, ","); const [x, y] = w.includes("…") ? w.split("…") : ["", w]; if (np.pair) (np.more ??= []).push(npOf(other, kase)); else np.pair = { first: x, second: (x === "nicht" || x === "nicht nur" ? ", " : "") + y, np: npOf(other, kase) }; }   // (more: a list -- A, B und C)
      }
      return np;
    }
    // (an extended participle's words before it: von + the doer, or adverbs)
    const extWords = (x) => { const [f, a] = call(x); return f === "von" ? ppWords("von", value(a, "dat")) : words(x); };
    const ppWords = (prep, o) => (o.kind === "pron" ? [tok(word(prep, "PRE")), M.pron(o.who, o.kase ?? "dat")] : expand(grammar, "PP", hooks, rnd, { ...o, prep: word(prep, "PRE") }, true));
    // a prepositional object: mit:def:Freund, auf.A:def:Tisch, da:auf (darauf), mit:er
    function ppOf(str) {
      const post = str.match(/\+post\(([^)]*)\)/)?.[1] ?? null;   // (über das Zischen hinweg)
      str = str.replace(/\+post\([^)]*\)/, "");
      const i = str.indexOf(":"), [p, c] = str.slice(0, i).split("."), rest = str.slice(i + 1);
      if (p === "da") return { kind: "da", da: need(M.daWord(rest, "A") ?? M.daWord(rest, "D"), "da-word " + rest) };
      const prep = need(prepEntry(p), "preposition " + p), kase = KASE[c ?? (prep.case ?? "D").split("/")[0]];
      const o = value(rest, kase);
      return o.kind === "pron" ? { prep, kase, ...o } : { prep, np: o, post };
    }
    // an adverbial: words (heute, gern, zu Hause), or a phrase (am:Montag, seit:zwei:Jahr, in:def:Garten, wegen:def:Regen)
    function advOf(str) {
      const [k, ...a] = str.split(":");
      if (!a.length) return str.startsWith("zu Hause") ? [spelled("zu Hause [tsuː ˈhaʊzə]")] : words(str);
      const N = (w) => noun(w);
      if (k === "am" || k === "im") return TIME[k](N(a[0]));
      if (k === "um") return TIME.um(need(word(a[0], "NUM"), "number " + a[0]));
      if (k === "date") return TIME.date(Number(a[0]), N(a[1]));
      if (k === "letzte" || k === "nächste" || k === "jed") return TIME[k](N(a[0]));
      if (k === "seit" || k === "vor" || (k === "in" && a.length === 2 && !a[0].includes("."))) return TIME.span(k, a[0] === "ein" ? null : word(a[0], "NUM"), N(a[1]));
      if (["wegen", "trotz", "während", "statt"].includes(k)) return [tok(word(k, "PRE")), ...expand(grammar, "NP", hooks, rnd, npOf(a.join(":"), "gen"), true)];
      const pp = ppOf(str);   // (a place: in:def:Garten)
      return pp.np ? ppPhrase(pp.np, pp.prep) : [pp.da];
    }
    // a predicate: adj:krank(+deg:sehr +comp+als(NP) +so+wie(NP) +sup), a noun phrase, name:, age:, clock:
    function predOf(str) {
      const [head, ...mods] = splitTop(str);
      if (head.startsWith("name:")) return [{ ...names.find((x) => x.w === head.slice(5)) }];
      if (head.startsWith("age:")) return [tok(need(word(head.slice(4), "NUM"), "number")), M.noun(noun("Jahr"), "nom", "pl"), tok(word("alt", "AN"))];
      if (head.startsWith("clock:")) return [tok(need(word(head.slice(6), "NUM"), "number")), tok(noun("Uhr"))];
      if (!head.startsWith("adj:")) return expand(grammar, "NP", hooks, rnd, npOf(str, "nom"), true);
      const a = need(word(head.slice(4), "AN"), "adjective " + head);
      const target = (f) => { const m = mods.find((x) => x.startsWith(f + "(")); return m ? arg(value(call(m)[1], "nom"), "nom") : []; };
      const flat = (t) => (Array.isArray(t) ? t : expand(grammar, t.rule, hooks, rnd, t.plan, true));
      if (mods.includes("comp")) return predWords(a, "comp", flat(target("als")));
      if (mods.includes("comp.bare")) return [M.degree(a, "comp")];
      if (mods.includes("so")) return predWords(a, "so", flat(target("wie")));
      if (mods.includes("so.that")) return [tok(anyWord("so")), tok(a)];   // (so müde, dass ...: its clause the plan's)
      if (mods.includes("sup")) return predWords(a, "sup");
      const deg = mods.find((x) => x.startsWith("deg:"));
      // (a second adjective: ruhig, aber schneidend / klein und hell)
      const pair = mods.map(call).find(([f]) => f === "aber" || f === "und");
      const second = pair ? [...(pair[0] === "aber" ? [COMMA] : []), ...words(pair[0]), tok(need(word(pair[1], "AN"), "adjective " + pair[1]))] : [];
      return [...(deg ? predWords(a, "deg", tok(anyWord(deg.slice(4)))) : [tok(a)]), ...second];
    }
    // a question word's tokens: wer, wen, wann, mit wem, worüber, wie alt, welch:NP, was für:NP, wie viele:NP
    function whOf(str) {
      if (str.includes(":")) {
        const [q, np] = [str.slice(0, str.indexOf(":")), str.slice(str.indexOf(":") + 1)];
        const kase = np.startsWith("A.") ? "acc" : "nom", o = npOf(np.replace(/^[AN]\./, ""), kase);
        if (q === "welch") return expand(grammar, "NP", hooks, rnd, { ...o, det: { kind: "der-word", stem: "welch" } }, true);
        if (q === "was für") return [...words("was für"), ...expand(grammar, "NP", hooks, rnd, { ...o, det: o.num === "pl" ? null : { kind: "indef" } }, true)];
        if (q === "wie viele") return [...words("wie viele"), ...expand(grammar, "NP", hooks, rnd, { ...o, det: null, num: "pl", g: "pl" }, true)];
      }
      return str.split(" ").flatMap((w) => (WH[w] ? [M.wh(...WH[w])] : /^wo[r]?[a-zü]+$/.test(w) && !WH[w] ? [M.woWord(w.replace(/^wor?/, ""), "A") ?? M.woWord(w.replace(/^wor?/, ""), "D")] : words(w)));
    }
    // a relative clause's head in it: subj (der ...), acc, dat (dem ...), prep.mit / prep.auf.A (mit dem ...), gen
    // (dessen Auto: subj= the owned thing), wo, was
    function relHead(plan, head, role) {
      const g = head.g ?? "n";
      if (role === "subj") { plan.subj = { kind: "rel", head }; plan.relpron = [M.relpron(g, "nom")]; }
      else if (role === "acc" || role === "dat") plan.relpron = [head.kind === "pron" ? M.wh("thing", "acc") : M.relpron(g, role)];
      else if (role === "was") plan.relpron = [M.wh("thing", "acc")];
      else if (role === "wo") plan.relpron = [M.wh("place")];
      else if (role.startsWith("prep.")) { const [, p, c] = role.split("."), prep = prepEntry(p); plan.relpron = [tok(prep), M.relpron(g, KASE[c ?? (prep.case ?? "D").split("/")[0]])]; }
      else if (role === "gen") { plan.subj.det = { kind: "relgen", tok: M.relpron(g, "gen") }; plan.relSubj = true; }
    }
    function buildClause(c, head) {
      const A = (k) => c.args[k]?.[0];
      const plan = { type: c.type === "ZUADV" ? "ZU" : c.type, verb: verbE(A("verb")), frame: { subj: "entity", slots: [] }, objs: {}, pobj: [], adv: {}, depth: 1,
        mood: A("mood") ?? "ind", tense: A("tense") ?? "present", front: A("front") ?? (free ? undefined : "subj") };
      for (const k of ["voice", "imp", "refl"]) if (A(k)) plan[k] = A(k);
      if (A("modal")) plan.modal = verbE(A("modal"));
      if (A("zuverb")) plan.zuVerb = verbE(A("zuverb"));
      if (A("inf")) plan.inf = verbE(A("inf"));
      if (plan.voice === "sichlassen") plan.refl = "acc";
      const subj = A("subj");
      if (plan.type === "ZU") plan.subj = { kind: "ctrl", of: value(A("ctrl") ?? "man", "nom") };
      else if (c.type === "WERREL") { plan.subj = { kind: "pron", who: "wer", hidden: true }; plan.relpron = [M.wh("person", "nom")]; }
      else if (subj === "drop") { plan.subj = value(A("as"), "nom"); plan.dropSubj = true; }
      else if (subj) plan.subj = value(subj, "nom");
      else if (c.type === "IMP") plan.subj = plan.imp === "formal" ? { kind: "pron", who: "formal" } : null;
      if (head) relHead(plan, head, A("relrole") ?? "subj");
      for (const k of ["A", "D", "G", "A2"]) if (A(k)) plan.objs[k] = value(A(k), KASE[k] ?? "acc");
      if (A("A0")) { const np = npOf(A("A0"), "acc"); plan.objs.A = Object.assign(np, { bare: true, det: np.det?.kind === "kein" ? np.det : null }); }
      for (const p of c.args.pp ?? []) plan.pobj.push(ppOf(p));
      if (A("pred")) plan.pred = predOf(A("pred"));
      if (A("fixed")) plan.fixed = words(A("fixed"));
      for (const k of ["time", "freq", "manner", "place", "sentence", "conn", "gen"]) if (A(k)) plan.adv[k] = { phrase: advOf(A(k)) };
      if (A("role")) plan.adv.role = { phrase: [tok(anyWord("als")), ...expand(grammar, "NP", hooks, rnd, npOf(A("role"), "nom"), true)] };   // (Als Koch war er ...)
      if (A("neg")) { plan.neg = true; if (A("neg") !== "nicht") plan.negWords = words(A("neg")); }
      if (A("part")) plan.part = words(A("part"));
      if (A("conj")) plan.conj = null, plan.conjToks = c.type === "ZUADV" ? [tok(prepEntry(A("conj")))] : words(A("conj"));
      if (A("wh")) plan.wh = whOf(A("wh"));
      if (A("jecomp")) plan.jecomp = [M.degree(need(word(A("jecomp"), "AN"), "adjective"), "comp")];
      if (A("clause")) plan.clause = clauseOf(A("clause"));
      plan.person = personOf(plan);
      // (the question word's noun is the subject -- welche Eltern, wie viele Gehälter: the verb with it)
      if (!subj && /^(welch|was für|wie viele):(?!A\.)/.test(A("wh") ?? "") && (A("wh").includes("+pl") || A("wh").startsWith("wie viele"))) plan.person = "3pl";
      return plan;
    }
    const toks = [];
    for (const item of test.seq ?? []) {
      if (/^[,.?!:„“–]$/.test(item)) toks.push({ w: item, ipa: "" });   // (direct speech: sagte: „Danke!“; a dash)
      // (a FRAGMENT, no verb: a noun phrase and its prepositional phrases -- Eine Suppe mit Kartoffeln und Lauch.)
      else if (test.clauses[item]?.type === "FRAG") { const c = test.clauses[item].args, np = npOf(c.np[0], "nom"); toks.push(...expand(grammar, "NP", hooks, rnd, np, true), ...pairTail(np, "nom"), ...(c.pp ?? []).flatMap((p) => { const pp = ppOf(p); return pp.np ? ppPhrase(pp.np, pp.prep) : [pp.da]; })); }
      else if (test.clauses[item]) toks.push(...(expand(grammar, test.clauses[item].type, hooks, rnd, clauseOf(item), true) ?? []));
      else toks.push(...words(item));
    }
    return full ? assemble(toks) : assemble(toks).text;
  }
  // (one German word said for its concept while asked -- a word's example sentences: use(pos, concept, word) -> undo)
  const use = (pos, concept, w) => {
    const k = `${pos}|${concept}`, was = byConcept.get(k), e = (allOf.get(k) ?? []).find((x) => x.word === w);
    if (!e || e === was) return () => {};
    byConcept.set(k, e);
    return () => byConcept.set(k, was);
  };
  return { sentence, meaning, realize, grammar, scenes, uncounted: isUncounted, word, synonyms, planText, use, setSay: (f) => (say = f) };
}

// the words in a row: punctuation against the word before it, a comma not doubled, the first letter capital
function assemble(tokens) {
  const words = [];
  for (const t of tokens) {
    if (!t?.w) continue;
    if (/^[,.?!]$/.test(t.w)) {
      if (!words.length) continue;
      const last = words[words.length - 1];
      if (/^[,.?!]$/.test(last.w)) { if (t.w !== ",") last.w = t.w; continue; }   // (", ." -> "."; ", ," -> ",")
      words.push(t);
    } else words.push(t);
  }
  // (no space before , . ? ! : “ nor after „; the first word of what is said is capitalised)
  // (and after a sentence's end -- two sentences in one block: Da klingelte es an der Tür. Die Gäste waren da. --
  //  not after „Gleich!“, antwortete ...: the quote's end is no sentence's end)
  let text = "", open = false, ended = false;
  for (const t of words) {
    const w = open || (ended && /^\p{L}/u.test(t.w)) ? t.w.charAt(0).toUpperCase() + t.w.slice(1) : t.w;
    text += (/^[,.?!:“]$/.test(t.w) || !text || text.endsWith("„") ? "" : " ") + w;
    open = t.w === "„";
    ended = /^[.?!]$/.test(t.w) ? true : t.w === "“" || t.w === "," ? false : /^\p{L}/u.test(t.w) ? false : ended;
  }
  text = text.charAt(0).toUpperCase() + text.slice(1);
  const ipa = words.filter((t) => t.ipa).map((t) => t.ipa).join(" ");
  return { text, ipa, tokens: words };
}
