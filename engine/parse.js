// A SENTENCE READ BACK INTO ITS PLAN -- analysis by synthesis: the words typed are looked up (the forms index:
// engine/wordforms.js -- their dictionary words, parts of speech, cells: a plural, a participle), plans are made of
// them and said by the language's own realizer, and the plan whose sentence comes closest to the one typed is kept,
// grown a part at a time (a beam search over moves: a verb and a subject, an object, an adjective on a noun, a tense,
// a modal, not, an adverb, a place, a question, a second clause). No grammar of its own: the realizer IS the grammar,
// so a plan that says the sentence back word for word is a parse that is right by construction -- the grammar ladder
// then takes it apart (engine/build.js unbuild). Sentences the realizer cannot say are not found (exact: false).
//
//   const p = await createParser({ d, meaning, say, lang })   d: the language's dictionary with its forms index;
//                                                              say: an exact realizer (say.use: a word for a concept)
//   p.parse(text) -> { plan, said, exact, words } | null       words: the text's words (folded)
import { fold } from "./wordforms.js";
import { loadDerivations } from "./derive.js";

const PRONS = ["1sg", "2sg", "3sg.m", "3sg.f", "3sg.n", "1pl", "2pl", "3pl", "formal", "one", "this", "something", "nothing", "someone", "noone"];
const DETS = ["def", "indef", "none", "no"];
const POSS = ["poss.1sg", "poss.2sg", "poss.3sg.m", "poss.3sg.f", "poss.1pl", "poss.2pl", "poss.3pl"];
const TENSES = ["past", "perfect", "future", "pluperfect"];
const MODALS = ["môcť", "musieť", "chcieť", "smieť", "mať_(povinnosť)"];
const WH = ["where", "when", "why", "how", "who", "what", "whom", "whence", "whither", "how-often"];
const LINKS = ["because", "although", "if", "when", "that", "whether", "before", "after", "while", "until", "as-soon-as", "so-that", "when-past"];
const COORD = ["and", "but", "or"];
const FIXED_PLACES = ["home", "tu", "tam_(miesto)", "vonku"];
const ADV_KEY = { time: "time", frequency: "freq", manner: "manner", place: "place", sentence: "sentence" };
const BEAM = 4, DEPTH = 18, MAX_PLANS = 20000, MAX_MS = 2500;   // (a search's bounds: then its best so far)

export async function createParser({ d, meaning, say, lang }) {
  const relations = [...(await (await fetch("world/relations.txt")).text()).matchAll(/^RELATION (\S+)/gm)].map((m) => m[1]).filter((r) => !/^(at-hour|on-day|in-period|since|ago|in-time|during|until|before|after|because-of|despite|instead|of|like|smell-of)$/.test(r));
  const lists = await (await fetch("world/lists.txt")).text();
  const listOf = (n) => new Set((lists.match(new RegExp(`^WORDS ${n.replace(/\./g, "\\.")}: (.*)$`, "m"))?.[1] ?? "").split("|").map((x) => x.trim().replace(/\s*\{[\d.]+\}$/, "")).filter(Boolean));
  const build = await (await fetch("world/build.txt")).text();   // (and the grammar ladder's degree words: dosť)
  const DEGREE = new Set([...listOf("adv.degree"), ...(build.match(/^DEGREE: (.*)$/m)?.[1] ?? "").split("|").map((x) => x.trim())]), DAYS = listOf("time.day");
  const zh = lang === "zh";
  const { derive } = await loadDerivations(lang);
  // (the verbs of several words by their first: prendre -> prendre en photo, hacer -> hacer senderismo)
  const phrasal = new Map();
  for (const e of d.entries) if (e.pos === "V" && e.word.includes(" ") && !/^(se |s'|sich )/.test(e.word)) { const h = e.word.split(" ")[0]; (phrasal.get(h) ?? phrasal.set(h, []).get(h)).push(e); }
  // the words of a text, folded: a word a token (Chinese: a character) -- what two sentences are compared by
  // (Chinese: cut into dictionary words by the longest match, as the reading page does -- the same cut for both)
  const segment = (s) => { s = s.replace(/[^\p{L}\p{N}]/gu, ""); const out = []; for (let i = 0; i < s.length;) { let n = Math.min(4, s.length - i); while (n > 1 && !d.index.has(s.slice(i, i + n))) n--; out.push(s.slice(i, i + n)); i += n; } return out; };
  const words = (s) => (zh ? segment(s) : (s.match(/[\p{L}\p{M}\p{N}'’-]+/gu) ?? []).map((w) => fold(w.replace(/’/g, "'"))));
  const saidWords = (plan) => { try { const s = say(plan); return s?.text ? { s, w: words(s.text) } : null; } catch { return null; } };
  // how near a sentence is to the one typed: the words they share in order, less the words either has besides (0: the same)
  function score(a, b) {
    const L = Array.from({ length: a.length + 1 }, () => new Int16Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    return 2 * L[0][0] - a.length - b.length;
  }

  // ---- PROBES, once: the words a relation adds (in der, im, dans le ...), a link (weil, because), a determiner on a noun
  //      (der/den/dem, a/an, mein ...) -- each tried only where one of its words was typed (one said by the case alone,
  //      by no word: always)
  const P1 = (args) => ({ seq: ["1", "."], clauses: { 1: { type: "MAIN", args } } });
  const extra = (plan, base, not = new Set()) => { const b = new Set(saidWords(base)?.w ?? []); return [...new Set((saidWords(plan)?.w ?? []).filter((w) => !b.has(w) && !not.has(w)))]; };
  // (with each determiner: im Tisch, in einem Tisch -- a contraction alone would hide the preposition)
  // (with each determiner and several nouns: im Tisch, in einem Tisch; Russian на столе but в саду -- the noun's kind of
  //  place chooses the preposition, one noun alone would hide one)
  const placeNouns = ["stôl", "dom", "záhrada", "mesto"].filter((c) => d.byConcept.has(`N|${c}`));
  const formsOfNoun = (c) => new Set((d.byConcept.get(`N|${c}`) ?? []).flatMap((e) => [e.word, ...(e.plural ?? "").split("/")]).map(fold));
  const relWords = new Map(relations.map((r) => [r, [...new Set(placeNouns.flatMap((n) => ["def", "indef", "none"].flatMap((det) => extra(P1({ verb: ["čakať"], subj: ["1sg"], place: [`${r}:${det}:${n}`] }), P1({ verb: ["čakať"], subj: ["1sg"] }), formsOfNoun(n)))))]]));
  const linkWords = new Map(LINKS.map((l) => [l, extra({ seq: ["1", ",", "2", "."], clauses: { 1: { type: "MAIN", args: { verb: ["čakať"], subj: ["1sg"] } }, 2: { type: "SUB", args: { link: [l], verb: ["spať"], subj: ["3sg.m"] } } } }, P1({ verb: ["čakať"], subj: ["1sg"] }), new Set(saidWords(P1({ verb: ["spať"], subj: ["3sg.m"] }))?.w ?? []))]));
  // (a determiner's words: said on a noun of each gender, as subject, object, after a preposition)
  const detNouns = ["stôl", "lampa", "okno", "dom", "pes", "strom", "auto", "kniha"].filter((c) => d.byConcept.has(`N|${c}`));
  // (what a determiner adds to the same noun with none: der/den/dem, ein/einen, mein ... -- `none` adds nothing: always)
  const detWords = new Map([...DETS, ...POSS].filter((det) => det !== "none").map((det) => [det, [...new Set(detNouns.flatMap((n) => ["", "+pl"].flatMap((pl) => [
    (x) => P1({ verb: ["byť"], subj: [`${x}:${n}${pl}`], pred: ["adj:veľký"] }), (x) => P1({ verb: ["vidieť"], subj: ["1sg"], patient: [`${x}:${n}${pl}`] }), (x) => P1({ verb: ["čakať"], subj: ["1sg"], place: [`in:${x}:${n}${pl}`] }),
  ].flatMap((make) => extra(make(det), make("none"))))))]]));   // (singular and plural: la, las, gli)
  const typed = (ws, toks) => !ws?.length || ws.some((w) => toks.includes(w));
  // (a pronoun's words, as a subject and as an object: ich/mich/mir -- none where the language leaves it out: duermo)
  const subjWords = new Map(PRONS.map((code) => [code, extra(P1({ verb: ["spať"], subj: [code] }), P1({ verb: ["spať"], subj: ["def:pes"] }), new Set(saidWords(P1({ verb: ["spať"], subj: ["1pl"] }))?.w ?? []).add("x"))]));
  const objWords = new Map(PRONS.map((code) => [code, extra(P1({ verb: ["vidieť"], subj: ["def:pes"], patient: [code] }), P1({ verb: ["vidieť"], subj: ["def:pes"] }))]));

  // ---- the words typed: what each may be (its dictionary words) ----------------------------------------------------------
  function lexicon(text) {
    const toks = words(text), seen = new Set(), out = { V: [], N: [], AN: [], AV: [], P: [], PRE: [], CON: [], NUM: [], all: [] };
    // (a noun both singular and plural where its form may be either -- Zimmer, Elefanten; an adjective's degree from its
    //  cell -- wärmer: comp)
    const one = (e, pl, deg) => { const k = `${e.pos}|${e.concept}|${pl}|${deg}`; if (seen.has(k)) return; seen.add(k); if (!out.all.includes(e)) out.all.push(e); (out[e.pos] ?? []).push({ e, pl, deg }); };
    const add = (e, cell, form) => {
      if (e.pos === "N") { if (zh || !form || fold(e.word) !== form || (e.plural ?? "").split("/").some((x) => fold(x) === form)) one(e, true, ""); one(e, false, ""); return; }
      one(e, false, e.pos === "AN" ? (/sup/.test(cell ?? "") ? "sup" : /comp/.test(cell ?? "") ? "comp" : "") : "");
    };
    const cells = [];
    // (Chinese: a hit the token itself or its word with a particle -- 拍了: 拍 --, not every verb 了 is a form of)
    const look = (t) => { const hs = (d.index.get(t) ?? []).filter((h) => !zh || t.startsWith(h.e.word)); hs.forEach((h) => { add(h.e, h.cell, t); if (h.e.pos === "V") cells.push(h.cell ?? ""); }); return hs.length > 0; };
    if (zh) for (const t of toks) look(t);   // (Chinese: its words as cut)
    else for (const [i, t] of toks.entries()) {
      // (a word, its parts at an apostrophe or a hyphen -- l'enfant, n'est, est-ce --, two or three words as one entry
      //  -- a menudo, zu Hause --, else a known word it is derived from: slowly -> slow, engine/derive.js)
      const found = look(t);
      for (const part of t.split(/['’-]/)) if (part && part !== t) look(part);
      for (const n of [2, 3]) if (i + n <= toks.length) look(toks.slice(i, i + n).join(" "));
      // (derived: an unknown word's base; an adverb's adjective -- lentamente: lento, said as a manner by the realizer)
      if (derive) for (const x of derive(t, d).slice(0, 2)) if (!found || x.rule.kind === "adverb") add(x.e, "", "");
    }
    // (a verb of several words, its first inflected: prendra en photo, hará footing -- the rest typed as it is)
    for (const v of [...out.V]) for (const e of phrasal.get(v.e.word) ?? []) if (e.word.split(" ").slice(1).every((w) => toks.includes(fold(w)))) add(e, "", "");
    // (the copula: a sentence may say "be" with no word for it -- Кошка чистая)
    for (const e of d.byConcept.get("V|byť") ?? []) { add(e, "", ""); break; }
    // (a separable verb said apart -- ruft ... an: an + rufen = anrufen)
    if (!zh) {
      for (const v of [...out.V]) for (const t of toks) for (const h of d.index.get(fold(t + v.e.word)) ?? []) if (h.e.pos === "V") add(h.e, "");
      for (const a of toks) for (const b of toks) if (a !== b) for (const h of d.index.get(b + a) ?? []) if (h.e.pos === "V") add(h.e, "");   // (räumt ... auf: aufräumt)
    }
    // (the determiners typed -- one that adds no word, as "the" in Russian, says what none says: left out)
    out.dets = [...DETS, ...POSS].filter((det) => det === "none" || (detWords.get(det).length > 0 && typed(detWords.get(det), toks)));
    // (the pronouns typed -- or, where the language leaves the subject out, those of the persons the verbs typed are in:
    //  duermo -> 1sg)
    const persons = new Set(cells.flatMap((c) => c.match(/[123](sg|pl)/g) ?? []));
    const personOf = (code) => (/^[123](sg|pl)/.exec(code)?.[0] ?? (code === "formal" ? "3pl" : "3sg"));
    const said = (ws) => !!ws?.length && ws.some((w) => toks.includes(w));
    out.prons = PRONS.filter((code) => said(subjWords.get(code)) || said(objWords.get(code)) || (!subjWords.get(code)?.length && (!persons.size || persons.has(personOf(code)) || (code === "formal" && persons.has("3sg")))));
    return { toks, ...out };
  }

  // ---- the plan, and the moves that grow it ------------------------------------------------------------------------------
  const clone = (p) => JSON.parse(JSON.stringify(p));
  const key = (p) => JSON.stringify(p);
  const NP = (n, det) => `${det}:${n.e.cid}${n.pl ? "+pl" : ""}`;
  const used = (p, cid) => key(p).includes(`:${cid}"`) || key(p).includes(`:${cid}+`) || key(p).includes(`:${cid})`);
  const rolesOf = (v) => [...new Set(["patient", ...meaning.frames(v).flatMap((f) => f.slots.map((s) => s.role)).filter((r) => /^[a-z]+$/.test(r) && !/^(that|whether|inf|adj|pred|name|age|clock|fixed)$/.test(r))])];
  function moves(p, lx) {
    const out = [], ids = Object.keys(p.clauses);
    const dets = lx.dets;
    for (const id of ids) {
      const c = p.clauses[id], v = d.byConcept.get(`V|${c.args.verb[0].replace(/_/g, " ")}`)?.[0], set = (k, val) => { const q = clone(p); q.clauses[id].args[k] = [val]; out.push(q); };
      const values = Object.entries(c.args).filter(([k, vs]) => !/^(verb|tense|modal|neg|wh|link|relrole)$/.test(k) && /^[\w.]+:/.test(vs[0] ?? ""));
      // (an object, a phrase of the verb's frame -- of a noun typed, with each determiner)
      for (const n of lx.N) if (!used(p, n.e.cid)) {
        for (const r of v ? rolesOf(v) : ["patient"]) if (!c.args[r]) for (const det of dets) set(r, NP(n, det));
        if (c.args.verb[0] === "byť") for (const det of dets) set("pred", NP(n, det));
        // (a comparison: than a noun typed -- älter als die Katze)
        if (/^adj:[^+]*$/.test(c.args.pred?.[0] ?? "")) for (const det of dets) set("pred", `${c.args.pred[0]}+comp+than(${NP(n, det)})`);
        for (const rel of relations) if (typed(relWords.get(rel), lx.toks)) for (const det of dets) { if (!c.args.place) set("place", `${rel}:${NP(n, det)}`); else if (!c.args.pp) set("pp", `${rel}:${NP(n, det)}`); }
        if (DAYS.has(n.e.cid) && !c.args.time) set("time", `on-day:${n.e.cid}`);
        for (const u of ["last", "next", "every"]) if (!c.args.time) set("time", `${u}:${n.e.cid}`);
      }
      for (const code of lx.prons) if (!c.args.patient && code !== c.args.subj?.[0]) set("patient", code);
      // (an adjective on a noun of the clause, or as its predicate; a degree word on it)
      // (a comparative or superlative typed: the predicate at once -- älter als die Katze)
      // (a comparison said with words -- más/plus ... que -- has no comparative form: offered for every adjective)
      for (const a of lx.AN) if (!used(p, a.e.cid) && c.args.verb[0] === "byť") { const g = a.deg || "comp"; set("pred", `adj:${a.e.cid}+${g}`); if (g === "comp") for (const n of lx.N) if (!used(p, n.e.cid)) for (const det of dets) set("pred", `adj:${a.e.cid}+comp+than(${NP(n, det)})`); }
      for (const a of lx.AN) if (!used(p, a.e.cid)) {
        for (const [k, vs] of values) { const q = clone(p); q.clauses[id].args[k] = [`${vs[0]}+adj:${a.e.cid}`]; out.push(q); }
        if (c.args.verb[0] === "byť") set("pred", `adj:${a.e.cid}`);
        if (!c.args.manner) set("manner", a.e.cid);
      }
      for (const a of lx.AV) if (DEGREE.has(a.e.cid) && !used(p, a.e.cid)) for (const [k, vs] of [...values, ...(c.args.pred ? [["pred", c.args.pred]] : [])]) if (/adj:/.test(vs[0])) { const q = clone(p); q.clauses[id].args[k] = [`${vs[0]}+deg:${a.e.cid}`]; out.push(q); }
      for (const a of lx.AV) { const k = ADV_KEY[meaning.adverbKind(a.e)]; if (k && !c.args[k]) set(k, a.e.cid); }
      for (const t of TENSES) if (c.args.tense?.[0] !== t) set("tense", t);
      // (another verb typed in the verb's place -- the one first taken a modal of it: willst ... frühstücken)
      for (const x of lx.V) if (x.e.cid !== c.args.verb[0]) { set("verb", x.e.cid); if (MODALS.includes(c.args.verb[0]) && !c.args.modal) { const q = clone(p); q.clauses[id].args.verb = [x.e.cid]; q.clauses[id].args.modal = [c.args.verb[0]]; out.push(q); } }
      for (const x of lx.NUM) if (!c.args.time) set("time", `at-hour:${x.e.cid}`);
      if (/^adj:[^+]*$/.test(c.args.pred?.[0] ?? "")) { set("pred", `${c.args.pred[0]}+comp`); set("pred", `${c.args.pred[0]}+sup`); }
      for (const m of MODALS) if (!c.args.modal && lx.V.some((x) => x.e.cid === m)) set("modal", m);
      if (!c.args.neg) set("neg", "yes");
      if (!c.args.place) for (const pl of FIXED_PLACES) set("place", pl);
      if (/^(MAIN|YESNO)$/.test(c.type) && p.seq.at(-1) === "?") { if (c.type === "MAIN") { const q = clone(p); q.clauses[id].type = "YESNO"; out.push(q); } for (const w of WH) { const q2 = clone(p); q2.clauses[id].type = "WH"; q2.clauses[id].args.wh = [w]; out.push(q2); } }
    }
    // (a second clause: a reason, a time, a condition ... after a comma; and, but, or; a relative clause on a noun)
    if (ids.length === 1) {
      const c1 = p.clauses[ids[0]], end = p.seq.at(-1);
      for (const v of lx.V) if (v.e.cid !== c1.args.verb[0]) for (const s of [...lx.prons.filter((x) => PRONS.indexOf(x) < 9), ...lx.N.map((n) => NP(n, "def"))]) {
        for (const l of LINKS) if (typed(linkWords.get(l), lx.toks)) for (const t of [null, ...TENSES]) { const q = clone(p); q.clauses["2"] = { type: "SUB", args: { link: [l], verb: [v.e.cid], subj: [s], ...(t ? { tense: [t] } : {}) } }; q.seq = [ids[0], ",", "2", end]; out.push(q); const r = clone(q); r.seq = ["2", ",", ids[0], end]; out.push(r); }
        for (const co of COORD) for (const t of [null, c1.args.tense?.[0]].filter((x, i) => !i || x)) { const q = clone(p); q.clauses["2"] = { type: "MAIN", args: { verb: [v.e.cid], subj: [s], ...(t ? { tense: [t] } : {}) } }; q.seq = [ids[0], co, "2", end]; out.push(q); }
      }
      for (const [k, vs] of Object.entries(c1.args)) if (/^(subj|patient)$/.test(k) && /^[\w.]+:/.test(vs[0] ?? "")) for (const v of lx.V) if (v.e.cid !== c1.args.verb[0]) for (const rr of ["subj", "patient"]) {
        const q = clone(p); q.clauses[ids[0]].args[k] = [`${vs[0]}+rel(2)`]; q.clauses["2"] = { type: "REL", args: { verb: [v.e.cid], relrole: [rr], ...(rr === "patient" ? { subj: ["1sg"] } : {}) } }; out.push(q);
      }
    }
    return out;
  }

  function parse(text) {
    const lx = lexicon(text), target = lx.toks;
    if (!target.length || !lx.V.length) return null;
    // (each word typed said as typed for its concept: Wagen, not Auto)
    const undo = lx.all.filter((e) => /^(V|N|AN|AV)$/.test(e.pos)).map((e) => say.use?.(e.pos, e.concept, e.word) ?? (() => {}));
    try {
      const end = /[?？]\s*$/.test(text) ? "?" : /[!！]\s*$/.test(text) ? "!" : ".";
      const seen = new Set();
      const t0 = Date.now(), spent = () => seen.size > MAX_PLANS || Date.now() - t0 > MAX_MS;
      const judge = (plan) => { const k = key(plan); if (seen.has(k) || spent()) return null; seen.add(k); const r = saidWords(plan); return r && { plan, said: r.s, score: score(r.w, target) }; };
      // (the start: a verb typed and a subject -- a pronoun or a noun typed with each determiner)
      let beam = [];
      for (const v of lx.V) for (const s of [...lx.prons, ...lx.N.flatMap((n) => lx.dets.map((det) => NP(n, det)))]) {
        for (const t of [null, ...TENSES]) { const x = judge({ seq: ["1", end], clauses: { 1: { type: end === "?" ? "YESNO" : "MAIN", args: { verb: [v.e.cid], subj: [s], ...(t ? { tense: [t] } : {}) } } } }); if (x) beam.push(x); }
      }
      beam = beam.sort((a, b) => b.score - a.score).slice(0, BEAM);
      let best = beam[0];
      for (let depth = 0; depth < DEPTH && best && best.score < 0 && !spent(); depth++) {
        const next = [];
        // (a move that keeps the score may still lead on -- a clause's first words before its last: kept when none is better)
        const flat = [];
        for (const b of beam) for (const q of moves(b.plan, lx)) { const x = judge(q); if (x && x.score > b.score) next.push(x); else if (x && x.score === b.score) flat.push(x); }
        if (!next.length) next.push(...flat);
        if (!next.length) break;
        // (one plan a sentence: plans said alike -- a determiner Russian does not say -- would fill the beam)
        const texts = new Set();
        beam = next.sort((a, b) => b.score - a.score).filter((x) => !texts.has(x.said.text) && texts.add(x.said.text)).slice(0, BEAM);
        if (beam[0].score > best.score) best = beam[0];
        globalThis.parseTrace?.(depth, beam.map((x) => `${x.score} ${x.said.text}`));   // (a harness's look at the search)
      }
      return best ? { plan: best.plan, said: best.said, exact: best.score === 0, words: target, tried: seen.size } : null;
    } finally { undo.forEach((u) => u()); }
  }
  return { parse, lexicon };
}
