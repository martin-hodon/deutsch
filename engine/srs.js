// Spaced repetition. Each (mode, entry) is a CARD, its state computed from the answers to it.
//
// A card stands on a step of STEPS, the wait until it is asked again: two short learning steps (1 and 10 minutes),
// then days growing about 2-2.5 times, as in the Leitner system and Anki.
//   right                 -> one step up
//   right but slow        -> stays on its step (recalled with effort: not yet learned)
//   right but asked early -> stays on its step (only remembering over the wait moves a card up)
//   wrong                 -> back to the first step (asked again in a minute)
//   right the first time  -> straight to 1 day (already known)
// New words come in learning order (the commonest first), NEW_PER_DAY a day per mode -- and more once every word
// started is sure (none wrong in its last RECENT answers) and none is due: a learner with time can go faster.

const MINUTE = 60e3, DAY = 864e5;
export const STEPS = [MINUTE, 10 * MINUTE, DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY, 80 * DAY, 180 * DAY];
export const NEW_PER_DAY = 20;
export const SLOW_MS = 8000;
export const RECENT = 3;
const KNOWN_STEP = 2;
// NOT TOO SOON AGAIN: a card waits while it was asked `times` times within the last `within` questions -- here once in
// the last 1 (never twice in a row) and twice in the last 6 (no third time in a short run). A pool too small for all
// the rules lets the later ones go first.
export const SPACING = [{ times: 1, within: 1 }, { times: 2, within: 6 }];
export const SPACING_MEMORY = Math.max(...SPACING.map((r) => r.within));   // (how many questions back the rules look)

export const cardKey = (mode, entry) => `${mode}:${entry.id}`;

// The card after one answer. `card` is undefined for a new card. `recent`: its last answers, right or wrong.
export function review(card, answer) {
  let step;
  if (!answer.correct) step = 0;
  else if (!card) step = KNOWN_STEP;
  else if (answer.ms > SLOW_MS || answer.time < card.due) step = card.step;
  else step = Math.min(card.step + 1, STEPS.length - 1);
  const recent = [...(card?.recent ?? []), answer.correct].slice(-RECENT);
  return { step, due: answer.time + STEPS[step], first: card ? card.first : answer.time, recent };
}

// Not yet sure: wrong at least once in its last RECENT answers
export const isShaky = card => card.recent.includes(false);

export function record(cards, answer) {
  cards.set(answer.card, review(cards.get(answer.card), answer));
}

export function buildCards(answers) {
  const cards = new Map();
  for (const answer of answers) record(cards, answer);
  return cards;
}

// The next entry to ask from `pool` (the entries that fit, in learning order):
//   1. the card due longest ago,
//   2. else a new word, while fewer than NEW_PER_DAY were started today,
//   3. else a shaky card, the one due soonest (practise what is not sure yet),
//   4. else a new word beyond the day's number (everything started is sure),
//   5. else the card due soonest (practice ahead: no new words left).
// `asked`: the cards asked last (their keys, oldest first) -- none comes back sooner than SPACING allows.
export function chooseNext(pool, mode, cards, now, today, asked = []) {
  for (let n = SPACING.length; n >= 0; n--) {
    const rules = SPACING.slice(0, n), ok = pool.filter(e => !tooSoon(cardKey(mode, e), asked, rules));
    const entry = ok.length && chooseFrom(ok, mode, cards, now, today);
    if (entry) return entry;
  }
  return pool[0];
}

export const tooSoon = (key, asked, rules = SPACING) =>
  rules.some(({ times, within }) => asked.slice(-within).filter(k => k === key).length >= times);

function chooseFrom(pool, mode, cards, now, today) {
  const card = e => cards.get(cardKey(mode, e));
  const seen = pool.filter(e => card(e)).sort((a, b) => card(a).due - card(b).due);
  const fresh = pool.find(e => !card(e));
  const shaky = seen.find(e => isShaky(card(e)));

  if (seen.length && card(seen[0]).due <= now) return seen[0];
  if (fresh && newToday(cards, mode, today) < NEW_PER_DAY) return fresh;
  return shaky ?? fresh ?? seen[0] ?? pool[0];
}

export function newToday(cards, mode, today) {
  let count = 0;
  for (const [key, card] of cards) if (key.startsWith(mode + ":") && card.first >= today) count++;
  return count;
}

export function dueCount(pool, mode, cards, now) {
  return pool.filter(e => cards.get(cardKey(mode, e))?.due <= now).length;
}

export function learnedCount(pool, mode, cards) {
  return pool.filter(e => cards.get(cardKey(mode, e))?.step >= KNOWN_STEP).length;
}
