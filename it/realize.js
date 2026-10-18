// ITALIAN SAYS A CLAUSE PLAN (world/CLAUSES.md): the words, closed words and frames of engine/lexicon.js (it/dict.tsv,
// it/rules/{neutral,roles,frames,prefer}.txt), the verbs' forms of it/morph.js (it/rules/irregular.txt), the tense rules
// shared with English (engine/tense.js). The grammar here, in order: the noun phrase (the article by the next word's
// sound -- il lo l' la i gli le, un uno un' una --, gender and number agreement, the article before a possessive, the
// contractions del nello sulla), the clitics (mi ti lo la gli le ci vi li ne; before the finite verb, after an
// infinitive, a gerund or an affirmative command), the verb chain (the passato prossimo with avere or essere -- the
// participle agreeing after essere --, the imperfetto for states and habits, the futuro, the condizionale, the
// congiuntivo after che and the links that take it), the clause (the subject pronoun dropped, non before the clitics,
// c'è / ci sono, mi piace, ho fame, mi chiamo, ho venti anni, sono le otto, fa freddo, piove), the sentence.
//
//   const it = await loadItalian("", { meaning, vary })
//   it.realize(plan) -> { text, tokens }

import { splitTop, call } from "../engine/realize.js";
import { loadLexicon, ROLES, PERSONS, DIRECTED, pronGender, pronPlural } from "../engine/lexicon.js";
import { planTense } from "../engine/tense.js";
import { loadMorphology, plural, adjForm, ppForm, article, contract as contractArt } from "./morph.js";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const INF_OWN = new Set(["pred", "pp", "place", "fixed", "clause", "inf"]);   // (gern said by piacere: what moves to the verb's infinitive)
const PREPS = new Set(["di", "a", "da", "in", "su"]);
const ARTS = new Set(["il", "lo", "la", "l'", "i", "gli", "le"]);
const VOWEL0 = /^[aeiouàèéìòùAEIOU]/;

const agreePP = (w, g, pl) => { const [h, ...r] = w.split(" "); return [ppForm(h, g, pl), ...r].join(" "); };   // (andati a passeggiare)
export async function loadItalian(base, { meaning = null, vary = null } = {}) {
  const M = await loadMorphology(base + "it/rules/irregular.txt");
  const lx = await loadLexicon(base, "it", { meaning, vary, verbEntry: (w) => verbEntry(w) });
  const { entry, wordOf, own, sp, byWord, table, say, LIST, choose, nounKind, pick, markOf, nounOf, kindOf } = lx;
  const BEFORE = new Map([...LIST("before")].map((x) => x.split(":")));   // (an adjective before the noun -> its short form before a masculine singular)
  let ctxPlan = null;
  const frameFor = (c) => lx.frameFor(c, ctxPlan);
  const verbEntry = (w) => byWord.get("V|" + w) ?? { word: w, model: "", forms: "", aux: "" };
  const NOART = LIST("noart"), FRONT = LIST("front"), PAST = LIST("past"), FUTURE = LIST("future"), IMPF = LIST("impf"), MID = LIST("mid"), FAMILY = LIST("family"), VENIRE = LIST("venire");
  const ADVERB = Object.fromEntries([...LIST("adverb")].map((x) => x.split(":")));
  const WEATHER = Object.fromEntries([...LIST("weather")].map((x) => x.split(":")));
  const RAIN = Object.fromEntries([...LIST("rain")].map((x) => x.split(":")));
  const MOOD = Object.fromEntries(Object.entries(table.mood ?? {}).map(([k, v]) => [k, new Set(v.map((a) => a.w))]));

  // ---- AGREEMENT: the article by gender, number and the next word; a possessive; a pronoun's forms ---------------------
  const art = (kind, g, pl, next) => article(kind, g, pl, next);
  const PRON = (code) => (table.pron?.[code]?.[0]?.w ?? "").split("/");   // subject/direct/indirect/possessive/after prep/reflexive/person
  const personOf = (code) => Number(PRON(code)[6] ?? 2);
  const REFL = ["mi", "ti", "si", "ci", "vi", "si"];
  const possForm = (p, g, pl) => (p === "loro" ? "loro" : adjForm({ word: p, feminine: p === "mio" ? "mia" : "" }, g, pl).replace(/^mii$/, "miei").replace(/^tui$/, "tuoi").replace(/^sui$/, "suoi"));
  const thingClitic = (v) => { const m = v.match(/^(it|them):(.+)$/), n = entry(m[2], "N"); return m[1] === "them" ? (n?.gender === "f" ? "le" : "li") : n?.gender === "f" ? "la" : "lo"; };

  // A NOUN PHRASE -> { toks, g, pl, person, pron, noun } ; ctx.countable: a profession after essere needs no article
  function np(v, ctx = {}) {
    if (v == null) return { toks: [], g: "m", pl: false, person: 2 };
    const [head, ...mods] = splitTop(v);
    const tp = head.match(/^(it|them):(.+)$/);
    if (tp) { const n = entry(tp[2], "N"), f = n?.gender === "f"; return { toks: [tp[1] === "them" ? (f ? "loro" : "loro") : f ? "lei" : "lui"], g: n?.gender ?? "m", pl: tp[1] === "them", person: tp[1] === "them" ? 5 : 2, pron: v }; }
    if (table.pron?.[head]) return { toks: [PRON(head)[0]], g: pronGender(head), pl: pronPlural(head), person: personOf(head), pron: head };
    if (head.startsWith("name:")) return { toks: [head.slice(5)], g: "m", pl: false, person: 2, name: true };
    const i = head.indexOf(":"), d = i < 0 ? "none" : head.slice(0, i), n = i < 0 ? head : head.slice(i + 1);
    if (n.startsWith("@")) return { toks: [verbEntry(wordOf(n.slice(1), "V")).word], g: "m", pl: false, person: 2 };   // (leggere: the infinitive as a noun)
    const ne = entry(n.replace(/^~/, "").split("/")[0], "N");
    const plDet = ["all", "both", "many", "several", "few"].includes(d);
    const pl = mods.includes("pl") || plDet || ne?.plural === "PL" || (d.startsWith("num.") && !/^(uno|un|una)$/.test(wordOf(d.slice(4), "NUM")));
    const g = ne?.gender || "m", mass = ne?.plural === "-";
    const noun = pl && ne ? plural(ne) : ne?.word ?? sp(n);
    const pre = [], post = [];
    const deg = mods.find((m) => m.startsWith("deg:")), sup = mods.includes("sup"), comp = mods.includes("comp");
    if (mods.includes("one")) pre.push(g === "f" ? "unica" : "unico");
    const adjs = mods.filter((m) => m.startsWith("adj:")).map((m) => entry(m.slice(4), "AN") ?? { word: sp(m.slice(4)) });
    // (bello, buono, grande, piccolo, nuovo, primo ... before the noun -- rules/neutral.txt `list before`, with its
    //  short form before a masculine singular: un buon libro, un bel giorno, il primo giorno)
    const before = (a) => !deg && !sup && !comp && BEFORE.has(a.word);
    // (of different kinds: in Italian's order -- before the noun the farthest first, after it the nearest first: un gran
    //  vecchio cane, una macchina tedesca rossa; else a list joined by e)
    const cumulative = !deg && !sup && !comp && lx.adjOrder.cumulative(adjs), ao = lx.adjOrder;
    for (const a of (cumulative ? ao.outward : (x) => x)(adjs.filter(before))) pre.push(!pl && g === "m" && BEFORE.get(a.word) !== "-" && !VOWEL0.test(noun) ? BEFORE.get(a.word) : adjForm(a, g, pl));
    const after = adjs.filter((a) => !before(a));
    if (cumulative) post.push(...ao.inward(after).map((a) => adjForm(a, g, pl)));
    else after.forEach((a, k) => post.push(...(k === 0 && deg ? [wordOf(deg.slice(4), "AV")] : []), ...(k === 0 && (sup || comp) ? ["più"] : []), adjForm(a, g, pl) + (k < after.length - 2 ? "," : ""), ...(k === after.length - 2 ? ["e"] : [])));
    for (const m of mods) {
      const [fn, a] = call(m);
      if (fn === "part") {   // i bambini che ridono / la bistecca perfettamente fritta / il tè consigliato dal medico / il libro da leggere
        const [k, verb, ...ext] = splitTop(a, ","), ve = verbEntry(wordOf(verb, "V"));
        const by = ext.find((x) => call(x)[0] === "by");
        if (k === "zuI") post.push("da", ve.word.replace(/rsi$/, "rsi"));
        else if (k === "I") post.push("che", vf(ve, "pres", pl ? 5 : 2));
        else post.push(...ext.filter((x) => call(x)[0] !== "by").flatMap((x) => adverb(x, "manner", ctx)), ppForm(vf(ve, "pp", 0), g, pl), ...(by ? ["da", ...np(call(by)[1], ctx).toks] : []));
      }
      else if (fn === "of" || fn === "owner.von" || fn === "owner") post.push("di", ...np(a, { ...ctx, direct: false }).toks);
      else if (fn === "rel") post.push(...relClause(a, { noun: n, g, pl }, ctx));
    }
    // the determiner (the article by the first word after it)
    const first = pre[0] ?? noun;
    let det = "";
    if (d === "def") det = art("def", g, pl, first);
    else if (d === "indef") det = pl ? contractArt("di", art("def", g, true, first)) : mass ? art("def", g, pl, first) : art("indef", g, pl, first);
    else if (d === "none") det = ctx.direct && !ctx.countable && ne && !pl && !/čina$/.test(n) ? art("def", g, pl, first) : "";   // (compra il pane; parla tedesco)
    else if (d.startsWith("poss.")) {   // (il mio libro; mia madre: a family member in the singular without the article)
      const p = possForm(PRON(d.slice(5))[3], g, pl);
      det = (!pl && ne && FAMILY.has(ne.word) && p !== "loro" ? "" : art("def", g, pl, p) + " ") + p;
    }
    else if (d.startsWith("num.")) { const w = wordOf(d.slice(4), "NUM"); det = /^(uno|un)$/.test(w) ? art("indef", g, false, first) : w; }
    else if (d.startsWith("name.")) { det = art("def", g, pl, first); post.push("di", d.slice(5)); }
    else if (d === "all") det = (g === "f" ? "tutte" : "tutti") + " " + art("def", g, true, first);
    else if (d === "no" && mass) det = "";
    else if (table.det?.[d]) { const f = (table.det[d][0].w ?? "").split("/"); det = f[(pl ? 2 : 0) + (g === "f" ? 1 : 0)] ?? f[0]; }
    if (sup) det = art("def", g, pl, first);
    if (ctx.bare && NOART.has(noun) && d === "def") det = "";
    const toks = [...(det ? det.split(" ") : []), ...pre, noun, ...post];
    // pairs: caffè o tè, né caffè né tè, non solo un libro ma anche un giornale
    const pairs = mods.filter((m) => call(m)[0] === "pair").map((m) => splitTop(call(m)[1], ","));
    if (pairs.length) {
      const kind = pairs[0][0], others = pairs.map(([, o]) => np(o, ctx).toks);
      const J = { and: ["", "e"], or: ["", "o"], "both-and": ["sia", "sia"], "neither-nor": ["né", "né"], "not-but": ["", "ma"], "not-only-but-also": ["non solo", ", ma anche"], "either-or": ["o", "o"] }[kind] ?? ["", kind];
      const list = [toks, ...others];
      const out = [...(J[0] ? J[0].split(" ") : []), ...list.slice(0, -1).flatMap((x, k) => [...x, ...(k < list.length - 2 ? [","] : [])]), ...(kind === "not-but" ? [","] : []), ...J[1].split(" "), ...list[list.length - 1]];
      return { toks: out, g, pl: !/^(or|neither-nor|either-or)$/.test(kind), person: 5 };
    }
    return { toks, g, pl, person: pl ? 5 : 2, noun: ne };
  }
  // di a da in su + the article: di il -> del, a lo -> allo, in le -> nelle; an article before a vowel: l'
  const contract = (toks) => {
    const out = [];
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k], nx = toks[k + 1];
      if (PREPS.has(t) && nx && ARTS.has(nx)) { out.push(contractArt(t, nx)); k++; continue; }
      out.push(t);
    }
    return out;
  };

  // ---- THE VERB'S FORMS --------------------------------------------------------------------------------------------------
  // one form of a verb entry (a word of several: its first conjugated -- fare colazione); a reflexive one as alzarsi -> alzare
  let AGREE = { g: "m", pl: false, deg: null };   // (the subject's gender and number, for an idiom's adjective: siamo contenti; deg: molto before it)
  function vf(v, tense, p) {
    const ws = v.word.replace(/rsene(\s|$)/, "rsi$1").split(" "), neg = ws[0] === "non" ? ws.shift() : null, [h, ...rest] = ws;
    if (rest.length === 1 && /^(essere|stare|diventare|sembrare|restare|rimanere)$/.test(h) && byWord.get(rest[0])?.pos === "AN") { rest[0] = adjForm(byWord.get(rest[0]), AGREE.g, AGREE.pl); if (AGREE.deg) rest.unshift(AGREE.deg); }
    return (neg ? neg + " " : "") + M.conj(h, tense, p, { model: v.model, pp: v.forms }) + (rest.length ? " " + rest.join(" ") : "");
  }
  // the auxiliary: the dictionary's `essere` mark, the motion and change verbs of `list essere`, every reflexive; a word of
  // several (andare a dormire): its verb's
  const ESSERE = LIST("essere");
  const auxOf = (v) => { const h = v.word.replace(/^non /, "").split(" ")[0]; const e = byWord.get("V|" + h) ?? v; return e.aux === "essere" || ESSERE.has(h) || /rsi(ne)?$/.test(h) || ESSERE.has(h.replace(/rsene$/, "re")) ? "essere" : "avere"; };
  const reflexive = (v) => /^\S+rsi(ne)?(\s|$)/.test(v.word);
  const withNe = (v) => /^\S+rsene(\s|$)/.test(v.word);
  const baseWord = (v) => { const [h, ...r] = v.word.replace(/^non /, "").split(" "); return [h.replace(/rsi$/, "re"), ...r].join(" "); };
  // clitics attached after an infinitive (its final e dropped: darlo, alzarsi), a gerund or a command (dammi: not doubled here)
  const attach = (form, clitics) => (!clitics.length ? form : (/re$/.test(form) ? form.slice(0, -1) : form) + clitics.join(""));
  // a 3rd person io before a direct clitic: gli + lo -> glielo; me lo, te lo, ce lo, ve lo
  const combine = (io, dos) => (!dos.length ? io : io.map((x) => (/^(gli|le)$/.test(x) ? "glie" : x.replace(/i$/, "e"))));

  // ---- THE VERB CHAIN -----------------------------------------------------------------------------------------------------
  // the clause's verbs, top (finite) first: [{ w, finite, inf, lex }] -- tense, mood, voice, modal, raise; the lexical verb last
  const RAISE_EXTRA = { "avere bisogno": ["di"], "sembrare": [], "cercare": ["di"], "provare": ["a"], "smettere": ["di"], "cominciare": ["a"], "continuare": ["a"], "riuscire": ["a"] };   // (a raising verb's preposition before the infinitive)
  const MODAL = { "môcť": ["potere"], "musieť": ["dovere"], "smieť": ["potere"], "mať (povinnosť)": ["dovere"], "chcieť": ["volere"], "potrebovať": ["avere bisogno", "di"] };
  function chain(F, lex, p, { mood, impf, finite = true, form = "inf", subjG = "m", subjPl = false }) {
    AGREE = { g: subjG, pl: subjPl, deg: AGREE.deg };
    const units = [];
    const passive = F.voice === "passive" || F.voice === "state";
    units.push({ v: lex, lex: true });
    if (passive) units.push({ v: verbEntry(F.voice === "state" ? "essere" : VENIRE.has(lex.word) ? "venire" : "essere"), sel: "pp", agree: true });
    if (F.raise) { const rw = wordOf(F.raise, "V"); units.push({ v: verbEntry(rw), extra: RAISE_EXTRA[rw] ?? [], sel: "inf" }); }
    if (F.modal) { const m = MODAL[sp(F.modal)] ?? [wordOf(F.modal, "V")]; units.push({ v: verbEntry(m[0]), extra: m.slice(1), sel: "inf" }); }
    // the tense: the passato prossimo for a past event (avere / essere + participle), the imperfetto for a state or a
    // habit, the trapassato, the futuro, the condizionale; the congiuntivo (presente / imperfetto) where asked
    const t = F.tense ?? "present", hypo = F.mood === "hypo";
    const compound = (t === "past" && !impf) || /perfect|pluperfect|future2/.test(t);
    const auxV = passive ? "essere" : auxOf(lex);
    if (compound) units.push({ v: verbEntry(auxV), sel: "pp", agree: auxV === "essere" });
    let tense = mood === "subjimpf" ? "subjimpf" : mood === "subj" ? (t === "past" || t === "pluperfect" ? "subjimpf" : "subj") : hypo ? "cond"
      : t === "past" ? (compound ? "pres" : "impf") : t === "perfect" ? "pres" : t === "pluperfect" ? "impf" : t === "future" || t === "future2" ? "fut" : "pres";
    if (compound && mood === "subj") tense = "subj";
    if (compound && mood === "subjimpf") tense = "subjimpf";
    const out = [];
    let need = finite ? tense : form, agree = false;
    for (let k = units.length - 1; k >= 0; k--) {
      const u = units[k];
      let w = need === "inf" ? baseWord(u.v) : need === "ger" ? vf(u.v, "ger", p) : need === "pp" ? (agree || (u.lex && passive) ? agreePP(vf(u.v, "pp", 0), subjG, subjPl) : vf(u.v, "pp", 0)) : vf(u.v, need, p);
      out.push({ w, finite: k === units.length - 1 && finite, inf: need === "inf" || need === "ger", lex: !!u.lex, v: u.v, pp: need === "pp" });
      for (const x of u.extra ?? []) out.push({ w: x });
      need = u.sel ?? "inf"; agree = !!u.agree;
    }
    return out;
  }

  // ---- A CLAUSE ---------------------------------------------------------------------------------------------------------
  const tenseOf = (id, plan) => planTense(id, plan, { timeWord: (t) => wordOf(t, "AV"), isPast: (w) => PAST.has(w), isFuture: (w) => FUTURE.has(w), isNearly: (v) => /^quasi$/.test(wordOf(v, "AV")), clauses: false });
  function clause(id, ctx) {
    const c = ctx.plan.clauses[id];
    if (!c) return [];
    const type = c.type, A = (k) => c.args[k]?.[0], all = (k) => c.args[k] ?? [];
    const link = A("link");
    ctx = { ...ctx, weather: false };
    if (!A("verb")) return type === "FRAG" ? contract([...np(A("np"), ctx).toks, ...all("pp").flatMap((x) => relPhrase(x.slice(0, x.indexOf(":")), x.slice(x.indexOf(":") + 1), ctx))]) : [];
    // (gern: piacere -- Ich hätte gern einen Kuchen: mi piacerebbe una torta; Er liest gern: gli piace leggere)
    if (all("manner").includes("rád") && A("verb") !== "mať_rád") {
      const args = { ...c.args, manner: all("manner").filter((x) => x !== "rád") };
      args.verb = ["mať_rád"];
      const infId = `${id}.rád`;
      if (A("verb") !== "mať_(vlastniť)") {
        const inf = { type: "INF", args: { verb: [A("verb")], ctrl: [A("subj")] } };
        for (const k of Object.keys(args)) if ((ROLES.has(k) || INF_OWN.has(k)) && k !== "subj") { inf.args[k] = args[k]; delete args[k]; }
        ctx.plan.clauses[infId] = inf; args.clause = [infId];
      }
      ctx.plan.clauses[id] = { ...c, args };
      try { return clause(id, ctx); } finally { ctx.plan.clauses[id] = c; delete ctx.plan.clauses[infId]; }
    }
    const fr = frameFor(c);
    let lex = fr.v;
    const { F, hypo } = tenseOf(id, ctx.plan);
    const verb = F.verb, exist = verb === "dať" && A("subj") === "3sg.n" && A("patient") && !A("fixed");
    if (RAIN[sp(verb)]) { lex = verbEntry(RAIN[sp(verb)]); }   // (piove, nevica)
    // the subject: the plan's, or the role the frame makes it (piacere: the patient), the plan's said as io (mi piace)
    const subjV = fr.f?.subjRole ? A(fr.f.subjRole) : fr.f?.subjAs ? null : A("subj");
    let subj = exist ? null : subjV ? np(subjV, ctx) : null;
    let p = subj?.person ?? 2;
    if (A("subj") === "one") p = /\+pl|^(all|both|many|several|few):|^num\./.test(A("patient") ?? "") ? 5 : 2;   // (si parla; si vedono)
    const clitics = { refl: null, io: [], do: [] };
    const onePlural = A("subj") === "one" && Object.entries(c.args).some(([k, vs]) => ROLES.has(k) && k !== "patient" && vs.some((v) => table.pron?.[splitTop(v)[0]]));   // (se me lo avessero detto: the 3rd plural)
    if (A("subj") === "one" && !onePlural) clitics.refl = "si";
    if (onePlural) p = 5;
    if (fr.f?.subjAs === "io" && A("subj")) { const s = A("subj"); if (table.pron?.[s]) clitics.io.push(PRON(s)[2]); else ctx.ioPhrase = ["a", ...np(s, ctx).toks]; p = A(fr.f.subjRole ?? "patient") && /pl|^num/.test(A(fr.f.subjRole ?? "patient")) ? 5 : 2; }
    if (reflexive(lex)) clitics.refl = REFL[p] + (withNe(lex) ? " ne" : "");   // (se ne: andarsene)
    const siPassive = F.voice === "sichlassen";
    if (siPassive) { clitics.refl = "si"; F.voice = null; }
    let neg = A("neg") ? ["non"] : null, negTail = A("neg") === "no-more" ? ["più"] : A("neg") === "not-yet" ? ["ancora"] : [];
    const objs = [], phrases = [];
    // the roles: a pronoun as a clitic, the rest by their marking
    for (const [k, vs] of Object.entries(c.args)) for (let v of vs) {
      if (!ROLES.has(k) || (exist && k === "patient") || k === fr.f?.subjRole || fr.f?.absorb.has(k) || (v === "it" && A("clause"))) continue;
      const wr = v.match(/^([a-z-]+):(.*)$/);
      if (wr && table.rel?.[wr[1]] && !table.det?.[wr[1]] && !table.pron?.[wr[1]] && !/^(it|them)$/.test(wr[1])) { phrases.push(...relPhrase(wr[1], wr[2], ctx)); continue; }
      const mk = markOf(fr, k, v);
      if (/^no:/.test(v)) { neg = ["non"]; }
      if (/^(nothing|noone|something|everything|someone)$/.test(splitTop(v)[0])) {   // (niente, nessuno: non ... niente)
        const code = splitTop(v)[0]; if (/^(nothing|noone)$/.test(code)) neg = neg ?? ["non"];
        (mk === "direct" || mk === "io" ? objs : phrases).push(...(mk === "direct" ? [] : mk === "io" ? ["a"] : mk.split(" ")), PRON(code)[0]); continue;
      }
      if (table.pron?.[splitTop(v)[0]] || /^(it|them):/.test(v) || v === "it") {
        const code = splitTop(v)[0];
        if (mk === "direct") { clitics.do.push(/^(it|them):/.test(v) ? thingClitic(v) : v === "it" || code === "this" ? "lo" : PRON(code)[1]); continue; }
        if (mk === "io") { clitics.io.push(PRON(code)[2] ?? "gli"); continue; }
        phrases.push(...mk.split(" "), /^(it|them):/.test(v) ? np(v, ctx).toks[0] : PRON(code)[4] ?? PRON(code)[0]); continue;
      }
      const vehicle = mk === "in" && nounKind(splitTop(v)[0])("vehicle");
      const o = np((vehicle ? v.replace(/^def:/, "none:") : v).replace(/^no:/, k === "bare" ? "none:" : "no:"), { ...ctx, bare: !/^(direct|io)$/.test(mk), countable: k === "bare", direct: mk === "direct" });   // (non ha tempo; non compro nessuna mela; compra il pane)
      if (mk === "direct") { objs.push(...o.toks); continue; }
      if (mk === "io") { objs.push("a", ...o.toks); continue; }
      phrases.push(...mk.split(" "), ...o.toks);
    }
    if (ctx.ioPhrase) { phrases.push(...ctx.ioPhrase); delete ctx.ioPhrase; }
    if (Object.values(c.args).flat().some((x) => /pair\((neither-nor|not-but),/.test(x))) neg = ["non"];
    for (const x of all("pp")) { const i = x.indexOf(":"), r = x.slice(0, i); if (x.slice(i + 1) === "it" && A("clause")) continue; (DIRECTED.has(r) ? phrases.unshift : phrases.push).call(phrases, ...relPhrase(r, x.slice(i + 1), ctx)); }
    for (const v of all("by")) phrases.push("da", ...np(v, ctx).toks);
    const roleT = all("role").flatMap((v) => ["da", ...np(v.replace(/^[a-z.]+:/, "none:"), { ...ctx, countable: true }).toks]);   // (da cuoco conosceva ogni salsa)
    const after = [];
    for (const k of ["because-of", "despite", "during", "instead-of"]) for (const v of all(k)) after.push(...say("rel", k).split(" "), ...np(v, ctx).toks);
    // an infinitive's verb: è andata a dormire, l'ho sentita cantare, faccio riparare la macchina
    const infT = [];
    if (A("inf") && !fr.f?.inf?.absorb) { const mk = fr.f?.inf?.mark ?? "to"; infT.push(...(mk === "to" || mk === "bare" || mk === "pp" ? [] : [mk]), baseWord(verbEntry(wordOf(A("inf"), "V")))); }
    // the adverbs: in front (oggi, ieri, qui), before the verb (sempre, mai, ancora), after it (lentamente), at the end
    const front = [...roleT], mid = [], afterVerb = [], end = [];
    const subjNP = !!(subj && !subj.pron);
    for (const k of ["sentence", "conn", "time", "freq", "manner", "place"]) for (const v of all(k)) {
      const t = adverb(v, k, ctx), w = t.join(" ");
      if (k === "manner" && v === "rád") continue;
      if (k === "sentence" || k === "conn") { front.push(...t, ...(ctx.first && !/^(allora|poi|quindi|forse)$/.test(w) && !/che$/.test(w) ? [","] : [])); continue; }
      if (FRONT.has(w) && type === "MAIN" && !ctx.afterMain && (!subjNP || (/^(ora|adesso|presto|allora|poi|poco dopo)$/.test(w) && !(objs.length + phrases.length)))) { front.push(...t); continue; }
      if (FRONT.has(w) && subjNP && type === "MAIN") { afterVerb.push(...t); continue; }
      if (k === "time" && /^(on-day|in-period|last|next|every|date)$/.test(v.split(":")[0]) && type === "MAIN" && ctx.first) { front.push(...t); continue; }   // (il lunedì vado al lavoro; gli ospiti arrivano tra dieci minuti)
      if (k === "time" && F.tense === "future2" && FUTURE.has(w)) { end.push("entro", ...t); continue; }   // (entro domani)
      if (k === "time" && type === "SUB" && !subjNP && PAST.has(w)) { mid.push(...t); continue; }   // (so che ieri è dovuto venire; non so se viene domani)
      if (k === "manner" && w === "molto" && !A("pred")) { if (/^(essere|stare|diventare|sembrare) \S+$/.test(lex.word)) AGREE.deg = "molto"; else afterVerb.push("molto"); continue; }
      if (MID.has(w)) { if (w === "mai") { neg = neg ?? ["non"]; afterVerb.push("mai"); continue; } (neg && !/^(ancora|già|quasi)$/.test(w) ? end : afterVerb).push(w); continue; }
      if (k === "manner" && /mente$/.test(w)) { (objs.length ? end : afterVerb).push(w); continue; }   // (ha bevuto un sorso lentamente)
      end.push(...t);
    }
    // the predicate: essere, an adjective agreeing with the subject, a noun (Sono insegnante), the age, the clock
    let pred = [];
    const sg = subj?.g ?? (type === "REL" ? ctx.head?.g : null) ?? "m", spl = subj?.pl ?? (type === "REL" ? ctx.head?.pl : null) ?? false;
    if (A("pred")) pred = predicate(A("pred"), sg, spl, ctx);
    if (subj?.pron === "this" && A("pred") && !/^(adj|age|clock|name):/.test(A("pred"))) { const pn = np(A("pred"), ctx); if (pn.g === "f" && !pn.pl) subj = { ...subj, toks: ["questa"] }; }   // (questa è la macchina)
    if (A("fixed") && !fr.f?.fixed && verb === "byť" && !pred.length) pred = [adjForm(entry(A("fixed"), "AN") ?? { word: wordOf(A("fixed"), "AN") }, sg, spl)];
    if (verb === "byť") {
      const pv = A("pred") ?? "";
      const pa = /^adj:/.test(pv) ? entry(splitTop(pv)[0].slice(4), "AN")?.word : null;
      if (A("subj") === "3sg.n" && pa && WEATHER[pa]) { lex = verbEntry("fare"); pred = [WEATHER[pa]]; ctx.weather = true; }   // (fa freddo)
      else if (/^age:/.test(pv)) lex = verbEntry("avere");
      else if (/^clock:/.test(pv)) { lex = verbEntry("essere"); p = wordOf(pv.slice(6), "NUM") === "uno" ? 2 : 5; }
      else if (exist) lex = verbEntry("essere");
      else if (!pv && (A("place") || A("location") || all("pp").length || A("wh") === "where") && subjNP) lex = verbEntry("essere");
      else lex = verbEntry("essere");
    }
    // the verb chain and its clitics
    const moodList = type === "SUB" && (MOOD.subjimpf?.has(link) ? "subjimpf" : MOOD.subj?.has(link) ? "subj" : null);
    const subjMood = (type === "SUB" && fr.f?.that?.subj) || ctx.thatSubj ? "subj" : moodList;
    const impf = F.tense === "past" && (ctx.weather || IMPF.has(baseWord(lex).split(" ")[0]) || IMPF.has(lex.word) || (type === "SUB" && link === "while") || !!A("freq") || /^every:/.test(A("time") ?? "") || (verb === "byť" && !pred.some((x) => /^(nat|arriv)/.test(x))));   // (a state or a habit: era, giocava sempre)
    AGREE.deg = AGREE.deg ?? null;
    const clitT = [...(clitics.refl ? clitics.refl.replace(/^(m|t|s|c|v)i ne$/, "$1e ne").split(" ") : []), ...combine(clitics.io, clitics.do), ...clitics.do];   // (se ne va)
    let vc;
    const ing = type === "SUB" && link === "by-doing";
    const nonfinite = type === "INF" || ing || ctx.inf;
    const sgE = exist ? np(A("patient"), ctx) : null;
    if (F.voice === "seinzu" && all("manner").length) {
      const a = (lx.byConcept.get(`AN|${sp(all("manner")[0])}`) ?? []).find((e) => /^(difficile|facile|impossibile|importante)$/.test(e.word)) ?? own(all("manner")[0], "AN") ?? { word: wordOf(all("manner")[0], "AN") };
      end.splice(0); afterVerb.splice(0);
      vc = chain({ ...F, voice: null }, verbEntry("essere"), p, { finite: true, impf: true }); pred = [adjForm(a, sg, spl), "da", baseWord(lex)];
    } else if (exist) {   // c'è / ci sono; c'era, ci sarà, c'è stato
      const ep = sgE.pl ? 5 : 2;
      vc = chain({ ...F, voice: null }, verbEntry("essere"), ep, { finite: true, impf: true, subjG: sgE.g, subjPl: sgE.pl });
      clitT.unshift("ci");
    }
    else vc = chain(F, lex, p, { mood: subjMood, impf, finite: !nonfinite && type !== "IMP", form: ing ? "ger" : "inf", subjG: sg, subjPl: spl });
    if (type === "IMP") { const ip = A("imp") === "2pl" ? 4 : A("imp") === "formal" ? 2 : 1; vc = [{ w: neg && ip === 1 ? baseWord(lex) : vf(lex, "imp", ip), finite: true, imp: !neg || ip !== 1 }]; }
    // (the clitics: before the finite verb; attached to an infinitive below a modal, a gerund, an affirmative command)
    let words;
    const lastInf = [...vc].reverse().find((x) => x.inf);
    if (clitT.length && (vc[0].imp || (nonfinite && vc.length === 1))) { vc[0].w = attach(vc[0].w, clitT); words = vc.map((x) => x.w); }
    else if (clitT.length && lastInf && vc.some((x) => x.finite) && vc.indexOf(lastInf) > 0 && !F.raise) { lastInf.w = attach(lastInf.w, clitT); words = vc.map((x) => x.w); }
    else words = [...clitT, ...vc.map((x) => x.w)];
    // (ci + è -> c'è; lo / la + a vowel -> l'; mi + è -> m'è is not written)
    const elide = (a, b) => (a === "ci" && /^[èe]/.test(b)) || (a === "ne" && /^[èe]/.test(b)) || (/^(lo|la)$/.test(a) && /^[aeiouh]/.test(b));
    words = words.flatMap((w, k, arr) => (k + 1 < arr.length && elide(w, arr[k + 1]) ? [w.replace(/[oiae]$/, "") + "'" + arr[k + 1]] : k > 0 && elide(arr[k - 1], w) ? [] : [w]));   // (c'è, se n'è andato, l'ho vista)
    // (già, sempre, mai, quasi, ancora between the auxiliary and the participle: è quasi stata distrutta, ho già mangiato)
    if (((vc.length > 1 && vc[vc.length - 1].pp) || lex.word.includes(" ")) && afterVerb.length) { const fi = words.findIndex((w) => !/^(mi|ti|si|ci|vi|lo|la|li|le|gli|ne|me|te|se|ce|ve|glie|non)$/.test(w) && !/'$/.test(w)); if (fi >= 0) { words.splice(fi + 1, 0, ...afterVerb.filter((w) => MID.has(w))); afterVerb.splice(0, afterVerb.length, ...afterVerb.filter((w) => !MID.has(w))); } }   // (è quasi stata distrutta; aveva ancora bisogno)
    // (the participle after a direct clitic agrees with it: l'ho vista, li ho visti)
    if (clitics.do.length && vc.some((x) => x.pp && !x.lex) === false && vc.length > 1 && vc[vc.length - 1].pp && !F.voice) { const cl = clitics.do[0], g2 = /^(la|le)$/.test(cl) ? "f" : "m", pl2 = /^(li|le)$/.test(cl); const i = words.length - 1; words[i] = ppForm(words[i].replace(/^l'/, ""), g2, pl2); if (/^l'/.test(words[words.length - 1])) words[i] = words[i]; }
    if (!nonfinite || type === "INF") words = [...(neg ?? []), ...mid, ...words, ...negTail];
    else if (neg) words = [...neg, ...words, ...negTail];
    // the special constructions: mi chiamo Anna; come ti chiami?
    if (verb === "volať_sa" && (A("pred")?.startsWith("name:") || A("wh") === "how")) {
      const lp = subj?.person ?? 2, v = M.conj("chiamare", "pres", lp);
      return A("wh") === "how" ? ["come", REFL[lp], v] : [REFL[lp], v, A("pred").slice(5)];
    }
    if (/^age:/.test(A("pred") ?? "")) pred = years(wordOf(A("pred").slice(4), "NUM"));
    const verbPart = [...words, ...afterVerb];
    const rest = contract([...infT, ...objs, ...(exist ? sgE.toks : []), ...pred, ...phrases, ...end, ...after]);
    const inner = A("clause") && !(ctx.plan.seq ?? []).includes(A("clause")) ? innerClause(A("clause"), fr, ctx) : [];
    const keepPron = subjMood === "subj" && subj?.pron && /^(1sg|2sg|3sg)/.test(subj.pron) && type === "SUB";   // (che tu venga: the congiuntivo presente keeps its pronoun)
    let subjT = subj && (keepPron || !(subj.pron && !/^(someone|noone|something|nothing|everything|this|that-one|who)$/.test(subj.pron))) ? subj.toks : [];
    if (subjT.length && /^none:/.test(subjV ?? "") && !subj.name && !fr.f?.subjRole) subjT = np(subjV.replace(/^none:/, "def:"), ctx).toks;
    if (A("subj") === "one") subjT.length = 0;
    const alts = (table.link[link] ?? [{ w: link, weight: 1 }]).filter((a) => !(ctx.afterMain && a.w === "siccome"));   // (siccome only before its main clause)
    const lk = type === "SUB" && link && !ctx.skipLink ? (A("it.word") ?? choose(alts.length ? alts : [{ w: link, weight: 1 }]).w).split(" ").filter(Boolean) : [];
    if (type === "WH" && A("wh") === "how-late") return whWords("how-late");   // (che ore sono?)
    if (type === "WH") { const wh = whWords(A("wh"), c, fr, ctx); return contract([...front, ...wh, ...verbPart, ...subjT, ...rest, ...inner]); }
    if (type === "YESNO") return contract(fr.f?.subjRole ? [...front, ...verbPart, ...subjT, ...rest, ...inner] : [...front, ...subjT, ...verbPart, ...rest, ...inner]);   // (no inversion: the question mark says it; ti piacerebbe un caffè?)
    if (type === "IMP") return contract([...front, ...verbPart, ...rest, ...inner]);
    if (type === "INF" || ctx.inf) {
      const parent = !ctx.inf && Object.values(ctx.plan.clauses).find((o) => (o.args.clause ?? []).includes(id));
      const pm = parent ? frameFor(parent).f?.inf?.mark : null;
      const l = link ? say("link", link) : pm && !/^(to|bare)$/.test(pm) ? pm : null;
      return contract([...(l ? l.split(" ") : []), ...verbPart, ...rest, ...inner]);
    }
    if (ing) return contract([...verbPart, ...rest]);
    if (type === "SUB" && link === "the-more") return contract(["più", ...verbPart, ...rest]);
    if (type === "MAIN" && link === "the-more-so") return contract([...(pred[0] === "più" ? [] : ["più"]), ...pred, ...words, ...objs, ...phrases]);
    if (type === "WHOEVER") return contract(["chi", ...verbPart, ...rest, ...inner]);
    if (type === "REL") return relBody(c, fr, verbPart, rest, subjT, subjV, ctx);
    if (type === "SUB" && A("wh")) { const wh = whWords(A("wh"), c, fr, ctx); return contract([...wh, ...verbPart, ...subjT, ...rest, ...inner]); }
    if (A("drop") === "yes" && ctx.dropOK) return contract([...lk, ...front, ...verbPart, ...rest, ...inner]);
    const invert = (front.length && subj && !subj.pron && !subj.name && !rest.length && !inner.length && !F.voice) || ctx.afterQuote || (fr.f?.subjRole && subjNP);   // (allora ha suonato il campanello; ora Max si è rallegrato)
    if (invert && ctx.afterQuote) return contract([...lk, ...front, ...verbPart, ...subjT, ...rest, ...inner]);
    if (invert && (rest.length || inner.length)) return contract([...lk, ...front, ...verbPart, ...rest, ...subjT, ...inner]);
    return contract(invert ? [...lk, ...front, ...verbPart, ...subjT] : [...lk, ...front, ...subjT, ...verbPart, ...rest, ...inner]);
  }
  function whWords(w, c, fr, ctx) {
    if (!w) return [];
    const rw = w.match(/^([\w.]+):(who|what)$/);
    if (rw && ROLES.has(rw[1])) { const mk = markOf(fr, rw[1], null); return [...(/^(direct)$/.test(mk) ? [] : mk === "io" ? ["a"] : [mk.split(" ")[0]]), rw[2] === "who" ? "chi" : "cosa"]; }
    const i = w.indexOf(":");
    if (i > 0) { const q = w.slice(0, i), spec = w.slice(i + 1).replace(/^[AN]\./, ""), o = np(spec.replace(/^[a-z.]+:/, "none:"), ctx); return [...(say("wh", q) ?? q).split(" ").map((x) => (q === "how-many" ? adjForm({ word: "quanto" }, o.g, o.pl) : x)), ...o.toks]; }
    return (say("wh", w) ?? w).split(" ");
  }
  const bareProfession = (v) => { const [head, ...mods] = splitTop(v); return /^indef:/.test(head) && !mods.some((m) => m.startsWith("adj:")) && kindOf(head.slice(6))("professional") ? v.replace(/^indef:/, "none:") : v; };
  function predicate(v, g, pl, ctx) {
    const [head, ...mods] = splitTop(v);
    if (head.startsWith("age:")) return years(wordOf(head.slice(4), "NUM"));
    if (head.startsWith("clock:")) { const n = wordOf(head.slice(6), "NUM"); return n === "uno" ? ["l'una"] : ["le", n]; }
    if (head.startsWith("name:")) return [head.slice(5)];
    if (!head.startsWith("adj:")) return np(bareProfession(v), ctx).toks;   // (Sono insegnante: a profession without the article)
    const a = entry(head.slice(4), "AN") ?? { word: wordOf(head.slice(4), "AN") };
    const deg = mods.find((m) => m.startsWith("deg:"));
    const target = (f) => { const m = mods.find((x) => call(x)[0] === f); if (!m) return []; const t = call(m)[1]; return table.pron?.[t] ? [PRON(t)[4] ?? PRON(t)[0]] : np(t, ctx).toks; };
    const second = mods.map(call).find(([f]) => f === "but" || f === "and");
    const tail = second ? [...(second[0] === "but" ? [",", "ma"] : ["e"]), adjForm(entry(second[1], "AN") ?? { word: wordOf(second[1], "AN") }, g, pl)] : [];
    const word = adjForm(a, g, pl);
    if (mods.includes("comp.bare")) return ["più", word];
    if (mods.includes("comp")) return ["più", word, "di", ...target("than")];
    if (mods.includes("so")) return ["così", word, "come", ...target("as")];
    if (mods.includes("sup")) return [art("def", g, pl, "più"), "più", word];
    return [...(deg ? [wordOf(deg.slice(4), "AV")] : []), word, ...tail];
  }
  // the adverb of an adjective: -mente on the feminine (lentamente), -le / -re lose their e (facilmente, regolarmente)
  const years = (n) => (/nt[ia]$/.test(n) ? [n.slice(0, -1) + "'anni"] : [n, "anni"]);   // (vent'anni, trent'anni; dieci anni)
  const adverbOf = (a) => ADVERB[a.word] ?? (a.feminine || (/o$/.test(a.word) ? a.word.slice(0, -1) + "a" : a.word)).replace(/([lr])e$/, "$1") + "mente";
  function adverb(v, k, ctx) {
    if (v === "home") return ["a", "casa"];
    if (v.startsWith("adj:")) return [adverbOf(entry(v.slice(4), "AN") ?? { word: wordOf(v.slice(4), "AN") })];
    const [h, ...a] = v.split(":");
    if (!a.length) { const e = own(v, "AV") ?? own(v, "PAR") ?? own(v, "PHR"); if (e) return e.word.split(" "); const j = own(v, "AN"); return (j ? adverbOf(j) : wordOf(v, "AV")).split(" "); }
    if (table.time?.[h]) {
      const n = (x) => entry(x, "N") ?? { word: wordOf(x, "N"), gender: "m" };
      if (h === "on-day") { const x = n(a[0]); return /mattina|sera|notte|pomeriggio/.test(x.word) ? [x.word === "pomeriggio" ? "nel" : "la", x.word] : ["il", x.word]; }   // (il lunedì; la sera)
      if (h === "in-period") { const x = n(a[0]); return /mattina|sera|notte/.test(x.word) ? ["di", x.word] : /estate|inverno|primavera|autunno/.test(x.word) ? ["in", x.word] : ["a", x.word]; }   // (in estate; a maggio)
      if (h === "at-hour") { const w = wordOf(a[0], "NUM"); return w === "uno" ? ["all'una"] : ["alle", w]; }
      if (h === "date") return ["il", a[0], n(a[1]).word];
      if (h === "last") { const x = n(a[0]); return [art("def", x.gender, false, x.word), x.word, x.gender === "f" ? "scorsa" : "scorso"]; }
      if (h === "next") { const x = n(a[0]); return [art("def", x.gender, false, "prossim"), x.gender === "f" ? "prossima" : "prossimo", x.word]; }
      if (h === "every") return ["ogni", n(a[0]).word];
      const cnt = wordOf(a[0], "NUM"), u = n(a[1]), many = cnt && !/^(uno|un)$/.test(cnt), count = many ? [cnt, plural(u)] : [u.gender === "f" ? "una" : "un", u.word];
      if (h === "since") return ["da", ...count];
      if (h === "ago") return [...count, "fa"];
      return ["fra", ...count];
    }
    if (table.rel?.[h]) return relPhrase(h, a.join(":"), ctx);
    return [sp(v)];
  }
  function relPhrase(r, v, ctx) {
    const prep = pick(table.rel?.[r] ?? [{ w: r }], splitTop(v)[0]);
    const h = splitTop(v)[0];
    if (table.pron?.[h]) return [...prep.split(" "), PRON(h)[4]];
    if (r === "by" && nounKind(h)("vehicle")) return ["in", np(v.replace(/^def:/, "none:"), ctx).toks.join(" ")];
    return contract([...prep.split(" "), ...np(v, { ...ctx, bare: true }).toks]);
  }
  function innerClause(id, fr, ctx) {
    const c = ctx.plan.clauses[id];
    if (!c) return [];
    if (c.type === "INF") { const mk = fr.f?.inf?.mark; return [...(mk && !/^(to|bare)$/.test(mk) ? [mk] : []), ...clause(id, { ...ctx, inf: true })]; }
    const parent = Object.values(ctx.plan.clauses).find((o) => (o.args.clause ?? []).includes(id));
    if (c.type === "SUB" && c.args.link?.[0] === "that" && parent && parent.args.verb?.[0] === "byť" && (parent.args.fixed || parent.args.pred)) return ["che", ...clause(id, { ...ctx, thatSubj: true, skipLink: true })];
    const pSubj = parent && (fr.f?.subjRole ? parent.args[fr.f.subjRole]?.[0] : fr.f?.that?.prep === "di" && parent.args.recipient?.[0] ? parent.args.recipient[0] : parent.args.subj?.[0]);   // (mi dispiace di non essere venuto: the recipient controls)
    if (c.type === "SUB" && fr.f?.that?.prep === "di" && pSubj && c.args.subj?.[0] === pSubj) {   // (the same subject: di + infinitive -- penso di venire; dire keeps che)
      const perfect = /perfect/.test(c.args.tense?.[0] ?? "");
      const cc = { ...c, type: "INF", args: { ...c.args, link: [], ...(perfect ? { tense: ["perfect"] } : {}) } };
      ctx.plan.clauses[id] = cc;
      const out = clause(id, { ...ctx, inf: true });
      ctx.plan.clauses[id] = c;
      return [fr.f.that.prep ?? "di", ...out];
    }
    if (c.type === "SUB" && fr.f?.that) return [...(fr.f.that.prep ? [fr.f.that.prep] : []), ...clause(id, { ...ctx, thatSubj: fr.f.that.subj })];
    if (c.type === "REP" && pSubj && c.args.subj?.[0] === pSubj) {   // (dice di essere stato malato)
      const perfect = /past|perfect/.test(c.args.tense?.[0] ?? "");
      const cc = { ...c, type: "INF", args: { ...c.args, link: [], ...(perfect ? { tense: ["perfect"] } : {}) } };
      ctx.plan.clauses[id] = cc;
      const out = clause(id, { ...ctx, inf: true });
      ctx.plan.clauses[id] = c;
      return ["di", ...out];
    }
    if (c.type === "REP") return ["che", ...clause(id, ctx)];
    return clause(id, ctx);
  }
  function relClause(id, head, ctx) { return ctx.plan?.clauses[id] ? clause(id, { ...ctx, head }) : []; }
  function relBody(c, fr, verbPart, rest, subjT, subjV, ctx) {
    const role = c.args.relrole?.[0] ?? "subj", head = ctx.head ?? {};
    if (role === "subj") return contract(["che", ...verbPart, ...rest]);
    if (role === "owner") { const o = np((subjV ?? "").replace(/^[\w.]+:/, "none:"), ctx); return contract([art("def", o.g, o.pl, "cui"), "cui", ...o.toks, ...verbPart, ...rest]); }
    if (role === "where") return contract(["dove", ...verbPart, ...subjT, ...rest]);
    if (role === "what") return contract(["ciò", "che", ...verbPart, ...rest]);
    const mk = ROLES.has(role) ? markOf(fr, role, null) : "direct";
    if (mk === "direct") return contract(["che", ...verbPart, ...subjT, ...rest]);
    const prep = mk === "io" ? "a" : mk;
    return contract([...prep.split(" "), "cui", ...verbPart, ...subjT, ...rest]);
  }

  // ---- THE SENTENCE ------------------------------------------------------------------------------------------------------
  const KEEPCOMMA = new Set(["although", "without", "instead"]);
  function realize(plan) {
    plan = lx.agree(plan);
    const ctx = { plan: { ...plan, clauses: { ...plan.clauses } } }, toks = [];
    ctxPlan = ctx.plan;
    const seq = plan.seq ?? [];
    let afterClause = false;
    for (let i = 0; i < seq.length; i++) {
      const t = seq[i], c = ctx.plan.clauses[t];
      if (c) {
        if (c.args.subj?.[0] === "that-one" && toks[toks.length - 1] === ",") { toks.pop(); const cc = { ...c, args: { ...c.args } }; delete cc.args.subj; ctx.plan.clauses[t] = cc; }
        else if (afterClause && toks[toks.length - 1] === "," && !KEEPCOMMA.has(c.args.link?.[0]) && (c.type === "INF" || c.type === "SUB")) toks.pop();
        toks.push(...clause(t, { ...ctx, dropOK: true, first: !toks.length || /^[.?!«]$/.test(toks[toks.length - 1]), afterMain: afterClause, afterQuote: seq[i - 1] === "," && seq[i - 2] === "“" }));
        afterClause = true;
      } else if (t === "„") { toks.push("«"); afterClause = false; }
      else if (t === "“") toks.push("»");
      else if (/^[,.:–?!]$/.test(t)) { toks.push(t); if (/[.?!]/.test(t)) afterClause = false; }
      else if (table.coord?.[t]) { if (/^(and|or)$/.test(t) && toks[toks.length - 1] === ",") toks.pop(); toks.push(say("coord", t)); afterClause = false; }
      else { const e = own(t, "INT") ?? own(t, "PHR") ?? own(t, "PAR") ?? own(t, "AV"), j = own(t, "AN"); toks.push(e ? e.word : j ? ADVERB[j.word] ?? j.word : wordOf(t, "INT")); }
    }
    return assemble(toks);
  }
  function assemble(toks) {
    const words = toks.filter((t) => t != null && t !== "").flatMap((t) => t.split(" ")).filter(Boolean);
    let text = "", start = true;
    for (const w of words) {
      const glue = /^[,.?!:»]$/.test(w) || !text || /[«]$/.test(text) || /'$/.test(text);   // (l'amico: an elided article joins its word)
      text += (glue ? "" : " ") + (start && /^\p{L}/u.test(w) ? cap(w) : w);
      if (/^\p{L}/u.test(w)) start = false;
      if (/^[.?!]$/.test(w) || w === "«") start = true;
      if (w === "»") start = false;
    }
    text = text.replace(/,,/g, ",").replace(/ ,/g, ",");
    return { text: cap(text), tokens: words.map((w) => ({ w, ipa: lx.ipaOf(w) })) };
  }
  return { realize, word: entry, use: lx.use };
}

export const load = loadItalian;   // (the name every realizer has: sentences.html ?lang=)
