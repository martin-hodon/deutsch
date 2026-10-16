// SPANISH MORPHOLOGY BY RULE: a verb's forms in every tense the realizer says (es/realize.js) and the trainer drills --
// the regular -ar / -er / -ir endings, a model's stem change (es/README.md: e>ie o>ue u>ue i>ie e>i c>zc i>í u>ú), the
// spelling's changes (busqué, pagué, empecé, cojo, sigo, leyó), and an irregular verb's own forms from
// es/rules/irregular.txt (`tener : like ... | pres tengo tienes ... | pretstem tuv | futstem tendr | pp ...`; a verb's
// stem change there too: `pensar : model e>ie`).
//
//   const es = await loadMorphology("es/rules/irregular.txt")
//   es.conj("volver", "pres", 0, { model: "o>ue" }) -> "vuelvo"      persons 0..5: yo tú él nosotros vosotros ellos
//   tenses: pres pret impf fut cond subj subjimpf imp (tú, vosotros: 1, 4) pp ger

const END = {
  ar: { pres: ["o", "as", "a", "amos", "áis", "an"], pret: ["é", "aste", "ó", "amos", "asteis", "aron"], impf: ["aba", "abas", "aba", "ábamos", "abais", "aban"], subj: ["e", "es", "e", "emos", "éis", "en"], subjimpf: ["ara", "aras", "ara", "áramos", "arais", "aran"] },
  er: { pres: ["o", "es", "e", "emos", "éis", "en"], pret: ["í", "iste", "ió", "imos", "isteis", "ieron"], impf: ["ía", "ías", "ía", "íamos", "íais", "ían"], subj: ["a", "as", "a", "amos", "áis", "an"], subjimpf: ["iera", "ieras", "iera", "iéramos", "ierais", "ieran"] },
  ir: { pres: ["o", "es", "e", "imos", "ís", "en"], pret: ["í", "iste", "ió", "imos", "isteis", "ieron"], impf: ["ía", "ías", "ía", "íamos", "íais", "ían"], subj: ["a", "as", "a", "amos", "áis", "an"], subjimpf: ["iera", "ieras", "iera", "iéramos", "ierais", "ieran"] },
};
const FUT = ["é", "ás", "á", "emos", "éis", "án"], COND = ["ía", "ías", "ía", "íamos", "íais", "ían"];
// (a strong preterite's endings: tuve tuviste tuvo tuvimos tuvisteis tuvieron; dije ... dijeron after j)
const STRONG = ["e", "iste", "o", "imos", "isteis", "ieron"];

// the stem's last e / o / u / i changed: volv -> vuelv, ped -> pid, jug -> jueg
const change = (stem, from, to) => { const i = stem.lastIndexOf(from); return i < 0 ? stem : stem.slice(0, i) + to + stem.slice(i + 1); };
// (the spelling keeps the sound: an -ar verb before e -- busqué, pagué, empecé --, an -er / -ir verb before a / o --
//  cojo, sigo, venzo)
function spell(stem, end, cls) {
  if (cls === "ar" && /^[eé]/.test(end)) return stem.replace(/c$/, "qu").replace(/g$/, "gu").replace(/z$/, "c") + end;
  if (cls !== "ar" && /^[aoá]/.test(end)) return (/gu$/.test(stem) ? stem.slice(0, -1) : stem.replace(/g$/, "j").replace(/([^z])c$/, "$1z")) + end;
  return stem + end;
}
const ACUTE = { a: "á", e: "é", i: "í", o: "ó", u: "ú" };

// AGREEMENT (the realizer's and the trainer's, engine/paradigm.js): a noun's plural, an adjective's and a participle's
// form for a gender (m, f) and number
export const plural = (n) => (!n.plural || n.plural === "-" || n.plural === "PL" ? n.word : n.plural);
export const adjForm = (a, g, pl) => {   // rojo, roja, rojos, rojas; verde, verdes; feliz, felices
  if ((a.word ?? a).includes(" ")) return a.word ?? a;
  const w = a.word ?? a, f = a.feminine || (/o$/.test(w) ? w.slice(0, -1) + "a" : w), s = g === "f" ? f : w;
  return pl ? (/[aeiouáéó]$/.test(s) ? s + "s" : /z$/.test(s) ? s.slice(0, -1) + "ces" : s + "es") : s;
};
export const ppForm = (pp, g, pl) => (/o$/.test(pp) ? pp.slice(0, -1) + (g === "f" ? "a" : "o") + (pl ? "s" : "") : pp);

export async function loadMorphology(url) {
  const irr = new Map();   // verb -> { tense: [forms] | form, like, pretstem, futstem }
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
  // a prefixed verb is its base's: mantener like tener -> mantengo; (like = the base, the prefix the rest)
  const own = (verb) => {
    const v = irr.get(verb);
    if (!v?.like) return v ?? null;
    const base = own(v.like), pre = verb.slice(0, verb.length - v.like.length);
    if (!base) return v;
    const add = (x) => (Array.isArray(x) ? x.map((f) => (f === "-" ? f : pre + f)) : typeof x === "string" ? pre + x : x);
    return { ...Object.fromEntries(Object.entries(base).map(([k, x]) => [k, k === "model" ? x : add(x)])), ...Object.fromEntries(Object.entries(v).filter(([k]) => k !== "like")) };
  };

  // one form: the verb (an infinitive; a reflexive one without its -se), the tense, the person 0..5
  // (regular: by the regular endings alone -- the trainer's wrong option, tení for tuve)
  function conj(verb, tense, p = 2, { model = "", pp = "", regular = false } = {}) {   // (pp: the dictionary's irregular participle, vuelto)
    const inf = verb.replace(/se$/, ""), cls = inf.slice(-2).replace("í", "i"), stem = inf.slice(0, -2), ir = regular ? {} : own(inf) ?? {};   // (oír, reír: -ir)
    if (regular) { model = ""; pp = ""; }
    if ((!model || model === "irr") && ir.model) model = ir.model;   // (the table's stem change: pensar : model e>ie)
    const given = ir[tense];
    if (Array.isArray(given)) return given[p];
    if (typeof given === "string") return given;
    if (tense === "pp" && pp) return pp;
    if (tense === "pp") return ({ ar: stem + "ado" }[cls]) ?? (/[aeo]$/.test(stem) ? stem + "ído" : stem + "ido");
    if (tense === "ger") {
      const st = model === "e>i" || (cls === "ir" && model === "e>ie") ? change(stem, "e", "i") : cls === "ir" && model === "o>ue" ? change(stem, "o", "u") : stem;
      return cls === "ar" ? st + "ando" : /[aeo]$|[^gq]u$/.test(st) ? st + "yendo" : st + "iendo";
    }
    if (tense === "fut" || tense === "cond") return (ir.futstem ?? inf) + (tense === "fut" ? FUT : COND)[p];
    if (tense === "imp") {   // (affirmative tú and vosotros; the others are the present subjunctive's)
      if (p === 1) return ir.imptu ?? conj(verb, "pres", 2, { model, regular });
      if (p === 4) return inf.slice(0, -1) + "d";
      return conj(verb, "subj", p, { model, regular });
    }
    if (tense === "subjimpf" || (tense === "pret" && ir.pretstem)) {
      if (ir.pretstem) {
        const j = /j$/.test(ir.pretstem);
        if (tense === "pret") return ir.pretstem + (j && p === 5 ? "eron" : STRONG[p]);
        return ir.pretstem + (j ? ["era", "eras", "era", "éramos", "erais", "eran"] : END.er.subjimpf)[p];
      }
      // (the subjunctive's stem: the preterite's 3rd plural -- pidieron -> pidiera, habláramos)
      const base = conj(verb, "pret", 5, { model, regular }).slice(0, -3);
      return (p === 3 ? base.slice(0, -1) + ACUTE[base.slice(-1)] : base) + ["ra", "ras", "ra", "ramos", "rais", "ran"][p];
    }
    const e = END[cls]?.[tense];
    if (!e) return inf;
    // the stem's change: the stressed persons (1 2 3 6) in the present and its subjunctive; -ir verbs also 4 5 of
    // the subjunctive and 3 6 of the preterite (pidió, durmieron)
    let st = stem;
    const stressed = p === 0 || p === 1 || p === 2 || p === 5;
    if ((tense === "pres" || tense === "subj") && stressed) {
      if (model === "e>ie") st = change(stem, "e", "ie");
      else if (model === "o>ue") st = /^o/.test(stem) ? "hue" + stem.slice(1) : change(stem, "o", "ue");
      else if (model === "u>ue") st = change(stem, "u", "ue");
      else if (model === "i>ie") st = change(stem, "i", "ie");
      else if (model === "e>i") st = change(stem, "e", "i");
      else if (model === "i>í") st = change(stem, "i", "í");   // (aíslo, amplío)
      else if (model === "u>ú") st = change(stem, "u", "ú");   // (continúo)
    } else if (cls === "ir" && ((tense === "subj" && !stressed) || (tense === "pret" && (p === 2 || p === 5)))) {
      if (model === "e>ie" || model === "e>i") st = change(stem, "e", "i");
      else if (model === "o>ue") st = change(stem, "o", "u");
    }
    if (model === "c>zc" && ((tense === "pres" && p === 0) || tense === "subj")) st = stem.slice(0, -1) + "zc";
    if (ir[`${tense}1`] && p === 0) return ir[`${tense}1`];                                   // (pres1 hago: only the yo form)
    if (ir.pres1 && tense === "subj") return ir.pres1.slice(0, -1) + END[cls].subj[p];          // (haga, tenga: from hago, tengo)
    // (a vowel before -ió / -ieron: leyó, leyeron)
    if (tense === "pret" && /[aeo]$/.test(st) && cls !== "ar") return st + ["í", "íste", "yó", "ímos", "ísteis", "yeron"][p];   // (leí, leíste, leyó)
    return spell(st, e[p], cls);
  }
  return { conj, irregular: (v) => own(v.replace(/se$/, "")) };
}
