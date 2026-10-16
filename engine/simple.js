// SIMPLE SENTENCES: a short sentence that shows one word, for the vocabulary exercises -- light and quick, from data:
// a pattern (world/simple.txt), the word's frame (world/meaning: its roles and their categories), the commonest nouns
// that fit, said by the language's realizer. No planner, no scenes, no syllabus (those are engine/sentences.js's, for
// the grammar exercises and the stories).
//
//   const sg = await createSimple({ dict, meaning, say })     dict: the language's (data.js); meaning: engine/meaning.js
//                                                              on that dictionary; say(plan) -> { text, tokens, ipa }
//   sg.can(entry)            can a sentence show this word (the world tells of its concept)
//   sg.sentence(entry)       -> { plan, said } | null   (a pattern that fits, filled; null when none could be)
import { parseTests } from "./realize.js";
import { ROLES } from "./lexicon.js";

const SKIP = new Set(["that", "whether", "inf", "inf.bare", "inf.obj", "inf.subj", "name", "age", "clock", "refl"]);   // (slots a simple sentence has not)
const PRON = ["1sg", "2sg", "3sg.m", "3sg.f", "1pl", "3pl"], ASK = ["2sg", "2sg", "2pl", "formal"], OBJ = ["3sg.m", "3sg.f", "1sg", "1pl"];
const ADV_KEY = { time: "time", frequency: "freq", manner: "manner", place: "place", sentence: "sentence" };
const END = { YESNO: "?", WH: "?", IMP: "!" };
const COMMON = 2;   // (the fillers -- nouns, adjectives, verbs around the word shown -- of FREQ 1 or 2)

// the patterns: [{ pos, type, only, text, weight }]
function parsePatterns(src) {
  const out = [];
  for (const raw of src.split("\n")) {
    const s = raw.split(/\s--\s|^#.*/)[0].trim();
    if (!s || s.startsWith("#")) continue;
    const m = s.match(/^(V|N|AN|AV)\s+(\w+)\s+(?:only (\w+)\s+)?(.*?)\s*(?:\{(\d+)\})?$/);
    if (!m) throw new Error(`simple.txt: cannot read "${s}"`);
    out.push({ pos: m[1], type: m[2], only: m[3] ?? null, text: m[4], weight: Number(m[5] ?? 1) });
  }
  return out;
}

export async function createSimple({ dict, meaning, say, base = "", rnd = Math.random }) {
  const patterns = parsePatterns(await (await fetch(base + "world/simple.txt")).text());
  // (two of the world's word lists -- world/lists.txt: adjectives no degree word goes with, adjectives left alone)
  const lists = await (await fetch(base + "world/lists.txt")).text(), listOf = (n) => new Set((lists.match(new RegExp(`^WORDS ${n.replace(".", "\\.")}: (.*)$`, "m"))?.[1] ?? "").split("|").map((x) => x.trim().replace(/\s*\{[\d.]+\}$/, "").replace(/_/g, " ")).filter(Boolean));
  const UNGRADABLE = listOf("adj.ungradable"), UNUSED = listOf("adj.not-used");
  const pick = (l) => l[Math.floor(rnd() * l.length)];
  const weighted = (l, w) => { let r = rnd() * l.reduce((t, x) => t + w(x), 0); for (const x of l) if ((r -= w(x)) < 0) return x; return l[l.length - 1]; };
  const byFreq = (e) => (e.freq <= 1 ? 3 : 1);   // (the commonest nouns likelier)
  const common = (e) => e.freq <= COMMON;
  const isPerson = (cat) => !!cat && (cat === "agent" || meaning.isA(cat, "person"));
  const personNoun = (e) => meaning.fits(e, "person");
  const countable = (e) => !meaning.flag(e, "mass") && e.plural !== "-" && e.plural !== "PL";

  // ---- the words that fit ---------------------------------------------------------------------------------------------
  // the common nouns a slot takes (its word list, else its category less its exclusions)
  const nounsFor = (slot, not = null) => (slot.words ?? meaning.nouns(slot.cat ?? "entity")).filter((e) => e.pos === "N" && common(e) && e !== not && meaning.fitsSlot(e, slot));
  const subjSlot = (f) => ({ cat: f.subj, not: f.subjNot, need: f.subjNeed, words: f.subjWords });
  // the common adjectives that describe a noun, the common nouns an adjective describes (cached by concept)
  const cache = new Map(), cached = (k, make) => cache.get(k) ?? cache.set(k, make()).get(k);
  const adjsFor = (noun) => cached(`adj|${noun.concept}`, () => dict.entries.filter((e) => e.pos === "AN" && common(e) && !meaning.attributiveOnly(e) && !UNUSED.has(e.concept) && meaning.describes(e, noun)));
  const nounsOf = (adj) => cached(`noun|${adj.concept}`, () => dict.entries.filter((e) => e.pos === "N" && common(e) && meaning.describes(adj, e)));
  const verbs = cached("verbs", () => dict.entries.filter((e) => e.pos === "V" && common(e) && meaning.frames(e).length));

  // ---- a frame, filled --------------------------------------------------------------------------------------------------
  const usable = (f) => f.subj !== "es" && f.subj !== "das" && f.slots.length <= 3 && f.slots.every((s) => !SKIP.has(s.role));
  // a noun phrase for a role: the definite mostly; a thing done something to now and then indefinite or plural; stuff
  // (mass) bare as an object
  function np(e, role, mods = "") {
    const cid = e.cid, r = rnd();
    if (!countable(e)) return `${role === "patient" && r < .6 ? "none" : "def"}:${cid}${mods}`;
    if (role === "patient" || role === "theme") return `${r < .55 ? "def" : r < .8 ? "indef" : "def"}:${cid}${r >= .8 ? "+pl" : ""}${mods}`;
    return `${r < .85 ? "def" : "def"}:${cid}${r >= .85 ? "+pl" : ""}${mods}`;
  }
  // the subject: a person mostly a pronoun (2sg in a question), else a common noun of the frame's category
  function subject(f, { ask = false, taken = null } = {}) {
    if (!f.subjWords && isPerson(f.subj) && (ask || rnd() < .65)) return { v: pick(ask ? ASK : PRON), person: true };
    const ns = nounsFor(subjSlot(f), taken);
    if (!ns.length) return null;
    const e = weighted(ns, byFreq);
    return { v: np(e, "subj"), noun: e, person: personNoun(e) };
  }
  // the frame's slots -> `role=value` parts; `fill`: a slot the word shown takes (its index) and its value
  function slots(f, subj, fill = null, taken = null) {
    const parts = [];
    for (const [i, s] of f.slots.entries()) {
      if (fill && fill.i === i) { parts.push(`${s.role === "bare" ? "bare" : s.role}=${fill.v}`); continue; }
      if (s.role === "fixed") { parts.push(`fixed=${s.words?.[0] ?? ""}`); continue; }
      if (s.role === "adj") {
        const subjNoun = subj.noun, adjs = subjNoun ? adjsFor(subjNoun) : dict.entries.filter((e) => e.pos === "AN" && common(e) && !meaning.attributiveOnly(e) && meaning.describesCat(e, "person"));
        if (!adjs.length) return null;
        parts.push(`pred=adj:${pick(adjs).cid}`); continue;
      }
      if (s.role === "pred") { const ns = nounsFor(s, taken); if (!ns.length) return null; const e = weighted(ns, byFreq); parts.push(`pred=${meaning.fits(e, "professional") ? "none" : "indef"}:${e.cid}`); continue; }
      if (!ROLES.has(s.role)) return null;
      if (s.role === "bare") { const ns = nounsFor(s, taken); if (!ns.length) return null; parts.push(`bare=none:${weighted(ns, byFreq).cid}`); continue; }
      // (a person done something to: now and then a pronoun -- sees him, helps her)
      if (s.cat && isPerson(s.cat) && !s.words && rnd() < .35) { parts.push(`${s.role}=${pick(OBJ.filter((p) => p !== subj.v))}`); continue; }
      const ns = nounsFor(s, taken);
      if (!ns.length) return null;
      parts.push(`${s.role}=${np(weighted(ns, byFreq), s.role)}`);
    }
    return parts;
  }
  const frameText = (verb, f, subj, parts) => [`verb=${verb.cid}`, `subj=${subj.v}`, ...parts].join(" ");

  // a verb's own frame (the word shown is the verb); `person`: its subject must be a person (a question asks "you", a
  // modal wants someone who wants or must)
  function verbFrame(entry, { ask, person }) {
    const fs = meaning.frames(entry).filter(usable).filter((f) => !person || isPerson(f.subj));
    if (!fs.length) return null;
    for (let t = 0; t < 4; t++) {
      const f = weighted(fs, (x) => 1 / (1 + x.slots.length)), subj = subject(f, { ask });
      if (!subj) continue;
      const parts = slots(f, subj);
      if (parts) return frameText(entry, f, subj, parts);
    }
    return null;
  }
  // a frame with the noun in it (as its subject, or in a slot): a common verb whose frame takes it -- `mods` on the noun
  // (+adj:X for an adjective shown)
  function nounFrame(noun, mods, { ask, person }) {
    const start = Math.floor(rnd() * verbs.length), nounIsPerson = personNoun(noun);
    for (let k = 0; k < Math.min(verbs.length, 400); k++) {
      const verb = verbs[(start + k) % verbs.length];
      for (const f of meaning.frames(verb)) {
        if (!usable(f) || (person && !isPerson(f.subj))) continue;
        const canSubj = meaning.fitsSlot(noun, subjSlot(f)) && (!(ask || person) || nounIsPerson);
        const asSubj = canSubj && !ask && rnd() < .5;
        const i = f.slots.findIndex((s) => (ROLES.has(s.role) || s.role === "bare") && meaning.fitsSlot(noun, s));
        if (!asSubj && i < 0 && !canSubj) continue;
        const inSubj = asSubj || i < 0;
        const subj = inSubj ? { v: np(noun, "subj", mods), noun, person: personNoun(noun) } : subject(f, { ask, taken: noun });
        if (!subj) continue;
        const fill = inSubj ? null : { i, v: f.slots[i].role === "bare" ? `none:${noun.cid}${mods}` : np(noun, f.slots[i].role, mods) };
        const parts = slots(f, subj, fill, noun);
        if (parts) return frameText(verb, f, subj, parts);
      }
    }
    return null;
  }
  // an everyday verb of a person for an adverb: a frame with a person subject and at most one slot
  function anyFrame({ ask }) {
    for (let t = 0; t < 30; t++) {
      const verb = pick(verbs), fs = meaning.frames(verb).filter((f) => usable(f) && isPerson(f.subj) && f.slots.length <= 1 && !f.subjWords);
      if (!fs.length) continue;
      const f = pick(fs), subj = subject(f, { ask }), parts = subj && slots(f, subj);
      if (parts) return frameText(verb, f, subj, parts);
    }
    return null;
  }

  // ---- a pattern, filled for the word shown ---------------------------------------------------------------------------
  function fill(p, entry) {
    const ask = p.type === "YESNO", person = p.only === "person" || /\bmodal=/.test(p.text);
    let text = p.text.replace(/\{([^}]+)\}/g, (_, alts) => pick(alts.split("|")));
    if (p.only === "thing" && !meaning.fits(entry, "thing")) return null;
    if (person && entry.pos === "N" && !personNoun(entry)) return null;
    let noun = null;
    if (entry.pos === "AN") { const ns = nounsOf(entry); if (!ns.length) return null; noun = weighted(ns, byFreq); }
    if (entry.pos === "AV") {
      const key = ADV_KEY[meaning.adverbKind(entry)], tenses = meaning.adverbTenses(entry), tense = text.match(/tense=(\w+)/)?.[1];
      if (!key) return null;
      if (tenses && tense && !tenses.includes(tense)) text = text.replace(/tense=\w+/, `tense=${tenses[0]}`);   // (sofort: the future)
      text = text.replace("$AVKEY", key);
    }
    if (text.includes("$FRAME")) {
      const frame = entry.pos === "V" ? verbFrame(entry, { ask, person }) : entry.pos === "N" ? nounFrame(entry, "", { ask, person }) : entry.pos === "AN" ? nounFrame(noun, `+adj:${entry.cid}`, { ask, person }) : anyFrame({ ask });
      if (!frame) return null;
      text = text.replace("$FRAME", frame);
    }
    if (text.includes("$ADJ")) { const adjs = adjsFor(entry); if (!adjs.length) return null; text = text.replace("$ADJ", pick(adjs).cid); }
    if (entry.pos === "AN" && UNGRADABLE.has(entry.concept)) text = text.replace(/\+deg:\w+/, "");   // (no "very red")
    text = text.replace(/\$(NOUN|N|AN|AV)\b/g, (_, k) => (k === "NOUN" ? noun.cid : entry.cid));
    if (text.includes("$")) return null;
    return parseTests(`x\n  S: 1 ${END[p.type] ?? "."}\n  1 ${p.type} ${text}`)[0];
  }

  const can = (entry) => (entry.pos === "AV" ? !!ADV_KEY[meaning.adverbKind(entry)] : entry.pos === "V" ? meaning.frames(entry).some(usable) : meaning.annotated(entry));
  function sentence(entry) {
    const mine = patterns.filter((p) => p.pos === entry.pos);
    for (let t = 0; t < 6 && mine.length; t++) {
      const p = weighted(mine, (x) => x.weight);
      let plan, said;
      try { plan = fill(p, entry); if (!plan) continue; said = say(plan); } catch { continue; }   // (a word the language has no word for, a frame it cannot say)
      if (said?.text) return { plan, said };
    }
    return null;
  }
  return { can, sentence, patterns };
}
