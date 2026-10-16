// A dictionary: <lang>/dict.tsv (made by tools/compile.py, tools/en.py) read into entries, each with its rank in
// <lang>/order.tsv (made by tools/order.py: the words by how common they are; without one, the file order), the order
// in which new words come; byConcept: a concept's entries (`POS|ID`), where two languages meet.

// A tab-separated file with a header line -> a list of objects
async function readTable(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const [header, ...lines] = (await response.text()).trim().split("\n");
  const columns = header.split("\t");
  return lines.map(line => {
    const fields = line.split("\t");
    return Object.fromEntries(columns.map((column, i) => [column, fields[i] ?? ""]));
  });
}

export async function loadDictionary(dictionaryUrl, orderUrl, lang = "de") {
  const [rows, ranks] = await Promise.all([readTable(dictionaryUrl), readTable(orderUrl).catch(() => [])]);
  const rankOf = new Map(ranks.map(row => [`${row.word}|${row.pos}`, Number(row.rank)]));

  const senses = {};
  const entries = rows.map((entry, order) => {
    entry.freq = Number(entry.freq);
    entry.sk = entry.sk.split(" | ");
    entry.comb = entry.comb ? entry.comb.split(" | ") : [];
    entry.id = `${entry.word}|${entry.pos}|${entry.sk[0]}`;   // an entry's identity (README): word, POS, first meaning
    entry.concept = entry.sk[0];                              // its CONCEPT (DESIGN.md): the first Slovak word is its ID
    entry.cid = entry.concept.replace(/ /g, "_");             // ... as a token of the world's data (tešiť_sa)
    entry.order = order;                                      // file order: a main word, then its family
    entry.sense = (senses[`${entry.word}|${entry.pos}`] = (senses[`${entry.word}|${entry.pos}`] ?? -1) + 1);   // 0 its word's first sense, 1 another (schlagen: biť, rozbiť ...)
    entry.rank = rankOf.get(`${entry.word}|${entry.pos}`) ?? Infinity;   // 1 = the commonest word
    entry.lang = lang;
    return entry;
  });

  const byCategory = {}, byGroup = {}, byConcept = new Map();   // (a group: a category's first level -- humans of humans/body)
  for (const entry of entries) {
    entry.group = entry.category.split("/")[0];
    (byCategory[entry.category] ??= []).push(entry);
    (byGroup[entry.group] ??= []).push(entry);
    const k = `${entry.pos}|${entry.concept}`;
    (byConcept.get(k) ?? byConcept.set(k, []).get(k)).push(entry);
  }
  // (how an article sounds: the dictionary's own ART entries -- der [deːɐ], el [el], le [lə])
  const articleIPA = new Map(entries.filter((e) => e.pos === "ART" && e.ipa).map((e) => [e.word, e.ipa]));
  return { entries, byCategory, byGroup, byConcept, lang, articleIPA };
}

// How an entry is shown: its word, a noun with its article (der Tisch, the plain word in English)
export const shown = e => (e.article ? e.article + (e.article.endsWith("'") ? "" : " ") : "") + e.word;   // (l'eau)
export const german = shown;
export const slovak = e => e.sk.slice(0, 2).join(", ");

export function details(e) {
  let text = shown(e) + (e.pinyin ? ` ${e.pinyin}` : e.ipa ? ` [${e.ipa}]` : "");   // (Chinese: the pinyin, not the IPA)
  if (e.plural === "PL") text += ", plural only";
  else if (e.plural && e.plural !== "-") text += `, ${e.lang === "de" ? "die " : ""}${e.plural}`;
  if (e.gender && (e.lang === "ru" || e.lang === "pl")) text += `, ${e.gender}`;
  if (e.classifier) text += `, ${e.classifier}`;
  if (e.forms) text += `, ${e.forms}`;
  if (e.comparison) text += `, ${e.comparison}`;
  if (e.comb.length) text += ` (${e.comb.join(", ")})`;
  return `${text} = ${e.sk.join(", ")}`;
}

// ---- HOW AN ENTRY SOUNDS (speak.js): its IPA, a noun's with its article (the dictionary's ART entry: der Hund
// [deːɐ hʊnt], l'eau [lo]) -- dict: the entry's dictionary (loadDictionary) ------------------------------------------
export function spoken(e, dict) {
  const a = e.article && dict?.articleIPA?.get(e.article.replace(/'$/, "")) || "";
  return a ? (e.article.endsWith("'") ? a : a + " ") + e.ipa : e.ipa;   // (l' joins its noun)
}
