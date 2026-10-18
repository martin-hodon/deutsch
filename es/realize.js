// SPANISH SAYS A CLAUSE PLAN (world/CLAUSES.md) in Spain's Spanish: the words, closed words and frames of
// engine/lexicon.js (es/dict.tsv, es/rules/{neutral,roles,frames,prefer}.txt), the verbs' forms of es/morph.js
// (es/rules/irregular.txt), the tense rules shared with English (engine/tense.js: the perfect as the indefinido with a
// past time). The grammar here, in order: the noun phrase (gender and number agree), the clitics, the verb chain
// (haber, ser / estar, the modals, the moods), the clause (subject dropped, clitics before the finite verb), the sentence.
//
//   const es = await loadSpanish("", { meaning, vary })
//   es.realize(plan) -> { text, tokens }

import { splitTop, call } from "../engine/realize.js";
import { loadLexicon, ROLES, PERSONS, DIRECTED, pronGender, pronPlural } from "../engine/lexicon.js";
import { planTense } from "../engine/tense.js";
import { loadMorphology, plural, adjForm, ppForm } from "./morph.js";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ACUTE = { a: "á", e: "é", i: "í", o: "ó", u: "ú" };

const INF_OWN = new Set(["pred", "pp", "place", "fixed", "clause", "inf"]);   // (gern said by gustar: what moves to the verb's infinitive)
export async function loadSpanish(base, { meaning = null, vary = null } = {}) {
  const M = await loadMorphology(base + "es/rules/irregular.txt");
  const lx = await loadLexicon(base, "es", { meaning, vary, verbEntry: (w) => verbEntry(w) });
  const { entry, wordOf, own, sp, byWord, table, say, LIST, choose, nounKind, pick, markOf, nounOf, kindOf } = lx;
  const BEFORE = new Map([...LIST("before")].map((x) => x.split(":")));   // (an adjective before the noun -> its short form)
  let ctxPlan = null;
  const frameFor = (c) => lx.frameFor(c, ctxPlan);
  const verbEntry = (w) => byWord.get("V|" + w) ?? { word: w, model: "", forms: "" };
  const ESTAR = LIST("estar"), NOART = LIST("noart"), FRONT = LIST("front"), PAST = LIST("past"), FUTURE = LIST("future"), IMPF = LIST("impf"), MID = LIST("mid");
  const ADVERB = Object.fromEntries([...LIST("adverb")].map((x) => x.split(":")));
  const MOOD = Object.fromEntries(Object.entries(table.mood ?? {}).map(([k, v]) => [k, new Set(v.map((a) => a.w))]));

  // ---- AGREEMENT: a noun's gender and number; an adjective, a participle, an article said for them ---------------------
  const detOf = (kind, g, pl, n) => {
    const f = (table.det?.[kind]?.[0]?.w ?? "").split("/");
    if (kind === "def" && !pl && n?.article === "el" && g === "f") return "el";   // (el agua)
    if (kind === "indef" && !pl && n?.article === "el" && g === "f") return "un";
    return f[(pl ? 2 : 0) + (g === "f" ? 1 : 0)] ?? f[0];
  };

  // ---- PRONOUNS: subject / direct / indirect / possessive / after a preposition / reflexive / person (0..5) -------------
  const PRON = (code) => (table.pron?.[code]?.[0]?.w ?? "").split("/");
  const personOf = (code) => Number(PRON(code)[6] ?? 2);
  const isPron = (v) => !!v && (!!table.pron?.[splitTop(v)[0]] || /^(it|them):/.test(v));
  const REFL = ["me", "te", "se", "nos", "os", "se"];
  // a thing pronoun's clitic (it:sopa -> la; them:huevo -> los)
  const thingClitic = (v) => { const m = v.match(/^(it|them):(.+)$/), n = entry(m[2], "N"); return (n?.gender === "f" ? "la" : "lo") + (m[1] === "them" ? "s" : ""); };

  // A NOUN PHRASE -> { toks, g, pl, person, pron } ; ctx.countable: a single thing after ser needs no article (Soy profesor)
  function np(v, ctx = {}) {
    if (v == null) return { toks: [], g: "m", pl: false, person: 2 };
    const [head, ...mods] = splitTop(v);
    const tp = head.match(/^(it|them):(.+)$/);
    if (tp) { const n = entry(tp[2], "N"); return { toks: [n?.gender === "f" ? "ella" : "él"].map((x) => (tp[1] === "them" ? x + "s" : x)), g: n?.gender ?? "m", pl: tp[1] === "them", person: tp[1] === "them" ? 5 : 2, pron: v }; }
    if (table.pron?.[head]) return { toks: [PRON(head)[0]], g: pronGender(head), pl: pronPlural(head), person: personOf(head), pron: head };
    if (head.startsWith("name:")) return { toks: [head.slice(5)], g: "m", pl: false, person: 2, name: true };
    const i = head.indexOf(":"), d = i < 0 ? "none" : head.slice(0, i), n = i < 0 ? head : head.slice(i + 1);
    if (n.startsWith("@")) return { toks: [verbEntry(wordOf(n.slice(1), "V")).word], g: "m", pl: false, person: 2 };   // (leer: the infinitive as a noun)
    const ne = entry(n.replace(/^~/, "").split("/")[0], "N");
    const plDet = ["all", "both", "many", "several", "few"].includes(d);
    const pl = mods.includes("pl") || plDet || ne?.plural === "PL" || (d.startsWith("num.") && !/^(uno|un|una)$/.test(wordOf(d.slice(4), "NUM")));
    const g = ne?.gender || "m", mass = ne?.plural === "-";
    const noun = pl && ne ? plural(ne) : ne?.word ?? sp(n);
    const pre = [], post = [];
    const deg = mods.find((m) => m.startsWith("deg:")), sup = mods.includes("sup"), comp = mods.includes("comp");
    if (mods.includes("one")) pre.push(g === "f" ? "única" : "único");
    const adjs = mods.filter((m) => m.startsWith("adj:")).map((m) => entry(m.slice(4), "AN") ?? { word: sp(m.slice(4)) });
    // (bueno, malo, grande, primero ... before the noun, shortened in the singular: un buen profesor, una gran casa, el
    //  primer día -- rules/neutral.txt `list before`; with a degree after it: un profesor muy bueno)
    const before = (a) => !deg && !sup && !comp && BEFORE.has(a.word);
    // (of different kinds: in Spanish's order -- before the noun the farthest first, after it the nearest first: un gran
    //  perro negro, un coche alemán rojo; else a list joined by y)
    const cumulative = !deg && !sup && !comp && lx.adjOrder.cumulative(adjs), ao = lx.adjOrder;
    for (const a of (cumulative ? ao.outward : (x) => x)(adjs.filter(before))) pre.push(!pl && (g === "m" || a.word === "grande") ? BEFORE.get(a.word) : adjForm(a, g, pl));
    const after = adjs.filter((a) => !before(a));
    if (cumulative) post.push(...ao.inward(after).map((a) => adjForm(a, g, pl)));
    else after.forEach((a, k) => post.push(...(k === 0 && deg ? [wordOf(deg.slice(4), "AV")] : []), ...(k === 0 && (sup || comp) ? ["más"] : []), adjForm(a, g, pl) + (k < after.length - 2 ? "," : ""), ...(k === after.length - 2 ? ["y"] : [])));
    for (const m of mods) {
      const [fn, a] = call(m);
      if (fn === "part") {   // los niños que ríen / el filete perfectamente frito / el té recomendado por el médico / el libro que hay que leer
        const [k, verb, ...ext] = splitTop(a, ","), ve = verbEntry(wordOf(verb, "V"));
        const by = ext.find((x) => call(x)[0] === "by");
        if (k === "zuI") post.push("que", "hay", "que", ve.word.replace(/se$/, ""));
        else if (k === "I") post.push("que", vf(ve, "pres", pl ? 5 : 2));
        else post.push(...ext.filter((x) => call(x)[0] !== "by").flatMap((x) => adverb(x, "manner", ctx)), ppForm(M.conj(ve.word.replace(/se$/, ""), "pp", 0, { model: ve.model, pp: ve.forms }), g, pl), ...(by ? ["por", ...np(call(by)[1], ctx).toks] : []));
      }
      else if (fn === "of" || fn === "owner.von") post.push("de", ...np(a, ctx).toks);
      else if (fn === "owner") post.push("de", ...np(a, ctx).toks);
      else if (fn === "rel") post.push(...relClause(a, { noun: n, g, pl }, ctx));
    }
    // the determiner
    let det = "";
    if (d === "def") det = detOf("def", g, pl, ne);
    else if (d === "indef") det = mass || pl ? "" : detOf("indef", g, pl, ne);
    else if (d === "none") det = "";
    else if (d.startsWith("poss.")) { const p = PRON(d.slice(5))[3]; det = /^(nuestro|vuestro)$/.test(p) ? adjForm({ word: p }, g, pl) : p + (pl ? "s" : ""); }
    else if (d.startsWith("num.")) { const w = wordOf(d.slice(4), "NUM"); det = /^(uno|un)$/.test(w) ? (g === "f" ? "una" : "un") : w; }
    else if (d.startsWith("name.")) { det = detOf("def", g, pl, ne); post.push("de", d.slice(5)); }
    else if (d === "all") det = detOf("all", g, true, ne);
    else if (d === "no" && mass) det = "";
    else if (table.det?.[d]) det = detOf(d, g, pl, ne);
    if (sup) det = detOf("def", g, pl, ne);
    if (ctx.bare && NOART.has(noun) && d === "def") det = "";
    const toks = [...(det ? det.split(" ") : []), ...pre, noun, ...post];
    // pairs: café o té, ni café ni té, no solo un libro sino también un periódico
    const pairs = mods.filter((m) => call(m)[0] === "pair").map((m) => splitTop(call(m)[1], ","));
    if (pairs.length) {
      const kind = pairs[0][0], others = pairs.map(([, o]) => np(o, ctx).toks);
      const J = { and: ["", "y"], or: ["", "o"], "both-and": ["tanto", "como"], "neither-nor": ["ni", "ni"], "not-but": ["", "sino"], "not-only-but-also": ["no solo", ", sino también"], "either-or": ["o", "o"] }[kind] ?? ["", kind];
      const list = [toks, ...others];
      const out = [...(J[0] ? J[0].split(" ") : []), ...list.slice(0, -1).flatMap((x, k) => [...x, ...(k < list.length - 2 ? [","] : [])]), ...(kind === "not-but" ? [","] : []), ...J[1].split(" "), ...list[list.length - 1]];
      return { toks: out, g, pl: !/^(or|neither-nor|either-or)$/.test(kind), person: 5 };
    }
    return { toks, g, pl, person: pl ? 5 : 2, noun: ne };
  }
  // a or de with the article: a el -> al, de el -> del
  const contract = (toks) => toks.flatMap((t, k) => (t === "el" && (toks[k - 1] === "a" || toks[k - 1] === "de") ? [] : t === "a" && toks[k + 1] === "el" ? ["al"] : t === "de" && toks[k + 1] === "el" ? ["del"] : [t]));

  // ---- THE VERB'S FORMS --------------------------------------------------------------------------------------------------
  // one form of a verb entry (a word of several: its first conjugated -- dar las gracias); a reflexive one without -se
  function vf(v, tense, p) {
    const [h, ...rest] = v.word.split(" "), inf = h.replace(/se$/, "");
    return M.conj(inf, tense, p, { model: v.model, pp: v.forms }) + (rest.length ? " " + rest.join(" ") : "");
  }
  const reflexive = (v) => /^\S+se(\s|$)/.test(v.word) && !/^(base|clase|fase|frase|casa)/.test(v.word);
  const baseWord = (v) => { const [h, ...r] = v.word.split(" "); return [h.replace(/se$/, ""), ...r].join(" "); };
  // (an accent where clitics after a form move its stress back: ayuda + me -> ayúdame, dar + me + lo -> dármelo)
  function attach(form, clitics) {
    if (!clitics.length) return form;
    const w = form, vowels = [...w.matchAll(/[aeiouáéíóú]/g)];
    if (/[áéíóú]/.test(w) || vowels.length < 1) return w + clitics.join("");
    // the stressed vowel: the last before -r/-l/-z... (an infinitive), else the penultimate
    const stressIdx = /[^aeiouns]$/.test(w) ? vowels[vowels.length - 1].index : vowels[Math.max(0, vowels.length - 2)].index;
    const syllablesAdded = clitics.length;
    const needs = /[^aeiouns]$/.test(w) ? syllablesAdded >= 2 : syllablesAdded >= 1 && vowels.length >= 2;
    const ww = needs ? w.slice(0, stressIdx) + ACUTE[w[stressIdx]] + w.slice(stressIdx + 1) : w;
    return ww + clitics.join("");
  }

  // ---- THE VERB CHAIN -----------------------------------------------------------------------------------------------------
  // the clause's verbs, top (finite) first: [{ w, inf }] -- tense, mood, voice, modal, raise; the lexical verb at the bottom
  const MODAL = { "môcť": ["poder"], "musieť": ["tener", "que"], "smieť": ["poder"], "mať (povinnosť)": ["deber"], "chcieť": ["querer"] };
  function chain(F, lex, p, { mood, impf, finite = true, form = "inf", subjG = "m", subjPl = false }) {
    // bottom-up: the lexical verb; ser + pp (the passive), estar + pp (a state); the modal or the raising verb; haber
    const units = [];
    const passive = F.voice === "passive" || F.voice === "state";
    units.push({ v: lex, lex: true });
    if (passive) units.push({ v: verbEntry(F.voice === "state" ? "estar" : "ser"), sel: "pp" });
    if (F.raise) units.push({ v: verbEntry(wordOf(F.raise, "V")), sel: "inf" });
    if (F.modal) { const m = MODAL[sp(F.modal)] ?? [wordOf(F.modal, "V")]; units.push({ v: verbEntry(m[0]), extra: m.slice(1), sel: "inf" }); }
    if (/perfect|pluperfect|future2/.test(F.tense)) units.push({ v: verbEntry("haber"), sel: "pp" });
    // the finite form's tense: by the plan's tense and mood
    const t = F.tense ?? "present", hypo = F.mood === "hypo";
    let tense = mood === "subjimpf" ? "subjimpf" : mood === "subj" ? (t === "past" || t === "pluperfect" ? "subjimpf" : "subj") : hypo ? "cond"
      : t === "past" ? (impf ? "impf" : "pret") : t === "pluperfect" ? "impf" : t === "future" || t === "future2" ? "fut" : "pres";
    const out = [];
    let need = finite ? tense : form;
    for (let k = units.length - 1; k >= 0; k--) {
      const u = units[k];
      let w = need === "inf" ? baseWord(u.v) : need === "ger" ? vf(u.v, "ger", p) : need === "pp" ? (u.lex && passive ? ppForm(vf(u.v, "pp", 0), subjG, subjPl) : vf(u.v, "pp", 0)) : vf(u.v, need, p);
      out.push({ w, finite: k === units.length - 1 && finite, inf: need === "inf" || need === "ger", lex: !!u.lex, v: u.v });
      for (const x of u.extra ?? []) out.push({ w: x });
      need = u.sel ?? "inf";
    }
    return out;
  }

  // ---- A CLAUSE ---------------------------------------------------------------------------------------------------------
  const tenseOf = (id, plan) => planTense(id, plan, { timeWord: (t) => wordOf(t, "AV"), isPast: (w) => PAST.has(w), isFuture: (w) => FUTURE.has(w), isNearly: (v) => /^casi$/.test(wordOf(v, "AV")), clauses: false });
  function clause(id, ctx) {
    const c = ctx.plan.clauses[id];
    if (!c) return [];
    const type = c.type, A = (k) => c.args[k]?.[0], all = (k) => c.args[k] ?? [];
    const link = A("link");
    ctx = { ...ctx, weather: false };
    if (!A("verb")) return type === "FRAG" ? contract([...np(A("np"), ctx).toks, ...all("pp").flatMap((x) => relPhrase(x.slice(0, x.indexOf(":")), x.slice(x.indexOf(":") + 1), ctx))]) : [];
    // (gern: gustar -- Ich hätte gern einen Kuchen: me gustaría una tarta; Er liest gern: le gusta leer)
    if (all("manner").includes("rád") && A("verb") !== "mať_rád") {
      const args = { ...c.args, manner: all("manner").filter((x) => x !== "rád") };
      args.verb = ["mať_rád"];
      // (the verb an infinitive clause with its objects: A Anna le gustaría celebrar Pascua)
      const infId = `${id}.rád`;
      if (A("verb") !== "mať_(vlastniť)") {
        const inf = { type: "INF", args: { verb: [A("verb")], ctrl: [A("subj")] } };
        // (the verb's own parts with it: its objects, its predicate, its phrases, its object clause -- ser artista)
        for (const k of Object.keys(args)) if ((ROLES.has(k) || INF_OWN.has(k)) && k !== "subj") { inf.args[k] = args[k]; delete args[k]; }
        ctx.plan.clauses[infId] = inf; args.clause = [infId];
      }
      ctx.plan.clauses[id] = { ...c, args };
      try { return clause(id, ctx); } finally { ctx.plan.clauses[id] = c; delete ctx.plan.clauses[infId]; }
    }
    const fr = frameFor(c);
    let lex = fr.v;
    const { F, hypo } = tenseOf(id, ctx.plan);
    // the special verbs: llamarse (Me llamo Anna), the age (Tengo veinte años), the clock (Son las ocho), hay
    const verb = F.verb, exist = verb === "dať" && A("subj") === "3sg.n" && A("patient") && !A("fixed");
    // the subject: the plan's, or the role the frame makes it (gustar: the patient), the plan's said as io (me gusta)
    const subjV = fr.f?.subjRole ? A(fr.f.subjRole) : fr.f?.subjAs ? null : A("subj");
    const subj = exist ? null : subjV ? np(subjV, ctx) : null;
    let p = subj?.person ?? 2;
    if (A("subj") === "one") p = /\+pl|^(all|both|many|several|few):|^num\./.test(A("patient") ?? "") ? 5 : 2;   // (se habla; se ven las coronas)
    const clitics = { refl: null, io: [], do: [] };
    if (A("subj") === "one") clitics.refl = "se";
    if (fr.f?.subjAs === "io" && A("subj")) { const s = A("subj"); if (table.pron?.[s]) clitics.io.push(PRON(s)[2]); else clitics.io.push("le"); if (!table.pron?.[s]) ctx.ioPhrase = ["a", ...np(s, ctx).toks]; p = A(fr.f.subjRole ?? "patient") && /pl|^num/.test(A(fr.f.subjRole ?? "patient")) ? 5 : 2; }
    if (reflexive(lex)) clitics.refl = REFL[p];
    const sePassive = (F.voice === "passive" && F.modal) || F.voice === "sichlassen";
    if (sePassive) { clitics.refl = "se"; F.voice = null; }
    let neg = A("neg") ? (A("neg") === "no-more" ? ["ya", "no"] : A("neg") === "not-yet" ? ["todavía", "no"] : ["no"]) : null;
    const objs = [], phrases = [];
    // the roles: a pronoun as a clitic, a person direct object with a, the rest by their marking
    for (const [k, vs] of Object.entries(c.args)) for (let v of vs) {
      if (!ROLES.has(k) || (exist && k === "patient") || k === fr.f?.subjRole || fr.f?.absorb.has(k) || (v === "it" && A("clause"))) continue;
      const wr = v.match(/^([a-z-]+):(.*)$/);
      if (wr && table.rel?.[wr[1]] && !table.det?.[wr[1]] && !table.pron?.[wr[1]] && !/^(it|them)$/.test(wr[1])) { phrases.push(...relPhrase(wr[1], wr[2], ctx)); continue; }
      const mk = markOf(fr, k, v);
      if (/^no:/.test(v)) { neg = ["no"]; v = v.replace(/^no:/, "no:"); }
      if (/^(nothing|noone|something|everything|someone|this)$/.test(splitTop(v)[0])) {   // (nada, nadie: no ... nada)
        const code = splitTop(v)[0]; if (/^(nothing|noone)$/.test(code)) neg = neg ?? ["no"];
        (mk === "direct" || mk === "io" ? objs : phrases).push(...(mk === "direct" ? [] : mk === "io" ? ["a"] : mk.split(" ")), PRON(code)[0]); continue;
      }
      if (table.pron?.[splitTop(v)[0]] || /^(it|them):/.test(v) || v === "it") {
        const code = splitTop(v)[0];
        if (mk === "direct") { clitics.do.push(/^(it|them):/.test(v) ? thingClitic(v) : v === "it" || code === "this" ? "lo" : PRON(code)[1]); continue; }
        if (mk === "io") { clitics.io.push(PRON(code)[2] ?? "le"); continue; }
        phrases.push(...mk.split(" "), /^(it|them):/.test(v) ? np(v, ctx).toks[0] : PRON(code)[4] ?? PRON(code)[0]); continue;
      }
      const vehicle = mk === "en" && nounKind(splitTop(v)[0])("vehicle");
      const o = np((vehicle ? v.replace(/^def:/, "none:") : v).replace(/^no:/, k === "bare" ? "none:" : "no:"), { ...ctx, bare: !/^(direct|io)$/.test(mk), countable: k === "bare" });   // (no tiene tiempo)
      if (mk === "direct") { const h = splitTop(v)[0]; objs.push(...(nounKind(h)("person") || kindOf(nounOf(v))("institution") ? ["a"] : []), ...o.toks); continue; }
      if (mk === "io") { objs.push("a", ...o.toks); continue; }
      phrases.push(...mk.split(" "), ...o.toks);
    }
    if (ctx.ioPhrase) { phrases.push(...ctx.ioPhrase); delete ctx.ioPhrase; }
    if (Object.values(c.args).flat().some((x) => /pair\((neither-nor|not-but),/.test(x))) neg = ["no"];
    for (const x of all("pp")) { const i = x.indexOf(":"), r = x.slice(0, i); if (x.slice(i + 1) === "it" && A("clause")) continue; (DIRECTED.has(r) ? phrases.unshift : phrases.push).call(phrases, ...relPhrase(r, x.slice(i + 1), ctx)); }
    for (const v of all("by")) phrases.push("por", ...np(v, ctx).toks);
    for (const v of all("role")) phrases.push("como", ...np(v, { ...ctx, countable: true }).toks);
    const after = [];
    for (const k of ["because-of", "despite", "during", "instead-of"]) for (const v of all(k)) after.push(...say("rel", k).split(" "), ...np(v, ctx).toks);
    // an infinitive's verb: se fue a dormir, la he oído cantar, hago reparar mi coche
    const infT = [];
    if (A("inf") && !fr.f?.inf?.absorb) { const mk = fr.f?.inf?.mark ?? "to"; infT.push(...(mk === "to" || mk === "bare" || mk === "pp" ? [] : [mk]), baseWord(verbEntry(wordOf(A("inf"), "V")))); }
    // the adverbs: in front (hoy, ayer, aquí), before the verb (siempre, nunca, todavía), after it (lentamente), at the end
    const front = [], mid = [], afterVerb = [], end = [];
    const subjNP = !!(subj && !subj.pron), objsCount = objs.length + phrases.length + (A("pred") ? 1 : 0) + (A("clause") ? 1 : 0);
    for (const k of ["sentence", "conn", "time", "freq", "manner", "place"]) for (const v of all(k)) {
      const t = adverb(v, k, ctx), w = t.join(" ");
      if (k === "manner" && v === "rád") continue;
      if (k === "sentence" || k === "conn") { front.push(...t, ...(ctx.first && !/^(entonces|luego|así que|quizás|tal vez)$/.test(w) && !/que$/.test(w) ? [","] : [])); continue; }
      // (hoy, ayer, aquí first where the subject is not said; ahora, pronto, entonces first in a short story line too)
      if (FRONT.has(w) && type === "MAIN" && (!subjNP || (/^(ahora|pronto|entonces|luego|poco después)$/.test(w) && !(objs.length + phrases.length)))) { front.push(...t); continue; }
      if (FRONT.has(w) && subjNP && type === "MAIN") { afterVerb.push(...t); continue; }
      if (k === "time" && F.tense === "future2" && FUTURE.has(w)) { end.push("para", ...t); continue; }   // (para mañana)
      if (k === "manner" && w === "muy" && !A("pred")) { afterVerb.push("mucho"); continue; }
      if (MID.has(w)) { if (w === "nunca" && neg) neg = null; (neg && !/^(nunca|todavía|ya|casi)$/.test(w) ? end : mid).push(w); continue; }
      if (k === "manner" && /mente$/.test(w)) { afterVerb.push(w); continue; }
      end.push(...t);
    }
    if (all("manner").includes("rád")) { /* (gern: gustar -- said by the frames when the plan's verb is mať_rád) */ }
    // the predicate: ser or estar, an adjective agreeing with the subject, a noun (Soy profesor), the age, the clock
    let pred = [];
    const sg = subj?.g ?? (type === "REL" ? ctx.head?.g : null) ?? "m", spl = subj?.pl ?? (type === "REL" ? ctx.head?.pl : null) ?? false;
    if (A("pred")) pred = predicate(A("pred"), sg, spl, ctx);
    if (A("fixed") && !fr.f?.fixed && verb === "byť" && !pred.length) pred = [adjForm(entry(A("fixed"), "AN") ?? { word: wordOf(A("fixed"), "AN") }, sg, spl)];
    if (verb === "byť") {
      const pv = A("pred") ?? "";
      const wth = Object.fromEntries([...LIST("weather")].map((x) => x.split(":")));
      const pa = /^adj:/.test(pv) ? entry(splitTop(pv)[0].slice(4), "AN")?.word : null;
      if (A("subj") === "3sg.n" && pa && wth[pa]) { lex = verbEntry("hacer"); pred = [wth[pa]]; ctx.weather = true; }
      else if (/^age:/.test(pv)) lex = verbEntry("tener");
      else if (/^clock:/.test(pv)) { lex = verbEntry("ser"); p = wordOf(pv.slice(6), "NUM") === "uno" ? 2 : 5; }
      else if (exist) lex = verbEntry("haber");
      else if (/^adj:/.test(pv) && ESTAR.has((entry(splitTop(pv)[0].slice(4), "AN")?.word ?? ""))) lex = verbEntry("estar");
      else if (!pv && (A("place") || A("location") || all("pp").length || A("wh") === "where")) lex = verbEntry("estar");   // (¿Dónde está?)
      else lex = verbEntry("ser");
    }
    // the verb chain and its clitics
    const moodList = type === "SUB" && (MOOD.subjimpf?.has(link) ? "subjimpf" : MOOD.subj?.has(link) ? "subj" : null);
    const subjMood = (type === "SUB" && fr.f?.that?.subj) || ctx.thatSubj ? "subj" : moodList;
    const impf = F.tense === "past" && (ctx.weather || IMPF.has(baseWord(lex).split(" ")[0]) || IMPF.has(lex.word) || (type === "SUB" && link === "while") || !!A("freq") || /^every:/.test(A("time") ?? ""));   // (a habit: siempre jugaba, il jouait souvent)
    const clitT = [...(clitics.refl ? [clitics.refl] : []), ...clitics.io.map((x) => (clitics.do.length && /^les?$/.test(x) ? "se" : x)), ...clitics.do];
    let vc;
    const ing = type === "SUB" && link === "by-doing";
    const nonfinite = type === "INF" || ing || ctx.inf;
    if (F.voice === "seinzu" && all("manner").length) {
      const a = (lx.byConcept.get(`AN|${sp(all("manner")[0])}`) ?? []).find((e) => /^(difícil|fácil|imposible|importante)$/.test(e.word)) ?? own(all("manner")[0], "AN") ?? { word: wordOf(all("manner")[0], "AN") };
      end.splice(0); afterVerb.splice(0);
      vc = chain({ ...F, voice: null }, verbEntry("ser"), p, { finite: true }); pred = [adjForm(a, sg, spl), "de", baseWord(lex)];
    } else if (exist) { vc = [{ w: hypo ? "habría" : F.tense === "past" ? "había" : F.tense === "future" ? "habrá" : /perfect/.test(F.tense) ? "ha habido" : "hay", finite: true }]; }
    else vc = chain(F, lex, p, { mood: subjMood, impf, finite: !nonfinite && type !== "IMP", form: ing ? "ger" : "inf", subjG: sg, subjPl: spl });
    if (type === "IMP") { const ip = A("imp") === "2pl" ? 4 : A("imp") === "formal" ? 2 : 1; vc = [{ w: neg ? vf(lex, "subj", ip) : vf(lex, "imp", ip), finite: true, imp: !neg }]; }
    // (the clitics: before the finite verb; attached to an infinitive below a modal, an affirmative command, a gerund)
    let words;
    const lastInf = [...vc].reverse().find((x) => x.inf);
    if (clitT.length && (vc[0].imp || (nonfinite && vc.length === 1))) { vc[0].w = attach(vc[0].w, clitT); words = vc.map((x) => x.w); }
    else if (clitT.length && lastInf && vc.some((x) => x.finite) && vc.indexOf(lastInf) > 0 && !/^ha/.test(vc[0].w)) { lastInf.w = attach(lastInf.w, clitT); words = vc.map((x) => x.w); }
    else words = [...clitT, ...vc.map((x) => x.w)];
    if (!nonfinite || type === "INF") words = [...(neg ?? []), ...mid, ...words];
    else if (neg) words = [...neg, ...words];
    // the special constructions: me llamo Anna; ¿cómo te llamas?
    if (verb === "volať_sa" && (A("pred")?.startsWith("name:") || A("wh") === "how")) {
      const lp = subj?.person ?? 2, v = M.conj("llamar", "pres", lp);
      return A("wh") === "how" ? ["cómo", REFL[lp], v] : [REFL[lp], v, A("pred").slice(5)];
    }
    if (/^age:/.test(A("pred") ?? "")) pred = [wordOf(A("pred").slice(4), "NUM"), "años"];
    const verbPart = [...words.slice(0, words.length), ...afterVerb];
    const rest = contract([...infT, ...objs, ...(exist ? np(A("patient"), ctx).toks : []), ...pred, ...phrases, ...end, ...after]);
    const inner = A("clause") && !(ctx.plan.seq ?? []).includes(A("clause")) ? innerClause(A("clause"), fr, ctx) : [];
    let subjT = subj && !(subj.pron && !/^(formal|someone|noone|something|nothing|everything|this|that-one|who)$/.test(subj.pron)) ? subj.toks : [];
    if (subjT.length && /^none:/.test(subjV ?? "") && !subj.name && !fr.f?.subjRole) subjT = np(subjV.replace(/^none:/, "def:"), ctx).toks;
    if (A("subj") === "one") subjT.length = 0;
    const alts = (table.link[link] ?? [{ w: link, weight: 1 }]).filter((a) => !(ctx.afterMain && a.w === "como"));   // (como only before its main clause)
    const lk = type === "SUB" && link && !ctx.skipLink ? (A("es.word") ?? choose(alts.length ? alts : [{ w: link, weight: 1 }]).w).split(" ").filter(Boolean) : [];
    if (type === "WH") { const wh = whWords(A("wh"), c, fr, ctx); return contract([...front, ...wh, ...verbPart, ...subjT, ...rest, ...inner]); }
    if (type === "YESNO") {   // (the subject after the finite verb: ¿Podría usted ayudarme? -- after the clitics and no)
      const fi = verbPart.findIndex((w) => !/^(no|me|te|se|nos|os|le|les|lo|la|los|las)$/.test(w));
      if (fr.f?.subjRole || (subjNP && !subj.pron)) return contract([...front, ...verbPart, ...subjT, ...rest, ...inner]);   // (¿Han levantado las iglesias ...?)
      return contract([...front, ...verbPart.slice(0, fi + 1), ...subjT, ...verbPart.slice(fi + 1), ...rest, ...inner]);
    }
    if (type === "IMP") return contract([...front, ...verbPart, ...rest, ...inner]);
    if (type === "INF" || ctx.inf) {
      const parent = !ctx.inf && Object.values(ctx.plan.clauses).find((o) => (o.args.clause ?? []).includes(id));
      const pm = parent ? frameFor(parent).f?.inf?.mark : null;
      const l = link ? say("link", link) : pm && !/^(to|bare)$/.test(pm) ? pm : null;
      return contract([...(l ? l.split(" ") : []), ...verbPart, ...rest, ...inner]);
    }
    if (ing) return contract([...verbPart, ...rest]);
    if (type === "SUB" && link === "the-more") return contract(["cuanto", "más", ...verbPart, ...rest]);
    if (type === "MAIN" && link === "the-more-so") return contract([...(pred[0] === "más" ? [] : ["más"]), ...pred, ...words, ...objs, ...phrases]);
    if (type === "WHOEVER") return contract(["quien", ...verbPart, ...rest, ...inner]);
    if (type === "REL") return relBody(c, fr, verbPart, rest, subjT, subjV, ctx);
    if (type === "SUB" && A("wh")) { const wh = whWords(A("wh"), c, fr, ctx); return contract([...wh, ...verbPart, ...subjT, ...rest, ...inner]); }
    if (A("drop") === "yes" && ctx.dropOK) return contract([...lk, ...front, ...verbPart, ...rest, ...inner]);
    // (an inverted subject after a front adverb of a short clause: Ahora se alegró Max)
    const invert = (front.length && subj && !subj.pron && !rest.length && !inner.length) || ctx.afterQuote || (fr.f?.subjRole && subjNP);
    if (invert && ctx.afterQuote) return contract([...lk, ...front, ...verbPart, ...subjT, ...rest, ...inner]);
    if (invert && (rest.length || inner.length)) return contract([...lk, ...front, ...verbPart, ...rest, ...subjT, ...inner]);
    return contract(invert ? [...lk, ...front, ...verbPart, ...subjT] : [...lk, ...front, ...subjT, ...verbPart, ...rest, ...inner]);
  }
  function whWords(w, c, fr, ctx) {
    if (!w) return [];
    const rw = w.match(/^([\w.]+):(who|what)$/);
    if (rw && ROLES.has(rw[1])) { const mk = markOf(fr, rw[1], null); return [...(/^(direct|io)$/.test(mk) ? (rw[2] === "who" ? ["a"] : []) : [mk.split(" ")[0]]), rw[2] === "who" ? "quién" : "qué"]; }
    const i = w.indexOf(":");
    if (i > 0) { const q = w.slice(0, i), spec = w.slice(i + 1).replace(/^[AN]\./, ""); return [...(say("wh", q) ?? q).split(" "), ...np(spec.replace(/^[a-z.]+:/, "none:"), ctx).toks]; }
    return (say("wh", w) ?? w).split(" ");
  }
  const bareProfession = (v) => { const [head, ...mods] = splitTop(v); return /^indef:/.test(head) && !mods.some((m) => m.startsWith("adj:")) && kindOf(head.slice(6))("professional") ? v.replace(/^indef:/, "none:") : v; };
  function predicate(v, g, pl, ctx) {
    const [head, ...mods] = splitTop(v);
    if (head.startsWith("age:")) return [wordOf(head.slice(4), "NUM"), "años"];
    if (head.startsWith("clock:")) { const n = wordOf(head.slice(6), "NUM"); return [n === "uno" ? "la" : "las", n === "uno" ? "una" : n]; }
    if (head.startsWith("name:")) return [head.slice(5)];
    // (a profession as it is, no article: Soy profesor, ser artista -- with an adjective it has one: un buen profesor)
    if (!head.startsWith("adj:")) return np(bareProfession(v), ctx).toks;
    const a = entry(head.slice(4), "AN") ?? { word: wordOf(head.slice(4), "AN") };
    const deg = mods.find((m) => m.startsWith("deg:"));
    const target = (f) => { const m = mods.find((x) => call(x)[0] === f); if (!m) return []; const t = call(m)[1]; return table.pron?.[t] ? [PRON(t)[0]] : np(t, ctx).toks; };
    const second = mods.map(call).find(([f]) => f === "but" || f === "and");
    const tail = second ? [...(second[0] === "but" ? [",", "pero"] : ["y"]), adjForm(entry(second[1], "AN") ?? { word: wordOf(second[1], "AN") }, g, pl)] : [];
    const word = adjForm(a, g, pl);
    if (mods.includes("comp.bare")) return ["más", word];
    if (mods.includes("comp")) return [/^(grande|mayor)$/.test(a.word) ? "más" : "más", word, "que", ...target("than")];
    if (mods.includes("so")) return ["tan", word, "como", ...target("as")];
    if (mods.includes("sup")) return [detOf("def", g, pl), "más", word];
    return [...(deg ? [wordOf(deg.slice(4), "AV")] : []), word, ...tail];
  }
  const adverbOf = (a) => ADVERB[a.word] ?? (a.feminine || (/o$/.test(a.word) ? a.word.slice(0, -1) + "a" : a.word)) + "mente";
  function adverb(v, k, ctx) {
    if (v === "home") return ["en", "casa"];
    if (v.startsWith("adj:")) return [adverbOf(entry(v.slice(4), "AN") ?? { word: wordOf(v.slice(4), "AN") })];
    const [h, ...a] = v.split(":");
    if (!a.length) { const e = own(v, "AV") ?? own(v, "PAR") ?? own(v, "PHR"); if (e) return e.word.split(" "); const j = own(v, "AN"); return (j ? adverbOf(j) : wordOf(v, "AV")).split(" "); }
    if (table.time?.[h]) {
      const n = (x) => entry(x, "N") ?? { word: wordOf(x, "N"), gender: "m" };
      if (h === "on-day") return /mañana|tarde|noche/.test(n(a[0]).word) ? ["por", "la", n(a[0]).word] : ["el", n(a[0]).word];
      if (h === "in-period") return /mañana|tarde|noche/.test(n(a[0]).word) ? ["por", "la", n(a[0]).word] : ["en", n(a[0]).word];
      if (h === "at-hour") { const w = wordOf(a[0], "NUM"); return w === "uno" ? ["a", "la", "una"] : ["a", "las", w]; }
      if (h === "date") return ["el", a[0], "de", n(a[1]).word];
      if (h === "last") { const x = n(a[0]); return [x.gender === "f" ? "la" : "el", x.word, x.gender === "f" ? "pasada" : "pasado"]; }
      if (h === "next") { const x = n(a[0]); return [x.gender === "f" ? "la" : "el", x.gender === "f" ? "próxima" : "próximo", x.word]; }
      if (h === "every") return ["cada", n(a[0]).word];
      const cnt = wordOf(a[0], "NUM"), u = n(a[1]), many = cnt && !/^(uno|un)$/.test(cnt), count = many ? [cnt, plural(u)] : [u.gender === "f" ? "una" : "un", u.word];
      if (h === "since") return ["desde", "hace", ...count];
      if (h === "ago") return ["hace", ...count];
      return ["en", ...count];
    }
    if (table.rel?.[h]) return relPhrase(h, a.join(":"), ctx);
    return [sp(v)];
  }
  function relPhrase(r, v, ctx) {
    const prep = pick(table.rel?.[r] ?? [{ w: r }], splitTop(v)[0]);
    const h = splitTop(v)[0];
    if (table.pron?.[h]) return [...prep.split(" "), PRON(h)[4]];
    if (r === "by" && nounKind(h)("vehicle")) return ["en", np(v.replace(/^def:/, "none:"), ctx).toks.join(" ")];
    return [...prep.split(" "), ...np(v, { ...ctx, bare: true }).toks];
  }
  function innerClause(id, fr, ctx) {
    const c = ctx.plan.clauses[id];
    if (!c) return [];
    if (c.type === "INF") { const mk = fr.f?.inf?.mark; return [...(mk && !/^(to|bare)$/.test(mk) ? [mk] : []), ...clause(id, { ...ctx, inf: true })]; }
    const parent = Object.values(ctx.plan.clauses).find((o) => (o.args.clause ?? []).includes(id));
    if (c.type === "SUB" && c.args.link?.[0] === "that" && parent && parent.args.verb?.[0] === "byť" && (parent.args.fixed || parent.args.pred)) return ["que", ...clause(id, { ...ctx, thatSubj: true, skipLink: true })];
    const pSubj = parent && (fr.f?.subjRole ? parent.args[fr.f.subjRole]?.[0] : parent.args.subj?.[0]);
    if (c.type === "SUB" && fr.f?.that && pSubj && c.args.subj?.[0] === pSubj) {   // (the same subject: an infinitive)
      const perfect = /perfect/.test(c.args.tense?.[0] ?? "");
      const cc = { ...c, type: "INF", args: { ...c.args, link: [], tense: perfect ? ["perfect"] : c.args.tense } };
      ctx.plan.clauses[id] = cc;
      const out = clause(id, { ...ctx, inf: true });
      ctx.plan.clauses[id] = c;
      return [...(fr.f.that.prep ? [fr.f.that.prep] : []), ...out];
    }
    if (c.type === "SUB" && fr.f?.that) return [...(fr.f.that.prep ? [fr.f.that.prep] : []), ...clause(id, { ...ctx, thatSubj: fr.f.that.subj })];
    if (c.type === "REP") return ["que", ...clause(id, ctx)];
    return clause(id, ctx);
  }
  function relClause(id, head, ctx) { return ctx.plan?.clauses[id] ? clause(id, { ...ctx, head }) : []; }
  function relBody(c, fr, verbPart, rest, subjT, subjV, ctx) {
    const role = c.args.relrole?.[0] ?? "subj", head = ctx.head ?? {};
    const art = head.g === "f" ? (head.pl ? "las" : "la") : head.pl ? "los" : "el";
    if (role === "subj") return contract(["que", ...verbPart, ...rest]);
    if (role === "owner") { const o = np((subjV ?? "").replace(/^[\w.]+:/, "none:"), ctx); return contract([o.g === "f" ? "cuya" : "cuyo", ...o.toks, ...verbPart, ...rest]); }
    if (role === "where") return contract(["donde", ...verbPart, ...subjT, ...rest]);
    if (role === "what") return contract(["lo", "que", ...verbPart, ...rest]);
    const mk = ROLES.has(role) ? markOf(fr, role, null) : "direct";
    const person = head.noun ? nounKind("x:" + head.noun)("person") : false;
    if (mk === "direct" && !person) return contract(["que", ...verbPart, ...subjT, ...rest]);
    const prep = mk === "direct" || mk === "io" ? "a" : mk;
    return contract([...prep.split(" "), art, "que", ...verbPart, ...subjT, ...rest]);
  }

  // ---- THE SENTENCE ------------------------------------------------------------------------------------------------------
  const KEEPCOMMA = new Set(["although", "without", "instead"]);
  function realize(plan) {
    plan = lx.agree(plan);   // (elles, ellas: a 3pl pronoun as what it stands for)
    const ctx = { plan: { ...plan, clauses: { ...plan.clauses } } }, toks = [];
    ctxPlan = ctx.plan;
    const seq = plan.seq ?? [];
    let afterClause = false, start = 0;   // (start: where the sentence or the quote began -- its ¿ and ¡ go there)
    for (let i = 0; i < seq.length; i++) {
      const t = seq[i], c = ctx.plan.clauses[t];
      if (c) {
        if (c.args.subj?.[0] === "that-one" && toks[toks.length - 1] === ",") { toks.pop(); const cc = { ...c, args: { ...c.args } }; delete cc.args.subj; ctx.plan.clauses[t] = cc; }
        else if (afterClause && toks[toks.length - 1] === "," && !KEEPCOMMA.has(c.args.link?.[0]) && (c.type === "INF" || c.type === "SUB")) toks.pop();
        toks.push(...clause(t, { ...ctx, dropOK: true, first: !toks.length || /^[.?!«]$/.test(toks[toks.length - 1]), afterMain: afterClause, afterQuote: seq[i - 1] === "," && seq[i - 2] === "“" }));
        afterClause = true;
      } else if (t === "„") { toks.push("«"); start = toks.length; afterClause = false; }
      else if (t === "“") toks.push("»");
      else if (t === "?" || t === "!") { toks.splice(start, 0, t === "?" ? "¿" : "¡"); toks.push(t); start = toks.length; afterClause = false; }
      else if (/^[,.:–]$/.test(t)) { toks.push(t); if (t === ".") { start = toks.length; afterClause = false; } }
      else if (table.coord?.[t]) { if (/^(and|or)$/.test(t) && toks[toks.length - 1] === ",") toks.pop(); toks.push(say("coord", t)); afterClause = false; }
      else { const e = own(t, "INT") ?? own(t, "PHR") ?? own(t, "PAR") ?? own(t, "AV"), j = own(t, "AN"); toks.push(e ? e.word : j ? ADVERB[j.word] ?? j.word : wordOf(t, "INT")); }
    }
    return assemble(toks);
  }
  function assemble(toks) {
    const words = toks.filter((t) => t != null && t !== "").flatMap((t) => t.split(" "));
    let text = "", start = true;
    for (const w of words) {
      const glue = /^[,.?!:»]$/.test(w) || !text || /[«¿¡]$/.test(text);
      text += (glue ? "" : " ") + (start && /^\p{L}/u.test(w) ? cap(w) : w);
      if (/^\p{L}/u.test(w)) start = false;
      if (/^[.?!]$/.test(w) || /^[«¿¡]$/.test(w)) start = true;
      if (w === "»") start = false;
    }
    text = text.replace(/,,/g, ",").replace(/ ,/g, ",");
    return { text: cap(text), tokens: words.map((w) => ({ w, ipa: lx.ipaOf(w) })) };
  }
  return { realize, word: entry, use: lx.use };
}

export const load = loadSpanish;   // (the name every realizer has: sentences.html ?lang=)
