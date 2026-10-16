// THE GRAMMAR ENGINE: sentences/grammar.txt -- a weighted context-free grammar over the clause's fields -- expanded into
// tokens. It knows nothing of German: the rules say where things go, and two HOOKS fill them --
//   clause(type, parent)   a clause rule (MAIN, SUB, REL...) begins: the PLAN for it (sentences.js)
//   role(plan, name)       a role (subj, vfin, obj.A...): its tokens, or a phrase to expand ({ rule: "NP", plan }),
//                          or nothing (the plan has none)
//   choose(name, plan, alts)  (optional) the alternative to take, or null to choose by weight -- a given structure's
//                          (the tests: which part stands in the front field)
// A role is used once in a clause: written in the front field, it is not written again in the middle one. A rule named
// in FILLED must write something: an alternative that wrote nothing (its roles the plan does not have) gives way to
// another (the front field: the subject, when there is no object to put there).
//
//   const g = parseGrammar(text);   expand(g, "S", hooks, rnd) -> [{ w, ipa }, ...]
// A weight may differ by COMPLEXITY (g.complexity, 1-3: simple to rich): `{0/1/2}` -- none at 1, 1 at 2, 2 at 3.
// THE SYLLABUS: `FEATURE A1.1 name -- what (example)` lines, in the order the grammar is learnt; g.stage (A1.1 ... B2.2)
// unlocks every feature up to it (g.has(name)), and a rule tagged `@name` is only taken once that one is unlocked.

export function parseGrammar(text) {
  const rules = new Map(), clauses = new Set(), filled = new Set(), words = {}, weights = {}, features = [];
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    if (s.startsWith("CLAUSES:")) { for (const c of s.slice(8).trim().split(/\s+/)) clauses.add(c); continue; }
    if (s.startsWith("FILLED:")) { for (const c of s.slice(7).trim().split(/\s+/)) filled.add(c); continue; }
    const fm = s.match(/^FEATURE (\S+) (\S+)\s*(?:--\s*(.*))?$/);
    if (fm) { features.push({ stage: fm[1], name: fm[2], what: fm[3] ?? "" }); continue; }
    const wm = s.match(/^WORDS (\S+):\s*(.*)$/);
    if (wm) {   // a list, each word with its weight (`und {3}`: three times as likely; 1 if left out)
      const items = wm[2].split("|").map((x) => x.trim()).filter(Boolean).map((x) => x.match(/^(.*?)\s*(?:\{([\d.]+)\})?$/));
      words[wm[1]] = items.map((m) => m[1]);
      weights[wm[1]] = items.map((m) => Number(m[2] ?? 1));
      continue;
    }
    const m = s.match(/^(\S+)\s*->\s*(.*?)\s*(?:\{([\d./]+)\})?\s*((?:@\S+\s*)*)$/);
    if (!m) throw new Error(`grammar: cannot read "${s}"`);
    const syms = m[2].match(/"[^"]*"|\S+/g) ?? [];
    if (!rules.has(m[1])) rules.set(m[1], []);
    rules.get(m[1]).push({ syms, weights: (m[3] ?? "1").split("/").map(Number), needs: m[4].split(/\s+/).filter(Boolean).map((t) => t.slice(1)) });
  }
  const g = { rules, clauses, filled, words, weights, features, complexity: 2, stage: null };
  // (a feature is unlocked when it comes no later in the syllabus than the stage's last one; no stage: all of them)
  const order = new Map(features.map((f, i) => [f.name, i]));
  g.has = (name) => {
    if (!order.has(name)) throw new Error(`grammar: no feature ${name}`);
    if (!g.stage) return true;
    const last = features.map((f) => f.stage).lastIndexOf(g.stage);
    return order.get(name) <= last;
  };
  g.stages = [...new Set(features.map((f) => f.stage))];
  return g;
}

const weightOf = (a, g) => a.weights[Math.min(g.complexity, a.weights.length) - 1];
const pick = (alts, rnd, g) => {
  alts = alts.filter((a) => weightOf(a, g) > 0 && a.needs.every((n) => g.has(n)));
  if (!alts.length) return null;
  let r = rnd() * alts.reduce((t, a) => t + weightOf(a, g), 0);
  for (const a of alts) if ((r -= weightOf(a, g)) < 0) return a;
  return alts[alts.length - 1];
};

// a rule's expansion: its alternative by weight, each symbol in turn -- a clause rule starts its own plan (`given`: the
// plan came with the role that asked for it -- a relative clause's, an object clause's)
export function expand(g, name, hooks, rnd, plan = null, given = false) {
  const alts = g.rules.get(name);
  if (!alts) throw new Error(`grammar: no rule ${name}`);
  if (g.clauses.has(name) && !given) {
    plan = hooks.clause(name, plan);
    if (!plan) return null;   // (no plan could be made for it)
  }
  const chosen = hooks.choose?.(name, plan, alts);
  if (chosen) return expandAlt(g, chosen, hooks, rnd, plan);
  if (g.filled.has(name)) {   // the alternatives in turn, by weight, until one writes something
    let left = alts;
    while (left.length) {
      const alt = pick(left, rnd, g);
      if (!alt) return null;
      const out = expandAlt(g, alt, hooks, rnd, plan);
      if (out?.length && plan) (plan.filled ??= {})[name] = alt.syms[0];   // (what it wrote: the plan's record -- FRONT: subj, adv.time ...)
      if (out === null || out.length) return out;
      left = left.filter((a) => a !== alt);
    }
    return null;
  }
  const alt = pick(alts, rnd, g);
  return alt ? expandAlt(g, alt, hooks, rnd, plan) : null;
}

function expandAlt(g, alt, hooks, rnd, plan) {
  const out = [];
  if (plan?.top) plan.shape = alt.syms;   // (the sentence's shape, known before its clauses are planned)
  for (const sym of alt.syms) {
    if (sym.startsWith('"')) { out.push({ w: sym.slice(1, -1), ipa: "" }); continue; }
    if (g.rules.has(sym)) {
      const sub = expand(g, sym, hooks, rnd, plan);
      if (sub === null) return null;
      out.push(...sub);
      continue;
    }
    // a role: once per clause
    if (plan.used?.has(sym)) continue;
    const val = hooks.role(plan, sym);
    (plan.used ??= new Set()).add(sym);
    if (!val) continue;
    if (Array.isArray(val)) out.push(...val);
    else {   // a phrase or a nested clause, expanded by its own rule with its own plan (`before`: tokens ahead of it -- a comma)
      const sub = expand(g, val.rule, hooks, rnd, val.plan, true);
      if (sub) out.push(...(val.before ?? []), ...sub);
    }
  }
  return out;
}
