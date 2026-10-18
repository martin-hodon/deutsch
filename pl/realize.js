// POLISH SAYS A CLAUSE PLAN (world/CLAUSES.md): the words, closed words and frames of engine/lexicon.js (pl/dict.tsv,
// pl/rules/{neutral,roles,frames,prefer}.txt), the forms of pl/morph.js (pl/rules/irregular.txt). The grammar here, in
// order: the noun phrase (the CASE a role or preposition asks for, gender and number agreement of adjectives and
// possessives, a man's accusative and virile plural, the numbers' genitives), the verb (ASPECT: the imperfective for the
// present, states and habits, the perfective for a single completed event and the simple future; the past by gender
// and person -- czytałem, czytałaś --; będę + infinitive; the conditional with by; the imperative), the clause (no
// articles; the subject pronoun of the 1st and 2nd persons dropped, time words first or after the subject, nie right
// before the verb and the negated object in the genitive, objects after it -- the dative before the accusative --,
// places last; mam / nie mam; mam dwadzieścia lat; nazywam się ...; jest zimno; pada deszcz; jestem nauczycielem),
// the sentence (commas before every subordinate clause, the capital).
//
//   const pl = await loadPolish("", { meaning, vary })
//   pl.realize(plan) -> { text, tokens }

import { splitTop, call } from "../engine/realize.js";
import { loadLexicon, ROLES, DIRECTED, PERSONS } from "../engine/lexicon.js";
import { planTense } from "../engine/tense.js";
import { loadMorphology, genderOf } from "./morph.js";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const CASE_OF = { "M": "nom", "D": "gen", "C": "dat", "B": "acc", "N": "ins", "Ms": "loc", direct: "acc" };
const CASE_IDX = { nom: 0, gen: 1, dat: 2, acc: 3, ins: 4, loc: 5 };
// a 3rd person pronoun after a preposition begins with n-; the short forms become long after a preposition
const AFTER_PREP = { go: "niego", jego: "niego", mu: "niemu", jemu: "niemu", ją: "nią", jej: "niej", nim: "nim", ich: "nich", im: "nim", nimi: "nimi", mi: "mnie", cię: "ciebie", ci: "tobie", się: "siebie" };

export async function loadPolish(base, { meaning = null, vary = null } = {}) {
  const M = await loadMorphology(base + "pl/rules/irregular.txt");
  const lx = await loadLexicon(base, "pl", { meaning, vary, verbEntry: (w) => verbEntry(w) });
  const { entry, wordOf, own, sp, byWord, table, say, LIST, choose, nounKind, pick, markOf, nounOf, kindOf } = lx;
  let ctxPlan = null;
  const frameFor = (c) => lx.frameFor(c, ctxPlan);
  const verbEntry = (w) => byWord.get("V|" + w) ?? { word: w, forms: "", model: "", ipa: "" };
  const PAST = LIST("past"), FUTURE = LIST("future"), FRONT = LIST("front"), STATE = LIST("state"), MIDW = LIST("mid"), PHASE = LIST("phase"), DURATIVE = LIST("durative"), IMP_IMPF = LIST("imp-impf");
  const DAYPART = Object.fromEntries([...LIST("daypart")].map((x) => x.split(":")));
  const RAIN = Object.fromEntries([...LIST("rain")].map((x) => x.split(":")));
  const VERBADJ = Object.fromEntries([...LIST("verbadj")].map((x) => x.split(":")));
  const WEATHER = Object.fromEntries([...LIST("weather")].map((x) => x.split(":")));
  const ADVERB = Object.fromEntries([...LIST("adverb")].map((x) => x.split(":")));
  const NUM = Object.fromEntries([...LIST("num")].map((x) => x.split(":")));
  const HOUR = Object.fromEntries([...LIST("hour")].map((x) => x.split(":")));
  const MOOD = Object.fromEntries(Object.entries(table.mood ?? {}).map(([k, v]) => [k, new Set(v.map((a) => a.w))]));

  // ---- MARKINGS: a case letter or preposition+CASE -> { prep, kase } --------------------------------------------------
  const marking = (mk) => { const [a, b] = mk.includes("+") ? mk.split("+") : [null, mk]; return { prep: a, kase: CASE_OF[b] ?? "acc" }; };
  // the preposition's variant before the word: w/we, z/ze, od/ode, bez/beze, przez/przeze, nad/nade, pod/pode, przed/przede
  function prep(p, next) {
    if (!next) return p;
    if (p === "w" && /^(w|f)[^aeiouyąęó]/i.test(next)) return "we";
    if (p === "z" && (/^(z|s|ż|ś|sz|rz)[^aeiouyąęó]/i.test(next) || /^mn/i.test(next))) return "ze";
    if (/^(od|bez|przez|nad|pod|przed)$/.test(p) && /^mn/i.test(next)) return p + "e";
    return p;
  }
  const withPrep = (p, toks) => (!p ? toks : [...p.split(" ").slice(0, -1), prep(p.split(" ").at(-1), toks[0]), ...toks]);

  // ---- PRONOUNS -------------------------------------------------------------------------------------------------------
  const PRON = (code) => (table.pron?.[code]?.[0]?.w ?? "").split("/");
  const personOf = (code) => Number(PRON(code)[7] ?? 2);
  const pronForm = (code, kase, afterPrep) => { const f = PRON(code)[CASE_IDX[kase]] ?? PRON(code)[0]; return afterPrep ? AFTER_PREP[f] ?? f : f; };
  const pronGender = (code) => (/\.f$/.test(code) ? "f" : /\.n$/.test(code) ? "n" : /pl/.test(code) ? "pl" : "m");
  const isPerson = (cid) => !!cid && kindOf(cid)("person");
  const isAnimate = (cid) => !!cid && (kindOf(cid)("person") || kindOf(cid)("animal"));
  const G = (e) => (e ? genderOf(e) : "m");

  // ---- A NOUN PHRASE in a case -> { toks, g, pl, person, animate, men, pron, noun } -----------------------------------
  function np(v, kase = "nom", ctx = {}) {
    if (v == null) return { toks: [], g: "m", pl: false, person: 2 };
    const [head, ...mods] = splitTop(v);
    const tp = head.match(/^(it|them):(.+)$/);
    if (tp) { const n = entry(tp[2], "N"), g = tp[1] === "them" ? "pl" : G(n), men = tp[1] === "them" && isPerson(tp[2]) && G(n) === "m"; const code = g === "pl" ? (men ? "3pl" : "3pl.f") : g === "f" ? "3sg.f" : g === "n" ? "3sg.n" : "3sg.m"; return { toks: [pronForm(code, kase, ctx.afterPrep)], g, pl: g === "pl", person: g === "pl" ? 5 : 2, pron: v, animate: isAnimate(tp[2]), men }; }
    if (head === "one") return { toks: [], g: "n", pl: false, person: 2, pron: head, one: true };
    if (table.pron?.[head]) return { toks: [pronForm(head, kase, ctx.afterPrep)], g: pronGender(head), pl: /pl/.test(head), person: personOf(head), pron: head, animate: PERSONS.test(head), men: /^(1pl|2pl|3pl)$/.test(head) || head === "formal" };
    if (head.startsWith("name:")) return { toks: [head.slice(5)], g: "m", pl: false, person: 2, name: true, animate: true, men: false };
    const i = head.indexOf(":"), d = i < 0 ? "none" : head.slice(0, i), n = i < 0 ? head : head.slice(i + 1);
    if (n.startsWith("@")) return { toks: [verbEntry(wordOf(n.slice(1), "V")).word], g: "n", pl: false, person: 2 };
    const ne = entry(n.replace(/^~/, "").split("/")[0], "N");
    const plDet = ["all", "both", "many", "several", "few", "some"].includes(d), num = d.startsWith("num.") ? Number(NUM[sp(d.slice(4))] ?? 2) : null;
    const g0 = G(ne), person = isPerson(n) || !!ne?.person, animate = isAnimate(n) || !!ne?.animate || person;
    let pl = (mods.includes("pl") || plDet || (num != null && num !== 1) || g0 === "pl") && ne?.plural !== "-";
    const g = pl ? "pl" : g0, men = pl && person && g0 === "m";
    const sup = mods.includes("sup"), comp = mods.includes("comp"), deg = mods.find((m) => m.startsWith("deg:"));
    // a quantity word takes the genitive plural (dużo ludzi, kilka książek); a number 5+ the genitive plural, 2-4 the
    // nominative plural (dwa koty) -- men: the genitive (dwóch studentów)
    let nounCase = kase, nounPl = pl;
    const quant = table.det?.[d]?.[0]?.w?.includes("+D") ? table.det[d][0].w.split("+")[0] : null;
    const counted = num != null && num !== 1 && (kase === "nom" || kase === "acc");
    if (quant && (kase === "nom" || kase === "acc")) { nounCase = "gen"; nounPl = ne?.plural && ne.plural !== "-"; }
    if (counted && (num >= 5 || men)) { nounCase = "gen"; nounPl = true; }
    const opts = { animate, person: men || (person && !pl) };
    const noun = ne ? M.noun(ne, nounCase, nounPl, opts) : sp(n);
    const agree = (a) => (ne ? M.adj(a, nounCase, nounPl ? "pl" : g0, nounPl, opts) : a.word ?? a);
    const pre = [], post = [];
    const adjs = mods.filter((m) => m.startsWith("adj:")).map((m) => entry(m.slice(4), "AN") ?? { word: wordOf(m.slice(4), "AN") });
    // (in Polish's order, no comma -- duży stary pies; a classifying one -- of origin, of material -- after the noun:
    //  samochód niemiecki; with a degree or a comparison all before, as the plan has them)
    const ao = lx.adjOrder, plain = !deg && !sup && !comp, cumulative = plain && ao.cumulative(adjs);
    const front = plain ? adjs.filter((a) => !ao.isAfter(a)) : adjs, back = plain ? ao.after(adjs) : [];
    (cumulative ? ao.before(front) : front).forEach((a, k, list) => pre.push(...(k === 0 && deg ? [wordOf(deg.slice(4), "AV")] : []), k === 0 && (sup || comp) ? agree({ word: M.compare(a, { sup }) }) : agree(a), ...(k < list.length - 1 && !cumulative ? [","] : [])));
    post.push(...back.map(agree));
    for (const m of mods) {
      const [fn, a] = call(m);
      if (fn === "part") {   // (a participle: II the passive one agreeing -- kupiona książka --, I a relative clause)
        const [k, verb, ...ext] = splitTop(a, ","), ve = verbEntry(wordOf(verb, "V")), by = ext.find((x) => call(x)[0] === "by");
        if (k === "II") { const pf = ve.forms && !ve.forms.replace(/ się$/, "").includes(" ") ? ve.forms : ve.word, long = { word: M.conj(pf, "ppp", 0) }; pre.push(...ext.filter((x) => call(x)[0] !== "by").flatMap((x) => adverb(x, "manner", ctx)), agree(long), ...(by ? ["przez", ...np(call(by)[1], "acc", ctx).toks] : [])); }
        else if (k === "zuI") post.push(",", M.adj({ word: "który" }, "acc", g0, pl, opts), "trzeba", ve.forms || ve.word, ",");
        else { const they = M.conj(ve.word, "pres", 5).split(" "), refl = they.includes("się"); pre.push(agree({ word: they[0] + "cy" }), ...(refl ? ["się"] : [])); }   // (śmiejące się dzieci: the present participle)
      }
      else if (fn === "of" || fn === "owner.von" || fn === "owner") post.push(...np(a.replace(/^def:|^indef:/, "none:"), "gen", ctx).toks);
      else if (fn === "rel") post.push(",", ...relClause(a, { noun: n, g: g0, pl, animate, men, kase }, ctx), ",");
    }
    // the determiner (Polish has no articles: def, indef, none say nothing)
    const dt = [];
    const padj = (w) => M.pronAdj(w, nounCase, nounPl ? "pl" : g0, nounPl, opts);
    if (d === "this") dt.push(padj("ten"));
    else if (d === "every") dt.push(pl ? padj("wszystek") : M.adj({ word: "każdy" }, nounCase, g0, false, opts));
    else if (d === "all") dt.push(padj("wszystek"));
    else if (d === "which") dt.push(M.adj({ word: "który" }, nounCase, nounPl ? "pl" : g0, nounPl, opts));
    else if (d === "no") dt.push(M.adj({ word: "żaden" }, nounCase, nounPl ? "pl" : g0, nounPl, opts).replace(/^żadeny/, "żaden").replace(/^żaden(ego|emu|ym|ej|ą|ych|ymi|e|a)$/, "żadn$1"));
    else if (d === "both") dt.push(men ? "obaj" : g0 === "f" ? "obie" : "oba");
    else if (quant) dt.push(kase === "nom" || kase === "acc" ? quant : M.adj({ word: quant === "mało" ? "nieliczny" : quant === "kilka" ? "niektóry" : "liczny" }, kase, "pl", true, opts));
    else if (d.startsWith("poss.")) dt.push(padj(ctx.subjCode && ctx.subjCode === d.slice(5) && !ctx.subj ? "swój" : PRON(d.slice(5))[6]));   // (swoją matkę: the subject's own)
    else if (num != null) dt.push(num === 1 ? M.pronAdj("jeden", nounCase, g0, false, opts) : numWord(d.slice(4), num, g0, men, nounCase));
    else if (d.startsWith("name.")) post.unshift(d.slice(5));
    if (mods.includes("one")) dt.push(M.pronAdj("jeden", nounCase, g0, false, opts));
    const toks = [...dt, ...pre, noun, ...post].filter(Boolean);
    const pairs = mods.filter((m) => call(m)[0] === "pair").map((m) => splitTop(call(m)[1], ","));
    if (pairs.length) {
      const kind = pairs[0][0], gk = kind === "neither-nor" && kase === "acc" ? "gen" : kase, others = pairs.map(([, o]) => np(o, gk, ctx).toks);
      if (gk !== kase) { const me = np(head + (mods.filter((m) => !m.startsWith("pair")).length ? "+" + mods.filter((m) => !m.startsWith("pair")).join("+") : ""), gk, ctx); toks.splice(0, toks.length, ...me.toks); }
      const J = { and: ["", "i"], or: ["", ctx.question ? "czy" : "albo"], "both-and": ["i", "i"], "neither-nor": ["ani", ", ani"], "not-but": ["nie", ", tylko"], "not-only-but-also": ["nie tylko", ", ale także"], "either-or": ["albo", ", albo"] }[kind] ?? ["", kind];
      const list = [toks, ...others];
      const out = [...(J[0] ? J[0].split(" ") : []), ...list.slice(0, -1).flatMap((x, k) => [...x, ...(k < list.length - 2 ? [","] : [])]), ...J[1].split(" ").filter(Boolean), ...list[list.length - 1]];
      return { toks: out, g: "pl", pl: !/^(or|neither-nor|either-or|not-but)$/.test(kind), person: 5, animate, men: men || person, pairKind: kind };
    }
    return { toks, g, pl, person: pl ? 5 : 2, noun: ne, animate, men, det: d };
  }
  // a number word by the noun: dwa koty / dwie kobiety / dwóch studentów; pięć kotów; in an oblique case the genitive form
  function numWord(cid, num, g0, men, kase) {
    const w = wordOf(cid, "NUM");
    if (men) return { dwa: "dwóch", trzy: "trzech", cztery: "czterech" }[w] ?? (kase === "nom" || kase === "acc" ? w.replace(/ć$/, "ciu").replace(/^sto$/, "stu") : w);
    if (num === 2 && g0 === "f") return "dwie";
    return w;
  }

  // ---- THE VERB: aspect, tense, person; the chain with a modal or będę -------------------------------------------------
  const pfOf = (v) => {
    if (v.forms) return !v.forms.replace(/ się$/, "").includes(" ") ? v.forms : null;
    if (v.word.includes(" ")) { const [h, ...r] = v.word.replace(/ się$/, "").split(" "); const e = byWord.get("V|" + h); if (e?.forms && !e.forms.replace(/ się$/, "").includes(" ")) return [e.forms.replace(/ się$/, ""), ...r].join(" ") + (/ się$/.test(v.word) ? " się" : ""); }   // (iść spać -> pójść spać)
    return null;
  };
  const isState = (v) => STATE.has(v.word) || !pfOf(v);
  // the finite form of a verb for the clause: aspect by the event (a single completed one: perfective)
  function finite(v, F, p, { g = "m", pl = false, men = false, habit = false, mood = null, futureTime = false, negObj = false }) {
    const pf = pfOf(v), single = pf && !habit && !isState(v) && !(F.neg && F.tense === "present" && !futureTime) && !negObj;
    const t = F.mood === "hypo" ? "past" : F.tense ?? "present";
    const gg = pl ? (men || g === "m" ? "m" : "f") : g;
    if (mood === "past" || t === "past" || t === "perfect" || t === "pluperfect") return [M.conj(single && (t !== "past" || !DURATIVE.has(v.word)) ? pf : v.word, "past", p, { g: gg, pl })];
    if (/^future/.test(t) || (t === "present" && futureTime && pf && !habit)) return single ? [M.conj(pf, "pres", p)] : [M.conj("być", "fut", p), v.word];
    return [M.conj(v.word, "pres", p)];
  }
  const MODAL = { "môcť": { w: "móc" }, "musieť": { w: "musieć" }, "mať (povinnosť)": { adj: "powinien" }, "smieť": { w: "móc" }, "chcieť": { w: "chcieć" }, "mať rád": { w: "lubić" }, "potrebovať": { w: "musieć" } };
  // powinien powinna powinno powinni powinny + the person: powinienem, powinnaś, powinniśmy
  function powinien(p, g, pl, men) {
    const base = pl ? (men || g === "m" ? "powinni" : "powinny") : g === "f" ? "powinna" : g === "n" ? "powinno" : "powinien";
    const end = pl ? ["śmy", "ście", ""][p % 3] : p % 3 === 0 ? (g === "f" ? "m" : g === "m" ? "em" : "") : p % 3 === 1 ? (g === "f" ? "ś" : g === "m" ? "eś" : "") : "";
    return base + end;
  }
  function modalToks(cid, F, p, g, pl, men) {
    const m = MODAL[sp(cid)] ?? { w: wordOf(cid, "V") };
    const past = /^(past|perfect|pluperfect)$/.test(F.tense ?? "") || F.mood === "hypo", fut = /^future/.test(F.tense ?? "");
    if (m.adj) return [powinien(p, g, pl, men), ...(past ? [M.conj("być", "past", 2, { g: pl ? (men ? "m" : "f") : g, pl })] : fut ? [M.conj("być", "fut", p)] : [])];
    return finite(verbEntry(m.w), { ...F, tense: past ? "past" : F.tense }, p, { g, pl, men, habit: true });
  }
  // the conditional particle with its person ending (bym byś by byśmy byście by), on a link where the link takes it
  const BY = (p, pl) => "by" + (pl ? ["śmy", "ście", ""] : ["m", "ś", ""])[p % 3];

  // ---- A CLAUSE ---------------------------------------------------------------------------------------------------------
  const tenseOf = (id, plan) => planTense(id, plan, { timeWord: (t) => wordOf(t, "AV"), isPast: (w) => PAST.has(w), isFuture: (w) => FUTURE.has(w), isNearly: (v) => /^prawie$/.test(wordOf(v, "AV")), clauses: false });
  function clause(id, ctx) {
    const c = ctx.plan.clauses[id];
    if (!c) return [];
    const type = c.type, A = (k) => c.args[k]?.[0], all = (k) => c.args[k] ?? [];
    const link = A("link");
    if (!A("verb")) return type === "FRAG" ? [...np(A("np"), "nom", ctx).toks, ...all("pp").flatMap((x) => relPhrase(x.slice(0, x.indexOf(":")), x.slice(x.indexOf(":") + 1), ctx))] : [];
    let fr = frameFor(c);
    let lex = fr.v;
    const { F, hypo, futureTime } = tenseOf(id, ctx.plan);
    let verb = sp(F.verb), exist = verb === "dať" && A("subj") === "3sg.n" && A("patient") && !A("fixed");
    if (F.raise && sp(F.raise) === "potrebovať") { F.modal = F.raise; F.raise = null; }   // (nie musisz przychodzić: a raising "need" is the modal)
    if (verb === "prísť" && (F.tense ?? "present") === "present" && A("source") && !A("time")) lex = verbEntry("pochodzić");   // (pochodzimy ze Stanów)
    if (RAIN[verb]) { c.args = { ...c.args, subj: [RAIN[verb] === "-" ? "3sg.n" : "none:" + RAIN[verb]] }; lex = verbEntry("padać"); }   // (pada / padało: rain is the bare verb; pada śnieg: the noun is the subject)
    if (hypo && verb === "mať rád") { lex = verbEntry("chcieć"); fr = frameFor({ ...c, args: { ...c.args, verb: ["chcieť"] } }); }   // (chciałbym kawę)
    if ((A("subj") === "3sg.n" || (A("subj") === "one" && (hypo || /past|perfect/.test(F.tense ?? "")))) && A("patient") && verb !== "byť" && !exist && !RAIN[verb] && type === "SUB") c.args = { ...c.args, subj: ["someone"] };   // (gdyby mi to ktoś powiedział)
    const subjV = fr.f?.subjRole ? A(fr.f.subjRole) : A("subj");
    const subjDat = fr.f?.subjAs === "io" || fr.f?.subjAs === "C";   // (podoba mi się: the plan's subject in the dative)
    let subj = exist ? null : subjV ? np(subjV, subjDat ? "dat" : "nom", { ...ctx, subj: true }) : null;
    ctx = { ...ctx, subjCode: table.pron?.[subjV] ? subjV : null, subj: false };
    let p = subj?.person ?? 2, g = subj?.g ?? (type === "REL" ? ctx.head?.g : null) ?? (A("subj") === "3sg.n" ? "n" : "m"), pl = subj?.pl ?? (type === "REL" ? !!ctx.head?.pl : false), men = subj?.men ?? !!ctx.head?.men;
    if (subjDat) { p = 2; g = "n"; pl = false; }
    if (A("subj") === "formal") { p = 2; pl = false; g = "m"; subj = { ...subj, toks: ["Pan"] }; }   // (Pan: the 3rd person)
    if (A("subj") === "3sg.n" && (A("wh") === "how-late" || (verb === "byť" && A("fixed") && !fr.f?.fixed))) subj = { toks: [], person: 2, g: "n", pl: false };
    const objs = [], dats = [], phrases = [], pronObjs = [], end = [], timeEnd = [];
    const past = /^(past|perfect|pluperfect)$/.test(F.tense ?? "");
    ctx = { ...ctx, question: type === "YESNO" };
    let neg = A("neg") ? (say("neg", A("neg")) ?? "nie") : type === "INF" && link === "without" ? "nie" : null;
    let forceImpf = false;
    for (const r of fr.f?.absorb.keys() ?? []) if (/^no:/.test(A(r) ?? "")) neg = "nie";
    // (the negated direct object in the genitive: nie mam czasu, nie widzę kota)
    const negated = () => !!neg || Object.values(c.args).flat().some((x) => /^no:|^(nothing|noone)$/.test(x));
    for (const [k, vs] of Object.entries(c.args)) for (let v of vs) {
      if (!ROLES.has(k) || (exist && k === "patient") || k === fr.f?.subjRole || fr.f?.absorb.has(k) || (v === "it" && A("clause"))) continue;
      const wr = v.match(/^([a-z-]+):(.*)$/);
      if (wr && table.rel?.[wr[1]] && !table.det?.[wr[1]] && !table.pron?.[wr[1]] && !/^(it|them)$/.test(wr[1])) { phrases.push(...relPhrase(wr[1], wr[2], ctx)); continue; }
      const mk = markOf(fr, k, v), { prep: pp } = marking(mk), code = splitTop(v)[0];
      let kase = marking(mk).kase;
      if (!pp && kase === "acc" && negated()) kase = "gen";
      if (subjDat && k === "patient") { subj = { ...np(v, "nom", ctx) }; const o = subj; g = o.g; pl = o.pl; p = o.person; men = !!o.men; continue; }   // (the liked thing is the grammatical subject)
      if (/^(nothing|noone)$/.test(code)) { neg = "nie"; pronObjs.push(...withPrep(pp, [pronForm(code, kase, !!pp)])); continue; }
      if (/^no:/.test(code)) { neg = "nie"; v = v.replace(/^no:/, "none:"); }
      if (/^(something|everything|someone|this|that-one)$/.test(code) || table.pron?.[code] || /^(it|them):/.test(v) || v === "it") {
        const f = v === "it" ? pronForm("3sg.n", kase, !!pp) : /^(it|them):/.test(v) ? np(v, kase, { ...ctx, afterPrep: !!pp }).toks[0] : pronForm(code, kase, !!pp);
        (pp ? phrases : kase === "dat" ? dats : pronObjs).push(...withPrep(pp, [f])); continue;
      }
      const o = np(v, kase, { ...ctx, afterPrep: !!pp });
      // (speaking a language: po polsku)
      if (k === "patient" && o.noun && /^(język )?\S+(ski|cki)$/.test(o.noun.word) && verb === "hovoriť") { end.push("po", o.noun.word.replace(/^język /, "").replace(/ki$/, "ku")); continue; }   // (mówi po niemiecku)
      if (pp) { phrases.push(...withPrep(pp, o.toks)); continue; }
      (kase === "dat" ? dats : objs).push(...o.toks);
    }
    if (Object.values(c.args).flat().some((x) => /pair\(neither-nor,/.test(x))) neg = "nie";
    for (const x of all("pp")) { const i = x.indexOf(":"), r = x.slice(0, i); if (x.slice(i + 1) === "it" && A("clause")) continue; phrases.push(...relPhrase(r, x.slice(i + 1), ctx)); }
    for (const v of all("by")) phrases.push("przez", ...np(v, "acc", ctx).toks);
    const roleT = all("role").flatMap((v) => ["jako", ...np(v.replace(/^[a-z.]+:/, "none:"), "nom", ctx).toks]);
    const after = [];
    for (const k of ["because-of", "despite", "during", "instead-of"]) for (const v of all(k)) { const { prep: pp, kase } = marking(say("rel", k) ?? "D"); after.push(...withPrep(pp, np(v, kase, ctx).toks)); }
    // the adverbs: a sentence adverb first; a time word first in a main clause that opens the sentence, else after the
    // subject; frequency and manner before the verb; places at the end
    const front = [...roleT], mid = [];
    for (const k of ["sentence", "conn", "time", "freq", "manner", "place"]) for (const v of all(k)) {
      const t = adverb(v, k, ctx), w = t.join(" ");
      if (!t.length) continue;
      if (k === "sentence" || k === "conn") { front.push(...t); continue; }
      if (k === "time" && F.tense === "future2" && /^(jutro|pojutrze)$/.test(w)) { front.push("do", w.replace(/o$/, "a").replace(/e$/, "a")); continue; }   // (do jutra przeczyta)
      if (k === "time") { (ctx.first && type === "MAIN" && !MIDW.has(w) && !subj?.toks.includes(",") ? front : MIDW.has(w) || ((type === "SUB" || type === "REL" || type === "WHOEVER") && PAST.has(w)) || type === "WHOEVER" ? mid : timeEnd).push(...t); continue; }   // (wczoraj dałem ci ...; że wczoraj musiał; czy przyjdzie jutro; przyszedłbym wcześniej)
      if (k === "place") { (/^(tu|tutaj|tam|w domu|wszędzie)$/.test(w) && type === "MAIN" && ctx.first && !front.length && (!subj || subj.pron) ? front : end).push(...t); continue; }
      if (k === "manner" && v === "rád") { mid.push("chętnie"); continue; }
      mid.push(...t);
    }
    const habit = !!A("freq") || /^every:/.test(A("time") ?? "") || (type === "SUB" && link === "while") || MOOD.impf?.has(link);
    // the predicate: być + the instrumental of a noun (jestem nauczycielem; to jest stół: nominative), an adjective in
    // the nominative, age, the clock, the weather, jest / nie ma
    let pred = [], vtoks = null;
    const fut = /^future/.test(F.tense ?? "");
    const gPast = pl ? (men || g === "m" ? "m" : "f") : g;
    const be = (gg, ppl, person, mm = false) => (past || hypo ? [M.conj("być", "past", person, { g: ppl ? (mm || gg === "m" ? "m" : "f") : gg, pl: ppl })] : fut ? [M.conj("być", "fut", person)] : [M.conj("być", "pres", person)]);
    const by = (type === "SUB" && MOOD.by?.has(link)) || (hypo && type !== "SUB");
    const linkBy = type === "SUB" && MOOD.by?.has(link);   // (the by on the link: żebym, gdybyś -- the verb a plain ł-form)
    if (verb === "byť" && A("pred")) {
      const r = predicate(A("pred"), { g, pl, p, men, subj, neg, past: past || !!ctx.forcePast || linkBy, fut, hypo, ctx });
      vtoks = r.toks; if (r.subj) subj = r.subj;
      if (r.neg === null) neg = null;
      if (F.raise) vtoks = ["wydaje", "się", ...vtoks.slice(1)];   // (wydaje się zmęczony)
      if (linkBy) vtoks = vtoks.map((w) => w.replace(/^(był|była|było|byli|były)(em|eś|am|aś|śmy|ście)$/, "$1"));   // (żebyście byli)
    } else if (verb === "byť" && A("fixed") && !fr.f?.fixed) {
      const a = entry(A("fixed"), "AN"); vtoks = [...be("n", false, 2), a ? M.adj(a, "nom", "n") : wordOf(A("fixed"), "AN")];   // (jest ważne, że ...)
    } else if (exist) {   // jest / są + nominative; nie ma + genitive; był / nie było
      const o = np(A("patient"), neg ? "gen" : "nom", ctx);
      vtoks = neg ? [past ? "nie było" : fut ? "nie będzie" : "nie ma", ...o.toks] : [...(past ? [M.conj("być", "past", 2, { g: o.pl ? (o.men ? "m" : "f") : o.g, pl: o.pl })] : fut ? [o.pl ? "będą" : "będzie"] : [o.pl ? "są" : "jest"]), ...o.toks];
      neg = null; subj = null;
    } else if (fr.f && !byWord.has("V|" + fr.f.word) && (byWord.get(fr.f.word)?.pos === "AN" || /[yi]$/.test(fr.f.word)) && !byWord.has("AV|" + fr.f.word)) {
      // (an idiom said by an adjective: jestem głodny, jest podobny do ...)
      const a = byWord.get(fr.f.word) ?? { word: fr.f.word };
      vtoks = [...be(g, pl, p, men), M.adj(a, "nom", pl ? "pl" : g, pl, { person: men })];
    } else if (fr.f && !byWord.has("V|" + fr.f.word) && (byWord.get(fr.f.word)?.pos === "AV" || /o$/.test(fr.f.word))) {
      // (an impersonal predicate: trudno mi czytać, jest mi zimno; the plan's subject -- a verb as a noun -- after it)
      vtoks = [...(past || hypo || fut ? be("n", false, 2) : []), fr.f.word];
      const sv = !subjV || /^3sg\.n$/.test(subjV) ? [] : subjV.startsWith("none:@") || subjV.startsWith("@") ? [verbEntry(wordOf(subjV.replace(/^none:/, "").slice(1), "V")).word] : subj?.toks ?? [];
      subj = { toks: [], person: 2 }; vtoks = [vtoks[0], ...dats.splice(0), ...pronObjs.splice(0), ...vtoks.slice(1), ...sv];
    } else {
      const impf = habit || isState(lex) || forceImpf, negObj = !!neg && (!!A("patient") || pronObjs.length > 0);
      const moodPast = (type === "SUB" && MOOD.past?.has(link)) || ctx.forcePast ? "past" : null;
      const modal = F.modal ? modalToks(F.modal, F, p, g, pl, men) : null;
      const infAspect = (v) => (pfOf(v) && !habit && !isState(v) && !neg ? pfOf(v) : v.word);
      if (type === "IMP") { const ip = A("imp") === "2pl" || A("imp") === "formal"; const v = neg || IMP_IMPF.has(lex.word) ? lex.word : (pfOf(lex) ?? lex.word); vtoks = A("imp") === "formal" ? ["proszę", infAspect(lex)] : [M.conj(v, "imp", 0, { pl: ip })]; }
      else if (type === "INF" || ctx.inf) vtoks = [ctx.phase ? lex.word : infAspect(lex)];   // (zaczął mieszać: imperfective after a phase verb)
      else if (F.voice === "passive" || F.voice === "state") {
        const pf = pfOf(lex) ?? lex.word;
        const part = M.conj(pf, "ppp", 0, { g: pl ? "pl" : g, pl, person: men });
        if (modal) vtoks = [...modal, "zostać", part];
        else if (F.voice === "state") vtoks = [...be(g, pl, p, men), part];
        else if (past || hypo) vtoks = [M.conj("zostać", "past", p, { g: gPast, pl }), part];   // (dom został zbudowany)
        else if (fut) vtoks = [M.conj("zostać", "pres", p), part];
        else vtoks = [M.conj("być", "pres", p), part];
      }
      else if (F.voice === "sichlassen") vtoks = [M.conj(lex.word, "pres", pl ? 5 : 2), "się"];
      else if (F.voice === "seinzu") { vtoks = [infAspect(lex)]; if (subjV) subj = { ...np(subjV, "acc", ctx), pron: null }; if (!mid.length) mid.push("można"); }
      else if (modal) vtoks = [...modal, ...pronObjs.splice(0), ...dats.splice(0), infAspect(lex)];
      else if (F.raise) { front.unshift("wydaje się", ","); vtoks = finite(lex, F, p, { g, pl, men, habit: impf, futureTime }); }
      else vtoks = finite(lex, moodPast || linkBy || (hypo && type !== "SUB") ? { ...F, tense: "past" } : F, p, { g, pl, men, habit: impf, mood: moodPast || linkBy || hypo ? "past" : null, futureTime, negObj });
      // (the conditional: the ł-form with by + person -- czytałbym; in a żeby / gdyby clause the person is on the link:
      //  żebym czytał -- so the ł-form is the plain 3rd person's)
      if (by || linkBy) {
        const pastForm = (w) => w.replace(/(ł|ła|ło|li|ły)(em|eś|am|aś|śmy|ście)$/, "$1");
        vtoks = vtoks.map((w, k) => (k === vtoks.length - 1 || k === 0 ? pastForm(w) : w));
        if (!linkBy) vtoks = [vtoks[0] + BY(p, pl), ...vtoks.slice(1)];
      }
      if (type === "IMP" && subj?.toks.length === 0) subj = null;
    }
    vtoks = vtoks.flatMap((x) => x.split(" "));
    if (subj?.one && !vtoks.includes("się")) vtoks.push("się");   // (mówi się: the impersonal)
    if (subj?.one) subj = { ...subj, toks: [] };
    if (A("subj") === "3sg.n" && verb !== "byť" && !exist && subj && !RAIN[verb]) subj = { ...subj, toks: [] };   // (pachniało kotletami: no ono)
    if (F.raise && subj?.toks.length && !front.includes("wydaje się")) subj = { ...subj, toks: [...subj.toks, ",", "wydaje się", ","] };
    // the chain and the objects: nie before the verb, a pronoun object after the verb (before the noun objects), the
    // dative before the accusative; się after the verb
    const infT = [];
    if (A("inf") && PHASE.has(lex.word) && !A("patient")) infT.push(verbEntry(wordOf(A("inf"), "V")).word);
    else if (A("inf") && A("patient") && /^(počuť|vidieť|cítiť)$/.test(verb)) {   // (słyszałem, jak śpiewała)
      const iv = verbEntry(wordOf(A("inf"), "V")), o = np(A("patient"), "nom", ctx);
      objs.length = 0; pronObjs.length = 0;
      end.push(",", "jak", ...(o.pron && /^(1sg|2sg|1pl|2pl|3sg|3pl)/.test(o.pron) ? [] : o.toks), ...finite(iv, { ...F, tense: past ? "past" : F.tense }, o.person, { g: o.g, pl: o.pl, men: !!o.men, habit: true }));
      forceImpf = true;
    } else if (A("inf") && !(fr.f?.inf?.absorb && fr.f.word.includes(" "))) infT.push(verbEntry(wordOf(A("inf"), "V")).forms && !A("freq") ? verbEntry(wordOf(A("inf"), "V")).forms : verbEntry(wordOf(A("inf"), "V")).word);
    if (!fr.f?.fixed && A("fixed") && verb !== "byť" && own(A("fixed"), "AV")) end.unshift(wordOf(A("fixed"), "AV"));
    const nothing = pronObjs.filter((x) => /^ni/.test(x)), others = pronObjs.filter((x) => !/^ni/.test(x));
    // (the subject pronoun of the 1st and 2nd person is not said: the verb says it -- czytam, czytałeś)
    const dropPron = subj?.pron && /^(1sg|2sg|1pl|2pl|3sg\.[mfn]|3pl(\.f)?|it:|them:)/.test(subj.pron) && !ctx.keepSubj;
    let subjT = dropPron ? [] : [...(subj?.toks ?? [])];
    // (the pronoun objects right after the verb; się before the verb when a word of the clause stands before it -- on się
    //  myje, jak się nazywasz, że się nie myje --, else right after the finite verb: myję się, nie myję się)
    const sie = vtoks.includes("się"), vt = vtoks.filter((x) => x !== "się");
    const shortDats = dats.filter((x) => /^(mi|ci|mu|jej|nam|wam|im)$/.test(x));
    for (const x of shortDats) dats.splice(dats.indexOf(x), 1);
    const pronFirst = type === "SUB" || type === "REL";   // (gdybym to wiedział; który mu dałem)
    const pronAfter = pronFirst ? [] : [...others, ...shortDats];
    const verbPart = [...nothing, ...(pronFirst ? [...others, ...shortDats] : []), ...(neg ? [neg] : []), ...vt, ...pronAfter];
    const vFirst = nothing.length + (pronFirst ? others.length + shortDats.length : 0) + (neg ? 1 : 0) + 1;   // (after the finite verb)
    const S = (...parts) => {   // the clause's tokens with się placed: parts = the tokens before the verb part, then the verb part, then the rest
      const [before, vp, ...after] = parts;
      if (!sie) return [...before, ...vp, ...after.flat()];
      return before.length ? [...before, "się", ...vp, ...after.flat()] : [...vp.slice(0, vFirst), "się", ...vp.slice(vFirst), ...after.flat()];
    };
    const rest = [...infT, ...dats, ...objs, ...timeEnd, ...phrases, ...end, ...after];   // (mieszka teraz w Niemczech: the time before the place)
    const inner = A("clause") && !(ctx.plan.seq ?? []).includes(A("clause")) ? innerClause(A("clause"), fr, ctx) : [];
    // the special predicates
    if (verb === "volať sa" && (A("pred")?.startsWith("name:") || A("wh") === "how")) {
      const lp = subj?.person ?? 2, v = M.conj("nazywać", "pres", lp), st = dropPron ? [] : subj?.toks ?? [];
      return A("wh") === "how" ? ["jak", ...st, "się", v] : st.length ? [...st, "się", v, A("pred").slice(5)] : [v, "się", A("pred").slice(5)];   // (jak się nazywasz? nazywam się Anna)
    }
    const lk0 = type === "SUB" && link && !ctx.skipLink ? (choose(table.link[link] ?? [{ w: link, weight: 1 }]).w).split(" ") : [];
    const lk = linkBy && lk0.length ? [...lk0.slice(0, -1), lk0.at(-1).replace(/by$/, BY(p, pl))] : lk0;
    if (type === "WH" && A("wh") === "how-late") return whWords("how-late");
    if (type === "WH" && A("wh") === "whence" && verb === "prísť" && (F.tense ?? "present") === "present") return [...whWords("whence"), M.conj("być", "pres", p)];   // (skąd jesteś?)
    if (type === "WH") { const wh = whWords(A("wh"), c, fr, ctx); return !c.args.subj || A("wh") === "who" ? S([...front, ...wh, ...mid], verbPart, rest, inner) : S([...front, ...wh, ...subjT, ...mid], verbPart, rest, inner); }
    if (type === "YESNO") return subj?.pron === "formal" ? S(["czy", ...front, ...mid], verbPart.slice(0, vFirst), subjT, verbPart.slice(vFirst), rest, inner) : S([...front, ...subjT, ...mid], verbPart, rest, inner);   // (czy mógłby Pan mi pomóc? możesz mi pomóc? -- czy only with Pan)
    if (type === "IMP") return S([], verbPart, rest, front, mid, inner);
    if (type === "INF" && link === "without") return ["nie", M.conj(pfOf(lex) ?? lex.word, "ger", 0, { perfective: !!pfOf(lex) }), ...(objs.length ? ["ani"] : []), ...rest, ...inner];   // (nie powiedziawszy ani słowa)
    if (type === "INF" || ctx.inf) {
      const l = link ? say("link", link) : null;
      return S([...(l ? l.split(" ") : []), ...mid], verbPart, rest, inner);
    }
    if (type === "SUB" && link === "by-doing") return [M.conj(lex.word, "ger"), ...rest, ...inner];
    if (type === "SUB" && link === "whether") return S(["czy", ...subjT, ...mid], verbPart, rest, inner);
    if (type === "SUB" && link === "the-more") return S(["im", ...mid, ...subjT], verbPart, rest);
    if (type === "MAIN" && link === "the-more-so") return S(["tym", ...mid, ...subjT], verbPart, rest);
    if (type === "WHOEVER") return S(["kto", ...mid], verbPart, rest, inner);
    if (type === "REL") return relBody(c, fr, { verbPart: sie ? ["się", ...verbPart] : verbPart, rest, subjT, mid }, ctx);
    if (type === "SUB" && A("wh")) { const wh = whWords(A("wh"), c, fr, ctx); return S([...wh, ...subjT, ...mid], verbPart, rest, inner); }
    if (A("drop") === "yes" && ctx.dropOK) return S([...lk, ...front, ...mid], verbPart, rest, inner);
    if (RAIN[verb] || ctx.afterQuote) return S([...lk, ...front, ...mid], verbPart, subjT, rest, inner);
    if (front.length === 1 && FRONT.has(front[0]) && subj && !subj.pron && !subj.name && !subj.toks.includes(",") && !rest.length && !inner.length && type === "MAIN" && !F.voice) return S([...lk, ...front, ...mid], verbPart, subjT);   // (teraz nadeszła decydująca chwila)
    return S([...lk, ...front, ...subjT, ...mid], verbPart, rest, inner);
  }
  function whWords(w, c, fr, ctx) {
    if (!w) return [];
    const rw = w.match(/^([\w.]+):(who|what)$/);
    if (rw && ROLES.has(rw[1])) { const { prep: pp, kase } = marking(markOf(fr, rw[1], null)); return withPrep(pp, [pronForm(rw[2] === "who" ? "who" : "something", kase, !!pp).replace(/^coś$/, "co").replace(/ś$/, "")]); }
    const i = w.indexOf(":");
    if (i > 0) { const q = w.slice(0, i), spec = w.slice(i + 1).replace(/^[AN]\./, ""), o = np(spec.replace(/^[a-z.]+:/, "none:"), q === "how-many" ? "gen" : "acc", ctx); return [...(q === "which" ? [M.adj({ word: "który" }, "acc", o.g === "pl" ? "pl" : o.g, o.pl, { animate: o.animate, person: o.men })] : (say("wh", q) ?? q).split(" ")), ...o.toks]; }
    return (say("wh", w) ?? w).split(" ");
  }
  // the predicate: a noun in the instrumental (jestem nauczycielem; to jest stół: nominative after to), an adjective in
  // the nominative (comparative + niż; naj-), age (mam dwadzieścia lat), the clock (jest ósma), the weather (jest zimno)
  function predicate(v, { g, pl, p, men, subj, neg, past, fut, hypo, ctx }) {
    const [head, ...mods] = splitTop(v);
    const gg = pl ? (men || g === "m" ? "m" : "f") : g;
    const beT = past || hypo ? [M.conj("być", "past", p, { g: gg, pl })] : fut ? [M.conj("być", "fut", p)] : [M.conj("być", "pres", p)];
    if (head.startsWith("age:")) { const n = Number(NUM[sp(head.slice(4))] ?? 0), u = n === 1 ? "rok" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "lata" : "lat"; return { toks: [past ? M.conj("mieć", "past", p, { g: gg, pl }) : fut ? [M.conj("być", "fut", p), "mieć"].join(" ") : M.conj("mieć", "pres", p), wordOf(head.slice(4), "NUM"), u] }; }
    if (head.startsWith("clock:")) { const h = HOUR[sp(head.slice(6))] ?? wordOf(head.slice(6), "NUM"); return { toks: [past ? "była" : "jest", h], subj: { toks: [], person: 2 } }; }
    if (head.startsWith("name:")) return { toks: [...beT, head.slice(5)] };
    if (!head.startsWith("adj:")) {
      const o = np(v, subj?.pron === "this" ? "nom" : "ins", ctx);
      return { toks: [...(neg ? ["nie"] : []), ...beT, ...o.toks], neg: null };
    }
    const a = entry(head.slice(4), "AN") ?? { word: wordOf(head.slice(4), "AN") };
    const deg = mods.find((m) => m.startsWith("deg:"));
    if (subj?.pron === "3sg.n" && WEATHER[a.word]) return { toks: [past ? "było" : fut ? "będzie" : "jest", WEATHER[a.word]], subj: { toks: [], person: 2 } };
    const target = (f) => { const m = mods.find((x) => call(x)[0] === f); if (!m) return []; const t = call(m)[1]; return table.pron?.[t] ? [pronForm(t, "nom")] : np(t, "nom", ctx).toks; };
    const second = mods.map(call).find(([f]) => f === "but" || f === "and");
    if (VERBADJ[a.word] && !deg && !mods.length) return { toks: [M.conj(VERBADJ[a.word], "past", p, { g: gg, pl })] };   // (zmęczyłem się)
    const form = M.adj(a, "nom", pl ? "pl" : g, pl, { person: men });
    const tail = second ? [...(second[0] === "but" ? [",", "ale"] : ["i"]), M.adj(entry(second[1], "AN") ?? { word: wordOf(second[1], "AN") }, "nom", pl ? "pl" : g, pl, { person: men })] : [];
    if (mods.includes("comp.bare")) return { toks: [...beT, M.adj({ word: M.compare(a) }, "nom", pl ? "pl" : g, pl, { person: men })] };
    if (mods.includes("comp")) return { toks: [...beT, M.adj({ word: M.compare(a) }, "nom", pl ? "pl" : g, pl, { person: men }), "niż", ...target("than")] };
    if (mods.includes("so")) return { toks: [...beT, "tak", form, ",", "jak", ...target("as")] };
    if (mods.includes("sup")) return { toks: [...beT, M.adj({ word: M.compare(a, { sup: true }) }, "nom", pl ? "pl" : g, pl, { person: men })] };
    return { toks: [...beT, ...(deg ? [wordOf(deg.slice(4), "AV")] : []), form, ...tail] };
  }
  const adverbOf = (a) => ADVERB[a.word] ?? M.adverb(a);
  function adverb(v, k, ctx) {
    if (v === "home") return ["w", "domu"];
    if (v.startsWith("adj:")) return adverbOf(entry(v.slice(4), "AN") ?? { word: wordOf(v.slice(4), "AN") }).split(" ");
    const [h, ...a] = v.split(":");
    if (!a.length) { const e = own(v, "AV") ?? own(v, "PAR") ?? own(v, "PHR"); if (e) return e.word.split(" "); const j = own(v, "AN"); return (j ? adverbOf(j) : wordOf(v, "AV")).split(" "); }
    if (table.time?.[h]) {
      const n = (x) => entry(x, "N") ?? { word: wordOf(x, "N"), gender: "m", plural: "" };
      if (h === "on-day") { const x = n(a[0]); return DAYPART[x.word] ? DAYPART[x.word].split(" ") : withPrep("w", [M.noun(x, "acc")]); }   // (w poniedziałek; wieczorem)
      if (h === "in-period") { const x = n(a[0]); return DAYPART[x.word] ? DAYPART[x.word].split(" ") : /^(lato|zima|wiosna|jesień)$/.test(x.word) ? (x.word === "lato" ? ["latem"] : x.word === "zima" ? ["zimą"] : x.word === "wiosna" ? ["wiosną"] : ["jesienią"]) : withPrep("w", [M.noun(x, "loc")]); }   // (w maju, latem)
      if (h === "at-hour") return ["o", (HOUR[sp(a[0])] ?? wordOf(a[0], "NUM")).replace(/a$/, "ej")];   // (o ósmej)
      if (h === "date") return [a[0], M.noun(n(a[1]), "gen")];
      if (h === "last" || h === "next") { const x = n(a[0]), adj = { word: h === "last" ? (x.gender === "ż" ? "zeszły" : "zeszły") : "przyszły" }, week = x.word === "tydzień"; return week || x.word === "rok" || x.word === "miesiąc" ? [withPrep("w", [M.adj(adj, "loc", genderOf(x), false)])[0], M.adj(adj, "loc", genderOf(x), false), M.noun(x, "loc")] : [M.adj(adj, "acc", genderOf(x), false), M.noun(x, "acc")]; }
      if (h === "every") { const x = n(a[0]); return [M.adj({ word: "każdy" }, "acc", genderOf(x), false), M.noun(x, "acc")]; }
      const count = counted(a[0], a[1]);
      if (h === "since") return ["od", ...counted(a[0], a[1], "gen")];
      if (h === "ago") return [...count, "temu"];
      return ["za", ...count];
    }
    if (table.rel?.[h]) return relPhrase(h, a.join(":"), ctx);
    return [sp(v)];
  }
  // a counted noun: dwa lata, pięć lat, jeden tydzień (the accusative; `gen` after od: od dwóch lat)
  function counted(numCid, unitCid, kase = "acc") {
    const num = Number(NUM[sp(numCid)] ?? 2), u = entry(unitCid, "N") ?? { word: wordOf(unitCid, "N"), gender: "m", plural: "" };
    if (num === 1) return [M.pronAdj("jeden", kase, genderOf(u), false), M.noun(u, kase)];
    const w = kase === "gen" ? ({ dwa: "dwóch", trzy: "trzech", cztery: "czterech", pięć: "pięciu", sześć: "sześciu", dziesięć: "dziesięciu" }[wordOf(numCid, "NUM")] ?? wordOf(numCid, "NUM")) : num === 2 && genderOf(u) === "f" ? "dwie" : wordOf(numCid, "NUM");
    return [w, num <= 4 && kase !== "gen" ? M.noun(u, "nom", true) : M.noun(u, "gen", true)];
  }
  function relPhrase(r, v, ctx) {
    const h = splitTop(v)[0], mk0 = pick(table.rel?.[r] ?? [{ w: "B" }], h);
    const placeLike = nounKind(h)("place") || kindOf(nounOf(v))("country") || kindOf(nounOf(v))("room") || kindOf(nounOf(v))("container") || kindOf(nounOf(v))("settlement") || kindOf(nounOf(v))("vehicle");
    const mk = r === "from" && !placeLike && !nounKind(h)("person") ? "od+D" : mk0, { prep: pp, kase } = marking(mk);   // (od gorąca: from what is no place)
    if (table.pron?.[h]) return withPrep(pp, [pronForm(h, kase, !!pp)]);
    const o = np(v, kase, { ...ctx, afterPrep: !!pp });
    if (r === "by" && nounKind(h)("vehicle")) return np(v.replace(/^def:/, "none:"), "ins", ctx).toks;   // (samochodem)
    return withPrep(pp, o.toks);
  }
  function innerClause(id, fr, ctx) {
    const c = ctx.plan.clauses[id];
    if (!c) return [];
    if (c.type === "INF") return clause(id, { ...ctx, inf: true, phase: PHASE.has(fr.v?.word) });
    const parent = Object.values(ctx.plan.clauses).find((o) => (o.args.clause ?? []).includes(id));
    const pSubj = parent && (fr.f?.subjRole ? parent.args[fr.f.subjRole]?.[0] : parent.args.subj?.[0]);
    if (c.type === "SUB" && c.args.link?.[0] === "that" && fr.f?.that?.subj && pSubj && c.args.subj?.[0] === pSubj) return [",", "żeby", ...clause(id, { ...ctx, inf: true, skipLink: true })];
    if (c.type === "SUB" && c.args.link?.[0] === "that" && (fr.f?.that?.subj || (parent?.args.verb?.[0] === "byť" && parent.args.fixed))) { const cc = { ...c, args: { ...c.args, link: ["so-that"] } }; ctx.plan.clauses[id] = cc; const out = clause(id, ctx); ctx.plan.clauses[id] = c; return [",", ...out]; }
    if (c.type === "SUB") return [",", ...clause(id, ctx)];
    if (c.type === "REP") return [",", "że", ...clause(id, ctx)];
    return clause(id, ctx);
  }
  function relClause(id, head, ctx) { return ctx.plan?.clauses[id] ? clause(id, { ...ctx, head }) : []; }
  // the relative pronoun który agrees with its head in gender and number, its case is the role's
  function relBody(c, fr, { verbPart, rest, subjT, mid }, ctx) {
    const role = c.args.relrole?.[0] ?? "subj", head = ctx.head ?? { g: "m", pl: false };
    const kt = (kase, pp = null) => withPrep(pp, [M.adj({ word: "który" }, kase, head.g === "pl" ? "pl" : head.g, head.pl, { animate: head.animate, person: head.men })]);
    if (role === "subj") return [...kt("nom"), ...mid, ...verbPart, ...rest];
    if (role === "owner") return [...kt("gen"), ...subjT, ...mid, ...verbPart, ...rest];
    if (role === "where") return ["gdzie", ...subjT, ...mid, ...verbPart, ...rest];
    if (role === "what") return ["co", ...subjT, ...mid, ...verbPart, ...rest];
    const { prep: pp, kase } = marking(ROLES.has(role) ? markOf(fr, role, null) : "B");
    return [...kt(kase, pp), ...subjT, ...mid, ...verbPart, ...rest];
  }

  // ---- THE SENTENCE ------------------------------------------------------------------------------------------------------
  function realize(plan) {
    plan = lx.agree(plan);
    const ctx = { plan: { ...plan, clauses: { ...plan.clauses } } }, toks = [];
    ctxPlan = ctx.plan;
    const seq = plan.seq ?? [];
    let afterClause = false;
    for (let i = 0; i < seq.length; i++) {
      const t = seq[i], c = ctx.plan.clauses[t];
      if (c) {
        if (afterClause && toks.at(-1) !== "," && !/^[.?!:]$/.test(toks.at(-1) ?? "") && (c.type === "SUB" || (c.type === "INF" && c.args.link) || c.type === "REL")) toks.push(",");
        toks.push(...clause(t, { ...ctx, dropOK: true, first: !toks.length || /^[.?!„]$/.test(toks.at(-1)), afterMain: afterClause, afterQuote: seq[i - 1] === "," && seq[i - 2] === "“" }));
        afterClause = true;
      } else if (t === "„") { toks.push("„"); afterClause = false; }
      else if (t === "“") toks.push("”");
      else if (/^[,.?!:–]$/.test(t)) { toks.push(t === "–" ? "—" : t); if (/[.?!]/.test(t)) afterClause = false; }
      else if (table.coord?.[t]) { if (/^(and|or)$/.test(t) && toks.at(-1) === ",") toks.pop(); toks.push(say("coord", t)); afterClause = false; }
      else { const e = own(t, "INT") ?? own(t, "PHR") ?? own(t, "PAR") ?? own(t, "AV"), j = own(t, "AN"); toks.push(e ? e.word : j ? adverbOf(j) : wordOf(t, "INT")); }
    }
    return assemble(toks);
  }
  function assemble(toks) {
    const words = toks.filter((t) => t != null && t !== "").flatMap((t) => (/^[„”]$/.test(t) ? [t] : t.split(" "))).filter(Boolean);
    const out = [];
    for (let k = 0; k < words.length; k++) {
      const w = words[k];
      if (w === "," && (out.at(-1) === "," || !out.length)) continue;
      if (/^[.?!]$/.test(w) && out.at(-1) === ",") out.pop();
      out.push(w);
    }
    let text = "", start = true;
    for (const w of out) {
      const glue = /^[,.?!:;”]$/.test(w) || !text || text.endsWith("„") || text.endsWith("-") || (w === "," && text.endsWith("”"));
      text += (glue ? "" : " ") + (start && /^\p{L}/u.test(w) ? cap(w) : w);
      if (/\p{L}/u.test(w)) start = false;
      if (/^[.?!]$/.test(w) || w === "„") start = true;
      if (w === "”") start = false;
    }
    text = text.replace(/ ,/g, ",").replace(/„ /g, "„").replace(/ ”/g, "”");
    return { text: cap(text), tokens: out.map((w) => ({ w, ipa: lx.ipaOf(w) })) };
  }
  return { realize, word: entry, use: lx.use };
}

export const load = loadPolish;
