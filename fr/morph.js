// FRENCH MORPHOLOGY BY RULE: a verb's forms in the tenses the realizer says (fr/realize.js) and the trainer drills --
// the regular groups (-er parler, -ir finir, -re vendre), an -er verb's stem change (fr/rules/irregular.txt `model`:
// è achète, ll appelle, tt jette, é>è préfère, y>i emploie), the spelling before a / o (mangeons, commençons), and an
// irregular verb's own forms from fr/rules/irregular.txt (`venir : pres viens viens vient venons venez viennent |
// futstem viendr | subj vienne viennes vienne venions veniez viennent | pp venu`, `devenir : like venir`).
//
//   const fr = await loadMorphology("fr/rules/irregular.txt")
//   fr.conj("acheter", "pres", 0) -> "achète"      persons 0..5: je tu il nous vous ils
//   tenses: pres impf fut cond subj imp (tu, nous, vous: 1, 3, 4) pp ger (the participe présent)

const END = {
  er: { pres: ["e", "es", "e", "ons", "ez", "ent"], pp: "é" },
  ir: { pres: ["is", "is", "it", "issons", "issez", "issent"], pp: "i" },
  re: { pres: ["s", "s", "", "ons", "ez", "ent"], pp: "u" },
};
const IMPF = ["ais", "ais", "ait", "ions", "iez", "aient"], FUT = ["ai", "as", "a", "ons", "ez", "ont"], COND = IMPF;
const SUBJ = ["e", "es", "e", "ions", "iez", "ent"];
const STRESSED = new Set([0, 1, 2, 5]);   // (je tu il ils: where -er stems change in the present and subjunctive)

// an -er stem before a stressed ending: achet -> achèt, appel -> appell, jet -> jett, préfér -> préfèr, emploi -> emploi
function changed(stem, model) {
  if (model === "è") return stem.replace(/e([^aeiouéè]+)$/, "è$1");
  if (model === "ll" || model === "tt") return stem + stem.slice(-1);
  if (model === "é>è") return stem.replace(/é([^aeiouéè]+)$/, "è$1");
  if (model === "y>i") return stem.replace(/y$/, "i");
  return stem;
}
// (the spelling keeps the sound before a / o: mange-ons, commenç-ons)
const keep = (stem, end) => (/^[aoâ]/.test(end) ? stem.replace(/g$/, "ge").replace(/c$/, "ç") : stem);

// AGREEMENT (the realizer's and the trainer's, engine/paradigm.js): a noun's plural, an adjective's and a participle's
// form for a gender (m, f) and number
export const plural = (n) => (!n.plural || n.plural === "-" || n.plural === "PL" ? n.word : n.plural);
export const adjForm = (a, g, pl) => {   // vert verte verts vertes; beau belle beaux belles; rouge rouges
  const w = a.word ?? a;
  if (w.includes(" ")) return w;
  const [mpl, fpl] = (a.comparison ?? "").split("/"), f = a.feminine || (/e$/.test(w) ? w : w + "e");
  if (pl) return g === "f" ? fpl || f + "s" : mpl || (/[sx]$/.test(w) ? w : /al$/.test(w) ? w.slice(0, -2) + "aux" : w + "s");
  return g === "f" ? f : w;
};
export const ppForm = (pp, g, pl) => (/[éiut]$|[ts]$/.test(pp) ? pp + (g === "f" ? "e" : "") + (pl && !/s$/.test(pp) ? "s" : "") : pp);

export async function loadMorphology(url) {
  const irr = new Map();
  const text = await (await fetch(url)).text().catch(() => "");
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const [verb, rest = ""] = s.split(/\s*:\s*/, 2), v = {};
    for (const part of rest.split("|").map((x) => x.trim()).filter(Boolean)) {
      const [k, ...forms] = part.split(/\s+/);
      v[k] = forms.length === 1 ? forms[0] : forms;
    }
    irr.set(verb, v);
  }
  // (a prefixed verb is its base's: devenir like venir -> deviens; the model is not prefixed)
  const own = (verb) => {
    const v = irr.get(verb);
    if (!v?.like) return v ?? null;
    const base = own(v.like), pre = verb.slice(0, verb.length - v.like.length);
    if (!base) return v;
    const add = (x) => (Array.isArray(x) ? x.map((f) => (f === "-" ? f : pre + f)) : typeof x === "string" ? pre + x : x);
    return { ...Object.fromEntries(Object.entries(base).map(([k, x]) => [k, k === "model" ? x : add(x)])), ...Object.fromEntries(Object.entries(v).filter(([k]) => k !== "like")) };
  };

  // one form: the infinitive (a reflexive one without se / s'), the tense, the person 0..5; regular: by the rules alone
  function conj(verb, tense, p = 2, { model = "", pp = "", regular = false } = {}) {
    const inf = verb.replace(/^(se |s')/, ""), ir = regular ? {} : own(inf) ?? {};
    if (regular) { model = ""; pp = ""; }
    if (!model && ir.model) model = ir.model;
    const cls = /er$/.test(inf) ? "er" : /ir$/.test(inf) ? "ir" : "re", stem = inf.slice(0, -2);
    const given = tense === "imp" ? null : ir[tense];   // (imp: the nous and vous commands, two forms -- below)
    if (Array.isArray(given)) return given[p];
    if (typeof given === "string") return given;
    if (tense === "pp") return pp || stem + END[cls].pp;
    const pres = (q) => conj(verb, "pres", q, { model, pp, regular });
    if (tense === "pres") {
      const e = END[cls].pres[p];
      return (cls === "er" && STRESSED.has(p) ? changed(stem, model) : keep(stem, e)) + e;
    }
    // (the imperfect and the participe présent from the nous form: finiss-ons -> finissais, mange-ons -> mangeais)
    const nous = (ir.impfstem ?? pres(3).replace(/ons$/, ""));
    if (tense === "impf") return keep(nous.replace(/e$/, "").replace(/ç$/, "c"), IMPF[p]) + IMPF[p];
    if (tense === "ger") return keep(nous.replace(/e$/, "").replace(/ç$/, "c"), "ant") + "ant";
    if (tense === "fut" || tense === "cond") {
      const fs = ir.futstem ?? (cls === "re" ? inf.slice(0, -1) : cls === "er" && model && model !== "é>è" ? changed(stem, model) + "er" : inf);
      return fs + (tense === "fut" ? FUT : COND)[p];
    }
    if (tense === "subj") {   // (from the ils form, nous / vous from the nous form: vienne, venions)
      if (ir.subjstem) return (p === 3 || p === 4 ? ir.subjstem2 ?? ir.subjstem : ir.subjstem) + SUBJ[p];
      return (p === 3 || p === 4 ? nous.replace(/e$/, "").replace(/ç$/, "c") : pres(5).replace(/ent$/, "")) + SUBJ[p];
    }
    if (tense === "imp") {   // (tu parle, finis; nous parlons; vous parlez)
      if (p === 1) return ir.imptu ?? (cls === "er" ? pres(0) : pres(1));
      return ir.imp?.[p === 3 ? 0 : 1] ?? pres(p);
    }
    return inf;
  }
  return { conj, irregular: (v) => own(v.replace(/^(se |s')/, "")) };
}
