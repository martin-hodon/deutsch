// THE GRAMMAR STRUCTURES OF A PLAN: which features of the shared syllabus (world/syllabus.txt) a sentence's plan
// (world/CLAUSES.md) uses -- read from the plan alone, so the same in every language. The word-order exercise asks for
// a sentence with the structure chosen (the grammar page: Syntax), the overview shows each structure with an example.
//
//   structuresOf(plan) -> Set of feature names ("relative", "perfect", "that-because-if" ...)
//   structureList(syllabus) -> [{ name, stage, label }] in the syllabus's order -- the ones a plan shows (a feature with
//   no detector here, such as the articles every sentence has, is not offered)
//   labelOf(name) -> its label;  IMPLIED[name] -> the structures a sentence with it cannot help showing too (polite: modal and conditional)
//   await loadStructures(url) -> Map name -> [plan]: the declared EXAMPLE PLANS of world/structures.txt -- one or two
//   simple language-free plans a structure, each language's realizer says them: the sentence every structure has when
//   the planner finds none (engine/practice.js), the overview's examples, and which structures a language has at all
import { parseTests } from "./realize.js";

const LINKS = {
  basic: new Set(["that", "because", "when", "if", "whether"]),
  temporal: new Set(["before", "after", "while", "until", "as-soon-as", "as-long-as", "since"]),
  b2: new Set(["as-if", "by-doing", "with-result", "without-that", "instead-that"]),
};
const PRON = /^(1sg|2sg|3sg\.[mfn]|1pl|2pl|3pl|formal)$/;
const DIRECTED = /^(into|onto|to-side|under-to|above-to|behind-to|front-to|beside-to)$/;

// each detector: (clauses, seq, values) -> true when the plan has it; label: what the learner picks
const D = {
  present: { label: "present tense", is: (cs) => cs.some((c) => (tense(c) ?? "present") === "present" && c.type !== "INF") },   // (no tense: the present)
  predicate: { label: "be + adjective or noun", is: (cs) => cs.some((c) => arg(c, "pred")) },
  "name-age-clock": { label: "names, age, the time", is: (cs) => cs.some((c) => /^(age|clock|name):/.test(arg(c, "pred") ?? "")) },
  "yes-no": { label: "yes/no questions", is: (cs) => cs.some((c) => c.type === "YESNO") },
  "wh-basic": { label: "questions with a question word", is: (cs) => cs.some((c) => c.type === "WH") },
  negation: { label: "negation", is: (cs) => cs.some((c) => arg(c, "neg") === "yes") },
  coord: { label: "and, but, or between clauses", is: (cs, seq) => seq.some((x) => x === "and" || x === "but" || x === "or") },
  object: { label: "direct objects", is: (cs) => cs.some((c) => arg(c, "patient") && !PRON.test(arg(c, "patient"))) },
  "no-det": { label: "no / none (kein)", is: (cs, seq, vs) => vs.some((v) => /^no:/.test(v)) },
  possessive: { label: "possessives (my, your ...)", is: (cs, seq, vs) => vs.some((v) => /^poss\./.test(v)) },
  imperative: { label: "commands", is: (cs) => cs.some((c) => c.type === "IMP") },
  modal: { label: "modal verbs", is: (cs) => cs.some((c) => arg(c, "modal")) },
  "place-basic": { label: "prepositions of place", is: (cs) => cs.some((c) => all(c, "pp").some((p) => /^(in|at|on|from|with):/.test(p)) || /^(in|at|on):/.test(arg(c, "place") ?? "")) },
  "time-basic": { label: "days, months, the hour", is: (cs) => cs.some((c) => /^(on-day|in-period|at-hour):/.test(arg(c, "time") ?? "")) },
  "one-gladly-very": { label: "one, gladly, very", is: (cs, seq, vs) => cs.some((c) => arg(c, "subj") === "one" || all(c, "manner").includes("rád")) || vs.some((v) => /\+deg:/.test(v)) },
  "pron-obj": { label: "object pronouns", is: (cs) => cs.some((c) => PRON.test(arg(c, "patient") ?? "")) },
  perfect: { label: "the perfect", is: (cs) => cs.some((c) => tense(c) === "perfect") },
  recipient: { label: "indirect objects (to whom)", is: (cs) => cs.some((c) => arg(c, "recipient")) },
  direction: { label: "where to: into, onto ...", is: (cs) => cs.some((c) => all(c, "pp").some((p) => DIRECTED.test(p.split(":")[0]))) },
  "adjective-order": { label: "two adjectives: their order", is: (cs, seq, vs) => vs.some((v) => (v.match(/\+adj:/g) ?? []).length >= 2) },
  frequency: { label: "how often: always, often, sometimes", is: (cs) => cs.some((c) => arg(c, "freq")) },
  manner: { label: "how: quickly, quietly, carefully", is: (cs) => cs.some((c) => arg(c, "manner") && arg(c, "manner") !== "rád") },
  "adverb-order": { label: "time, manner, place together: their order", is: (cs) => cs.some((c) => ["time", "freq", "manner", "place"].filter((k) => arg(c, k)).length >= 2) },
  adjective: { label: "adjectives before nouns", is: (cs, seq, vs) => cs.some((c) => Object.entries(c.args).some(([k, xs]) => k !== "pred" && xs.some((v) => /\+adj:/.test(v)))) },
  comparison: { label: "comparison (bigger, the biggest)", is: (cs, seq, vs) => vs.some((v) => /\+(comp|sup)\b/.test(v)) },
  "that-because-if": { label: "that, because, if clauses", is: (cs) => cs.some((c) => c.type === "SUB" && LINKS.basic.has(arg(c, "link"))) },
  connectives: { label: "therefore, still, then", is: (cs) => cs.some((c) => arg(c, "conn")) },
  for: { label: "for (denn) between clauses", is: (cs, seq) => seq.includes("for") },
  polite: { label: "polite wishes and requests", is: (cs) => !cs.some((c) => arg(c, "link") === "if-unreal") && cs.some((c) => arg(c, "mood") === "hypo" && (arg(c, "modal") || all(c, "manner").includes("rád"))) },
  which: { label: "which, what kind, how many", is: (cs) => cs.some((c) => /^(which|what-kind|how-many):/.test(arg(c, "wh") ?? "")) },
  indefinite: { label: "something, nothing, someone", is: (cs, seq, vs) => vs.some((v) => /^(something|nothing|someone|noone|everything)\b/.test(v)) },
  "time-phrases": { label: "last week, every day, since ...", is: (cs) => cs.some((c) => /^(last|next|every|since|ago|date|in-time):/.test(arg(c, "time") ?? "")) },
  "when-past": { label: "when (in the past)", is: (cs) => cs.some((c) => arg(c, "link") === "when-past") },
  quantifiers: { label: "all, many, every", is: (cs, seq, vs) => vs.some((v) => /^(all|many|every):/.test(v)) },
  past: { label: "the simple past", is: (cs) => cs.some((c) => tense(c) === "past") },
  pluperfect: { label: "the pluperfect", is: (cs) => cs.some((c) => tense(c) === "pluperfect") },
  future: { label: "the future", is: (cs) => cs.some((c) => tense(c) === "future") },
  relative: { label: "relative clauses", is: (cs) => cs.some((c) => c.type === "REL") },
  "relative-prep": { label: "relative clauses after a preposition", is: (cs) => cs.some((c) => c.type === "REL" && !/^(subj|patient|recipient|owner|where|what)$/.test(arg(c, "relrole") ?? "subj")) },
  infinitive: { label: "infinitive clauses (to do)", is: (cs) => cs.some((c) => c.type === "INF" && !arg(c, "link")) },
  purpose: { label: "in order to", is: (cs) => cs.some((c) => arg(c, "link") === "purpose") },
  conditional: { label: "unreal conditions and wishes", is: (cs) => cs.some((c) => arg(c, "mood") === "hypo") },
  indirect: { label: "indirect questions", is: (cs) => cs.some((c) => c.type === "SUB" && (arg(c, "wh") || arg(c, "link") === "whether")) },
  "although-so-that": { label: "although, so that", is: (cs) => cs.some((c) => /^(although|so-that)$/.test(arg(c, "link") ?? "")) },
  temporal: { label: "before, while, until ...", is: (cs) => cs.some((c) => LINKS.temporal.has(arg(c, "link"))) },
  owner: { label: "whose: the father's car", is: (cs, seq, vs) => vs.some((v) => /\+owner\(/.test(v)) },
  causative: { label: "let, see, hear + infinitive", is: (cs) => cs.some((c) => arg(c, "inf")) },
  passive: { label: "the passive", is: (cs) => cs.some((c) => arg(c, "voice") === "passive") },
  paired: { label: "both ... and, neither ... nor", is: (cs, seq, vs) => vs.some((v) => /\+pair\((both-and|neither-nor|not-only-but-also|either-or)/.test(v)) || seq.includes("either") || seq.includes("admittedly") },
  "cause-phrases": { label: "because of, despite, during", is: (cs) => cs.some((c) => ["because-of", "despite", "during", "instead-of"].some((k) => arg(c, k))) },
  "conditional-past": { label: "unreal past (would have)", is: (cs) => cs.some((c) => arg(c, "mood") === "hypo" && /^(perfect|pluperfect)$/.test(tense(c) ?? "")) },
  "without-instead": { label: "without / instead of doing", is: (cs) => cs.some((c) => /^(without|instead)$/.test(arg(c, "link") ?? "")) },
  "quantifiers-more": { label: "some, both, few, several", is: (cs, seq, vs) => vs.some((v) => /^(some|both|few|several):/.test(v)) },
  "subject-drop": { label: "the subject left out after and", is: (cs) => cs.some((c) => arg(c, "drop") === "yes") },
  "indefinite-adj": { label: "something new, nothing special", is: (cs, seq, vs) => vs.some((v) => /^(something|nothing)\+adj:/.test(v)) },
  "negation-more": { label: "no more, not yet, not at all", is: (cs, seq, vs) => cs.some((c) => /^(no-more|not-yet|not-at-all)$/.test(arg(c, "neg") ?? "")) || vs.some((v) => /\+pair\(not-but/.test(v)) },
  idioms: { label: "verb + noun phrases", is: (cs) => cs.some((c) => arg(c, "fixed") || arg(c, "bare")) },
  "passive-more": { label: "more passives (has been done, is done)", is: (cs) => cs.some((c) => arg(c, "voice") === "state" || (arg(c, "voice") === "passive" && (arg(c, "modal") || /^(perfect|pluperfect)$/.test(tense(c) ?? "")))) },
  "modal-perfect": { label: "modals in the perfect", is: (cs) => cs.some((c) => arg(c, "modal") && tense(c) === "perfect") },
  reported: { label: "reported speech", is: (cs) => cs.some((c) => c.type === "REP" || arg(c, "mood") === "reported") },
  "relative-more": { label: "whose, where, what (relative)", is: (cs) => cs.some((c) => c.type === "REL" && /^(owner|where|what)$/.test(arg(c, "relrole") ?? "")) },
  "clauses-b2": { label: "as if, by doing, so that", is: (cs) => cs.some((c) => LINKS.b2.has(arg(c, "link"))) },
  "so-that-the-more": { label: "the more ..., the more", is: (cs) => cs.some((c) => /^the-more/.test(arg(c, "link") ?? "")) },
  participle: { label: "participles as adjectives", is: (cs, seq, vs) => vs.some((v) => /\+part\(/.test(v)) },
  "be-to": { label: "is to be done, seems to", is: (cs) => cs.some((c) => arg(c, "voice") === "seinzu" || arg(c, "raise")) },
  "can-be-done": { label: "can be done (lässt sich)", is: (cs) => cs.some((c) => arg(c, "voice") === "sichlassen") },
  "future-perfect": { label: "the future perfect", is: (cs) => cs.some((c) => tense(c) === "future2") },
  nominal: { label: "verbs as nouns (the reading)", is: (cs, seq, vs) => vs.some((v) => /:@/.test(v)) },
  "passive-subj2": { label: "unreal passive", is: (cs) => cs.some((c) => arg(c, "voice") === "passive" && arg(c, "mood") === "hypo") },
  "free-relative": { label: "whoever ..., (he) ...", is: (cs) => cs.some((c) => c.type === "WHOEVER") },
};
const arg = (c, k) => c.args[k]?.[0];
const all = (c, k) => c.args[k] ?? [];
const tense = (c) => arg(c, "tense");

export function structuresOf(plan) {
  const cs = Object.values(plan.clauses), seq = plan.seq ?? [];
  const vs = cs.flatMap((c) => Object.values(c.args).flat().filter((v) => typeof v === "string"));
  return new Set(Object.keys(D).filter((k) => { try { return D[k].is(cs, seq, vs); } catch { return false; } }));
}

// a structure's label: what the learner picks (the name itself when it has none)
export const labelOf = (name) => D[name]?.label ?? name;

// the structures in the syllabus's order, each with its stage (A1.1 ...): `syllabus` world/syllabus.txt's text
export function structureList(syllabus) {
  const out = [];
  for (const m of syllabus.matchAll(/^FEATURE (\S+) (\S+)/gm)) if (D[m[2]]) out.push({ name: m[2], stage: m[1], label: D[m[2]].label });
  return out;
}

// what a structure brings with it: a sentence showing the first shows these too (a polite request is a modal in the
// Konjunktiv II; an indirect yes/no question is a subordinate clause with whether) -- not counted against it in focus
export const IMPLIED = {
  polite: ["modal", "conditional", "yes-no"], "adjective-order": ["adjective"], "time-phrases": ["quantifiers"], which: ["wh-basic"], indirect: ["that-because-if"], "when-past": ["past"],
  pluperfect: ["temporal", "past", "perfect"], connectives: ["coord"], "subject-drop": ["coord"],
  "relative-prep": ["relative"], "relative-more": ["relative"], "indefinite-adj": ["indefinite", "adjective"],
  "negation-more": ["negation"], "so-that-the-more": ["comparison"], "modal-perfect": ["modal", "perfect"],
  "passive-more": ["passive", "modal", "perfect"], "conditional-past": ["conditional", "perfect", "pluperfect"],
  "passive-subj2": ["passive", "conditional", "perfect", "conditional-past", "passive-more"], paired: ["negation"],
};

// the declared example plans (world/structures.txt): `name [-lang ...]` lines, each with its plan under it, as the tests
// are written; `-ru -zh`: a language that does not say this plan (its realizer has no such construction, or says it
// wrong) -- `not` lists them, so that language is not offered the structure through this plan
export async function loadStructures(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const out = new Map();
  for (const t of parseTests(await response.text())) {
    const [name, ...flags] = t.target.split(/\s+/);
    if (!D[name]) throw new Error(`structures: no structure ${name}`);
    (out.get(name) ?? out.set(name, []).get(name)).push({ seq: t.seq, clauses: t.clauses, note: t.note, not: flags.filter((f) => f.startsWith("-")).map((f) => f.slice(1)) });
  }
  return out;
}
