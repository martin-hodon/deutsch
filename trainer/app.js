// The trainer: welcome the learner, then ask a question, take the answer, log it, schedule, show feedback and
// statistics, ask the next.
import { loadDictionary, details } from "./data.js";
import { MODES } from "./questions.js";
import { openStorage } from "./storage.js";
import { buildCards, record, chooseNext, cardKey, newToday, dueCount, learnedCount, NEW_PER_DAY, SPACING_MEMORY } from "./srs.js";
import { summarize } from "./stats.js";
import * as ui from "./ui.js";
import { createVoice } from "./speak.js";
import { startOffline, keptVersion, onlineVersion, update } from "./offline.js";

const MAX_RESPONSE_MS = 10000;                  // a longer wait is the learner away, not thinking: logged as 10 s
const AUTO_NEXT_MS = 1000;                      // after a right answer; after a wrong one the learner clicks the right one

const startOfToday = () => new Date().setHours(0, 0, 0, 0);
const learningOrder = (a, b) => a.rank - b.rank || a.order - b.order;   // new words: the commonest first

let dict, storage, answers, cards;
let mode = "article";
let current = null;                             // { entry, question, key, shownAt, answered }
const asked = [];                              // the cards asked last, oldest first (srs.js SPACING: not too soon again)

async function start() {
  try {
    dict = await loadDictionary("deutsch.tsv", "order.tsv");
  } catch (error) {
    return ui.showEmpty(`The dictionary could not be loaded (${error.message}). Serve the folder: python3 -m http.server`);
  }
  storage = await openStorage();
  answers = await storage.allAnswers();
  cards = buildCards(answers);

  // the offline copy (sw.js): kept in the browser, updated only from the welcome screen
  if (await startOffline()) ui.showVersion(await keptVersion(), { check: onlineVersion, update });
  const name = await storage.getName();
  if (name) ui.showWelcome(name, summarize(answers, null, startOfToday()).all, summarize(answers, null).all, () => learn(name));
  else ui.askName(async newName => { await storage.setName(newName); learn(newName); });
}

const voice = createVoice();   // (the German spoken: the mode says what, when -- questions.js `say`)
const say = (ipa) => voice.say(ipa) * 1000;   // -> ms it speaks

async function learn(name) {
  ui.showTrainer(name);
  const speech = { level: 2, kind: "man", ...(await storage.getSetting("speech")) };   // (medium, a man: until chosen)
  Object.assign(voice, { level: speech.level, kind: speech.kind });
  ui.showSpeech(speech, (s) => { Object.assign(voice, s); if (!s.level) voice.stop(); storage.setSetting("speech", s); });
  ui.showCategories(Object.keys(dict.byCategory).sort());
  ui.showModes(MODES, mode, chooseMode);
  ui.onChange("level", ask);
  ui.onChange("category", ask);
  ui.onKeys(pressed);
  ask();
}

function chooseMode(name) {
  mode = name;
  ui.showModes(MODES, mode, chooseMode);
  ask();
}

// The entries the current mode, level and category allow, commonest first
function pool() {
  const category = ui.selected("category"), level = Number(ui.selected("level"));
  return (category ? dict.byCategory[category] : dict.entries)
    .filter(e => e.freq <= level && MODES[mode].fits(e))
    .sort(learningOrder);
}

function ask() {
  const entries = pool();
  const entry = chooseNext(entries, mode, cards, Date.now(), startOfToday(), asked);
  if (!entry) return ui.showEmpty("No words here: choose another level or category.");
  const question = MODES[mode].make(entry, dict);
  current = { entry, question, key: cardKey(mode, entry), shownAt: performance.now(), answered: false };
  asked.push(current.key);
  if (asked.length > SPACING_MEMORY) asked.shift();
  ui.showQuestion(entry, question, choose);
  say(MODES[mode].say?.ask?.(entry));
  showProgress(entries);
}

// A click on an option: the answer; after it, the right option goes on
function choose(option) {
  if (!current.answered) answer(option);
  else if (option === current.question.answer) ask();
}

// Keys 1-3 do what a click on that option does
function pressed(index) {
  if (current) choose(current.question.options[index]);
}

async function answer(chosen) {
  current.answered = true;
  const { entry, question, key } = current;
  const result = {
    time: Date.now(), mode, card: key, entry: entry.id, category: entry.category,
    prompt: question.prompt, answer: question.answer, chosen,
    correct: chosen === question.answer, ms: Math.min(MAX_RESPONSE_MS, Math.round(performance.now() - current.shownAt)),
  };
  answers.push(result);
  record(cards, result);
  ui.showFeedback(question, chosen, details(entry));
  const speaking = say(MODES[mode].say?.answer?.(entry));
  showProgress(pool());
  ui.celebrate(result.correct);
  await storage.addAnswer(result);

  const shown = current;
  if (result.correct) setTimeout(() => current === shown && ask(), Math.max(AUTO_NEXT_MS, speaking + 250));   // (the word said out first)
}

function showProgress(entries) {
  const now = Date.now(), today = startOfToday();
  ui.showStatus({
    due: dueCount(entries, mode, cards, now),
    newToday: newToday(cards, mode, today), newPerDay: NEW_PER_DAY,
    learned: learnedCount(entries, mode, cards), total: entries.length,
  });
  const todayRows = summarize(answers, mode, today), overallRows = summarize(answers, mode);
  ui.showSummary(todayRows.all, overallRows.all);
  ui.showStats(todayRows, overallRows);
}

start();
