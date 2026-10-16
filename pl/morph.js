// POLISH MORPHOLOGY BY RULE: the forms the realizer says (pl/realize.js) and the trainer drills -- a noun's cases in both
// numbers (by its gender and its nominative's ending; a man or an animal makes the accusative the genitive, men make
// the plural virile), an adjective's agreement (hard and soft stems, the virile plural: dobrzy), the possessives and
// demonstratives, a verb's present (-am -asz; -uję; -ę -isz with its 1sg/3pl mutations: proszę prosisz; -nę -niesz),
// its past by gender and person (czytałem czytałaś czytaliśmy), the conditional (czytałbym), the imperative, the
// passive participle; and what the rules get wrong from pl/rules/irregular.txt:
//
//   iść : pres idę idziesz idzie idziemy idziecie idą | past szedł szła szło szli szły | imp idź idźcie
//   pisać : pres piszę piszesz pisze piszemy piszecie piszą          (the whole present given)
//   człowiek : pl ludzie | gpl ludzi | dpl ludziom | ipl ludźmi | lpl ludziach
//   dom : gen domu | loc domu                                          (one case)
//   brat : pl bracia | gpl braci | ipl braćmi
//   dobry : comp lepszy | adv dobrze
//
//   const pl = await loadMorphology("pl/rules/irregular.txt")
//   pl.conj("czytać", "pres", 0) -> "czytam"      persons 0..5: ja ty on my wy oni;  tenses: pres past(+g, p) cond imp inf ppp ger
//   pl.noun(entry, "gen", false) -> "książki"     cases: nom gen dat acc ins loc;  { animate, person }
//   pl.adj(entry, "gen", "f", false) -> "nowej"    adjForm(a, kase, g, pl, { animate, person })

export const CASES = ["nom", "gen", "dat", "acc", "ins", "loc"];
const VOW = "aeiouyąęó", isV = (ch) => VOW.includes(ch);
// the stem's last consonant softened before -e / -i (the locative, the virile plural, the feminine dative):
// t ci, d dzi, r rz, ł l, st ści, zd ździ, sł śl, sn śni, zn źni, k c, g dz, ch sz, b p m w f n s z + i
const SOFT = [["st", "ści"], ["zd", "ździ"], ["sł", "śl"], ["sn", "śni"], ["zn", "źni"], ["t", "ci"], ["d", "dzi"], ["r", "rz"], ["ł", "l"], ["k", "c"], ["g", "dz"], ["ch", "sz"], ["b", "bi"], ["p", "pi"], ["m", "mi"], ["w", "wi"], ["f", "fi"], ["n", "ni"], ["s", "si"], ["z", "zi"]];
// (a consonant that is already soft or "hardened": takes -u in the locative, -y / -i, no softening)
const SOFTC = /(ć|ń|ś|ź|dź|l|j|ci|ni|si|zi|dzi|bi|pi|mi|wi|fi)$/, HARDENED = /(c|dz|cz|sz|ż|rz|dż)$/;
const VELAR = /(k|g|ch)$/;
function soften(stem) {
  for (const [a, b] of SOFT) if (stem.endsWith(a)) return stem.slice(0, -a.length) + b;
  return stem;
}
// the ending -e after a softened stem: ci + e = cie, rz + e = rze, bi + e = bie, c + e = ce
const softE = (stem) => soften(stem) + "e";
// the ending -i / -y of the virile plural after a softened stem: ci, dzi, rzy, li, cy, dzy, si, bi; after a hardened one -e
const virile = (stem) => {
  if (HARDENED.test(stem) || /[lj]$/.test(stem)) return stem + (HARDENED.test(stem) ? "e" : "e");   // (lekarze, nauczyciele)
  const s = soften(stem);
  return s + (/(rz|c|dz|sz)$/.test(s) ? "y" : /i$/.test(s) ? "" : "i");                       // (studenci, Polacy, sąsiedzi, synowie: irregular)
};
// ó -> o and ą -> ę of a closed last syllable opened by an ending (stół stołu, ząb zęba, mąż męża) -- masculine stems
const open = (stem) => stem.replace(/ó(sz|cz|rz|dz|dź|ch|[^aeiouyąęósczrdh])$/, "o$1").replace(/ó([szcrdh])$/, "o$1").replace(/ą(b|ż|dź|dz)$/, "ę$1");
// the genitive plural's bare stem gets an e between its last two consonants (matka -> matek, okno -> okien, książka -> książek)
const fleeting = (stem) => {
  const m = stem.match(/^(.*?)([^aeiouyąęó])([^aeiouyąęó])$/);
  if (!m) return stem;
  const [, head, c1, c2] = m;
  if (/^(st|zd|sn|rt|nt|rc|lc|sz|rz|cz|dz|dź|ść|rd|nd|sp|zb|sc|jc|tw|rw|lw|zw|sw|rn|ln|mn|rm|rs|ls|rp|lp|rt|lt|mp|nc|ns|rz|ńc|ńs)$/.test(c1 + c2) || /^(ń|ś|ć|ź|j)$/.test(c1)) return stem;   // (miast, gwiazd, list, słońc, serc, małżeństw -- but matek, okien, jabłek)
  return head + c1 + (c1 === "n" && /(k|g|o)$/.test(c2) ? "ie" : "e") + c2;   // (okien, sukienek; matek, córek, jabłek, światła -> świateł)
};
// the bare genitive plural's last syllable closed: o -> ó, ę -> ą (noga -> nóg, słowo -> słów, święto -> świąt)
const closed = (bare) => bare.replace(/o([^aeiouyąęónmń])$/, "ó$1").replace(/ę([^aeiouyąęónmń])$/, "ą$1");   // (nóg, słów, szkół -- but żon, stron)
// a masculine's oblique stem: the fleeting e of -ek / -ec dropped (zegarek -> zegark-, ołówek -> ołówk-)
const obliqueM = (stem) => stem.replace(/([^aeiouyąęó])e([kc])$/, "$1$2");
// the genitive of a soft or hardened feminine on a consonant: miłości, gości, nocy
const softGen = (stem) => { const k = kindOf(stem); if (k === "hardened") return stem + "y"; const s = softV(stem); return /i$/.test(s) ? s : s + "i"; };

// ---- NOUNS ---------------------------------------------------------------------------------------------------------
// the declension class of a noun by its gender and nominative: { stem, kind }
function nounClass(e) {
  const w = e.word, g = e.gender;
  if (g === "lm") { const st = /(ci|si|zi|ni|dzi)$/.test(w) ? w.replace(/ci$/, "ć").replace(/si$/, "ś").replace(/zi$/, "ź").replace(/ni$/, "ń").replace(/dzi$/, "dź") : w.replace(/[yiea]$/, ""); return { stem: st, kind: /[yi]$/.test(w) && kindOf(st) !== "soft" ? "c" : "a" }; }   // Niemcy, drzwi, spodnie, mdłości: the plural's stem
  if (/[yi]$/.test(w) && g === "m" && w.length > 3) return { stem: w, kind: "adj" };                 // chory, dorosły, znajomy: an adjective as a noun
  if (/um$/.test(w) && g === "n") return { stem: w.slice(0, -2), kind: "um" };                       // muzeum
  if (/ę$/.test(w) && g === "n") return { stem: w.slice(0, -1), kind: "ę" };                          // imię (stem given: imien)
  if (/[ao]$/.test(w) && g === "m") return { stem: w.slice(0, -1), kind: "ma" };                      // mężczyzna, tata
  if (/a$/.test(w)) return { stem: w.slice(0, -1), kind: "a" };                                      // kobieta, ulica, ziemia
  if (/i$/.test(w) && g === "ż") return { stem: w, kind: "pani" };                                    // pani, gospodyni
  if (/[oe]$/.test(w)) return { stem: w.slice(0, -1), kind: "o" };                                    // okno, słońce
  if (g === "ż") return { stem: w, kind: "żc" };                                                      // noc, miłość, sól
  return { stem: w, kind: "c" };                                                                      // dom, kot, student
}
// the stem's last sound: soft (ć ś ź dź ń l j; -i- spelled), hardened (c dz cz sz ż rz dż), velar (k g ch), or hard
const kindOf = (stem) => (SOFTC.test(stem) || /i$/.test(stem) ? "soft" : HARDENED.test(stem) ? "hardened" : VELAR.test(stem) ? "velar" : "hard");
// -y after a hard or hardened stem, -i after a velar or soft one (koty, noce, ptaki, konie); the written soft: ń + i = ni
const yi = (stem) => { const k = kindOf(stem); return k === "hard" || k === "hardened" ? "y" : "i"; };
// a soft consonant spelled before a vowel ending: koń + a = konia, ś + a = sia, ć + a = cia, ź + a = zia, dź + a = dzia
const softV = (stem) => stem.replace(/ń$/, "ni").replace(/ś$/, "si").replace(/ć$/, "ci").replace(/ź$/, "zi").replace(/dź$/, "dzi");
// a stem ending in i (soft spelled: koni-, ziemi-) before -e: konie; before y-type endings: koni + i -> koni
const joinEnd = (stem, end) => {
  if (/i$/.test(stem)) { if (end === "y" || end === "i") return (/[rltdgmpbfw]i$|[aeiouy]ni$/.test(stem) && !/^(ziemi|głębi)$/.test(stem)) ? stem + "i" : stem; if (end === "ie") return stem + "e"; }   // (Austrii, chemii, kopii, Danii; ziemi, babci, patelni)
  if (/j$/.test(stem) && end === "i") return stem + "i";
  return stem + end;
};

export async function loadMorphology(url) {
  const irr = new Map();
  const text = await (await fetch(url)).text().catch(() => "");
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const [word, rest = ""] = s.split(/\s*:\s*/, 2), v = {};
    for (const part of rest.split("|").map((x) => x.trim()).filter(Boolean)) {
      const [k, ...forms] = part.split(/\s+/);
      v[k] = forms.length === 1 ? forms[0] : forms;
    }
    irr.set(word, v);
  }
  const own = (w) => irr.get(w) ?? irr.get(w.replace(/ się$/, "")) ?? null;

  // A NOUN'S FORM: entry { word, gender, plural, model }, the case, plural?, { animate, person } (a man: person; an animal:
  // animate -- the world's knowledge, not the dictionary's)
  function noun(e, kase, pl = false, { animate = false, person = false } = {}) {
    const ir = own(e.word) ?? {};
    const k = CASES.indexOf(kase);
    if (k < 0) return e.word;
    if (e.model === "ndm") return e.word;   // (kakao, menu: one form)
    if (e.word.includes(" ")) {   // (a phrase: noun + adjective or adjective + noun declined together; anything longer as it is)
      const ws = e.word.split(" "), ADJ = /(ny|na|ne|ni|owy|owa|owe|owi|ski|ska|skie|scy|cki|cka|ckie|ccy|ony|ona|one|oni|ty|ta|te|ci|ży|ża|że|zi|ły|ła|łe|li|ry|ra|re|rzy|ki|ka|kie|cy)$/;
      if (ws.length !== 2) return e.word;
      const adjFirst = ADJ.test(ws[0]) && !/[^aeiouyąęó]$/.test(ws[0]) && !(ADJ.test(ws[1]) && /[yi]$/.test(ws[1]) && !/[yi]$/.test(ws[0]));
      const [a, n] = adjFirst ? ws : [ws[1], ws[0]];
      const pls = e.plural && e.plural !== "-" && e.plural.includes(" ") ? e.plural.split(" ") : null;
      const ne = { ...e, word: n, plural: pls ? (adjFirst ? pls[1] : pls[0]) : "-" };
      const g0 = e.gender === "lm" ? "pl" : e.gender === "ż" ? "f" : e.gender === "n" ? "n" : "m", isPl = pl || e.gender === "lm";
      const base = a.replace(/(a|e|ie|i|y|owa|owe|ska|skie|cka|ckie|ona|one|oni|cy|dzy|scy|ccy)$/, (m) => ({ a: "y", e: "y", ie: "i", i: "i", y: "y", owa: "owy", owe: "owy", ska: "ski", skie: "ski", cka: "cki", ckie: "cki", ona: "ony", one: "ony", oni: "ony", cy: "ki", dzy: "gi", scy: "ski", ccy: "cki" })[m]);
      const nf = noun(ne, kase, isPl, { animate, person }), af = adj({ word: base }, kase, g0, isPl, { animate, person });
      return adjFirst ? `${af} ${nf}` : `${nf} ${af}`;
    }
    if (e.gender === "lm") pl = true;
    const cls = nounClass(e);
    if (cls.kind === "adj") return adj({ word: e.word }, kase, "m", pl, { animate, person: person || animate });
    const given = pl ? { nom: ir.pl ?? (e.plural && e.plural !== "-" ? e.plural : null), gen: ir.gpl, dat: ir.dpl, acc: ir.apl, ins: ir.ipl, loc: ir.lpl }[kase] : { nom: e.word, gen: ir.gen, dat: ir.dat, acc: ir.acc, ins: ir.ins, loc: ir.loc }[kase];
    if (given) return given;
    const pers = person || e.person, anim = animate || e.animate || pers, masc = cls.kind === "c" || cls.kind === "ma";
    if (kase === "acc") {   // (the accusative: a man's or an animal's singular, every men's plural is the genitive; a feminine -a takes -ę)
      if (pl) return masc && pers ? noun(e, "gen", true, { animate, person }) : noun(e, "nom", true, { animate, person });
      if (masc && anim && cls.kind === "c") return noun(e, "gen", false, { animate, person });
      if (cls.kind === "a" || cls.kind === "ma") return cls.stem + "ę";
      if (cls.kind === "pani") return cls.stem + "ą";
      return e.word;
    }
    // the stem: an oblique one given (imien, dzieck), else the nominative's; a plural stem from the given plural (ludzie -> ludzi)
    let stem = ir.stem ?? (cls.kind === "c" ? obliqueM(cls.stem) : cls.stem);
    if (pl) {
      const np = ir.pl ?? (e.plural && e.plural !== "-" ? e.plural : null);
      if (kase === "nom") return np ?? (cls.kind === "c" ? (pers ? virile(open(stem)) : joinEnd(stem, kindOf(stem) === "soft" || kindOf(stem) === "hardened" ? "e" : yi(stem))) : cls.kind === "a" || cls.kind === "ma" ? joinEnd(stem, kindOf(stem) === "soft" || kindOf(stem) === "hardened" ? "e" : yi(stem)) : cls.kind === "o" || cls.kind === "um" ? stem + "a" : cls.kind === "żc" ? stem + (kindOf(stem) === "hard" ? "y" : "e") : stem + "e");
      // (the oblique plural keeps the singular's stem: studenci -> studentów, Polacy -> Polaków; ludzie -> ludzi is given)
      const sk = kindOf(stem);
      if (kase === "gen") {
        if (cls.kind === "c" || cls.kind === "ma") {   // (-ów hard, velar, c, dz, j; -i soft; -y the other hardened)
          if (cls.kind === "ma" && /a$/.test(e.word) && !pers) return fleeting(stem);
          if (sk === "soft" && !/j$/.test(stem)) return softGen(stem);
          if (sk === "hardened" && !/(c|dz)$/.test(stem)) return stem + "y";
          return open(stem) + "ów";
        }
        if (cls.kind === "a" || cls.kind === "o" || cls.kind === "um" || cls.kind === "ę") {   // (the bare stem: matek, okien, ulic, ziem; -ja -> -ji, -ia -> -ii)
          if (/j$/.test(stem)) return stem + "i";                                                            // (lekcji)
          if (/[bpmwf]i$/.test(stem)) return closed(stem.slice(0, -1));                                      // (ziemia -> ziem)
          if (/(ci|si|zi|ni|dzi)$/.test(stem)) return stem.replace(/ni$/, "ń").replace(/si$/, "ś").replace(/ci$/, "ć").replace(/zi$/, "ź");   // (babć, pań)
          if (/i$/.test(stem)) return stem + "i";                                                            // (historii)
          if (cls.kind === "um") return stem + "ów";
          return closed(fleeting(stem));                                                                     // (matek, okien, nóg, słów)
        }
        if (cls.kind === "pani") return stem.slice(0, -2) + "ń";
        return softGen(stem);   // (nocy, miłości)
      }
      const ost = cls.kind === "c" ? open(stem) : stem;
      if (kase === "dat") return softV(ost) + "om";
      if (kase === "ins") return softV(ost) + "ami";
      if (kase === "loc") return softV(ost) + "ach";
      return e.word;
    }
    // the singular
    switch (cls.kind) {
      case "c": {
        const st = open(stem), sk = kindOf(stem);
        if (kase === "gen") return softV(st) + (anim || /(ek|ik|yk|ec|erz|arz)$/.test(e.word) ? "a" : "u");   // (kota, chłopca, zegarka, widelca; domu, stołu)
        if (kase === "dat") return softV(st) + (anim && !pers ? "u" : "owi");
        if (kase === "ins") return softV(st) + (VELAR.test(stem) && !/ch$/.test(stem) ? "iem" : "em");
        if (kase === "loc") return sk === "hard" ? softE(st) : softV(st) + "u";   // (domie? -- no: domu is irregular; stole, bracie; koniu, nożu, Polaku)
        break;
      }
      case "ma": {   // (mężczyzna: the singular like a feminine -a, the plural like men)
        if (kase === "gen") return joinEnd(stem, yi(stem));
        if (kase === "dat" || kase === "loc") return kindOf(stem) === "hard" ? softE(stem) : softV(stem) + (kindOf(stem) === "velar" ? "e" : "y");
        if (kase === "ins") return softV(stem) + "ą";
        break;
      }
      case "a": {
        const sk = kindOf(stem);
        if (kase === "gen") return joinEnd(stem, yi(stem));                                        // (kobiety, książki, ulicy, ziemi)
        if (kase === "dat" || kase === "loc") return sk === "hard" ? softE(stem) : sk === "velar" ? soften(stem) + "e" : joinEnd(stem, yi(stem));   // (kobiecie, ręce, nodze, ulicy, ziemi)
        if (kase === "ins") return softV(stem) + "ą";
        break;
      }
      case "pani": {
        if (kase === "gen" || kase === "dat" || kase === "loc") return stem;
        if (kase === "ins") return stem + "ą";
        break;
      }
      case "żc": {
        if (kase === "gen" || kase === "dat" || kase === "loc") return softGen(stem);   // (nocy, miłości, soli)
        if (kase === "ins") return softV(stem) + "ą";
        break;
      }
      case "o": {
        const sk = kindOf(stem);
        if (kase === "gen") return softV(stem) + "a";
        if (kase === "dat") return softV(stem) + "u";
        if (kase === "ins") return softV(stem) + (VELAR.test(stem) && !/ch$/.test(stem) ? "iem" : "em");
        if (kase === "loc") return sk === "hard" ? softE(stem) : softV(stem) + "u";   // (oknie, mieście -- irregular --, słońcu, polu)
        break;
      }
      case "um": return e.word;
      case "ę": {
        const st = ir.stem ?? stem + "ni";   // (imię: imieni-a; cielę: cielęci-a -- given)
        if (kase === "gen") return st + "a";
        if (kase === "dat") return st + "u";
        if (kase === "ins") return st + "em";
        if (kase === "loc") return st + "u";
        break;
      }
    }
    return e.word;
  }
  const plural = (e) => noun(e, "nom", true, { person: e.person });

  // ---- ADJECTIVES: the long form agreeing with a noun -- hard (nowy), soft / velar (polski, drogi, głupi) ------------
  // m/n: -y/-i -ego -emu = -ym/-im -ym/-im; f: -a -ej -ej -ą -ą -ej; pl: -e/-i -ych/-ich -ym/-im = -ymi/-imi -ych/-ich
  function adj(a, kase, g = "m", pl = false, { animate = false, person = false } = {}) {
    const w = a.word ?? a;
    if (w.includes(" ") || !/[yi]$/.test(w)) return w;   // (an indeclinable or a phrase)
    const stem = w.slice(0, -1), soft = /i$/.test(w), I = soft ? "i" : "y";
    // (a velar stem -- polski, drogi -- keeps its i before e: polskie, polskiego, but polska; a soft one -- głupi, tani --
    //  before every vowel: głupia, głupiego)
    const E = (end) => stem + (soft && (/^e/.test(end) || (!/[kg]$/.test(stem) && /^[aą]/.test(end))) ? "i" + end : end);
    const k = CASES.indexOf(kase), G = pl ? "pl" : g === "ż" || g === "f" ? "f" : g === "n" ? "n" : "m";
    const anim = animate || a.animate, pers = person || a.person;
    if (G === "f") return E(["a", "ej", "ej", "ą", "ą", "ej"][k]);
    if (G === "pl") {
      if (k === 0) return pers ? virileAdj(stem) : E("e");
      if (k === 3) return pers ? stem + I + "ch" : E("e");
      return stem + [null, I + "ch", I + "m", null, I + "mi", I + "ch"][k];
    }
    if (k === 0) return G === "n" ? E("e") : w;
    if (k === 3) return G === "n" ? E("e") : anim || pers ? E("ego") : w;
    return k === 1 || k === 2 ? E(["", "ego", "emu"][k]) : stem + ["", "", "", "", I + "m", I + "m"][k];
  }
  // the virile plural: dobrzy, mali, duzi, polscy, drodzy, młodzi, bogaci, ciekawi, piękni, głupi, pierwsi, starsi
  function virileAdj(stem) {
    if (/sz$/.test(stem)) return stem.slice(0, -2) + "si";          // (pierwszy -> pierwsi, starszy -> starsi, lepszy -> lepsi)
    if (/ż$/.test(stem)) return stem.slice(0, -1) + "zi";           // (duży -> duzi)
    if (/i$/.test(stem)) return stem;                                 // (głupi, tani)
    if (/sk$/.test(stem)) return stem.slice(0, -1) + "cy";           // (polski -> polscy)
    if (/k$/.test(stem)) return stem.slice(0, -1) + "cy";            // (wysoki -> wysocy)
    if (/g$/.test(stem)) return stem.slice(0, -1) + "dzy";           // (drogi -> drodzy)
    if (/[cs]zon$/.test(stem) || /on$/.test(stem)) return stem.slice(0, -2) + "eni";   // (zmęczony -> zmęczeni)
    const s = soften(stem);
    return s + (/(rz|c|dz)$/.test(s) ? "y" : /i$/.test(s) ? "" : "i");
  }
  const adjForm = adj;
  // the comparative (nowszy, ładniejszy; szybki -> szybszy; irregular: lepszy) and the superlative (naj-)
  const compare = (a, { sup = false } = {}) => {
    const w = a.word ?? a, ir = own(w) ?? {};
    const c = a.comparison || ir.comp;
    if (c) return sup ? "naj" + c : c;
    if (!/[yi]$/.test(w) || w.includes(" ") || /(ony|ący|ty|ski|cki|szy)$/.test(w) || (w.length > 5 && /owy$/.test(w))) return (sup ? "najbardziej " : "bardziej ") + w;
    const stem = w.slice(0, -1);
    let out;
    if (/[^aeiouyąęó]k$/.test(stem) || /ok$/.test(stem) || /ek$/.test(stem)) out = stem.slice(0, -1).replace(/ok$|ek$/, (m) => m[0]) + "szy";   // (szybki -> szybszy, wysoki -> wyższy: irregular, daleki -> dalszy)
    else if (/[^aeiouyąęó]n$/.test(stem)) out = stem + "iejszy";   // (ładny -> ładniejszy, trudny -> trudniejszy)
    else if (/ł$/.test(stem)) out = stem.slice(0, -1) + "lejszy";  // (ciepły -> cieplejszy)
    else if (/r$/.test(stem)) out = stem.slice(0, -1) + "rzejszy"; // (mądry -> mądrzejszy)
    else if (/w$/.test(stem) && /[^aeiouyąęó]w$/.test(stem)) out = stem + "iejszy";   // (ciekawy -> ciekawszy: the vowel before)
    else out = stem + "szy";
    if (/wszy$/.test(out) && /[aeiouyąęó]w/.test(stem)) out = stem + "szy";
    return sup ? "naj" + out : out;
  };
  // the adverb: szybko, ładnie (-ny -> -nie), dobrze (irregular)
  const adverb = (a) => { const w = a.word ?? a, ir = own(w) ?? {}; if (ir.adv) return ir.adv; if (!/[yi]$/.test(w)) return w; const stem = w.slice(0, -1); return /[^aeiouyąęó]n$/.test(stem) ? stem + "ie" : /i$/.test(w) && /[kg]$/.test(stem) ? stem + "o" : /i$/.test(w) ? stem.replace(/i$/, "") + "o" : stem + "o"; };

  // ---- POSSESSIVES AND DEMONSTRATIVES -------------------------------------------------------------------------------
  // mój (mojego mojemu moim; moja mojej moją; moje; moi moich moim moimi / moje), twój, swój; nasz, wasz (like adjectives);
  // ten (tego temu tym; ta tej tę tą; to; ci tych tym tymi / te); tamten; jego jej ich unchanged
  const PRON = {
    "mój": { m: ["mój", "mojego", "mojemu", "=", "moim", "moim"], f: ["moja", "mojej", "mojej", "moją", "moją", "mojej"], n: ["moje", "mojego", "mojemu", "moje", "moim", "moim"], pl: ["moje", "moich", "moim", "=", "moimi", "moich"], vir: "moi" },
    "ten": { m: ["ten", "tego", "temu", "=", "tym", "tym"], f: ["ta", "tej", "tej", "tę", "tą", "tej"], n: ["to", "tego", "temu", "to", "tym", "tym"], pl: ["te", "tych", "tym", "=", "tymi", "tych"], vir: "ci" },
    "tamten": { m: ["tamten", "tamtego", "tamtemu", "=", "tamtym", "tamtym"], f: ["tamta", "tamtej", "tamtej", "tamtą", "tamtą", "tamtej"], n: ["tamto", "tamtego", "tamtemu", "tamto", "tamtym", "tamtym"], pl: ["tamte", "tamtych", "tamtym", "=", "tamtymi", "tamtych"], vir: "tamci" },
    "jeden": { m: ["jeden", "jednego", "jednemu", "=", "jednym", "jednym"], f: ["jedna", "jednej", "jednej", "jedną", "jedną", "jednej"], n: ["jedno", "jednego", "jednemu", "jedno", "jednym", "jednym"], pl: ["jedne", "jednych", "jednym", "=", "jednymi", "jednych"], vir: "jedni" },
    "wszystek": { m: ["wszystek", "wszystkiego", "wszystkiemu", "=", "wszystkim", "wszystkim"], f: ["wszystka", "wszystkiej", "wszystkiej", "wszystką", "wszystką", "wszystkiej"], n: ["wszystko", "wszystkiego", "wszystkiemu", "wszystko", "wszystkim", "wszystkim"], pl: ["wszystkie", "wszystkich", "wszystkim", "=", "wszystkimi", "wszystkich"], vir: "wszyscy" },
    "czyj": { m: ["czyj", "czyjego", "czyjemu", "=", "czyim", "czyim"], f: ["czyja", "czyjej", "czyjej", "czyją", "czyją", "czyjej"], n: ["czyje", "czyjego", "czyjemu", "czyje", "czyim", "czyim"], pl: ["czyje", "czyich", "czyim", "=", "czyimi", "czyich"], vir: "czyi" },
  };
  function pronAdj(base, kase, g = "m", pl = false, { animate = false, person = false } = {}) {
    if (/^(jego|jej|ich)$/.test(base)) return base;
    const like = base in PRON ? base : /^(twój|swój)$/.test(base) ? "mój" : null;
    if (!like) return adj({ word: base.replace(/^(nasz|wasz)$/, "$1y") }, kase, g, pl, { animate, person }).replace(/^(nasz|wasz)y$/, "$1");   // (nasz: naszego, nasza, nasi)
    const T = PRON[like], G = pl ? "pl" : g === "ż" || g === "f" ? "f" : g === "n" ? "n" : "m", k = CASES.indexOf(kase);
    let f = T[G][k];
    if (f === "=") f = G === "pl" ? (person ? T[G][1] : T[G][0]) : animate || person ? T[G][1] : T[G][0];
    if (G === "pl" && k === 0 && person) f = T.vir;
    return base === like ? f : f.replace(/^m/, base.slice(0, 2));   // (twój: tw + ój, twojego; swój)
  }

  // ---- VERBS ---------------------------------------------------------------------------------------------------------
  const JVERB = /^(wy|za|na|po|prze|przy|u|z|s|o|od|do|roz|w|ob|pod|nad|roze)?(pi|my|ży|bi|szy|kry|czu|ku|psu|plu|kłu|snu|tru|ssa)ć$/;   // (the one-syllable roots with -ję: pić piję; wypić wypiję)
  const refl = (v) => / się$/.test(v);
  const bare = (v) => v.replace(/ się$/, "");
  const withRefl = (form, isRefl) => (isRefl ? form + " się" : form);
  // the 1sg / 3pl mutation of the -ić / -eć class: s -> sz, z -> ż, ć/c -> c, dź/dz -> dz, ść -> szcz, źdź -> żdż; a soft
  // labial or n keeps its i (robię, lubię, gonię)
  const mutate = (stem) => (/ść$/.test(stem) ? stem.slice(0, -2) + "szcz" : /źdź$/.test(stem) ? stem.slice(0, -3) + "żdż" : /dź$/.test(stem) ? stem.slice(0, -2) + "dz" : /ś$/.test(stem) ? stem.slice(0, -1) + "sz" : /ź$/.test(stem) ? stem.slice(0, -1) + "ż" : /ć$/.test(stem) ? stem.slice(0, -1) + "c" : /ń$/.test(stem) ? stem.slice(0, -1) + "ni" : /[bpmwf]$/.test(stem) ? stem + "i" : stem);
  // the stem of an -ić / -yć / -eć verb as a soft consonant: robić -> rob (+i), prosić -> proś, chodzić -> chodź, uczyć -> ucz, widzieć -> widź
  const softStem = (inf) => {
    if (/yć$/.test(inf) || /(cz|sz|ż|rz|dż)eć$/.test(inf)) return inf.slice(0, -2);        // (uczyć -> ucz; słyszeć -> słysz: hardened, no softening)
    const s = /ieć$/.test(inf) ? inf.slice(0, -3) : inf.slice(0, -2);                       // (widzieć -> widz; prosić -> pros; myśleć -> myśl)
    return s.replace(/dz$/, "dź").replace(/s$/, "ś").replace(/z$/, "ź").replace(/c$/, "ć").replace(/n$/, "ń");   // (the consonant before i is soft: proś, chodź, płać, goń)
  };
  // the class of a verb by its infinitive: am (czytać), em (umieć), uję (kupować, pokazywać, dawać -> daję), nę (zacząć,
  // stanąć), i (robić, uczyć, widzieć: -ę -isz/-ysz), e (an irregular consonant stem: pisać piszę -- from the file)
  function verbClass(inf) {
    if (JVERB.test(inf) || /uć$/.test(inf)) return { kind: "uję", stem: inf.slice(0, -1) + "j" };   // (pić piję, wypić wypiję, żyć żyję, czuć czuję)
    if (/ować$/.test(inf)) return { kind: "uję", stem: inf.slice(0, -4) + "uj" };
    if (/[iy]wać$/.test(inf) && inf.length > 6) return { kind: "uję", stem: inf.slice(0, -4) + "uj" };   // (pokazywać -> pokazuj; pływać, używać: irregular)
    if (/awać$/.test(inf)) return { kind: "uję", stem: inf.slice(0, -3) + "j" };                      // (dawać -> daj-ę)
    if (/nąć$/.test(inf)) return { kind: "nę", stem: inf.slice(0, -3) };
    if (/jąć$/.test(inf)) return { kind: "mę", stem: inf.slice(0, -2) + "m" };                              // (zająć zajmę, przyjąć przyjmę, zdjąć zdejmę: irregular)
    if (/ąć$/.test(inf)) return { kind: "nę", stem: inf.slice(0, -2) };                                   // (zacząć -> zaczn-ę)
    if (/mieć$/.test(inf)) return { kind: "em", stem: inf.slice(0, -1) };                                // (umieć -> umie-m, rozumieć)
    if (/(ić|yć)$/.test(inf) || /eć$/.test(inf)) return { kind: "i", stem: softStem(inf), y: /yć$/.test(inf) || /(cz|sz|ż|rz|dż)eć$/.test(inf) || /(cz|sz|ż|rz)yć$/.test(inf) };
    if (/ać$/.test(inf)) return { kind: "am", stem: inf.slice(0, -1) };
    return { kind: "e", stem: inf.slice(0, -1) };
  }
  // the present (a perfective's: its future), the person 0..5
  function present(verb, p, { regular = false } = {}) {
    const isRefl = refl(verb), inf = bare(verb), ir = regular ? {} : irr.get(verb) ?? own(inf) ?? {};   // (stać się has its own line beside stać)
    if (!regular && Array.isArray(ir.pres)) return withRefl(ir.pres[p], isRefl);
    const c = verbClass(inf);
    let f;
    if (c.kind === "am") f = c.stem + ["m", "sz", "", "my", "cie", "ją"][p];
    else if (c.kind === "em") f = c.stem + ["m", "sz", "", "my", "cie", "ją"][p];
    else if (c.kind === "uję") f = c.stem + ["ę", "esz", "e", "emy", "ecie", "ą"][p];
    else if (c.kind === "nę") f = c.stem + ["nę", "niesz", "nie", "niemy", "niecie", "ną"][p];
    else if (c.kind === "mę") f = c.stem + ["ę", "iesz", "ie", "iemy", "iecie", "ą"][p];
    else if (c.kind === "i") {
      const y = c.y ? "y" : "i";
      if (p === 0 || p === 5) { const m = mutate(c.stem); f = (/[bpmwfl]i$|ni$/.test(m) ? m : m.replace(/i$/, "")) + (p === 0 ? "ę" : "ą"); }
      else f = softV(c.stem).replace(/i$/, "") + (/(ń|ś|ć|ź|dź)$/.test(c.stem) ? "i" : y) + ["", "sz", "", "my", "cie", ""][p];
      if (/(ś|ć|ź|dź|ń)$/.test(c.stem) && p !== 0 && p !== 5) f = softV(c.stem).replace(/i$/, "") + "i" + ["", "sz", "", "my", "cie", ""][p];
    } else f = c.stem + ["ę", "esz", "e", "emy", "ecie", "ą"][p];
    return withRefl(f, isRefl);
  }
  // the past: the ł-stem by gender and number (czytał czytała czytało czytali czytały; widział / widzieli; zaczął zaczęła
  // zaczęli), then the person's ending (-em -eś / -m -ś, -śmy -ście)
  function lstem(inf, g, pl, ir) {
    const k = pl ? (g === "vir" || g === "m" ? 3 : 4) : g === "f" || g === "ż" ? 1 : g === "n" ? 2 : 0;
    if (Array.isArray(ir.past)) return ir.past[k] ?? ir.past[Math.min(k, ir.past.length - 1)];
    let stem = inf.slice(0, -1);   // (czyta-, robi-, uczy-, zaczą-, widzie-)
    if (/ie$/.test(stem) && k !== 3) stem = stem.slice(0, -1) + "a";                       // (widział, miał; widzieli)
    if (/ą$/.test(stem) && k !== 0) stem = stem.slice(0, -1) + "ę";                        // (zaczęła, zaczęli)
    if (/e$/.test(stem) && !/ie$/.test(stem) && k !== 3) stem = stem.slice(0, -1) + "a";    // (-eć after sz/ż: słyszał)
    return stem + ["ł", "ła", "ło", "li", "ły"][k];
  }
  function past(verb, p = 2, { g = "m", pl = false, regular = false } = {}) {
    const isRefl = refl(verb), inf = bare(verb), ir = regular ? {} : irr.get(verb) ?? own(inf) ?? {};
    const l = lstem(inf, g, pl, ir);
    const end = pl ? ["śmy", "ście", ""][p % 3] : p % 3 === 0 ? (g === "f" || g === "ż" ? "m" : "em") : p % 3 === 1 ? (g === "f" || g === "ż" ? "ś" : "eś") : "";
    return withRefl(l + end, isRefl);
  }
  // the conditional: the ł-form + by + the person (czytałbym, czytałabyś, czytaliby)
  function cond(verb, p = 2, { g = "m", pl = false } = {}) {
    const isRefl = refl(verb), inf = bare(verb), ir = irr.get(verb) ?? own(inf) ?? {};
    return withRefl(lstem(inf, g, pl, ir) + "by" + (pl ? ["śmy", "ście", ""] : ["m", "ś", ""])[p % 3], isRefl);
  }
  // the imperative: czytaj, kupuj, rób, proś, idź, ucz, zacznij; plural -cie, let us -my
  function imperative(verb, { pl = false, we = false } = {}) {
    const isRefl = refl(verb), inf = bare(verb), ir = irr.get(verb) ?? own(inf) ?? {};
    let base;
    if (Array.isArray(ir.imp)) base = ir.imp[0];
    else {
      const c = verbClass(inf), he = bare(present(verb, 2)), they = bare(present(verb, 5));
      if (c.kind === "am" || c.kind === "em") base = they.slice(0, -1);                        // (czytają -> czytaj)
      else if (c.kind === "uję") base = he.slice(0, -1);                                       // (kupuje -> kupuj)
      else if (c.kind === "nę") { const st = he.slice(0, -3); base = /[^aeiouyąęó]$/.test(st) ? st + "nij" : st + "ń"; }   // (zacznie -> zacznij; stanie -> stań)
      else if (c.kind === "mę") base = c.stem + "ij";                                                      // (zajmij)
      else if (c.kind === "i") { const s = c.stem; base = (/(ś|ć|ź|dź|ń)$/.test(s) ? s : s.replace(/i$/, "")).replace(/ob$/, "ób"); }   // (rób, proś, idź, ucz, myśl)
      else base = he.replace(/e$/, "").replace(/dzi$/, "dź").replace(/si$/, "ś").replace(/zi$/, "ź").replace(/ci$/, "ć").replace(/ni$/, "ń");   // (pisze -> pisz, niesie -> nieś, idzie -> idź)
    }
    if (pl && Array.isArray(ir.imp) && ir.imp[1]) base = ir.imp[1];
    else if (pl) base += "cie";
    else if (we) base += "my";
    return withRefl(base, isRefl);
  }
  // the passive participle (czytany, zrobiony, kupiony, zaczęty; -ść: irregular), by gender and number
  function ppp(verb, g = "m", pl = false, { person = false } = {}) {
    const inf = bare(verb), ir = own(inf) ?? {};
    let m = ir.ppp ?? null;
    if (!m) {
      const c = verbClass(inf);
      if (c.kind === "am" || c.kind === "em") m = inf.slice(0, -1) + "ny";
      else if (c.kind === "uję") m = JVERB.test(inf) || /uć$/.test(inf) ? inf.slice(0, -1) + "ty" : inf.slice(0, -1) + "ny";   // (pity, wypity, zabity, myty; kupowany)
      else if (c.kind === "nę" || c.kind === "mę") m = /nąć$/.test(inf) ? inf.slice(0, -3) + "nięty" : inf.slice(0, -2) + "ęty";   // (zamknięty, zaczęty, zajęty)
      else if (c.kind === "i") { const s = mutate(c.stem); m = (/[bpmwf]i$|ni$/.test(s) ? s : s.replace(/i$/, "")) + "ony"; }   // (zrobiony, kupiony, uczony, proszony)
      else return "";   // (a consonant stem the file does not give: no participle)
    }
    return adj({ word: m }, "nom", g, pl, { person });
  }
  // the gerund: imperfective -ąc (czytając), perfective -wszy (przeczytawszy)
  function gerund(verb, { perfective = false } = {}) {
    const isRefl = refl(verb), inf = bare(verb), ir = own(inf) ?? {};
    if (perfective) { const l = lstem(inf, "m", false, ir); return (/[aeiouyąęó]ł$/.test(l) ? l.slice(0, -1) + "wszy" : l + "szy") + (isRefl ? " się" : ""); }
    return (ir.ger ?? bare(present(verb, 5)) + "c") + (isRefl ? " się" : "");
  }
  // one form by tense: pres (0..5), past (p, g, pl), cond (p, g, pl), imp (pl, we), ppp (g, pl), ger, inf; `regular`: by
  // the rules alone (the trainer's wrong forms). A verb of several words (brać udział): its first word conjugated
  function conj(verb, tense, p = 2, opts = {}) {
    if (verb.includes(" ") && !/ się$/.test(verb.replace(/ się$/, "")) && bare(verb).includes(" ")) { const [h, ...r] = bare(verb).split(" "); return [conj(h + (refl(verb) ? " się" : ""), tense, p, opts), ...r].join(" "); }
    const { regular = false, g = "m", pl = false } = opts;
    if (tense === "ger") return gerund(verb, { perfective: !!opts.perfective });
    if (tense === "pres") return present(verb, p, { regular });
    if (tense === "past") return past(verb, p, { g, pl, regular });
    if (tense === "cond") return cond(verb, p, { g, pl });
    if (tense === "imp") return imperative(verb, { pl, we: !!opts.we });
    if (tense === "ppp") return ppp(verb, g, pl, { person: !!opts.person });
    if (tense === "fut") { const ir = own(bare(verb)); return Array.isArray(ir?.fut) ? withRefl(ir.fut[p], refl(verb)) : verb; }   // (być: będę)
    return verb;
  }
  const endStressed = () => false;   // (Polish stress is fixed: nothing to decide)
  return { conj, noun, plural, adj, adjForm, compare, adverb, pronAdj, irregular: (v) => own(bare(v)), endStressed, mutate, soften };
}

export const genderOf = (e) => (e.gender === "ż" ? "f" : e.gender === "n" ? "n" : e.gender === "lm" ? "pl" : "m");
