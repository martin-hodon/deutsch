// DEDUCIBLE WORDS: a word the dictionary does not have, read as a word it has and a regular derivation -- roughly = rough
// + -ly (an adverb: in a rough way), unhappy = un- + happy, Häuschen = Haus + -chen, Haustür = Haus + Tür, rápidamente =
// rápida + -mente. The rules are each language's data (<lang>/rules/derive.txt); the words they reach are only READ,
// never added to the dictionary: the reading page and the dictionary's search show what a word is made of.
//
//   const dv = await loadDerivations(lang)                 the language's rules (none: an empty list)
//   dv.derive(word, d) -> [{ e, word, base, rule: { kind, pos, label }, parts: ["rough", "-ly"] | ["un-", "happy"] |
//                          ["Arbeit", "-s-", "Platz"], via? }]  (e: the known entry -- the base, a compound's head)
//   derivationText(x) -> "rough + -ly · in a rough way" 
//                                                          d: the dictionary with its forms index (engine/wordforms.js);
//                                                          the base found by any of its forms (rápida: rápido's), of the
//                                                          rule's part of speech; `via` a derivation of a derivation
//                                                          (unhappily = un- + happily = happy + -ly)
// The rule file (<lang>/rules/derive.txt):
//   KIND TARGET < BASE : pattern pattern ... -- label     (~ in the label: the base word)
//   pattern: -suffix (word = base + suffix), -suffix/rest (the base ends in `rest` where the word has the suffix:
//            -ily/y happily <- happy), prefix- (word = prefix + base); a * after a suffix: a doubled final consonant
//            undone too (running <- run). Letters are compared folded -- no case, no accents, no umlauts (Häuschen
//            meets Haus): engine/wordforms.js fold.
//   COMPOUND TARGET < FIRST + HEAD : link link ... -- label   a word of two known words, a link between them ("" none:
//            Haustür; s: Arbeitsplatz); the head (the last word) gives the part of speech and, for a noun, the gender
import { fold } from "./wordforms.js";

const MIN = 2;   // (a base of at least two letters)

export function parseDerivations(src) {
  const rules = [];
  for (const raw of src.split("\n")) {
    const s = raw.trim();
    if (!s || s.startsWith("#")) continue;
    const [body, label = ""] = s.split(/\s+--\s+/);
    let m = body.match(/^COMPOUND\s+(\S+)\s+<\s+(\S+)\s+\+\s+(\S+)\s+:\s*(.*)$/);
    if (m) { rules.push({ kind: "compound", pos: m[1], first: m[2].split("|"), head: m[3].split("|"), links: m[4].split(/\s+/).filter(Boolean).map((x) => (x === '""' ? "" : fold(x))), label: label.trim() }); continue; }
    m = body.match(/^(\S+)\s+(\S+)\s+<\s+(\S+)\s+:\s+(.+)$/);
    if (!m) throw new Error(`derive.txt: cannot read "${s}"`);
    const patterns = m[4].split(/\s+/).filter(Boolean).map((p) => {
      const undouble = p.endsWith("*"), q = undouble ? p.slice(0, -1) : p;
      if (q.endsWith("-")) return { prefix: fold(q.slice(0, -1)), shown: q };
      const [suf, rest = ""] = q.slice(1).split("/");
      return { suffix: fold(suf), rest: fold(rest), undouble, shown: `-${suf}` };   // (shown: as written -- -ość, not -osc)
    });
    rules.push({ kind: m[1], pos: m[2], base: m[3].split("|"), patterns, label: label.trim() });
  }
  return rules;
}

export async function loadDerivations(lang, base = "") {
  const r = await fetch(`${base}${lang}/rules/derive.txt`).catch(() => null);
  const rules = r?.ok ? parseDerivations(await r.text()) : [];
  // a known word of a part of speech among `pos` by a (folded) form: its entries, the word itself first
  const known = (d, f, pos) => (d.index.get(f) ?? []).filter((h) => pos.includes(h.e.pos)).sort((a, b) => (fold(b.e.word) === f) - (fold(a.e.word) === f) || a.e.freq - b.e.freq || a.e.rank - b.e.rank).map((h) => h.e);
  function derive(word, d, depth = 2) {
    const w = fold(word), out = [], seen = new Set();
    const push = (x) => { const k = `${x.e.word}|${x.e.pos}|${x.rule.kind}`; if (!seen.has(k)) { seen.add(k); out.push(x); } };   // (a word's senses: one reading)
    for (const rule of rules) {
      if (rule.kind === "compound") { compound(w, d, rule).forEach(push); continue; }
      for (const p of rule.patterns) {
        let stems = [];
        if (p.prefix != null) { if (w.startsWith(p.prefix)) stems = [w.slice(p.prefix.length)]; }
        else if (w.endsWith(p.suffix)) {
          const s = w.slice(0, w.length - p.suffix.length) + p.rest;
          stems = [s];
          if (p.undouble && /([b-df-hj-np-tv-z])\1$/.test(s)) stems.push(s.slice(0, -1));   // (running -> runn -> run)
        }
        for (const s of stems) {
          if (s.length < MIN) continue;
          const affix = p.shown;
          const bases = known(d, s, rule.base);
          const parts = (b) => (p.prefix != null ? [affix, b] : [b, affix]);
          for (const e of bases.slice(0, 2)) push({ e, word, rule, base: e.word, parts: parts(e.word) });
          // (a derivation of a derivation: unhappily = un- + happily -- happily = happy + -ly)
          if (!bases.length && depth > 1) for (const inner of derive(s, d, depth - 1)) if (rule.base.includes(inner.rule.pos)) push({ e: inner.e, word, rule, base: s, parts: parts(s), via: inner });
        }
      }
    }
    return out.sort((a, b) => !!a.via - !!b.via);   // (a reading of one step before a chain of two)
  }
  // a compound: the longest head first (Hausaufgabe: Haus + Aufgabe before Hausauf + Gabe), each split's first part a known
  // word -- or a compound itself (Haustürschlüssel) --, a link letter or none between
  function compound(w, d, rule, depth = 2) {
    const out = [], min = /[\u4e00-\u9fff]/.test(w) ? 1 : 3;   // (a part of three letters at least; one Chinese character)
    for (let i = min; i <= w.length - min; i++) {
      const head = w.slice(i), heads = known(d, head, rule.head).filter((e) => fold(e.word) === head);
      if (!heads.length) continue;
      for (const link of rule.links) {
        if (link && !w.slice(0, i).endsWith(link)) continue;
        const first = w.slice(0, i - link.length);
        if (first.length < min) continue;
        let firsts = known(d, first, rule.first);
        if (!firsts.length && rule.first.includes("V")) firsts = known(d, first + "en", ["V"]).concat(known(d, first + "n", ["V"]));   // (Schreibtisch: schreib(en))
        const inner = !firsts.length && depth > 1 ? compound(first, d, rule, depth - 1)[0] : null;
        if (!firsts.length && !inner) continue;
        out.push({ e: heads[0], word: w, rule, base: heads[0].word, parts: [inner ? first : firsts[0].word, ...(link ? [`-${link}-`] : []), heads[0].word], first: firsts[0] ?? inner?.e ?? null, via: inner ?? undefined });
        return out;   // (the first split found: the longest head)
      }
    }
    return out;
  }
  return { rules, derive };
}

// a derivation said: "rough + -ly", "un- + happy", "Arbeit + -s- + Platz", its label with the base word for ~, and the
// derivation inside it (happily = happy + -ly)
export const derivationText = (x) => [`${x.parts.join(" + ")}${x.rule.label ? ` · ${x.rule.label.replace(/~/g, x.base)}` : ""}`, ...(x.via ? [derivationText(x.via)] : [])].join("; ");
