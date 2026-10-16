// THE FORMS EXERCISE: a sentence with one word left out, the right form of that word among wrong ones of the same word
// -- the forms other rules make (the person, the tense, the regular rule for an irregular word, the case, the
// gender). Its rule sets are each language's <lang>/rules/forms.txt (the format there, de/rules/forms.txt); the forms
// come from the language's paradigms (engine/paradigm.js); the words, from the sentence's plan.
//
//   const rules = parseForms(text)                     -> [{ name, label, ask, wrong, word, also, when, not, steer }]
//   formsQuestion(said, plan, rules, ctx)              -> { prompt, hint, options, answer, rule } | null
//     said: { text, tokens } (engine/say.js), plan: its plan; ctx: { pd (paradigms), entriesOf(pos, concept),
//     wordEntry(word), level (the plan's words asked: of this FREQ only), irregular (a verb's form asked only where
//     the regular rule alone would make another -- the irregular verbs), rnd }
//   planWords(plan) -> [{ pos, concept, clause, num }]  the words a plan names (its verbs, nouns, adjectives)

export function parseForms(text) {
  const rules = [];
  let r = null;
  for (const line of text.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const head = line.match(/^(\S+):\s*(.+)$/);
    if (head) { rules.push((r = { name: head[1], label: head[2].trim(), ask: [], wrong: [], word: null, also: [], when: [], not: [], steer: [] })); continue; }
    const m = line.trim().match(/^(ask|wrong|word|also|when|not|steer)\s+(.+)$/);
    if (!m || !r) throw new Error(`forms: cannot read "${line}"`);
    const items = m[2].trim().split(/\s+/);
    if (m[1] === "word") r.word = items; else r[m[1]] = items;
  }
  return rules;
}

// ---- the words of a plan -------------------------------------------------------------------------------------------
const DET = /^(def|indef|none|no|this|every|all|some|both|many|few|several|which|much|little|poss\.[\w.]+|num\.\S+|on-day|in-period|last|next|every)$/;
const sp = (cid) => cid.replace(/_/g, " ");
export function planWords(plan) {
  const out = [];
  for (const c of Object.values(plan.clauses)) for (const [k, vs] of Object.entries(c.args)) for (const v of vs) {
    if (typeof v !== "string") continue;
    if (k === "verb" || k === "inf") { out.push({ pos: "V", concept: sp(v), clause: c }); continue; }
    for (const part of v.split(/[(),]/)) {
      const [head, ...mods] = part.split("+"), i = head.indexOf(":");
      if (i > 0 && DET.test(head.slice(0, i)) && !head.slice(i + 1).startsWith("@")) out.push({ pos: "N", concept: sp(head.slice(i + 1)), clause: c, num: mods.includes("pl") ? "pl" : "sg" });
      if (head.startsWith("adj:")) out.push({ pos: "AN", concept: sp(head.slice(4)), clause: c });
      for (const m of mods) if (m.startsWith("adj:")) out.push({ pos: "AN", concept: sp(m.slice(4)), clause: c });
    }
  }
  return out;
}

// ---- cells ---------------------------------------------------------------------------------------------------------
// (a pattern's segments against a cell's: * any, = the asked cell's value there; the same number of segments)
const fits = (pattern, cell, asked = null) => {
  const p = pattern.split("."), c = cell.split(".");
  if (p.length !== c.length) return false;
  return p.every((x, i) => x === "*" || x === c[i] || (x === "=" && asked && asked.split(".")[i] === c[i]));
};
// (a clause has what a rule's `when` asks: key=value, key=a|b either, key=- none, type!=X)
const holds = (c, when) => when.every((w) => {
  const m = w.match(/^(\w+)(!?=)(.*)$/);
  if (!m) return true;
  const have = m[1] === "type" ? c.type : c.args[m[1]]?.[0];
  if (m[2] === "!=") return have !== m[3];
  return m[3] === "-" ? have === undefined : m[3].split("|").includes(have);   // (link=although|so-that: either)
});
const lower = (s) => s.toLocaleLowerCase();
const isWord = (t) => /\p{L}/u.test(t.w);

export function formsQuestion(said, plan, rules, { pd, entriesOf, wordEntry, level = null, irregular = false, rnd = Math.random }) {
  const pick = (l) => l[Math.floor(rnd() * l.length)];
  const shuffle = (l) => l.map((x) => [rnd(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const tokens = said.tokens.map((t, i) => ({ ...t, i })).filter(isWord);
  const words = planWords(plan), clauses = Object.values(plan.clauses);
  // (a word's forms, once)
  const formsOf = new Map(), regOf = new Map();
  const F = (e) => formsOf.get(e) ?? formsOf.set(e, pd.forms(e)).get(e), R = (e) => regOf.get(e) ?? regOf.set(e, pd.regular(e)).get(e);
  // (the nouns' forms of the plan: an article is one before them)
  const nounForms = new Set(words.filter((w) => w.pos === "N").flatMap((w) => entriesOf("N", w.concept)).flatMap((e) => F(e).map((f) => lower(f.form))));

  for (const rule of shuffle(rules)) {
    const art = rule.ask.some((a) => a.startsWith("ART."));
    // the words its forms are of: the rule's own (werden), the plan's (+ also), the articles
    const cands = art ? [{ entry: null, forms: pd.articles }]
      : rule.word ? rule.word.map(wordEntry).filter(Boolean).map((entry) => ({ entry, clauses: clauses.filter((c) => holds(c, rule.when)) }))
      : [...words.flatMap((w) => entriesOf(w.pos, w.concept).filter((e) => !e.word.includes(" ") && (!level || e.freq === level)).map((entry) => ({ entry, word: w, clauses: holds(w.clause, rule.when) ? [w.clause] : [] }))),
         ...rule.also.map(wordEntry).filter(Boolean).map((entry) => ({ entry, clauses: clauses.filter((c) => holds(c, rule.when)) }))];
    const matches = [];
    for (const cand of cands) {
      if (cand.clauses && !cand.clauses.length) continue;
      const fs = cand.forms ?? F(cand.entry);
      for (const t of tokens) for (const f of fs) {
        if (lower(f.form) !== lower(t.w) || !rule.ask.some((a) => fits(a, f.cell))) continue;
        if (cand.word?.num && /^N\./.test(f.cell) && !f.cell.endsWith("." + cand.word.num)) continue;
        if (rule.not.some((n) => fs.some((x) => lower(x.form) === lower(f.form) && fits(n, x.cell, f.cell)))) continue;   // (spelled as another form: parle, the present's too)   // (the plan's number: Lehrer as a plural only where it is one)
        if (art && ![1, 2, 3].some((d) => nounForms.has(lower(said.tokens[t.i + d]?.w ?? "")))) continue;   // (an article: before its noun)
        if (irregular && (!cand.entry || !f.cell.startsWith("V.") || !R(cand.entry).some((x) => x.cell === f.cell))) continue;   // (irregular verbs only: the regular rule would make another form here)
        matches.push({ t, f, cand });
      }
    }
    for (const { t, f, cand } of shuffle(matches)) {
      // (the wrong options: one from each source in turn -- the first, then the next -- until there are two)
      const right = t.w, wrong = [];
      const pools = rule.wrong.map((w) => {
        const reg = w.startsWith("~"), pat = reg ? w.slice(1) : w;
        return (cand.entry ? (reg ? R(cand.entry) : F(cand.entry)) : reg ? [] : cand.forms)
          .filter((x) => fits(pat, x.cell, f.cell) && (!f.shape || !x.shape || x.shape === f.shape) && lower(x.form) !== lower(right)).map((x) => x.form);
      });
      for (let pass = 0; wrong.length < 2 && pass < 2; pass++) for (const pool of pools) {
        const left = pool.filter((x) => !wrong.some((y) => lower(y) === lower(x)));
        if (left.length && wrong.length < 2) wrong.push(pick(left));
      }
      if (wrong.length < 2) continue;
      // the sentence with the word left out (the first word's capital kept on the options)
      const first = t === tokens[0], cap = (s) => (first ? s.charAt(0).toUpperCase() + s.slice(1) : s);
      const at = locate(said, t.i);
      if (at < 0) continue;
      const shown = said.text.slice(0, at) + "___" + said.text.slice(at + t.w.length);
      const lemma = cand.entry ? cand.entry.word : "";
      return { prompt: shown, hint: [lemma, rule.label].filter(Boolean).join(" · "), options: shuffle([right, ...wrong].map(cap)), answer: cap(right), rule: rule.name };
    }
  }
  return null;
}

// where a token stands in its sentence's text: the tokens before it found in turn (the first letter's case aside)
export function locate(said, index) {
  let at = 0, pos = -1;
  for (let i = 0; i <= index; i++) {
    const w = said.tokens[i].w;
    if (!w) continue;
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"), m = re.exec(said.text.slice(at));
    if (!m) return -1;
    pos = at + m.index; at = pos + w.length;
  }
  return pos;
}
