// THE ORDER OF ADJECTIVES OF A LANGUAGE (<lang>/rules/adjectives.txt): two or more adjectives of DIFFERENT kinds on one
// noun (world/adjorder.txt, meaning.adjKind -- big a size, red a colour) stand in the language's order, without a comma:
// a big old dog, une voiture allemande rouge, 漂亮的大黑狗. One ranking -- the kinds' distance from the noun -- gives both
// sides: before the noun the farthest first, after it the nearest first. The realizers (engine/lexicon.js for the
// others, engine/sentences.js for German) read it; a list of one kind keeps the plan's order and its comma.
//
//   const ao = await loadAdjOrder(base, lang, meaning)
//   ao.cumulative(adjs)      each two neighbours of two kinds: an order, no comma (else a list)
//   ao.before(adjs)          those of them before the noun, farthest first (AFTER kinds left out)
//   ao.after(adjs)           those after the noun (AFTER kinds), nearest first
//   ao.outward(adjs), ao.inward(adjs)   all of them farthest first / nearest first -- for a language that places its
//                            adjectives by a word list of its own (French beau, vieux before; the rest after)
//   ao.bare(a)               (Chinese) said without 的, next to the noun

export async function loadAdjOrder(base, lang, meaning) {
  const r = await fetch(`${base}${lang}/rules/adjectives.txt`).catch(() => null);
  const lines = r?.ok ? (await r.text()).split("\n").map((s) => s.split(/\s--\s/)[0].trim()).filter((s) => s && !s.startsWith("#")) : [];
  const line = (key) => (lines.find((s) => s.split(/\s+/)[0] === key) ?? "").split(/\s+/).slice(1);
  const NEAR = line("NEAR"), AFTER = new Set(line("AFTER")), BARE = new Set(line("BARE"));
  const kind = (a) => meaning?.adjKind(a) ?? null;
  const dist = (a) => { const i = NEAR.indexOf(kind(a)); return i < 0 ? NEAR.length : i; };   // (no kind: the farthest)
  const nearest = (adjs) => adjs.map((a, i) => [a, i]).sort((x, y) => dist(x[0]) - dist(y[0]) || x[1] - y[1]).map((x) => x[0]);
  const cumulative = (adjs) => adjs.length > 1 && !!meaning && adjs.every((a, k) => !k || meaning.cumulative(adjs[k - 1], a));
  const isAfter = (a) => AFTER.has(kind(a));
  return {
    cumulative,
    before: (adjs) => nearest(adjs.filter((a) => !isAfter(a))).reverse(),
    after: (adjs) => nearest(adjs.filter(isAfter)),
    outward: (adjs) => nearest(adjs).reverse(), inward: nearest,
    isAfter,
    bare: (a) => BARE.has(kind(a)),
  };
}
