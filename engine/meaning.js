// MEANING: what words are and what they ask for -- the category graph (world/categories.txt) and the CONCEPTS'
// annotations (world/meaning.tsv, compiled from world/meaning/ by tools/compile.py). A word means its concept (e.concept,
// its Slovak ID): every word of a concept, in any language, has the concept's annotation. A word FITS a category when
// one of its concept's categories is that one or lies under it (fruit -> food -> consumable: a banana fits `food`).
//
//   const m = await loadMeaning("world/categories.txt", "world/meaning.tsv", dict)
//   m.fits(entry, "food")       does this noun fit
//   m.nouns("food")             every noun that does (cached)
//   m.frames(verb)              [{ subj: "animal" | "es", slots: [{ role: "patient"|"theme"|...|"that"|"inf"|"adj", cat }] }]
//                               (a language marks the roles its way: de/frames.js)
//   m.describes(adjective, noun), m.describesCat(adjective, "person"), m.adverbKind(entry), m.isA("fruit", "food")
//   the graph itself (the dictionary's category tree): m.parentsOf(c), m.childrenOf(c), m.conceptOf(c) -> { pos, concept }
//   of the concept naming it (categories.txt `= POS id`), m.categoryOf(entry), m.isAffordance(c), m.direct(c) -> its nouns

export async function loadMeaning(categoriesUrl, tsvUrl, dict) {
  // the graph: each category's parents, then each one's ANCESTORS (itself included), once
  const parents = new Map(), names = new Map(), directive = {};
  for (const line of (await (await fetch(categoriesUrl)).text()).split("\n")) {
    const s = line.split("--")[0].trim();
    if (!s || s.startsWith("#")) continue;
    const d = s.match(/^([A-Z]+):\s*(.*)$/);   // (BUCKET, CLOSED: categories.txt's directives)
    if (d) { directive[d[1]] = d[2].split(/\s+/).filter(Boolean); continue; }
    const [name, rest = ""] = s.split(":"), [ps, named] = rest.split("=");   // (`= POS id`: the concept naming the category)
    parents.set(name.trim(), ps.split(",").map((p) => p.trim()).filter(Boolean));
    if (named?.trim()) { const m = named.trim().match(/^(?:([A-Z]+) )?(.+)$/); names.set(name.trim(), { pos: m[1] ?? "N", concept: m[2] }); }
  }
  const ancestors = new Map();
  const up = (c) => {
    if (ancestors.has(c)) return ancestors.get(c);
    const set = new Set([c]);
    for (const p of parents.get(c) ?? []) for (const a of up(p)) set.add(a);
    ancestors.set(c, set);
    return set;
  };
  const isA = (c, ancestor) => up(c).has(ancestor);

  // the annotations, on the concepts (pos|ID) -- an entry's is its concept's
  const byConcept = new Map();   // pos|ID -> the dictionary's entries of that concept
  for (const e of dict.entries) { const k = `${e.pos}|${e.concept}`; if (!byConcept.has(k)) byConcept.set(k, []); byConcept.get(k).push(e); }
  const annC = new Map();   // pos|ID -> { cats } | { spec, attr } (AN) | { kind, tags } | { frames: [...] }
  const ann = { get: (e) => (e ? annC.get(`${e.pos}|${e.concept}`) : undefined), has: (e) => !!e && annC.has(`${e.pos}|${e.concept}`) };
  // a SPEC: categories with exclusions (`person, food, -national`): { pos: [...], not: [...] }
  // ... and requirements (`object +openable`: an affordance it must have too)
  const spec = (tokens) => ({ pos: tokens.filter((t) => !"-+".includes(t[0])), not: tokens.filter((t) => t[0] === "-").map((t) => t.slice(1)), need: tokens.filter((t) => t[0] === "+").map((t) => t.slice(1)) });
  const rows = (await (await fetch(tsvUrl)).text()).trim().split("\n").slice(1);
  for (const row of rows) {
    const [pos, id, cats, subj, slots] = row.split("\t");
    const key = `${pos}|${id}`;
    const a = annC.get(key) ?? {};
    // (a frame's subject and slots: one category, maybe exclusions after it -- `person -child`, `A thing -money`)
    // (`{pes|líška}`: these concepts only -- `words`; its category, for the rest of the planner: the first one's)
    const one = (t) => {
      if (t.startsWith("{")) { const words = t.slice(1, -1).split("|"); return { cat: null, not: [], need: [], words }; }
      const s = spec(t.split(" ")); return { cat: s.pos[0], not: s.not, need: s.need, words: null };
    };
    if (pos === "V") {
      const s = one(subj);
      (a.frames ??= []).push({ subj: s.cat, subjNot: s.not, subjNeed: s.need, subjWords: s.words, slots: slots ? slots.split(";").map((x) => {
        // (role|category -- split at the first bar only: a list {dôvod|meno} has bars of its own)
        const i = x.indexOf("|"), role = x.slice(0, i), cat = x.slice(i + 1);
        const c = cat ? one(cat) : { cat: null, not: [], need: [], words: null };
        return { role, cat: c.cat, not: c.not, need: c.need, words: c.words, spec: cat };   // (spec: as written -- a language may mark a role by it)
      }) : [] });
    } else if (pos === "AV") { a.kind = cats; a.tags = subj ? subj.split(",") : null; }
    else if (pos === "AN") {   // (categories; `{manželstvo|čas}` these concepts too, `-{obeť}` not these)
      const t = cats.split(","), named = (x) => new Set(x.flatMap((w) => w.replace(/^-?\{|\}$/g, "").split("|")));
      a.spec = { ...spec(t.filter((x) => !x.replace(/^-/, "").startsWith("{"))), words: named(t.filter((x) => x.startsWith("{"))), notWords: named(t.filter((x) => x.startsWith("-{"))) };
      a.cats = a.spec.pos; a.attr = (subj ?? "").split(",").includes("attr"); a.pred = (subj ?? "").split(",").includes("pred");
    }
    else { a.cats = cats.split(","); a.flags = subj ? subj.split(",") : []; }
    annC.set(key, a);
  }

  // (a list's concepts -> their words; its category: its first noun's first one -- resolved once the annotations are read)
  const of = (pos, ids) => ids.flatMap((id) => byConcept.get(`${pos}|${id}`) ?? []);
  const resolveWords = () => {
    for (const a of annC.values()) for (const f of a.frames ?? []) for (const s of [f, ...f.slots]) {
      const words = s === f ? f.subjWords : s.words;
      if (!words) continue;
      if (s !== f && (s.role === "inf.bare" || s.role === "inf.obj")) { s.words = of("V", words); continue; }   // (verbs)
      if (s !== f && s.role === "fixed") { s.words = words.map((w) => w.replace(/ /g, "_")); s.cat = null; continue; }   // (concepts, said by each language's frames)
      const nouns = of("N", words), cat = ann.get(nouns[0])?.cats?.[0] ?? "entity";
      if (s === f) { f.subj = cat; f.subjWords = nouns; } else { s.cat = cat; s.words = nouns; }
    }
  };
  resolveWords();
  // (a "category" may name nouns -- concepts or a language's words: `{človek|osoba}`, `{Mensch}`; in an exclusion,
  //  `-{človek}`: not these; a listed noun's feminine counts as listed: {Lehrer} -> Lehrerin)
  const named = (words, e) => words.includes(e.concept) || words.includes(e.word) || (e.word.endsWith("in") && words.includes(e.word.slice(0, -2)));
  const fits = (e, cat) => (cat[0] === "{" ? named(cat.slice(1, -1).split("|"), e) : (ann.get(e)?.cats ?? []).some((c) => isA(c, cat)));
  // an adjective reaches a noun of a CLOSED category (a person, a text, money) only by naming it or one under it
  const closed = directive.CLOSED ?? [];
  const opens = (s, noun) => closed.every((k) => !fits(noun, k) || s.pos.some((c) => isA(c, k)));
  // THE ONE CHECK of a noun against categories with exclusions: one of them, none of the excluded
  const fitsAll = (e, cats, not = [], need = []) => cats.some((c) => fits(e, c)) && !not.some((c) => fits(e, c)) && need.every((c) => fits(e, c));
  // ... a frame's subject or slot (s: { cat, not, need, words }): a word list's words, or the categories
  const fitsSlot = (e, s) => (s.words ? s.words.includes(e) || (e.word.endsWith("in") && s.words.some((w) => w.word === e.word.slice(0, -2))) : fitsAll(e, [s.cat], s.not, s.need));
  const nounCache = new Map();
  const nouns = (cat) => {
    if (!nounCache.has(cat)) nounCache.set(cat, dict.entries.filter((e) => e.pos === "N" && fits(e, cat)));
    return nounCache.get(cat);
  };
  return {
    isA, fits, nouns,
    categories: () => [...parents.keys()],
    // the graph for the dictionary: a category's parents and children, the concept that names it (`= POS id`), whether it
    // is an affordance (what one can do with a thing: the AFFORDANCE directive), the nouns in it directly (not under it)
    parentsOf: (c) => parents.get(c) ?? [],
    childrenOf: (c) => [...parents].filter(([, ps]) => ps.includes(c)).map(([k]) => k),
    conceptOf: (c) => names.get(c) ?? null,
    categoryOf: (e) => [...names].find(([, v]) => v.pos === e.pos && v.concept === e.concept)?.[0] ?? null,
    isAffordance: (c) => (directive.AFFORDANCE ?? []).includes(c),
    direct: (cat) => dict.entries.filter((e) => e.pos === "N" && (ann.get(e)?.cats ?? []).includes(cat)),
    catsOf: (e) => ann.get(e)?.cats ?? [],
    frames: (v) => ann.get(v)?.frames ?? [],
    // an adjective describes a noun when the noun fits one of the categories it is for
    fitsAll, fitsSlot,
    // a noun fits `cat` in the sense a slot took it (its categories under the slot's: Geflügel as meat, not livestock)
    fitsIn: (e, slotCat, cat) => (ann.get(e)?.cats ?? []).filter((c) => !slotCat || isA(c, slotCat)).some((c) => isA(c, cat)),
    describes: (adj, noun) => { const s = ann.get(adj)?.spec; return !!s && !s.notWords.has(noun.concept) && (s.words.has(noun.concept) || (fitsAll(noun, s.pos, s.not) && opens(s, noun))); },
    // ... the noun in one sense: its categories under the one a slot asked for (Pass as a document)
    describesIn: (adj, noun, cat) => {
      const s = ann.get(adj)?.spec, ns = (ann.get(noun)?.cats ?? []).filter((c) => isA(c, cat));
      if (!s || s.notWords.has(noun.concept)) return false;
      return s.words.has(noun.concept) || (s.pos.some((a) => ns.some((c) => isA(c, a))) && !s.not.some((x) => fits(noun, x)) && opens(s, noun));
    },
    describesCat: (adj, cat) => { const s = ann.get(adj)?.spec; return !!s && s.pos.some((c) => isA(cat, c)) && !s.not.some((x) => isA(cat, x)) && closed.every((k) => !isA(cat, k) || s.pos.some((c) => isA(c, k))); },
    attributiveOnly: (adj) => !!ann.get(adj)?.attr,
    predicativeOnly: (adj) => !!ann.get(adj)?.pred,
    flag: (noun, f) => !!ann.get(noun)?.flags?.includes(f),   // (a noun's: mass, auf)   // (whatever of `cat` it is said of: a pronoun's person)
    adverbKind: (e) => ann.get(e)?.kind ?? null,
    adverbTenses: (e) => { const a = ann.get(e), t = (a?.kind === "time" || a?.kind === "sentence") && a.tags?.filter((x) => x !== "ind"); return t?.length ? t : null; },   // (a time or sentence adverb's tenses: damals past, perfect; null: any)
    adverbIndicative: (e) => !!ann.get(e)?.tags?.includes("ind"),   // (a sentence adverb not in Konjunktiv: hoffentlich)
    adverbSubject: (e) => (ann.get(e)?.kind === "manner" ? ann.get(e)?.tags?.[0] : null),   // (a manner adverb's subject: gern a person; null: an agent)
    annotated: (e) => ann.has(e),
  };
}
