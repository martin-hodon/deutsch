// GERMAN SAYS A CLAUSE PLAN (world/CLAUSES.md): the language-free clause format -- concepts, roles, relations, links,
// pronoun codes -- in German. Its own closed words come from de/rules/neutral.txt (weil for because, auf.A for onto,
// kein for no ...), a role's case or preposition from the verb's frames (de/frames.js: warten > theme = auf A); the
// clause kinds and their order become German's (a statement after a clause in front or a quote turns: INVERTED; a
// coordinated one with its subject dropped: DROP; je / desto; wer ..., der ...). The sentence itself is then built by
// the German grammar and morphology (sentences.js realize, the German clause format of its tests).
//
//   const de = await loadGerman("", gen, frames, { vary })   (gen: sentences.js createGenerator; frames: de/frames.js)
//   de.realize(test) -> text      test: { seq, clauses: { id: { type, args } } }, as realize.js parseTests reads it
//   vary: a random source -- then an adverb of several German words is said with the one said least lately (dann,
//   danach, anschließend for potom), as an author varies them; without it (the tests) always the first

import { splitTop, call } from "../engine/realize.js";

export async function loadGerman(base, gen, frames, { vary = null } = {}) {
  const table = {};   // kind -> neutral -> [{ w, weight, only }]
  for (const s of (await (await fetch(base + "de/rules/neutral.txt")).text()).split("\n")) {
    const m = s.trim().match(/^(\w+) (\S+) = (.*)$/);
    if (!m) continue;
    (table[m[1]] ??= {})[m[2]] = m[3].split("|").map((x) => ({ w: x.replace(/\{[\d.]+\}|\[\w+\]/g, "").trim(), weight: Number(x.match(/\{([\d.]+)\}/)?.[1] ?? 1), only: x.match(/\[(\w+)\]/)?.[1] ?? null }));
  }
  const { word, meaning } = gen;
  const say = (kind, x) => table[kind]?.[x]?.[0]?.w;
  // (a choice among the ways: the first -- a test's sentence is exact --, or by weight when the realizer chooses freely)
  const choose = (alts, rnd) => { if (!rnd) return alts[0]; let r = rnd() * alts.reduce((t, a) => t + a.weight, 0); for (const a of alts) if ((r -= a.weight) < 0) return a; return alts[alts.length - 1]; };
  const nounOf = (v) => { const h = splitTop(v)[0]; if (!h.includes(":")) return null; const n = h.slice(h.indexOf(":") + 1).replace(/^[~@]/, "").split("/")[0]; return n.startsWith("$") ? null : word(n, "N"); };
  // a relation's German preposition: the alternative for the noun's kind ([name] nach Wien, [person] von ihr ...)
  function rel(r, v) {
    const alts = table.rel?.[r];
    if (!alts) return r;
    const n = nounOf(v);
    const personPron = /^(1sg|2sg|3sg\.[mf]|1pl|2pl|3pl|formal|someone|noone)\b/.test(v);   // (mir, uns: persons)
    const kind = (o) => o === "name" ? n && (n.article === "(das)" || meaning.flag(n, "bare")) : o === "person" ? personPron || (n && meaning.fits(n, "person")) : o === "feeling" ? n && meaning.fits(n, "feeling") : o === "country" ? n && (meaning.fits(n, "country") || meaning.fits(n, "settlement")) : o === "auf" || o === "an" ? n && meaning.flag(n, o) : false;
    return (alts.find((a) => a.only && kind(a.only)) ?? alts.find((a) => !a.only)).w;
  }
  // ---- values
  // (a thing's pronoun -- it:X, them:X -- by the German noun's gender: er, sie, es; sie.pl)
  const GENDER_PRON = { der: "er", die: "sie", das: "es", "der/das": "er", "der/die": "er", "(das)": "es" };
  function value(v) {
    const [head, ...mods] = splitTop(v);
    if (table.pron?.[head]) return [say("pron", head), ...mods.map(mod)].join("+");
    const tp = head.match(/^(it|them):(.+)$/);
    if (tp) return tp[1] === "them" ? "sie.pl" : GENDER_PRON[word(tp[2], "N")?.article] ?? "es";
    return np(v);
  }
  function np(v) {
    const [head, ...mods] = splitTop(v);
    if (!head.includes(":")) return v;
    const i = head.indexOf(":"), d = head.slice(0, i), n = head.slice(i + 1);
    const det = table.det?.[d] ? say("det", d) : d;
    return [`${det}:${n}`, ...mods.map(mod)].join("+");
  }
  function mod(m) {
    const [f, a] = call(m);
    if (m === "more") return "mehr";
    if (f === "owner") return `gen(${np(a)})`;
    if (f === "owner.von") return `von(${value(a)})`;
    if (f === "of") return `of(${np(a)})`;
    if (f === "pair") { const [w, other] = splitTop(a, ","); const P = { and: "und", or: "oder", "either-or": "entweder…oder", "both-and": "sowohl…als auch", "neither-nor": "weder…noch", "not-but": "nicht…sondern", "not-only-but-also": "nicht nur…sondern auch" }; return `pair(${P[w] ?? w},${np(other)})`; }
    if (f === "part") { const [k, vb, ...ext] = splitTop(a, ","); return `part(${[k, vb, ...ext.map((x) => (call(x)[0] === "by" ? `von(${value(call(x)[1])})` : x))].join(",")})`; }
    return m;
  }
  function pred(v) {
    const [head, ...mods] = splitTop(v);
    if (!head.startsWith("adj:")) return head.startsWith("age:") || head.startsWith("clock:") || head.startsWith("name:") ? v : value(v);
    return [head, ...mods.map((m) => { const [f, a] = call(m); return f === "than" ? `als(${value(a)})` : f === "as" ? `wie(${value(a)})` : f === "but" ? `aber(${a})` : f === "and" ? `und(${a})` : m; })].join("+");
  }
  // an adverbial: a concept (heute), home (zu Hause), a time phrase (on-day:pondelok -> am:pondelok), a relation (in:def:záhrada)
  function adv(v) {
    if (v === "home") return "zu Hause";
    if (v.startsWith("adj:")) return word(v.slice(4), "AN")?.word ?? v.slice(4);   // (a manner said by an adjective: schnell)
    const [h, ...a] = v.split(":");
    if (!a.length) return v;
    const t = table.time?.[h];
    if (t) return [t[0].w, ...a].join(":");
    if (table.rel?.[h]) return `${rel(h, a.join(":"))}:${a.join(":")}`;
    return v;
  }
  // a role of the verb: its German marking (A, D, A0, auf A ...) -> the German clause key and value
  const PERSONS = /^(1sg|2sg|3sg\.[mf]|1pl|2pl|3pl|formal|someone|noone)(\+|$)/;
  function role(verbE, r, v, frameRoles) {
    // (a where-role with its relation -- location=in:def:posteľ: German's preposition for it, by the noun)
    const wr = v.match(/^([a-z-]+):(.*)$/);
    if (wr && table.rel?.[wr[1]] && !table.det?.[wr[1]] && !table.pron?.[wr[1]] && ["location", "goal", "source", "path"].includes(r)) return ["pp", `${rel(wr[1], wr[2])}:${value(wr[2])}`];
    const m = frames.mark(verbE, r, nounOf(v) ?? (PERSONS.test(v) ? frames.PERSON : null), frameRoles);
    if (v === "it") { const [p, c] = m.split(" "); return c ? ["pp", `da:${p}`] : [m, "es"]; }   // (a thing named before: darauf, damit)
    if (r === "bare") return ["A0", np(v)];
    if (r === "second") return ["A2", value(v)];
    if (m === "A" || m === "D" || m === "G") return [m, value(v)];
    if (m === "A0") return ["A0", np(v)];
    if (m === "N=") return ["pred", value(v)];
    const [p, c] = m.split(" ");
    return ["pp", `${p}${c ? "." + c : ""}:${value(v)}`];
  }
  let curVerb = null, curRoles = [];   // (the clause being said: its verb -- a question word asks one of its roles)
  const LINKED = new Set(["SUB", "INF"]);   // (a statement after one of these, the verb first -- not after wer ...: der isst)
  // (an adverb's word: one of its concept's German words -- the least said lately, now and then another: variety)
  const said = new Map();
  function adverbWord(v) {
    if (!vary || v.includes(":") || v.startsWith("$")) return v;
    const es = [...new Set([...gen.synonyms(v, "AV"), ...gen.synonyms(v, "PAR")].map((e) => e.word))].filter((w) => !w.includes(" "));
    if (es.length < 2) return v;
    const w = es.map((x, i) => ({ x, s: (said.get(x) ?? 0) + i * 0.3 + vary() })).sort((a, b) => a.s - b.s)[0].x;
    for (const [k, n] of said) said.set(k, n * 0.8);
    said.set(w, (said.get(w) ?? 0) + 1);
    return w;
  }
  function realize(test, opts = {}) {
    const rnd = vary;
    const clauses = {}, seq = [];
    const kinds = Object.fromEntries(Object.entries(test.clauses).map(([id, c]) => [id, c.type]));
    // (a relative clause's head: the noun phrase that names it -- rel(3) -- its role in it is marked by its noun)
    const headOf = {};
    for (const c of Object.values(test.clauses)) for (const vs of Object.values(c.args)) for (const v of vs) for (const m of String(v).matchAll(/rel\((\w+)\)/g)) headOf[m[1]] = v;
    // (MAIN after a clause in front, a quote's end, or `either`: INVERTED)
    const after = {};
    let prev = null;
    for (const t of test.seq ?? []) {
      if (t === ",") continue;
      if (test.clauses[t]) after[t] = prev;
      prev = t;
    }
    for (const t of test.seq ?? []) seq.push(table.coord?.[t] ? say("coord", t) : t);   // (a joining word as it is: doch -- jedoch would turn the order)
    for (const [id, c] of Object.entries(test.clauses)) {
      const A = (k) => c.args[k]?.[0];
      let type = c.type;
      const p = after[id], link = A("link");
      const mainDrop = type === "MAIN" && A("drop") === "yes" && A("de.form") === "main";   // (a statement whose subject is dropped, its own order: und dann ging zum Hafen)
      if (type === "MAIN" && A("drop") === "yes" && !mainDrop) type = "DROP";
      else if (type === "MAIN" && link === "the-more-so") type = "DESTO";
      else if (type === "MAIN" && p && (LINKED.has(kinds[p]) || p === "“" || p === "either")) type = "INVERTED";
      else if (type === "SUB" && link === "the-more") type = "JE";
      else if (type === "SUB" && A("de.form") === "verb-first") type = "CONDV";
      else if (type === "INF") type = link ? "ZUADV" : "ZU";
      else if (type === "WHOEVER") type = "WERREL";
      // (a fixed word picks the concept's word that carries it: robiť + ľúto -> es tut mir leid, not macht)
      const fx = A("verb") && A("fixed") ? frames.withFixed(A("verb"), A("fixed")) : null;
      const verbE = fx ? word(`${fx.verb}=${A("verb").replace(/_/g, " ")}`, "V") ?? word(A("verb"), "V") : A("verb") ? word(A("verb"), "V") : null;
      curVerb = verbE; curRoles = Object.keys(c.args).filter((k) => frames.isRole(k));
      const frameRoles = Object.keys(c.args).filter((k) => frames.isRole(k));
      const out = {};
      const put = (k, v) => (out[k] ??= []).push(v);
      for (const [k, vs] of Object.entries(c.args)) for (const v of vs) {
        if (k === "verb" && fx) put(k, `${fx.verb}=${v.replace(/_/g, " ")}`);
        else if (k === "fixed") put(k, fx?.fixed ?? v);
        else if (k === "verb" || k === "modal" || k === "inf" || k === "tense" || k === "voice" || k === "imp" || k === "refl" || k === "clause") put(k, v);
        else if (k === "raise") put("zuverb", v);
        else if (k === "subj") { if (type === "DROP" || mainDrop) { put("subj", "drop"); put("as", value(v)); } else put("subj", value(v)); }
        else if (k === "drop") continue;
        else if (frames.isRole(k)) { const [kk, vv] = role(verbE, k, v, frameRoles); put(kk, vv); }
        else if (k === "by" || k === "through") put("pp", k === "by" ? `von:${value(v)}` : `durch.A:${value(v)}`);   // (the passive's doer; its cause)
        else if (k === "pp") { const i = v.indexOf(":"), r = v.slice(0, i), rest = v.slice(i + 1); put("pp", rest === "it" ? `da:${rel(r, rest).split(".")[0]}` : `${rel(r, rest)}:${value(rest)}`); }
        else if (k === "pred") put("pred", pred(v));
        else if (["time", "freq", "manner", "place", "sentence", "conn"].includes(k)) put(k, adv(k === "time" || k === "conn" ? adverbWord(v) : v));   // (variety in time words and connectives only: dabei is not hierbei)
        else if (["because-of", "despite", "during", "instead-of"].includes(k)) put("gen", `${table.rel[k][0].w}:${np(v)}`);
        else if (k === "link") { if (["the-more", "the-more-so"].includes(v) || (type === "CONDV")) continue; put("conj", A("de.word") ?? choose(table.link[v] ?? [{ w: v, weight: 1 }], rnd).w); }
        else if (k === "mood") put("mood", say("mood", v) ?? v);
        else if (k === "neg") put("neg", say("neg", v) ?? v);
        else if (k === "wh") put("wh", wh(v));
        else if (k.startsWith("de.")) { const kk = k.slice(3); if (kk === "front" || kk === "part" || kk === "fixed") put(kk, v.replace(/_/g, " ")); }
        else if (k === "ctrl" || k === "role") put(k, value(v));
        else if (k === "np") put("np", np(v));
        else if (k === "jecomp") put("jecomp", v);
        else if (k === "relrole") put("relrole", relrole(verbE, v, [...frameRoles, v], headOf[id]));
        else put(k, v);
      }
      // (the plan's verb reflexive in this sense in German: sich unterhalten -- its frames say so, the world's do not; not
      //  in a passive, whose patient is its subject: Das Salz wird aufgelöst)
      if (!out.refl && !out.voice && verbE && !/^sich /.test(verbE.word)) { const r = frames.reflOf(verbE, [...frameRoles, ...(A("clause") ? [] : [])]); if (r) put("refl", r); }
      clauses[id] = { type, args: out };
    }
    return gen.realize({ seq, clauses }, opts);
  }
  function wh(v) {
    const W = { "recipient:who": "wem", "companion:who": "mit wem" };
    if (W[v]) return W[v];
    if (v.startsWith("pp:")) return v.slice(3);
    const rw = v.match(/^([\w.]+):(who|what)$/);   // (a role asked: mit wem; worüber -- the verb's own preposition)
    if (rw && frames.isRole(rw[1])) {
      const [p, c] = frames.mark(curVerb, rw[1], null, [...curRoles, rw[1]]).split(" ");
      if (!c) return rw[2] === "who" ? (p === "D" ? "wem" : "wen") : "was";
      return rw[2] === "who" ? `${p} ${c === "A" ? "wen" : "wem"}` : `wo${/^[aeiouäöü]/.test(p) ? "r" : ""}${p}`;
    }
    const i = v.indexOf(":");
    if (i > 0 && table.wh?.[v.slice(0, i)]) { const np2 = v.slice(i + 1), pre = /^[AN]\./.test(np2) ? np2.slice(0, 2) : ""; return `${say("wh", v.slice(0, i))}:${pre}${np(np2.replace(/^[AN]\./, ""))}`; }
    return say("wh", v) ?? v;
  }
  function relrole(verbE, v, frameRoles, head) {
    const R = { subj: "subj", owner: "gen", where: "wo", what: "was" };
    if (R[v]) return R[v];
    if (v.startsWith("pp.")) return "prep." + rel(v.slice(3), "").replace(".", ".");
    const m = frames.mark(verbE, v, head ? nounOf(head) : null, frameRoles);   // (its case alone: den, dem; with a preposition: an die, mit dem)
    return m === "A" ? "acc" : m === "D" ? "dat" : "prep." + m.replace(" ", ".");
  }
  return { realize };
}
