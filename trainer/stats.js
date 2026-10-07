// Statistics from the answer log: per category (and "all"), the answers, % right and the average response time,
// of one mode or (mode null) of all.
// (Response times are capped when an answer is logged: see app.js.)

export function summarize(answers, mode, since = 0) {
  const rows = {};
  for (const answer of answers) {
    if ((mode && answer.mode !== mode) || answer.time < since) continue;
    for (const name of ["all", answer.category]) {
      const row = (rows[name] ??= { answers: 0, correct: 0, ms: 0 });
      row.answers++;
      row.correct += answer.correct ? 1 : 0;
      row.ms += answer.ms;
    }
  }
  return rows;
}

export const percentCorrect = row => Math.round((100 * row.correct) / row.answers);
export const averageSeconds = row => (row.ms / row.answers / 1000).toFixed(1);
