// THE TENSE A LANGUAGE SAYS, where the languages share their rules (en/realize.js, es/realize.js ...): the plan's tense
// is German's, written language-free (world/CLAUSES.md); English and the Romance languages say a perfect as the simple
// past (the pretérito indefinido, the passé simple's spoken stand-in) when the clause has a past time, stands beside a
// past clause, or is reported or a that-clause (`clauses`: false -- Spanish keeps its perfect there: dice que ha estado); and "nearly" with the unreal perfect (wäre beinahe zerstört worden) as
// the past (was nearly destroyed). Each language says which of its time words are past and future (isPast, isFuture).
//
//   const T = planTense(id, plan, { timeWord, isPast, isFuture, isNearly })
//   T -> { F (the clause's first values, with the tense and mood said), hypo, futureTime }

export function planTense(id, plan, { timeWord, isPast, isFuture, isNearly, clauses = true }) {
  const c = plan.clauses[id], F = Object.fromEntries(Object.entries(c.args).map(([k, v]) => [k, v[0]]));
  const times = ["time", "freq"].flatMap((k) => c.args[k] ?? []).map((t) => (t.includes(":") ? t.split(":")[0] : timeWord(t)));
  const pastTime = times.some((w) => isPast(w) || w === "last" || w === "ago");
  const futureTime = times.some((w) => isFuture(w) || w === "next" || w === "in-time");
  let tense = F.tense ?? "present", mood = F.mood ?? null;
  if (mood === "hypo" && tense === "perfect" && ["manner", "time", "freq"].some((k) => c.args[k]?.[0] && isNearly(c.args[k][0]))) { mood = null; tense = "past"; }
  const otherPast = Object.entries(plan.clauses).some(([k, o]) => k !== id && /^(past|pluperfect)$/.test(o.args.tense?.[0] ?? "") && o.args.mood?.[0] !== "hypo");
  if (tense === "perfect" && mood !== "hypo" && (pastTime || (clauses && (otherPast || c.type === "REP" || (c.type === "SUB" && !["if-unreal", "as-if"].includes(F.link)))))) tense = "past";
  return { F: { ...F, tense, mood }, hypo: mood === "hypo", futureTime };
}
