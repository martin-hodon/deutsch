// EVERY FORM A LANGUAGE'S DICTIONARY KNOWS -> its entries: the word itself, its plural, its given forms, its paradigm
// forms (engine/paradigm.js; a separable verb's finite part alone is left out), in German the article forms (den, dem,
// einen ... -> der / die / das / ein), and the personal pronouns' forms from the realizer's own data -- the `pron` lines
// of <lang>/rules/neutral.txt (I/me/my/mine/myself, yo/me/me/mi/mí/me, 我/我的) and, in German, the pron.* cells of
// de/rules/morphology.txt (mich, mir, ihm ...) -> the P entry of the base pronoun. One index, built once per language,
// shared by the reading page (the word under the mouse) and the dictionary (dem finds der, sind sein, them they).
//   await formsIndex(d, lang) -> Map: folded form -> [{ e, cell, cells, ipa }]   (cell: the first -- present.3sg, pl, dat.m,
//   pron.1sg.acc ...; cells: every cell a form folded alike fills, with that form: ran -> { cell: V.past.1sg, form: ran } ...,
//   läuft and lauft both under lauft)
import { loadParadigms } from "./paradigm.js";
import * as DE from "../de/morph.js";

export const fold = (s) => s.toLocaleLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

export async function formsIndex(d, lang) {
  if (d.index) return d.index;
  d.pd ??= await loadParadigms(lang, { morph: d.morph, nouns: d.entries });
  const index = new Map();
  // (a form's sound, where it is known: the dictionary's formsIpa beside its forms, a German plural's by de/morph.js;
  //  a cell from the paradigm names the form -- present.3sg -- over a bare "form")
  const add = (form, e, cell = "", ipa = "") => {
    if (typeof form !== "string" || !form) return;
    const k = fold(form), list = index.get(k) ?? index.set(k, []).get(k), have = list.find((x) => x.e === e);
    if (!have) list.push({ e, cell, cells: cell ? [{ cell, form }] : [], ipa });
    else { if (have.cell === "form" && cell && cell !== "form") have.cell = cell; if (cell && !have.cells.some((c) => c.cell === cell && c.form === form)) have.cells.push({ cell, form }); if (!have.ipa && ipa) have.ipa = ipa; }
  };
  for (const e of d.entries) {
    add(e.word, e, "", e.ipa);
    for (const p of (e.plural ?? "").split("/")) if (p && p !== "-" && p !== "PL") add(p, e, "pl", lang === "de" ? DE.pluralIPA(e) : "");
    const fi = (e.formsIpa ?? "").split(/[\/,]/);
    (e.forms ?? "").split(/[\/,]/).forEach((f, i) => add(f.trim(), e, "form", (fi[i] ?? "").trim()));
    if (/^(V|N|AN)$/.test(e.pos) && !e.word.includes(" ")) { let fs = []; try { fs = d.pd.forms(e); } catch { fs = []; } for (const f of fs) if (f.shape !== "split") add(f.form, e, f.cell); }
  }
  const base = (w, pos) => d.entries.find((e) => e.pos === pos && fold(e.word) === fold(w));
  if (lang === "de") {   // the article forms (den, dem, des, einen ...) point at the dictionary's der / die / das / ein
    for (const [kind, b] of [["def", null], ["indef", "ein"]]) for (const k of ["nom", "acc", "dat", "gen"]) for (const g of ["m", "f", "n", "pl"]) {
      const f = DE.det(kind, k, g)?.w, e = base(b ?? DE.det("def", "nom", g)?.w ?? "der", "ART");
      if (f && e) add(f, e, `${k}.${g}`);
    }
    for (const who of ["1sg", "2sg", "3sg.m", "3sg.f", "3sg.n", "1pl", "2pl", "3pl"]) {   // mich, mir, ihn, ihm, uns, euch, ihnen
      const e = base(DE.pron(who, "nom")?.w ?? "", "P");
      if (e) for (const k of ["acc", "dat"]) { const c = DE.pron(who, k); if (c?.w) add(c.w, e, `pron.${who}.${k}`, c.ipa ?? ""); }
    }
  }
  // the closed words' forms of the realizer's data (<lang>/rules/neutral.txt): `pron 1sg = I/me/my/mine/myself`,
  // `det this = este/esta/estos/estas`, `wh who = wer/wen/wem` -- each form onto the entry of the first form that is a word
  const neutral = await fetch(`${lang}/rules/neutral.txt`).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  const closed = (w) => d.entries.find((e) => /^(P|ART|NUM|AV|PRE|CON|PAR)$/.test(e.pos) && fold(e.word) === fold(w));
  for (const m of neutral.matchAll(/^(pron|det|wh) (\S+) = (.+)$/gm)) {
    const forms = m[3].split(/[\/,]/).map((x) => x.trim()).filter((x) => x && !/^\d+$/.test(x)), e = forms.map(closed).find(Boolean);
    if (e) for (const f of forms) if (!index.get(fold(f))?.some((x) => x.e === e)) add(f, e, `${m[1]}.${m[2]}`);
  }
  // pronouns and determiners declined like adjectives (Slavic: który, этот, свой; Romance: questo questa questi, suo sua suoi)
  if (lang === "pl" || lang === "ru") for (const e of d.entries) if (e.pos === "P" && !e.word.includes(" ") && /[yiйя]$/.test(e.word)) { let fs = []; try { fs = d.pd.forms({ ...e, pos: "AN" }); } catch { fs = []; } for (const f of fs) if (f.shape !== "split") add(f.form, e, f.cell); }
  if (/^(es|it|fr)$/.test(lang)) {
    const M = await import(`../${lang}/morph.js`).catch(() => null);
    if (M?.adjForm) for (const e of d.entries) if (e.pos === "P" && !e.word.includes(" ") && (lang === "fr" || /o$/.test(e.word))) for (const [g, pl, c] of [["f", false, "f"], ["m", true, "pl"], ["f", true, "f.pl"]]) { let f = null; try { f = M.adjForm(e, g, pl); } catch { f = null; } if (f && f !== e.word) add(f, e, c); }
    if (lang === "it" && M?.contract) for (const prep of ["di", "a", "da", "in", "su", "con"]) for (const art of ["il", "lo", "la", "l'", "i", "gli", "le"]) { const c = M.contract(prep, art), e = base(prep, "PRE"); if (e && !c.includes(" ")) add(c, e, `${prep} + ${art}`); }
  }
  for (const [c, w] of Object.entries(CONTRACTIONS[lang] ?? {})) { const e = base(w.split(" ")[0], "PRE") ?? closed(w.split(" ")[0]); if (e) add(c, e, w); }
  if (lang === "de") {
    for (const prep of ["an", "in", "zu", "bei", "von", "auf", "für", "um", "durch", "über", "unter", "vor", "hinter"]) for (const art of ["dem", "der", "das", "den"]) { const c = DE.contraction(prep, art), e = base(prep, "PRE"); if (c?.w && e) add(c.w, e, `${prep} + ${art}`, c.ipa ?? ""); }
    const stems = { "der-word": ["dies", "jed", "welch", "jen", "manch", "solch"], ein: ["kein", "mein", "dein", "sein", "ihr", "unser", "euer", "Ihr"] };
    for (const [kind, names] of Object.entries(stems)) for (const name of names) {
      const e = closed(name + (kind === "der-word" ? "er" : "")) ?? closed(name);
      if (!e) continue;
      for (const k of ["nom", "acc", "dat", "gen"]) for (const g of ["m", "f", "n", "pl"]) { let c = null; try { c = DE.det(kind === "ein" ? (name === "kein" ? "kein" : "poss") : kind, k, g, name); } catch { c = null; } if (c?.w) add(c.w, e, `${k}.${g}`, c.ipa ?? ""); }
    }
  }
  return (d.index = index);
}

// elided and contracted closed words -> the word they are: the reading page cuts a token at such an apostrophe (d'un:
// d' + un), the dictionary finds the word (c' -> ce, au -> à)
export const ELISIONS = {
  fr: { "d'": "de", "l'": "le", "qu'": "que", "n'": "ne", "c'": "ce", "j'": "je", "s'": "se", "m'": "me", "t'": "te", "jusqu'": "jusque", "lorsqu'": "lorsque", "puisqu'": "puisque" },
  it: { "l'": "il", "un'": "un", "d'": "di", "c'": "ci", "dell'": "di", "all'": "a", "dall'": "da", "nell'": "in", "sull'": "su", "quest'": "questo", "quell'": "quello", "m'": "mi", "t'": "ti", "s'": "si", "v'": "vi", "n'": "ne" },
};
const CONTRACTIONS = { fr: { ...ELISIONS.fr, au: "à le", aux: "à les", du: "de le", des: "de les" }, it: ELISIONS.it, es: { del: "de el", al: "a el" } };
