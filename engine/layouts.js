// THE MORPHOLOGY LAYOUTS: how each language's paradigm cells (engine/paradigm.js: V.present.3sg, N.pl, AN.f.sg ...) are
// laid out and named in the language's own grammar words -- the dictionary's tables (engine/dictionary.js) and the
// reading page's tip (engine/reading.js: what form the word under the mouse is) both read them here.

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
export const LAYOUTS = {
  de: {
    V: [{ title: "", cells: /^V\.(present|past|subj1|subj2)\.\w+$/, row: 2, col: 1, rows: persons("de"), cols: { present: "Präsens", past: "Präteritum", subj1: "Konjunktiv I", subj2: "Konjunktiv II" } },
        { title: "", cells: /^V\.(pp|inf)$/, row: 1, col: null, rows: { pp: "Partizip II", inf: "Infinitiv" } }],
    AN: [{ title: "", cells: /^AN\.(pos|comp|sup)$/, row: 1, col: null, rows: { pos: "Positiv", comp: "Komparativ", sup: "Superlativ" } },
         { title: "stark (ohne Artikel)", cells: /^AN\.pos\.strong\.\w+\.\w+$/, row: 3, col: 4, rows: { nom: "Nom.", acc: "Akk.", dat: "Dat.", gen: "Gen." }, cols: G4 },
         { title: "gemischt (ein / kein / mein)", cells: /^AN\.pos\.mixed\.\w+\.\w+$/, row: 3, col: 4, rows: { nom: "Nom.", acc: "Akk.", dat: "Dat.", gen: "Gen." }, cols: G4 },
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

// what a form is, from the cells it fills, in the layouts' words: V.past.1sg ... V.past.3pl -> "past"; V.present.3sg ->
// "present · he/she/it"; a cell no layout names keeps its parts (N.dat.pl -> "dat · pl"); short cells of the forms index
// (pl) are read with the part of speech in front (N.pl)
export function cellsLabel(lang, pos, cells, most = 3) {
  const groups = new Map();                                   // (title · column -> its rows' labels)
  for (const cell of cells) {
    if (!cell || cell === "form") continue;
    const c = /^[A-Z]+\./.test(cell) ? cell : `${pos}.${cell}`, seg = c.split(".");
    const b = (LAYOUTS[lang]?.[pos] ?? []).find((x) => x.cells.test(c));
    if (!b) { const k = seg.slice(1).join(" · "); groups.set(k, groups.get(k) ?? new Set()); continue; }
    const key = (i) => (b.whole ? c : seg[i]), col = b.col == null ? "" : b.cols?.[key(b.col)] ?? key(b.col);
    const k = [b.title, col].filter(Boolean).join(" · "), row = b.rows?.[key(b.row)] ?? key(b.row);
    const g = groups.get(k) ?? groups.set(k, new Set()).get(k);
    g.add(row); g.all = new Set(Object.values(b.rows ?? {})).size;
  }
  const out = [...groups].map(([k, rows]) => (!k ? [...rows].join(" / ") : rows.size && rows.size < rows.all ? `${k} · ${[...rows].join(" / ")}` : k));
  return out.slice(0, most).join("; ") + (out.length > most ? "; …" : "");
}
