// THE COMPOSITION OF CHINESE CHARACTERS (zh/composition.txt): a character's components in the order they are written
// (的: 白 | 勺), each component a character or a radical form (扌 氵 亻) that may have components of its own, down to
// the strokes (the CJK stroke characters ㇐ ㇑ ㇒ ..., or a stroke count given for a component that is not broken up).
// From it, for the dictionary: what a character is made of, how many strokes it has, and -- the other way -- every
// character a component is in (directly, or inside one of its components: 木 is in 相 and so in 想).
const SEPARATORS = new Set(["|", "/", "+", " "]);
const isStroke = (ch) => ch >= "㇀" && ch <= "㇯";

export async function loadComposition(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const made = new Map(), within = new Map();   // character -> { layout, parts, count }; component -> the characters it is in (file order)
  for (const line of (await response.text()).split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#") || !s.includes(":")) continue;
    const i = s.indexOf(":"), ch = s.slice(0, i), v = s.slice(i + 1).trim();
    if (/^\d+$/.test(v)) { made.set(ch, { layout: "", parts: [], count: Number(v) }); continue; }   // (a component given by its stroke count)
    if (!v || v === "?") { made.set(ch, { layout: "", parts: [], count: null }); continue; }
    const seq = [...v].filter((c) => !SEPARATORS.has(c) && c !== ch), parts = [...new Set(seq)];   // (seq: as written, 心 has ㇔ three times; parts: each once)
    made.set(ch, { layout: v, seq, parts, count: null });
    for (const p of parts) (within.get(p) ?? within.set(p, []).get(p)).push(ch);
  }
  const strokes = new Map();   // character -> its stroke count (null: a part is unknown)
  const count = (ch, seen = new Set()) => {
    if (isStroke(ch)) return 1;
    if (strokes.has(ch)) return strokes.get(ch);
    const m = made.get(ch);
    if (!m || seen.has(ch)) return null;
    seen.add(ch);
    let n = m.count;
    if (n == null && m.seq.length) { n = 0; for (const p of m.seq) { const k = count(p, seen); if (k == null) { n = null; break; } n += k; } }
    strokes.set(ch, n);
    return n;
  };
  const deep = new Map();   // component -> every character it is in: the direct ones first, then those through a component
  const containing = (ch) => {
    if (deep.has(ch)) return deep.get(ch);
    const out = [], seen = new Set([ch]);
    let layer = within.get(ch) ?? [];
    while (layer.length) {
      const next = [];
      for (const c of layer) { if (seen.has(c)) continue; seen.add(c); out.push(c); next.push(...(within.get(c) ?? [])); }
      layer = next;
    }
    deep.set(ch, out);
    return out;
  };
  // the components: everything that is in some character, and every character broken up (for the index by strokes)
  const components = () => [...new Set([...within.keys(), ...made.keys()])];
  return {
    has: (ch) => made.has(ch) || within.has(ch),
    of: (ch) => made.get(ch) ?? null,                     // { layout, seq, parts, count } -- the layout as written, with separators
    direct: (ch) => within.get(ch) ?? [],                 // the characters this component is written in
    containing,                                           // ... and those that have it inside a component
    strokes: count,
    isStroke,
    components,
  };
}

// THE MEANINGS OF CHARACTERS THAT ARE NO WORD (zh/chars.txt): `CHAR [pinyin] = meaning, meaning -- note`, a line per
// reading -> character -> [{ pinyin, meanings, note }]
export async function loadCharMeanings(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const out = new Map();
  for (const line of (await response.text()).split("\n")) {
    const m = line.match(/^(\S+)(?: \[([^\]]+)\])? = (.+?)(?: -- (.+))?$/);
    if (!m || line.startsWith("#")) continue;
    (out.get(m[1]) ?? out.set(m[1], []).get(m[1])).push({ pinyin: m[2] ?? "", meanings: m[3].split(", "), note: m[4] ?? "" });
  }
  return out;
}

// a layout string (白|勺, 厶/月 | 匕/匕) as items for showing: { part } for a component, { sep } for what stands between
export function layoutItems(layout) {
  const out = [];
  for (const c of layout) {
    if (c === " ") continue;
    if (SEPARATORS.has(c)) { out.push({ sep: c }); continue; }
    if (out.length && out[out.length - 1].part !== undefined) out.push({ sep: "" });   // (components written together: 小冖见)
    out.push({ part: c });
  }
  return out;
}
