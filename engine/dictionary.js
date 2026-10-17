// THE DICTIONARY PAGE (dictionary.html): a language's words looked up as one types, an entry opened with everything the
// vocabulary data holds of it -- its sound (spoken on 🔊), meanings, grammar details, its MORPHOLOGY TABLE (the forms of
// engine/paradigm.js laid out by language and part of speech: LAYOUTS below), its RELATED WORDS (the synonyms of its
// concept, its word family -- the dictionary's `root` / `derived` lines --, the words sharing a component of its
// `parts`: laufen <> ver|laufen, Haus <> Haus|tür, its OPPOSITES: the `opposite` concepts of concepts/opposites.txt), its
// translations in the other languages (loaded when asked) and example sentences (engine/practice.js). Every related
// word is a link that opens its entry; the address hash keeps the language and entry, so the browser's back button works.
// A noun's CATEGORIES (world/categories.txt, engine/meaning.js): each one with its parents up to the root (Affe: mammal ‹
// beast ‹ animal ‹ living ‹ concrete ‹ entity -- a category named by a concept shows that concept's word in the language,
// Säugetier), the affordances (what one can do with it); a word that names a category lists its subcategories and its
// direct members; a category opens a CATEGORY VIEW (hash `#de/cat/mammal`). A concept declared a GENERIC concept in a
// context (tools/concepts.py `: of odjazd @ lietanie`) shows the generic's words; the generic word lists the words of its
// contexts (Abfahrt: Abflug (lietanie)). Two more views of the list: BY FREQUENCY (the words in the order of
// <lang>/order.tsv, a hundred at a time, the search narrowing them) and MY LIST -- the words the learner put aside from
// their cards (★ on the card; kept in localStorage "dictionary:list" as lang|id, across languages): what was hard, to
// come back to.
// CHINESE: an entry lists its CHARACTERS, each with its components and stroke count (engine/hanzi.js, zh/composition.txt);
// a component opens a COMPONENT VIEW (hash `#zh/comp/木`): what it is made of, every character it is written in, the
// words with it; `#zh/comp/` is the index of all components by stroke count (the 部件 toggle beside the search).
import { loadDictionary, shown, spoken } from "./data.js";
import { LANGS } from "./langs.js";
import { keptPair, keepLearn } from "./storage.js";
import { mountHeader } from "./header.js";
import { loadParadigms } from "./paradigm.js";
import { formsIndex } from "./wordforms.js";
import { createVoice, loadProsody } from "./speak.js";
import { loadText, t, tn, applyText } from "./text.js";
import { createPractice } from "./practice.js";
import * as DE from "../de/morph.js";
import { loadTemplates, recognizeAll, record } from "./listen.js";
import { loadComposition, layoutItems } from "./hanzi.js";
import { loadMeaning } from "./meaning.js";

const $ = (id) => document.getElementById(id);
const fold = (s) => s.toLocaleLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const el = (tag, cls, ...kids) => { const x = document.createElement(tag); if (cls) x.className = cls; for (const k of kids) if (k != null) x.append(k); return x; };

// ---- THE LAYOUTS: which cells make a table, what stands in its rows and columns, how they are labelled ------------------
// A block: { title, cells: a regular expression on the cell (POS.a.b...), row: the segment index for the rows, col: the one
// for the columns (null: one row), rows / cols: their order and labels; a cell with two forms (an animate accusative) shows
// both. The labels are the language's own grammar words.
const P6 = ["1sg", "2sg", "3sg", "1pl", "2pl", "3pl"];
const PERSONS = {
  de: ["ich", "du", "er/sie/es", "wir", "ihr", "sie"], en: ["I", "you", "he/she/it", "we", "you", "they"], es: ["yo", "tú", "él/ella", "nosotros", "vosotros", "ellos"],
  fr: ["je", "tu", "il/elle", "nous", "vous", "ils"], it: ["io", "tu", "lui/lei", "noi", "voi", "loro"], ru: ["я", "ты", "он/она", "мы", "вы", "они"], pl: ["ja", "ty", "on/ona", "my", "wy", "oni"],
};
const persons = (lang) => Object.fromEntries(P6.map((p, i) => [p, PERSONS[lang][i]]));
const G4 = { m: "m", f: "f", n: "n", pl: "pl" };
const RU_CASES = { nom: "им.", gen: "род.", dat: "дат.", acc: "вин.", ins: "тв.", prep: "пр." }, PL_CASES = { nom: "M.", gen: "D.", dat: "C.", acc: "B.", ins: "N.", loc: "Ms." };
const LAYOUTS = {
  de: {
    V: [{ title: "", cells: /^V\.(present|past|subj1|subj2)\.\w+$/, row: 2, col: 1, rows: persons("de"), cols: { present: "Präsens", past: "Präteritum", subj1: "Konjunktiv I", subj2: "Konjunktiv II" } },
        { title: "", cells: /^V\.(pp|inf)$/, row: 1, col: null, rows: { pp: "Partizip II", inf: "Infinitiv" } }],
    AN: [{ title: "", cells: /^AN\.(pos|comp|sup)$/, row: 1, col: null, rows: { pos: "Positiv", comp: "Komparativ", sup: "Superlativ" } },
         { title: "stark (ein / ohne Artikel)", cells: /^AN\.pos\.strong\.\w+\.\w+$/, row: 3, col: 4, rows: { nom: "Nom.", acc: "Akk.", dat: "Dat.", gen: "Gen." }, cols: G4 },
         { title: "schwach (der / die / das)", cells: /^AN\.pos\.weak\.\w+\.\w+$/, row: 3, col: 4, rows: { nom: "Nom.", acc: "Akk.", dat: "Dat.", gen: "Gen." }, cols: G4 }],
  },
  en: {
    V: [{ title: "", cells: /^V\.(present|past)\.\w+$/, row: 2, col: 1, rows: persons("en"), cols: { present: "present", past: "past" } },
        { title: "", cells: /^V\.(pp|ing|inf)$/, row: 1, col: null, rows: { pp: "past participle", ing: "-ing", inf: "infinitive" } }],
    N: [{ title: "", cells: /^N\.(sg|pl)$/, row: 1, col: null, rows: { sg: "singular", pl: "plural" } }],
    AN: [{ title: "", cells: /^AN\.(pos|comp|sup)$/, row: 1, col: null, rows: { pos: "positive", comp: "comparative", sup: "superlative" } }],
  },
  es: {
    V: [{ title: "", cells: /^V\.(pres|pret|impf|fut|cond|subj|subjimpf)\.\w+$/, row: 2, col: 1, rows: persons("es"), cols: { pres: "presente", pret: "indefinido", impf: "imperfecto", fut: "futuro", cond: "condicional", subj: "subjuntivo", subjimpf: "subj. imperfecto" } },
        { title: "", cells: /^V\.(pp|ger|inf)$/, row: 1, col: null, rows: { pp: "participio", ger: "gerundio", inf: "infinitivo" } }],
    N: [{ title: "", cells: /^N\.(sg|pl)$/, row: 1, col: null, rows: { sg: "singular", pl: "plural" } }],
    AN: [{ title: "", cells: /^AN\.[mf]\.(sg|pl)$/, row: 1, col: 2, rows: { m: "masculino", f: "femenino" }, cols: { sg: "singular", pl: "plural" } }],
  },
  fr: {
    V: [{ title: "", cells: /^V\.(pres|impf|fut|cond|subj)\.\w+$/, row: 2, col: 1, rows: persons("fr"), cols: { pres: "présent", impf: "imparfait", fut: "futur", cond: "conditionnel", subj: "subjonctif" } },
        { title: "", cells: /^V\.(pp|ger|inf)$/, row: 1, col: null, rows: { pp: "participe passé", ger: "participe présent", inf: "infinitif" } }],
    N: [{ title: "", cells: /^N\.(sg|pl)$/, row: 1, col: null, rows: { sg: "singulier", pl: "pluriel" } }],
    AN: [{ title: "", cells: /^AN\.[mf]\.(sg|pl)$/, row: 1, col: 2, rows: { m: "masculin", f: "féminin" }, cols: { sg: "singulier", pl: "pluriel" } }],
  },
  it: {
    V: [{ title: "", cells: /^V\.(pres|impf|fut|cond|subj|subjimpf)\.\w+$/, row: 2, col: 1, rows: persons("it"), cols: { pres: "presente", impf: "imperfetto", fut: "futuro", cond: "condizionale", subj: "congiuntivo", subjimpf: "cong. imperfetto" } },
        { title: "", cells: /^V\.(pp|ger|inf)$/, row: 1, col: null, rows: { pp: "participio passato", ger: "gerundio", inf: "infinito" } }],
    N: [{ title: "", cells: /^N\.(sg|pl)$/, row: 1, col: null, rows: { sg: "singolare", pl: "plurale" } }],
    AN: [{ title: "", cells: /^AN\.[mf]\.(sg|pl)$/, row: 1, col: 2, rows: { m: "maschile", f: "femminile" }, cols: { sg: "singolare", pl: "plurale" } }],
  },
  ru: {
    V: [{ title: "", cells: /^V\.(pres|fut)\.\w+$/, row: 2, col: 1, rows: persons("ru"), cols: { pres: "настоящее (несов.)", fut: "будущее (сов.)" } },
        { title: "прошедшее", cells: /^V\.(past|pfpast)\.\w+$/, row: 1, col: 2, rows: { past: "несов.", pfpast: "сов." }, cols: { m: "он", f: "она", n: "оно", pl: "они" } },
        { title: "", cells: /^V\.(imp\.sg|imp\.pl|inf|pfinf)$/, row: 0, col: null, rows: { "V.imp.sg": "императив (ты)", "V.imp.pl": "императив (вы)", "V.inf": "инфинитив", "V.pfinf": "инфинитив сов." }, whole: true }],
    N: [{ title: "", cells: /^N\.\w+\.(sg|pl)$/, row: 1, col: 2, rows: RU_CASES, cols: { sg: "ед. ч.", pl: "мн. ч." } }],
    AN: [{ title: "", cells: /^AN\.\w+\.(m|f|n|pl)$/, row: 1, col: 2, rows: RU_CASES, cols: { m: "м", f: "ж", n: "с", pl: "мн" } },
         { title: "", cells: /^AN\.comp$/, row: 1, col: null, rows: { comp: "сравнительная степень" } }],
  },
  pl: {
    V: [{ title: "", cells: /^V\.(pres|fut)\.\w+$/, row: 2, col: 1, rows: persons("pl"), cols: { pres: "teraźniejszy (ndk)", fut: "przyszły (dk)" } },
        { title: "przeszły (ndk)", cells: /^V\.past\.\w+\.\w+$/, row: 3, col: 2, rows: persons("pl"), cols: { m: "m", f: "ż", n: "n", pl: "lm" } },
        { title: "przeszły (dk)", cells: /^V\.pfpast\.\w+\.\w+$/, row: 3, col: 2, rows: persons("pl"), cols: { m: "m", f: "ż", n: "n", pl: "lm" } },
        { title: "tryb warunkowy", cells: /^V\.cond\.\w+\.\w+$/, row: 3, col: 2, rows: persons("pl"), cols: { m: "m", f: "ż", n: "n", pl: "lm" } },
        { title: "", cells: /^V\.(imp\.sg|imp\.pl|inf|pfinf)$/, row: 0, col: null, rows: { "V.imp.sg": "rozkazujący (ty)", "V.imp.pl": "rozkazujący (wy)", "V.inf": "bezokolicznik", "V.pfinf": "bezokolicznik dk" }, whole: true }],
    N: [{ title: "", cells: /^N\.\w+\.(sg|pl)$/, row: 1, col: 2, rows: PL_CASES, cols: { sg: "l. poj.", pl: "l. mn." } }],
    AN: [{ title: "", cells: /^AN\.\w+\.(m|f|n|pl)$/, row: 1, col: 2, rows: PL_CASES, cols: { m: "m", f: "ż", n: "n", pl: "lm" } },
         { title: "", cells: /^AN\.comp$/, row: 1, col: null, rows: { comp: "stopień wyższy" } }],
  },
  zh: {
    N: [{ title: "", cells: /^N\.cl$/, row: 1, col: null, rows: { cl: "量词" } }],
    V: [{ title: "", cells: /^V\.asp\.\w+$/, row: 2, col: null, rows: { le: "了", guo: "过", zhe: "着" } }],
  },
};

// a block's table from the forms: rows and columns in the layout's order, unknown keys after them
function table(block, forms, e) {
  // (a second form of a cell -- the animate accusative of Russian and Polish -- only for a noun that is a person or an animal)
  if (e && e.pos === "N" && !/^(life\/animals|humans\/family-social|humans\/work-industry)$/.test(e.category)) block = { ...block, alt: false };
  const cells = forms.filter((f) => block.cells.test(f.cell));
  if (!cells.length) return null;
  const key = (f, i) => (block.whole ? f.cell : f.cell.split(".")[i]);
  const order = (labels, keys) => [...Object.keys(labels ?? {}).filter((k) => keys.has(k)), ...[...keys].filter((k) => !(labels ?? {})[k])];
  const rowKeys = order(block.rows, new Set(cells.map((f) => key(f, block.row)))), colKeys = block.col == null ? [""] : order(block.cols, new Set(cells.map((f) => key(f, block.col))));
  const at = new Map();
  for (const f of cells) { const k = key(f, block.row) + "|" + (block.col == null ? "" : key(f, block.col)); const have = at.get(k); if (!have) at.set(k, [f.form]); else if (!have.includes(f.form) && (block.alt ?? true)) have.push(f.form); }
  const tbl = el("table", "forms-table");
  if (block.col != null) { const tr = el("tr", "", el("th")); for (const c of colKeys) tr.append(el("th", "", block.cols?.[c] ?? c)); tbl.append(tr); }
  for (const r of rowKeys) { const tr = el("tr", "", el("th", "", block.rows?.[r] ?? r)); for (const c of colKeys) tr.append(el("td", "", (at.get(r + "|" + c) ?? []).join(" / "))); tbl.append(tr); }
  const wrap = el("div", "block");
  if (block.title) wrap.append(el("h4", "", block.title));
  wrap.append(tbl);
  return wrap;
}
// the German noun's cases with its articles (the paradigm lists only the cases that change the noun)
function germanNoun(e) {
  if (!/^(der|die|das)$/.test(e.article)) return null;
  const g = { der: "m", die: "f", das: "n" }[e.article], tbl = el("table", "forms-table");
  tbl.append(el("tr", "", el("th"), el("th", "", "Singular"), el("th", "", "Plural")));
  for (const k of ["nom", "acc", "dat", "gen"]) {
    const sg = `${DE.det("def", k, g)?.w ?? ""} ${DE.noun(e, k, "sg", "strong", g).w}`.trim();
    const pl = e.plural && e.plural !== "-" ? `${DE.det("def", k, "pl")?.w ?? ""} ${DE.noun(e, k, "pl", "strong", "pl").w}`.trim() : "—";
    tbl.append(el("tr", "", el("th", "", { nom: "Nom.", acc: "Akk.", dat: "Dat.", gen: "Gen." }[k]), el("td", "", sg), el("td", "", pl)));
  }
  return el("div", "block", tbl);
}

// ---- THE PAGE -------------------------------------------------------------------------------------------------------------
const dicts = {}, paradigms = {}, voice = createVoice();
const loadLang = async (l) => {
  if (dicts[l]) return dicts[l];
  const d = await loadDictionary(LANGS[l].dict, LANGS[l].order, l);
  if (LANGS[l].morph) d.morph = await (await import("../" + LANGS[l].morph)).loadMorphology(LANGS[l].irregular);
  if (l === "de") await DE.loadMorphology("de/rules/morphology.txt");   // (the German tables: de/morph.js reads them first)
  // the components of every word's parts (ver|laufen: ver, laufen) that are words themselves -> the words sharing them
  // Chinese: the pinyin as typed -- its letters without tone marks (nihao) and its tones as digits (3 3), so that nihao,
  // ni3hao3 and nǐhǎo all find 你好
  if (l === "zh") { for (const e of d.entries) e.py = pinyinKey(e.pinyin ?? ""); d.hanzi = await loadComposition("zh/composition.txt"); }
  d.byPart = new Map(); d.byStem = new Map();
  d.bySpecific = new Map();   // pos|concept -> the entries whose concept is declared `of` it in a context (the `generic` column)
  for (const e of d.entries) if (e.generic) { const k = e.generic.split(" @ ")[0].replace(" ", "|"); (d.bySpecific.get(k) ?? d.bySpecific.set(k, []).get(k)).push(e); }
  const words = new Set(d.entries.map((e) => e.word));
  for (const e of d.entries) {
    for (const c of components(e, l)) if (words.has(c) && c !== e.word) (d.byPart.get(c) ?? d.byPart.set(c, []).get(c)).push(e);
    const st = stem(e, l); if (st) (d.byStem.get(st) ?? d.byStem.set(st, []).get(st)).push(e);   // (laufen, Lauf, Läufer? -- lauf: the stem shared)
  }
  return (dicts[l] = d);
};
const TONE_MARKS = { "\u0304": "1", "\u0301": "2", "\u030c": "3", "\u0300": "4" };
function pinyinKey(s) {
  let letters = "", tones = "";
  for (const ch of s.normalize("NFD")) { if (TONE_MARKS[ch]) tones += TONE_MARKS[ch]; else if (/[a-z]/i.test(ch)) letters += ch.toLowerCase(); else if (/[1-5]/.test(ch)) tones += ch; }
  return { letters, tones };
}
// a word's stem for the same-root search: the infinitive ending off a verb, the last component of a compound (Haus|tür ->
// tür), folded (laufen -> lauf, Lauf -> lauf); short stems (under 3 letters) are nothing
const ENDINGS = { de: /(en|eln|ern|n)$/, en: /$/, es: /(ar|er|ir|arse|erse|irse)$/, fr: /(er|ir|re)$/, it: /(are|ere|ire|arsi|ersi|irsi)$/, ru: /(ать|ять|еть|ить|ыть|уть|ти|чь|ться|тся)$/, pl: /(ać|eć|ić|yć|uć|ąć|ść|źć|c)$/, zh: /$/ };
function stem(e, l) {
  if (!/^(V|N|AN)$/.test(e.pos) || e.word.includes(" ") || l === "zh") return null;
  const comps = components(e, l), last = comps.length > 1 ? comps[comps.length - 1] : e.word;
  const st = fold(e.pos === "V" ? last.replace(ENDINGS[l], "") : last);
  return st.length >= 3 ? st : null;
}
const components = (e, l) => [...new Set((e.parts ?? "").split(/[|·]/).map((c) => c.trim()).filter((c) => c && (l === "zh" ? c.length >= 1 : c.length >= 3)))];
const practice = createPractice({ loadLang });
let lang = "de", dict = null, query = "", open = null;

// the search: the word first (exact, then a word the typed form belongs to, then as a beginning, then inside), then the meanings
const formOf = new Map();   // (of the last lookup: entry -> the cell the typed form is, shown beside the result: dem -> der · dat.m)
// THE PATTERN: what is typed matches the word from its beginning, letter for letter; `*` stands for anything; the end is
// open (haus finds Haus, Haushalt, Hausaufgabe) unless the pattern ends in `.` (haus. finds Haus alone; *ung. the words
// ending in -ung; *lauf* the words with lauf inside). Letters are folded (case, accents). A plain pattern (no * or .)
// also tries the meanings and, in Chinese, the pinyin.
function pattern(q) {
  const raw = q.trim(), exactEnd = raw.endsWith("."), body = fold(exactEnd ? raw.slice(0, -1) : raw);
  const re = new RegExp("^" + body.split("*").map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (exactEnd ? "$" : ".*"));
  return { re, body, plain: !raw.includes("*") && !exactEnd, exactEnd };
}
function lookup(q, { all = false } = {}) {
  if (!q.trim()) return [];
  const { re, body, plain } = pattern(q);
  if (!body && !all) return [];
  const pq = plain && lang === "zh" && /^[a-zü1-5 ']+$/i.test(q.trim()) ? pinyinKey(q.replace(/v/g, "ü")) : null;   // (a Chinese word typed as pinyin)
  const formHits = plain && dict.index ? new Map((dict.index.get(body) ?? []).filter((h) => fold(h.e.word) !== body).map((h) => [h.e, h.cell])) : new Map();
  formOf.clear(); for (const [e, cell] of formHits) formOf.set(e, cell);
  const score = (e) => {
    const w = fold(e.word), sk = fold(e.sk.join(" | "));
    if (pq && e.py) {
      const tonesOK = !pq.tones || e.py.tones.startsWith(pq.tones);
      if (e.py.letters === pq.letters && tonesOK) return 0;
      if (e.py.letters.startsWith(pq.letters) && tonesOK) return 1;
    }
    if (w === body) return 0;
    if (formHits.has(e)) return 0.5;   // (a form of the word typed: dem, sind, them)
    if (re.test(w)) return 1;
    if (plain && w.split(" ").some((x) => x.startsWith(body))) return 2;
    if (plain && e.plural && fold(e.plural).startsWith(body)) return 3;
    if (plain && sk.split(/[ |()]+/).some((x) => x.startsWith(body))) return 5;
    if (plain && sk.includes(body)) return 6;
    return 9;
  };
  const hits = dict.entries.map((e) => [score(e), e]).filter(([s]) => s < 9).sort((a, b) => a[0] - b[0] || a[1].freq - b[1].freq || a[1].rank - b[1].rank || a[1].order - b[1].order);
  return (all ? hits : hits.slice(0, 60)).map(([, e]) => e);
}
// GERMAN: der / die / das over the nouns a pattern finds -- the counts and shares, then the nouns by article
let stats = false;
function showStats() {
  const list = $("results"); list.replaceChildren();
  const nouns = lookup(query, { all: true }).filter((e) => e.pos === "N" && /^(der|die|das)$/.test(e.article));
  $("no-results").hidden = !(query.trim() && !nouns.length);
  if (!nouns.length) return;
  const by = { der: [], die: [], das: [] };
  for (const e of nouns) by[e.article].push(e);
  const box = el("div", "stats");
  box.append(el("div", "stats-total", t("matching-nouns", { n: nouns.length })));
  for (const a of ["der", "die", "das"]) {
    const n = by[a].length, pct = Math.round(100 * n / nouns.length);
    const bar = el("div", "stats-bar"); bar.style.width = pct + "%"; bar.classList.add(a);
    box.append(el("div", "stats-row", el("span", `stats-art ${a}`, a), el("div", "stats-track", bar), el("span", "stats-n", `${n} · ${pct} %`)));
  }
  list.append(box);
  for (const a of ["der", "die", "das"]) {
    if (!by[a].length) continue;
    const d = el("details", "stats-words"), sum = el("summary", a, `${a} (${by[a].length})`); d.append(sum);
    const w = el("div", "word-list"); for (const e of by[a].sort((x, y) => x.freq - y.freq || x.rank - y.rank).slice(0, 200)) w.append(el("span", "word-item", link(e))); d.append(w); list.append(d);
  }
}
// a result's row: the word, its part of speech, its meanings; `extra`: a rank, a typed form, a remove button
function resultRow(e, ...extra) {
  const row = el("button", "result", el("span", "result-word", shown(e)), el("span", "result-pos", e.pos), el("span", "result-sk", e.sk.slice(0, 3).join(", ")), ...extra);
  row.onclick = () => openEntry(e);
  return row;
}
function showResults() {
  if (stats && lang === "de") return showStats();
  if (byRank) return showByRank();
  if (listView) return showMyList();
  const list = $("results"); list.replaceChildren();
  const found = lookup(query), q = query.trim();
  const comp = lang === "zh" && [...q].length === 1 && dict.hanzi?.has(q) ? q : null;   // (a character or component typed: its component view too)
  $("no-results").hidden = !(q && !found.length && !comp);
  if (comp) list.append(componentRow(comp));
  for (const e of found) list.append(resultRow(e, formOf.has(e) ? el("span", "result-form", `${query.trim()} · ${(formOf.get(e) || "form").replace(/^[A-Z]+\./, "")}`) : null));
}

// ---- BY FREQUENCY: the words in the order of the language's order.tsv (the commonest first), a hundred at a time -- the
//      next hundred come by themselves as the list is scrolled to its end (a sentinel row watched by an IntersectionObserver)
let byRank = false, listView = false, pageSize = 100;
const PAGE = 100;
let sentinel = null;
function showByRank() {
  const list = $("results"); list.replaceChildren(); $("no-results").hidden = true;
  const all = (query.trim() ? lookup(query) : dict.entries).filter((e) => e.rank !== Infinity).sort((a, b) => a.rank - b.rank || a.order - b.order);
  for (const e of all.slice(0, pageSize)) {
    const row = resultRow(e, el("span", "result-rank", "#" + e.rank), rowStar(e));
    row.querySelector(".result-pos").after(el("span", "result-ipa", e.pinyin ? `${e.pinyin} · [${e.ipa}]` : e.ipa ? `[${e.ipa}]` : ""));   // (the sound: the pinyin and IPA of Chinese, the IPA else)
    list.append(row);
  }
  if (all.length > pageSize) {
    const more = el("div", "more mute", `… ${all.length - pageSize}`); list.append(more);
    sentinel?.disconnect();
    sentinel = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) { pageSize += PAGE; const y = window.scrollY; showByRank(); window.scrollTo(0, y); } }, { rootMargin: "400px" });
    sentinel.observe(more);
  }
  if (!all.length) list.append(el("p", "mute", t("no-results")));
}

// (a ★ in a row of the list: the word put on my list or taken off it there and then, without opening its card)
function rowStar(e) {
  const b = el("span", "result-star", "");
  const draw = () => { const on = inList(e); b.textContent = on ? "★" : "☆"; b.classList.toggle("on", on); b.title = t(on ? "remove-from-list" : "add-to-list"); };
  b.onclick = (ev) => { ev.stopPropagation(); toggleList(e); draw(); }; draw();
  return b;
}

// ---- MY LIST: the words put aside (★ on a card), lang|id each, kept in the browser ------------------------------------
const LIST_KEY = "dictionary:list";
const myList = () => { try { return JSON.parse(localStorage.getItem(LIST_KEY) ?? "[]"); } catch { return []; } };
const keepList = (l) => { try { localStorage.setItem(LIST_KEY, JSON.stringify(l)); } catch { /* (storage blocked) */ } showListCount(); };
const listKey = (e) => `${lang}|${e.id}`;
const inList = (e) => myList().includes(listKey(e));
const toggleList = (e) => { const l = myList(), k = listKey(e); keepList(l.includes(k) ? l.filter((x) => x !== k) : [...l, k]); };
const showListCount = () => { const n = myList().filter((k) => k.startsWith(lang + "|")).length; $("mylist").textContent = `★ ${t("my-list")}` + (n ? ` (${n})` : ""); };
function showMyList() {
  const list = $("results"); list.replaceChildren(); $("no-results").hidden = true;
  const keys = myList().filter((k) => k.startsWith(lang + "|")).map((k) => k.slice(lang.length + 1)), q = fold(query.trim());
  const items = keys.map((id) => dict.entries.find((e) => e.id === id)).filter((e) => e && (!q || fold(e.word).includes(q) || fold(e.sk.join(" ")).includes(q)));
  for (const e of items) {
    const rm = el("span", "result-remove", "✕"); rm.title = t("remove-from-list");
    rm.onclick = (ev) => { ev.stopPropagation(); toggleList(e); showMyList(); };
    list.append(resultRow(e, rm));
  }
  if (!items.length) list.append(el("p", "mute", t("list-empty")));
}

// an entry's line: its word with the article, a link that opens it
const link = (e) => { const a = el("a", "word-link", shown(e)); a.href = "#" + hashOf(e); a.onclick = (ev) => { ev.preventDefault(); openEntry(e); }; return a; };
const hashOf = (e) => `${lang}/${encodeURIComponent(e.id)}`;
// a list of words with a gloss each (the part of speech and the first meaning, or `gloss(x)`)
const wordList = (items, gloss = (x) => `${x.pos} · ${x.sk[0]}`) => { const ul = el("div", "word-list"); for (const x of items) ul.append(el("span", "word-item", link(x), el("span", "word-gloss", " " + gloss(x)))); return ul; };

// ---- CATEGORIES (world/categories.txt, engine/meaning.js): the tree a noun's concept is in ------------------------------
const meanings = {};
const meaningOf = async (l) => (meanings[l] ??= await loadMeaning("world/categories.txt", "world/meaning.tsv", await loadLang(l)));
const catHash = (c) => `${lang}/cat/${encodeURIComponent(c)}`;
// a category is shown by the word of the concept naming it (categories.txt `= POS id`) when the language has one, else by its name
const catWord = (m, c) => { const n = m.conceptOf(c); return n ? (dict.byConcept.get(`${n.pos}|${n.concept}`) ?? [])[0] ?? null : null; };
const catLabel = (m, c) => { const w = catWord(m, c); return w ? shown(w) : c; };
function catLink(m, c) {
  const a = el("a", "word-link cat-link" + (catWord(m, c) ? "" : " cat-code"), catLabel(m, c));
  a.href = "#" + catHash(c); a.onclick = (ev) => { ev.preventDefault(); showCategory(c); };
  return a;
}
// the way up to the root along the first parents (the other parents noted): mammal ‹ beast ‹ animal ‹ living ‹ concrete ‹ entity
function chainUp(m, c) {
  const row = el("div", "cat-chain");
  for (let cur = c, n = 0; cur && n < 20; n++) {
    row.append(catLink(m, cur));
    const ps = m.parentsOf(cur);
    if (ps.length > 1) row.append(el("span", "mute", ` (+ ${ps.slice(1).map((p) => catLabel(m, p)).join(", ")})`));
    if (!ps.length) break;
    row.append(el("span", "cat-sep", " ‹ ")); cur = ps[0];
  }
  return row;
}
const catList = (m, cs) => { const row = el("div", "cat-chain"); cs.forEach((c, i) => row.append(i ? ", " : "", catLink(m, c))); return row; };
// a noun's section: each category up to the root; what one can do with it; a word naming a category: its subcategories, its members
async function categoriesSection(e, view, section) {
  const m = await meaningOf(lang);
  if (open !== e) return;
  const cats = m.catsOf(e), isa = cats.filter((c) => !m.isAffordance(c)), aff = cats.filter((c) => m.isAffordance(c)), own = m.categoryOf(e);
  if (!isa.length && !aff.length && !own) return;
  const s = section("categories");
  for (const c of isa) s.append(chainUp(m, c));
  if (aff.length) { const row = catList(m, aff); row.prepend(el("span", "mute", t("affordances") + ": ")); s.append(row); }
  if (own) {
    const kids = m.childrenOf(own), members = m.direct(own).filter((x) => x.concept !== e.concept).sort((a, b) => a.freq - b.freq || a.rank - b.rank);
    if (kids.length) { s.append(el("h4", "", t("subcategories"))); s.append(catList(m, kids)); }
    if (members.length) { s.append(el("h4", "", tn("category-words", members.length))); s.append(wordList(members.slice(0, 80))); if (members.length > 80) s.append(el("div", "mute", "…")); }
  }
}
// THE CATEGORY VIEW (#de/cat/mammal): its way up, the word naming it, its subcategories with their size, its direct members
async function showCategory(c, { push = true } = {}) {
  open = null;
  if (push) history.pushState(null, "", "#" + catHash(c));
  $("results").hidden = true; $("no-results").hidden = true; $("search-help").hidden = true;
  const view = $("entry"); view.hidden = false; view.replaceChildren();
  const back = el("button", "back", "← " + t("back")); back.onclick = () => { history.pushState(null, "", "#" + lang); showList(); }; view.append(back);
  window.scrollTo(0, 0);
  const m = await meaningOf(lang), w = catWord(m, c);
  view.append(el("div", "entry-head", el("h2", "", catLabel(m, c))));
  view.append(el("div", "entry-meta", `${t("category")} · ${c}`));
  if (w) { const row = el("div", "entry-same", el("span", "mute", t("dictionary-entry") + ": ")); const a = link(w); a.textContent = `${w.pos} · ${w.sk.slice(0, 2).join(", ")}`; row.append(a); view.append(row); }
  const s = el("section", "entry-section", el("h3", "", t("categories"))); view.append(s);
  s.append(chainUp(m, c));
  const kids = m.childrenOf(c);
  if (kids.length) { s.append(el("h4", "", t("subcategories"))); const row = el("div", "cat-chain"); kids.forEach((k, i) => row.append(i ? ", " : "", catLink(m, k), el("span", "mute", ` ${m.nouns(k).length}`))); s.append(row); }
  const members = m.direct(c).sort((a, b) => a.freq - b.freq || a.rank - b.rank);
  if (members.length) { const ms = el("section", "entry-section", el("h3", "", tn("category-words", members.length))); view.append(ms); ms.append(wordList(members.slice(0, 200))); if (members.length > 200) ms.append(el("div", "mute", "…")); }
}
const details = (e) => {
  const out = [];
  if (e.pos === "N" && e.gender) out.push(`${t("gender")}: ${e.gender}`);
  if (e.plural === "PL") out.push(t("plural") + ": " + t("plural-only"));
  else if (e.plural && e.plural !== "-") out.push(`${t("plural")}: ${lang === "de" ? "die " : ""}${e.plural}`);
  if (e.classifier) out.push(`${t("measure-words")}: ${e.classifier}`);
  if (e.forms) out.push((e.pos === "V" && (lang === "ru" || lang === "pl") ? t("aspect") : t("forms")) + `: ${e.forms}`);
  if (e.comparison) out.push(`${t("comparison")}: ${e.comparison}`);
  if (e.aux) out.push(`${t("auxiliary")}: ${e.aux}`);
  if (e.model && !/^(нескл|ndm)$/.test(e.model)) out.push(`${t("model")}: ${e.model}`);
  if (/^(нескл|ndm)$/.test(e.model)) out.push(t("indeclinable"));
  if (e.case) out.push(`${t("case")}: ${e.case}`);
  if (e.comb?.length) out.push(`(${e.comb.join(", ")})`);
  return out;
};

// ---- CHINESE CHARACTERS: components and strokes (engine/hanzi.js) --------------------------------------------------------
const isHan = (c) => /^[\u2e80-\u2fdf\u31c0-\u31ef\u3400-\u4dbf\u4e00-\u9fff\u{20000}-\u{2ffff}]$/u.test(c);
const chars = (word) => [...new Set([...word].filter(isHan))];
const compHash = (c) => `${lang}/comp/${encodeURIComponent(c)}`;
// a component as a link that opens its view -- glossed with its first entry (pinyin · meaning) when it is a word
const compLink = (c, { gloss = true } = {}) => {
  const a = el("a", "word-link comp-link", c); a.href = "#" + compHash(c); a.onclick = (ev) => { ev.preventDefault(); showComponent(c); };
  if (!gloss) return a;
  const e = dict.entries.filter((x) => x.word === c).sort((x, y) => x.freq - y.freq || x.rank - y.rank)[0];
  return el("span", "word-item", a, e ? el("span", "word-gloss", ` ${e.pinyin ?? ""} · ${e.sk[0]}`) : null);
};
// a component's layout as written (白 | 勺), each component a link
const layoutView = (c) => {
  const m = dict.hanzi.of(c), row = el("span", "layout");
  if (!m?.layout) return row;
  for (const it of layoutItems(m.layout)) row.append(it.part !== undefined ? compLink(it.part, { gloss: false }) : el("span", "mute", it.sep ? ` ${it.sep} ` : " "));
  return row;
};
const strokesText = (c) => { const n = dict.hanzi.strokes(c); return n == null ? "" : tn("strokes", n); };
// a result row for a component typed in the search: the glyph, "component", how many characters it is in
function componentRow(c) {
  const n = dict.hanzi.containing(c).length;
  const row = el("button", "result", el("span", "result-word", c), el("span", "result-pos", t("component")), el("span", "result-sk", `${strokesText(c)}${n ? ` · ${tn("in-characters", n)}` : ""}`));
  row.onclick = () => showComponent(c);
  return row;
}
// the entry's characters: each with its components, stroke count and a link to its component view
function charactersSection(e, view) {
  const cs = chars(e.word).filter((c) => dict.hanzi.has(c));
  if (!cs.length) return;
  const s = el("section", "entry-section", el("h3", "", t("characters"))); view.append(s);
  for (const c of cs) {
    const n = dict.hanzi.containing(c).length, words = dict.entries.filter((x) => x.word !== c && x.word.includes(c)).length;
    const row = el("div", "char-row", compLink(c, { gloss: e.word !== c }), layoutView(c), el("span", "mute", strokesText(c)));
    const more = []; if (n) more.push(tn("in-characters", n)); if (words) more.push(tn("in-words", words));
    if (more.length) { const a = el("a", "comp-more", more.join(" · ")); a.href = "#" + compHash(c); a.onclick = (ev) => { ev.preventDefault(); showComponent(c); }; row.append(a); }
    s.append(row);
  }
}
// THE COMPONENT VIEW: a character or component -- its entries, what it is made of, the characters it is in, the words with it
function showComponent(c, { push = true } = {}) {
  open = null;
  if (push) history.pushState(null, "", "#" + compHash(c));
  $("results").hidden = true; $("no-results").hidden = true; $("search-help").hidden = true;
  const view = $("entry"); view.hidden = false; view.replaceChildren();
  const back = el("button", "back", "← " + t("back")); back.onclick = () => { history.pushState(null, "", "#" + lang); showList(); }; view.append(back);
  window.scrollTo(0, 0);
  if (!c) return componentIndex(view);
  const H = dict.hanzi, own = dict.entries.filter((x) => x.word === c).sort((x, y) => x.freq - y.freq || x.rank - y.rank);
  view.append(el("div", "entry-head", el("h2", "glyph", c)));
  view.append(el("div", "entry-meta", [t("component"), strokesText(c)].filter(Boolean).join(" · ")));
  if (own.length) { const row = el("div", "entry-same", el("span", "mute", t("dictionary-entry") + ": ")); own.forEach((x, i) => { const a = link(x); a.textContent = `${x.pos} · ${x.pinyin ?? ""} · ${x.sk.slice(0, 2).join(", ")}`; row.append(i ? " · " : "", a); }); view.append(row); }
  const m = H.of(c);
  if (m?.layout) {
    const s = el("section", "entry-section", el("h3", "", t("composition"))); view.append(s);
    s.append(el("div", "char-row", layoutView(c)));
    // each component one level down, with its own components
    for (const p of m.parts) { const pm = H.of(p); if (pm?.layout || H.strokes(p) != null) s.append(el("div", "char-row sub", compLink(p), layoutView(p), el("span", "mute", strokesText(p)))); }
  }
  const direct = new Set(H.direct(c)), all = H.containing(c);
  if (all.length) {
    const s = el("section", "entry-section", el("h3", "", `${tn("in-characters", all.length)}`)); view.append(s);
    const known = (x) => dict.entries.some((e) => e.word === x);
    const rank = (x) => Math.min(...dict.entries.filter((e) => e.word === x).map((e) => e.rank), Infinity);
    const sorted = [...all].sort((a, b) => (direct.has(b) ? 1 : 0) - (direct.has(a) ? 1 : 0) || (known(b) ? 1 : 0) - (known(a) ? 1 : 0) || rank(a) - rank(b));
    const ul = el("div", "word-list chars"); for (const x of sorted.slice(0, 300)) { const it = compLink(x); if (!direct.has(x)) it.classList.add("via"); ul.append(it); } s.append(ul);
    if (all.length > 300) s.append(el("div", "mute", "…"));
  }
  const words = dict.entries.filter((x) => x.word !== c && x.word.includes(c)).sort((a, b) => a.rank - b.rank || a.freq - b.freq);
  if (words.length) {
    const s = el("section", "entry-section", el("h3", "", tn("in-words", words.length))); view.append(s);
    const ul = el("div", "word-list"); for (const x of words.slice(0, 80)) ul.append(el("span", "word-item", link(x), el("span", "word-gloss", ` ${x.pinyin ?? ""} · ${x.sk[0]}`))); s.append(ul);
    if (words.length > 80) s.append(el("div", "mute", "…"));
  }
}
// the index of components by stroke count: every component that is written in some character, the most used first
function componentIndex(view) {
  const H = dict.hanzi, by = new Map();
  for (const c of H.components()) { const n = H.direct(c).length; if (!n) continue; const k = H.strokes(c) ?? "?"; (by.get(k) ?? by.set(k, []).get(k)).push([c, H.containing(c).length]); }
  view.append(el("div", "entry-head", el("h2", "", t("components"))));
  view.append(el("div", "entry-meta", t("components-help")));
  for (const k of [...by.keys()].sort((a, b) => (a === "?") - (b === "?") || a - b)) {
    const s = el("section", "entry-section", el("h3", "", k === "?" ? "?" : tn("strokes", k))); view.append(s);
    const ul = el("div", "word-list chars");
    for (const [c, n] of by.get(k).sort((a, b) => b[1] - a[1])) ul.append(el("span", "word-item", compLink(c, { gloss: false }), el("span", "word-gloss", ` ${n}`)));
    s.append(ul);
  }
}

// the microphone: a word said is matched against the language's templates (engine/listen.js); the nearest words are
// listed as results, the best first -- click to open, or say it again
const templates = {};
async function listen() {
  const btn = $("listen");
  if (btn.classList.contains("on")) return;
  btn.classList.add("on"); btn.textContent = "…";
  try {
    const [T, rec] = await Promise.all([templates[lang] ??= loadTemplates(`${lang}/listen`), record({ maxMs: 3000, silenceMs: 600 })]);
    if (!rec) { $("no-results").hidden = false; return; }
    const found = recognizeAll(rec.samples, rec.rate, T, { top: 6 });
    if (open) { history.pushState(null, "", "#" + lang); open = null; $("entry").hidden = true; $("results").hidden = false; }
    const list = $("results"); list.replaceChildren();
    $("no-results").hidden = found.length > 0;
    for (const r of found) {
      const e = dict.entries[r.i[0]];
      if (!e) continue;
      const row = el("button", "result", el("span", "result-word", shown(e)), el("span", "result-score", `${Math.round(r.score * 100)} %`), el("span", "result-sk", `${e.pos} · ${e.sk.slice(0, 2).join(", ")}`));
      row.onclick = () => openEntry(e);
      list.append(row);
    }
    $("search").value = found[0] ? dict.entries[found[0].i[0]]?.word ?? "" : "";
  } catch (err) { $("no-results").hidden = false; console.warn(err); }
  finally { btn.classList.remove("on"); btn.textContent = "🎤"; }
}
function showList() {
  open = null; $("entry").hidden = true; $("results").hidden = false; $("search-help").hidden = false;
  showResults(); $("search").focus();
}
async function openEntry(e, { push = true } = {}) {
  open = e;
  if (push) history.pushState(null, "", "#" + hashOf(e));
  $("results").hidden = true; $("no-results").hidden = true; $("search-help").hidden = true;
  const view = $("entry"); view.hidden = false; view.replaceChildren();
  const back = el("button", "back", "← " + t("back")); back.onclick = () => { history.pushState(null, "", "#" + lang); showList(); }; view.append(back);
  window.scrollTo(0, 0);
  // the head: the word, its sound and the button that says it, its part of speech, level and category, the meanings
  const say = el("button", "say", "🔊"); say.title = t("say-again"); say.onclick = () => voice.say(spoken(e, dict));
  const star = el("button", "star", "");   // (my list: the word put aside, or taken off it)
  const starText = () => { const on = inList(e); star.textContent = on ? "★" : "☆"; star.title = t(on ? "remove-from-list" : "add-to-list"); star.classList.toggle("on", on); };
  star.onclick = () => { toggleList(e); starText(); }; starText();
  view.append(el("div", "entry-head", el("h2", "", shown(e)), say, star));
  view.append(el("div", "entry-ipa", e.pinyin ? `${e.pinyin} · ${e.ipa}` : e.ipa ? `[${e.ipa}]` : ""));
  view.append(el("div", "entry-meta", `${e.pos} · FREQ ${e.freq} · ${e.category}` + (e.parts && e.parts.includes("|") ? ` · ${e.parts}` : "")));
  view.append(el("div", "entry-sk", e.sk.join(", ")));
  const det = details(e);
  if (det.length) view.append(el("div", "entry-details", det.join(" · ")));
  const same = dict.entries.filter((x) => x !== e && fold(x.word) === fold(e.word)).sort((a, b) => (a.pos === e.pos ? 1 : 0) - (b.pos === e.pos ? 1 : 0) || a.freq - b.freq);
  if (same.length) { const row = el("div", "entry-same", el("span", "mute", t("same-word") + ": ")); same.forEach((x, i) => { const a = link(x); a.textContent = `${x.pos} · ${x.sk.slice(0, 2).join(", ")}`; row.append(i ? " · " : "", a); }); view.append(row); }
  if (lang === "zh" && dict.hanzi) charactersSection(e, view);
  // the morphology table
  const section = (title) => { const s = el("section", "entry-section", el("h3", "", t(title))); view.append(s); return s; };
  const forms = await formsOf(e);
  const blocks = (LAYOUTS[lang]?.[e.pos] ?? []).map((b) => table(b, forms, e)).filter(Boolean);
  if (lang === "de" && e.pos === "N") { const g = germanNoun(e); if (g) blocks.unshift(g); }
  if (blocks.length) { const s = section("forms-table"); for (const b of blocks) s.append(b); }
  // the related words: synonyms of the concept, the family, the words sharing a component
  const syn = (dict.byConcept.get(`${e.pos}|${e.concept}`) ?? []).filter((x) => x !== e);
  const family = dict.entries.filter((x) => x !== e && x.root && x.root === e.root && !syn.includes(x));
  const comps = components(e, lang), mates = new Set();
  for (const c of comps) for (const x of dict.byPart.get(c) ?? []) if (x !== e) mates.add(x);
  for (const x of dict.byPart.get(e.word) ?? []) if (x !== e) mates.add(x);
  for (const c of comps) for (const x of dict.entries.filter((x) => x.word === c && x !== e)) mates.add(x);
  const st = stem(e, lang); if (st) for (const x of dict.byStem.get(st) ?? []) if (x !== e) mates.add(x);
  const sameRoot = [...mates].filter((x) => !syn.includes(x) && !family.includes(x)).sort((a, b) => a.rank - b.rank);
  const opp = (e.opposite ? e.opposite.split(" | ") : []).flatMap((k) => dict.byConcept.get(k.replace(" ", "|")) ?? []).sort((a, b) => a.freq - b.freq || a.rank - b.rank);   // (the opposite concepts' words, `POS id`: concepts/opposites.txt)
  // the generic concept this one is declared `of` in a context (the `generic` column: `POS id @ context`), and the other way
  const gen = e.generic ? e.generic.split(" @ ") : null, genWords = gen ? (dict.byConcept.get(gen[0].replace(" ", "|")) ?? []).filter((x) => x !== e) : [];
  const spec = (dict.bySpecific.get(`${e.pos}|${e.concept}`) ?? []).filter((x) => x !== e).sort((a, b) => a.freq - b.freq || a.rank - b.rank);
  const list = wordList;
  if (syn.length || opp.length || family.length || sameRoot.length || genWords.length || spec.length) {
    const s = section("related");
    if (syn.length) { s.append(el("h4", "", t("synonyms"))); s.append(list(syn)); }
    if (genWords.length) { s.append(el("h4", "", t("generic") + (gen[1] ? ` · ${gen[1]}` : ""))); s.append(list(genWords)); }   // (the generic: Abflug -> Abfahrt, said of flying)
    if (spec.length) { s.append(el("h4", "", t("in-context"))); s.append(list(spec, (x) => `${x.generic.split(" @ ")[1] ?? ""} · ${x.sk[0]}`)); }   // (Abfahrt -> Abflug (lietanie))
    if (opp.length) { s.append(el("h4", "", t("opposites"))); s.append(list(opp)); }
    if (family.length) { s.append(el("h4", "", t("family"))); s.append(list(family.sort((a, b) => a.order - b.order))); }
    if (sameRoot.length) { s.append(el("h4", "", t("same-root"))); s.append(list(sameRoot.slice(0, 40))); }
  }
  if (e.pos === "N") await categoriesSection(e, view, section);   // (world/categories.txt: what the concept is)
  // the translations: the concept's words in the other languages, loaded when asked
  const tr = section("translations");
  const btn = el("button", "", t("show-translations")); tr.append(btn);
  btn.onclick = async () => {
    btn.remove();
    for (const l of Object.keys(LANGS).filter((l) => LANGS[l].dict && l !== lang)) {
      const d = await loadLang(l), es = d.byConcept.get(`${e.pos}|${e.concept}`) ?? [];
      if (open !== e) return;
      const row = el("div", "translation", el("span", "translation-lang", LANGS[l].name + ": "));
      es.forEach((x, i) => { const a = el("a", "word-link", shown(x)); a.href = `#${l}/${encodeURIComponent(x.id)}`; a.onclick = (ev) => { ev.preventDefault(); useLang(l).then(() => openEntry(x)); }; row.append(i ? ", " : "", a); });
      if (!es.length) row.append("—");
      tr.append(row);
    }
  };
  // the example sentences (clicked: spoken)
  const ex = section("examples"); const wait = el("div", "mute", t("making")); ex.append(wait);
  const can = await practice.canSay(e).catch(() => false);
  const sents = can ? await practice.examples(e, 3, { alive: () => open === e }).catch(() => []) : [];
  if (open !== e) return;
  wait.remove();
  if (!sents.length) ex.append(el("div", "mute", "—"));
  for (const s of sents) { const d = el("div", "example", s.text); d.onclick = () => voice.say(s.ipa); ex.append(d); }
}
async function formsOf(e) {
  paradigms[lang] ??= await loadParadigms(lang, { morph: dict.morph, nouns: dict.entries });
  try { return paradigms[lang].forms(e); } catch { return []; }
}

async function useLang(l) {
  if (l === lang && dict) return;
  lang = l; $("lang").value = l; keepLearn(l);
  dict = await loadLang(l);
  if ($("mylist")) showListCount();
  voice.prosody = await loadProsody(LANGS[l].speech);
  formsIndex(dict, l).then(() => { paradigms[l] ??= dict.pd; if (lang === l) showResults(); });   // (the forms -> words index, in the background: dem finds der)
  $("search").lang = l;
  $("stats").hidden = l !== "de"; $("parts").hidden = l !== "zh";
  showResults();
}
function fromHash() {
  const m = location.hash.match(/^#(\w+)\/(.*)$/);
  if (!m || !LANGS[m[1]]?.dict || !m[2]) return null;
  return { lang: m[1], id: decodeURIComponent(m[2]) };
}

export async function start() {
  const pair = keptPair();
  await loadText(LANGS[pair.other]?.ui ?? "sk/ui.txt", "en/ui.txt");
  applyText(); mountHeader("dictionary");
  const sel = $("lang");
  for (const [k, v] of Object.entries(LANGS)) if (v.dict) sel.append(new Option(v.name, k));
  const h = fromHash();
  await useLang(h?.lang ?? pair.learn);
  sel.onchange = () => { open = null; $("entry").hidden = true; $("results").hidden = false; useLang(sel.value); };
  $("search").oninput = () => { query = $("search").value; if (open) { history.pushState(null, "", "#" + lang); showList(); } else showResults(); };
  $("search").onkeydown = (ev) => { if (ev.key === "Enter") { const first = lookup(query)[0]; if (first) openEntry(first); } };   // (Enter opens the first match)
  $("search").focus();
  $("listen").onclick = listen;
  $("stats").onclick = () => { stats = !stats; $("stats").classList.toggle("chosen", stats); showResults(); };
  const views = () => { $("byrank").classList.toggle("chosen", byRank); $("mylist").classList.toggle("chosen", listView); if (open) { history.pushState(null, "", "#" + lang); showList(); } else showResults(); };
  $("byrank").onclick = () => { byRank = !byRank; listView = false; pageSize = PAGE; views(); };
  $("mylist").onclick = () => { listView = !listView; byRank = false; views(); };
  showListCount();
  $("parts").onclick = () => showComponent("");   // (the index of components by strokes)
  $("title").onclick = () => (location.href = "trainer.html");   // (the title switches back to the trainer)
  const openHash = () => {
    const hh = fromHash(); if (!hh) { if (open || !$("entry").hidden) showList(); return; }
    useLang(hh.lang).then(() => {
      const cm = hh.id.match(/^comp\/(.*)$/);
      if (cm) { if (dict.hanzi) showComponent(cm[1], { push: false }); return; }
      const cat = hh.id.match(/^cat\/(.*)$/);
      if (cat) { showCategory(cat[1], { push: false }); return; }
      const e = dict.entries.find((x) => x.id === hh.id); if (e) openEntry(e, { push: false });
    });
  };
  window.addEventListener("hashchange", openHash);
  if (h) openHash();
}
