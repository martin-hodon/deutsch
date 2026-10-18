// CHINESE SAYS A CLAUSE PLAN (world/CLAUSES.md) in standard Mandarin (simplified characters): the words, closed words and
// frames of engine/lexicon.js (zh/dict.tsv, zh/rules/{neutral,roles,frames,prefer}.txt), the measure words and particles
// of zh/morph.js. No inflection: the grammar here is ORDER and PARTICLES -- the noun phrase (这本书: demonstrative +
// measure word + noun; 漂亮的房子: a two-syllable adjective takes 的; 我的书: the possessive 的), the clause (subject, the
// time words, the adverbs and coverb phrases BEFORE the verb -- 在家, 跟朋友, 给他, 从北京 --, the verb with its aspect 了
// for a completed event, 过 for experience, 会 for the future, 不 / 没 before it, the objects and 到-phrases after it),
// the question (吗 at the end; the question word in the place of what it asks for), the links (因为 ... 所以 ...; ...的时候,
// ...以后 at the END of their clause), the relative clause before its noun (我买的书), the predicate adjective with 很.
//
//   const zh = await loadChinese("", { meaning, vary })
//   zh.realize(plan) -> { text, tokens }      (tokens: the words, joined without spaces in the text)

import { splitTop, call } from "../engine/realize.js";
import { loadLexicon, ROLES, DIRECTED } from "../engine/lexicon.js";
import { planTense } from "../engine/tense.js";
import { loadMorphology } from "./morph.js";

const PUNCT = { ".": "。", "?": "？", "!": "！", ",": "，", ":": "：", "–": "——", "„": "“", "“": "”" };
const isCJK = (s) => /^[一-鿿]+$/.test(s);
const syllables = (w) => [...w].filter((ch) => /[一-鿿]/.test(ch)).length;
const BARE_ADJ = new Set(["大", "小", "好", "新", "旧", "老", "坏", "红", "白", "黑", "长", "短", "高", "多", "少", "热", "冷", "美", "真", "假", "重", "轻", "快", "慢", "远", "近", "深", "浅"]);

export async function loadChinese(base, { meaning = null, vary = null } = {}) {
  const M = await loadMorphology(base + "zh/rules/classifiers.txt");
  const lx = await loadLexicon(base, "zh", { meaning, vary, verbEntry: (w) => verbEntry(w) });
  const { entry, wordOf, own, sp, byWord, table, say, LIST, choose, nounKind, pick, markOf, nounOf, kindOf } = lx;
  let ctxPlan = null;
  const frameFor = (c) => lx.frameFor(c, ctxPlan);
  const verbEntry = (w) => byWord.get("V|" + w) ?? byWord.get(w) ?? { word: w, parts: w };
  const PAST = LIST("past"), FUTURE = LIST("future"), STATE = LIST("state"), VERBADJ = LIST("verbadj"), RAINV = LIST("rain"), FRONT = LIST("front"), PERCEIVE = LIST("perceive");
  // (does any frame of the verb concept put its location after the verb: 住在, 留在)
  const locPost = (verb) => [...(lx.framesOf.get(verb) ?? [])].some((f) => /^post/.test(f.roles.get("location") ?? ""));
  const NUM = Object.fromEntries([...LIST("num")].map((x) => x.split(":")));
  const UNIT_CL = Object.fromEntries([...LIST("unit-cl")].map((x) => x.split(":")));
  const DIGITS = [...LIST("digits")];

  // ---- NUMBERS: 1 一, 2 两 (before a measure word), 11 十一, 20 二十, 35 三十五, 100 一百 ----------------------------------------
  function number(cid, { before = true } = {}) {
    const n = Number(NUM[sp(cid)] ?? NaN);
    if (isNaN(n)) return wordOf(cid, "NUM");
    if (n === 2 && before) return "两";
    if (n < 10) return DIGITS[n];
    if (n === 10) return "十";
    if (n < 20) return "十" + DIGITS[n - 10];
    if (n < 100) return DIGITS[Math.floor(n / 10)] + "十" + (n % 10 ? DIGITS[n % 10] : "");
    if (n === 100) return "一百";
    return String(n);
  }
  const PRON = (code) => (table.pron?.[code]?.[0]?.w ?? "").split("/");
  const personOf = (code) => Number(PRON(code)[2] ?? 2);

  // ---- A NOUN PHRASE -> { toks, pl, person, pron, noun, det } -------------------------------------------------------------
  // (a person noun with a definite or pronoun-like reading in the plural takes 们: 孩子们, 老师们; a thing never)
  const isPerson = (cid) => kindOf(cid)("person");
  const CL = (ne) => (ne ? M.classifier(ne) : "个");
  function np(v, ctx = {}) {
    if (v == null) return { toks: [], pl: false, person: 2 };
    const [head, ...mods] = splitTop(v);
    const tp = head.match(/^(it|them):(.+)$/);
    if (tp) return { toks: [tp[1] === "them" ? "它们" : "它"], pl: tp[1] === "them", person: 2, pron: v, thing: true };
    if (head === "one") return { toks: ctx.subj ? [] : ["人"], pl: true, person: 5, pron: head };   // (man: no subject -- 这里说德语)
    if (table.pron?.[head]) return { toks: [PRON(head)[0]], pl: /pl/.test(head), person: personOf(head), pron: head };
    if (head.startsWith("name:")) return { toks: [head.slice(5)], pl: false, person: 2, name: true };
    const i = head.indexOf(":"), d = i < 0 ? "none" : head.slice(0, i), n = i < 0 ? head : head.slice(i + 1);
    if (n.startsWith("@")) return { toks: [verbEntry(wordOf(n.slice(1), "V")).word], pl: false, person: 2 };
    const ne = entry(n.replace(/^~/, "").split("/")[0], "N");
    const plDet = ["all", "both", "many", "several", "few", "some"].includes(d);
    const pl = mods.includes("pl") || plDet || (d.startsWith("num.") && Number(NUM[sp(d.slice(4))] ?? 2) !== 1);
    let noun = ne?.word ?? sp(n);
    const pre = [], post = [];
    // the adjectives: one syllable straight before the noun, longer ones with 的; a degree word before the adjective
    const deg = mods.find((m) => m.startsWith("deg:")), sup = mods.includes("sup"), comp = mods.includes("comp");
    const adjs = mods.filter((m) => m.startsWith("adj:")).map((m) => entry(m.slice(4), "AN") ?? { word: sp(m.slice(4)) });
    // (of different kinds: in Chinese's order -- those with 的 first, then the bare ones next to the noun: a kind of thing,
    //  德国汽车 -- rules/adjectives.txt BARE --, and the one-syllable ones)
    const ao = lx.adjOrder, plain = !deg && !sup && !comp, bareOf = (a) => plain && (ao.bare(a) || BARE_ADJ.has(a.word));
    const cumulative = plain && ao.cumulative(adjs), ordered = cumulative ? ao.before(adjs) : adjs;
    (cumulative ? [...ordered.filter((a) => !bareOf(a)), ...ordered.filter(bareOf)] : ordered).forEach((a, k) => {
      const degW = k === 0 && deg ? wordOf(deg.slice(4), "AV") : k === 0 && sup ? "最" : k === 0 && comp ? "更" : null;
      const w = a.word, bare = (BARE_ADJ.has(w) || (plain && ao.bare(a))) && !degW;
      pre.push(...(degW ? [degW] : []), ...(bare ? [w.replace(/(.)的$/, "$1")] : [/的$/.test(w) ? w : w + "的"]));   // (德国的 -> 德国汽车: bare)
    });
    for (const m of mods) {
      const [fn, a] = call(m);
      if (fn === "of") { const o = np(a.replace(/^(def|indef):/, "none:"), ctx); return { toks: [...(M.CLASSIFIERS.includes(noun) ? ["一"] : []), noun, ...o.toks], pl: false, person: 2, noun: o.noun }; }   // (一块黄油, 少许盐: a measure noun before its stuff)
      if (fn === "owner" || fn === "owner.von") pre.unshift(...np(a.replace(/^(def|indef):/, "none:"), ctx).toks, "的");
      else if (fn === "rel") pre.unshift(...relClause(a, { noun: n, pl }, { ...ctx, rel: true }), "的");
      else if (fn === "part") {   // (a participle: the verb's clause before the noun -- 哭的孩子, 买的书)
        const [k, verb, ...ext] = splitTop(a, ",");
        const ve = verbEntry(wordOf(verb, "V")), by = ext.find((x) => call(x)[0] === "by");
        if (k === "II" && by) pre.unshift(...np(call(by)[1], ctx).toks, ve.word, "的");
        else if (k === "II") pre.unshift(ve.word, "的");
        else if (k === "zuI") pre.unshift("要", ve.word, "的");
        else pre.unshift(ve.word + "着", "的");   // (笑着的孩子)
      }
    }
    if (mods.includes("one")) pre.unshift("一", CL(ne));
    // the determiner
    const dt = [];
    const withCL = (w) => (w.endsWith("+CL") ? [w.slice(0, -3), CL(ne)] : w ? w.split(" ") : []);
    if (d === "indef") dt.push(...(ctx.subj ? [] : ["一", CL(ne)]));
    else if (d === "def" || d === "none") {
      if (pl && isPerson(n) && d === "def" && !ne?.word.endsWith("们")) noun += "们";
    }
    else if (d === "no") dt.push("没有");   // (said by the clause's negation too)
    else if (d.startsWith("poss.")) dt.push(kindOf(n)("relative") && !adjs.length && !pre.length ? PRON(d.slice(5))[0] : PRON(d.slice(5))[1]);   // (我爸爸: no 的 before kin)
    else if (d.startsWith("num.")) dt.push(number(d.slice(4)), ...(M.CLASSIFIERS.includes(noun) ? [] : [CL(ne)]));   // (一口, 两个人)
    else if (d.startsWith("name.")) dt.push(d.slice(5), "的");
    else if (table.det?.[d]) dt.push(...withCL(table.det[d][0].w));
    if (sup && !dt.length) dt.push();
    const toks = [...dt, ...pre, noun, ...post].filter(Boolean);
    const pairs = mods.filter((m) => call(m)[0] === "pair").map((m) => splitTop(call(m)[1], ","));
    if (pairs.length) {
      const kind = pairs[0][0], others = pairs.map(([, o]) => np(o, ctx).toks);
      const J = { and: ["", "和"], or: ["", ctx.question ? "还是" : "或者"], "both-and": ["", "和"], "neither-nor": ["", "和"], "not-but": ["不是", "，而是"], "not-only-but-also": ["不但", "，而且"], "either-or": ["", "或者"] }[kind] ?? ["", kind];
      const list = [toks, ...others];
      const out = [...(J[0] ? [J[0]] : []), ...list.slice(0, -1).flatMap((x, k) => [...x, ...(k < list.length - 2 ? ["、"] : [])]), ...J[1].split(" ").filter(Boolean), ...list[list.length - 1]];
      return { toks: out, pl: true, person: 5, pairKind: kind };
    }
    return { toks, pl, person: pl ? 5 : 2, noun: ne, det: d, every: d === "every" || d === "all" };
  }

  // ---- THE VERB AND ITS ASPECT ------------------------------------------------------------------------------------------
  const MODAL = { "môcť": "能", "musieť": "必须", "smieť": "可以", "mať (povinnosť)": "应该", "chcieť": "想", "mať rád": "喜欢" };
  const verbWord = (v) => v.word;
  // a verb's parts for 了: a separable compound (睡|觉) takes it between its parts
  const withLe = (v, part) => { const [a, b] = (v.parts ?? v.word).split("|"); return b ? [a + part + b] : [v.word + part]; };

  // ---- A CLAUSE ---------------------------------------------------------------------------------------------------------
  const tenseOf = (id, plan) => planTense(id, plan, { timeWord: (t) => wordOf(t, "AV"), isPast: (w) => PAST.has(w), isFuture: (w) => FUTURE.has(w), isNearly: (v) => /^差点/.test(wordOf(v, "AV")), clauses: false });
  function clause(id, ctx) {
    const c = ctx.plan.clauses[id];
    if (!c) return [];
    const type = c.type, A = (k) => c.args[k]?.[0], all = (k) => c.args[k] ?? [];
    const link = A("link");
    if (!A("verb")) return type === "FRAG" ? [...np(A("np"), ctx).toks, ...all("pp").flatMap((x) => relPhrase(x.slice(0, x.indexOf(":")), x.slice(x.indexOf(":") + 1), ctx).toks)] : [];
    const fr = frameFor(c);
    let lex = fr.v;
    const { F } = tenseOf(id, ctx.plan);
    const verb = sp(F.verb), exist = verb === "dať" && A("subj") === "3sg.n" && A("patient") && !A("fixed");
    const subjV = fr.f?.subjRole ? A(fr.f.subjRole) : A("subj");
    let subj = exist ? null : subjV ? np(subjV, { ...ctx, subj: true }) : null;
    // the roles: direct objects after the verb, coverb phrases before it, 到-phrases after it
    const objs = [], before = [], after = [], ios = [], nothingT = [];
    let neitherObj = false, defObj = false;
    for (const r of fr.f?.absorb.keys() ?? []) if (/^no:/.test(A(r) ?? "")) c.args.neg = ["yes"];
    let neg = A("neg") ? (say("neg", A("neg")) ?? "不") : null;
    for (const [k, vs] of Object.entries(c.args)) for (let v of vs) {
      if (!ROLES.has(k) || (exist && k === "patient") || k === fr.f?.subjRole || fr.f?.absorb.has(k) || (v === "it" && A("clause"))) continue;
      const wr = v.match(/^([a-z-]+):(.*)$/);
      if (wr && table.rel?.[wr[1]] && !table.det?.[wr[1]] && !table.pron?.[wr[1]] && !/^(it|them)$/.test(wr[1])) { const p = relPhrase(wr[1], wr[2], ctx); (p.post ? after : before).push(...p.toks); continue; }
      const mk = markOf(fr, k, v), code = splitTop(v)[0];
      if (/^(nothing|noone)$/.test(code)) { nothingT.push(code === "nothing" ? "什么都" : "谁都"); neg ??= "不"; continue; }
      if (/^no:/.test(code)) { neg ??= "不"; v = v.replace(/^no:/, "none:"); }
      const o = np(v, { ...ctx, question: type === "YESNO", object: mk === "direct" && k !== "recipient" });
      if (mk === "direct") { (k === "recipient" ? ios : objs).push(...o.toks); if (k === "patient" && o.pairKind === "neither-nor") neitherObj = true; if (k === "patient" && /^def:/.test(v)) defObj = true; continue; }
      const m = mk.match(/^(pre|post)\s+(.+)$/), place = m ? m[1] : "pre", phr = m ? m[2] : mk;
      const toks = phr.includes("…") ? phr.split("…").flatMap((x, i) => (i ? [...o.toks, ...(x ? [x] : [])] : x ? [x] : [])) : [phr, ...o.toks];
      (place === "post" ? after : before).push(...toks);
    }
    if (ctx.dropSubj && objs.length === 1 && objs[0] === "它") objs.length = 0;   // (尝了尝: the thing said once)
    for (const x of all("pp")) { const i = x.indexOf(":"), r = x.slice(0, i); if (x.slice(i + 1) === "it" && A("clause")) continue; const p = relPhrase(r, x.slice(i + 1), ctx); (p.post ? after : before).push(...p.toks); }
    for (const v of all("by")) before.push("被", ...np(v, ctx).toks);
    const front = [], mid = [], end = [];
    if (neitherObj) { neg = neg ?? "不"; mid.push(...objs, "都"); objs.length = 0; }   // (咖啡和茶都不喝)
    for (const v of all("role")) front.push("作为", ...np(v.replace(/^[a-z.]+:/, "none:"), ctx).toks, "，");
    for (const k of ["because-of", "despite", "during", "instead-of"]) for (const v of all(k)) front.push(...say("rel", k).split(" "), ...np(v, ctx).toks, ...(k === "during" ? ["期间"] : []));
    // the adverbs: time words first or after the subject (今天我... / 我今天...: after a pronoun subject), frequency and
    // manner before the verb, a few at the end (how often)
    for (const k of ["sentence", "conn", "time", "place", "freq", "manner"]) for (const v of all(k)) {
      const t = adverb(v, k, ctx);
      if (!t.length) continue;
      if (k === "sentence" || k === "conn") { front.push(...t); continue; }
      if (k === "time") { (subj && !FRONT.has(t.join("")) ? mid : front).push(...t, ...(FRONT.has(t.join("")) && subj && !subj.pron ? ["，"] : [])); continue; }
      if (k === "place") { (locPost(verb) ? after : subj ? before : front).unshift(...t); continue; }
      if (k === "manner" && v === "rád") { mid.push("喜欢"); continue; }
      mid.push(...t);
    }
    // the aspect and the negation: a completed event takes 了 (not a state verb, not under a negation or a modal); a past
    // negation is 没; the future takes 会 when nothing else says the time
    const past = /^(past|perfect|pluperfect)$/.test(F.tense), future = /^future/.test(F.tense), hypo = F.mood === "hypo";
    const stateV = STATE.has(lex.word) || A("pred") || verb === "byť" || verb === "mať (vlastniť)" || !!A("clause") || ctx.rel || ctx.noLe || (type === "SUB" && /^(when|when-past|while)$/.test(link ?? "")) || ctx.beforeQuote;
    let modal = F.modal ? (MODAL[sp(F.modal)] ?? wordOf(F.modal, "V")) : null;
    if (hypo && verb === "mať rád" && !modal) { lex = { word: "想要", parts: "想要" }; }   // (I would like: 想要)
    if (lex.word === "有" || verb === "mať (vlastniť)" && !fr.f?.absorb.size) { if (neg) neg = "没"; }
    const habit = !!A("freq") || /^every:/.test(A("time") ?? "");
    let vtoks;
    const infV = A("inf") ? [verbEntry(wordOf(A("inf"), "V")).word] : [];
    if (verb === "byť" && !A("pred") && !A("fixed") && (A("location") || all("place").length)) vtoks = [];   // (客人们在那里: the place phrase is the predicate)
    else if (verb === "byť" && A("pred")) vtoks = predicate(A("pred"), { ...ctx, neg, past, subj, inWhen: ctx.inWhen || (type === "SUB" && /^(when|when-past|while)$/.test(link ?? "")) });
    else if (verb === "byť" && A("fixed") && !fr.f?.fixed) { vtoks = [...(neg ? [neg] : []), "很", wordOf(A("fixed"), "AN")]; if (A("clause")) { subj = { toks: innerClause(A("clause"), fr, { ...ctx, noLe: true, inWhen: true }), person: 2 }; c.args = { ...c.args, clause: [] }; } }
    else if (exist) { vtoks = [neg ? "没有" : "有", ...np(A("patient"), ctx).toks]; neg = null; }
    else if (verb === "mať (vlastniť)" && !fr.f?.absorb.size) { vtoks = [neg ? "没有" : "有"]; neg = null; }
    else {
      const le = past && !stateV && !neg && !modal && !habit && type !== "IMP" && !F.raise && !hypo;
      vtoks = le && !infV.length ? withLe(lex, "了") : [lex.word];
      if (le && infV.length) end.push("了");   // (去睡觉了: the 了 after the whole)
      if (verb === "nechať" && infV.length && lex.word === "让" && !(A("patient") && nounKind(A("patient"))("person"))) vtoks.push("人");   // (让人修: have it repaired)
      if (neg) neg = past && !stateV && !modal ? "没" : neg;
    }
    if (F.voice === "state") vtoks = [lex.word + "着"];   // (门开着)
    else if (F.voice === "passive" && !modal) {
      const by = all("by"), bi = before.indexOf("被");
      if (by.length && past) { if (bi >= 0) before.splice(bi, 1 + np(by[0], ctx).toks.length); vtoks = ["是", ...np(by[0], ctx).toks, lex.word, "的"]; }   // (房子是我爷爷盖的)
      else if (!by.length) vtoks = [lex.word + (past ? "了" : "")];
    }
    if (subj?.pron === "3sg.n" && RAINV.has(lex.word)) subj = { toks: [], person: 2 };   // (下雨了: no 它)
    const chain = [...(neg ? [neg] : []), ...(modal ? [modal] : future && !modal && !hypo && !subj?.every && !A("time") ? ["会"] : []), ...(hypo && !modal && type === "MAIN" && ctx.thenWord ? ["会"] : []), ...(F.raise ? [wordOf(F.raise, "V")] : [])];
    if (neg && modal) { chain.splice(0, chain.length, neg === "没" ? "不" : neg, modal === "必须" ? "用" : modal); }   // (不用: need not)
    const exp = all("manner").includes("rád") && false;
    // (the verb itself as a coverb -- 去 ... 去工作 -- said once; 把 + the object before the verb when a place follows it or a
    //  definite object is given to someone; the 了 of a completed event moves onto the coverb: 放到了桌子上)
    if (after.length && vtoks[0] && after[0] === vtoks[0].replace(/了$/, "")) after.shift();
    if (objs.length && ((after.length && /^(到|在|给)/.test(after[0])) || (ios.length && defObj)) && !objs.some((x) => /^(什么|谁)/.test(x))) { before.push("把", ...objs); objs.length = 0; }
    if (after.length && /^(到|在)/.test(after[0]) && vtoks[0]?.endsWith("了") && !infV.length) { vtoks[0] = vtoks[0].slice(0, -1); after[0] = after[0][0] + "了" + after[0].slice(1); }
    if (infV.length && (objs.length || ios.length) && PERCEIVE.has(lex.word)) { infV.unshift(...ios.splice(0), ...objs.splice(0)); }   // (听见她唱歌: the one heard before what she does)
    const core = [...chain, ...before, ...vtoks, ...infV, ...ios, ...objs, ...after, ...end];
    const inner = A("clause") && !(ctx.plan.seq ?? []).includes(A("clause")) ? innerClause(A("clause"), fr, ctx) : [];
    if (ctx.dropSubj && subj?.pron && subj.pron === ctx.dropSubj) subj = { ...subj, toks: [] };   // (the same pronoun subject as the clause before: said once)
    if (verb === "volať sa" && (A("pred")?.startsWith("name:") || A("wh") === "how")) {
      return A("wh") === "how" ? [...(subj?.toks ?? ["你"]), "叫", "什么", "名字"] : [...(subj?.toks ?? []), "叫", A("pred").slice(5)];
    }
    let subjT = subj?.toks ?? [];
    if (/^clock:/.test(A("pred") ?? "")) subjT = ["现在"];
    if (nothingT.length) mid.push(...nothingT);
    if (subj?.every) mid.unshift("都");
    const lk = type === "SUB" && link && !ctx.skipLink ? (table.link[link]?.[0]?.w ?? link) : "";
    const [lkHead, lkTail] = lk.startsWith("<") ? ["", lk.slice(1)] : [lk.split(" >")[0], ""];
    const body = [...front, ...subjT, ...mid, ...core, ...inner];
    if (type === "WH") return whClause(A("wh"), c, fr, { front, subjT, mid, chain, before, vtoks, objs, after, inner, ios, infV }, ctx);
    if (type === "YESNO") return body.includes("还是") ? body : [...body, "吗"];
    if (type === "IMP") return [...front, ...(neg ? ["别"] : []), ...mid, ...before, ...vtoks.map((w) => w.replace(/了$/, "")), ...infV, ...objs, ...after];
    if (type === "INF" || ctx.inf) return [...(link ? [say("link", link)] : []), ...mid, ...chain, ...before, ...vtoks, ...objs, ...after, ...inner].filter(Boolean);
    if (type === "REL") return [...subjT, ...mid, ...chain, ...before, ...vtoks, ...objs, ...after];
    if (type === "SUB" && A("wh")) return [...subjT, ...whInSitu(A("wh"), c, fr, ctx, { mid, core })];
    if (type === "SUB") return [...(lkHead ? [lkHead] : []), ...body, ...(lkTail ? [lkTail] : [])];
    if (type === "WHOEVER") return ["谁", ...mid, ...core];
    if (type === "MAIN" && A("subj") === "that-one" && ctx.afterWhoever) return ["谁", "就", ...mid, ...core, ...inner];
    // (a main clause after 因为 / 虽然 / 如果 ... begins with 所以 / 但是 / 就)
    const then = ctx.thenWord ? [ctx.thenWord] : [];
    if (then.length && then[0] === "就") return [...front, ...subjT, "就", ...mid, ...core, ...inner];
    return [...then, ...body];
  }
  // a question with a question word: in the place of what it asks for
  function whClause(w, c, fr, P, ctx) {
    const { front, subjT, mid, chain, before, vtoks, objs, after, inner, ios, infV } = P;
    const core = [...chain, ...before, ...vtoks, ...infV, ...ios, ...objs, ...after];
    const rw = w.match(/^([\w.]+):(who|what)$/);
    if (rw && ROLES.has(rw[1])) { const mk = markOf(fr, rw[1], null), q = rw[2] === "who" ? "谁" : "什么"; return mk === "direct" ? [...subjT, ...mid, ...core, q] : [...subjT, ...mid, ...chain, mk.replace(/^(pre|post)\s+/, "").split("…")[0], q, ...before, ...vtoks, ...objs]; }
    const i = w.indexOf(":");
    if (i > 0) {   // (which:NP, what-kind:NP, how-many:NP: the phrase in the place of the object)
      const q = w.slice(0, i), spec = w.slice(i + 1).replace(/^[AN]\./, ""), o = np(spec.replace(/^[a-z.]+:/, "none:"), ctx);
      const qw = (say("wh", q) ?? q).replace("+CL", CL(o.noun));
      const phrase = q === "how-many" ? ["多少", ...o.toks] : [qw, ...o.toks];
      return c.args.subj ? [...subjT, ...mid, ...chain, ...before, ...vtoks, ...phrase, ...after] : [...phrase, ...mid, ...core];
    }
    const qw = say("wh", w) ?? w;
    if (w === "who") return c.args.subj ? [...subjT, ...mid, ...core.filter((x) => x !== "谁"), "谁"] : ["谁", ...mid, ...core];
    if (w === "whom") return [...subjT, ...mid, ...core, "谁"];
    if (w === "what") return [...subjT, ...mid, ...core, "什么"];
    if (w === "where") return locPost(sp(c.args.verb?.[0] ?? "")) ? [...subjT, ...mid, ...core, "在", "哪里"] : [...subjT, ...mid, "在", "哪里", ...core.filter((x) => x !== "在")];
    if (w === "whither") return [...subjT, ...mid, ...core, "哪里"];
    if (w === "how-late") return ["现在", "几点"];
    if (w === "how-old") return [...subjT, "多大"];
    if (w === "how-often") return [...subjT, ...mid, "多久", ...core, "一次"];
    return [...subjT, ...mid, qw, ...core, ...inner];
  }
  const whInSitu = (w, c, fr, ctx, { mid, core }) => {
    const q = (say("wh", w) ?? w).split(" ");
    if (w === "where") return locPost(sp(c.args.verb?.[0] ?? "")) ? [...mid, ...core, "在", "哪里"] : [...mid, "在", ...q, ...core];
    if (w === "whither" || w === "what" || w === "whom") return [...mid, ...core, ...q];
    return [...mid, ...q, ...core];
  };
  // the predicate: 很 + adjective (not under a negation or a degree), 是 + noun, 叫 + name, age, the clock
  function predicate(v, { neg, past, subj, inWhen = false } = {}) {
    const [head, ...mods] = splitTop(v);
    if (head.startsWith("age:")) return [...(neg ? ["不是"] : []), number(head.slice(4), { before: false }), "岁"];
    if (head.startsWith("clock:")) return [number(head.slice(6), { before: false }), "点"];
    if (head.startsWith("name:")) return ["叫", head.slice(5)];
    if (!head.startsWith("adj:")) return [neg ? "不是" : "是", ...np(v, {}).toks];
    const a = entry(head.slice(4), "AN") ?? { word: wordOf(head.slice(4), "AN") };
    const deg = mods.find((m) => m.startsWith("deg:"));
    const target = (f) => { const m = mods.find((x) => call(x)[0] === f); if (!m) return []; const t = call(m)[1]; return table.pron?.[t] ? [PRON(t)[0]] : np(t, {}).toks; };
    const second = mods.map(call).find(([f]) => f === "but" || f === "and");
    const tail = second ? [second[0] === "but" ? "但是" : "也", "很", wordOf(second[1], "AN")] : [];
    if (mods.includes("comp.bare")) return [...(neg ? ["不"] : []), "更", a.word];
    if (mods.includes("comp")) return ["比", ...target("than"), a.word];
    if (mods.includes("so")) return ["和", ...target("as"), "一样", a.word];
    if (mods.includes("sup")) return ["最", a.word];
    const aw = a.word.replace(/的$/, "");
    if (VERBADJ.has(aw) || /好$/.test(aw)) return [...(neg ? [neg === "不" && past ? "没" : neg] : []), aw, ...(neg ? [] : ["了"])];   // (病了, 准备好了: a verb, not an adjective)
    if (neg) return [neg, a.word, ...tail];
    return [...(deg ? [wordOf(deg.slice(4), "AV")] : inWhen ? [] : ["很"]), a.word, ...tail];
  }
  // an adverb: a time or frequency word, an adjective as adverb (adj + 地 for two syllables), a time phrase
  function adverb(v, k, ctx) {
    if (v === "home") return ["在家"];
    if (v.startsWith("adj:")) { const a = entry(v.slice(4), "AN") ?? { word: wordOf(v.slice(4), "AN") }; return [syllables(a.word) === 1 ? a.word + a.word + "地" : a.word + "地"]; }
    const [h, ...a] = v.split(":");
    if (!a.length) { const e = own(v, "AV") ?? own(v, "PAR") ?? own(v, "PHR"); if (e) return [e.word]; const j = own(v, "AN"); return [j ? (syllables(j.word) === 1 ? j.word + j.word + "地" : j.word + "地") : wordOf(v, "AV")]; }
    if (table.time?.[h]) {
      const n = (x) => entry(x, "N")?.word ?? wordOf(x, "N");
      if (h === "on-day" || h === "in-period") return [n(a[0])];
      if (h === "at-hour") return [number(a[0], { before: false }) + "点"];
      if (h === "date") return [n(a[1]), a[0] + "日"];
      const unitOf = (u) => { const w = n(u); return UNIT_CL[w] === undefined ? "个" : UNIT_CL[w]; };
      if (h === "last") { const w = n(a[0]); return [w === "年" ? "去年" : w === "天" ? "昨天" : "上" + unitOf(a[0]) + w]; }
      if (h === "next") { const w = n(a[0]); return [w === "年" ? "明年" : w === "天" ? "明天" : "下" + unitOf(a[0]) + w]; }
      if (h === "every") return ["每" + unitOf(a[0]) + n(a[0])];
      const cnt = number(a[0]), u = n(a[1]), count = cnt + unitOf(a[1]) + u;
      if (h === "since") return ["已经", count];
      if (h === "ago") return [count + "以前"];
      return [count + "以后"];
    }
    if (table.rel?.[h]) return relPhrase(h, a.join(":"), ctx).toks;
    return [sp(v)];
  }
  // a relation phrase: the coverb (在 从 跟 给 ...) with its noun, a circumposition with … (在…里), pre- or postverbal
  function relPhrase(r, v, ctx) {
    const h = splitTop(v)[0], raw = pick(table.rel?.[r] ?? [{ w: r }], h);
    const m = raw.match(/^(pre|post)\s+(.+)$/), post = m ? m[1] === "post" : /^(到|去)/.test(raw) && r !== "from";
    const phr = m ? m[2] : raw, o = np(v.replace(/^def:/, "none:"), ctx);
    if (!phr) return { toks: o.toks, post: false };
    const toks = phr.includes("…") ? phr.split("…").flatMap((x, i) => (i ? [...o.toks, ...(x ? [x] : [])] : x ? [x] : [])) : [phr, ...o.toks];
    return { toks, post };
  }
  function innerClause(id, fr, ctx) {
    const c = ctx.plan.clauses[id];
    if (!c) return [];
    if (c.type === "INF") return clause(id, { ...ctx, inf: true });
    if (c.type === "SUB" && c.args.link?.[0] === "whether") { const inner = clause(id, { ...ctx, skipLink: true }); return [...inner.slice(0, 1), "是不是", ...inner.slice(1)]; }
    if (c.type === "SUB" && c.args.link?.[0] === "that") return clause(id, { ...ctx, skipLink: true });
    if (c.type === "REP") return clause(id, ctx);
    return clause(id, ctx);
  }
  function relClause(id, head, ctx) { return ctx.plan?.clauses[id] ? clause(id, { ...ctx, head }) : []; }

  // ---- THE SENTENCE ------------------------------------------------------------------------------------------------------
  function realize(plan) {
    const ctx = { plan: { ...plan, clauses: { ...plan.clauses } } }, toks = [];
    ctxPlan = ctx.plan;
    let seq = [...(plan.seq ?? [])];
    // (a purpose clause after its main clause goes first: 为了买车，我省钱)
    const pi = seq.findIndex((t, i) => i > 0 && ctx.plan.clauses[t]?.type === "INF" && ctx.plan.clauses[t].args.link?.[0] === "purpose");
    if (pi > 0 && seq[pi - 1] === "," && ctx.plan.clauses[seq[pi - 2]]?.type === "MAIN") seq = [seq[pi], ",", ...seq.slice(0, pi - 1), ...seq.slice(pi + 1)];
    // (a because-clause after its main clause goes first: 因为……，所以……)
    const bi = seq.findIndex((t, i) => i > 0 && ctx.plan.clauses[t]?.type === "SUB" && ctx.plan.clauses[t].args.link?.[0] === "because");
    if (bi > 0 && seq[bi - 1] === "," && ctx.plan.clauses[seq[bi - 2]]?.type === "MAIN") seq = [seq[bi], ",", ...seq.slice(0, bi - 1), ...seq.slice(bi + 1)];
    let thenWord = null, prevSubj = null, afterWhoever = false;
    for (let i = 0; i < seq.length; i++) {
      const t = seq[i], c = ctx.plan.clauses[t];
      if (c) {
        const link = c.type === "SUB" ? c.args.link?.[0] : null, lk = link ? (table.link[link]?.[0]?.w ?? "") : "";
        const next = lk.match(/>(\S+)/)?.[1] ?? null;
        const subjNow = c.args.subj?.[0] ?? null, prev = ctx.plan.clauses[seq[i - 2]];
        const tight = seq[i - 1] === "," && prev && (prev.type === "MAIN" || /^(when|when-past|while|after|before|as-soon-as)$/.test(prev.args.link?.[0] ?? "")) && !thenWord;
        if (c.type === "INF" && !c.args.link && toks.at(-1) === "，") toks.pop();
        toks.push(...clause(t, { ...ctx, thenWord: c.type === "MAIN" ? thenWord : null, dropSubj: tight && prevSubj && prevSubj === subjNow && table.pron?.[subjNow] ? subjNow : null, afterWhoever, beforeQuote: seq[i + 1] === ":" && seq[i + 2] === "„" }));
        thenWord = c.type === "SUB" ? next : null;
        prevSubj = subjNow; afterWhoever = c.type === "WHOEVER";
      } else if (PUNCT[t]) toks.push(PUNCT[t]);
      else if (table.coord?.[t]) toks.push(say("coord", t));
      else { const e = own(t, "INT") ?? own(t, "PHR") ?? own(t, "PAR") ?? own(t, "AV"); toks.push(e ? e.word : wordOf(t, "INT")); }
    }
    return assemble(toks);
  }
  function assemble(toks) {
    const words = toks.filter((t) => t != null && t !== "").flatMap((t) => t.split(" ")).filter(Boolean);
    // (a 吗 before 。 makes the sentence a question; two commas in a row become one; a comma after a 所以/但是 is dropped)
    const out = [];
    for (let k = 0; k < words.length; k++) {
      const w = words[k], next = words[k + 1];
      if (w === "，" && (out.at(-1) === "，" || next === "，" || next === "。" || next === "？")) continue;
      if (/^[，。？！]$/.test(w) && out.at(-1) === "，") out.pop();
      out.push(w);
    }
    let text = "";
    for (let k = 0; k < out.length; k++) {
      const w = out[k], prev = out[k - 1];
      const latin = /^[A-Za-z0-9]/.test(w), prevLatin = prev && /[A-Za-z0-9]$/.test(prev);
      text += (latin && prevLatin ? " " : "") + w;
    }
    return { text, tokens: out.map((w) => ({ w, ipa: ipaOfToken(w) })) };
  }
  // how a token sounds: the dictionary's IPA (the measure word, the particles are words of it or of zh/rules/sounds.txt);
  // a compound of two words (大房子: 大 + 房子) its parts'; 不 is bu2 before a fourth tone, 一 yi2 / yi4 by what follows
  function ipaOfToken(w) {
    if (!isCJK(w)) return "";
    const own1 = lx.ipaOf(w);
    if (own1) return own1;
    let out = "", i = 0;
    while (i < w.length) {
      let n = Math.min(4, w.length - i), got = "";
      for (; n >= 1; n--) { const p = lx.ipaOf(w.slice(i, i + n)); if (p) { got = p; break; } }
      if (!got) return "";
      out += got; i += Math.max(1, n);
    }
    return out;
  }
  return { realize, word: entry, use: lx.use };
}

export const load = loadChinese;
