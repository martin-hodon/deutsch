// THE GRAMMAR TESTS: sentences/tests.txt -- German sentences, each with the structure the grammar must build it from.
// A test is the sentence, then its lines (indented):
//
//   Wenn ich Zeit hätte, würde ich dich besuchen.
//     S: 1 , 2 .
//     1 SUB conj=wenn verb=haben subj=ich A=none:Zeit mood=subj2
//     2 INVERTED verb=besuchen subj=ich A=du mood=subj2
//
//   S:      the sentence: clause ids, punctuation and words between them (und, aber, entweder ...)
//   ID TYPE the clause (a rule of grammar.txt: MAIN, SUB, INVERTED, REL, ...) and its parts, `key=value` -- a value
//           with spaces in "quotes"; a key may come more than once (pp=... pp=...)
// The parts are what the planner would have chosen: the verb, the subject, the objects, the tense ... -- the tests
// check that the rules and the morphology make exactly that sentence of them (createGenerator().realize).
//
// The values: a PRONOUN (ich du er sie es wir ihr sie.pl Sie man jemand niemand etwas nichts alles das der), a NAME
// (name:Anna), or a NOUN PHRASE `det:Noun+mod+mod`:
//   det   def indef kein none poss.1sg ... dies jed all manch beid viel einig welch num.zwei name.Peter
//   mod   pl  adj:groß  deg:sehr  comp  sup  mehr (kein ... mehr)  gen(NP)  von(NP|pron)  rel(ID)
//         part(I,lachen) part(II,empfehlen,von(def:Arzt)) part(II,braten,perfekt)  part(zuI,lesen)  pair(sowohl…als auch,NP)
//         adj:neu (etwas Neues)  adj:dunkel+adj:glänzend (einen dunklen, glänzenden Spiegel)  pair(und,NP)+pair(und,NP)
//         (a list: A, B und C)  one (dieser eine Teller)  of(NP) (a measure and its stuff: eine Prise Salz)
//         post(hinweg) on a pp (über den Lärm hinweg)
// pp=mit:def:Freund (the preposition's case from the dictionary; two-way: auf.A:def:Tisch, auf.D:...), pp=da:auf
// (darauf); pred=adj:krank (+deg:sehr +comp+als(NP) +sup +so+wie(NP)), pred=NP (Ich bin Lehrer: none:Lehrer),
// pred=name:Anna, pred=age:zwanzig, pred=clock:acht, pred=adj:ruhig+aber(laut) / +und(hell); role=none:Koch (als Koch,
// front=role); a FRAG clause: np= and pp= alone (Ein Hauch von Salz.); in S: a dash – between clauses; adverbs time= freq= manner= place= sentence= conn= gen= (words,
// or a phrase: time=am:Montag im:Mai um:acht letzte:Jahr nächste:Woche jed:Tag seit:zwei:Jahr vor:drei:Tag in:zwei:Woche
// date:3:Mai; place="zu Hause" place=in:def:Garten; gen=wegen:def:Regen)

export function parseTests(text) {
  const tests = [];
  let note = "", cur = null;
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    if (raw.startsWith("#")) { note = raw.replace(/^#\s*/, ""); continue; }
    if (!/^\s/.test(raw)) { cur = { target: raw.trim(), note, seq: null, clauses: {} }; tests.push(cur); continue; }
    const s = raw.trim();
    if (s.startsWith("S:")) { cur.seq = s.slice(2).trim().split(/\s+/); continue; }
    const m = s.match(/^(\S+)\s+(\S+)\s*(.*)$/);
    if (!m) throw new Error(`tests: cannot read "${s}"`);
    const args = {};
    for (const [, k, v] of m[3].matchAll(/([\w.-]+)=("[^"]*"|\S+)/g)) (args[k] ??= []).push(v.replace(/^"|"$/g, ""));
    cur.clauses[m[1]] = { type: m[2], args };
  }
  return tests;
}

// a value's top-level parts: `def:Auto+gen(poss.1sg:Vater)+adj:neu` -> ["def:Auto", "gen(poss.1sg:Vater)", "adj:neu"]
export function splitTop(s, sep = "+") {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}
// `gen(poss.1sg:Vater)` -> ["gen", "poss.1sg:Vater"]; `part(II,empfehlen,von(def:Arzt))` -> ["part", "II,empfehlen,von(def:Arzt)"]
export const call = (s) => { const m = s.match(/^([\w.]+)\((.*)\)$/); return m ? [m[1], m[2]] : [s, null]; };
