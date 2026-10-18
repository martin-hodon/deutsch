// THE GRAMMAR LADDER: a sentence grown from the simplest one, one grammar rule a step, every step a whole right
// sentence (world/build.txt: the steps, their words, the places) -- Der Hund schläft. -> Der alte Hund schläft. -> Der
// große alte Hund schläft. -> ... heute im Garten. Light and quick, from data: the grammar and the words' relations
// (world/meaning: frames, what an adjective describes; world/adjorder.txt; world/lists.txt), the word-fitting helpers
// of engine/simple.js, said by the language's realizer. No planner, no scene, no story.
//
//   const b = await createBuilder({ dict, meaning, say, level })   dict: the language's (data.js); meaning on it;
//                                                                   say(plan) -> { text, tokens, ipa } (a realizer)
//   b.ladder({ target, steps })  -> [{ step, plan, said, shows: [structure ...] }] | null -- the base, then a step a
//                                   rung; `target`: a structure the last rung shows (null: any); `steps`: how many
//                                   besides the target (default 3-5)
//   b.sentence({ target, steer, extra }) -> { plan, said } | null -- a short ladder's last rung: the target structure,
//                                   `extra` (0-2) steps more; `steer` what the forms exercise wishes ({ tense, mood,
//                                   plural, links, degree, freq })
//   b.unbuild(plan)              -> the ladder that leads to a given plan (a declared example's): its parts taken off one
//                                   by one while a simpler sentence still stands -- a second clause, the question, the
//                                   adjuncts, the negation, the modal, the tense, the adjectives ... --, then read upwards
//   b.targets                    the structures a ladder can end with (a step can add them)
import { parseTests, splitTop } from "./realize.js";
import { structuresOf } from "./structures.js";
import { createSimple } from "./simple.js";
import { ROLES } from "./lexicon.js";

const DET = /^(def|indef|none|no|poss\.[\w.]+)$/;
const PRON = /^(1sg|2sg|3sg\.[mfn]|1pl|2pl|3pl|formal)$/;
const sp = (cid) => cid.replace(/_/g, " ");
const clone = (plan) => JSON.parse(JSON.stringify(plan));
// (a structure a step brings -- the target a ladder may be asked to end with)
const SHOWS = {
  adjective: ["adjective"], "adjective-order": ["adjective-order"], degree: ["one-gladly-very"], possessive: ["possessive"],
  comparison: ["comparison"], past: ["past"], perfect: ["perfect"], future: ["future"], modal: ["modal"],
  negation: ["negation", "no-det"], frequency: ["frequency"], time: ["time-basic", "time-phrases"], manner: ["manner"],
  place: ["place-basic", "adverb-order"], "yes-no": ["yes-no"], wh: ["wh-basic"], and: ["coord"],
  because: ["that-because-if"], although: ["although-so-that"], relative: ["relative"],
};
// (what a forms exercise's steer asks of the steps: a tense, the hypothetical's link, a degree, the plural, a habit)
const STEER_LINK = { because: "because", although: "although" };

function parseBuild(src) {
  const out = { steps: [], words: {}, time: {}, places: [] };
  for (const raw of src.split("\n")) {
    const s = raw.split(/\s--\s/)[0].trim();
    if (!s || s.startsWith("#")) continue;
    let m;
    if ((m = s.match(/^STEP (\S+)(?: \{([\d.]+)\})?$/))) out.steps.push({ name: m[1], weight: Number(m[2] ?? 1) });
    else if ((m = s.match(/^TIME (\w+): (.*)$/))) out.time[m[1]] = m[2].split("|").map((x) => x.trim());
    else if ((m = s.match(/^PLACE (\S+) : (.*)$/))) out.places.push({ place: m[1], verbs: m[2].trim() === "*" ? null : new Set(m[2].split("|").map((x) => sp(x.trim()))) });
    else if ((m = s.match(/^([A-Z]+): (.*)$/))) out.words[m[1]] = m[2].split("|").map((x) => x.trim());
    else throw new Error(`build.txt: cannot read "${s}"`);
  }
  return out;
}

export async function createBuilder({ dict, meaning, say, base = "", rnd = Math.random, level = 2 }) {
  const data = parseBuild(await (await fetch(base + "world/build.txt")).text());
  // (the words by their rank, sharply: the dog, the book -- not the tyrant, the application)
  const sg = await createSimple({ dict, meaning, say, base, rnd, level, weigh: (e) => 1 / (Math.min(e.rank, 1e5) + 30) }), P = sg.parts;
  const { pick, weighted, byFreq } = P;
  // (the everyday verbs, the manner adverbs and the verbs each goes with, the states -- world/lists.txt)
  const everyday = new Set([...P.listOf("verb.routine"), ...P.listOf("manner.rád")]), STATES = P.listOf("adj.state");
  const MANNER = [...P.lists.matchAll(/^WORDS manner\.(\S+): (.*)$/gm)].map((m) => ({ cid: m[1], verbs: new Set(m[2].split("|").map((x) => sp(x.trim().replace(/\s*\{[\d.]+\}$/, "")))) }));
  const ofConcept = (pos, cid) => dict.byConcept.get(`${pos}|${sp(cid)}`)?.[0] ?? null;
  const SUBJECTS = new Set(data.words.SUBJECTS.map(sp)), THINGS = new Set(data.words.THINGS.map(sp));
  // (the kinds a predicate adjective of a base is of: size, quality, age, colour -- world/adjorder.txt -- not an opinion)
  const PLAIN = new Set(["size", "quality", "age", "colour"]);
  // (an adjective that has degrees: of these kinds, or of none and not on adj.ungradable -- not "very purple", "more German")
  const GRADED = new Set(["opinion", "size", "quality", "age"]);
  const gradable = (a) => !!a && !P.UNGRADABLE.has(a.concept) && (!meaning.adjKind(a) || GRADED.has(meaning.adjKind(a)));

  // ---- a plan's parts --------------------------------------------------------------------------------------------------
  const main = (plan) => plan.clauses["1"];
  const arg = (c, k) => c.args[k]?.[0];
  const set = (c, k, v) => { if (v == null) delete c.args[k]; else c.args[k] = [v]; };
  // a noun phrase value -> { det, cid, mods } (null: a pronoun, a name, a phrase)
  const npOf = (v) => { if (!v) return null; const [head, ...mods] = splitTop(v), i = head.indexOf(":"); return i > 0 && DET.test(head.slice(0, i)) && !head.slice(i + 1).startsWith("@") ? { det: head.slice(0, i), cid: head.slice(i + 1), mods } : null; };
  const npText = (n) => [`${n.det}:${n.cid}`, ...n.mods].join("+");
  const adjsIn = (n) => n.mods.filter((m) => m.startsWith("adj:")).map((m) => ofConcept("AN", m.slice(4))).filter(Boolean);
  const verbOf = (c) => ofConcept("V", arg(c, "verb"));
  const isPred = (c) => !!arg(c, "pred");
  // (a predicate that lasts -- groß, rosa -- has no time of its own: not "is new on Saturday", "will be pink"; a state may)
  const lasting = (c) => isPred(c) && !STATES.has(ofConcept("AN", splitTop(arg(c, "pred"))[0].replace(/^adj:/, ""))?.concept);
  const tenseOf = (c) => arg(c, "tense") ?? "present";
  // the noun phrases a step may change: the subject's, the object's (role, value, its noun's entry)
  const nps = (c) => ["subj", "patient", "theme"].map((k) => ({ k, n: npOf(arg(c, k)) })).filter((x) => x.n).map((x) => ({ ...x, e: ofConcept("N", x.n.cid) })).filter((x) => x.e);
  // the subject as a pronoun in a following clause: a pronoun itself, they (a plural), it (an animal, a thing) -- a
  // person's he or she the world does not tell (no natural gender): then none
  function pronounOf(c) {
    const v = arg(c, "subj"), n = npOf(v);
    if (PRON.test(v ?? "")) return v;
    if (!n) return null;
    const e = ofConcept("N", n.cid);
    if (!e) return null;
    if (n.mods.includes("pl")) return P.personNoun(e) ? "3pl" : `them:${n.cid}`;
    return P.personNoun(e) ? null : `it:${n.cid}`;
  }
  const subjectNoun = (c) => { const n = npOf(arg(c, "subj")); return n && ofConcept("N", n.cid); };
  const animate = (c) => { const v = arg(c, "subj"); if (PRON.test(v ?? "")) return true; const e = subjectNoun(c); return !!e && meaning.fits(e, "animal"); };

  // ---- the base: an everyday verb's frame, its subject a noun, at most one object -- or a noun, be, an adjective ----
  // (one verb, not a phrase: hrať hudbu says "make music" -- učiť sa, ísť (pešo) are one verb)
  const oneVerb = (v) => !/ /.test(v.concept.replace(/ sa$/, "").replace(/ \(.*\)$/, ""));
  const NOT = new Set(data.words.NOT.map(sp)), frameVerbs = P.verbs.filter((v) => everyday.has(v.concept) && !NOT.has(v.concept) && oneVerb(v));
  const baseFrames = (v) => meaning.frames(v).filter((f) => P.usable(f) && f.slots.length <= 1 && f.slots.every((s) => s.role === "patient"));
  // (the subject: one of SUBJECTS where the frame takes one, else the frame's own choice -- a pronoun mostly)
  const subjectFor = (f) => {
    const ns = P.nounsFor(P.subjSlot(f)).filter((e) => SUBJECTS.has(e.concept));
    if (!ns.length) return null;   // (a frame of other subjects: another verb)
    if (P.isPerson(f.subj) && rnd() < .15) return { v: pick(["1sg", "2sg", "3sg.m", "3sg.f", "1pl", "3pl"]), person: true };
    const e = weighted(ns, () => 1);
    return { v: P.np(e, "subj"), noun: e, person: P.personNoun(e) };
  };
  function action(verbs = frameVerbs, { subj = null } = {}) {
    for (let t = 0; t < 30; t++) {
      const verb = pick(verbs), fs = baseFrames(verb);
      if (!fs.length) continue;
      const f = pick(fs), s = subj ? { v: subj } : subjectFor(f);
      if (!s) continue;
      const parts = P.slots(f, s);
      if (parts) return { verb, text: P.frameText(verb, f, s, parts) };
    }
    return null;
  }
  const clauseOf = (type, text) => parseTests(`x\n  S: 1 .\n  1 ${type} ${text}`)[0].clauses["1"];
  // (`pred`: a noun, be, an adjective -- true, false, or null: now and then)
  function basePlan(pred = null) {
    if (pred ?? rnd() < .2) {   // (Der Hund ist alt.)
      for (let t = 0; t < 20; t++) {
        const noun = pick(P.nounsFor({ cat: "concrete" }).filter((e) => THINGS.has(e.concept) || SUBJECTS.has(e.concept))), adjs = noun && P.adjsFor(noun).filter((a) => PLAIN.has(meaning.adjKind(a)));
        if (adjs?.length) return { seq: ["1", "."], clauses: { 1: clauseOf("MAIN", `verb=byť subj=def:${noun.cid} pred=adj:${pick(adjs).cid}`) } };
      }
      if (pred) return null;
    }
    const a = action();
    return a && { seq: ["1", "."], clauses: { 1: clauseOf("MAIN", a.text) } };
  }

  // ---- the steps: each (plan) -> the plan with it, or null where it does not fit ------------------------------------
  const STEP = {
    adjective(plan) {
      const c = main(plan), opts = nps(c).filter((x) => !adjsIn(x.n).length);
      if (!opts.length) return null;
      // (one of the order of adjectives -- the common, concrete ones; beside a predicate adjective one of another kind:
      //  not "Das tolle Land ist toll", "the terrible back is pretty")
      const x = opts.find((o) => o.k === "subj" && rnd() < .7) ?? pick(opts), pred = ofConcept("AN", splitTop(arg(c, "pred") ?? "")[0].replace(/^adj:/, ""));
      const adjs = P.adjsFor(x.e, { attributive: true }).filter((a) => !!meaning.adjKind(a) && (!pred || (a !== pred && meaning.adjKind(a) !== meaning.adjKind(pred))));
      if (!adjs.length) return null;
      x.n.mods.push(`adj:${pick(adjs).cid}`); set(c, x.k, npText(x.n));
      return plan;
    },
    // (a second adjective of another kind: the language says both in its order of adjectives)
    "adjective-order"(plan) {
      const c = main(plan), opts = nps(c).filter((x) => adjsIn(x.n).length === 1 && !!meaning.adjKind(adjsIn(x.n)[0]) && !x.n.mods.some((m) => /^(deg:|comp|sup)/.test(m)));
      if (!opts.length) return null;
      const x = pick(opts), [first] = adjsIn(x.n), pred = ofConcept("AN", splitTop(arg(c, "pred") ?? "")[0].replace(/^adj:/, ""));
      const adjs = P.adjsFor(x.e, { attributive: true }).filter((a) => meaning.cumulative(first, a) && (!pred || (a !== pred && meaning.adjKind(a) !== meaning.adjKind(pred))));
      if (!adjs.length) return null;
      const both = [first, pick(adjs)];   // (the plan's order is no matter: each language says them in its own -- <lang>/rules/adjectives.txt)
      x.n.mods = [...x.n.mods.filter((m) => !m.startsWith("adj:")), ...both.map((a) => `adj:${a.cid}`)]; set(c, x.k, npText(x.n));
      return plan;
    },
    degree(plan) {
      const c = main(plan), deg = `deg:${pick(data.words.DEGREE)}`;
      const pv = arg(c, "pred") ?? "";   // (a predicate adjective: sehr alt)
      if (/^adj:/.test(pv) && !/\+(deg|comp|sup)/.test(pv) && gradable(ofConcept("AN", splitTop(pv)[0].slice(4)))) { set(c, "pred", `${pv}+${deg}`); return plan; }
      const opts = nps(c).filter((x) => adjsIn(x.n).length === 1 && !x.n.mods.some((m) => /^(deg:|comp|sup)/.test(m)) && gradable(adjsIn(x.n)[0]));
      if (!opts.length) return null;
      const x = pick(opts); x.n.mods.push(deg); set(c, x.k, npText(x.n));
      return plan;
    },
    possessive(plan) {
      const c = main(plan), opts = nps(c).filter((x) => x.n.det === "def" || (x.n.det === "indef" && !x.n.mods.includes("pl")));
      if (!opts.length) return null;
      const x = pick(opts), subj = arg(c, "subj"), own = data.words.POSSESSIVE.filter((p) => x.k !== "subj" || p !== `poss.${subj}`);
      x.n.det = pick(own); set(c, x.k, npText(x.n));
      return plan;
    },
    plural(plan) {
      const c = main(plan), x = nps(c).find((o) => o.k === "subj");
      if (!x || x.n.mods.includes("pl") || !P.countable(x.e) || !/^(def|indef|poss\.)/.test(x.n.det)) return null;
      x.n.mods.push("pl"); set(c, "subj", npText(x.n));
      return plan;
    },
    // (the comparative of a predicate adjective, than another noun it describes of a category they share)
    comparison(plan) {
      const c = main(plan), pv = arg(c, "pred"), subj = subjectNoun(c);
      if (!subj || !/^adj:/.test(pv ?? "") || /\+(deg|comp|sup)/.test(pv)) return null;
      const adj = ofConcept("AN", splitTop(pv)[0].slice(4)), cats = new Set(meaning.catsOf(subj));
      if (!gradable(adj)) return null;
      const others = P.nounsOf(adj).filter((n) => n.word !== subj.word && meaning.catsOf(n).some((k) => cats.has(k)));
      if (!others.length) return null;
      set(c, "pred", `${pv}+comp+than(def:${weighted(others, byFreq).cid})`);
      return plan;
    },
    past: (plan) => tense(plan, "past"), perfect: (plan) => tense(plan, "perfect"), future: (plan) => tense(plan, "future"),
    modal(plan) {
      const c = main(plan);
      if (arg(c, "modal") || arg(c, "tense") || isPred(c) || !animate(c)) return null;
      set(c, "modal", pick(data.words.MODAL));
      return plan;
    },
    // (not; an object with a / an: no -- kein Buch, not "nicht ein Buch")
    negation(plan) {
      const c = main(plan);
      if (arg(c, "neg")) return null;
      const obj = nps(c).find((x) => x.k !== "subj" && (x.n.det === "indef" || (x.n.det === "none" && !x.n.mods.includes("pl"))));
      if (obj) { obj.n.det = "no"; set(c, obj.k, npText(obj.n)); } else set(c, "neg", "yes");
      return plan;
    },
    frequency(plan) {
      const c = main(plan), v = verbOf(c);
      if (arg(c, "freq") || arg(c, "time") || isPred(c) || !v || !everyday.has(v.concept)) return null;
      set(c, "freq", pick(data.words.FREQUENCY));
      return plan;
    },
    time(plan) {
      const c = main(plan);
      if (arg(c, "time") || arg(c, "freq") || lasting(c)) return null;
      set(c, "time", pick(data.time[tenseOf(c)] ?? data.time.present));
      return plan;
    },
    // (how: an adverb whose verbs -- world/lists.txt manner.* -- have this one; gladly in the present, with no modal)
    manner(plan) {
      const c = main(plan), v = verbOf(c);
      if (arg(c, "manner") || isPred(c) || !v) return null;
      const opts = MANNER.filter((m) => m.verbs.has(v.concept) && (m.cid !== "rád" || (tenseOf(c) === "present" && !arg(c, "modal"))));
      if (!opts.length) return null;
      set(c, "manner", pick(opts).cid);
      return plan;
    },
    place(plan) {
      const c = main(plan), v = verbOf(c);
      if (arg(c, "place") || isPred(c) || !v) return null;
      const opts = data.places.filter((p) => p.verbs ? p.verbs.has(v.concept) : rnd() < .15);
      if (!opts.length) return null;
      set(c, "place", pick(opts).place);
      return plan;
    },
    "yes-no"(plan) {
      if (plan.seq.length !== 2) return null;
      main(plan).type = "YESNO"; plan.seq = ["1", "?"];
      return plan;
    },
    // (where for the place, when for the time -- the question word takes its place --, else where of a verb done at
    //  places, when of another)
    wh(plan) {
      const c = main(plan), v = verbOf(c);
      if (plan.seq.length !== 2 || isPred(c) || !v) return null;
      const wh = arg(c, "place") ? "where" : arg(c, "time") ? "when" : data.places.some((p) => p.verbs?.has(v.concept)) ? "where" : "when";
      set(c, wh === "where" ? "place" : "time", null);
      c.type = "WH"; set(c, "wh", wh); plan.seq = ["1", "?"];
      return plan;
    },
    and(plan) {
      const c = main(plan), pron = pronounOf(c), v = verbOf(c), e = subjectNoun(c);
      if (plan.seq.length !== 2 || plan.seq[1] !== "." || !pron || !v || isPred(c)) return null;
      const verbs = frameVerbs.filter((x) => x !== v && baseFrames(x).some((f) => e ? meaning.fitsSlot(e, P.subjSlot(f)) : P.isPerson(f.subj)));
      const a = verbs.length && action(verbs, { subj: pron });
      if (!a) return null;
      plan.clauses["2"] = clauseOf("MAIN", `${a.text}${arg(c, "tense") ? ` tense=${arg(c, "tense")}` : ""}`); plan.seq = ["1", "and", "2", "."];
      return plan;
    },
    because: (plan) => state(plan, "because"), although: (plan) => state(plan, "although"),
    // (a relative clause on the subject: an everyday action its noun does)
    relative(plan) {
      const c = main(plan), n = npOf(arg(c, "subj")), e = n && ofConcept("N", n.cid), v = verbOf(c);
      if (!e || n.mods.some((m) => m.startsWith("rel("))) return null;
      const verbs = frameVerbs.filter((x) => x !== v && baseFrames(x).some((f) => meaning.fitsSlot(e, P.subjSlot(f))));
      const a = verbs.length && action(verbs, { subj: "who" });
      if (!a) return null;
      plan.clauses["2"] = clauseOf("REL", a.text.replace(/ subj=\S+/, " relrole=subj"));
      n.mods.push("rel(2)"); set(c, "subj", npText(n));
      return plan;
    },
  };
  function tense(plan, t) {
    const c = main(plan);
    if (arg(c, "tense") || arg(c, "modal") || arg(c, "time") || (t !== "past" && lasting(c))) return null;   // (the tense before a time word: včera after the past)
    set(c, "tense", t);
    return plan;
  }
  // (a reason, a concession: the subject -- he, she, it, they -- in a state that describes it)
  function state(plan, link) {
    const c = main(plan), pron = pronounOf(c), e = subjectNoun(c);
    if (plan.seq.length !== 2 || plan.seq[1] !== "." || !pron || isPred(c)) return null;
    const adjs = dict.entries.filter((a) => a.pos === "AN" && P.common(a) && STATES.has(a.concept) && !meaning.attributiveOnly(a) && (e ? meaning.describes(a, e) : meaning.describesCat(a, "person")));
    if (!adjs.length) return null;
    plan.clauses["2"] = clauseOf("SUB", `link=${link} verb=byť subj=${pron} pred=adj:${pick(adjs).cid}${["past", "perfect"].includes(arg(c, "tense")) ? " tense=past" : ""}`);
    plan.seq = ["1", ",", "2", "."];
    return plan;
  }

  // ---- a ladder -----------------------------------------------------------------------------------------------------
  const ORDER = data.steps.map((s) => s.name), LAST = new Set(["yes-no", "wh", "and", "because", "although", "relative"]);
  const said = (plan) => { try { const s = say(plan); return s?.text ? s : null; } catch { return null; } };
  // the steps of a ladder: `want` first (the target's step, steered ones), the rest drawn by weight; at most one of the
  // last kind (a question or a second clause) -- in the file's order
  function choose(want, n) {
    const out = new Set(want), pool = data.steps.filter((s) => !out.has(s.name));
    while (out.size < want.length + n && pool.length) {
      const s = weighted(pool, (x) => x.weight);
      pool.splice(pool.indexOf(s), 1);
      if (LAST.has(s.name) && [...out].some((x) => LAST.has(x))) continue;
      if (/^(past|perfect|future|modal)$/.test(s.name) && [...out].some((x) => /^(past|perfect|future|modal)$/.test(x))) continue;
      out.add(s.name);
    }
    return ORDER.filter((s) => out.has(s));
  }
  // (a step only an action takes, one only `be + adjective` takes)
  const ACTION = new Set(["modal", "frequency", "manner", "place", "wh", "and", "past", "perfect", "future", "time"]);
  function climb(names, need) {
    const pred = need.has("comparison") ? true : [...need].some((n) => ACTION.has(n)) ? false : null;
    let plan = basePlan(pred), s = plan && said(plan);
    if (!s) return null;
    const rungs = [{ step: "base", plan, said: s, shows: [...structuresOf(plan)] }];
    for (const name of names) {
      const before = structuresOf(plan), next = STEP[name]?.(clone(plan)), ns = next && said(next);
      if (!ns) { if (need.has(name)) return null; continue; }   // (a step that does not fit here: left out -- unless wished)
      plan = next;
      rungs.push({ step: name, plan, said: ns, shows: [...structuresOf(plan)].filter((x) => !before.has(x)) });
    }
    return rungs;
  }
  // the step that brings a structure (null: none does)
  const stepFor = (structure) => Object.keys(SHOWS).find((k) => SHOWS[k].includes(structure)) ?? null;
  function ladder({ target = null, steps = 3 + Math.floor(rnd() * 3), want = [] } = {}) {
    const first = [...want, ...(target && stepFor(target) ? [stepFor(target)] : [])];
    if (target && !first.length) return null;
    // (the steps before one wished: what it needs -- a second adjective an adjective, a degree an adjective)
    if (first.includes("adjective-order") || (first.includes("degree") && rnd() < .7)) first.unshift("adjective");
    for (let t = 0; t < 12; t++) {
      const rungs = climb(choose(first, steps), new Set(first));
      if (rungs && (!target || structuresOf(rungs.at(-1).plan).has(target)) && (rungs.length > Math.min(steps, 2) || t > 8)) return rungs;   // (a ladder of a few rungs)
    }
    return null;
  }
  // a sentence for an exercise: a short ladder's last rung
  function sentence({ target = null, steer = {}, extra = Math.floor(rnd() * 3) } = {}) {
    const want = [];
    if (/^(past|perfect|future)$/.test(steer.tense ?? "")) want.push(steer.tense);
    for (const l of steer.links ?? []) if (STEER_LINK[l]) want.push(STEER_LINK[l]);
    if (steer.degree === "comp") want.push("comparison");
    if (steer.plural) want.push("plural");
    if (steer.freq) want.push("frequency");
    const rungs = ladder({ target, steps: extra, want });
    return rungs ? { plan: rungs.at(-1).plan, said: rungs.at(-1).said } : null;
  }
  // ---- a given plan, taken apart: each OFF one step undone (named as the step that puts it back), outermost first ------
  const mainId = (plan) => plan.seq.find((x) => /^(MAIN|YESNO|WH|IMP)$/.test(plan.clauses[x]?.type)) ?? plan.seq.find((x) => plan.clauses[x]);
  const dropMods = (c, test) => { let hit = false; for (const [k, vs] of Object.entries(c.args)) c.args[k] = vs.map((v) => { const ps = splitTop(v), keep = ps.filter((p, i) => !i || !test(p)); if (keep.length < ps.length) hit = true; return keep.join("+"); }); return hit; };
  const each = (plan, f) => Object.values(plan.clauses).some(f);
  const OFF = [
    ["clause", (plan) => { const m = mainId(plan), others = plan.seq.filter((x) => plan.clauses[x] && x !== m); if (!others.length) return null; for (const x of others) delete plan.clauses[x]; plan.seq = [m, plan.seq.at(-1) === "?" ? "?" : plan.clauses[m].type === "IMP" ? "!" : "."]; return plan; }],
    ["relative", (plan) => { const rels = Object.keys(plan.clauses).filter((x) => plan.clauses[x].type === "REL"); if (!rels.length) return null; for (const x of rels) { delete plan.clauses[x]; each(plan, (c) => dropMods(c, (p) => p === `rel(${x})`)); } return plan; }],
    ["yes-no", (plan) => { const c = plan.clauses[mainId(plan)]; if (c?.type !== "YESNO") return null; c.type = "MAIN"; plan.seq = plan.seq.map((x) => (x === "?" ? "." : x)); return plan; }],
    ["wh", (plan) => { const c = plan.clauses[mainId(plan)]; if (c?.type !== "WH") return null; c.type = "MAIN"; delete c.args.wh; plan.seq = plan.seq.map((x) => (x === "?" ? "." : x)); return plan; }],
    ...["place", "manner", "time", "freq", "sentence", "conn", "pp", "because-of", "despite", "during", "instead-of"].map((k) => [k === "freq" ? "frequency" : k === "place" || k === "pp" ? "place" : k === "manner" ? "manner" : k === "time" ? "time" : "adjunct", (plan) => (each(plan, (c) => !!c.args[k]) ? (Object.values(plan.clauses).forEach((c) => delete c.args[k]), plan) : null)]),
    ["negation", (plan) => (each(plan, (c) => !!c.args.neg) ? (Object.values(plan.clauses).forEach((c) => delete c.args.neg), plan) : null)],
    ["negation", (plan) => { let hit = false; for (const c of Object.values(plan.clauses)) for (const [k, vs] of Object.entries(c.args)) c.args[k] = vs.map((v) => (/^no:/.test(v) ? ((hit = true), v.replace(/^no:/, "indef:")) : v)); return hit ? plan : null; }],
    ["modal", (plan) => (each(plan, (c) => !!c.args.modal) ? (Object.values(plan.clauses).forEach((c) => delete c.args.modal), plan) : null)],
    ["mood", (plan) => (each(plan, (c) => !!c.args.mood) ? (Object.values(plan.clauses).forEach((c) => delete c.args.mood), plan) : null)],
    ["tense", (plan) => (each(plan, (c) => c.args.tense && c.args.tense[0] !== "present") ? (Object.values(plan.clauses).forEach((c) => delete c.args.tense), plan) : null)],
    ["comparison", (plan) => (each(plan, (c) => dropMods(c, (p) => /^(comp|sup|than\(.*\)|so|as\(.*\))$/.test(p))) ? plan : null)],
    ["degree", (plan) => (each(plan, (c) => dropMods(c, (p) => p.startsWith("deg:"))) ? plan : null)],
    ["adjective-order", (plan) => { let hit = false; each(plan, (c) => { for (const [k, vs] of Object.entries(c.args)) c.args[k] = vs.map((v) => { const ps = splitTop(v), adjs = ps.filter((p) => p.startsWith("adj:")); if (adjs.length < 2) return v; hit = true; const last = adjs.at(-1); return ps.filter((p) => p !== last).join("+"); }); }); return hit ? plan : null; }],
    ["adjective", (plan) => { let hit = false; for (const c of Object.values(plan.clauses)) for (const k of Object.keys(c.args)) if (k !== "pred") { const one = { args: { [k]: c.args[k] } }; if (dropMods(one, (p) => p.startsWith("adj:"))) { c.args[k] = one.args[k]; hit = true; } } return hit ? plan : null; }],   // (not a predicate's: Das Haus ist groß)
    ["possessive", (plan) => { let hit = false; for (const c of Object.values(plan.clauses)) for (const [k, vs] of Object.entries(c.args)) c.args[k] = vs.map((v) => (/^poss\.[\w.]+:/.test(v) ? ((hit = true), v.replace(/^poss\.[\w.]+:/, "def:")) : v)); return hit ? plan : null; }],
    ["plural", (plan) => (each(plan, (c) => dropMods(c, (p) => p === "pl")) ? plan : null)],
  ];
  function unbuild(plan) {
    let cur = clone(plan), s = said(cur);
    if (!s) return null;
    const down = [{ plan: cur, said: s }];
    for (let more = true; more;) {
      more = false;
      for (const [name, off] of OFF) {
        const next = off(clone(cur)), ns = next && said(next);
        if (!ns || ns.text === down.at(-1).said.text) continue;
        down.at(-1).step = name; cur = next; down.push({ plan: cur, said: ns }); more = true;
        break;
      }
    }
    down.at(-1).step = "base";
    const up = down.reverse();
    return up.map((r, i) => ({ ...r, shows: i ? [...structuresOf(r.plan)].filter((x) => !structuresOf(up[i - 1].plan).has(x)) : [...structuresOf(r.plan)] }));
  }

  const targets = [...new Set(Object.values(SHOWS).flat())];
  return { ladder, sentence, unbuild, targets, stepFor, steps: ORDER };
}
