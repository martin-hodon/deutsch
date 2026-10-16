// CHINESE MORPHOLOGY: there is none to conjugate or decline -- what the realizer (zh/realize.js) and the trainer's forms
// exercise (engine/paradigm.js) need of a word is its MEASURE WORD (the dictionary's: 一本书) and the ASPECT PARTICLES
// a verb takes (了 过 着), plus the plural suffix 们 of a person noun or pronoun. zh/rules/classifiers.txt lists the
// common measure words (the wrong options of the measure-word exercise) and the nouns that are persons (们).
//
//   const zh = await loadMorphology("zh/rules/classifiers.txt")
//   zh.classifier(entry) -> "本"      zh.CLASSIFIERS -> ["个", "本", ...]      zh.PARTICLES -> ["了", "过", "着"]

export const PARTICLES = ["了", "过", "着"];
export const plural = (e) => e.word;   // (no plural form: the noun as it is; 们 is the realizer's for persons)

export async function loadMorphology(url) {
  const text = await (await fetch(url)).text().catch(() => "");
  const lists = {};
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const [k, rest = ""] = s.split(/\s*:\s*/, 2);
    lists[k] = rest.split(/\s+/).filter(Boolean);
  }
  const CLASSIFIERS = lists.classifiers ?? ["个", "本", "张", "只", "条", "把", "件", "辆", "杯", "瓶", "块", "位", "家", "口", "双", "支", "封", "套", "顶", "棵", "朵", "座", "间", "台", "部", "篇", "首", "场", "顿", "节", "门", "片", "颗", "头", "匹", "艘", "架", "幅", "份", "群"];
  const classifier = (e) => e.classifier || "个";
  return { classifier, CLASSIFIERS, PARTICLES, plural, conj: (v) => v, irregular: () => null };
}
