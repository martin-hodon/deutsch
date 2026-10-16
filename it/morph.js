// ITALIAN MORPHOLOGY BY RULE: a verb's forms in every tense the realizer says (it/realize.js) and the trainer drills --
// the regular -are / -ere / -ire endings (an -ire verb with -isc- by its model, it/README.md), the spelling's changes
// (cerchi, paghi, cominci, studi), and an irregular verb's own forms from it/rules/irregular.txt
// (`avere : pres ho hai ha abbiamo avete hanno | futstem avr | pp avuto | pret ebbi avesti ebbe avemmo aveste ebbero`;
// a prefixed verb is its base's: `rifare : like fare`). The agreement: a noun's plural, an adjective's or participle's
// form by gender and number; the articles (il lo la l' i gli le; un uno una un') and their contractions with di a da
// in su (del, allo, dalla, nell', sui).
//
//   const it = await loadMorphology("it/rules/irregular.txt")
//   it.conj("parlare", "pres", 0) -> "parlo"      persons 0..5: io tu lui noi voi loro
//   tenses: pres impf fut cond subj subjimpf pret imp (tu noi voi: 1 3 4; Lei: 2 = the subjunctive's) pp ger
//   it.article("def", "m", false, "studente") -> "lo"      it.contract("di", "lo") -> "dello"

const END = {
  are: { pres: ["o", "i", "a", "iamo", "ate", "ano"], impf: ["avo", "avi", "ava", "avamo", "avate", "avano"], subj: ["i", "i", "i", "iamo", "iate", "ino"], subjimpf: ["assi", "assi", "asse", "assimo", "aste", "assero"], pret: ["ai", "asti", "ò", "ammo", "aste", "arono"] },
  ere: { pres: ["o", "i", "e", "iamo", "ete", "ono"], impf: ["evo", "evi", "eva", "evamo", "evate", "evano"], subj: ["a", "a", "a", "iamo", "iate", "ano"], subjimpf: ["essi", "essi", "esse", "essimo", "este", "essero"], pret: ["ei", "esti", "é", "emmo", "este", "erono"] },
  ire: { pres: ["o", "i", "e", "iamo", "ite", "ono"], impf: ["ivo", "ivi", "iva", "ivamo", "ivate", "ivano"], subj: ["a", "a", "a", "iamo", "iate", "ano"], subjimpf: ["issi", "issi", "isse", "issimo", "iste", "issero"], pret: ["ii", "isti", "ì", "immo", "iste", "irono"] },
};
const FUT = ["ò", "ai", "à", "emo", "ete", "anno"], COND = ["ei", "esti", "ebbe", "emmo", "este", "ebbero"];
// (a strong passato remoto -- ebbi, presi, scrissi --: the 1sg 3sg 3pl from its stem, the others regular)
const STRONG = ["i", null, "e", null, null, "ero"];

// the spelling keeps the sound: -care / -gare take an h before e and i (cerchi, pagherò); -ciare / -giare / -sciare and
// -iare drop their i before e and i (cominci, mangerò, studi)
function spell(stem, end) {
  if (/^[ei]/.test(end)) {
    if (/[cg]$/.test(stem)) return stem + "h" + end;
    if (/i$/.test(stem) && (/^i/.test(end) || /(ci|gi|sci)$/.test(stem))) return stem.slice(0, -1) + end;   // (studi, studierò; mangerò)
  }
  return stem + end;
}

// ---- AGREEMENT (the realizer's and the trainer's, engine/paradigm.js) --------------------------------------------------
export const plural = (n) => (!n.plural || n.plural === "-" || n.plural === "PL" ? n.word : n.plural);
// rosso rossa rossi rosse; grande grandi; simpatico simpatica simpatici simpatiche (the pairs given); bianco bianchi
// (-co / -go after a consonant: -chi / -ghi); blu, rosa: unchanged (no feminine, the word ends in u, or a given `-`)
export const adjForm = (a, g, pl) => {
  const w = a.word ?? a;
  if (w.includes(" ") || w.includes("'") || /[uàèéìòù]$/.test(w) || a.feminine === "-") return w;   // (blu, d'oro: invariable)
  const f = a.feminine || (/o$/.test(w) ? w.slice(0, -1) + "a" : w), s = g === "f" ? f : w;
  if (!pl) return s;
  if (a.comparison?.includes("/")) return a.comparison.split("/")[g === "f" ? 1 : 0];
  if (/[^aeiou][cg]o$/.test(s)) return s.slice(0, -1) + "hi";               // (bianco -> bianchi, lungo -> lunghi)
  if (/[^aeiou][cg]a$/.test(s)) return s.slice(0, -1) + "he";               // (bianca -> bianche)
  if (/cia$|gia$/.test(s) && /[aeiou]$/.test(s.slice(0, -3))) return s.slice(0, -1) + "e";   // (grigia -> grigie)
  if (/[cg]ia$/.test(s)) return s.slice(0, -2) + "e";                          // (sporcia? -- marcia -> marce)
  if (/io$/.test(s) && s.length > 3) return s.slice(0, -1);                     // (grigio -> grigi, vecchio -> vecchi, serio -> seri; zio -> zii)
  if (/o$/.test(s)) return s.slice(0, -1) + "i";
  if (/a$/.test(s)) return s.slice(0, -1) + "e";
  if (/e$/.test(s)) return s.slice(0, -1) + "i";
  return s;
};
export const ppForm = (pp, g, pl) => (/o$/.test(pp) ? pp.slice(0, -1) + (g === "f" ? (pl ? "e" : "a") : pl ? "i" : "o") : pp);

// ---- ARTICLES: by gender, number and the next word's beginning -------------------------------------------------------
// lo / gli / uno before s + consonant, z, gn, ps, pn, x, y and i + vowel; l' / un' before a vowel
const LO = /^(s[^aeiouàèéìòù]|z|gn|ps|pn|x|y|i[aeiou])/i, VOWEL0 = /^[aeiouàèéìòù]/i;
export function article(kind, g, pl, next = "") {
  const v = VOWEL0.test(next), lo = LO.test(next);
  if (kind === "indef") return g === "f" ? (v ? "un'" : "una") : lo ? "uno" : "un";
  if (g === "f") return pl ? "le" : v ? "l'" : "la";
  return pl ? (lo || v ? "gli" : "i") : lo ? "lo" : v ? "l'" : "il";
}
// di a da in su + the definite article: del dello della dell' dei degli delle; al allo ...; dal; nel; sul (con: col, coi)
export function contract(prep, art) {
  const base = { di: "de", a: "a", da: "da", in: "ne", su: "su" }[prep], tail = { il: "l", lo: "llo", la: "lla", "l'": "ll'", i: "i", gli: "gli", le: "lle" }[art];
  if (prep === "con") return art === "il" ? "col" : art === "i" ? "coi" : `con ${art}`;
  return base && tail ? base + tail : `${prep} ${art}`;
}
// (a noun phrase's article joined to the next word: l'amico, un'amica -- the realizer's)
export const join = (art, next) => (art.endsWith("'") ? art + next : `${art} ${next}`);

export async function loadMorphology(url) {
  const irr = new Map();   // verb -> { pres: [..], pres1, futstem, pp, impfstem, pret: [..] | pretstem, imp: [tu, voi], subj: [..], like }
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
  // a prefixed verb is its base's: rifare like fare -> rifaccio (like = the base, the prefix the rest)
  const own = (verb) => {
    const v = irr.get(verb);
    if (!v?.like) return v ?? null;
    const base = own(v.like), pre = verb.slice(0, verb.length - v.like.length);
    if (!base) return v;
    const add = (x) => (Array.isArray(x) ? x.map((f) => (f === "-" ? f : pre + f)) : typeof x === "string" ? pre + x : x);
    return { ...Object.fromEntries(Object.entries(base).map(([k, x]) => [k, k === "model" ? x : add(x)])), ...Object.fromEntries(Object.entries(v).filter(([k]) => k !== "like")) };
  };
  const bare = (verb) => verb.replace(/rsi$/, "re").replace(/rsi$/, "re");   // (alzarsi -> alzare, sedersi -> sedere)

  // one form: the verb (an infinitive; a reflexive one as alzarsi), the tense, the person 0..5
  // (regular: by the regular endings alone -- the trainer's wrong option, avevo for ebbi; model: isc)
  function conj(verb, tense, p = 2, { model = "", pp = "", regular = false } = {}) {
    const inf = bare(verb).split(" ")[0], ir = regular ? {} : own(inf) ?? {};
    const cls = /are$/.test(inf) ? "are" : /ire$/.test(inf) ? "ire" : "ere", stem = inf.replace(/(are|ere|ire)$/, "").replace(/rre$/, "r");   // (porre, trarre, produrre: irregular stems)
    if (regular) { model = ""; pp = ""; }
    const isc = model === "isc" || ir.model === "isc";
    const given = ir[tense];
    if (Array.isArray(given) && tense !== "imp" && given[p] && given[p] !== "-") return given[p];
    if (typeof given === "string") return given;
    if (tense === "inf") return inf;
    if (tense === "pp") return pp || ir.pp || stem + { are: "ato", ere: "uto", ire: "ito" }[cls];
    const istem = ir.impfstem ?? stem;   // (fare: fac-evo, fac-endo, fac-essi; dire: dic-; bere: bev-)
    if (tense === "ger") return istem + (cls === "are" && !ir.impfstem ? "ando" : "endo");
    if (tense === "fut" || tense === "cond") {
      const fs = ir.futstem ?? (cls === "are" ? spell(stem, "er") : stem + (cls === "ere" ? "er" : "ir"));
      return fs + (tense === "fut" ? FUT : COND)[p];
    }
    if (tense === "impf") return istem + (ir.impfstem ? END.ere.impf : END[cls].impf)[p];
    if (tense === "subjimpf") return istem + (ir.impfstem ? END.ere.subjimpf : END[cls].subjimpf)[p];
    if (tense === "pret") {
      if (ir.pretstem && STRONG[p]) return ir.pretstem + STRONG[p];
      return istem + (ir.impfstem ? END.ere.pret : END[cls].pret)[p];
    }
    if (tense === "imp") {   // (tu: -are -a, else the present's tu; noi voi: the present's; Lei: the subjunctive's)
      if (p === 1) return ir.imp?.[0] ?? (cls === "are" ? spell(stem, "a") : conj(verb, "pres", 1, { model, regular }));
      if (p === 4) return ir.imp?.[1] ?? conj(verb, "pres", 4, { model, regular });
      if (p === 3) return conj(verb, "pres", 3, { model, regular });
      return conj(verb, "subj", p, { model, regular });
    }
    if (tense === "subj") {
      // (from an irregular 1sg: faccio -> faccia, vengo -> venga; noi voi from the present: veniamo, veniate)
      const first = ir.pres1 ?? (Array.isArray(ir.pres) ? ir.pres[0] : null);
      if (p === 3) return conj(verb, "pres", 3, { model, regular });
      if (p === 4) return conj(verb, "pres", 3, { model, regular }).replace(/iamo$/, "iate");
      if (first && /o$/.test(first)) return first.slice(0, -1) + "a" + (p === 5 ? "no" : "");   // (vada, faccia, venga -- whatever the class)
      if (isc && p !== 3 && p !== 4) return stem + ["isca", "isca", "isca", "", "", "iscano"][p];
      return spell(stem, END[cls].subj[p]);
    }
    if (tense !== "pres") return inf;
    if (!regular && p === 0 && ir.pres1) return ir.pres1;
    if (isc && p !== 3 && p !== 4) return stem + ["isco", "isci", "isce", "", "", "iscono"][p];
    return spell(stem, END[cls].pres[p]);
  }
  // the auxiliary of the passato prossimo: essere for the dictionary's `essere` verbs and every reflexive, else avere
  const aux = (e) => (e.aux === "essere" || /rsi$/.test(e.word ?? e) ? "essere" : "avere");
  return { conj, aux, irregular: (v) => own(bare(v)), plural, adjForm, ppForm, article, contract, join };
}
