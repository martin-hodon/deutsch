// RUSSIAN SAYS A CLAUSE PLAN (world/CLAUSES.md): the words, closed words and frames of engine/lexicon.js (ru/dict.tsv,
// ru/rules/{neutral,roles,frames,prefer}.txt), the forms of ru/morph.js (ru/rules/irregular.txt). The grammar here, in
// order: the noun phrase (the CASE a role or preposition asks for, gender and number agreement of adjectives and
// possessives, animacy, the numbers' genitives), the verb (ASPECT: the imperfective for the present, states and habits,
// the perfective for a single completed event and the simple future; the past by gender; буду + infinitive; бы; the
// imperative), the clause (no articles; the subject first, time words first or after it, не before the verb, objects
// after it -- the dative before the accusative --, places last; у меня есть / нет; мне двадцать лет; меня зовут ...),
// the sentence (commas before every subordinate clause, the capital).
//
//   const ru = await loadRussian("", { meaning, vary })
//   ru.realize(plan) -> { text, tokens }

import { splitTop, call } from "../engine/realize.js";
import { loadLexicon, ROLES, DIRECTED, PERSONS } from "../engine/lexicon.js";
import { planTense } from "../engine/tense.js";
import { loadMorphology, genderOf } from "./morph.js";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const CASE_OF = { "Н": "nom", "Р": "gen", "Д": "dat", "В": "acc", "Т": "ins", "П": "prep", direct: "acc" };
const CASE_IDX = { nom: 0, gen: 1, dat: 2, acc: 3, ins: 4, prep: 5 };
const VOWEL_START = /^[аэоуиеёюяАЭОУИЕЁЮЯ]/;

export async function loadRussian(base, { meaning = null, vary = null } = {}) {
  const M = await loadMorphology(base + "ru/rules/irregular.txt");
  const lx = await loadLexicon(base, "ru", { meaning, vary, verbEntry: (w) => verbEntry(w) });
  const { entry, wordOf, own, sp, byWord, table, say, LIST, choose, nounKind, pick, markOf, nounOf, kindOf } = lx;
  let ctxPlan = null;
  const frameFor = (c) => lx.frameFor(c, ctxPlan);
  const verbEntry = (w) => byWord.get("V|" + w) ?? { word: w, forms: "", model: "", ipa: "" };
  const PAST = LIST("past"), FUTURE = LIST("future"), FRONT = LIST("front"), STATE = LIST("state"), DAYPART = LIST("daypart");
  const NA = LIST("na"), IMP_IMPF = LIST("imp-impf"), RAIN = Object.fromEntries([...LIST("rain")].map((x) => x.split(":"))), MIDW = LIST("mid"), PHASE = LIST("phase");
  const SHORT = Object.fromEntries([...LIST("short")].map((x) => { const [a, f] = x.split(":"); return [a, f.split(",")]; }));
  const VERBADJ = Object.fromEntries([...LIST("verbadj")].map((x) => x.split(":")));
  const WEATHER = Object.fromEntries([...LIST("weather")].map((x) => x.split(":")));
  const ADVERB = Object.fromEntries([...LIST("adverb")].map((x) => x.split(":")));
  const NUM = Object.fromEntries([...LIST("num")].map((x) => x.split(":")));
  const MOOD = Object.fromEntries(Object.entries(table.mood ?? {}).map(([k, v]) => [k, new Set(v.map((a) => a.w))]));

  // ---- MARKINGS: a case letter or preposition+CASE -> { prep, kase } --------------------------------------------------
  const marking = (mk) => { const [a, b] = mk.includes("+") ? mk.split("+") : [null, mk]; return { prep: a, kase: CASE_OF[b] ?? "acc" }; };
  // the preposition's variant before the word: о/об, в/во, с/со, к/ко
  function prep(p, next) {
    if (!next) return p;
    if (p === "о" && VOWEL_START.test(next)) return "об";
    if (p === "в" && /^(в|ф)[^аэоуиеёюяы]/i.test(next)) return "во";
    if (p === "с" && /^(с|з|ш|ж)[^аэоуиеёюяы]|^мн/i.test(next)) return "со";
    if (p === "к" && /^мн/i.test(next)) return "ко";
    return p;
  }
  const withPrep = (p, toks, noun = null) => {
    if (!p) return toks;
    let last = p.split(" ").at(-1);
    if (noun && NA.has(noun.word)) last = last === "в" ? "на" : last === "из" ? "с" : last;   // (на работу, на почте, с вокзала)
    return [...p.split(" ").slice(0, -1), prep(last, toks[0]), ...toks];
  };

  // ---- PRONOUNS -------------------------------------------------------------------------------------------------------
  const PRON = (code) => (table.pron?.[code]?.[0]?.w ?? "").split("/");
  const personOf = (code) => Number(PRON(code)[7] ?? 2);
  const pronForm = (code, kase, afterPrep) => { let f = PRON(code)[CASE_IDX[kase]] ?? PRON(code)[0]; if (afterPrep && /^(3sg|3pl|that-one)/.test(code) && kase !== "prep" && /^(е|и)/.test(f)) f = "н" + f; return f; };
  const pronGender = (code) => (/\.f$/.test(code) ? "f" : /\.n$/.test(code) ? "n" : /pl/.test(code) ? "pl" : "m");
  const isAnimate = (cid) => !!cid && (kindOf(cid)("person") || kindOf(cid)("animal"));
  const G = (e) => (e ? genderOf(e) : "m");

  // ---- A NOUN PHRASE in a case -> { toks, g, pl, person, animate, pron, noun } ----------------------------------------
  function np(v, kase = "nom", ctx = {}) {
    if (v == null) return { toks: [], g: "m", pl: false, person: 2 };
    const [head, ...mods] = splitTop(v);
    const tp = head.match(/^(it|them):(.+)$/);
    if (tp) { const n = entry(tp[2], "N"), g = tp[1] === "them" ? "pl" : G(n); const code = g === "pl" ? "3pl" : g === "f" ? "3sg.f" : g === "n" ? "3sg.n" : "3sg.m"; return { toks: [pronForm(code, kase, ctx.afterPrep)], g, pl: g === "pl", person: g === "pl" ? 5 : 2, pron: v, animate: isAnimate(tp[2]) }; }
    if (head === "one") return { toks: [], g: "pl", pl: true, person: 5, pron: head, one: true };
    if (table.pron?.[head]) return { toks: [pronForm(head, kase, ctx.afterPrep)], g: pronGender(head), pl: /pl/.test(head), person: personOf(head), pron: head, animate: PERSONS.test(head) };
    if (head.startsWith("name:")) return { toks: [head.slice(5)], g: "m", pl: false, person: 2, name: true, animate: true };
    const i = head.indexOf(":"), d = i < 0 ? "none" : head.slice(0, i), n = i < 0 ? head : head.slice(i + 1);
    if (n.startsWith("@")) return { toks: [verbEntry(wordOf(n.slice(1), "V")).word], g: "n", pl: false, person: 2 };
    const ne = entry(n.replace(/^~/, "").split("/")[0], "N");
    const plDet = ["all", "both", "many", "several", "few", "some"].includes(d), num = d.startsWith("num.") ? Number(NUM[sp(d.slice(4))] ?? 2) : null;
    const g0 = G(ne), animate = isAnimate(n) || !!ne?.animate;
    let pl = (mods.includes("pl") || plDet || (num != null && num !== 1) || g0 === "pl") && ne?.plural !== "-";
    const g = pl ? "pl" : g0;
    const sup = mods.includes("sup"), comp = mods.includes("comp"), deg = mods.find((m) => m.startsWith("deg:"));
    // a quantity word takes the genitive (много людей, несколько книг); a number 2-4 the genitive singular, 5+ the plural
    let nounCase = kase, nounPl = pl;
    const quant = table.det?.[d]?.[0]?.w?.includes("+Р") ? table.det[d][0].w.split("+")[0] : null;
    const counted = num != null && num !== 1 && (kase === "nom" || kase === "acc");
    if (quant && (kase === "nom" || kase === "acc")) { nounCase = "gen"; nounPl = ne?.plural && ne.plural !== "-" ? true : false; }
    if (counted) { nounCase = "gen"; nounPl = num >= 5; }
    const noun = ne ? M.noun(ne, nounCase, nounPl, { animate }) : sp(n);
    const agree = (a) => (ne ? M.adj(a, nounCase, nounPl ? "pl" : g0, nounPl, { animate }) : a.word ?? a);
    const pre = [], post = [];
    const adjs = mods.filter((m) => m.startsWith("adj:")).map((m) => entry(m.slice(4), "AN") ?? { word: wordOf(m.slice(4), "AN") });
    const cumulative = !sup && !comp && lx.adjOrder.cumulative(adjs);   // (in Russian's order, no comma: большая старая собака)
    (cumulative ? lx.adjOrder.before(adjs) : adjs).forEach((a, k) => pre.push(...(k === 0 && deg ? [wordOf(deg.slice(4), "AV")] : []), ...(k === 0 && sup ? [M.adj({ word: "самый" }, nounCase, nounPl ? "pl" : g0, nounPl, { animate })] : []), k === 0 && comp ? M.compare(a) : agree(a), ...(k < adjs.length - 1 && !cumulative ? [","] : [])));
    for (const m of mods) {
      const [fn, a] = call(m);
      if (fn === "part") {   // (a participle: II the passive participle agreeing -- купленная книга --, I a relative clause)
        const [k, verb, ...ext] = splitTop(a, ","), ve = verbEntry(wordOf(verb, "V")), by = ext.find((x) => call(x)[0] === "by");
        if (k === "II") { const pf = ve.forms && !ve.forms.includes(" ") ? ve.forms : ve.word, sh = M.conj(pf, "ppp"), long = { word: (/н$/.test(sh) ? sh + "ный" : sh + "ый").replace(/нный$/, "нный") }; pre.push(...ext.filter((x) => call(x)[0] !== "by").flatMap((x) => adverb(x, "manner", ctx)), agree(long), ...(by ? np(call(by)[1], "ins", ctx).toks : [])); }
        else if (k === "zuI") post.push(",", M.adj({ word: "который" }, "acc", g0, pl, { animate }), "надо", ve.forms || ve.word, ",");
        else post.push(",", M.adj({ word: "который" }, "nom", g0, pl), M.conj(ve.word, "pres", pl ? 5 : 2, { stressedEnd: M.endStressed(ve) }), ",");
      }
      else if (fn === "of" || fn === "owner.von" || fn === "owner") post.push(...np(a.replace(/^def:|^indef:/, "none:"), "gen", ctx).toks);
      else if (fn === "rel") post.push(",", ...relClause(a, { noun: n, g: g0, pl, animate, kase }, ctx), ",");
    }
    // the determiner (Russian has no articles: def, indef, none say nothing)
    const dt = [];
    const padj = (w) => M.pronAdj(w, nounCase, nounPl ? "pl" : g0, nounPl, { animate });
    if (d === "this") dt.push(padj("этот"));
    else if (d === "every") dt.push(pl ? padj("весь") : M.adj({ word: "каждый" }, nounCase, g0, false, { animate }));
    else if (d === "all") dt.push(padj("весь"));
    else if (d === "which") dt.push(M.adj({ word: "какой" }, nounCase, nounPl ? "pl" : g0, nounPl, { animate }));
    else if (d === "no") dt.push(M.adj({ word: "никакой" }, nounCase, nounPl ? "pl" : g0, nounPl, { animate }));
    else if (d === "both") dt.push(g0 === "f" ? "обе" : "оба");
    else if (quant) dt.push(kase === "nom" || kase === "acc" ? quant : M.adj({ word: quant === "мало" ? "немногий" : quant === "несколько" ? "некоторый" : "многий" }, kase, "pl", true, { animate }));
    else if (d.startsWith("poss.")) dt.push(padj(ctx.subjCode && ctx.subjCode === d.slice(5) && !ctx.subj ? "свой" : PRON(d.slice(5))[6]));   // (свою мать: the subject's own)
    else if (num != null) dt.push(num === 1 ? M.pronAdj("один", nounCase, g0, false, { animate }) : num === 2 && g0 === "f" ? "две" : wordOf(d.slice(4), "NUM"));
    else if (d.startsWith("name.")) post.unshift(d.slice(5));
    if (mods.includes("one")) dt.push(M.pronAdj("один", nounCase, g0, false, { animate }));
    const toks = [...dt, ...pre, noun, ...post].filter(Boolean);
    const pairs = mods.filter((m) => call(m)[0] === "pair").map((m) => splitTop(call(m)[1], ","));
    if (pairs.length) {
      const kind = pairs[0][0], gk = kind === "neither-nor" && kase === "acc" ? "gen" : kase, others = pairs.map(([, o]) => np(o, gk, ctx).toks);
      if (gk !== kase) { const me = np(head + (mods.filter((m) => !m.startsWith("pair")).length ? "+" + mods.filter((m) => !m.startsWith("pair")).join("+") : ""), gk, ctx); toks.splice(0, toks.length, ...me.toks); }
      const J = { and: ["", "и"], or: ["", "или"], "both-and": ["и", "и"], "neither-nor": ["ни", ", ни"], "not-but": ["не", ", а"], "not-only-but-also": ["не только", ", но и"], "either-or": ["либо", ", либо"] }[kind] ?? ["", kind];
      const list = [toks, ...others];
      const out = [...(J[0] ? J[0].split(" ") : []), ...list.slice(0, -1).flatMap((x, k) => [...x, ...(k < list.length - 2 ? [","] : [])]), ...J[1].split(" ").filter(Boolean), ...list[list.length - 1]];
      return { toks: out, g: "pl", pl: !/^(or|neither-nor|either-or|not-but)$/.test(kind), person: 5, animate, pairKind: kind };
    }
    return { toks, g, pl, person: pl ? 5 : 2, noun: ne, animate, det: d };
  }

  // ---- THE VERB: aspect, tense, person; the chain with a modal or буду ----------------------------------------------------
  const pfOf = (v) => (v.forms && !v.forms.includes(" ") ? v.forms : null);
  const isState = (v) => STATE.has(v.word) || !pfOf(v);
  // the finite form of a verb for the clause: { toks, lex } -- aspect by the event (a single completed one: perfective)
  function finite(v, F, p, { g = "m", pl = false, habit = false, mood = null, type = "MAIN", futureTime = false, negObj = false }) {
    const se = M.endStressed(v), pf = pfOf(v), single = pf && !habit && !isState(v) && !(F.neg && F.tense === "present" && !futureTime) && !negObj;
    const t = F.mood === "hypo" ? "past" : F.tense ?? "present";
    if (mood === "past" || t === "past" || t === "perfect" || t === "pluperfect") return [M.conj(single && (t !== "past" || !DURATIVE.has(v.word)) ? pf : v.word, "past", 0, { g, pl })];
    if (/^future/.test(t) || (t === "present" && futureTime && pf && !habit)) return single ? [M.conj(pf, "pres", p)] : [M.conj("быть", "pres", p), v.word];
    return [M.conj(v.word, "pres", p, { stressedEnd: se })];
  }
  const DURATIVE = LIST("durative");
  const MODAL = { "môcť": { w: "мочь" }, "musieť": { adj: "должен" }, "mať (povinnosť)": { adj: "должен" }, "smieť": { w: "мочь" }, "chcieť": { w: "хотеть" }, "mať rád": { w: "любить" } };
  const shortAdj = (stem, g, pl) => (pl ? stem + "ы" : g === "f" ? stem + "а" : g === "n" ? stem + "о" : stem);
  function modalToks(cid, F, p, g, pl) {
    const m = MODAL[sp(cid)] ?? { w: wordOf(cid, "V") };
    const past = /^(past|perfect|pluperfect)$/.test(F.tense ?? "") || F.mood === "hypo", fut = /^future/.test(F.tense ?? "");
    if (m.adj) return [shortAdj("должн", g, pl).replace(/^должн$/, "должен"), ...(past ? [M.conj("быть", "past", 0, { g, pl })] : fut ? [M.conj("быть", "pres", p)] : [])];
    return finite(verbEntry(m.w), { ...F, tense: past ? "past" : F.tense }, p, { g, pl, habit: true });
  }

  // ---- A CLAUSE ---------------------------------------------------------------------------------------------------------
  const tenseOf = (id, plan) => planTense(id, plan, { timeWord: (t) => wordOf(t, "AV"), isPast: (w) => PAST.has(w), isFuture: (w) => FUTURE.has(w), isNearly: (v) => /^почти$/.test(wordOf(v, "AV")), clauses: false });
  function clause(id, ctx) {
    const c = ctx.plan.clauses[id];
    if (!c) return [];
    const type = c.type, A = (k) => c.args[k]?.[0], all = (k) => c.args[k] ?? [];
    const link = A("link");
    if (!A("verb")) return type === "FRAG" ? [...np(A("np"), "nom", ctx).toks, ...all("pp").flatMap((x) => relPhrase(x.slice(0, x.indexOf(":")), x.slice(x.indexOf(":") + 1), ctx))] : [];
    const fr = frameFor(c);
    let lex = fr.v;
    const { F, hypo, futureTime } = tenseOf(id, ctx.plan);
    let verb = sp(F.verb), exist = verb === "dať" && A("subj") === "3sg.n" && A("patient") && !A("fixed");
    if (RAIN[verb]) { c.args = { ...c.args, subj: ["none:" + RAIN[verb]] }; lex = verbEntry("идти"); }   // (идёт дождь: the weather verb's noun is the subject)
    if (hypo && verb === "mať rád") lex = verbEntry("хотеть");   // (я хотел бы кофе)
    const subjV = fr.f?.subjRole ? A(fr.f.subjRole) : A("subj");
    const subjDat = fr.f?.subjAs === "io" || fr.f?.subjAs === "Д";   // (мне нравится: the plan's subject in the dative)
    let subj = exist ? null : subjV ? np(subjV, subjDat ? "dat" : "nom", { ...ctx, subj: true }) : null;
    ctx = { ...ctx, subjCode: table.pron?.[subjV] ? subjV : null, subj: false };
    let p = subj?.person ?? 2, g = subj?.g ?? (type === "REL" ? ctx.head?.g : null) ?? (A("subj") === "3sg.n" ? "n" : "m"), pl = subj?.pl ?? (type === "REL" ? !!ctx.head?.pl : false);
    if (subjDat) { p = subj?.one ? 5 : 2; g = "n"; pl = false; }   // (мне нравится книга: the verb agrees with the thing -- below)
    if (A("subj") === "formal") { pl = true; g = "pl"; }
    if (A("subj") === "3sg.n" && (A("wh") === "how-late" || (verb === "byť" && A("fixed") && !fr.f?.fixed))) subj = { toks: [], person: 2, g: "n", pl: false };   // (который час? важно, что ...)
    const objs = [], dats = [], phrases = [], pronObjs = [];
    const past = /^(past|perfect|pluperfect)$/.test(F.tense ?? "");
    let neg = A("neg") ? (say("neg", A("neg")) ?? "не") : null;
    let forceImpf = false;
    for (const r of fr.f?.absorb.keys() ?? []) if (/^no:/.test(A(r) ?? "")) neg = "не";
    for (const [k, vs] of Object.entries(c.args)) for (let v of vs) {
      if (!ROLES.has(k) || (exist && k === "patient") || k === fr.f?.subjRole || fr.f?.absorb.has(k) || (v === "it" && A("clause"))) continue;
      const wr = v.match(/^([a-z-]+):(.*)$/);
      if (wr && table.rel?.[wr[1]] && !table.det?.[wr[1]] && !table.pron?.[wr[1]] && !/^(it|them)$/.test(wr[1])) { phrases.push(...relPhrase(wr[1], wr[2], ctx)); continue; }
      const mk = markOf(fr, k, v), { prep: pp, kase } = marking(mk), code = splitTop(v)[0];
      if (subjDat && k === "patient") { subj = { ...np(v, "nom", ctx) }; const o = subj; g = o.g; pl = o.pl; p = o.person; continue; }   // (the liked thing is the grammatical subject)
      if (/^(nothing|noone)$/.test(code)) { neg = "не"; pronObjs.push(...withPrep(pp, [pronForm(code, kase, !!pp)])); continue; }
      if (/^no:/.test(code)) { neg = "не"; v = v.replace(/^no:/, "none:"); }
      if (/^(something|everything|someone|this|that-one)$/.test(code) || table.pron?.[code] || /^(it|them):/.test(v) || v === "it") {
        const f = v === "it" ? pronForm("3sg.n", kase, !!pp) : /^(it|them):/.test(v) ? np(v, kase, { ...ctx, afterPrep: !!pp }).toks[0] : pronForm(code, kase, !!pp);
        (pp ? phrases : kase === "dat" ? dats : pronObjs).push(...withPrep(pp, [f])); continue;
      }
      const o = np(v, kase, { ...ctx, afterPrep: !!pp });
      // (speaking a language: по-немецки)
      if (k === "patient" && /ский язык$/.test(o.noun?.word ?? "")) { end.push("по-" + o.noun.word.replace(/ий язык$/, "и")); continue; }
      if (pp) { phrases.push(...withPrep(pp, o.toks, o.noun)); continue; }
      (kase === "dat" ? dats : objs).push(...o.toks);
    }
    if (Object.values(c.args).flat().some((x) => /pair\(neither-nor,/.test(x))) neg = "не";
    for (const x of all("pp")) { const i = x.indexOf(":"), r = x.slice(0, i); if (x.slice(i + 1) === "it" && A("clause")) continue; phrases.push(...relPhrase(r, x.slice(i + 1), ctx)); }
    for (const v of all("by")) phrases.push(...np(v, "ins", ctx).toks);
    const roleT = all("role").flatMap((v) => ["как", ...np(v.replace(/^[a-z.]+:/, "none:"), "nom", ctx).toks, ","]);
    const after = [];
    for (const k of ["because-of", "despite", "during", "instead-of"]) for (const v of all(k)) { const { prep: pp, kase } = marking(say("rel", k) ?? "Р"); after.push(...withPrep(pp, np(v, kase, ctx).toks)); }
    // the adverbs: a sentence adverb first; a time word first in a main clause that opens the sentence, else after the
    // subject; frequency and manner before the verb; places at the end
    const front = [...roleT], mid = [], end = [];
    for (const k of ["sentence", "conn", "time", "freq", "manner", "place"]) for (const v of all(k)) {
      const t = adverb(v, k, ctx), w = t.join(" ");
      if (!t.length) continue;
      if (k === "sentence" || k === "conn") { front.push(...t, ...(ctx.first ? [","] : [])); continue; }
      if (k === "time") { ((ctx.first && type === "MAIN" && !subj?.toks.includes(",") && !MIDW.has(w)) || !subj?.toks.length ? front : mid).push(...t.map((x) => (x === "сейчас" && past ? "теперь" : x))); continue; }
      if (k === "place") { (/^(здесь|там|дома|везде)$/.test(w) && type === "MAIN" && ctx.first && !front.length && (!subj || subj.pron) ? front : end).push(...t); continue; }
      if (k === "manner" && v === "rád") { mid.push("с удовольствием"); continue; }
      mid.push(...t);
    }
    const habit = !!A("freq") || /^every:/.test(A("time") ?? "") || (type === "SUB" && link === "while") || MOOD.impf?.has(link);
    // the predicate: быть + nominative, an adjective, age, the clock, the weather, есть / нет
    let pred = [], copula = null;
    const fut = /^future/.test(F.tense ?? "");
    const be = (gg, ppl, person) => (past || hypo ? [M.conj("быть", "past", 0, { g: gg, pl: ppl })] : fut ? [M.conj("быть", "pres", person)] : []);
    let vtoks = null;
    if (verb === "byť" && A("pred")) {
      const r = predicate(A("pred"), { g, pl, p, subj, neg, past: past || !!ctx.forcePast, fut, hypo, ctx });
      vtoks = r.toks; if (r.subj) { subj = r.subj; }
      if (r.neg === null) neg = null;
    } else if (verb === "byť" && A("fixed") && !fr.f?.fixed) {
      const a = entry(A("fixed"), "AN"); vtoks = [...be("n", false, 2), a ? M.adverb(a) : wordOf(A("fixed"), "AN")];
    } else if (exist) {
      const o = np(A("patient"), neg ? "gen" : "nom", ctx);
      vtoks = neg ? [past ? "не было" : fut ? "не будет" : "нет", ...o.toks] : [...(past ? [M.conj("быть", "past", 0, { g: o.g, pl: o.pl })] : fut ? [o.pl ? "будут" : "будет"] : ["есть"]), ...o.toks];
      neg = null; subj = null;
    } else if (verb === "mať (vlastniť)" && !fr.f?.absorb.size && !fr.f?.fixed && subj) {
      // у меня есть книга / у меня нет книги / у меня была книга
      const o = np((A("patient") ?? A("bare") ?? "none:вещь").replace(/^no:/, "none:"), neg ? "gen" : "nom", ctx);
      const owner = np(subjV, "gen", { ...ctx, afterPrep: true });
      const wasP = past || hypo;
      const byHere = hypo && !(type === "SUB" && /бы/.test(table.link[link]?.[0]?.w ?? ""));
      vtoks = neg ? [wasP ? "не было" : fut ? "не будет" : "нет", ...o.toks] : [...(wasP ? [M.conj("быть", "past", 0, { g: o.g, pl: o.pl })] : fut ? [o.pl ? "будут" : "будет"] : ["есть"]), ...(byHere ? ["бы"] : []), ...o.toks];
      subj = { toks: ["у", ...owner.toks], person: 2, g: "m", pl: false, pron: subj.pron }; neg = null; objs.length = 0;
    } else if (fr.f && !byWord.has("V|" + fr.f.word) && (byWord.get(fr.f.word)?.pos === "AN" || /(ый|ой|ий)$/.test(fr.f.word))) {
      // (an idiom said by an adjective: я голоден, он похож на ...)
      const a = byWord.get(fr.f.word) ?? { word: fr.f.word };
      vtoks = [...be(g, pl, p), SHORT[a.word] ? SHORT[a.word][pl ? 3 : g === "f" ? 1 : g === "n" ? 2 : 0] : M.short(a, g, pl)];
    } else if (fr.f && !byWord.has("V|" + fr.f.word) && (byWord.get(fr.f.word)?.pos === "AV" || /о$/.test(fr.f.word))) {
      // (an impersonal predicate: мне трудно читать, мне жаль, что ...; the plan's subject -- a verb as a noun -- after it)
      vtoks = [...be("n", false, 2), fr.f.word];
      const sv = !subjV || /^3sg\.n$/.test(subjV) ? [] : subjV.startsWith("none:@") || subjV.startsWith("@") ? [verbEntry(wordOf(subjV.replace(/^none:/, "").slice(1), "V")).word] : subj?.toks ?? [];
      subj = { toks: [...dats.splice(0), ...pronObjs.splice(0)], person: 2 }; vtoks.push(...sv);   // (мне трудно читать: the dative first)
    } else {
      const impf = habit || isState(lex) || forceImpf, negObj = !!neg && (!!A("patient") || pronObjs.length > 0);
      const moodPast = (type === "SUB" && MOOD.past?.has(link)) || ctx.forcePast ? "past" : null;
      const by = (type === "SUB" && MOOD.by?.has(link)) || (hypo && type !== "SUB");
      const modal = F.modal ? modalToks(F.modal, F, p, g, pl) : null;
      const infAspect = (v) => (pfOf(v) && !habit && !isState(v) && !neg ? pfOf(v) : v.word);
      if (type === "IMP") { const ip = A("imp") === "2pl" || A("imp") === "formal"; const v = neg || IMP_IMPF.has(lex.word) ? lex.word : (pfOf(lex) ?? lex.word); vtoks = [M.conj(v, "imp", 0, { pl: ip, stressedEnd: M.endStressed(lex) })]; }
      else if (type === "INF" || ctx.inf) vtoks = [infAspect(lex)];
      else if (F.voice === "passive" || F.voice === "state") {
        const pf = pfOf(lex) ?? lex.word;
        if (modal) vtoks = [...modal, "быть", M.conj(pf, "ppp", 0, { g, pl })];
        else if (past || hypo || fut || F.voice === "state") vtoks = [...be(g, pl, p), M.conj(pf, "ppp", 0, { g, pl })];
        else vtoks = [M.conj(lex.word, "pres", pl ? 5 : 2) .replace(/(ся|сь)$/, "") + (/[аеёиоуыэюя]$/.test(M.conj(lex.word, "pres", pl ? 5 : 2)) ? "сь" : "ся")];
      }
      else if (F.voice === "sichlassen" || F.voice === "seinzu") { vtoks = ["можно", infAspect(lex)]; subj = { toks: [], person: 2 }; }
      else if (modal) vtoks = [...modal, ...(by ? ["бы"] : []), ...pronObjs.splice(0), ...dats.splice(0), infAspect(lex)];
      else if (F.raise) { if (!subj?.toks.length) front.unshift("кажется", ","); vtoks = finite(lex, F, p, { g, pl, habit: impf, type, futureTime }); }
      else vtoks = finite(lex, moodPast ? { ...F, tense: "past" } : F, p, { g, pl, habit: impf, mood: moodPast, type, futureTime, negObj });
      if (by && !vtoks.includes("бы") && !(type === "SUB" && /бы/.test(table.link[link]?.[0]?.w ?? ""))) vtoks.splice(1, 0, "бы");
      if (type === "IMP" && subj?.toks.length === 0) subj = null;
    }
    if (subj?.one) subj = { ...subj, toks: [] };
    if (A("subj") === "3sg.n" && verb !== "byť" && !exist && subj && !RAIN[verb]) subj = { ...subj, toks: [] };   // (пахло котлетами: no оно)
    if (F.raise && subj?.toks.length && !front.includes("кажется")) subj = { ...subj, toks: [...subj.toks, ",", "кажется", ","] };
    // the chain and the objects: не before the verb, a pronoun object before the noun objects, dative before accusative
    const infT = [];
    if (A("inf") && PHASE.has(lex.word) && !A("patient")) infT.push(verbEntry(wordOf(A("inf"), "V")).word);
    else if (A("inf") && A("patient") && /^(počuť|vidieť|cítiť)$/.test(verb)) {   // (я слышал, как она пела)
      const iv = verbEntry(wordOf(A("inf"), "V")), o = np(A("patient"), "nom", ctx);
      objs.length = 0; pronObjs.length = 0;
      end.push(",", "как", ...o.toks, ...finite(iv, { ...F, tense: past ? "past" : F.tense }, o.person, { g: o.g, pl: o.pl, habit: true }));
      forceImpf = true;
    } else if (A("inf") && !(fr.f?.inf?.absorb && fr.f.word.includes(" "))) infT.push(verbEntry(wordOf(A("inf"), "V")).forms && !A("freq") ? verbEntry(wordOf(A("inf"), "V")).forms : verbEntry(wordOf(A("inf"), "V")).word);
    if (!fr.f?.fixed && A("fixed") && verb !== "byť" && own(A("fixed"), "AV")) end.unshift(wordOf(A("fixed"), "AV"));   // (a fixed word no frame says: as an adverb)
    const nothing = pronObjs.filter((x) => /^(ни|не)/.test(x)), others = pronObjs.filter((x) => !/^(ни|не)/.test(x));
    let subjBy = [];
    if (subj?.pron && vtoks.includes("бы") && type === "MAIN") { vtoks = vtoks.filter((x) => x !== "бы"); subjBy = ["бы"]; }   // (я бы пришёл)
    else if (vtoks.filter((x) => x === "бы").length > 1) { let seen = false; vtoks = vtoks.filter((x) => x !== "бы" || (!seen && (seen = true))); }
    // (pronoun objects before the verb in a subordinate or relative clause, or when the subject is not said: которую я ему дал)
    const pronFirst = type === "SUB" || type === "REL" || subj?.one || !subj?.toks.length;
    const verbPart = [...nothing, ...(pronFirst ? [...others.splice(0), ...dats.filter((x) => table.pron && /^(мне|тебе|ему|ей|нам|вам|им|нему|ней|ним)$/.test(x))] : []), ...(neg ? [neg] : []), ...vtoks];
    if (pronFirst) for (const x of dats.filter((x) => /^(мне|тебе|ему|ей|нам|вам|им|нему|ней|ним)$/.test(x))) dats.splice(dats.indexOf(x), 1);
    const rest = [...infT, ...others, ...dats, ...objs, ...phrases, ...end, ...after];
    const inner = A("clause") && !(ctx.plan.seq ?? []).includes(A("clause")) ? innerClause(A("clause"), fr, ctx) : [];
    let subjT = [...(subj?.toks ?? []), ...subjBy];
    // the special predicates
    if (verb === "volať sa" && (A("pred")?.startsWith("name:") || A("wh") === "how")) {
      const o = np(A("subj") ?? "1sg", "acc", ctx);
      return A("wh") === "how" ? ["как", ...o.toks, "зовут"] : [...o.toks, "зовут", A("pred").slice(5)];
    }
    const lk = type === "SUB" && link && !ctx.skipLink ? (choose(table.link[link] ?? [{ w: link, weight: 1 }]).w).split(" ") : [];
    if (type === "WH" && A("wh") === "whence" && verb === "prísť" && (F.tense ?? "present") === "present") return [...whWords("whence"), ...subjT];
    if (type === "WH" && A("wh") === "how-late") return whWords("how-late");
    if (type === "WH") return whClause(A("wh"), c, fr, { front, subjT, mid, verbPart, rest, inner, subj }, ctx);
    if (type === "YESNO") return [...front, ...subjT, ...mid, ...verbPart, ...rest, ...inner];
    if (type === "IMP") return [...verbPart, ...rest, ...front, ...mid, ...inner];
    if (type === "INF" && link === "without") return ["не", M.conj(pfOf(lex) ?? lex.word, "ger", 0, { perfective: !!pfOf(lex) }), ...rest, ...inner];
    if (type === "INF" || ctx.inf) {
      const l = link ? say("link", link) : null;
      return [...(l ? l.split(" ") : []), ...mid, ...verbPart, ...rest, ...inner];
    }
    if (type === "SUB" && link === "by-doing") return [M.conj(lex.word, "ger"), ...rest, ...inner];
    if (type === "SUB" && link === "whether") return [...verbPart.slice(0, 1), "ли", ...verbPart.slice(1), ...subjT, ...mid, ...rest, ...inner];
    if (type === "SUB" && link === "the-more") return ["чем", ...mid, ...subjT, ...verbPart, ...rest];
    if (type === "MAIN" && link === "the-more-so") return ["тем", ...mid, ...subjT, ...verbPart, ...rest];
    if (type === "WHOEVER") return ["кто", ...mid, ...verbPart, ...rest, ...inner];
    if (type === "REL") return relBody(c, fr, { verbPart, rest, subjT, mid }, ctx);
    if (type === "SUB" && A("wh")) { const wh = whWords(A("wh"), c, fr, ctx); return [...wh, ...subjT, ...mid, ...verbPart, ...rest, ...inner]; }
    if (A("drop") === "yes" && ctx.dropOK) return [...lk, ...front, ...mid, ...verbPart, ...rest, ...inner];
    if (RAIN[verb] || ctx.afterQuote) return [...lk, ...front, ...mid, ...verbPart, ...subjT, ...rest, ...inner];
    if (verb === "prísť" && (F.tense ?? "present") === "present" && c.args.source && !A("time")) return [...lk, ...front, ...subjT, ...phrases, ...inner];
    return [...lk, ...front, ...subjT, ...mid, ...verbPart, ...rest, ...inner];
  }
  // a question with a question word: the word first, then the subject and the verb (Где ты живёшь? Что ты делаешь?)
  function whClause(w, c, fr, P, ctx) {
    const { front, subjT, mid, verbPart, rest, inner } = P;
    const wh = whWords(w, c, fr, ctx);
    if (!c.args.subj || w === "who") return [...front, ...wh, ...mid, ...verbPart, ...rest, ...inner];
    return [...front, ...wh, ...subjT, ...mid, ...verbPart, ...rest, ...inner];
  }
  function whWords(w, c, fr, ctx) {
    if (!w) return [];
    const rw = w.match(/^([\w.]+):(who|what)$/);
    if (rw && ROLES.has(rw[1])) { const { prep: pp, kase } = marking(markOf(fr, rw[1], null)); return withPrep(pp, [pronForm(rw[2] === "who" ? "who" : "something", kase, !!pp).replace(/^что-то$/, "что").replace(/-то$/, "")]); }
    const i = w.indexOf(":");
    if (i > 0) { const q = w.slice(0, i), spec = w.slice(i + 1).replace(/^[AN]\./, ""), o = np(spec.replace(/^[a-z.]+:/, "none:"), q === "how-many" ? "gen" : "acc", ctx); return [...(q === "which" ? [M.adj({ word: "какой" }, "acc", o.g === "pl" ? "pl" : o.g, o.pl, { animate: o.animate })] : (say("wh", q) ?? q).split(" ")), ...o.toks]; }
    return (say("wh", w) ?? w).split(" ");
  }
  // the predicate: a nominative noun (я учитель, это стол; был учителем: the instrumental in the past), an adjective
  // (long form; comparative + чем; самый), age (мне двадцать лет), the clock (сейчас восемь часов), the weather (холодно)
  function predicate(v, { g, pl, p, subj, neg, past, fut, hypo, ctx }) {
    const [head, ...mods] = splitTop(v);
    const beT = past || hypo ? [M.conj("быть", "past", 0, { g, pl })] : fut ? [M.conj("быть", "pres", p)] : [];
    if (head.startsWith("age:")) { const n = Number(NUM[sp(head.slice(4))] ?? 0), u = n % 10 === 1 && n % 100 !== 11 ? "год" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "года" : "лет"; return { toks: [...(past ? ["было"] : fut ? ["будет"] : []), wordOf(head.slice(4), "NUM"), u], subj: { toks: np(subj?.pron ?? "1sg", "dat", ctx).toks, person: 2 } }; }
    if (head.startsWith("clock:")) { const n = Number(NUM[sp(head.slice(6))] ?? 0), u = n === 1 ? "час" : n >= 2 && n <= 4 ? "часа" : "часов"; return { toks: [...(past ? ["было"] : []), n === 1 ? "" : wordOf(head.slice(6), "NUM"), u].filter(Boolean), subj: { toks: ["сейчас"], person: 2 } }; }
    if (head.startsWith("name:")) return { toks: [...beT, head.slice(5)] };
    if (!head.startsWith("adj:")) {
      const o = np(v, past || hypo ? "ins" : "nom", ctx);
      return { toks: [...(neg ? ["не"] : []), ...beT, ...o.toks], neg: null };
    }
    const a = entry(head.slice(4), "AN") ?? { word: wordOf(head.slice(4), "AN") };
    const deg = mods.find((m) => m.startsWith("deg:"));
    if (subj?.pron === "3sg.n" && WEATHER[a.word]) return { toks: [...(past ? ["было"] : fut ? ["будет"] : []), WEATHER[a.word]], subj: { toks: [], person: 2 } };
    const target = (f) => { const m = mods.find((x) => call(x)[0] === f); if (!m) return []; const t = call(m)[1]; return table.pron?.[t] ? [pronForm(t, "nom")] : np(t, "nom", ctx).toks; };
    const second = mods.map(call).find(([f]) => f === "but" || f === "and");
    const gi = pl ? 3 : g === "f" ? 1 : g === "n" ? 2 : 0;
    if (VERBADJ[a.word] && !deg && !mods.length) return { toks: [M.conj(VERBADJ[a.word], "past", 0, { g, pl })] };   // (я устал)
    const form = SHORT[a.word] && !deg && !mods.some((m) => /^(comp|sup|so)/.test(m)) ? SHORT[a.word][gi] : M.adj(a, past || hypo ? "ins" : "nom", g === "pl" ? "pl" : g, pl);   // (был молодым)
    const tail = second ? [...(second[0] === "but" ? [",", "но"] : ["и"]), M.adj(entry(second[1], "AN") ?? { word: wordOf(second[1], "AN") }, past || hypo ? "ins" : "nom", g === "pl" ? "pl" : g, pl)] : [];
    if (mods.includes("comp.bare")) return { toks: [...beT, M.compare(a)] };
    if (mods.includes("comp")) { const m = mods.find((x) => call(x)[0] === "than"), t = m ? call(m)[1] : null; return { toks: [...beT, M.compare(a), ...(t ? (table.pron?.[t] ? [pronForm(t, "gen")] : np(t, "gen", ctx).toks) : [])] }; }
    if (mods.includes("so")) return { toks: [...beT, M.pronAdj("такой", "nom", g, pl), "же", form, ",", "как", ...target("as")] };
    if (mods.includes("sup")) return { toks: [...beT, M.adj({ word: "самый" }, "nom", g === "pl" ? "pl" : g, pl), form] };
    return { toks: [...beT, ...(deg ? [wordOf(deg.slice(4), "AV")] : []), form, ...tail] };
  }
  const adverbOf = (a) => ADVERB[a.word] ?? M.adverb(a);
  function adverb(v, k, ctx) {
    if (v === "home") return ["дома"];
    if (v.startsWith("adj:")) return adverbOf(entry(v.slice(4), "AN") ?? { word: wordOf(v.slice(4), "AN") }).split(" ");
    const [h, ...a] = v.split(":");
    if (!a.length) { const e = own(v, "AV") ?? own(v, "PAR") ?? own(v, "PHR"); if (e) return e.word.split(" "); const j = own(v, "AN"); return (j ? adverbOf(j) : wordOf(v, "AV")).split(" "); }
    if (table.time?.[h]) {
      const n = (x) => entry(x, "N") ?? { word: wordOf(x, "N"), gender: "м", plural: "" };
      if (h === "on-day") { const x = n(a[0]); return DAYPART.has(x.word) ? [M.noun(x, "ins")] : ["в", M.noun(x, "acc")].map((w, i) => (i === 0 ? prep(w, M.noun(x, "acc")) : w)); }
      if (h === "in-period") { const x = n(a[0]); return DAYPART.has(x.word) || /^(лето|зима|весна|осень)$/.test(x.word) ? [M.noun(x, "ins")] : ["в", M.noun(x, "prep")]; }
      if (h === "at-hour") { const num = Number(NUM[sp(a[0])] ?? 0); return ["в", ...(num === 1 ? [] : [wordOf(a[0], "NUM")]), num === 1 ? "час" : num <= 4 ? "часа" : "часов"]; }
      if (h === "date") return [a[0] + "-го", M.noun(n(a[1]), "gen")];
      if (h === "last" || h === "next") { const x = n(a[0]), adj = { word: h === "last" ? "прошлый" : "следующий" }, week = x.word === "неделя"; return [week ? "на" : "в", M.adj(adj, "prep", genderOf(x), false), M.noun(x, "prep")]; }
      if (h === "every") { const x = n(a[0]); return [M.adj({ word: "каждый" }, "acc", genderOf(x), false), M.noun(x, "acc")]; }
      const count = counted(a[0], a[1]);
      if (h === "since") return ["уже", ...count];
      if (h === "ago") return [...count, "назад"];
      return ["через", ...count];
    }
    if (table.rel?.[h]) return relPhrase(h, a.join(":"), ctx);
    return [sp(v)];
  }
  // a counted noun: два года, пять лет, одна неделя (the nominative / accusative)
  function counted(numCid, unitCid) {
    const num = Number(NUM[sp(numCid)] ?? 2), u = entry(unitCid, "N") ?? { word: wordOf(unitCid, "N"), gender: "м", plural: "" };
    if (num === 1) return [M.pronAdj("один", "acc", genderOf(u), false), M.noun(u, "acc")];
    const w = num === 2 && genderOf(u) === "f" ? "две" : wordOf(numCid, "NUM");
    return [w, num <= 4 ? M.noun(u, "gen") : M.noun(u, "gen", true)];
  }
  function relPhrase(r, v, ctx) {
    const h = splitTop(v)[0], mk0 = pick(table.rel?.[r] ?? [{ w: "В" }], h);
    const placeLike = nounKind(h)("place") || kindOf(nounOf(v))("country") || kindOf(nounOf(v))("room") || kindOf(nounOf(v))("container") || kindOf(nounOf(v))("settlement") || kindOf(nounOf(v))("vehicle");
    const mk = r === "from" && !placeLike && !nounKind(h)("person") ? "от+Р" : mk0, { prep: pp, kase } = marking(mk);   // (от жары: from what is no place)
    if (table.pron?.[h]) return withPrep(pp, [pronForm(h, kase, !!pp)]);
    const o = np(v, kase, { ...ctx, afterPrep: !!pp });
    if (r === "by" && nounKind(h)("vehicle")) return withPrep("на", np(v.replace(/^def:/, "none:"), "prep", ctx).toks);
    return withPrep(pp, o.toks, o.noun);
  }
  function innerClause(id, fr, ctx) {
    const c = ctx.plan.clauses[id];
    if (!c) return [];
    if (c.type === "INF") return clause(id, { ...ctx, inf: true });
    const parent = Object.values(ctx.plan.clauses).find((o) => (o.args.clause ?? []).includes(id));
    const pSubj = parent && (fr.f?.subjRole ? parent.args[fr.f.subjRole]?.[0] : parent.args.subj?.[0]);
    if (c.type === "SUB" && c.args.link?.[0] === "that" && fr.f?.that?.subj && pSubj && c.args.subj?.[0] === pSubj) { return [",", "чтобы", ...clause(id, { ...ctx, inf: true, skipLink: true })]; }
    if (c.type === "SUB" && c.args.link?.[0] === "that" && (fr.f?.that?.subj || (parent?.args.verb?.[0] === "byť" && parent.args.fixed))) return [",", "чтобы", ...clause(id, { ...ctx, skipLink: true, forcePast: true })];
    if (c.type === "SUB" && c.args.link?.[0] === "whether") return [",", ...clause(id, ctx)];
    if (c.type === "SUB") return [",", ...clause(id, ctx)];
    if (c.type === "REP") return [",", "что", ...clause(id, ctx)];
    return clause(id, ctx);
  }
  function relClause(id, head, ctx) { return ctx.plan?.clauses[id] ? clause(id, { ...ctx, head }) : []; }
  // the relative pronoun который agrees with its head in gender and number, its case is the role's
  function relBody(c, fr, { verbPart, rest, subjT, mid }, ctx) {
    const role = c.args.relrole?.[0] ?? "subj", head = ctx.head ?? { g: "m", pl: false };
    const kot = (kase, pp = null) => withPrep(pp, [M.adj({ word: "который" }, kase, head.g === "pl" ? "pl" : head.g, head.pl, { animate: head.animate })]);
    if (role === "subj") return [...kot("nom"), ...mid, ...verbPart, ...rest];
    if (role === "owner") return ["у", ...kot("gen"), ...subjT, ...mid, ...verbPart, ...rest];
    if (role === "where") return ["где", ...subjT, ...mid, ...verbPart, ...rest];
    if (role === "what") return ["что", ...subjT, ...mid, ...verbPart, ...rest];
    const { prep: pp, kase } = marking(ROLES.has(role) ? markOf(fr, role, null) : "В");
    return [...kot(kase, pp), ...subjT, ...mid, ...verbPart, ...rest];
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
        toks.push(...clause(t, { ...ctx, dropOK: true, first: !toks.length || /^[.?!«]$/.test(toks.at(-1)), afterMain: afterClause, afterQuote: seq[i - 1] === "," && seq[i - 2] === "“" }));
        afterClause = true;
      } else if (t === "„") { toks.push("«"); afterClause = false; }
      else if (t === "“") { toks.push("»"); if (seq[i + 1] === "," && ctx.plan.clauses[seq[i + 2]]) { toks.push("—"); i++; } }
      else if (/^[,.?!:–]$/.test(t)) { toks.push(t === "–" ? "—" : t); if (/[.?!]/.test(t)) afterClause = false; }
      else if (table.coord?.[t]) { toks.push(say("coord", t), ...(t === "admittedly" ? [","] : [])); afterClause = false; }
      else { const e = own(t, "INT") ?? own(t, "PHR") ?? own(t, "PAR") ?? own(t, "AV"), j = own(t, "AN"); toks.push(e ? e.word : j ? adverbOf(j) : wordOf(t, "INT")); }
    }
    return assemble(toks);
  }
  function assemble(toks) {
    const words = toks.filter((t) => t != null && t !== "").flatMap((t) => (/^[«»]$/.test(t) ? [t] : t.split(" "))).filter(Boolean);
    const out = [];
    for (let k = 0; k < words.length; k++) {
      const w = words[k];
      if (w === "," && (out.at(-1) === "," || !out.length)) continue;
      if (/^[.?!]$/.test(w) && out.at(-1) === ",") out.pop();
      out.push(w);
    }
    let text = "", start = true;
    for (const w of out) {
      const glue = /^[,.?!:;»]$/.test(w) || !text || text.endsWith("«") || text.endsWith("-");
      text += (glue ? "" : " ") + (start && /^\p{L}/u.test(w) ? cap(w) : w);
      if (/\p{L}/u.test(w)) start = false;
      if (/^[.?!]$/.test(w) || w === "«") start = true;
      if (w === "»") start = false;
    }
    text = text.replace(/ ,/g, ",").replace(/« /g, "«").replace(/ »/g, "»");
    return { text: cap(text), tokens: out.map((w) => ({ w, ipa: lx.ipaOf(w) })) };
  }
  return { realize, word: entry, use: lx.use };
}

export const load = loadRussian;
