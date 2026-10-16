// HOW GERMAN SAYS A FRAME (DESIGN.md): the world's frames name their slots by ROLES (world/roles.txt); German marks
// each role by a case or a preposition -- per word where it is its own (de/rules/frames.txt: `warten = čakať : theme
// auf A`), else by the role's default (de/rules/roles.txt: recipient D). A German frame may also be reflexive in a
// sense (`sich`, `sich D`) or carry fixed words (`={leid}`: es tut mir leid) -- German's own, not the world's. A
// word that marks one role two ways names each way's category: `bleiben = zostať : location bei D [person]`.
//
//   const G = await loadFrames("de/rules/frames.txt", "de/rules/roles.txt", dict, meaning)
//   G.frames(entry, worldFrames) -> the frames with German slots: [{ ...frame, slots: [{ prep, kase, cat, not, need, words, role }] }]
//   G.mark(verb, role, noun, roles) -> its German marking ("auf A", "D" ...); G.isRole(key) -- a role's name

const PERSON = { person: true };   // (a person said by a pronoun: mark's noun when there is no noun)
const CLAUSE = { that: "dass", whether: "ob", inf: "zu", "inf.subj": "zu.subj", "inf.bare": "inf", "inf.obj": "inf.obj" };

// a marking -> { prep, kase }: `auf A`, `D`, `A0`, `dass`, `zu` ...
function mark(m) {
  const t = m.trim().split(/\s+/);
  if (t.length === 2) return { prep: t[0], kase: t[1] };
  return { prep: null, kase: t[0] };
}

export async function loadFrames(framesUrl, rolesUrl, dict, meaning) {
  const text = async (u) => (await (await fetch(u)).text()).split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
  const defaults = new Map((await text(rolesUrl)).map((s) => { const [r, ...m] = s.split(/\s+/); return [r, m.join(" ")]; }));
  // word = concept : item, item ... -- an item: `role marking`, `role` (its default), `sich`, `sich D`, `={a|b}`
  const lines = new Map();   // "word|concept" -> [[item ...]]; "concept" -> the same, any word's (a synonym borrows them)
  for (const s of await text(framesUrl)) {
    const m = s.match(/^(.+?) = (.+?) : (.*)$/);
    if (!m) throw new Error(`frames.txt: cannot read ${s}`);
    const items = m[3].split(/,\s*(?![^{]*\})/).map((x) => x.trim());
    for (const k of [`${m[1]}|${m[2]}`, m[2]]) (lines.get(k) ?? lines.set(k, []).get(k)).push(items);
  }
  const roleOf = (item) => (item === "sich" || item === "sich D" ? null : item.startsWith("={") ? "fixed" : item.split(/\s+/)[0]);   // (={leid}: the world's fixed slot)
  const catOf = (item) => item.match(/ \[(.*)\]$/)?.[1] ?? null;
  const same = (items, roles) => { const r = items.map(roleOf).filter(Boolean); return r.length === roles.length && r.every((x, i) => x === roles[i]); };
  // (of a word's lines with these roles: the one whose categories are the frame's, if its lines name them)
  const choose = (cands, f) => cands.find((x) => x.filter((i) => roleOf(i)).every((i, k) => !catOf(i) || catOf(i) === f.slots[k]?.spec)) ?? cands[0];
  // one world frame in German: the word's own line with the same roles, else a synonym's, else the defaults
  function german(e, f) {
    const roles = f.slots.map((s) => s.role);
    const own = (lines.get(`${e.word}|${e.concept}`) ?? []).filter((x) => same(x, roles)), any = (lines.get(e.concept) ?? []).filter((x) => same(x, roles));
    const items = (own.length ? choose(own, f) : any.length ? choose(any, f) : null)?.map((i) => i.replace(/ \[.*\]$/, "")) ?? roles;
    const out = [];
    let i = 0;
    for (const item of items) {
      if (item === "sich") { out.push({ prep: null, kase: "sich", cat: null, not: [], need: [], words: null }); continue; }
      if (item === "sich D") { out.push({ prep: null, kase: "sich.D", cat: null, not: [], need: [], words: null }); continue; }
      if (item.startsWith("={")) { out.push({ prep: null, kase: "=", cat: null, not: [], need: [], words: item.slice(2, -1).split("|") }); continue; }
      const [role, ...m] = item.split(/\s+/), w = f.slots[i++];
      const marking = m.length ? m.join(" ") : CLAUSE[role] ?? defaults.get(role) ?? role;
      out.push({ ...w, ...mark(marking), role });
    }
    return { ...f, slots: out };
  }
  // ONE ROLE of a verb in German (a clause plan's `theme=...`): the marking of the word's line with these roles (its
  // category the noun fits, if it names one), else of any line with the role, else the role's default
  const ROLES = new Set([...defaults.keys()].filter((r) => !CLAUSE[r] && !["adj", "name", "age", "clock", "pred"].includes(r)));   // (pred: a clause's predicate, said its own way)
  // (a noun fits a line's category as written: `place +sittable -water`, `{dom|izba}`)
  const fitsCat = (noun, cat) => {
    if (!cat || !noun) return true;
    if (noun === PERSON) return !cat.startsWith("{") && (meaning.isA(cat.split(" ")[0], "person") || meaning.isA("person", cat.split(" ")[0]));   // (mich, uns: a person)
    if (cat.startsWith("{")) return cat.slice(1, -1).split("|").some((c) => c.replace(/_/g, " ") === noun.concept);
    const t = cat.split(" "), pos = t.filter((x) => !"+-".includes(x[0])), not = t.filter((x) => x[0] === "-" && !x.startsWith("-{")).map((x) => x.slice(1)), need = t.filter((x) => x[0] === "+").map((x) => x.slice(1));
    const notWords = t.filter((x) => x.startsWith("-{")).flatMap((x) => x.slice(2, -1).split("|"));
    return meaning.fitsAll(noun, pos, not, need) && !notWords.includes(noun.concept);
  };
  function markOf(e, role, noun, roles = null) {
    const cands = e ? [...(lines.get(`${e.word}|${e.concept}`) ?? []), ...(lines.get(e.concept) ?? [])] : [];
    const items = (x) => x.filter((i) => roleOf(i) === role);
    // (the line that names the noun first -- {izba|kabína} --, then one whose category it fits: in A a cabin, auf A a place)
    // (of the lines the noun fits, the most specific: one that names it, else the narrowest category)
    const depth = (i) => { const c = catOf(i); return !c ? 0 : c.startsWith("{") ? 1000 : meaning.categories().filter((x) => meaning.isA(c.split(" ")[0], x)).length; };
    const pick = (xs) => { const its = xs.flatMap(items).filter((i) => fitsCat(noun, catOf(i))).sort((a, b) => depth(b) - depth(a)); return its.length ? its[0].replace(/ \[.*\]$/, "").split(/\s+/).slice(1).join(" ") : null; };
    const sameSet = (x) => { const r = x.map(roleOf).filter(Boolean); return r.length === roles.length && roles.every((y) => r.includes(y)); };   // (the clause's roles, in any order)
    return (roles && (pick(cands.filter((x) => same(x, roles))) || pick(cands.filter(sameSet)))) || pick(cands) || defaults.get(role) || role;
  }
  // a concept's word whose line carries a fixed word of this concept (robiť + ľúto -> tun ... leid; byť + ťažký -> schwer)
  const withFixed = (concept, fixedCid) => {
    const fc = fixedCid.replace(/_/g, " ");
    for (const [k, ls] of lines) {
      const [w, c] = k.split("|");
      if (c !== concept.replace(/_/g, " ")) continue;
      for (const items of ls) for (const it of items) if (it.startsWith("={")) {
        const f = it.slice(2, -1).split("|").find((x) => dict.entries.some((e) => e.word === x && e.concept === fc));
        if (f) return { verb: w, fixed: f };
      }
    }
    return null;
  };
  // a word's reflexive in a sense (sich unterhalten mit, sich D überlegen): its line with these roles says sich / sich D
  const reflOf = (e, roles) => {
    const want = [...roles].filter((r) => ROLES.has(r)).sort().join(",");   // (the noun roles: adj, a clause, fixed words aside)
    for (const k of [`${e.word}|${e.concept}`, e.concept]) for (const items of lines.get(k) ?? []) {
      if (items.map(roleOf).filter((r) => r && ROLES.has(r)).sort().join(",") !== want) continue;
      if (items.includes("sich")) return "acc";
      if (items.includes("sich D")) return "dat";
    }
    return null;
  };
  return { frames: (e, worldFrames) => worldFrames.map((f) => german(e, f)), mark: markOf, isRole: (k) => ROLES.has(k), withFixed, reflOf, PERSON };
}
