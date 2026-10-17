// The trainer: welcome the learner, then ask a question, take the answer, log it, schedule, show feedback and
// statistics, ask the next. Two groups of exercises: WORDS (a word asked by spaced repetition, srs.js) and GRAMMAR
// (a sentence made for the language learned, engine/practice.js: its syntax -- the word order --, its morphology -- a
// form left out --, and the overview of both with examples). The page speaks the learner's own language (engine/text.js; Slovak until chosen in the settings), the
// exercises ask the words through it; the language learned is chosen above the exercises. On screen only what the
// chosen exercise needs; the settings, statistics and the recorded data behind More.
import { loadDictionary, details } from "./data.js";
import { loadMorphology } from "../de/morph.js";
import { modesFor } from "./questions.js";
import { LANGS } from "./langs.js";
import { mountHeader } from "./header.js";
import { openStorage } from "./storage.js";
import { buildCards, record, chooseNext, cardKey, newToday, dueCount, learnedCount, NEW_PER_DAY, SPACING_MEMORY } from "./srs.js";
import { summarize } from "./stats.js";
import * as ui from "./ui.js";
import { createVoice, loadProsody } from "./speak.js";
import { startOffline, keptVersion, onlineVersion, update } from "./offline.js";
import { createPractice } from "./practice.js";
import { loadText, t } from "./text.js";

// a longer wait is the learner away, not thinking: logged as this long (a sentence to order takes longer than a word)
const MAX_RESPONSE_MS = { words: 10000, forms: 20000, order: 60000 };
const AUTO_NEXT_MS = 1000;                      // after a right answer; after a wrong one the learner clicks the right one

const startOfToday = () => new Date().setHours(0, 0, 0, 0);
const learningOrder = (a, b) => a.rank - b.rank || a.order - b.order;   // new words: the commonest first
const shuffle = (list) => list.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);

let dict, storage, answers, cards;
let mode = "article", MODES = {};
// the language learned, and the learner's own (langs.js): the page's words, and what the words are asked through
// (storage "pair": { learn, other } -- `other` is the learner's own language)
let pair = { learn: "de", other: "sk" };
const otherOf = (p) => (p.other === p.learn ? "sk" : p.other);   // (one's own language learned: the words through Slovak, the index)
// what the learner chose last: the mode, the level, each filter, each group's last mode (kept: storage "view")
let view = { level: "1", category: "", structure: "all", rule: "all", verbs: "all", last: {} };
const dicts = {};                               // the dictionaries loaded: { de, en }
const loadLang = async (l) => {
  if (dicts[l]) return dicts[l];
  const d = await loadDictionary(LANGS[l].dict, LANGS[l].order, l);
  if (LANGS[l].morph) d.morph = await (await import("../" + LANGS[l].morph)).loadMorphology(LANGS[l].irregular);   // (its verbs' forms)
  return (dicts[l] = d);
};
const practice = createPractice({ loadLang });
let structures = [], rules = [];                // what the sentence exercises offer (engine/structures.js, <lang>/rules/forms.txt)
// (a structure or rule set found to have no sentence at a level -- mode|level|name: marked in its list)
const missing = new Set();
const marked = (list, kind) => list.map((x) => (missing.has(`${pair.learn}|${kind}|${ui.selected("level")}|${x.name}${kind === "forms" && ui.selected("verbs") === "irregular" ? "|irregular" : ""}`) ? { ...x, none: t("none-at", { level: ui.selected("level") }) } : x));
const showMarks = () => { ui.showChoices("structure", "all-structures", marked(structures, "order")); ui.showChoices("rule", "all-forms", marked(rules, "forms")); };
let current = null;                             // { kind, entry?, question?, task?, key, shownAt, answered, hold }
let asking = 0;                                 // (the question being made: a later ask wins over a slower one)
const asked = [];                               // the cards asked last, oldest first (srs.js SPACING: not too soon again)

// the page's words in the learner's own language (English for what a language's file has not)
const useText = async (native) => { await loadText(LANGS[native]?.ui ?? LANGS.sk.ui, LANGS.en.ui); ui.showText(native); };

async function start() {
  storage = await openStorage();
  pair = { ...pair, ...(await storage.getSetting("pair")) };
  await useText(pair.other);
  mountHeader("trainer");
  try {
    await loadMorphology("de/rules/morphology.txt");   // (the morphology: a German plural's sound)
  } catch (error) {
    return ui.showEmpty(t("load-failed", { error: error.message }));
  }
  view = { ...view, ...(await storage.getSetting("view")) };
  if (view.mode) mode = view.mode;
  try { await usePair(pair); } catch (error) {
    return ui.showEmpty(t("load-failed", { error: error.message }));
  }
  answers = await storage.allAnswers();
  cards = buildCards(answers);

  // the offline copy (sw.js): kept in the browser, updated only from the welcome screen
  if (await startOffline()) ui.showVersion(await keptVersion(), { check: onlineVersion, update });
  const name = await storage.getName();
  // (the welcome once a visit: after Learn was clicked, coming back -- from the dictionary -- goes straight to the questions)
  const begun = (() => { try { return sessionStorage.getItem("trainer:begun") === "1"; } catch { return false; } })();
  const panel = location.hash.match(/^#panel-(settings|stats|data)$/)?.[1];   // (another page's ⋯ menu: straight to that panel)
  if (name && (begun || panel)) { await learn(name); if (panel) { ui.openPanel(panel); onPanel(panel); } }
  else if (name) ui.showWelcome(name, summarize(answers, null, startOfToday()).all, summarize(answers, null).all, () => learn(name));
  else ui.askName(async newName => { await storage.setName(newName); learn(newName); });
}

// the voice: the language learned is spoken (speak.js, with the language's own prosody -- loaded in usePair); the mode
// says what, when (questions.js `say`); the question itself is read in the word exercises only -- a grammar exercise
// is read by the learner
const voice = createVoice();
const say = (ipa) => {   // -> ms it speaks; what was said can be heard again (ui.showRepeat: the 🔊 by the question)
  if (!ipa) return 0;
  ui.showRepeat(() => voice.say(ipa));
  return voice.say(ipa) * 1000;
};

async function learn(name) {
  try { sessionStorage.setItem("trainer:begun", "1"); } catch { /* (storage blocked: the welcome shows again) */ }
  ui.showTrainer(name);
  const speech = { level: 2, kind: "man", tempo: 1, ...(await storage.getSetting("speech")) };   // (medium, a man, the language's tempo: until chosen)
  Object.assign(voice, { level: speech.level, kind: speech.kind, tempo: speech.tempo });
  ui.showSpeech(speech, (s) => { Object.assign(voice, s); if (!s.level) voice.stop(); storage.setSetting("speech", s); });
  ui.setupMore({ onPanel });
  ui.showLearn(LANGS, pair.learn, async (learn) => { await usePair({ ...pair, learn }); storage.setSetting("pair", pair); await showFilters(); ask(); });
  // (the learner's own language changed: the page's words anew, the exercises asked through it)
  ui.showNative(LANGS, pair.other, async (other) => { await useText(other); await usePair({ ...pair, other }); storage.setSetting("pair", pair); await showFilters(); ask(); });
  for (const id of ["level", "category", "structure", "rule", "verbs"]) ui.onChange(id, () => { view[id] = ui.selected(id); keepView(); if (id === "level") showMarks(); ask(); });
  await showFilters();
  ui.onKeys(pressed);
  ask();
}
// a panel of the ⋯ menu opened: what it shows
async function onPanel(panel) {
  if (panel === "stats") showProgress();
  if (panel === "data") ui.showData(answers, await storage.profile(), labelOfMode);
}

// a pair chosen: its dictionaries, its modes (the mode kept when the pair has it, else the same kind of exercise --
// forms:de -> forms:es, the words learned -> one's own language either way -- else the first), the voice's prosody
async function usePair(p) {
  const was = { mode, pair, group: MODES[mode]?.group };
  pair = p;
  dict = await loadLang(p.learn);
  const other = otherOf(p);
  if (other !== "sk") await loadLang(other);
  MODES = modesFor(p.learn, other, dicts);
  if (!MODES[mode]) mode = likeMode(was) ?? Object.keys(MODES)[0];
  ui.showTitle(LANGS[p.learn].name, p.learn === "de");
  voice.prosody = await loadProsody(LANGS[p.learn].speech);
}

function likeMode({ mode: m, pair: old, group }) {
  const keys = Object.keys(MODES), kind = m.split(":")[0];
  if (kind === "vocab" || kind === "vocabReverse") {   // (the direction kept: from the language learned, or into it)
    const forward = m === "vocab" || m.startsWith(`vocab:${old.learn}-`);
    return keys.find((k) => /^vocab(Reverse)?(:|$)/.test(k) && (k === "vocab" || k.startsWith(`vocab:${pair.learn}-`)) === forward && (k !== "vocabReverse" || !forward));
  }
  return keys.find((k) => k.split(":")[0] === kind) ?? keys.find((k) => MODES[k].group === group);
}

// the filters of the pair: the categories of its words, the structures, its rule sets of forms; the kept choices
async function showFilters() {
  ui.showCategories(Object.keys(dict.byGroup).sort());   // (the first level only: abstract, humans, life ...)
  structures = await practice.structures(pair.learn);   // (the structures this language has)
  rules = (await practice.rules(pair.learn)).map((r) => ({ name: r.name, label: r.label }));
  ui.setSelected("level", view.level);
  showMarks();
  for (const id of ["category", "structure", "rule", "verbs"]) ui.setSelected(id, view[id]);
  for (const id of ["category", "structure", "rule", "verbs"]) view[id] = ui.selected(id);
  showModes();
}
const showModes = () => ui.showModes(MODES, mode, chooseMode, (group) => view.last[group]);
const keepView = () => storage.setSetting("view", { ...view, mode });

function chooseMode(name) {
  mode = name;
  view.last[MODES[name].group] = name;
  keepView();
  showModes();
  ask();
}

// an exercise's name: this pair's mode's label, else one made from its key (an answer of another pair in the recorded
// data: vocab:es-sk -> Español → Slovensky, order:fr -> Syntax (Français); irregular:en -- the irregular verbs once asked
// as words, now the Morphology's "irregular verbs" switch)
const KINDS = { order: "syntax", forms: "morphology", overview: "overview", irregular: "irregular-verbs" };
const labelOfMode = (m) => {
  if (MODES[m]) return t(MODES[m].label);
  const [kind, rest = ""] = m.split(":"), [a, b] = rest.split("-"), name = (l) => LANGS[l]?.name ?? l;
  if (kind === "vocab" && b) return `${name(a)} → ${name(b)}`;
  return KINDS[kind] ? `${t(KINDS[kind])} (${name(a)})` : { vocab: "Deutsch → Slovensky", vocabReverse: "Slovensky → Deutsch", article: t("articles"), plural: t("plural") }[m] ?? m;
};
const labelOf = (list, name) => list.find((x) => x.name === name)?.label ?? (name === "any" ? t("any") : name);

function ask() {
  asking++;
  const kind = MODES[mode].kind;
  if (kind === "order") return askOrder();
  if (kind === "forms") return askForms();
  if (kind === "overview") return showOverview();
  return askWord();
}

// ---- WORDS -----------------------------------------------------------------------------------------------------------
// The entries the current mode, level (that FREQ) and category group allow, commonest first
function pool() {
  const group = ui.selected("category"), level = Number(ui.selected("level"));
  return (group ? dict.byGroup[group] : dict.entries)
    .filter(e => e.freq === level && MODES[mode].fits(e))
    .sort(learningOrder);
}

function askWord() {
  const entries = pool();
  const entry = chooseNext(entries, mode, cards, Date.now(), startOfToday(), asked);
  if (!entry) return ui.showEmpty(t("no-words"));
  const question = MODES[mode].make(entry, dict);
  current = { kind: "words", entry, question, key: cardKey(mode, entry), shownAt: performance.now(), answered: false };
  asked.push(current.key);
  if (asked.length > SPACING_MEMORY) asked.shift();
  ui.showQuestion(ui.entryMeta(entry), question, choose);
  say(MODES[mode].say?.ask?.(entry, dict));
  showProgress(entries);
  showExamples();
}

// THE WORD'S EXAMPLE SENTENCES (engine/practice.js: engine/simple.js's short sentences of a word the world tells of), with
// the question of the vocabulary exercises (`examples` of the mode, engine/questions.js): the word marked -- or, when it
// is the answer (into the language learned), a blank till answered. They never hold the next question. A sentence
// clicked is spoken (not while it hides the answer).
function showExamples() {
  const how = MODES[mode].examples;
  if (!how) return;
  const shown = current, alive = () => current === shown, { entry } = shown;
  practice.canSay(entry).then((can) => (can ? practice.examples(entry, 3, { alive }) : [])).then((list) => {
    if (!alive()) return;
    shown.examples = list;
    ui.showExamples(list, (x) => say(x.ipa), { hidden: how === "hidden" && !shown.answered });
  }).catch((error) => console.error(error));
}

// ---- GRAMMAR: SENTENCES ----------------------------------------------------------------------------------------------
// (while a sentence is made: the first of a language and level loads the planner -- a moment)
async function made(make) {
  const id = asking;
  ui.showEmpty(t("making"));
  let task = null;
  try { task = await make(); } catch (error) { console.error(error); }
  return id === asking ? task ?? false : null;   // (null: asked again meanwhile; false: none made)
}

// none found at this level: said, and marked in the list -- the sentences say some forms and structures only with
// commoner words (a subjunctive after para que, je ... desto: with everyday verbs)
function none(kind, name) {
  const level = ui.selected("level");
  missing.add(`${pair.learn}|${kind}|${level}|${name}`);
  showMarks();
  ui.showEmpty(t("no-sentence", { what: t(kind === "order" ? "this-structure" : "these-forms"), level, kind: t(kind === "order" ? "a-structure" : "a-form") }));
}

let orderKeys = null;
async function askOrder() {
  const structure = ui.selected("structure"), level = Number(ui.selected("level"));
  const task = await made(() => practice.order(pair.learn, level, structure));
  if (task === null) return;
  if (!task) return none("order", structure);
  // (the words shuffled -- never in their own order)
  let tiles = shuffle(task.words);
  for (let i = 0; i < 5 && tiles.join(" ") === task.words.join(" "); i++) tiles = shuffle(task.words);
  if (missing.delete(`${pair.learn}|order|${level}|${structure}`)) showMarks();
  current = { kind: "order", task, tiles, structure, key: `${mode}:${task.text}`, shownAt: performance.now(), answered: false };
  const hint = structure === "all" ? "" : labelOf(structures, structure);
  orderKeys = ui.showOrder(`${t("syntax")} · ${LANGS[pair.learn].name} · ${ui.levelLabel()}`, { tiles, slots: task.slots, hint }, answerOrder);
  showProgress();
}

async function answerOrder(words) {
  const { task, tiles, structure } = current;
  current.answered = true;
  // (right: any order the language says it in with these very words and marks -- the first word capitalised, the
  //  comma where it stands: the sentence built is exactly right or it is not)
  const built = words.join(" "), result = log({ prompt: tiles.join(" "), answer: task.text, chosen: built, correct: task.orders.includes(built), category: structure === "all" ? "any" : structure });
  ui.showOrderResult(result.correct, result.correct && built !== task.words.join(" ") ? t("also-right", { text: task.text }) : task.text, ask);
  after(result, 0);
}

async function askForms() {
  const rule = ui.selected("rule"), level = Number(ui.selected("level")), irregular = ui.selected("verbs") === "irregular";
  const question = await made(() => practice.forms(pair.learn, level, rule, irregular));
  if (question === null) return;
  if (!question) return none("forms", rule + (irregular ? "|irregular" : ""));
  if (missing.delete(`${pair.learn}|forms|${level}|${rule}${irregular ? "|irregular" : ""}`)) showMarks();   // (found after all: no longer marked)
  current = { kind: "forms", question, key: `${mode}:${question.text}`, shownAt: performance.now(), answered: false };
  ui.showQuestion(`${t("morphology")} · ${labelOf(rules, question.rule)} · ${ui.levelLabel()}`, question, choose);
  showProgress();
}

// THE OVERVIEW: every structure of the language and every rule set of forms with an example (engine/practice.js overview);
// a row clicked opens that exercise on it
async function showOverview() {
  const data = await made(() => practice.overview(pair.learn, Number(ui.selected("level"))));
  if (!data) return;
  current = null;
  const open = (m, id, name) => { ui.setSelected(id, name); view[id] = ui.selected(id); chooseMode(m); };
  ui.showOverview(data, { onStructure: (name) => open(`order:${pair.learn}`, "structure", name), onRule: (name) => open(`forms:${pair.learn}`, "rule", name) });
  showProgress();
}

// ---- ANSWERS ---------------------------------------------------------------------------------------------------------
// A click on an option: the answer; after it, the right option goes on
function choose(option) {
  if (!current.answered) answer(option);
  else if (option === current.question.answer) ask();
}

// Keys 1-3 do what a click on that option does; Enter checks a word order, or goes on; Backspace takes a word back
function pressed(key) {
  if (!current) return;
  if (current.kind === "order") {
    if (key === "Enter") return current.answered ? ask() : orderKeys?.check();
    if (key === "Backspace") return orderKeys?.back();
    return;
  }
  if (typeof key === "number") choose(current.question.options[key]);
  else if (key === "Enter" && current.answered) ask();
}

async function answer(chosen) {
  current.answered = true;
  const { entry, question } = current, words = current.kind === "words";
  const result = log({ prompt: question.prompt, answer: question.answer, chosen, correct: chosen === question.answer,
    ...(words ? { entry: entry.id, category: entry.category } : { category: question.rule }) });
  // (a word: the entry, and with another language than Slovak its concept's words there too; a sentence: itself)
  const other = otherOf(pair), there = !words || other === "sk" ? [] : dicts[other].byConcept.get(`${entry.pos}|${entry.concept}`) ?? [];
  ui.showFeedback(question, chosen, words ? [entry, ...there].map(details).join("\n") : question.text);
  const speaking = words ? say(MODES[mode].say?.answer?.(entry, dict)) : 0;   // (a word is said; a sentence of the grammar exercises is not)
  if (current.examples && MODES[mode].examples === "hidden") ui.showExamples(current.examples, (x) => say(x.ipa));   // (the blanks filled)
  after(result, speaking);
}

// an answer logged and kept, the counters and the schedule told
function log(fields) {
  const result = {
    time: Date.now(), mode, card: current.key, entry: current.key, ...fields,
    ms: Math.min(MAX_RESPONSE_MS[current.kind], Math.round(performance.now() - current.shownAt)),
  };
  answers.push(result);
  if (current.kind === "words") record(cards, result);
  showProgress();
  ui.celebrate(result.correct);
  storage.addAnswer(result);
  return result;
}
// after a right answer the next comes by itself
function after(result, speaking) {
  const shown = current;
  if (result.correct) setTimeout(() => current === shown && ask(), Math.max(AUTO_NEXT_MS, speaking + 250));   // (the word said out first)
}

function showProgress(entries = null) {
  const now = Date.now(), today = startOfToday(), m = MODES[mode];
  if (m.group === "words") {
    entries ??= pool();
    ui.showStatus({
      due: dueCount(entries, mode, cards, now),
      newToday: newToday(cards, mode, today), newPerDay: NEW_PER_DAY,
      learned: learnedCount(entries, mode, cards), total: entries.length,
    });
  } else ui.showStatusText(t("sentences-today", { n: answers.filter((a) => a.mode === mode && a.time >= today).length }));
  const todayRows = summarize(answers, mode, today), overallRows = summarize(answers, mode);
  ui.showSummary(todayRows.all, overallRows.all);
  if (ui.panelOpen("stats")) ui.showStats(todayRows, overallRows, (n) => labelOf(m.kind === "order" ? structures : m.kind === "forms" ? rules : [], n), "· " + t(m.label));
}

start();
