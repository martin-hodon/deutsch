// ENGLISH SAYS A CLAUSE PLAN (world/CLAUSES.md): the language-free clause format -- concepts, roles, relations,
// links, pronoun codes -- in British English. Its words: en/dict.tsv (tools/en.py; a concept's commonest word, or
// en/rules/prefer.txt's); its closed words and word lists: en/rules/neutral.txt; how a verb says its roles, and which
// of a concept's words says a plan's roles: en/rules/frames.txt, else en/rules/roles.txt. The grammar is here, in
// order: the morphology, the noun phrase, the word and its frame, the verb chain (tense, aspect, mood, voice, modal,
// do-support), the tense English says, the clause, the sentence.
//
//   const en = await loadEnglish("", { meaning, vary })    (meaning: engine/meaning.js -- what a noun is: a place, a person)
//   en.realize(plan) -> { text, tokens }                    plan: { seq, clauses: { id: { type, args } } }
//   vary: a random source -- then a link's word is chosen by weight (because / as); without it, the first

import { splitTop, call } from "../engine/realize.js";
import { syllables, doubles, regular, verbForm, plural, compare as compareOf } from "./morph.js";
import { loadLexicon, ROLES, PERSONS, DIRECTED } from "../engine/lexicon.js";
import { planTense } from "../engine/tense.js";

const VOWEL = /^[aeiouæɑɒɔəeɛɜɪʊʌ]/;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const MODALS = new Set(["can", "could", "will", "would", "must", "may", "might", "should"]);

export async function loadEnglish(base, { meaning = null, vary = null } = {}) {
  const lx = await loadLexicon(base, "en", { meaning, vary, verbEntry: (w) => verbEntry(w) });
  const { entry, wordOf, own, sp, byConcept, byWord, table, say, LIST, choose, defaults, framesOf, kindOf, nounKind, pick, markOf, catOf, nounOf } = lx;
  const frameFor = (c) => lx.frameFor(c, ctxPlan);
  let ctxPlan = null;
  const NOART = LIST("noart"), STATIVE = LIST("stative"), PROG = LIST("prog"), MID = LIST("mid"), FRONT = LIST("front"), PAST = LIST("past"), FUTURE = LIST("future"), DEGREE = LIST("degree");
  const STATEPP = new Map([...LIST("statepp")].map((x) => x.split(":"))), ADVERB = Object.fromEntries([...LIST("adverb")].map((x) => x.split(":"))), TOADJ = LIST("toadj");
  const COMP = Object.fromEntries([...LIST("comp")].map((x) => x.split(":")));
  // a verb's entry by its word: the dictionary's, else (an idiom: go to sleep, be sorry) its head's forms and the rest
  const verbEntry = (w) => {
    const e = byWord.get("V|" + w);
    if (e) return e;
    const [h, ...rest] = w.split(" "), he = byWord.get("V|" + h), tail = rest.length ? " " + rest.join(" ") : "";
    return { word: w, forms: he?.forms ? he.forms.split("/").map((x) => x + tail).join("/") : "" };
  };
  // ---- MORPHOLOGY -----------------------------------------------------------------------------------------------------
  const compare = (a, form) => compareOf(a, form, COMP);
  const adverbOf = (a) => ADVERB[a] ?? (/ic$/.test(a) ? a + "ally" : /le$/.test(a) ? a.slice(0, -1) + "y" : /[^aeiou]y$/.test(a) ? a.slice(0, -1) + "ily" : /ly$/.test(a) ? a : a + "ly");
  // a or an: by the next word's sound (its IPA when the dictionary has it)
  function an(next) {
    if (!next) return "a";
    const ipa = byWord.get(next.replace(/,$/, ""))?.ipa?.replace(/^[ˈˌ]/, "");
    return (ipa ? VOWEL.test(ipa) : /^[aeiou]/i.test(next) && !/^(uni|use|usu|eu|one|once)/i.test(next)) || /^(hour|honest|honour)/i.test(next) ? "an" : "a";
  }

  // ---- PRONOUNS AND NOUN PHRASES ---------------------------------------------------------------------------------------
  const PRON = (code) => (table.pron?.[code]?.[0]?.w ?? "").split("/");   // subject, object, possessive, its pronoun, reflexive
  const personOf = (code) => ({ "1sg": "1sg", "3sg.m": "3sg", "3sg.f": "3sg", "3sg.n": "3sg", "3pl": "3pl", "1pl": "1pl" })[code] ?? (/^(2sg|2pl|formal|one)$/.test(code) ? "2" : "3sg");
  const isPron = (v) => !!v && (!!table.pron?.[splitTop(v)[0]] || /^(it|them):/.test(v));
  const countableSg = (v) => { const [h, ...mods] = splitTop(v), n = nounOf(v), e = n && own(n, "N"); return !!e && !mods.includes("pl") && e.plural !== "-" && e.plural !== "PL" && !h.includes("@"); };
  // A NOUN PHRASE -> { toks, person, pron } ; kase: subj | obj ; ctx.countable: a single countable thing needs its
  // article (I am a teacher); ctx.bare: after to / at / in -- work, school, bed have none (to work), nor a vehicle after by
  function np(v, kase = "obj", ctx = {}) {
    if (v == null) return { toks: [], person: "3sg" };
    const [head, ...mods] = splitTop(v);
    const tp = head.match(/^(it|them):(.+)$/);
    if (tp) return { toks: [tp[1] === "them" ? (kase === "subj" ? "they" : "them") : "it"], person: tp[1] === "them" ? "3pl" : "3sg", pron: true };
    if (table.pron?.[head]) {
      const f = PRON(head), out = [kase === "subj" ? f[0] : f[1]];
      for (const m of mods) { const [fn, a] = call(m); if (m.startsWith("adj:")) out.push(wordOf(m.slice(4), "AN")); else if (fn === "rel") out.push(...relClause(a, { pron: head }, ctx)); }
      return { toks: out, person: personOf(head), pron: head };
    }
    if (head.startsWith("name:")) return { toks: [head.slice(5)], person: "3sg", name: true };
    const i = head.indexOf(":"), d = i < 0 ? "none" : head.slice(0, i), n = i < 0 ? head : head.slice(i + 1);
    const gerund = n.startsWith("@"), ne = gerund ? null : entry(n.replace(/^~/, "").split("/")[0], "N");
    const plDet = ["all", "both", "many", "several", "few"].includes(d);
    const pl = mods.includes("pl") || plDet || ne?.plural === "PL" || (d.startsWith("num.") && wordOf(d.slice(4), "NUM") !== "one");
    const mass = ne?.plural === "-";
    const noun = gerund ? verbForm(verbEntry(wordOf(n.slice(1), "V")), "ing") : pl && ne ? plural(ne) : ne?.word ?? sp(n);
    const pre = [], post = [];
    // the adjectives, in order; a degree word before them; the comparative, the superlative
    const adjs = mods.filter((m) => m.startsWith("adj:")).map((m) => entry(m.slice(4), "AN") ?? { word: sp(m.slice(4)) });
    const deg = mods.find((m) => m.startsWith("deg:")), sup = mods.includes("sup"), comp = mods.includes("comp");
    if (mods.includes("one")) pre.push("one");   // (this one plate)
    // (of different kinds: in English's order, no comma -- a big old dog; else a list: a dark, shiny mirror)
    const cumulative = !sup && !comp && lx.adjOrder.cumulative(adjs);
    (cumulative ? lx.adjOrder.before(adjs) : adjs).forEach((a, k) => pre.push(...(k === 0 && deg ? [wordOf(deg.slice(4), "AV")] : []), (k === 0 && sup ? compare(a, "sup") : k === 0 && comp ? compare(a, "comp") : a.word) + (k < adjs.length - 1 && !cumulative ? "," : "")));
    for (const m of mods) {
      const [fn, a] = call(m);
      if (fn === "part") {   // the laughing children / the perfectly fried fillet / the tea recommended by the doctor / the book to be read
        const [k, verb, ...ext] = splitTop(a, ","), ve = verbEntry(wordOf(verb, "V"));
        const by = ext.find((x) => call(x)[0] === "by");
        if (k === "zuI") post.push("to", "be", verbForm(ve, "pp"));
        else if (by) post.push(verbForm(ve, "pp"), "by", ...np(call(by)[1], "obj", ctx).toks);
        else pre.push(...ext.flatMap((x) => adverb(x, "manner", ctx)), k === "I" ? verbForm(ve, "ing") : verbForm(ve, "pp"));
      }
      else if (fn === "of") post.push("of", ...np(a, "obj", ctx).toks);
      else if (fn === "owner.von") post.push("of", ...(table.pron?.[splitTop(a)[0]] ? [PRON(splitTop(a)[0])[3]] : np(a, "obj", ctx).toks));
      else if (fn === "rel") post.push(...relClause(a, { noun: n }, ctx));
    }
    // the determiner
    let det = d === "def" ? (gerund ? "" : "the") : d === "indef" ? (pl || mass ? "" : "a") : d === "none" ? "" : d === "no" ? (mods.includes("more") ? "no more" : "no")
      : d === "this" ? (pl ? "these" : "this") : d.startsWith("poss.") ? PRON(d.slice(5))[2] : d.startsWith("num.") ? wordOf(d.slice(4), "NUM") : d.startsWith("name.") ? d.slice(5) + "'s"
      : d === "much" ? (pl ? "many" : "much") : d === "little" ? (pl ? "few" : "little") : d === "all" ? "all the" : say("det", d) ?? "";
    // (a person's thing: my father's car -- a thing's: the colour of the wall)
    const owner = mods.find((m) => call(m)[0] === "owner");
    if (owner) {
      const o = call(owner)[1], on = np(o, "obj", ctx), oh = splitTop(o)[0];
      if (nounKind(oh)("person") || oh.startsWith("name:")) { const t = on.toks.join(" "); det = t + (/s$/.test(t) && on.person === "3pl" ? "'" : "'s"); }
      else post.unshift("of", ...on.toks);
    }
    if (sup && d === "def") det = "the";
    if (d === "none" && !pl && !mass && ne && ctx.countable) det = "a";
    if ((d === "def" || d === "none") && !pl && !pre.length && ctx.bare && (NOART.has(noun) || ctx.bare === "vehicle")) det = "";
    const toks = [...(det ? det.split(" ") : []), ...pre, noun, ...post];
    if (det === "a") toks[0] = an(toks[1]);
    // pairs and lists: coffee or tea, both A and B, neither A nor B
    const pairs = mods.filter((m) => call(m)[0] === "pair").map((m) => splitTop(call(m)[1], ","));
    if (pairs.length) {
      const kind = pairs[0][0], others = pairs.map(([, o]) => np(o, kase, ctx).toks);
      const J = { and: ["", "and"], or: ["", "or"], "both-and": ["both", "and"], "neither-nor": ["neither", "nor"], "not-but": ["", "but"], "not-only-but-also": ["not only", "but also"], "either-or": ["either", "or"] }[kind] ?? ["", kind];
      const list = [toks, ...others];
      const out = [...(J[0] ? [J[0]] : []), ...list.slice(0, -1).flatMap((x, k) => [...x, ...(k < list.length - 2 ? [","] : [])]), J[1], ...list[list.length - 1]];
      return { toks: out, person: /or|nor/.test(kind) ? "3sg" : "3pl" };
    }
    return { toks, person: pl ? "3pl" : "3sg" };
  }

  // ---- THE VERB CHAIN ---------------------------------------------------------------------------------------------------
  // units bottom-up (the lexical verb, the passive's be, the progressive's be, a raising verb, a modal, the perfect's
  // have, will / would); each asks the one below for its form (base, to, pp, ing); said top-down
  const BE = { word: "be" }, HAVE = { word: "have" };
  const CORE = { "môcť": "can", "musieť": "must", "smieť": "may" };
  const PERI = { can: ["be", "able"], must: ["have"], may: ["be", "allowed"], should: ["be", "supposed"] };
  function units(F, lex, { hypo, ifClause, prog, plain }) {
    const u = [{ v: lex, lex: true, aux: lex.word === "be" }];
    if (F.voice === "passive" || F.voice === "state" || (F.voice === "sichlassen" && !plain)) u.push({ v: BE, sel: "pp", aux: true });
    if (prog) u.push({ v: BE, sel: "ing", aux: true });
    if (F.voice === "seinzu") u.push({ v: BE, sel: "pp", aux: true }, { v: BE, sel: "to", aux: true });
    if (F.voice === "sichlassen" && !plain) u.push({ modal: "can", sel: "base" });
    if (F.raise) u.push({ v: verbEntry(wordOf(F.raise, "V")), sel: "to" });
    if (F.like) u.push({ v: verbEntry("like"), sel: "ing" });
    const m = F.modal && sp(F.modal), would = hypo && !ifClause;
    let top = null;
    // (chcieť: want to, would like to; mať (povinnosť): is supposed to, should; môcť: can, could, be able to ...)
    if (m === "chcieť") { if (would) { u.push({ v: verbEntry("like"), sel: "to" }); top = "would"; } else u.push({ v: verbEntry("want"), sel: "to" }); }
    else if (m === "mať rád") { u.push({ v: verbEntry("like"), sel: "to" }); if (would) top = "would"; }
    else if (m === "mať (povinnosť)") { if (would) top = "should"; else u.push({ modal: "should", sel: "base" }); }
    else if (CORE[m]) { const c = CORE[m]; if (would && c !== "must") top = { can: "could", may: "might" }[c]; else u.push({ modal: c, sel: "base" }); }
    else if (m) u.push({ v: verbEntry(wordOf(F.modal, "V")), sel: "to" });
    if (["perfect", "pluperfect", "future2"].includes(F.tense)) u.push({ v: HAVE, sel: "pp", aux: true });
    if ((F.tense === "future" || F.tense === "future2") && !hypo) u.push({ modal: "will", sel: "base" });
    if (would) top ??= "would";
    if (top) u.push({ modal: top, sel: "base" });
    return u;
  }
  // the chain's words, top-down: [{ w, aux }] -- need: pres | past (finite) | base | to | ing | pp
  function sayUnits(u, need, person, were) {
    const out = [];
    for (let k = u.length - 1; k >= 0; k--) {
      const x = u[k];
      if (need === "to") { out.push({ w: "to" }); need = "base"; }
      if (x.modal) {
        // (a modal is itself where it is finite -- can, could, will, would; should is be supposed to, as sollen is;
        //  else its periphrasis: will be able to, has had to, was allowed to)
        const self = ["will", "would", "could", "might"].includes(x.modal) || (need === "pres" && ["can", "must", "may"].includes(x.modal)) || (need === "past" && x.modal === "can");
        if (self) { out.push({ w: need === "past" && x.modal === "can" ? "could" : x.modal, aux: true }); need = x.sel; continue; }
        const [p0, ...pr] = PERI[x.modal];
        out.push({ w: verbForm({ word: p0 }, need === "pres" ? "s" : need, person, were), aux: p0 === "be" && (need === "pres" || need === "past") }, ...pr.map((w) => ({ w })));
        need = "to"; continue;
      }
      let w = verbForm(x.v, need === "pres" ? "s" : need, person, were);
      if (x.state && STATEPP.has(w)) w = STATEPP.get(w);   // (the door is open)
      out.push({ w, aux: !!x.aux && (need === "pres" || need === "past"), lex: !!x.lex });
      need = x.sel ?? "base";
    }
    return out;
  }
  // the chain with negation, a question's inversion (do-support for a lexical verb alone) and the middle adverbs
  function chain(F, lex, person, { neg, question, hypo, ifClause, prog, finite = true, form = null, plain = false, mid = [] }) {
    const u = units(F, lex, { hypo, ifClause, prog, plain });
    if (F.voice === "state") u[0].state = true;
    const past = F.tense === "past" || F.tense === "pluperfect" || (ifClause && hypo);
    let out = sayUnits(u, finite ? (past ? "past" : "pres") : form ?? "base", person, ifClause && hypo);
    const nw = neg?.[0];
    const isAux = (x) => x.aux || MODALS.has(x.w);
    if (finite && ((neg && nw !== "no longer") || question) && !isAux(out[0])) out = [{ w: verbForm({ word: "do" }, past ? "past" : "s", person), aux: true }, ...sayUnits(u, "base", person)];
    const words = out.map((x) => x.w);
    const after = [...(neg && nw !== "no longer" ? [nw] : []), ...mid, ...(nw === "no longer" ? [nw] : [])];
    if (!finite) return [...(neg ? ["not"] : []), ...mid, ...words];
    return isAux(out[0]) ? [words[0], ...after, ...words.slice(1)] : [...after, ...words];
  }

  // ---- THE TENSE ENGLISH SAYS (engine/tense.js: the perfect as the past, nearly) -- and the present of what is planned
  // or going on now as the progressive (he is coming tomorrow; I am waiting)
  function tenseOf(id, plan, lex) {
    const { F, hypo, futureTime } = planTense(id, plan, { timeWord: (t) => wordOf(t, "AV"), isPast: (w) => PAST.has(w), isFuture: (w) => FUTURE.has(w), isNearly: (v) => /^(nearly|almost)$/.test(wordOf(v, "AV")) });
    const c = plan.clauses[id], h = lex.word.split(" ")[0];
    const prog = F.tense === "present" && !hypo && !F.voice && !F.modal && !F.raise && !F.freq && !STATIVE.has(h) && !["IMP", "INF", "WHOEVER"].includes(c.type) && (futureTime || PROG.has(h) || PROG.has(lex.word));
    return { F, hypo, prog };
  }

  // ---- A CLAUSE ---------------------------------------------------------------------------------------------------------
  function clause(id, ctx) {
    const c = ctx.plan.clauses[id];
    if (!c) return [];
    const type = c.type, A = (k) => c.args[k]?.[0], all = (k) => c.args[k] ?? [];
    const link = A("link");
    if (!A("verb")) return type === "FRAG" ? [...np(A("np"), "obj", ctx).toks, ...all("pp").flatMap((p) => relPhrase(p.slice(0, p.indexOf(":")), p.slice(p.indexOf(":") + 1), ctx))] : [];
    const fr = frameFor(c);
    let lex = fr.v, predHead = [];
    if (/^be /.test(lex.word)) { predHead = lex.word.split(" ").slice(1); lex = BE; }   // (be sorry: be, and its predicate)
    const exist = c.args.verb[0] === "dať" && A("subj") === "3sg.n" && A("patient") && !A("fixed");   // (there is / are)
    if (exist) lex = BE;
    let { F, hypo, prog } = tenseOf(id, ctx.plan, lex);
    // (gern: likes reading; would like to read -- rád as a manner is a verb in English)
    const likeIt = all("manner").includes("rád") && !F.modal;
    if (likeIt) { if (hypo) F.modal = "mať_rád"; else F.like = true; prog = false; }
    // the subject: the plan's, or the role the frame makes the subject (es tut mir leid -> I am sorry); there is / are
    const subjV = fr.f?.subjRole ? A(fr.f.subjRole) : A("subj");
    let neg = A("neg") ? ({ "no-more": ["no longer"] }[A("neg")] ?? ["not"]) : null;
    const negEnd = A("neg") === "not-yet" ? ["yet"] : A("neg") === "not-at-all" ? ["at all"] : [];
    // (no + a single countable thing: I am not buying an apple; not ... but: I do not drink coffee but tea)
    let patientV = A("patient");
    if (patientV && /^no:/.test(patientV) && countableSg(patientV) && !exist && lex.word !== "have" && lex.word !== "be") { patientV = patientV.replace(/^no:/, "indef:"); neg = ["not"]; }
    if (Object.values(c.args).flat().some((v) => /pair\(not-but,/.test(v))) neg = ["not"];
    for (const r of fr.f?.absorb.keys() ?? []) if (/^no:/.test(A(r) ?? "")) neg = ["not"];   // (keinen Urlaub haben: is not on holiday)
    const subj = exist ? { toks: ["there"], person: np(A("patient")).person } : subjV ? np(subjV, "subj", ctx) : null;
    const person = subj?.person ?? "3sg";
    // the objects (io, direct) and the role phrases, in the plan's order
    const io = [], objs = [], phrases = [];
    const patientThere = (patientV && !isPron(patientV) && patientV !== "it" && patientV !== "this") || A("relrole") === "patient" || /^patient:/.test(A("wh") ?? "");
    for (const [k, vs] of Object.entries(c.args)) for (let v of vs) {
      if (!ROLES.has(k) || (exist && k === "patient") || k === fr.f?.subjRole || fr.f?.absorb.has(k) || (v === "it" && A("clause"))) continue;
      if (k === "patient") v = patientV;
      const wr = v.match(/^([a-z-]+):(.*)$/);
      if (wr && table.rel?.[wr[1]] && !table.det?.[wr[1]] && !table.pron?.[wr[1]] && !/^(it|them)$/.test(wr[1])) { phrases.push(...relPhrase(wr[1], wr[2], ctx)); continue; }
      const mk = markOf(fr, k, v);
      const o = v === "it" ? { toks: ["it"] } : np(v, "obj", { ...ctx, countable: k === "bare", bare: mk === "by" ? "vehicle" : /^(to|at|in|from)$/.test(mk) });
      if (mk.split(" ")[0] === lex.word.split(" ").pop() && lex.word.includes(" ")) { phrases.push(...o.toks); continue; }   // (ask for + for)
      if (mk === "io") { if (patientThere) io.push(...o.toks); else phrases.push("to", ...o.toks); continue; }
      if (mk === "direct") { objs.push(...o.toks); continue; }
      phrases.push(...mk.split(" "), ...o.toks);
    }
    // (the free phrases: where to before the rest -- to work by bus; "it" held for a following clause is not said)
    for (const p of [...all("pp")].sort((a, b) => DIRECTED.has(b.split(":")[0]) - DIRECTED.has(a.split(":")[0]))) {
      const i = p.indexOf(":"), r = p.slice(0, i), v = p.slice(i + 1);
      if (v === "it" && A("clause")) continue;
      (DIRECTED.has(r) ? phrases.unshift : phrases.push).call(phrases, ...relPhrase(r, v, ctx));
    }
    for (const v of all("by")) phrases.push("by", ...np(v, "obj", ctx).toks);
    for (const v of all("through")) phrases.push("through", ...np(v, "obj", ctx).toks);
    for (const v of all("role")) phrases.push("as", ...np(v, "obj", { ...ctx, countable: true }).toks);   // (as a cook)
    const after = [];
    for (const k of ["because-of", "despite", "during", "instead-of"]) for (const v of all(k)) after.push(...say("rel", k).split(" "), ...np(v, "obj", ctx).toks);
    // an infinitive's verb: goes to sleep, hears her sing, has it repaired, goes swimming
    const infT = [];
    if (A("inf") && !fr.f?.inf?.absorb) {
      const ie = verbEntry(wordOf(A("inf"), "V")), mk = fr.f?.inf?.mark ?? "to";
      infT.push(...(mk === "to" ? ["to", ie.word] : mk === "bare" ? [ie.word] : [verbForm(ie, mk === "pp" ? "pp" : "ing")]));
    }
    // the adverbs: in the middle (always, nearly), at the front (then; now in a story), at the end (manner, place, time)
    const advs = { manner: [], place: [], time: [], freq: [], sentence: [], conn: [] }, mid = [], front = [], midManner = [];
    for (const k of Object.keys(advs)) for (const v of all(k)) {
      if (likeIt && k === "manner" && v === "rád") continue;
      let t = adverb(v, k, ctx);
      if (k === "time" && F.tense === "future2" && t.length === 1 && FUTURE.has(t[0])) t = ["by", ...t];   // (by tomorrow)
      const w = t.join(" ");
      if (k === "manner" && DEGREE.has(w) && (predHead.length || A("pred"))) { predHead.unshift(w); continue; }
      if (FRONT.has(w) && type === "MAIN" && (w !== "now" || F.tense === "past")) { front.push(w); continue; }
      if (MID.has(w)) { mid.push(w); continue; }
      if (k === "conn" || k === "sentence") { front.push(w, ...(/^(maybe|perhaps|so|then|also)$/.test(w) ? [] : [","])); continue; }
      if (k === "manner" && /ly$/.test(w) && t.length === 1 && own(v, "AV") == null) { midManner.push(w); continue; }
      advs[k].push(...t);
    }
    // a fixed word no frame says: byť + it -> its predicate (it is important); else an adverb (too, together)
    let pred = exist ? np(A("patient"), "obj", ctx).toks : A("pred") ? predicate(A("pred"), c, ctx) : [];
    if (A("fixed") && !fr.f?.fixed) { if (lex.word === "be" && !pred.length) pred = [wordOf(A("fixed"), "AN")]; else advs.manner.push(...adverb(A("fixed"), "manner", ctx)); }
    pred = [...predHead, ...pred];
    // a clause inside: that ..., whether ..., to ..., (he says) he was ill -- unless the sentence says it in its turn
    const inner = A("clause") && !(ctx.plan.seq ?? []).includes(A("clause")) ? innerClause(A("clause"), fr, ctx) : [];
    // (a manner adverb in -ly: before the verb when something follows it -- she slowly drank a sip --, else at the end)
    const tailAfterVerb = io.length || objs.length || phrases.length || pred.length;
    if (midManner.length) (tailAfterVerb && !hypo ? mid : advs.manner).push(...midManner);
    // the verb chain, by the clause's kind
    const question = type === "YESNO" || (type === "WH" && !whIsSubject(c));
    const ifClause = type === "SUB" && (link === "if-unreal" || link === "as-if");
    const ingLink = /^(without|instead|by-doing|without-that|instead-that)$/.test(link ?? "") || ctx.ing;
    let vc;
    if (F.voice === "seinzu" && advs.manner.length) {   // (the problem is difficult to solve)
      advs.manner.splice(0);
      const adj = all("manner").map((v) => ((byConcept.get(`AN|${sp(v)}`) ?? []).find((e) => TOADJ.has(e.word)) ?? own(v, "AN") ?? { word: wordOf(v, "AV") }).word);
      vc = [...chain({ ...F, voice: null }, BE, person, { neg, question, hypo, ifClause, mid }), ...adj, "to", lex.word];
    } else if (F.voice === "sichlassen" && (advs.manner.length || midManner.length)) {   // (the window opens easily)
      if (midManner.length && !advs.manner.includes(midManner[0])) { mid.splice(mid.length - midManner.length); advs.manner.push(...midManner); }
      vc = chain({ ...F, voice: null }, lex, person, { neg, question, hypo, ifClause, mid, plain: true });
    } else if (type === "IMP") vc = [...(neg ? ["do", "not"] : []), ...chain(F, lex, person, { finite: false, form: "base", mid })];
    else if (type === "INF" || (type === "SUB" && /^(by-doing|without-that|instead-that)$/.test(link)) || ctx.ing) {
      vc = [...(ingLink || ctx.bareInf ? [] : ["to"]), ...chain(F, lex, person, { finite: false, form: ingLink ? "ing" : "base", neg, mid })];
    }
    else vc = chain(F, lex, person, { neg, question, hypo, ifClause, prog, mid });
    // the special constructions: my name is ..., what is your name?
    if (F.verb === "volať_sa" && (A("pred")?.startsWith("name:") || A("wh") === "how")) return nameClause(c, subj);
    const rest = [...io, ...objs, ...infT, ...pred, ...advs.manner, ...phrases, ...advs.place, ...advs.time, ...negEnd, ...after, ...inner];
    const subjT = subj?.toks ?? [];
    if (type === "WH") {
      const wh = whWords(A("wh"), c, fr, ctx);
      if (whIsSubject(c)) return [...wh.pre, ...vc, ...rest, ...wh.post];
      const [aux, ...vr] = vc;
      return [...front, ...wh.pre, aux, ...subjT, ...vr, ...rest, ...wh.post];
    }
    if (type === "YESNO") { const [aux, ...vr] = vc; return [...front, aux, ...subjT, ...vr, ...rest]; }
    if (type === "IMP") return [...front, ...vc, ...rest];
    if (type === "INF" || ctx.ing) {
      const lk = ctx.ing ? null : link === "purpose" ? choose(table.link.purpose).w : link ? say("link", link) : null;
      return [...(lk && lk !== "to" ? [lk] : []), ...vc, ...rest];
    }
    if (type === "SUB" && /^(by-doing|without-that|instead-that)$/.test(link)) return [say("link", link), ...(link === "by-doing" ? [] : np(subjV, "obj", ctx).toks), ...vc, ...rest];
    if (type === "SUB" && link === "the-more") { const j = entry(A("jecomp"), "AN") ?? { word: wordOf(A("jecomp") ?? "", "AN") }; return ["the", compare(j, "comp"), ...subjT, ...vc, ...rest]; }
    if (type === "MAIN" && link === "the-more-so") return ["the", ...pred, ...subjT, ...vc, ...objs, ...phrases];
    if (type === "WHOEVER") return ["whoever", ...vc, ...rest];
    if (type === "REL") return relBody(c, fr, vc, rest, subjT, subjV, ctx);
    const lk = type === "SUB" && link ? [A("en.word") ?? choose(table.link[link] ?? [{ w: link, weight: 1 }]).w] : [];
    const wh = type === "SUB" && A("wh") ? whWords(A("wh"), c, fr, ctx) : null;   // (I do not know where he lives)
    if (wh) return whIsSubject(c) ? [...wh.pre, ...vc, ...rest, ...wh.post] : [...wh.pre, ...subjT, ...vc, ...rest, ...wh.post];
    if (A("drop") === "yes" && ctx.dropOK) return [...lk, ...front, ...vc, ...rest];   // (he buys bread and drinks coffee)
    return [...lk, ...front, ...subjT, ...vc, ...rest];
  }
  function whIsSubject(c) { const w = c.args.wh?.[0] ?? ""; return !c.args.subj && !/^(why|when|where|how|whence|whither|how-old|how-late|how-often|whom)$/.test(w) && !/^[\w.]+:(who|what)$/.test(w) && !/^[\w-]+:A\./.test(w); }
  function whWords(w, c, fr, ctx) {
    if (!w) return { pre: [], post: [] };
    const rw = w.match(/^([\w.]+):(who|what)$/);
    if (rw && ROLES.has(rw[1])) { const mk = markOf(fr, rw[1], null); return { pre: [rw[2] === "who" ? "who" : "what"], post: /^(direct|io)$/.test(mk) ? [] : [mk.split(" ")[0]] }; }
    const i = w.indexOf(":");
    if (i > 0) { const q = w.slice(0, i), spec = w.slice(i + 1).replace(/^[AN]\./, ""); return { pre: [...(say("wh", q) ?? q).split(" "), ...np(spec.replace(/^[a-z.]+:/, "none:"), "obj", ctx).toks], post: [] }; }
    const s = say("wh", w) ?? w;
    if (s.includes("...")) { const [a, b] = s.split(" ... "); return { pre: [a], post: [b] }; }
    return { pre: s.split(" "), post: [] };
  }
  function nameClause(c, subj) {
    const who = c.args.subj?.[0];
    const poss = who && table.pron?.[who] ? PRON(who)[2] : subj ? subj.toks.join(" ") + "'s" : "the";
    if (c.type === "WH") return ["what", "is", poss, "name"];
    return [poss, "name", c.args.tense?.[0] === "past" ? "was" : "is", ...(c.args.neg ? ["not"] : []), c.args.pred[0].slice(5)];
  }
  function predicate(v, c, ctx) {
    const [head, ...mods] = splitTop(v);
    if (head.startsWith("age:")) return [wordOf(head.slice(4), "NUM"), "years", "old"];
    if (head.startsWith("clock:")) return [wordOf(head.slice(6), "NUM"), "o'clock"];
    if (head.startsWith("name:")) return [head.slice(5)];
    if (!head.startsWith("adj:")) return np(v, "obj", { ...ctx, countable: true }).toks;
    const e = entry(head.slice(4), "AN"), a = { ...(e ?? {}), word: (e?.word ?? wordOf(head.slice(4), "AN")).replace(/^be /, "") };   // (AN be in love: in love)
    const deg = mods.find((m) => m.startsWith("deg:"));
    const target = (f) => { const m = mods.find((x) => call(x)[0] === f); return m ? np(call(m)[1], "obj", ctx).toks : []; };
    const second = mods.map(call).find(([f]) => f === "but" || f === "and");
    const tail = second ? [second[0], wordOf(second[1], "AN")] : [];
    if (mods.includes("comp.bare")) return [compare(a, "comp")];
    if (mods.includes("comp")) return [compare(a, "comp"), "than", ...target("than")];
    if (mods.includes("so")) return ["as", a.word, "as", ...target("as")];
    if (mods.includes("so.that")) return ["so", a.word];
    if (mods.includes("sup")) return ["the", compare(a, "sup")];
    return [...(deg ? [wordOf(deg.slice(4), "AV")] : []), a.word, ...tail];
  }
  const ORD = { 1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth", 11: "eleventh", 12: "twelfth" };
  // an adverb: a concept (its adverb, else its adjective's: slowly), a time phrase, a relation's phrase
  function adverb(v, k, ctx) {
    if (v === "home") return ["at", "home"];
    if (v.startsWith("adj:")) return [adverbOf(wordOf(v.slice(4), "AN"))];
    const [h, ...a] = v.split(":");
    if (!a.length) { const e = own(v, "AV") ?? own(v, "PAR") ?? own(v, "PHR"); if (e) return [e.word]; const j = own(v, "AN"); return [j ? adverbOf(j.word) : wordOf(v, "AV")]; }
    if (table.time?.[h]) {
      const n = (x) => wordOf(x, "N");
      if (h === "on-day") return /morning|afternoon|evening|night/.test(n(a[0])) ? ["in", "the", n(a[0])] : ["on", n(a[0])];
      if (h === "in-period") return /morning|afternoon|evening/.test(n(a[0])) ? ["in", "the", n(a[0])] : ["in", n(a[0])];
      if (h === "at-hour") return ["at", wordOf(a[0], "NUM"), "o'clock"];
      if (h === "date") return ["on", "the", ORD[Number(a[0])] ?? a[0], "of", n(a[1])];
      if (h === "last" || h === "next" || h === "every") return [h, n(a[0])];
      const cnt = a[0] === "ein" ? null : wordOf(a[0], "NUM"), unit = entry(a[1], "N"), many = cnt && cnt !== "one";
      const u = many ? (unit ? plural(unit) : n(a[1])) : n(a[1]), count = many ? [cnt, u] : [an(u), u];
      if (h === "since") return ["for", ...count];
      if (h === "ago") return [...count, "ago"];
      return ["in", ...count];
    }
    if (table.rel?.[h]) return relPhrase(h, a.join(":"), ctx);
    return [sp(v)];
  }
  // a relation and its noun phrase: on the table, at the market, by bus, to work
  function relPhrase(r, v, ctx) {
    const prep = pick(table.rel?.[r] ?? [{ w: r }], splitTop(v)[0]);
    if (prep === "home") return ["home"];
    if (r === "by" && nounKind(splitTop(v)[0])("vehicle")) return ["by", ...np(v, "obj", { ...ctx, bare: "vehicle" }).toks];
    return [...prep.split(" "), ...np(v, "obj", { ...ctx, bare: /^(to|at|in|from|into)$/.test(prep) }).toks];
  }
  // a clause inside a clause: that ..., whether ..., to ..., (he says) he was ill; looks forward to you coming
  function innerClause(id, fr, ctx) {
    const c = ctx.plan.clauses[id];
    if (!c) return [];
    if (c.type === "INF" && fr.f?.inf?.mark && fr.f.inf.mark !== "to") return clause(id, { ...ctx, ing: fr.f.inf.mark === "ing", bareInf: fr.f.inf.mark === "bare" });   // (feels like sailing)
    if (fr.f?.that?.ing && c.type === "SUB") {
      const s = c.args.subj?.[0];
      return [...(fr.f.that.prep ? [fr.f.that.prep] : []), ...(s ? np(s, "obj", ctx).toks : []), ...clause(id, { ...ctx, ing: true })];
    }
    return clause(id, ctx);
  }
  // a relative clause: the man who sleeps / whom I helped / (whom) I am talking to / whose car / where I live / that
  function relClause(id, head, ctx) { return ctx.plan?.clauses[id] ? clause(id, { ...ctx, head }) : []; }
  function relBody(c, fr, vc, rest, subjT, subjV, ctx) {
    const role = c.args.relrole?.[0] ?? "subj", head = ctx.head ?? {};
    const person = head.noun ? nounKind("x:" + head.noun)("person") : !!head.pron && PERSONS.test(head.pron);
    if (role === "subj") return [person ? "who" : "that", ...vc, ...rest];
    if (role === "owner") return ["whose", ...np((subjV ?? "").replace(/^[\w.]+:/, "none:"), "subj", ctx).toks, ...vc, ...rest];
    if (role === "where") return ["where", ...subjT, ...vc, ...rest];
    if (role === "what") return [...subjT, ...vc, ...rest];
    const mk = ROLES.has(role) ? markOf(fr, role, null) : "direct";
    if (mk === "direct") return [person ? "whom" : "that", ...subjT, ...vc, ...rest];
    return [...subjT, ...vc, ...rest, mk === "io" ? "to" : mk.split(" ").pop()];   // (the woman I am talking to)
  }

  // ---- THE SENTENCE ------------------------------------------------------------------------------------------------------
  const KEEPCOMMA = new Set(["although", "whereas", "without", "instead"]);
  function realize(plan) {
    plan = lx.agree(plan);   // (the dogs that play: a relative clause on a plural)
    const ctx = { plan: { ...plan, clauses: { ...plan.clauses } } }, toks = [];
    ctxPlan = ctx.plan;
    const seq = plan.seq ?? [];
    let afterClause = false;
    for (let i = 0; i < seq.length; i++) {
      const t = seq[i], c = ctx.plan.clauses[t];
      if (c) {
        // (whoever is hungry eats: its statement's subject is the whoever clause -- no comma, no "he")
        if (c.args.subj?.[0] === "that-one" && toks[toks.length - 1] === ",") { toks.pop(); const cc = { ...c, args: { ...c.args } }; delete cc.args.subj; ctx.plan.clauses[t] = cc; }
        // (a clause after its main one: no comma before because, if, that, to ...)
        else if (afterClause && toks[toks.length - 1] === "," && !KEEPCOMMA.has(c.args.link?.[0]) && (c.type === "INF" || c.type === "SUB")) toks.pop();
        toks.push(...clause(t, { ...ctx, dropOK: true }));
        afterClause = true;
      } else if (t === "„") { if (toks[toks.length - 1] === ":") toks[toks.length - 1] = ","; toks.push("‘"); afterClause = false; }
      else if (t === "“") { toks.push("’"); if (seq[i + 1] === ",") { const p = toks[toks.length - 2]; if (p === "!" || p === "?") i++; else if (p === ".") toks.splice(toks.length - 2, 1, ","); } }
      else if (/^[,.?!:–]$/.test(t)) { toks.push(t); if (/[.?!]/.test(t)) afterClause = false; }
      else if (table.coord?.[t]) { toks.push(say("coord", t)); if (t === "admittedly") toks.push(","); afterClause = false; }
      else { const e = own(t, "INT") ?? own(t, "PHR") ?? own(t, "AV"), j = own(t, "AN"); toks.push(e ? e.word : j ? ADVERB[j.word] ?? j.word : wordOf(t, "INT")); }   // (‘Thank you!’ ‘Gladly!’ ‘Perfect!’)
    }
    return assemble(toks);
  }
  function assemble(toks) {
    const words = toks.filter((t) => t != null && t !== "").flatMap((t) => t.split(" "));
    let text = "", start = true;
    for (const w of words) {
      const glue = /^[,.?!:’]$/.test(w) || !text || text.endsWith("‘");
      text += (glue ? "" : " ") + (start && /^\p{L}/u.test(w) ? cap(w) : w);
      if (/^\p{L}/u.test(w)) start = false;
      if (/^[.?!]$/.test(w) || w === "‘") start = true;
      if (w === "’") start = false;
    }
    text = text.replace(/,,/g, ",").replace(/\bi\b/g, "I");
    return { text: cap(text), tokens: words.map((w) => ({ w, ipa: lx.ipaOf(w) })) };
  }
  return { realize, word: entry, use: lx.use };
}

export const load = loadEnglish;   // (the name every realizer has: sentences.html ?lang=)
