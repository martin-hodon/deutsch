// PARADIGMS: a word's forms in every language, each in its CELL -- what the forms exercise (engine/forms.js) leaves out
// and offers wrongly, what a word's example sentences find it by. The forms come from each language's own morphology
// (de/morph.js, en/morph.js, es/morph.js, fr/morph.js -- the realizers' rules), nothing is made here twice.
//
//   const pd = await loadParadigms("es", { morph })        (morph: es/fr loadMorphology's -- their irregular verbs)
//   pd.forms(entry)    -> [{ form, cell, shape }]   every form the word has
//   pd.regular(entry)  -> [{ form, cell }]          the forms the regular rule alone would make, where they differ:
//                                                   kommte for kam, gekommt, childs, tenido for tuvo -- wrong options
//   pd.articles        -> [{ form, cell }]          the articles (German, Spanish, French)
//
// CELLS: part of speech . features
//   V.<tense>.<person>   person 1sg 2sg 3sg 1pl 2pl 3pl; tenses German present past subj1 subj2, English present
//                        past, Spanish pres pret impf fut cond subj subjimpf, French pres impf fut cond subj, Italian
//                        pres impf fut cond subj subjimpf, Russian and Polish pres (the imperfective), fut (the
//                        perfective partner's present); V.past.<g> and V.pfpast.<g> (m f n pl) the past by gender
//                        (Polish by gender and person: V.past.<g>.<person>, V.cond.<g>.<person>), V.imp.<num>, V.pfinf
//   N.<case>.<num>       Russian: nom gen dat acc ins prep; Polish nom gen dat acc ins loc (an animate noun's accusative
//                        beside the inanimate one; Polish: a man's plural)
//   AN.<case>.<g>        Russian: AN.gen.f -> новой; Polish AN.gen.f -> nowej
//   N.cl                 Chinese: the noun's measure word (本); V.asp.<le|guo|zhe> the aspect particles
//   V.pp V.inf V.ger (V.ing: English)
//   N.sg N.pl            (German also N.acc.sg N.dat.sg N.gen.sg N.dat.pl: where the case changes the noun)
//   AN.pos AN.comp AN.sup              (the plain adjective, its degrees: German predicative, English)
//   AN.<degree>.<decl>.<case>.<g>      (German before a noun: AN.pos.weak.dat.m -> großen)
//   AN.<g>.<num>                       (Spanish, French: AN.f.pl -> rojas)
//   ART.<kind>.<case>.<g> (German)     ART.<kind>.<g>.<num> (Spanish, French)
// shape: German's finite verb with its prefix apart ("split": ruft ... an) or joined (anruft) -- a wrong option has the
// right one's shape.
import * as DE from "../de/morph.js";
import { wrongPlurals, countRules } from "../de/plurals.js";
import * as EN from "../en/morph.js";
import * as ES from "../es/morph.js";
import * as FR from "../fr/morph.js";
import * as IT from "../it/morph.js";
import * as ZH from "../zh/morph.js";

const P6 = ["1sg", "2sg", "3sg", "1pl", "2pl", "3pl"];
const TENSES = { es: ["pres", "pret", "impf", "fut", "cond", "subj", "subjimpf"], fr: ["pres", "impf", "fut", "cond", "subj"], it: ["pres", "impf", "fut", "cond", "subj", "subjimpf"] };
const DE_TENSES = ["present", "past", "subj1", "subj2"], CASES = ["nom", "acc", "dat", "gen"], GS = ["m", "f", "n", "pl"];
const AGREE = { es: ES.adjForm, fr: FR.adjForm, it: IT.adjForm }, PLURAL = { es: ES.plural, fr: FR.plural, it: IT.plural };
const SLAVIC = new Set(["ru", "pl"]);   // (the case languages: ru/morph.js and pl/morph.js share one shape)

export async function loadParadigms(lang, { morph = null, base = "", nouns = [] } = {}) {
  // (the language's closed words: its articles, English's comparatives -- <lang>/rules/neutral.txt)
  const neutral = lang === "de" ? "" : await (await fetch(`${base}${lang}/rules/neutral.txt`)).text().catch(() => "");
  const dets = Object.fromEntries([...neutral.matchAll(/^det (def|indef) = (.+)$/gm)].map((m) => [m[1], m[2].trim().split("/")]));
  const comp = Object.fromEntries([...(neutral.match(/^list comp = (.+)$/m)?.[1] ?? "").split("|")].filter(Boolean).map((x) => x.split(":")));
  const plain = (e) => ({ ...e, forms: "", formsIpa: "", model: "", comparison: "" });   // (the word as the rules alone see it)
  const RU_G = ["m", "f", "n", "pl"], RU_CASES = ["nom", "gen", "dat", "acc", "ins", "prep"], PL_CASES = ["nom", "gen", "dat", "acc", "ins", "loc"];
  let pluralCounts = null;   // (German: how often each plural rule is right, by noun class -- de/plurals.js)

  function forms(e) {
    const out = [], add = (form, cell, shape = "") => { if (form) out.push({ form, cell, shape }); };
    const verb = e.word.replace(/^(sich |se |s')/, "").split(" ")[0];   // (English: give up -> give)
    if (lang === "de") {
      if (e.pos === "V") {
        for (const t of DE_TENSES) for (const p of P6) {
          const f = DE.finite(e, t, p);
          if (!f) continue;
          add(f.w, `V.${t}.${p}`, f.prefix ? "split" : "");
          if (f.prefix) add(DE.joined(f).w, `V.${t}.${p}`, "joined");
        }
        add(DE.participle(e).w, "V.pp"); add(DE.infinitive(e).w, "V.inf");
      } else if (e.pos === "N" && !DE.isAdjectival(e)) {
        add(e.word, "N.sg");
        for (const k of ["acc", "dat", "gen"]) { const f = DE.noun(e, k, "sg").w; if (f !== e.word) add(f, `N.${k}.sg`); }
        if (e.plural && e.plural !== "-") { const pl = DE.noun(e, "nom", "pl").w, dat = DE.noun(e, "dat", "pl").w; add(pl, "N.pl"); if (dat !== pl) add(dat, "N.dat.pl"); }
      } else if (e.pos === "AN") {
        add(e.word, "AN.pos"); add(DE.degree(e, "comp").w, "AN.comp");
        for (const deg of [null, "comp", "sup"]) for (const decl of ["strong", "weak", "mixed"]) for (const k of CASES) for (const g of GS)
          add(DE.adj(e, decl, k, g, deg).w, `AN.${deg ?? "pos"}.${decl}.${k}.${g}`);
      }
    } else if (lang === "en") {
      const h = { ...e, word: verb };
      if (e.pos === "V") {
        for (const p of P6) { add(EN.verbForm(h, "s", p), `V.present.${p}`); add(EN.verbForm(h, "past", p), `V.past.${p}`); }
        add(EN.verbForm(h, "pp"), "V.pp"); add(EN.verbForm(h, "ing"), "V.ing"); add(verb, "V.inf");
      } else if (e.pos === "N") { add(e.word, "N.sg"); if (e.plural && e.plural !== "-" && e.plural !== "PL") add(EN.plural(e), "N.pl"); }
      else if (e.pos === "AN") { add(e.word, "AN.pos"); add(EN.compare(e, "comp", comp), "AN.comp"); add(EN.compare(e, "sup", comp), "AN.sup"); }
    } else if (SLAVIC.has(lang)) {
      if (!morph) return out;
      const PL = lang === "pl", CS = PL ? PL_CASES : RU_CASES, bareV = PL ? e.word.replace(/ się$/, "") : e.word, refl = PL && / się$/.test(e.word);
      // (Polish: the past and the conditional by gender and person -- czytałem, czytałaś; Russian: the past by gender)
      const pastCells = (verb, cell) => { for (const g of RU_G) { if (PL) for (let p = 0; p < 3; p++) { add(morph.conj(verb, cell === "V.cond" ? "cond" : "past", p, { g, pl: g === "pl" }), `${cell}.${g}.${P6[g === "pl" ? p + 3 : p]}`); } else add(morph.conj(verb, "past", 0, { g, pl: g === "pl" }), `${cell}.${g}`); } };
      if (e.pos === "V" && !bareV.includes(" ")) {
        const se = morph.endStressed(e);
        for (let p = 0; p < 6; p++) add(morph.conj(e.word, "pres", p, { stressedEnd: se }), `V.pres.${P6[p]}`);
        pastCells(e.word, "V.past");
        if (PL) pastCells(e.word, "V.cond");
        add(morph.conj(e.word, "imp", 0, { stressedEnd: se }), "V.imp.sg"); add(morph.conj(e.word, "imp", 0, { pl: true, stressedEnd: se }), "V.imp.pl"); add(e.word, "V.inf");
        const pf = e.forms && (PL ? e.forms.replace(/ się$/, "") : e.forms);
        if (pf && !pf.includes(" ")) {   // (the perfective partner: its present is the future, its past the single event)
          for (let p = 0; p < 6; p++) add(morph.conj(e.forms, "pres", p), `V.fut.${P6[p]}`);
          pastCells(e.forms, "V.pfpast");
          add(e.forms, "V.pfinf");
        }
      } else if (e.pos === "N" && !e.word.includes(" ")) {
        for (const pl of [false, true]) {
          if (pl && (!e.plural || e.plural === "-")) continue;
          for (const k of CS) { const f = morph.noun(e, k, pl), a = morph.noun(e, k, pl, { animate: true, person: true }); add(f, `N.${k}.${pl ? "pl" : "sg"}`); if (a !== f) add(a, `N.${k}.${pl ? "pl" : "sg"}`); }
        }
      } else if (e.pos === "AN" && (PL ? /[yi]$/.test(e.word) && !e.word.includes(" ") : /(ый|ой|ий)$/.test(e.word))) {
        for (const g of RU_G) for (const k of CS) { const f = morph.adj(e, k, g, g === "pl"), a = morph.adj(e, k, g, g === "pl", { animate: true, person: true }); add(f, `AN.${k}.${g}`); if (a !== f) add(a, `AN.${k}.${g}`); }
        add(morph.compare(e), "AN.comp");
      }
    } else if (lang === "zh") {
      if (e.pos === "N" && e.classifier) add(e.classifier, "N.cl");
      if (e.pos === "V") for (const [p, c] of [["了", "le"], ["过", "guo"], ["着", "zhe"]]) add(p, `V.asp.${c}`);
    } else {
      if (e.pos === "V" && morph) {
        for (const t of TENSES[lang]) for (let p = 0; p < 6; p++) add(morph.conj(verb, t, p, { model: e.model, pp: e.forms }), `V.${t}.${P6[p]}`);
        add(morph.conj(verb, "pp", 0, { model: e.model, pp: e.forms }), "V.pp"); add(morph.conj(verb, "ger", 0, { model: e.model }), "V.ger"); add(verb, "V.inf");
      } else if (e.pos === "N") { add(e.word, "N.sg"); if (e.plural && e.plural !== "-" && e.plural !== "PL") add(PLURAL[lang](e), "N.pl"); }
      else if (e.pos === "AN" && !e.word.includes(" ")) for (const g of ["m", "f"]) for (const pl of [false, true]) add(AGREE[lang](e, g, pl), `AN.${g}.${pl ? "pl" : "sg"}`);
    }
    return out;
  }

  // the wrong forms by the regular rule: a cell's form made as if the word had no forms of its own -- those that are not
  // the word's own form in that cell
  function regular(e) {
    const own = new Set(forms(e).map((f) => f.cell + "|" + f.form));
    return made(e).filter((f) => f.form && !own.has(f.cell + "|" + f.form));
  }
  function made(e) {
    const out = [];
    if (e.pos === "N" && lang === "de" && e.plural && e.plural !== "-" && e.plural !== "PL") {
      pluralCounts ??= countRules(nouns.filter((n) => n.pos === "N" && n.plural && n.plural !== "-" && n.plural !== "PL"));
      for (const [form] of [...wrongPlurals(e, pluralCounts)].sort((a, b) => b[1] - a[1])) out.push({ form, cell: "N.pl" });
      return out;
    }
    if (lang === "zh") {   // (a noun's other measure words -- the common ones; a verb's other particles are its own forms)
      if (e.pos === "N" && e.classifier && morph) for (const c of morph.CLASSIFIERS.slice(0, 12)) if (c !== e.classifier) out.push({ form: c, cell: "N.cl" });
      return out;
    }
    if (SLAVIC.has(lang)) {   // (the forms the rules alone make of the word: an irregular verb's regular present and past)
      const PL = lang === "pl", bareV = PL ? e.word.replace(/ się$/, "") : e.word;
      if (!morph || e.pos !== "V" || bareV.includes(" ")) return out;
      const pastCells = (verb, cell) => { for (const g of RU_G) { if (PL) for (let p = 0; p < 3; p++) out.push({ form: morph.conj(verb, "past", p, { g, pl: g === "pl", regular: true }), cell: `${cell}.${g}.${P6[g === "pl" ? p + 3 : p]}` }); else out.push({ form: morph.conj(verb, "past", 0, { g, pl: g === "pl", regular: true }), cell: `${cell}.${g}` }); } };
      for (let p = 0; p < 6; p++) out.push({ form: morph.conj(e.word, "pres", p, { regular: true }), cell: `V.pres.${P6[p]}` });
      pastCells(e.word, "V.past");
      const pf = e.forms && (PL ? e.forms.replace(/ się$/, "") : e.forms);
      if (pf && !pf.includes(" ")) { for (let p = 0; p < 6; p++) out.push({ form: morph.conj(e.forms, "pres", p, { regular: true }), cell: `V.fut.${P6[p]}` }); pastCells(e.forms, "V.pfpast"); }
      return out;
    }
    if (e.pos === "N" && e.plural && e.plural !== "-" && e.plural !== "PL") {   // (the other ways a plural is made: childs; rojoes)
      const w = e.word, ways = lang === "en" ? [EN.regular(w, "s"), w + "s"] : lang === "es" ? [w + "s", w + "es", w.replace(/z$/, "ces")] : lang === "it" ? [w.replace(/[oe]$/, "i"), w.replace(/a$/, "e"), w.replace(/[oa]$/, "e"), w + "i"] : [w + "s", w + "x", w.replace(/al$/, "aux")];
      for (const form of new Set(ways)) out.push({ form, cell: "N.pl" });
      return out;
    }
    if (e.pos === "AN" && lang === "en") { const c = EN.compare(e, "comp", comp); out.push({ form: / /.test(c) ? e.word + "er" : "more " + e.word, cell: "AN.comp" }); return out; }
    if (e.pos === "AN" && lang === "de") { out.push({ form: DE.degree(plain(e), "comp").w, cell: "AN.comp" }); return out; }
    if (e.pos !== "V") return out;
    if (lang === "es" || lang === "fr" || lang === "it") {
      if (!morph) return out;
      const verb = e.word.replace(/^(se |s')/, "").replace(/se$/, "").replace(/rsi$/, "re").split(" ")[0];
      for (const t of [...TENSES[lang], "pp"]) for (let p = 0; p < (t === "pp" ? 1 : 6); p++) out.push({ form: morph.conj(verb, t, p, { regular: true }), cell: t === "pp" ? "V.pp" : `V.${t}.${P6[p]}` });
      return out;
    }
    return forms(plain(e)).filter((f) => f.cell.startsWith("V."));   // (German, English: the forms without the given ones)
  }

  const articles = [];
  if (lang === "de") for (const kind of ["def", "indef", "kein"]) for (const k of CASES) for (const g of GS) { const d = DE.det(kind, k, g); if (d) articles.push({ form: d.w, cell: `ART.${kind}.${k}.${g}` }); }
  for (const [kind, fs] of Object.entries(dets)) fs.forEach((form, i) => articles.push({ form, cell: `ART.${kind}.${i % 2 ? "f" : "m"}.${i > 1 ? "pl" : "sg"}` }));
  return { forms, regular, articles };
}
