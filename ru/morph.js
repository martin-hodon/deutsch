// RUSSIAN MORPHOLOGY BY RULE: the forms the realizer says (ru/realize.js) and the trainer drills -- a noun's six cases
// in both numbers (by its gender and its nominative's ending; animacy makes the accusative the genitive), an adjective's
// agreement (hard, soft, after a velar or a husher), the possessives and demonstratives, a verb's present (the first
// conjugation -ать/-ять/-овать/-нуть, the second -ить/-еть with its 1sg mutations: хожу, люблю), its past (by gender),
// its imperative, the perfective partner's present as the future; and what the rules get wrong from
// ru/rules/irregular.txt:
//
//   идти : pres иду идёшь идёт идём идёте идут | past шёл шла шло шли | imp иди идите
//   писать : pres пишу пишешь пишет пишем пишете пишут        (the whole present given)
//   любить : pres1 люблю                                       (one form)
//   смотреть : conj 2                                          (an -еть verb of the second conjugation)
//   человек : pl люди | gpl людей | dpl людям | ipl людьми | ppl людях
//   день : stem дн                                             (a fleeting vowel: the oblique stem)
//   мать : stem матер | pl матери
//   время : stem времен | pl времена | gpl времён
//   большой : comp больше
//
//   const ru = await loadMorphology("ru/rules/irregular.txt")
//   ru.conj("читать", "pres", 0) -> "читаю"       persons 0..5: я ты он мы вы они;  tenses: pres past(+g) imp inf
//   ru.noun(entry, "gen", false) -> "книги"       cases: nom gen dat acc ins prep;  { animate }
//   ru.adj(entry, "gen", "f", false) -> "новой"    adjForm(a, kase, g, pl, { animate, short })

export const CASES = ["nom", "gen", "dat", "acc", "ins", "prep"];
const VOW = "аеёиоуыэюя", isV = (ch) => VOW.includes(ch);
const HUSH = /[жшчщ]$/, VELAR = /[гкх]$/, SIB = /[жшчщц]$/;
// (the spelling rule: after г к х ж ш ч щ no ы, after them and ц no я ю; an unstressed о after a husher or ц is е)
const spell = (stem, end) => {
  if (/[гкхжшчщ]$/.test(stem) && end.startsWith("ы")) end = "и" + end.slice(1);
  if (/[гкхжшчщц]$/.test(stem) && end.startsWith("я")) end = "а" + end.slice(1);
  if (/[гкхжшчщц]$/.test(stem) && end.startsWith("ю")) end = "у" + end.slice(1);
  return stem + end;
};
// the genitive plural's bare stem gets a vowel between its last two consonants (девушка -> девушек, сумка -> сумок,
// окно -> окон, письмо -> писем, сестра -> сестер): е after a husher, й or ь (which go), о before к or н, else е
const fleeting = (stem) => {
  const m = stem.match(/^(.*?)([^аеёиоуыэюяь])([ьй]?)([^аеёиоуыэюяьй])$/);
  if (!m) return stem;
  const [, head, c1, soft, c2] = m;
  if (c1 === "с" && c2 === "т" || c1 === "з" && c2 === "д" || c1 === "н" && c2 === "т" || c1 === "р" && c2 === "т" || c2 === "в") return stem;   // (место -> мест, карта -> карт, богатство -> богатств: no vowel in these clusters)
  const v = soft || /[жшчщ]/.test(c1) ? "е" : /[кн]/.test(c2) && !/[жшчщй]/.test(c1) ? "о" : "е";
  return head + c1 + v + c2;
};
// a hard ending made soft (for a soft stem: -ь, -й, -я, -е): а->я, ы->и, о->е, у->ю, ом->ем, ой->ей
const soften = (end) => end.replace(/^а/, "я").replace(/^ы/, "и").replace(/^о/, "е").replace(/^у/, "ю");

// ---- NOUNS ---------------------------------------------------------------------------------------------------------
// the declension class of a noun: its stem and whether it is soft, by its gender and nominative
function nounClass(e) {
  const w = e.word, g = e.gender;
  if (/ия$/.test(w)) return { stem: w.slice(0, -1), soft: true, kind: "ия" };
  if (/ие$/.test(w)) return { stem: w.slice(0, -1), soft: true, kind: "ие" };
  if (/ий$/.test(w)) return { stem: w.slice(0, -1), soft: true, kind: "ий" };
  if (/мя$/.test(w) && g === "с") return { stem: w.slice(0, -1), soft: true, kind: "мя" };          // время, имя
  if (/[ая]$/.test(w)) return { stem: w.slice(0, -1), soft: /я$/.test(w), kind: "a" };          // книга, неделя, папа
  if (/[ое]$/.test(w) && g !== "м") return { stem: w.slice(0, -1), soft: /е$/.test(w), kind: "o" };   // окно, море
  if (/ь$/.test(w)) return { stem: w.slice(0, -1), soft: true, kind: g === "ж" ? "ж-ь" : "м-ь" };   // ночь; день
  if (/й$/.test(w)) return { stem: w.slice(0, -1), soft: true, kind: "й" };                          // музей
  return { stem: w, soft: false, kind: "c" };                                                      // стол
}
// the endings by class: [nom gen dat acc ins prep] singular, plural -- `=` the nominative (an inanimate accusative),
// `-` the bare stem, `G` the genitive (an animate accusative)
const N_ENDS = {
  c:    { sg: ["-", "а", "у", "=", "ом", "е"], pl: ["ы", "ов", "ам", "=", "ами", "ах"] },
  "й":  { sg: ["й", "я", "ю", "=", "ем", "е"], pl: ["и", "ев", "ям", "=", "ями", "ях"] },
  "ий": { sg: ["й", "я", "ю", "=", "ем", "и"], pl: ["и", "ев", "ям", "=", "ями", "ях"] },
  "м-ь": { sg: ["ь", "я", "ю", "=", "ем", "е"], pl: ["и", "ей", "ям", "=", "ями", "ях"] },
  a:    { sg: ["а", "ы", "е", "у", "ой", "е"], pl: ["ы", "-", "ам", "=", "ами", "ах"] },
  "ия": { sg: ["я", "и", "и", "ю", "ей", "и"], pl: ["и", "й", "ям", "=", "ями", "ях"] },
  o:    { sg: ["о", "а", "у", "=", "ом", "е"], pl: ["а", "-", "ам", "=", "ами", "ах"] },
  "ие": { sg: ["е", "я", "ю", "=", "ем", "и"], pl: ["я", "й", "ям", "=", "ями", "ях"] },
  "ж-ь": { sg: ["ь", "и", "и", "=", "ью", "и"], pl: ["и", "ей", "ям", "=", "ями", "ях"] },   // (ночам, ночами after a husher: below)
  "мя": { sg: ["я", "ени", "ени", "=", "енем", "ени"], pl: ["ена", "ён", "енам", "=", "енами", "енах"] },   // (the stem without я: врем + ени)
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
  const own = (w) => irr.get(w) ?? null;

  // A NOUN'S FORM: entry { word, gender, plural, model }, the case, plural?, { animate }
  function noun(e, kase, pl = false, { animate = false } = {}) {
    const ir = own(e.word) ?? {};
    const k = CASES.indexOf(kase);
    if (k < 0) return e.word;
    if (e.model === "нескл" || e.word.includes(" ")) return e.word;   // (кофе, метро: one form; a phrase as it is)
    if (e.gender === "мн") pl = true;
    const cls = nounClass(e), ends = N_ENDS[cls.kind] ?? N_ENDS.c;
    const given = pl ? { nom: ir.pl ?? (e.plural && e.plural !== "-" ? e.plural : null), gen: ir.gpl, dat: ir.dpl, acc: ir.apl, ins: ir.ipl, prep: ir.ppl }[kase] : { nom: e.word, gen: ir.gen, dat: ir.dat, acc: ir.acc, ins: ir.ins, prep: ir.prep }[kase];
    if (given && kase !== "acc") return given;
    if (kase === "acc") {   // (the accusative: an animate masculine's and every animate plural's is the genitive; else the nominative, or its own -у / -ю)
      const anim = animate || e.animate;
      if (pl) return given ?? (anim ? noun(e, "gen", true) : noun(e, "nom", true));
      if (given) return given;
      if (anim && (cls.kind === "c" || cls.kind === "й" || cls.kind === "ий" || cls.kind === "м-ь")) return noun(e, "gen", false);
      if (ends.sg[3] === "=") return e.word;
    }
    // the stem: an oblique one given (дн, матер), else the nominative's; a plural stem from a given plural (люди -> люд)
    let stem = (kase !== "nom" || pl) && ir.stem && cls.kind !== "мя" ? ir.stem : cls.stem;
    if (pl && kase !== "nom" && (ir.pl || (e.plural && e.plural !== "-" && e.plural !== e.word))) {
      const np = ir.pl ?? e.plural;
      if (/[ыиаяе]$/.test(np) && !ir.stem) stem = np.slice(0, -1);   // (граждане -> граждан, люди -> люд: the plural's stem)
    }
    let end = ends[pl ? "pl" : "sg"][k];
    if (end === "=") end = ends[pl ? "pl" : "sg"][0];
    if (pl && kase === "gen" && end === "-") {   // (the bare stem: книг, окон -- a soft stem takes ь or й: недель, семей)
      if (cls.kind === "a" && cls.soft) return /и$/.test(stem) ? stem.slice(0, -1) + "ий" : /й$/.test(stem) ? stem : /ь$/.test(stem) ? stem.slice(0, -1) + "ей" : /[^аеёиоуыэюя][^аеёиоуыэюя]$/.test(stem) ? stem.replace(/(.)$/, "е$1") + (/[лн]$/.test(stem) && !/н$/.test(stem) ? "ь" : "") : stem + "ь";   // (недель, идей, семей, вафель, песен)
      if (cls.kind === "o" && cls.soft) return stem + "ей";
      return fleeting(stem);
    }
    if (end === "-") return stem;
    if (cls.soft && cls.kind !== "ия" && cls.kind !== "ие" && cls.kind !== "ж-ь" && cls.kind !== "мя") end = soften(end);
    if (cls.kind === "ж-ь" && pl && HUSH.test(stem)) end = end.replace(/^я/, "а");   // (ночам, ночами, ночах)
    if (cls.kind === "c" && pl && kase === "gen" && HUSH.test(stem)) end = "ей";                  // (ножей, врачей)
    if (cls.kind === "c" && pl && kase === "gen" && /ц$/.test(stem)) end = "ев";                  // (месяцев; отцов is stressed: irregular)
    if (cls.kind === "c" && kase === "ins" && !pl && SIB.test(stem) && !ir.stress) end = "ем";    // (мужем, месяцем -- ножом is stressed: irregular `ins`)
    if (cls.kind === "a" && kase === "ins" && !pl && SIB.test(stem)) end = "ей";                  // (кашей, улицей)
    return spell(stem, end);
  }
  const plural = (e) => noun(e, "nom", true);

  // ---- ADJECTIVES: the long form agreeing with a noun; hard (новый, большой), soft (синий), velar / husher stems ------
  // (a hushed or velar stem spells ий ие им их; an unstressed о after a husher is е: хорошего; stressed -ой keeps о: большого)
  const ADJ = {
    m: ["ый", "ого", "ому", "=", "ым", "ом"], f: ["ая", "ой", "ой", "ую", "ой", "ой"], n: ["ое", "ого", "ому", "=", "ым", "ом"], pl: ["ые", "ых", "ым", "=", "ыми", "ых"],
  };
  const SOFT_ADJ = {
    m: ["ий", "его", "ему", "=", "им", "ем"], f: ["яя", "ей", "ей", "юю", "ей", "ей"], n: ["ее", "его", "ему", "=", "им", "ем"], pl: ["ие", "их", "им", "=", "ими", "их"],
  };
  function adj(a, kase, g = "m", pl = false, { animate = false } = {}) {
    const w = a.word ?? a;
    if (w.includes(" ") || !/(ый|ой|ий)$/.test(w)) return w;   // (an indeclinable or a phrase)
    const stem = w.slice(0, -2), soft = /ий$/.test(w) && !/[гкхжшчщ]$/.test(stem), stressed = /ой$/.test(w);
    const k = CASES.indexOf(kase), G = pl ? "pl" : g === "ж" || g === "f" ? "f" : g === "с" || g === "n" ? "n" : "m";
    const T = soft ? SOFT_ADJ : ADJ;
    let end = T[G][k];
    if (G === "m" && k === 0) end = soft || /[гкхжшчщ]$/.test(stem) && !stressed ? "ий" : stressed ? "ой" : "ый";
    if (end === "=") end = (G === "m" || G === "pl") && (animate || a.animate) ? T[G][1] : T[G][0] === "ый" ? (soft || /[гкхжшчщ]$/.test(stem) && !stressed ? "ий" : stressed ? "ой" : "ый") : T[G][0];
    if (!soft) {
      if (/[гкхжшчщ]$/.test(stem)) end = end.replace(/^ы/, "и");
      if (HUSH.test(stem) && !stressed) end = end.replace(/^о/, "е");   // (хорошего, хорошему, хорошее, хорошей)
      if (HUSH.test(stem) && !stressed && end === "ую") end = "ую";
    }
    return stem + end;
  }
  const adjForm = adj;
  // the comparative (новее; irregular: больше, лучше) and the superlative (самый + adj)
  const compare = (a) => {
    if (a.comparison || own(a.word)?.comp) return a.comparison || own(a.word).comp;
    if (!/(ый|ой|ий)$/.test(a.word) || /ский$/.test(a.word)) return "более " + a.word;
    const stem = a.word.slice(0, -2);
    if (/[кгх]$/.test(stem)) return stem.replace(/к$/, "ч").replace(/г$/, "ж").replace(/х$/, "ш") + "е";   // (громче, дороже, тише)
    return stem + "ее";
  };
  // the short form (рад, рада, рады; the predicate of a few adjectives) -- m: stem, f: +а, n: +о, pl: +ы
  const short = (a, g, pl) => { const stem = a.word.slice(0, -2); return pl ? spell(stem, "ы") : g === "f" ? stem + "а" : g === "n" ? spell(stem, "о") : stem; };
  // the adverb of an adjective: быстрый -> быстро, хороший -> хорошо (irregular ones are dictionary words)
  const adverb = (a) => own(a.word)?.adv || (/ский$/.test(a.word) ? "по-" + a.word.slice(0, -1) : /ий$/.test(a.word) && !/[гкхжшчщ]ий$/.test(a.word) ? a.word.slice(0, -2) + "е" : a.word.slice(0, -2) + "о");

  // ---- POSSESSIVES AND DEMONSTRATIVES -------------------------------------------------------------------------------
  // мой твой свой (soft: моего моему моим моём; моя моей мою; моё; мои моих моим моими); наш ваш (нашего нашему нашим нашем;
  // наша нашей нашу; наше; наши наших нашим нашими); этот (этого этому этим этом; эта этой эту; это; эти этих этим этими);
  // тот (того тому тем том; та той ту; то; те тех тем теми); весь (всего всему всем всём; вся всей всю; всё; все всех всем всеми);
  // его её их do not change
  const PRON_DECL = {
    "мой": { m: ["мой", "моего", "моему", "=", "моим", "моём"], f: ["моя", "моей", "моей", "мою", "моей", "моей"], n: ["моё", "моего", "моему", "моё", "моим", "моём"], pl: ["мои", "моих", "моим", "=", "моими", "моих"] },
    "наш": { m: ["наш", "нашего", "нашему", "=", "нашим", "нашем"], f: ["наша", "нашей", "нашей", "нашу", "нашей", "нашей"], n: ["наше", "нашего", "нашему", "наше", "нашим", "нашем"], pl: ["наши", "наших", "нашим", "=", "нашими", "наших"] },
    "этот": { m: ["этот", "этого", "этому", "=", "этим", "этом"], f: ["эта", "этой", "этой", "эту", "этой", "этой"], n: ["это", "этого", "этому", "это", "этим", "этом"], pl: ["эти", "этих", "этим", "=", "этими", "этих"] },
    "тот": { m: ["тот", "того", "тому", "=", "тем", "том"], f: ["та", "той", "той", "ту", "той", "той"], n: ["то", "того", "тому", "то", "тем", "том"], pl: ["те", "тех", "тем", "=", "теми", "тех"] },
    "весь": { m: ["весь", "всего", "всему", "=", "всем", "всём"], f: ["вся", "всей", "всей", "всю", "всей", "всей"], n: ["всё", "всего", "всему", "всё", "всем", "всём"], pl: ["все", "всех", "всем", "=", "всеми", "всех"] },
    "один": { m: ["один", "одного", "одному", "=", "одним", "одном"], f: ["одна", "одной", "одной", "одну", "одной", "одной"], n: ["одно", "одного", "одному", "одно", "одним", "одном"], pl: ["одни", "одних", "одним", "=", "одними", "одних"] },
    "чей": { m: ["чей", "чьего", "чьему", "=", "чьим", "чьём"], f: ["чья", "чьей", "чьей", "чью", "чьей", "чьей"], n: ["чьё", "чьего", "чьему", "чьё", "чьим", "чьём"], pl: ["чьи", "чьих", "чьим", "=", "чьими", "чьих"] },
  };
  function pronAdj(base, kase, g = "m", pl = false, { animate = false } = {}) {
    if (/^(его|её|их)$/.test(base)) return base;
    const like = base in PRON_DECL ? base : /^(твой|свой)$/.test(base) ? "мой" : base === "ваш" ? "наш" : null;
    if (!like) return adj({ word: base }, kase, g, pl, { animate });
    const T = PRON_DECL[like], G = pl ? "pl" : g === "ж" || g === "f" ? "f" : g === "с" || g === "n" ? "n" : "m", k = CASES.indexOf(kase);
    let f = T[G][k];
    if (f === "=") f = (G === "m" || G === "pl") && animate ? T[G][1] : T[G][0];
    return base === like ? f : like === "мой" ? base.slice(0, -2) + f.slice(1) : base[0] + f.slice(1);   // (твой: тв + оего; ваш: в + ашего)
  }

  // ---- VERBS ---------------------------------------------------------------------------------------------------------
  // the second conjugation's 1sg mutations: д->ж, т->ч, с->ш, з->ж, ст->щ, ск->щ; a labial takes л
  const mutate = (stem) => stem.replace(/ст$/, "щ").replace(/ск$/, "щ").replace(/д$/, "ж").replace(/т$/, "ч").replace(/с$/, "ш").replace(/з$/, "ж").replace(/([бпвфм])$/, "$1л");
  const refl = (v) => /(ся|сь)$/.test(v);
  const bare = (v) => v.replace(/(ся|сь)$/, "");
  const withRefl = (form, isRefl) => (isRefl && !/(ся|сь)$/.test(form) ? form + (/[аеёиоуыэюя]$/.test(form) ? "сь" : "ся") : form);
  // the class of a verb by its infinitive: { conj: 1|2, stem (for the present), theme }
  function verbClass(inf, ir) {
    if (ir.conj === "2" || ir.conj === 2) return { conj: 2, stem: inf.replace(/(ить|еть|ать|ять)$/, "") };
    if (/овать$/.test(inf)) return { conj: 1, stem: inf.slice(0, -5) + "у", vowel: true };
    if (/евать$/.test(inf)) return { conj: 1, stem: inf.slice(0, -5) + "ю", vowel: true };
    if (/авать$/.test(inf)) return { conj: 1, stem: inf.slice(0, -4), vowel: true, stressedEnd: true };   // (даю, даёшь)
    if (/нуть$/.test(inf)) return { conj: 1, stem: inf.slice(0, -3), vowel: false };
    if (/ить$/.test(inf) && inf.length > 4) return { conj: 2, stem: inf.slice(0, -3) };
    if (/[аеия]ять$/.test(inf)) return { conj: 1, stem: inf.slice(0, -3), vowel: true };   // (смеяться смеюсь, надеяться надеюсь, таять таю, сеять сею)
    if (/[ая]ть$/.test(inf)) return { conj: 1, stem: inf.slice(0, -2), vowel: true };
    if (/еть$/.test(inf)) return { conj: 1, stem: inf.slice(0, -2), vowel: true };
    if (/ыть$/.test(inf)) return { conj: 1, stem: inf.slice(0, -3) + "о", vowel: true };   // (мыть -> мою)
    return { conj: 1, stem: inf.slice(0, -2), vowel: true };
  }
  // the present (a perfective's: its future), the person 0..5; `stress` from the entry's IPA decides е / ё in the endings
  function present(verb, p, { regular = false, stressedEnd = null } = {}) {
    const isRefl = refl(verb), inf = bare(verb), ir = regular ? {} : own(inf) ?? own(verb) ?? {};
    if (!regular && Array.isArray(ir.pres)) return withRefl(ir.pres[p], isRefl);
    if (!regular && p === 0 && ir.pres1) return withRefl(ir.pres1, isRefl);
    const c = verbClass(inf, ir);
    const endStress = stressedEnd ?? c.stressedEnd ?? false;
    if (c.conj === 2) {
      const E = ["ю", "ишь", "ит", "им", "ите", "ят"];
      let stem = c.stem, e = E[p];
      if (p === 0) { stem = mutate(stem); e = /[жшчщ]$/.test(stem) ? "у" : "ю"; }
      if (p === 5 && /[жшчщ]$/.test(stem)) e = "ат";
      return withRefl(stem + e, isRefl);
    }
    const E = c.vowel ? ["ю", "ешь", "ет", "ем", "ете", "ют"] : ["у", "ешь", "ет", "ем", "ете", "ут"];
    let e = E[p];
    if (endStress && /^е/.test(e) && (!c.vowel || c.stressedEnd)) e = "ё" + e.slice(1);   // (идёшь, вернёшь, даёшь -- not читаешь: its stem ends in the vowel)
    return withRefl(c.stem + e, isRefl);
  }
  // the past: читал читала читало читали; -ти/-чь verbs from the irregular file
  function past(verb, g = "m", pl = false, { regular = false } = {}) {
    const isRefl = refl(verb), inf = bare(verb), ir = regular ? {} : own(inf) ?? own(verb) ?? {};
    const k = pl ? 3 : g === "f" || g === "ж" ? 1 : g === "n" || g === "с" ? 2 : 0;
    if (!regular && Array.isArray(ir.past)) return withRefl(ir.past[k], isRefl);
    const stem = /ть$/.test(inf) ? inf.slice(0, -2) : inf.replace(/(ти|чь)$/, "");
    const form = stem + ["л", "ла", "ло", "ли"][k];
    return withRefl(form, isRefl);
  }
  // the imperative: читай(те), говори(те), пиши(те), готовь(те) -- from the 3pl stem: after a vowel й, after a consonant и
  // when the stress falls on the endings (говорю: говори), ь when it stays on the stem (готовлю: готовь)
  function imperative(verb, pl = false, { stressedEnd = true } = {}) {
    const isRefl = refl(verb), inf = bare(verb), ir = own(inf) ?? own(verb) ?? {};
    if (Array.isArray(ir.imp)) return withRefl(ir.imp[pl ? 1 : 0], isRefl);
    const they = bare(present(verb, 5)), stem = they.replace(/(ут|ют|ат|ят)$/, "");   // (a reflexive's own present line is seen: вернутся -> вернут)
    const base = /[аеёиоуыэюя]$/.test(stem) ? stem + "й" : !stressedEnd && /[аеёиоуыэюя][^аеёиоуыэюя]$/.test(stem) ? stem + "ь" : stem + "и";
    return withRefl(base + (pl ? "те" : ""), isRefl);
  }
  // the past passive participle's short form (куплен, куплена, куплено, куплены; прочитан; открыт) of a perfective
  function ppp(verb, g = "m", pl = false) {
    const inf = bare(verb), ir = own(inf) ?? {};
    const k = pl ? 3 : g === "f" || g === "ж" ? 1 : g === "n" || g === "с" ? 2 : 0;
    if (Array.isArray(ir.ppp)) return ir.ppp[k];
    let stem;
    if (/ить$/.test(inf)) stem = mutate(inf.slice(0, -3)).replace(/л$/, "л") + "ен";
    else if (/(ать|ять)$/.test(inf)) stem = inf.slice(0, -2) + "н";
    else if (/(нуть|ыть|оть|ереть|ить)$/.test(inf) || inf.length <= 5) stem = inf.slice(0, -2) + "т";
    else stem = inf.slice(0, -3) + "ен";
    if (/ить$/.test(inf) && /[бпвфм]л?ен$/.test(stem) && !/лен$/.test(stem)) stem = stem.replace(/ен$/, "лен");
    return stem + ["", "а", "о", "ы"][k];
  }
  // the gerund: imperfective from the present (читая, говоря, смеясь), perfective from the past (сказав, вернувшись)
  function gerund(verb, { perfective = false } = {}) {
    const isRefl = refl(verb);
    if (perfective) { const pa = bare(past(verb, "m")); return pa.replace(/л$/, "в") + (isRefl ? "шись" : "") ; }
    const they = bare(present(verb, 5)), stem = they.replace(/(ут|ют|ат|ят)$/, "");
    return stem + (/[жшчщ]$/.test(stem) ? "а" : "я") + (isRefl ? "сь" : "");
  }
  // one form by tense: pres (0..5), past (g, pl), imp (pl), inf, ppp, ger; `regular`: by the rules alone (the trainer's
  // wrong forms). A verb of several words (стоять на коленях): its first word conjugated, the rest as written
  function conj(verb, tense, p = 2, opts = {}) {
    if (verb.includes(" ")) { const [h, ...r] = verb.split(" "); return [conj(h, tense, p, opts), ...r].join(" "); }
    const { regular = false, g = "m", pl = false, stressedEnd = null } = opts;
    if (tense === "ger") return gerund(verb, { perfective: !!opts.perfective });
    if (tense === "pres") return present(verb, p, { regular, stressedEnd });
    if (tense === "past") return past(verb, g, pl, { regular });
    if (tense === "imp") return imperative(verb, pl, { stressedEnd: stressedEnd ?? true });
    if (tense === "ppp") return ppp(verb, g, pl);
    return verb;
  }
  // (is the verb's ending stressed, from its IPA: читать [tɕɪˈtatʲ] -> yes -- а of -ать stressed; the ё of даёшь, идёшь)
  const IPA_V = "aeiouyæɒɜɑʌɪʊəøœɛɔʏɐɨɤ";
  const endStressed = (e) => {
    const ipa = (e?.ipa ?? "").replace(/sʲ?ə$/, ""), i = ipa.indexOf("ˈ");   // (a reflexive's -ся set aside)
    if (i < 0) return false;
    return [...ipa.slice(i + 1)].filter((ch) => IPA_V.includes(ch)).length === 1;   // (the stressed vowel is the last: читать, идти)
  };
  return { conj, noun, plural, adj, adjForm, compare, short, adverb, pronAdj, irregular: (v) => own(bare(v)), endStressed, mutate };
}

// AGREEMENT helpers shared with engine/paradigm.js: a noun's plural needs the loaded morphology (the irregular file), so
// paradigm.js takes them from the loaded object; these are the stateless ones
export const genderOf = (e) => (e.gender === "ж" ? "f" : e.gender === "с" ? "n" : e.gender === "мн" ? "pl" : "m");
