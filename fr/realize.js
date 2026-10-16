// FRENCH SAYS A CLAUSE PLAN (world/CLAUSES.md) in France's French: the words, closed words and frames of
// engine/lexicon.js (fr/dict.tsv, fr/rules/{neutral,roles,frames,prefer}.txt), the verbs' forms of fr/morph.js
// (fr/rules/irregular.txt), the tense rules shared with English and Spanish (engine/tense.js). The grammar here, in
// order: the noun phrase (gender, number, the partitive), the clitics, the verb chain (avoir / être, the participle's
// agreement, the modals, the moods), the clause (ne ... pas, the question's inversion), the sentence (elision: j', l',
// qu'; au, du; « » and the space before ? ! :).
//
//   const fr = await loadFrench("", { meaning, vary })
//   fr.realize(plan) -> { text, tokens }

import { splitTop, call } from "../engine/realize.js";
import { loadLexicon, ROLES, DIRECTED, pronGender, pronPlural } from "../engine/lexicon.js";
import { planTense } from "../engine/tense.js";
import { loadMorphology, plural, adjForm, ppForm } from "./morph.js";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const VOWEL = /^[aeiouyéèêëàâîïôûœhAEIOUYÉÈÊÀÂÎÔÛŒH]/;
// (h aspiré: no elision -- le héros, la honte)
const ASPIRE = /^(haricot|héros|hibou|hache|haut|honte|hasard|huit|hurler|hall|hamburger|handicap|harpe|hareng|haie|hanche|hangar|hockey|hollande|hongrie|houx|hutte|haïr)/i;

export async function loadFrench(base, { meaning = null, vary = null } = {}) {
  const M = await loadMorphology(base + "fr/rules/irregular.txt");
  const lx = await loadLexicon(base, "fr", { meaning, vary, verbEntry: (w) => verbEntry(w) });
  const { entry, wordOf, own, sp, byWord, table, say, LIST, choose, nounKind, pick, markOf, nounOf, kindOf } = lx;
  let ctxPlan = null;
  const frameFor = (c) => lx.frameFor(c, ctxPlan);
  const verbEntry = (w) => byWord.get("V|" + w) ?? { word: w, model: "", forms: "", aux: "" };
  const BEFORE = LIST("before"), FRONT = LIST("front"), PAST = LIST("past"), FUTURE = LIST("future"), IMPF = LIST("impf"), MID = LIST("mid");
  const ADVERB = Object.fromEntries([...LIST("adverb")].map((x) => x.split(":"))), WEATHER = Object.fromEntries([...LIST("weather")].map((x) => x.split(":")));
  const MOOD = Object.fromEntries(Object.entries(table.mood ?? {}).map(([k, v]) => [k, new Set(v.map((a) => a.w))]));
  const vowelStart = (w) => VOWEL.test(w) && !ASPIRE.test(w);

  // ---- AGREEMENT ----------------------------------------------------------------------------------------------------------
  const det = (kind, g, pl, next) => {
    const f = (table.det?.[kind]?.[0]?.w ?? "").split("/");
    let d = f[(pl ? 2 : 0) + (g === "f" ? 1 : 0)] ?? f[0];
    if (!pl && next && vowelStart(next) && /^(le|la)$/.test(d)) d = "l'";
    if (!pl && next && vowelStart(next) && /^(du|de la)$/.test(d)) d = "de l'";
    if (!pl && next && vowelStart(next) && d === "ce") d = "cet";
    return d;
  };

  // ---- PRONOUNS: subject / direct / indirect / possessive (m,f,pl) / stressed / reflexive / person ---------------------
  const PRON = (code) => (table.pron?.[code]?.[0]?.w ?? "").split("/");
  const personOf = (code) => Number(PRON(code)[6] ?? 2);
  const REFL = ["me", "te", "se", "nous", "vous", "se"];
  const thingClitic = (v) => { const m = v.match(/^(it|them):(.+)$/); if (m[1] === "them") return "les"; return entry(m[2], "N")?.gender === "f" ? "la" : "le"; };
  const possessive = (code, g, pl, next) => { const [m, f, p] = PRON(code)[3].split(","); return pl ? p : g === "f" && !(next && vowelStart(next)) ? f : m; };

  // A NOUN PHRASE -> { toks, g, pl, person, pron, mass }; ctx.partitive: none: says du / de la / des; ctx.neg: de
  function np(v, ctx = {}) {
    if (v == null) return { toks: [], g: "m", pl: false, person: 2 };
    const [head, ...mods] = splitTop(v);
    const tp = head.match(/^(it|them):(.+)$/);
    // (a thing's pronoun by its French gender: il, elle, ils, elles -- after a preposition stressed: lui, eux; ctx.stressed)
    if (tp) { const n = entry(tp[2], "N"), f = n?.gender === "f", them = tp[1] === "them"; return { toks: [ctx.stressed ? (them ? (f ? "elles" : "eux") : f ? "elle" : "lui") : them ? (f ? "elles" : "ils") : f ? "elle" : "il"], g: n?.gender ?? "m", pl: them, person: them ? 5 : 2, pron: v }; }
    if (table.pron?.[head]) return { toks: [PRON(head)[0]], g: pronGender(head), pl: pronPlural(head), person: personOf(head), pron: head };
    if (head.startsWith("name:")) return { toks: [head.slice(5)], g: "m", pl: false, person: 2, name: true };
    const i = head.indexOf(":"), d = i < 0 ? "none" : head.slice(0, i), n = i < 0 ? head : head.slice(i + 1);
    if (n.startsWith("@")) return { toks: [verbEntry(wordOf(n.slice(1), "V")).word.replace(/^(se |s')/, "")], g: "m", pl: false, person: 2 };
    const ne = entry(n.replace(/^~/, "").split("/")[0], "N");
    const plDet = ["all", "both", "many", "several", "few"].includes(d);
    const pl = mods.includes("pl") || plDet || ne?.plural === "PL" || (d.startsWith("num.") && !/^(un|une)$/.test(wordOf(d.slice(4), "NUM")));
    const g = ne?.gender || "m", mass = ne?.plural === "-";
    const noun = pl && ne ? plural(ne) : ne?.word ?? sp(n);
    const pre = [], post = [];
    const deg = mods.find((m) => m.startsWith("deg:")), sup = mods.includes("sup"), comp = mods.includes("comp");
    if (mods.includes("one")) pre.push(adjForm({ word: "seul" }, g, pl));
    const adjs = mods.filter((m) => m.startsWith("adj:")).map((m) => entry(m.slice(4), "AN") ?? { word: sp(m.slice(4)) });
    adjs.forEach((a, k) => (BEFORE.has(a.word) && !deg ? pre : post).push(...(k === 0 && deg ? [wordOf(deg.slice(4), "AV")] : []), ...(k === 0 && (sup || comp) ? ["plus"] : []), adjForm(a, g, pl) + (k < adjs.length - 2 && !BEFORE.has(a.word) ? "," : ""), ...(k === adjs.length - 2 && !BEFORE.has(adjs[k + 1]?.word) && !BEFORE.has(a.word) ? ["et"] : [])));
    for (const m of mods) {
      const [fn, a] = call(m);
      if (fn === "part") {   // les enfants riants / le filet parfaitement frit / le thé recommandé par le médecin / le livre à lire
        const [k, verb, ...ext] = splitTop(a, ","), ve = verbEntry(wordOf(verb, "V")), inf = ve.word.replace(/^(se |s')/, "");
        const by = ext.find((x) => call(x)[0] === "by");
        if (k === "zuI") post.push("à", inf);
        else if (k === "I") post.push(adjForm({ word: M.conj(inf, "ger", 0, { model: ve.model }) }, g, pl));
        else post.push(...ext.filter((x) => call(x)[0] !== "by").flatMap((x) => adverb(x, "manner", ctx)), ppForm(M.conj(inf, "pp", 0, { model: ve.model, pp: ve.forms }), g, pl), ...(by ? ["par", ...np(call(by)[1], ctx).toks] : []));
      }
      else if (fn === "of" || fn === "owner.von") post.push("de", ...np(a.replace(/^def:|^indef:/, "none:"), { ...ctx, noPartitive: true }).toks);
      else if (fn === "owner") post.push("de", ...np(a, ctx).toks);
      else if (fn === "rel") post.push(...relClause(a, { noun: n, g, pl }, ctx));
    }
    // the determiner
    const first = [...pre, noun][0];
    let dt = "";
    if (d === "def") dt = det("def", g, pl, first);
    else if (d === "indef") dt = ctx.neg ? "de" : mass ? det("part", g, false, first) : det("indef", g, pl, first);
    else if (d === "none") dt = ctx.pred || ctx.noPartitive || ctx.bare || kindOf(n)("language") ? "" : ctx.neg ? "de" : det("part", g, pl, first);
    else if (d === "no") dt = "de";
    else if (d.startsWith("poss.")) dt = possessive(d.slice(5), g, pl, first);
    else if (d.startsWith("num.")) { const w = wordOf(d.slice(4), "NUM"); dt = /^(un|une)$/.test(w) ? (g === "f" ? "une" : "un") : w; }
    else if (d.startsWith("name.")) { dt = det("def", g, pl, first); post.push("de", d.slice(5)); }
    else if (table.det?.[d]) dt = det(d, g, pl, first);
    if (sup) dt = det("def", g, pl, first);
    if (dt === "de" && vowelStart(first)) dt = "d'";
    const toks = [...(dt ? dt.split(" ") : []), ...pre, noun, ...post];
    const pairs = mods.filter((m) => call(m)[0] === "pair").map((m) => splitTop(call(m)[1], ","));
    if (pairs.length) {
      const kind = pairs[0][0], others = pairs.map(([, o]) => np(o, ctx).toks);
      const J = { and: ["", "et"], or: ["", "ou"], "both-and": ["et", "et"], "neither-nor": ["ni", "ni"], "not-but": ["", ", mais"], "not-only-but-also": ["non seulement", ", mais aussi"], "either-or": ["soit", "soit"] }[kind] ?? ["", kind];
      const strip = (t) => (kind === "neither-nor" && /^(du|de|des|de la|d')$/.test(t[0]) ? t.slice(t[1] === "la" ? 2 : 1) : t);
      const notBut = (t) => (kind === "not-but" && /^(du|des|de)$/.test(t[0]) ? ["de", ...t.slice(t[0] === "de" && t[1] === "la" ? 2 : 1)] : t);
      const list = [notBut(strip(toks)), ...others.map(strip)];
      const out = [...(J[0] ? J[0].split(" ") : []), ...list.slice(0, -1).flatMap((x, k) => [...x, ...(k < list.length - 2 ? [","] : [])]), ...J[1].split(" ").filter(Boolean), ...list[list.length - 1]];
      return { toks: out, g, pl: !/^(or|neither-nor|either-or)$/.test(kind), person: 5 };
    }
    return { toks, g, pl, person: pl ? 5 : 2, noun: ne, mass };
  }

  // ---- THE VERB ---------------------------------------------------------------------------------------------------------
  const reflexive = (v) => /^(se |s')/.test(v.word);
  const baseWord = (v) => v.word.replace(/^(se |s')/, "");
  function vf(v, tense, p) {
    const [h, ...rest] = baseWord(v).split(" ");
    return M.conj(h, tense, p, { model: v.model, pp: v.forms }) + (rest.length ? " " + rest.map((w) => (w === "se" ? REFL[p] : w)).join(" ") : "");
  }
  const ETRE = LIST("etre");
  const auxOf = (v) => { const h = baseWord(v).split(" ")[0]; return v.aux === "être" || verbEntry(h).aux === "être" || ETRE.has(h) || reflexive(v) ? "être" : "avoir"; };
  const MODAL = { "môcť": "pouvoir", "musieť": "devoir", "smieť": "pouvoir", "mať (povinnosť)": "devoir", "chcieť": "vouloir", "mať rád": "aimer" };
  // the chain, top (finite) first: [{ w, finite, inf, pp }]
  function chain(F, lex, p, { mood, impf, finite = true, form = "inf", subjG = "m", subjPl = false, doG = null }) {
    const units = [{ v: lex, lex: true }];
    const passive = F.voice === "passive" || F.voice === "state";
    if (passive) units.push({ v: verbEntry("être"), sel: "pp", agree: true });
    if (F.raise) units.push({ v: verbEntry(wordOf(F.raise, "V")), sel: "inf" });
    if (F.modal) units.push({ v: verbEntry(MODAL[sp(F.modal)] ?? wordOf(F.modal, "V")), sel: "inf" });
    const t = F.tense ?? "present", hypo = F.mood === "hypo";
    const compound = /perfect|pluperfect|future2/.test(t) || (t === "past" && !impf && mood !== "subjimpf" && mood !== "impf");
    if (compound) {   // (avoir or être: the auxiliary of the verb below it -- il est venu, il a été construit)
      const below = units[units.length - 1];
      units.push({ v: verbEntry(below.v === units[0].v && !passive ? auxOf(lex) : "avoir"), sel: "pp", agree: auxOf(lex) === "être" && units.length === 1 });
    }
    const tense = mood === "impf" ? (compound ? "impf" : "impf") : mood === "subj" ? "subj" : hypo ? "cond" : t === "past" ? (compound ? "pres" : "impf") : t === "pluperfect" ? "impf" : /future/.test(t) ? "fut" : t === "perfect" ? "pres" : "pres";
    const out = [];
    let need = finite ? tense : form, agree = false;
    for (let k = units.length - 1; k >= 0; k--) {
      const u = units[k];
      let w = need === "inf" ? baseWord(u.v) : need === "ger" ? vf(u.v, "ger", p) : need === "pp" ? vf(u.v, "pp", p) : vf(u.v, need, p);
      if (need === "pp" && (agree || (k === 0 && doG))) { const [h0, ...r0] = w.split(" "); w = [ppForm(h0, agree ? subjG : doG.g, agree ? subjPl : doG.pl), ...r0].join(" "); }   // (allés nous promener)
      out.push({ w, finite: k === units.length - 1 && finite, inf: need === "inf" || need === "ger", pp: need === "pp", lex: !!u.lex });
      agree = !!u.agree && (u.v.word === "être");
      need = u.sel ?? "inf";
    }
    return out;
  }

  // ---- A CLAUSE ---------------------------------------------------------------------------------------------------------
  const tenseOf = (id, plan) => planTense(id, plan, { timeWord: (t) => wordOf(t, "AV"), isPast: (w) => PAST.has(w), isFuture: (w) => FUTURE.has(w), isNearly: (v) => /^presque$/.test(wordOf(v, "AV")), clauses: false });
  function clause(id, ctx) {
    const c = ctx.plan.clauses[id];
    if (!c) return [];
    ctx = { ...ctx, weather: false };
    const type = c.type, A = (k) => c.args[k]?.[0], all = (k) => c.args[k] ?? [];
    const link = A("link");
    if (!A("verb")) return type === "FRAG" ? [...np(A("np"), { ...ctx, noPartitive: true }).toks, ...all("pp").flatMap((x) => relPhrase(x.slice(0, x.indexOf(":")), x.slice(x.indexOf(":") + 1), ctx))] : [];
    // (gern: aimer -- j'aimerais un café; il aime lire)
    if (all("manner").includes("rád") && A("verb") !== "mať_rád") {
      const args = { ...c.args, manner: all("manner").filter((x) => x !== "rád") };
      if (A("verb") === "mať_(vlastniť)") args.verb = ["mať_rád"]; else { args.inf = [A("verb")]; args.verb = ["mať_rád"]; }
      ctx.plan.clauses[id] = { ...c, args };
      try { return clause(id, ctx); } finally { ctx.plan.clauses[id] = c; }
    }
    const fr = frameFor(c);
    let lex = fr.v;
    const { F, hypo } = tenseOf(id, ctx.plan);
    const verb = F.verb, exist = verb === "dať" && A("subj") === "3sg.n" && A("patient") && !A("fixed");
    const subjV = fr.f?.subjRole ? A(fr.f.subjRole) : A("subj");
    let subj = exist ? null : subjV ? np(subjV.replace(/^none:/, "def:"), ctx) : null;
    let p = subj?.person ?? 2;
    const clitics = { refl: null, me: [], do: [], io: [] };
    let neg = A("neg") ? ({ "no-more": ["ne", "plus"], "not-yet": ["ne", "pas encore"], "not-at-all": ["ne", "pas du tout"] }[A("neg")] ?? ["ne", "pas"]) : null;
    const objs = [], phrases = [];
    let doG = null;
    for (const r of fr.f?.absorb.keys() ?? []) if (/^no:/.test(A(r) ?? "")) neg = ["ne", "pas"];
    for (const [k, vs] of Object.entries(c.args)) for (let v of vs) {
      if (!ROLES.has(k) || (exist && k === "patient") || k === fr.f?.subjRole || fr.f?.absorb.has(k) || (v === "it" && A("clause"))) continue;
      const wr = v.match(/^([a-z-]+):(.*)$/);
      if (wr && table.rel?.[wr[1]] && !table.det?.[wr[1]] && !table.pron?.[wr[1]] && !/^(it|them)$/.test(wr[1])) { phrases.push(...relPhrase(wr[1], wr[2], ctx)); continue; }
      const mk = markOf(fr, k, v), code = splitTop(v)[0];
      if (/^(nothing|noone)$/.test(code)) { neg = ["ne", code === "nothing" ? "rien" : "personne"]; continue; }   // (je n'ai rien vu)
      if (/^(something|everything|someone|this)$/.test(code)) { (mk === "direct" ? objs : phrases).push(...(mk === "direct" ? [] : mk === "io" ? ["à"] : mk.split(" ")), code === "this" ? "cela" : PRON(code)[0]); continue; }
      if (table.pron?.[code] || /^(it|them):/.test(v) || v === "it") {
        if (mk === "direct") { const cl = /^(it|them):/.test(v) ? thingClitic(v) : v === "it" ? "le" : PRON(code)[1]; (/^(le|la|les)$/.test(cl) ? clitics.do : clitics.me).push(cl); if (/^(la|les)$/.test(cl)) doG = { g: cl === "la" || code === "3sg.f" ? "f" : "m", pl: cl === "les" }; continue; }
        if (mk === "io") { const cl = PRON(code)[2]; (/^(lui|leur)$/.test(cl) ? clitics.io : clitics.me).push(cl); continue; }
        if (mk === "à" && !/^(it|them):/.test(v)) { const cl = PRON(code)[2]; (/^(lui|leur)$/.test(cl) ? clitics.io : clitics.me).push(cl); continue; }   // (rendre visite à toi -> te rendre visite)
        phrases.push(...mk.split(" "), /^(it|them):/.test(v) ? np(v, { ...ctx, stressed: true }).toks[0] : PRON(code)[4]); continue;
      }
      if (/^no:/.test(code)) neg = ["ne", "pas"];
      const vehicle = mk === "en" && nounKind(code)("vehicle");
      if (vehicle) v = v.replace(/^def:/, "none:");
      const o = np(v, { ...ctx, neg: !!neg && mk === "direct", bare: vehicle });
      if (mk === "direct") { objs.push(...o.toks); continue; }
      if (mk === "io") { objs.push("à", ...o.toks); continue; }
      phrases.push(...placePhrase(mk, v, ctx));
    }
    if (Object.values(c.args).flat().some((x) => /pair\((neither-nor|not-but),/.test(x))) neg = ["ne", "pas"];
    if (Object.values(c.args).flat().some((x) => /pair\(neither-nor,/.test(x))) neg = ["ne", ""];
    for (const x of all("pp")) { const i = x.indexOf(":"), r = x.slice(0, i); if (x.slice(i + 1) === "it" && A("clause")) continue; (DIRECTED.has(r) ? phrases.unshift : phrases.push).call(phrases, ...relPhrase(r, x.slice(i + 1), ctx)); }
    for (const v of all("by")) phrases.push("par", ...np(v, ctx).toks);
    for (const v of all("role")) phrases.push("en", "tant", "que", ...np(v.replace(/^[a-z.]+:/, "none:"), { ...ctx, pred: true }).toks);
    const after = [];
    for (const k of ["because-of", "despite", "during", "instead-of"]) for (const v of all(k)) after.push(...say("rel", k).split(" "), ...np(v, ctx).toks);
    const infT = [];
    if (A("inf") && !fr.f?.inf?.absorb) { const mk = fr.f?.inf?.mark ?? "to"; infT.push(...(/^(to|bare|pp)$/.test(mk) ? [] : [mk]), baseWord(verbEntry(wordOf(A("inf"), "V")))); }
    // the adverbs: first with a comma (Maintenant, Lundi,), between the auxiliary and the participle (déjà, souvent),
    // after the verb (lentement), at the end
    const front = [], mid = [], afterVerb = [], end = [];
    for (const k of ["sentence", "conn", "place", "time", "freq", "manner"]) for (const v of all(k)) {
      const t = adverb(v, k, ctx), w = t.join(" ");
      if (k === "sentence" || k === "conn") { front.push(...t, ...(ctx.first && !/^(alors|puis|ensuite|donc)$/.test(w) ? [","] : [])); continue; }
      // (first where the subject is a pronoun, or in a short story line; after the verb beside a noun subject)
      const subjNP = !!(subj && !subj.pron);
      if ((FRONT.has(w) || /^on-day:/.test(v)) && type === "MAIN" && (!subjNP || !(objs.length + phrases.length))) { front.push(...t, ...(/^(puis|ensuite)$/.test(w) ? [] : [","])); continue; }
      if (FRONT.has(w) && type === "MAIN" && subjNP) { afterVerb.push(...t); continue; }
      if (k === "manner" && w === "très" && !A("pred")) { afterVerb.push("beaucoup"); continue; }
      if (MID.has(w)) { mid.push(w); continue; }
      if (k === "manner" && /ment$/.test(w)) { afterVerb.push(w); continue; }
      if (k === "time" && F.tense === "future2" && FUTURE.has(w)) { end.push(...t); continue; }
      end.push(...t);
    }
    // the predicate: être, c'est, il fait froid, avoir ... ans, il est huit heures
    let pred = [];
    const sg = subj?.g ?? (type === "REL" ? ctx.head?.g : null) ?? "m", spl = subj?.pl ?? (type === "REL" ? ctx.head?.pl : null) ?? false;
    if (A("pred")) pred = predicate(A("pred"), sg, spl, ctx);
    if (A("fixed") && !fr.f?.fixed && verb === "byť" && !pred.length) pred = [adjForm(entry(A("fixed"), "AN") ?? { word: wordOf(A("fixed"), "AN") }, "m", false)];
    let cest = false;
    if (verb === "byť") {
      const pv = A("pred") ?? "", pa = /^adj:/.test(pv) ? entry(splitTop(pv)[0].slice(4), "AN")?.word : null;
      if (A("subj") === "3sg.n" && pa && WEATHER[pa]) { lex = verbEntry("faire"); pred = [WEATHER[pa]]; ctx.weather = true; }
      else if (/^age:/.test(pv)) lex = verbEntry("avoir");
      else if (exist) lex = verbEntry("avoir");
      else lex = verbEntry("être");
      if (A("subj") === "this" && !/^adj:/.test(pv)) cest = true;   // (c'est une table)
    }
    if (exist) { subj = { toks: ["il"], g: "m", pl: false, person: 2, pron: "3sg.n" }; p = 2; lex = verbEntry("avoir"); }
    if (reflexive(lex)) clitics.refl = REFL[p];
    if (F.voice === "sichlassen" || (F.voice === "passive" && F.modal && false)) { clitics.refl = "se"; F.voice = null; }
    // the chain
    const moodList = type === "SUB" && (MOOD.impf?.has(link) ? "impf" : MOOD.subj?.has(link) ? "subj" : null);
    const subjMood = (type === "SUB" && fr.f?.that?.subj) || ctx.thatSubj ? "subj" : moodList;
    const impf = F.tense === "past" && (ctx.weather || IMPF.has(baseWord(lex).split(" ")[0]) || (type === "SUB" && link === "while") || !!A("freq") || /^every:/.test(A("time") ?? ""));   // (a habit: siempre jugaba, il jouait souvent)
    const ing = type === "SUB" && link === "by-doing";
    const nonfinite = type === "INF" || ing || ctx.inf;
    const Fm = subjMood === "impf" && /perfect/.test(F.tense) ? { ...F, tense: "pluperfect" } : F;
    let vc = chain(subjMood === "impf" ? { ...Fm, mood: null } : Fm, lex, p, { mood: subjMood === "impf" ? "impf" : subjMood === "subj" ? "subj" : null, impf, finite: !nonfinite && type !== "IMP", form: ing ? "ger" : "inf", subjG: sg, subjPl: spl, doG });
    if (subjMood === "subj" && F.tense === "past") vc = chain({ ...F, tense: "perfect" }, lex, p, { mood: "subj", finite: true, subjG: sg, subjPl: spl, doG });   // (bien qu'il ait plu)
    if (F.voice === "seinzu" && all("manner").length) {
      const a = (lx.byConcept.get(`AN|${sp(all("manner")[0])}`) ?? []).find((e) => /^(difficile|facile|impossible|important)$/.test(e.word)) ?? own(all("manner")[0], "AN") ?? { word: wordOf(all("manner")[0], "AN") };
      end.splice(0); afterVerb.splice(0);
      vc = chain({ ...F, voice: null }, verbEntry("être"), p, { finite: true }); pred = [adjForm(a, sg, spl), "à", baseWord(lex)];
    }
    if (type === "IMP") { const ip = A("imp") === "2pl" || A("imp") === "formal" ? 4 : 1; vc = [{ w: vf(lex, "imp", ip), finite: true, imp: true }]; }
    if (exist) vc = vc.map((x) => (x.lex || x.finite ? { ...x, w: x.w } : x));
    const cl = [...(clitics.refl ? [clitics.refl] : []), ...clitics.me, ...clitics.do, ...clitics.io, ...(exist ? ["y"] : [])];
    // (the clitics: before the finite verb, or before the infinitive below a modal; after an affirmative command)
    const words = [];
    const fi = vc.findIndex((x) => x.finite), infI = vc.findIndex((x) => x.inf);
    const clAt = vc[0]?.imp && !neg ? -1 : infI > 0 && F.modal ? infI : 0;
    vc.forEach((x, k) => {
      if (k === clAt) words.push(...cl);
      if (k === fi && neg && !nonfinite) words.unshift("ne");
      const [w0, ...wr] = x.w.split(" ");
      words.push(w0);
      if (x.imp && !neg && cl.length) words[words.length - 1] += cl.map((y) => "-" + ({ me: "moi", te: "toi" })[y] ?? "-" + y).join("").replace(/--/g, "-");
      if (k === fi && neg && !nonfinite && neg[1]) words.push(...neg[1].split(" "));
      if (k === fi) words.push(...mid);
      words.push(...wr);
    });
    if (vc[0]?.imp && neg) { words.splice(0, words.length, "ne", ...cl, vc[0].w, ...neg[1].split(" ")); }
    if (nonfinite && neg) words.unshift("ne", ...neg[1].split(" "));
    const verbPart = [...words, ...afterVerb];
    if (verb === "volať_sa" && (A("pred")?.startsWith("name:") || A("wh") === "how")) {
      const lp = subj?.person ?? 2, v = M.conj("appeler", "pres", lp, { model: "ll" });
      return A("wh") === "how" ? ["comment", REFL[lp], v + "-" + PRON(A("subj"))[0]] : [PRON(A("subj") ?? "1sg")[0], REFL[lp], v, A("pred").slice(5)];
    }
    if (/^age:/.test(A("pred") ?? "")) pred = [wordOf(A("pred").slice(4), "NUM"), "ans"];
    if (/^clock:/.test(A("pred") ?? "")) { subj = { toks: ["il"], person: 2 }; }
    const rest = [...infT, ...objs, ...(exist ? np(A("patient"), ctx).toks : []), ...pred, ...phrases, ...end, ...after];
    const inner = A("clause") && !(ctx.plan.seq ?? []).includes(A("clause")) ? innerClause(A("clause"), fr, ctx) : [];
    let subjT = subj?.toks ?? [];
    if (cest) { subjT = ["ce"]; }
    const alts = (table.link[link] ?? [{ w: link, weight: 1 }]).filter((a) => !(ctx.afterMain && a.w === "comme"));
    const lk = type === "SUB" && link && !ctx.skipLink ? (choose(alts.length ? alts : [{ w: link, weight: 1 }]).w).split(" ").filter(Boolean) : [];
    // the question: a pronoun subject after the finite verb (viens-tu, as-tu lu, a-t-il); a noun subject with est-ce que
    const invertPron = () => {
      const k = words.findIndex((w, j) => j >= words.indexOf("ne") + 1 && !/^(ne|me|te|se|nous|vous|le|la|les|lui|leur|y|en|l')$/.test(w));
      const v = words[k], pr = subjT[0];
      const t = /[ae]$/.test(v) && /^(il|elle|on)$/.test(pr) ? "-t-" : "-";
      return [...words.slice(0, k), v + t + pr, ...words.slice(k + 1), ...afterVerb];
    };
    if (type === "WH") {
      const wh = whWords(A("wh"), c, fr, ctx);
      if (!subj) return [...wh, ...verbPart, ...rest, ...inner];
      if (subj.pron && subj.pron !== "this") return [...front, ...wh, ...invertPron(), ...rest, ...inner];
      return [...front, ...wh, "est-ce", "que", ...subjT, ...verbPart, ...rest, ...inner];
    }
    if (type === "YESNO") return subj?.pron ? [...front, ...invertPron(), ...rest, ...inner] : [...front, "est-ce", "que", ...subjT, ...verbPart, ...rest, ...inner];
    if (type === "IMP") return [...front, ...verbPart, ...rest, ...inner];
    if (type === "INF" || ctx.inf) {
      const parent = !ctx.inf && Object.values(ctx.plan.clauses).find((o) => (o.args.clause ?? []).includes(id));
      const pm = parent ? frameFor(parent).f?.inf?.mark : ctx.infMark;
      const l = link ? say("link", link) : pm && !/^(to|bare)$/.test(pm) ? pm : null;
      return [...(l ? l.split(" ") : []), ...verbPart, ...rest, ...inner];
    }
    if (ing) return ["en", ...verbPart, ...rest];
    if (type === "SUB" && link === "the-more") return ["plus", ...subjT, ...verbPart, ...rest];
    if (type === "MAIN" && link === "the-more-so") return ["plus", ...subjT, ...verbPart, ...pred.filter((x) => x !== "plus"), ...objs, ...phrases];
    if (type === "WHOEVER") return ["celui", "qui", ...verbPart, ...rest, ...inner];
    if (type === "REL") return relBody(c, fr, verbPart, rest, subjT, subjV, ctx);
    if (type === "SUB" && A("wh")) { const wh = whWords(A("wh"), c, fr, ctx); return [...wh, ...subjT, ...verbPart, ...rest, ...inner]; }
    if (A("drop") === "yes" && ctx.dropOK) return [...lk, ...front, ...verbPart, ...rest, ...inner];
    if (ctx.afterQuote) return subj?.pron ? [...lk, ...front, ...invertPron(), ...rest, ...inner] : [...lk, ...front, ...verbPart, ...subjT, ...rest, ...inner];
    return [...lk, ...front, ...subjT, ...verbPart, ...rest, ...inner];
  }
  function whWords(w, c, fr, ctx) {
    if (!w) return [];
    const rw = w.match(/^([\w.]+):(who|what)$/);
    if (rw && ROLES.has(rw[1])) { const mk = markOf(fr, rw[1], null); return [...(/^(direct|io)$/.test(mk) ? (mk === "io" ? ["à"] : []) : [mk.split(" ")[0]]), rw[2] === "who" ? "qui" : "quoi"]; }
    const i = w.indexOf(":");
    if (i > 0) { const q = w.slice(0, i), spec = w.slice(i + 1).replace(/^[AN]\./, ""), o = np(spec.replace(/^[a-z.]+:/, "none:"), { ...ctx, noPartitive: true }); return [...(q === "which" ? [o.g === "f" ? (o.pl ? "quelles" : "quelle") : o.pl ? "quels" : "quel"] : (say("wh", q) ?? q).split(" ")), ...o.toks]; }
    return (say("wh", w) ?? w).split(" ");
  }
  const bareProfession = (v) => { const [head, ...mods] = splitTop(v); return /^indef:/.test(head) && !mods.some((m) => m.startsWith("adj:")) && kindOf(head.slice(6))("professional") ? v.replace(/^indef:/, "none:") : v; };
  function predicate(v, g, pl, ctx) {
    const [head, ...mods] = splitTop(v);
    if (head.startsWith("age:")) return [wordOf(head.slice(4), "NUM"), "ans"];
    if (head.startsWith("clock:")) { const n = wordOf(head.slice(6), "NUM"); return [n, /^(un|une)$/.test(n) ? "heure" : "heures"]; }
    if (head.startsWith("name:")) return [head.slice(5)];
    // (a profession as it is, no article: Il est artiste -- with an adjective it has one: un bon professeur)
    if (!head.startsWith("adj:")) return np(bareProfession(v), { ...ctx, pred: true }).toks;
    const a = entry(head.slice(4), "AN") ?? { word: wordOf(head.slice(4), "AN") };
    const deg = mods.find((m) => m.startsWith("deg:"));
    const target = (f) => { const m = mods.find((x) => call(x)[0] === f); if (!m) return []; const t = call(m)[1]; return table.pron?.[t] ? [PRON(t)[4]] : np(t, ctx).toks; };
    const second = mods.map(call).find(([f]) => f === "but" || f === "and");
    const tail = second ? [...(second[0] === "but" ? [",", "mais"] : ["et"]), adjForm(entry(second[1], "AN") ?? { word: wordOf(second[1], "AN") }, g, pl)] : [];
    const word = adjForm(a, g, pl);
    if (mods.includes("comp.bare")) return ["plus", word];
    if (mods.includes("comp")) return ["plus", word, "que", ...target("than")];
    if (mods.includes("so")) return ["aussi", word, "que", ...target("as")];
    if (mods.includes("sup")) return [g === "f" ? (pl ? "les" : "la") : pl ? "les" : "le", "plus", word];
    return [...(deg ? [wordOf(deg.slice(4), "AV")] : []), word, ...tail];
  }
  const adverbOf = (a) => ADVERB[a.word] ?? (/ant$/.test(a.word) ? a.word.slice(0, -3) + "amment" : /ent$/.test(a.word) ? a.word.slice(0, -3) + "emment" : /[aeiouéi]$/.test(a.word) ? a.word + "ment" : (a.feminine || a.word + "e") + "ment");
  function adverb(v, k, ctx) {
    if (v === "home") return ["à", "la", "maison"];
    if (v.startsWith("adj:")) return adverbOf(entry(v.slice(4), "AN") ?? { word: wordOf(v.slice(4), "AN") }).split(" ");
    const [h, ...a] = v.split(":");
    if (!a.length) { const e = own(v, "AV") ?? own(v, "PAR") ?? own(v, "PHR"); if (e) return e.word.split(" "); const j = own(v, "AN"); return (j ? adverbOf(j) : wordOf(v, "AV")).split(" "); }
    if (table.time?.[h]) {
      const n = (x) => entry(x, "N") ?? { word: wordOf(x, "N"), gender: "m" };
      if (h === "on-day") return /matin|soir|après-midi|nuit/.test(n(a[0]).word) ? ["le", n(a[0]).word] : [n(a[0]).word];
      if (h === "in-period") return /matin|soir|après-midi/.test(n(a[0]).word) ? ["le", n(a[0]).word] : ["en", n(a[0]).word];
      if (h === "at-hour") { const w = wordOf(a[0], "NUM"); return ["à", w, /^(un|une)$/.test(w) ? "heure" : "heures"]; }
      if (h === "date") return ["le", a[0], n(a[1]).word];
      if (h === "last") { const x = n(a[0]); return [vowelStart(x.word) ? "l'" : x.gender === "f" ? "la" : "le", x.word, x.gender === "f" ? "dernière" : "dernier"]; }
      if (h === "next") { const x = n(a[0]); return [vowelStart(x.word) ? "l'" : x.gender === "f" ? "la" : "le", x.word, x.gender === "f" ? "prochaine" : "prochain"]; }
      if (h === "every") return ["chaque", n(a[0]).word];
      const cnt = wordOf(a[0], "NUM"), u = n(a[1]), many = cnt && !/^(un|une)$/.test(cnt), count = many ? [cnt, plural(u)] : [u.gender === "f" ? "une" : "un", u.word];
      if (h === "since") return ["depuis", ...count];
      if (h === "ago") return ["il", "y", "a", ...count];
      return ["dans", ...count];
    }
    if (table.rel?.[h]) return relPhrase(h, a.join(":"), ctx);
    return [sp(v)];
  }
  function relPhrase(r, v, ctx) {
    const h = splitTop(v)[0], prep = pick(table.rel?.[r] ?? [{ w: r }], h);
    if (table.pron?.[h]) return [...prep.split(" "), PRON(h)[4]];
    if (r === "by" && nounKind(h)("vehicle")) return ["en", np(v.replace(/^def:/, "none:"), { ...ctx, bare: true }).toks.join(" ")];
    return placePhrase(prep, v, ctx);
  }
  // a preposition and its noun: en + a feminine country (en Allemagne), au + a masculine one, aux + a plural one;
  // no partitive after a preposition (avec concentration)
  function placePhrase(prep, v, ctx) {
    const n = entry(nounOf(v) ?? "", "N");
    if (/^(à|dans|en)$/.test(prep) && n && kindOf(nounOf(v))("country")) return n.gender === "f" || vowelStart(n.word) ? ["en", n.word] : n.plural === "PL" || /s$/.test(n.word) ? ["aux", plural(n)] : ["au", n.word];
    return [...prep.split(" "), ...np(v, { ...ctx, noPartitive: prep !== "avec", stressed: true }).toks];   // (avec de l'ail; sans sucre; avec lui)
  }
  function innerClause(id, fr, ctx) {
    const c = ctx.plan.clauses[id];
    if (!c) return [];
    if (c.type === "INF") { const mk = fr.f?.inf?.mark; return [...(mk && !/^(to|bare)$/.test(mk) ? [mk] : []), ...clause(id, { ...ctx, inf: true })]; }
    const parent = Object.values(ctx.plan.clauses).find((o) => (o.args.clause ?? []).includes(id));
    if (c.type === "SUB" && c.args.link?.[0] === "that" && parent && parent.args.verb?.[0] === "byť" && (parent.args.fixed || parent.args.pred)) return ["que", ...clause(id, { ...ctx, thatSubj: true, skipLink: true })];
    const pSubj = parent && (fr.f?.subjRole ? parent.args[fr.f.subjRole]?.[0] : parent.args.subj?.[0]);
    if (c.type === "SUB" && fr.f?.that && pSubj && c.args.subj?.[0] === pSubj) {   // (the same subject: an infinitive -- désolé de ne pas être venu)
      const cc = { ...c, type: "INF", args: { ...c.args, link: [] } };
      ctx.plan.clauses[id] = cc;
      try { return [...(fr.f.that.prep ? [fr.f.that.prep] : []), ...clause(id, { ...ctx, inf: true })]; } finally { ctx.plan.clauses[id] = c; }
    }
    if (c.type === "SUB" && fr.f?.that) return [...(fr.f.that.prep ? [fr.f.that.prep] : []), ...clause(id, { ...ctx, thatSubj: fr.f.that.subj })];
    if (c.type === "REP") return ["que", ...clause(id, ctx)];
    return clause(id, ctx);
  }
  function relClause(id, head, ctx) { return ctx.plan?.clauses[id] ? clause(id, { ...ctx, head }) : []; }
  function relBody(c, fr, verbPart, rest, subjT, subjV, ctx) {
    const role = c.args.relrole?.[0] ?? "subj", head = ctx.head ?? {};
    if (role === "subj") return ["qui", ...verbPart, ...rest];
    if (role === "owner") { const o = np((subjV ?? "").replace(/^none:/, "def:"), ctx); return ["dont", ...o.toks, ...verbPart, ...rest]; }
    if (role === "where") return ["où", ...subjT, ...verbPart, ...rest];
    if (role === "what") return ["ce", "que", ...subjT, ...verbPart, ...rest];
    const mk = ROLES.has(role) ? markOf(fr, role, null) : "direct";
    if (mk === "direct") return ["que", ...subjT, ...verbPart, ...rest];
    const person = head.noun ? nounKind("x:" + head.noun)("person") : false;
    const prep = mk === "io" ? "à" : mk;
    return [...prep.split(" "), person ? "qui" : head.g === "f" ? (head.pl ? "lesquelles" : "laquelle") : head.pl ? "lesquels" : "lequel", ...subjT, ...verbPart, ...rest];
  }

  // ---- THE SENTENCE ------------------------------------------------------------------------------------------------------
  const KEEPCOMMA = new Set(["although", "without", "instead"]);
  function realize(plan) {
    plan = lx.agree(plan);   // (elles, ellas: a 3pl pronoun as what it stands for)
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
      else if (/^[,.?!:–]$/.test(t)) { toks.push(t); if (/[.?!]/.test(t)) afterClause = false; }
      else if (table.coord?.[t]) { toks.push(say("coord", t)); afterClause = false; }
      else { const e = own(t, "INT") ?? own(t, "PHR") ?? own(t, "PAR") ?? own(t, "AV"), j = own(t, "AN"); toks.push(e ? e.word : j ? ADVERB[j.word] ?? j.word : wordOf(t, "INT")); }
    }
    return assemble(toks);
  }
  // elision (je -> j', le -> l', de -> d', que -> qu', ne -> n', si il -> s'il), contraction (au, aux, du, des), French
  // spacing (a space before ? ! : ; and inside « »)
  function assemble(toks) {
    let words = toks.filter((t) => t != null && t !== "").flatMap((t) => (/^[«»]$/.test(t) ? [t] : t.split(" "))).filter(Boolean);
    const out = [];
    for (let k = 0; k < words.length; k++) {
      let w = words[k];
      const next = words[k + 1] ?? "";
      if (w === "à" && next === "le") { out.push("au"); k++; continue; }
      if (w === "à" && next === "les") { out.push("aux"); k++; continue; }
      if (w === "de" && next === "le") { out.push("du"); k++; continue; }
      if (w === "de" && next === "les") { out.push("des"); k++; continue; }
      if (w === "si" && /^(il|ils)$/.test(next)) { out.push("s'" + next); k++; continue; }
      if (w === "de" && /^(du|des)$/.test(next)) { words.splice(k + 1, 1); k--; continue; }
      if (w === "de" && next === "de" && /^(la|l')$/.test(words[k + 2] ?? "")) { words.splice(k + 1, 2); k--; continue; }
      if (/^(je|me|te|se|le|la|de|ne|que|ce|lorsque|puisque|jusque)$/.test(w) && next && vowelStart(next) && !/^[,.?!:;]/.test(next)) { out.push(w.slice(0, -1) + "'" + next); k++; continue; }
      if (w === "ce" && /^(est|était|sera)$/.test(next)) { out.push("c'" + next); k++; continue; }
      out.push(w);
    }
    let text = "", start = true;
    for (const w of out) {
      const glue = /^[,.]$/.test(w) || !text || /'$/.test(text);
      text += (/^[?!:;»]$/.test(w) ? " " : glue ? "" : " ") + (start && /^\p{L}/u.test(w) ? cap(w) : w);
      if (/\p{L}/u.test(w)) start = false;
      if (/^[.?!]$/.test(w) || w === "«") start = true;
      if (w === "»") start = false;
    }
    text = text.replace(/,,/g, ",").replace(/ ,/g, ",").replace(/' /g, "'");
    return { text: cap(text), tokens: out.map((w) => ({ w, ipa: lx.ipaOf(w) })) };
  }
  return { realize, word: entry, use: lx.use };
}

export const load = loadFrench;   // (the name every realizer has: sentences.html ?lang=)
