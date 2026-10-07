// The dictionary: deutsch.tsv (made by tools/compile.py) read into entries, each with its rank in order.tsv
// (made by tools/order.py: the words by how common they are), the order in which new words come.

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

export async function loadDictionary(dictionaryUrl, orderUrl) {
  const [rows, ranks] = await Promise.all([readTable(dictionaryUrl), readTable(orderUrl)]);
  const rankOf = new Map(ranks.map(row => [`${row.word}|${row.pos}`, Number(row.rank)]));

  const entries = rows.map((entry, order) => {
    entry.freq = Number(entry.freq);
    entry.sk = entry.sk.split(" | ");
    entry.comb = entry.comb ? entry.comb.split(" | ") : [];
    entry.id = `${entry.word}|${entry.pos}|${entry.sk[0]}`;   // an entry's identity (README): word, POS, first meaning
    entry.order = order;                                      // file order: a main word, then its family
    entry.rank = rankOf.get(`${entry.word}|${entry.pos}`) ?? Infinity;   // 1 = the commonest word
    return entry;
  });

  const byCategory = {};
  for (const entry of entries) (byCategory[entry.category] ??= []).push(entry);
  return { entries, byCategory };
}

// How an entry is shown
export const german = e => (e.article ? e.article + " " : "") + e.word;
export const slovak = e => e.sk.slice(0, 2).join(", ");

export function details(e) {
  let text = german(e) + (e.ipa ? ` [${e.ipa}]` : "");
  if (e.plural === "PL") text += ", plural only";
  else if (e.plural && e.plural !== "-") text += `, die ${e.plural}`;
  if (e.forms) text += `, ${e.forms}`;
  if (e.comparison) text += `, ${e.comparison}`;
  if (e.comb.length) text += ` (${e.comb.join(", ")})`;
  return `${text} = ${e.sk.join(", ")}`;
}

// ---- HOW AN ENTRY SOUNDS (speak.js): its IPA, a noun's with its article ----------------------------------------
const ARTICLE_IPA = { der: "deːɐ", die: "diː", das: "das" };
export const spoken = (e) => (ARTICLE_IPA[e.article] ? ARTICLE_IPA[e.article] + " " : "") + e.ipa;

// THE PLURAL'S IPA, from the singular's (the dictionary writes only the singular's): what the plural's spelling adds
// at the end (-e, -en, -n, -er, -s, -nen, -se, -ten), the umlaut of one vowel of the stem (Haus -> Häuser, also in a
// compound: Gewächshaus -> Gewächshäuser), a Latin or Greek ending swapped (Museum -> Museen, Risiko -> Risiken,
// Stadion -> Stadien), and the last consonant voiced again before an ending that starts with a vowel (Tag [taːk] ->
// Tage [taːɡə], Haus -> Häuser [hɔʏzɐ]). null when the plural is something else -- it is then not spoken.
const ENDING_IPA = { "": "", e: "ə", en: "ən", n: "n", er: "ɐ", s: "s", nen: "nən", se: "sə", ten: "tən" };
const SWAPS = [   // [singular's tail, its IPA, the plural's tail, its IPA]
  ["um", /[ʊu]ː?m$/, "en", "ən"], ["us", /[ʊu]ː?s$/, "en", "ən"], ["um", /[ʊu]ː?m$/, "a", "a"], ["us", /[ʊu]ː?s$/, "i", "i"],
  ["a", /aː?$/, "en", "ən"], ["o", /oː?$/, "en", "ən"], ["is", /ɪs$/, "en", "ən"], ["on", /(oː|ɔ)n$/, "ien", "iən"], ["on", /(oː|ɔ)n$/, "en", "ən"]];
const UMLAUT = { a: "ä", o: "ö", u: "ü", A: "Ä", O: "Ö", U: "Ü" };
const UMLAUT_IPA = [["aʊ", "ɔʏ"], ["aː", "ɛː"], ["a", "ɛ"], ["oː", "øː"], ["ɔ", "œ"], ["o", "ø"], ["uː", "yː"], ["ʊ", "ʏ"], ["u", "y"]];
const VOICED = { p: "b", t: "d", k: "ɡ", s: "z", "ç": "ɡ" };
// the stem's LAST vowel that can take an umlaut, in the IPA (a diphthong's whole: aʊ, not its ʊ)
function umlautIPA(ipa) {
  for (let k = ipa.length - 1; k >= 0; k--) for (const [from, to] of UMLAUT_IPA) {
    if (ipa.startsWith(from, k) && !(from.length === 1 && "ʊ".includes(from) && ipa[k - 1] === "a")) return ipa.slice(0, k) + to + ipa.slice(k + from.length);
  }
  return null;
}
export function pluralIPA(e) {
  const sg = e.word, pl = e.plural.split("/")[0];
  if (!pl || pl === "-" || pl === "PL" || pl.includes(" ")) return null;
  if (pl === sg) return e.ipa;
  for (const [tail, re, plTail, plIPA] of SWAPS)
    if (sg.endsWith(tail) && pl === sg.slice(0, -tail.length) + plTail && re.test(e.ipa)) return e.ipa.replace(re, "") + plIPA;
  // the plural as the singular (one vowel umlauted, or none) and an ending
  let stem = null, ipa = e.ipa;
  if (pl.startsWith(sg)) stem = sg;
  else for (let i = sg.length - 1; i >= 0 && !stem; i--) {
    if (!UMLAUT[sg[i]] || (sg[i] === "u" && sg[i - 1] === "a")) continue;   // (in au the a takes the umlaut: Haus -> Häus-)
    const cand = sg.slice(0, i) + UMLAUT[sg[i]] + sg.slice(i + 1);
    if (pl.startsWith(cand)) { stem = cand; ipa = umlautIPA(e.ipa); }
  }
  const ending = stem && pl.slice(stem.length);
  if (!ipa || ending === null || !(ending in ENDING_IPA)) return null;
  let add = ENDING_IPA[ending];
  if (add.startsWith("s") && ipa.endsWith("s")) add = add.slice(1);   // (Bus -> Busse: one s)
  // the last consonant voiced again before a vowel: only where the spelling says it was voiced (Tag, Hund, Haus, König)
  if (/^[ae]/.test(ending) && /[bdgs]$/.test(sg) && !/ss$/.test(sg)) {
    const m = ipa.match(/(ç|[ptks])$/);
    if (m) ipa = ipa.slice(0, -m[1].length) + (sg.endsWith("s") ? "z" : VOICED[m[1]]);
  }
  return ipa + add;
}
