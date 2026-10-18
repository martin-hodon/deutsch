// THE SENTENCE AS A TREE: its words joined, a grammar rule a node -- article + noun, adjective + noun, preposition + noun
// phrase, auxiliary + participle, subject + predicate, a clause + a because-clause. The plan says what the parts are;
// WHICH words are each part's is found by synthesis, as the ladder marks a step's words: a part taken out of the plan --
// or, where it cannot be (a subject), put another in its place -- and the sentence said again: the words that went or
// changed are that part's (a part may lie apart: hat ... gelesen). Inside a phrase the joins follow the parts of speech:
// [ein [neues Buch]], [im [Garten]]. Without a plan (a sentence not read back exactly) the words' parts of speech alone
// give the phrases (`plain`), no clauses.
//
//   treeOf(plan, words, wordsOf) -> node   words: the sentence's tokens [{ w, pos }] (punctuation without pos);
//                                          wordsOf(plan) -> its sentence's tokens lowercased (null: cannot be said)
//   plainTree(words) -> node
//   node: { rule, role?, at: [token index ...], kids: [node ...] } | { leaf: index }   (rule: the join, role: the part
//          the node is of its parent -- subject, object, time ...)

const ROLE = { subj: "subject", patient: "object", second: "object", recipient: "indirect object", theme: "object", topic: "about what", pred: "predicate", place: "place", time: "time", manner: "manner", freq: "how often", sentence: "comment", pp: "phrase", location: "place", goal: "where to", source: "where from", companion: "with whom", instrument: "with what" };
const GRAMMATICAL = new Set(["verb", "tense", "modal", "neg", "mood", "voice", "link", "relrole", "wh", "inf", "raise", "ctrl", "drop", "fixed"]);
const DETS = new Set(["ART", "NUM"]);
const clone = (p) => JSON.parse(JSON.stringify(p));

export function treeOf(plan, words, wordsOf) {
  const full = words.map((x) => x.w.toLocaleLowerCase()), all = full.map((_, i) => i);
  // the tokens of the sentence that a changed plan does not keep (by the longest common run of the two)
  const gone = (p) => {
    const b = wordsOf(p);
    if (!b) return null;
    const a = full, L = Array.from({ length: a.length + 1 }, () => new Int16Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const kept = new Set();
    for (let i = 0, j = 0; i < a.length && j < b.length;) { if (a[i] === b[j]) { kept.add(i); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
    return all.filter((i) => !kept.has(i));
  };
  // (a part's words: gone when it is taken out, else changed when another stands in -- a pronoun for a noun phrase)
  function spanOf(edit) { for (const f of edit) { const q = f(clone(plan)); const g = q && gone(q); if (g?.length) return g; } return []; }
  const STAND_IN = (v) => (/^[\w.]+:/.test(v) ? [/\+pl\b|^(all|both|many|several|few):/.test(v) ? "3pl" : "3sg.m", "1pl", "1sg"] : ["3sg.m", "1pl"]);

  // ---- a clause: its parts' words, the rest its verb (and its link, its comma)
  function clause(id, at) {
    const c = plan.clauses[id], kids = [], taken = new Set();
    for (const [k, vs] of Object.entries(c.args)) {
      if (GRAMMATICAL.has(k) || typeof vs[0] !== "string") continue;
      const sp = spanOf([
        (p) => { delete p.clauses[id].args[k]; return p; },
        ...STAND_IN(vs[0]).map((s) => (p) => { p.clauses[id].args[k] = [s]; return p; }),
      ]).filter((i) => at.includes(i) && !taken.has(i));
      if (!sp.length) continue;
      sp.forEach((i) => taken.add(i));
      kids.push(phrase(sp, k, vs[0]));
    }
    // (the verb's words -- with an auxiliary, a modal, not: each found by taking it out)
    const rest = at.filter((i) => !taken.has(i) && words[i].pos !== undefined && /\p{L}|\p{N}/u.test(words[i].w));
    // (the link: a subordinate clause's conjunction; a relative clause's relative word -- its first word, or its last
    //  where the language ends it so: 的)
    const ends = [Math.min(...at), Math.max(...at)];
    const link = c.type === "SUB" ? rest.filter((i) => words[i].pos === "CON") : c.type === "REL" ? rest.filter((i) => i === ends[0] || (i === ends[1] && words[i].pos !== "V")).slice(0, 1) : [];
    const verbAt = rest.filter((i) => !link.includes(i));
    if (verbAt.length) kids.push(verbGroup(id, verbAt));
    kids.sort((a, b) => first(a) - first(b));
    const subj = kids.find((k) => k.role === "subject"), body = { rule: subj ? "subject + predicate" : "verb + its parts", at: kids.flatMap(atOf).sort((a, b) => a - b), kids };
    // (subject + predicate: the predicate the rest of the clause -- a node of its own when there is more than a verb)
    if (subj && kids.length > 2) { const pk = kids.filter((k) => k !== subj); body.kids = [subj, { rule: "verb + its objects and adverbials", role: "predicate", at: pk.flatMap(atOf).sort((a, b) => a - b), kids: pk }].sort((a, b) => first(a) - first(b)); }
    if (!link.length) return body;
    return { rule: `${c.type === "REL" ? "relative word" : "conjunction"} + clause (${c.type === "REL" ? "relative clause" : c.args.link?.[0] ?? "subordinate"})`, at: [...link, ...body.at].sort((a, b) => a - b), kids: [...link.map((i) => ({ leaf: i })), body].sort((a, b) => first(a) - first(b)) };
  }
  function verbGroup(id, at) {
    const c = plan.clauses[id], kids = [], left = new Set(at);
    for (const [k, label] of [["neg", "not"], ["modal", "modal verb"]]) {
      if (!c.args[k]) continue;
      const sp = (gone((() => { const p = clone(plan); delete p.clauses[id].args[k]; return p; })()) ?? []).filter((i) => left.has(i));
      // (a modal taken out leaves the verb as it was before it: the words that changed are the modal's -- the verb's form too)
      const own = k === "modal" ? sp.filter((i) => words[i].pos === "V" && i === Math.min(...sp.filter((j) => words[j].pos === "V"))) : sp;
      if (own.length) { own.forEach((i) => left.delete(i)); kids.push({ rule: label, role: label, at: own, kids: own.map((i) => ({ leaf: i })) }); }
    }
    const verb = [...left].sort((a, b) => a - b), tense = c.args.tense?.[0];
    const vrule = verb.length > 1 ? (tense === "perfect" || tense === "pluperfect" ? "auxiliary + participle (perfect)" : tense === "future" ? "auxiliary + infinitive (future)" : c.args.voice ? "auxiliary + participle (passive)" : "verb in parts") : "verb";
    const vnode = verb.length > 1 ? { rule: vrule, role: "verb", at: verb, kids: verb.map((i) => ({ leaf: i })) } : { leaf: verb[0], role: "verb" };
    if (!kids.length) return vnode;
    const kidsAll = [...kids, vnode].sort((a, b) => first(a) - first(b));
    return { rule: kids.map((k) => k.rule).join(" + ") + " + verb", role: "verb", at: [...at].sort((a, b) => a - b), kids: kidsAll };
  }
  // ---- a phrase: a relative clause in it its own clause; the words joined by their parts of speech
  function phrase(at, k, v) {
    const relId = (v.match(/rel\((\w+)\)/) ?? [])[1];
    let rel = null, own = at;
    if (relId && plan.clauses[relId]) {
      const sp = (gone((() => { const p = clone(plan); delete p.clauses[relId]; for (const c of Object.values(p.clauses)) for (const [kk, vs] of Object.entries(c.args)) c.args[kk] = vs.map((x) => x.replace(`+rel(${relId})`, "")); return p; })()) ?? []).filter((i) => at.includes(i));
      if (sp.length) { rel = clause(relId, sp); own = at.filter((i) => !sp.includes(i)); }
    }
    const np = joins(own.filter((i) => /\p{L}|\p{N}/u.test(words[i].w)));
    const node = rel ? { rule: "noun phrase + relative clause", at: [...at].sort((a, b) => a - b), kids: [np, rel] } : np;
    return { ...node, role: ROLE[k] ?? k };   // (one word: the word itself, in its role)
  }
  // the words of a phrase joined: a preposition + the rest, a determiner + the rest, an adjective + the noun -- nearest
  // first ([ein [neues Buch]], [im [großen [alten Garten]]]); a degree word on its adjective (sehr alt)
  function joins(at) { return joinWords(at, words); }

  // ---- the sentence: its clauses -- a main clause and one in it (a subordinate one, an object clause) or two joined
  const ids = plan.seq.filter((x) => plan.clauses[x]), main = ids.find((x) => /^(MAIN|YESNO|WH|IMP)$/.test(plan.clauses[x].type)) ?? ids[0];
  const spans = new Map();
  for (const id of ids) if (id !== main) spans.set(id, (gone((() => { const p = clone(plan); delete p.clauses[id]; const m = plan.seq; p.seq = [main, m.at(-1)]; return p; })()) ?? []));
  const mainAt = all.filter((i) => ![...spans.values()].some((s) => s.includes(i)) && /\p{L}|\p{N}/u.test(words[i].w));
  if (!spans.size) return { ...clause(main, mainAt), role: "sentence" };
  const parts = [{ ...clause(main, mainAt), role: "main clause" }, ...[...spans].map(([id, at]) => {
    const c = plan.clauses[id], coord = at.filter((i) => words[i].pos === "CON" && c.type === "MAIN");
    const body = clause(id, at.filter((i) => !coord.includes(i) && /\p{L}|\p{N}/u.test(words[i].w)));
    return coord.length ? { rule: "conjunction + clause", role: "second clause", at, kids: [...coord.map((i) => ({ leaf: i })), body] } : { ...body, role: c.type === "SUB" ? "subordinate clause" : "clause" };
  })].sort((a, b) => first(a) - first(b));
  return { rule: parts.length > 1 ? "clause + clause" : "clause", role: "sentence", at: all.filter((i) => /\p{L}|\p{N}/u.test(words[i].w)), kids: parts };
}
const first = (n) => (n.leaf != null ? n.leaf : Math.min(...n.at));
const atOf = (n) => (n.leaf != null ? [n.leaf] : n.at);   // (a node's tokens: a word's its own)

// the words of a phrase joined by their parts of speech (also the whole tree of a sentence not read back exactly)
function joinWords(at, words) {
  at = [...at].sort((a, b) => a - b);
  if (at.length === 1) return { leaf: at[0] };
  if (!at.length) return { rule: "", at: [], kids: [] };
  const pos = (i) => words[i].pos ?? "";
  const node = (rule, kids) => ({ rule, at: kids.flatMap(atOf).sort((a, b) => a - b), kids });
  const head = at.findIndex((i) => pos(i) === "N"), last = at.length - 1;
  // (a preposition first: + the rest)
  if (pos(at[0]) === "PRE") return node("preposition + noun phrase", [{ leaf: at[0] }, joinWords(at.slice(1), words)]);
  // (a determiner, a possessive, a number first: + the rest)
  if (DETS.has(pos(at[0])) || (pos(at[0]) === "P" && head > 0)) return node(`${pos(at[0]) === "P" ? "possessive" : pos(at[0]) === "NUM" ? "number" : "article"} + noun`, [{ leaf: at[0] }, joinWords(at.slice(1), words)]);
  // (a degree word on what follows: sehr + alt)
  if (pos(at[0]) === "AV" && pos(at[1]) === "AN") return joinDeg(at, words);
  // (adjectives before the noun: the outermost joins last; after it -- French, Spanish: the farthest last)
  if (head > 0 && pos(at[0]) === "AN") return node("adjective + noun", [{ leaf: at[0] }, joinWords(at.slice(1), words)]);
  if (head === 0 && last > 0 && pos(at[last]) === "AN") return node("noun + adjective", [joinWords(at.slice(0, last), words), { leaf: at[last] }]);
  // (what is left: the words one after the other)
  return node("words", at.map((i) => ({ leaf: i })));
}
function joinDeg(at, words) {
  // sehr + alt, then that adjective + the rest: [[sehr alte] Hund]
  const adj = { rule: "degree word + adjective", at: [at[0], at[1]], kids: [{ leaf: at[0] }, { leaf: at[1] }] };
  if (at.length === 2) return adj;
  const rest = joinWords(at.slice(2), words);
  return { rule: "adjective + noun", at: [...at], kids: [adj, rest] };
}

// a sentence not read back: its phrases by the parts of speech alone -- runs of article, adjectives and a noun (with a
// preposition before them), the verbs, the rest each a word
export function plainTree(words) {
  const at = words.map((_, i) => i).filter((i) => /\p{L}|\p{N}/u.test(words[i].w)), kids = [], pos = (k) => words[at[k]]?.pos ?? "";
  for (let k = 0; k < at.length;) {
    // (a run up to its noun: [preposition] [article | possessive | number] [degree word] adjectives noun)
    let j = k;
    while (j < at.length && /^(PRE|ART|NUM|AN|AV|P)$/.test(pos(j)) && !(pos(j) === "AV" && pos(j + 1) !== "AN")) j++;
    if (pos(j) === "N" && j > k) { j++; while (pos(j) === "AN" && pos(j + 1) !== "N") j++; kids.push({ ...joinWords(at.slice(k, j), words), role: "" }); k = j; continue; }
    kids.push({ leaf: at[k] }); k++;
  }
  return { rule: "words", role: "sentence", at, kids };
}
