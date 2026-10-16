// A LANGUAGE'S WORDS FOR THE WORLD'S CONCEPTS -- what every realizer (<lang>/realize.js) reads the same way: the
// dictionary (<lang>/dict.tsv: a concept's words, its default first), the closed words and word lists
// (<lang>/rules/neutral.txt: `KIND key = a | b {2} | c [kind]`, `list NAME = x|y`), the roles' default markings
// (<lang>/rules/roles.txt) and the words' frames (<lang>/rules/frames.txt: which of a concept's words says a plan's
// roles, and how -- the syntax in en/rules/frames.txt), and the nouns' kinds (world/meaning: on the table, at the
// station). The grammar -- the morphology, the order -- is each language's own.
//
//   const lx = await loadLexicon("", "en", { meaning, vary, verbEntry })
//   verbEntry(word) -> a verb's entry for a frame's word (an idiom's: go to sleep -- the language knows its forms)
//   lx.ipaOf(word) -> how a word sounds: the dictionary's IPA, else by the language's letter rules (engine/sounds.js)

import { splitTop } from "./realize.js";
import { loadSounds } from "./sounds.js";

export const ROLES = new Set(["patient", "second", "recipient", "as", "theme", "topic", "cause", "basis", "purpose", "companion", "opponent", "instrument", "share", "result", "substitute", "location", "goal", "source", "path", "bare"]);
export const PERSONS = /^(1sg|2sg|3sg\.[mf]|1pl|2pl|3pl(\.f)?|formal|someone|noone|who|that-one)$/;
// a person pronoun's gender and number (3sg.f, 3pl.f: feminine -- a participle, an adjective agree: elles sont contentes)
export const pronGender = (code) => (/\.f$/.test(code) ? "f" : "m");
export const pronPlural = (code) => /pl(\.f)?$/.test(code);
export const DIRECTED = new Set(["to", "into", "onto", "to-side", "under-to", "above-to", "behind-to", "front-to", "beside-to", "from", "off", "out-of", "through", "along", "around"]);

export async function loadLexicon(base, lang, { meaning = null, vary = null, verbEntry = (w) => ({ word: w }) } = {}) {
  const get = async (u) => { const r = await fetch(base + u); return r.ok ? r.text() : ""; };
  const lines = async (u) => (await get(u)).split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
  // ---- THE WORDS: a concept's words, its default first (<lang>/rules/prefer.txt's, then FREQ, then the file order)
  const [head, ...rows] = (await get(`${lang}/dict.tsv`)).trim().split("\n");
  const cols = head.split("\t");
  const prefer = new Map((await lines(`${lang}/rules/prefer.txt`)).map((s) => s.match(/^(\S+) (.+?) = (.+)$/)).filter(Boolean).map((m) => [`${m[1]}|${m[2]}`, m[3]]));
  const byConcept = new Map(), byWord = new Map();
  rows.forEach((r, i) => {
    const v = r.split("\t"), e = Object.fromEntries(cols.map((c, j) => [c, v[j] ?? ""]));
    e.order = i; e.freq = Number(e.freq);
    const k = `${e.pos}|${e.sk}`;
    (byConcept.get(k) ?? byConcept.set(k, []).get(k)).push(e);
    if (!byWord.has(e.word)) byWord.set(e.word, e);
    if (e.pos === "V" && !byWord.has("V|" + e.word)) byWord.set("V|" + e.word, e);
  });
  const ipaOf = await loadSounds(`${base}${lang}/rules/sounds.txt`, byWord);
  for (const [k, es] of byConcept) es.sort((a, b) => (prefer.get(k) === b.word) - (prefer.get(k) === a.word) || a.freq - b.freq || a.order - b.order);
  // (one word said for its concept while asked -- the trainer's example sentences of that word: use(pos, concept,
  //  word) -> undo; a concept's other words keep their order)
  const use = (pos, concept, word) => {
    const es = byConcept.get(`${pos}|${concept}`), i = es ? es.findIndex((e) => e.word === word) : -1;
    if (i <= 0) return () => {};
    const [e] = es.splice(i, 1); es.unshift(e);
    return () => { es.splice(es.indexOf(e), 1); es.splice(i, 0, e); };
  };
  const POS_ANY = ["V", "N", "AN", "AV", "PAR", "PHR", "CON", "PRE", "P", "NUM", "INT", "ART"];
  const sp = (cid) => cid.replace(/_/g, " ");
  // a concept's English word (`pos` first, then any part of speech); unknown: the token itself, as written
  // (a concept named without its gloss -- čas for čas (trvanie) -- finds the first glossed sense of that word)
  const senses = new Map();
  for (const k of byConcept.keys()) { const m = k.match(/^(\w+)\|(.+?) \(.+\)$/); if (m && !senses.has(`${m[1]}|${m[2]}`)) senses.set(`${m[1]}|${m[2]}`, k); }
  const entry = (cid, pos) => { if (!cid) return null; for (const p of [pos, ...POS_ANY]) { const es = byConcept.get(`${p}|${sp(cid)}`) ?? byConcept.get(senses.get(`${p}|${sp(cid)}`)); if (es) return es[0]; } return null; };
  const wordOf = (cid, pos) => entry(cid, pos)?.word ?? sp(cid ?? "");
  const own = (cid, pos) => byConcept.get(`${pos}|${sp(cid)}`)?.[0] ?? null;   // (of this part of speech only)
  // ---- THE CLOSED WORDS AND THE WORD LISTS
  const table = {};
  for (const s of await lines(`${lang}/rules/neutral.txt`)) {
    const m = s.match(/^(\w+) (\S+) = ?(.*)$/);
    if (m) (table[m[1]] ??= {})[m[2]] = m[3].split("|").map((x) => ({ w: x.replace(/\{[\d.]+\}|\[\w+\]/g, "").trim(), weight: Number(x.match(/\{([\d.]+)\}/)?.[1] ?? 1), only: x.match(/\[(\w+)\]/)?.[1] ?? null }));
  }
  const say = (kind, x) => table[kind]?.[x]?.[0]?.w;
  const LIST = (n) => new Set((table.list?.[n] ?? []).map((a) => a.w));
  const choose = (alts) => { if (!vary) return alts[0]; let r = vary() * alts.reduce((t, a) => t + a.weight, 0); for (const a of alts) if ((r -= a.weight) < 0) return a; return alts[alts.length - 1]; };
  // ---- THE ROLES: the defaults (`location in | on [surface] | at [place]`), the frames (<lang>/rules/frames.txt)
  const defaults = new Map((await lines(`${lang}/rules/roles.txt`)).map((s) => { const [r, ...m] = s.split(/\s+/); return [r, m.join(" ").split("|").map((x) => ({ w: x.replace(/\[\w+\]/, "").trim(), only: x.match(/\[(\w+)\]/)?.[1] ?? null }))]; }));
  const framesOf = new Map();   // concept -> its lines in the file's order: { word, roles: role -> marking, absorb, only, fixed, inf, that, subjRole }
  for (const s of await lines(`${lang}/rules/frames.txt`)) {
    const m = s.match(/^(.+?) = (.+?) :\s*(.*)$/);
    if (!m) throw new Error(`${lang}/rules/frames.txt: cannot read ${s}`);
    const f = { word: m[1], concept: m[2], roles: new Map(), absorb: new Map(), only: new Map(), cat: new Map(), fixed: null, inf: null, that: null, subjRole: null };
    for (const it of m[3] ? m[3].split(/,\s*(?![^{]*\})/).map((x) => x.trim()) : []) {
      let x;
      if ((x = it.match(/^=\{(.+)\}$/))) f.fixed = x[1];
      else if ((x = it.match(/^inf\s+=\{(.+)\}$/))) f.inf = { absorb: x[1] };
      else if ((x = it.match(/^inf(?:\s+(\S+))?$/))) f.inf = { mark: x[1] ?? "to" };   // (\S: à, de)
      else if ((x = it.match(/^that(?:\s+(.+))?$/))) {   // (that; that ing to: to you coming; that subj: que vengas; that de: de que)
        const t = (x[1] ?? "").split(/\s+/).filter(Boolean);
        f.that = { ing: t[0] === "ing", subj: t.includes("subj"), prep: t.filter((w) => w !== "ing" && w !== "subj")[0] ?? null };
      }
      else if ((x = it.match(/^subj\s+(\S+)$/))) f.subjAs = x[1];   // (the plan's subject said as: subj io -- me gusta)
      else if ((x = it.match(/^(\w+)\s+=\{(.+)\}$/))) { f.roles.set(x[1], "direct"); f.absorb.set(x[1], x[2]); }
      else if ((x = it.match(/^(\w+)\s+\{(.+)\}\s*(.*)$/))) { f.roles.set(x[1], x[3] || ""); f.only.set(x[1], x[2].split("|")); }
      else if ((x = it.match(/^(\w+)\s+\[(.+?)\]\s*(.*)$/))) { f.roles.set(x[1], x[3] || ""); f.cat.set(x[1], x[2]); }
      else if ((x = it.match(/^(\w+)\s+subj$/))) { f.roles.set(x[1], "subj"); f.subjRole = x[1]; }
      else if ((x = it.match(/^(\w+)\s*(.*)$/))) f.roles.set(x[1], x[2]);
    }
    (framesOf.get(f.concept) ?? framesOf.set(f.concept, []).get(f.concept)).push(f);
  }

  // ---- NOUN KINDS (world/meaning): what a noun is decides a preposition (on the table, at the station, by bus)
  const kindOf = (cid) => (k) => !!meaning && !!cid && meaning.fits({ concept: sp(cid), pos: "N", word: "" }, k);
  const nounKind = (h) => {
    const n = h?.includes(":") ? h.split(":").pop().split("+")[0] : null, k = kindOf(n);
    return (o) => o === "place" ? k("building") || k("shop") || k("institution") || k("event") : o === "person" ? k("person") || PERSONS.test(h ?? "") : o === "surface" ? k("furniture") : o === "container" ? k("container") : o === "feeling" ? k("feeling") : o === "home" ? n === "domov" : o === "vehicle" ? k("vehicle") : o === "thing" ? k("tool") || k("thing") || k("device") || k("utensil") : false;
  };
  const pick = (alts, h) => { const fits = nounKind(h); return (alts.find((a) => a.only && fits(a.only)) ?? alts.find((a) => !a.only) ?? alts[0]).w; };

  // ---- THE WORD AND ITS FRAME: of a concept's words, the first whose line says the plan's roles ------------------------
  // (a line with a fixed word, an absorbed noun or a noun list first: it is the plan's idiom -- be sorry, be hungry)
  function frameFor(c, plan) {
    const A = (k) => c.args[k]?.[0], cid = A("verb");
    const fl = [...(framesOf.get(sp(cid)) ?? [])];
    const rr = A("relrole"), wr = A("wh")?.match(/^([\w.]+):(who|what)$/)?.[1];
    // (a role held by "it" for the clause that follows is the clause's: freut sich darauf, dass -> looks forward to you coming)
    const present = new Set(Object.keys(c.args).filter((k) => ROLES.has(k) && !(A("clause") && A(k) === "it")));
    for (const r of [rr, wr]) if (ROLES.has(r)) present.add(r);
    if (A("inf") || c.args.clause?.some((id) => plan?.clauses[id]?.type === "INF")) present.add("inf");   // (an infinitive clause is the frame's inf too)

    const moving = !!A("place") || (c.args.pp ?? []).some((p) => DIRECTED.has(p.split(":")[0]));
    const fits = (f) => {
      const keys = new Set([...f.roles.keys(), ...(f.inf ? ["inf"] : [])]);
      if (keys.size !== present.size || [...present].some((k) => !keys.has(k)) || (f.that && !A("clause"))) return false;
      if (!keys.size && moving) return false;   // (he left; he went home)
      if (f.fixed && f.fixed !== sp(A("fixed") ?? "")) return false;
      if (f.inf?.absorb && f.inf.absorb !== sp(A("inf") ?? "")) return false;
      for (const [r, n] of f.absorb) if (sp(nounOf(A(r)) ?? "") !== n) return false;
      for (const [r, ns] of f.only) if (!ns.includes(sp(nounOf(A(r)) ?? ""))) return false;
      for (const [r, k] of f.cat) if (!catOf(A(r), k)) return false;
      return true;
    };
    // (a clause to say: a word's line that takes it before its line that does not -- me alegro de que vengas)
    if (A("clause")) fl.splice(0, fl.length, ...fl.filter((f) => f.that), ...fl.filter((f) => !f.that));
    const special = fl.find((f) => (f.fixed || f.absorb.size || f.only.size || f.cat.size || f.inf?.absorb) && fits(f));
    if (special) return { v: verbEntry(special.word), f: special };
    const plain = (f) => !f.fixed && !f.absorb.size && !f.only.size && !f.cat.size && !f.inf?.absorb;
    for (const e of byConcept.get(`V|${sp(cid)}`) ?? []) { const f = fl.find((x) => x.word === e.word && plain(x) && fits(x)); if (f) return { v: e, f }; }
    const any = fl.find((f) => plain(f) && fits(f));
    if (any) return { v: verbEntry(any.word), f: any };
    return { v: entry(cid, "V") ?? { word: sp(cid) }, f: null };
  }
  // (a value of a category: a noun of it, or for person a person pronoun)
  const catOf = (v, cat) => !!v && (table.pron?.[splitTop(v)[0]] ? cat === "person" && PERSONS.test(splitTop(v)[0]) : kindOf(nounOf(v))(cat));
  // (a marking, the word's or the role's default, by the noun's kind: `on [surface] | into`)
  const alts = (m) => m.split("|").map((x) => ({ w: x.replace(/\[\w+\]/, "").trim(), only: x.match(/\[(\w+)\]/)?.[1] ?? null }));
  const markOf = (fr, role, v) => { const m = fr?.f?.roles.get(role); return pick(m ? alts(m) : defaults.get(role) ?? [{ w: "direct" }], v); };

  const nounOf = (v) => { const h = splitTop(v ?? "")[0]; return h.includes(":") ? h.slice(h.indexOf(":") + 1).replace(/^[~@]/, "") : null; };
  // (a plan's 3pl pronoun agrees with what it stands for -- the plural noun phrase another clause has as its subject:
  //  elles, ellas for a feminine one; the plan's pronoun has none) -> the plan with `3pl.f` there (<lang>/rules/neutral.txt)
  function agree(plan) {
    const subjOf = (c) => c.args.subj?.[0], plural = (v) => /^[\w.-]+:/.test(v ?? "") && (/\+pl\b/.test(v) || /^(all|both|many|several|few):/.test(v));
    const ante = Object.values(plan.clauses).find((c) => plural(subjOf(c)));
    if (!ante || entry(nounOf(subjOf(ante)), "N")?.gender !== "f") return plan;
    const clauses = {};
    for (const [id, c] of Object.entries(plan.clauses)) clauses[id] = c === ante ? c : { ...c, args: Object.fromEntries(Object.entries(c.args).map(([k, vs]) => [k, vs.map((v) => (v === "3pl" ? "3pl.f" : v))])) };
    return { ...plan, clauses };
  }
  return { entry, wordOf, use, agree, own, sp, byConcept, byWord, table, say, LIST, choose, defaults, framesOf, kindOf, nounKind, pick, frameFor, markOf, catOf, nounOf, ipaOf };
}
