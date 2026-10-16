// Everything drawn on the page: the welcome, the exercise select and mode tabs with only the chosen mode's filters, the question
// (options; the word-order tiles), the feedback and a word's example sentences, the status line, and behind More: the
// settings (the learner's own language, the speech), the statistics, the recorded data. Every word of the page comes
// from the learner's own language (engine/text.js: t, tn).
import { percentCorrect, averageSeconds } from "./stats.js";
import { t, tn, applyText } from "./text.js";

const $ = id => document.getElementById(id);
const ARTICLES = ["der", "die", "das"];

function element(tag, className, ...children) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.append(...children);
  return el;
}

// "der Baum" -> <span class="der">der</span> Baum: the article in its colour -- when `on` (a question about the
// articles); otherwise plain text
export function withArticleColor(text, on = true) {
  const m = on && text.match(/^(der|die|das) (.*)$/s);
  return m ? element("span", "", element("span", m[1], m[1]), " " + m[2]) : element("span", "", text);
}

// the page's fixed words, in the learner's own language (after loadText, and again when the language changes)
export const showText = (lang) => { applyText(); document.documentElement.lang = lang; };

// First use: ask for the name, `onName(name)` when given
export function askName(onName) {
  $("welcome-title").textContent = t("welcome");
  $("welcome-text").textContent = t("your-name");
  $("name-form").hidden = false;
  $("start").hidden = true;
  $("name").focus();
  $("name-form").onsubmit = event => {
    event.preventDefault();
    const name = $("name").value.trim();
    if (name) onName(name);
  };
}

// Every later visit: greet with the totals (all modes), `onStart()` on the button
export function showWelcome(name, today, overall, onStart) {
  const line = row => row ? t("stats-line", { n: row.answers, answers: tn("answers", row.answers), p: percentCorrect(row), s: averageSeconds(row) }) : "–";
  $("welcome-title").textContent = t("hello", { name });
  $("welcome-text").textContent = "";
  $("welcome-stats").replaceChildren(
    element("div", "", element("span", "label", t("today")), line(today)),
    element("div", "", element("span", "label", t("overall")), line(overall)));
  $("welcome-stats").hidden = false;
  $("name-form").hidden = true;
  $("start").hidden = false;
  $("start").focus();
  $("start").onclick = onStart;
  $("title").onclick = () => (location.href = "dictionary.html");   // (the title switches to the dictionary; the tabs beside it too)
}

// THE OFFLINE COPY on the welcome screen: the version kept, and the update only when asked -- `check()` -> the online
// version (null: no network), `update()` fetches it and reloads
export function showVersion(kept, { check, update }) {
  $("version").textContent = kept ? t("offline-copy", { v: kept }) : t("making-offline");
  $("checkUpdate").hidden = false;
  $("checkUpdate").onclick = async () => {
    $("checkUpdate").disabled = true;
    const online = await check();
    $("checkUpdate").disabled = false;
    if (online === null) return void ($("version").textContent = `${t("offline-copy", { v: kept })} · ${t("no-network")}`);
    if (online === kept) return void ($("version").textContent = `${t("offline-copy", { v: kept })} · ${t("newest")}`);
    $("version").textContent = `${t("offline-copy", { v: kept })} · ${t("new-version", { v: online })}`;
    Object.assign($("doUpdate"), { hidden: false, textContent: t("update-now"), onclick: async () => {
      $("doUpdate").disabled = true; $("doUpdate").textContent = t("updating");
      try { await update(); } catch (error) { $("doUpdate").disabled = false; $("doUpdate").textContent = t("update-failed") + (error?.message ? ` · ${error.message}` : ""); }
    } });
  };
}

export function showTrainer(name) {
  $("welcome").hidden = true;
  $("trainer").hidden = false;
  $("more").hidden = false;
  $("learner").textContent = name;
}

// THE MODES: the exercise select (Words, Morphology, Syntax -- beside the language learned), the word modes as tabs
// under it (the vocabulary both ways, der/die/das, the plural), and only the chosen mode's filters -- `onChoose(name)`
// a mode chosen; Words chooses its last mode (`lastOf("words")`) or its first; a mode's label is a key of the learner's
// language (t) or a word as it is
export function showModes(modes, current, onChoose, lastOf = () => null) {
  const group = modes[current]?.group ?? "words", kindOf = (name) => (modes[name].group === "words" ? "words" : modes[name].kind);
  const names = (kind) => Object.keys(modes).filter((n) => kindOf(n) === kind);
  for (const o of $("kind").options) o.hidden = !names(o.value).length;
  $("kind").value = kindOf(current);
  $("kind").onchange = () => { const kind = $("kind").value, ns = names(kind); onChoose(kind === "words" && ns.includes(lastOf("words")) ? lastOf("words") : ns[0]); };
  $("modes").hidden = group !== "words";
  $("modes").replaceChildren(...Object.entries(modes).filter(([, m]) => m.group === group).map(([name, mode]) => {
    const tab = element("button", name === current ? "tab chosen" : "tab", t(mode.label));
    tab.dataset.mode = name;
    tab.onclick = () => onChoose(name);
    return tab;
  }));
  document.body.dataset.mode = current;
  document.body.dataset.group = group;
  for (const f of document.querySelectorAll(".filter")) f.hidden = f.dataset.filter !== modes[current]?.filter;
  // (the level: a word's own FREQ; in a sentence, the word asked -- forms -- or one of its words -- word order --, the
  //  others no rarer)
  $("level").title = t(group === "sentences" ? "freq-title-grammar" : "freq-title");
}

// a filter's choices: `items` [{ name, label, stage?, none? }] after its "all" (grouped by stage when they have one; `none`:
// found to have no sentence at this level -- said beside it)
export function showChoices(id, allKey, items) {
  const kept = $(id).value, groups = new Map();
  for (const it of items) (groups.get(it.stage ?? "") ?? groups.set(it.stage ?? "", []).get(it.stage ?? "")).push(it);
  $(id).replaceChildren(new Option(t(allKey), "all"), ...[...groups].map(([stage, its]) => {
    const opts = its.map((it) => new Option(it.label + (it.none ? ` — ${it.none}` : ""), it.name));
    if (!stage) return opts;
    const g = document.createElement("optgroup"); g.label = stage; g.append(...opts); return g;
  }).flat());
  $(id).value = items.some((it) => it.name === kept) ? kept : "all";
}

export function showCategories(categories) {
  const kept = $("category").value;
  $("category").replaceChildren(new Option(t("all-categories"), ""), ...categories.map((name) => new Option(name, name)));
  if (categories.includes(kept)) $("category").value = kept;
}

// the language learned (the select above the exercises) -- `onChoose(code)`; and the learner's own (in the settings)
export function showLearn(langs, learn, onChoose) {
  const codes = Object.keys(langs).filter((c) => langs[c].dict);
  $("learn").replaceChildren(...codes.map((c) => new Option(langs[c].name, c)));
  $("learn").value = learn;
  $("learn").onchange = () => onChoose($("learn").value);
}
export function showNative(langs, native, onChoose) {
  const codes = Object.keys(langs).filter((c) => langs[c].ui);
  $("native").replaceChildren(...codes.map((c) => new Option(langs[c].name, c)));
  $("native").value = native;
  $("native").onchange = () => onChoose($("native").value);
}

// the heading: the language learned (German with its three articles in their colours)
export function showTitle(name, articles) {
  $("title").replaceChildren(name + " ", ...(articles ? ARTICLES.flatMap((a) => [element("span", a, a), " "]) : []));
  document.title = `${name} · ${t("trainer")}`;
}

// a word's line above its question
export const entryMeta = (entry) => `${entry.category} · ${entry.pos} · FREQ ${entry.freq}`;

function clearCard() {
  $("card").classList.remove("was-right", "was-wrong");
  $("order").hidden = true;
  $("options").replaceChildren();
  $("feedback").replaceChildren();
  $("examples").replaceChildren();
  $("again").hidden = true;
}

// The 🔊 beside the question: says once more what was last spoken (app.js `say`); hidden while nothing was -- a
// question whose answer is only spoken once answered does not give it away by sound.
export function showRepeat(onSay) {
  const b = $("again");
  b.hidden = !onSay;
  b.onclick = onSay;
  b.title = b.ariaLabel = t("say-again");
}

// `onChoose(option)` is called on every click of an option: to answer, or (the right one, after answering) to go on
export function showQuestion(meta, question, onChoose) {
  clearCard();
  $("meta").textContent = meta;
  const colors = !!question.articles;
  $("prompt").replaceChildren(withArticleColor(question.prompt, colors));
  $("hint").textContent = question.hint;
  $("feedback").replaceChildren();
  $("options").replaceChildren(...question.options.map((option, i) => {
    const button = element("button", colors && ARTICLES.includes(option) ? `option article ${option}` : "option",
      element("span", "key", i + 1), withArticleColor(option, colors));
    button.dataset.option = option;
    button.onclick = () => onChoose(option);
    return button;
  }));
}

// After answering only the right option stays clickable: clicking it goes on.
export function showFeedback(question, chosen, detailText) {
  const correct = chosen === question.answer;
  $("card").classList.add(correct ? "was-right" : "was-wrong");             // the whole card shows the result
  for (const button of $("options").children) {
    const isAnswer = button.dataset.option === question.answer;
    button.disabled = !isAnswer;
    if (isAnswer) button.classList.add("right", ...(correct ? [] : ["waiting"]));
    else if (button.dataset.option === chosen) button.classList.add("wrong");
  }
  $("feedback").replaceChildren(
    correct
      ? element("div", "verdict right", t("right"))
      : element("div", "verdict wrong", "✗ ", withArticleColor(question.answer, !!question.articles), element("span", "go-on", " " + t("wrong-go-on"))),
    element("div", "details", withArticleColor(detailText, !!question.articles)),
  );
}

export function showEmpty(message) {
  clearCard();
  $("meta").textContent = "";
  $("prompt").textContent = message;
  $("hint").textContent = "";
}

// WORD ORDER: the sentence built above in its SLOTS -- a slot for every word to place, the words GIVEN (one clause of
// two) and the punctuation fixed where they belong (the comma between the clauses, the full stop or question mark at
// the end) --, the words below in their places (a click fills the next free slot and greys the tile out; a click on a
// placed word takes it back). `task.tiles` the words shuffled, `task.slots` the sentence's tokens: `w` a slot to fill,
// `=word` a word given, else the mark itself.
// `onCheck(words)` once every word is placed and Check (or Enter) is pressed. Returns { check, back } for the keys.
export function showOrder(meta, task, onCheck) {
  clearCard();
  $("meta").textContent = meta;
  $("prompt").textContent = t("order-prompt");
  $("hint").textContent = task.hint ?? "";
  $("order").hidden = false;
  const placed = [];
  let done = false;
  const bank = task.tiles.map((w, i) => { const b = element("button", "tile", w); b.onclick = () => { if (!done && !placed.includes(i)) { placed.push(i); render(); } }; return b; });
  $("bank").replaceChildren(...bank);
  function render() {
    let k = 0;
    $("built").replaceChildren(...task.slots.map((slot) => {
      if (slot.startsWith("=")) return element("span", "tile given", slot.slice(1));
      if (slot !== "w") return element("span", "end", slot);
      const i = placed[k++];
      if (i === undefined) return element("span", "slot");
      const b = element("button", "tile", task.tiles[i]); b.onclick = () => { if (!done) { placed.splice(placed.indexOf(i), 1); render(); } }; return b;
    }));
    bank.forEach((b, i) => (b.disabled = placed.includes(i)));
    $("check").disabled = done || placed.length !== task.tiles.length;
  }
  const check = () => { if (!done && placed.length === task.tiles.length) { done = true; render(); onCheck(placed.map((i) => task.tiles[i])); } };
  $("check").onclick = check;
  render();
  return { check, back: () => { if (!done && placed.length) { placed.pop(); render(); } } };
}
// its result: the built words marked, the right sentence shown -- `onNext()` on the button
export function showOrderResult(correct, rightText, onNext) {
  $("card").classList.add(correct ? "was-right" : "was-wrong");
  $("built").classList.toggle("right", correct); $("built").classList.toggle("wrong", !correct);
  const next = element("button", "go next", t("next"));
  next.onclick = onNext;
  $("feedback").replaceChildren(
    correct ? element("div", "verdict right", t("right")) : element("div", "verdict wrong", "✗ ", element("span", "", rightText)),
    ...(correct ? [element("div", "details", rightText)] : []), next);
}

// A WORD'S EXAMPLE SENTENCES (engine/practice.js) under the question. `list` [{ text, mark }], the word marked -- or,
// `hidden`, a blank in its place (the sentences then not spoken on a click: they would say the answer); `onSay(sentence)`
// a sentence clicked
export function showExamples(list, onSay, { hidden = false } = {}) {
  $("examples").replaceChildren(...list.map((x) => {
    const parts = x.mark ? [x.text.slice(0, x.mark[0]), hidden ? element("span", "blank", "____") : element("mark", "", x.text.slice(...x.mark)), x.text.slice(x.mark[1])] : [x.text];
    const div = element("div", "example", ...parts);
    if (!hidden) div.onclick = () => onSay(x);
    return div;
  }));
}

export function showStatus({ due, newToday, newPerDay, learned, total }) {
  $("status").textContent = t("status", { due, new: newToday, perDay: newPerDay, learned, total });
}

// The strip above the question: today's right and wrong, and the rates today and overall (all categories)
export function showSummary(today, overall) {
  $("today-right").textContent = today ? today.correct : 0;
  $("today-wrong").textContent = today ? today.answers - today.correct : 0;
  $("today-rate").textContent = today ? `${percentCorrect(today)} % · ${averageSeconds(today)} s` : "–";
  $("overall-rate").textContent = overall ? t("stats-line", { n: overall.answers, answers: tn("answers", overall.answers), p: percentCorrect(overall), s: averageSeconds(overall) }) : "–";
}

// The counter that just went up pops, and a "+1" floats up from it
export function celebrate(correct) {
  const counter = $(correct ? "today-right" : "today-wrong");
  counter.classList.remove("pop");
  void counter.offsetWidth;                                  // (restarts the animation)
  counter.classList.add("pop");
  const plusOne = element("span", "plus-one", "+1");
  plusOne.onanimationend = () => plusOne.remove();
  counter.parentElement.append(plusOne);
}

// One row per category: answers, % right, average seconds -- today and overall (`label`: a category's name shown)
export function showStats(today, overall, label = (n) => n, title = "") {
  $("stats-mode").textContent = title;
  const cells = row => row
    ? [element("td", "", row.answers), element("td", "", percentCorrect(row) + " %"), element("td", "", averageSeconds(row) + " s")]
    : [element("td", "", "–"), element("td", "", ""), element("td", "", "")];
  const names = ["all", ...Object.keys(overall).filter(name => name !== "all").sort()];
  $("stats-body").replaceChildren(...names.filter(name => overall[name]).map(name =>
    element("tr", name === "all" ? "total" : "", element("td", "", name === "all" ? t("all") : label(name)), ...cells(today[name]), ...cells(overall[name]))));
}

// the speech controls: how loud (0 off .. 3 loud), the voice, the tempo (1 the language's own) -- `onChange({ level, kind, tempo })`
export function showSpeech({ level, kind, tempo }, onChange) {
  $("speech").value = String(level); $("voice").value = kind; $("tempo").value = String(tempo);
  const changed = () => { const level = Number($("speech").value); $("voice").disabled = $("tempo").disabled = !level; onChange({ level, kind: $("voice").value, tempo: Number($("tempo").value) }); };
  $("voice").disabled = $("tempo").disabled = !level;
  $("speech").onchange = $("voice").onchange = $("tempo").onchange = changed;
}

export const selected = id => $(id).value;
// (a kept choice set again, where the list still has it)
export const setSelected = (id, value) => { if (value != null && [...$(id).options].some((o) => o.value === String(value))) $(id).value = String(value); };
export const levelLabel = () => $("level").selectedOptions[0]?.textContent ?? "";
export const showStatusText = (text) => ($("status").textContent = text);
export const onChange = (id, handler) => ($(id).onchange = handler);

// Keys 1-3 are passed on as the option they number (0-2); Enter and Backspace as their names
export function onKeys(handler) {
  document.addEventListener("keydown", event => {
    if (event.target.closest?.("input, select, textarea")) return;
    if (["1", "2", "3"].includes(event.key)) handler(Number(event.key) - 1);
    else if (event.key === "Enter" || event.key === "Backspace") { event.preventDefault(); handler(event.key); }
  });
}

// ---- MORE: the menu, and its panels (settings, statistics, recorded data) -- one open at a time, under the card -------
export function setupMore({ onPanel }) {
  const menu = $("moreMenu"), button = $("moreButton");
  const close = () => { menu.hidden = true; button.setAttribute("aria-expanded", "false"); };
  button.onclick = (event) => { event.stopPropagation(); menu.hidden = !menu.hidden; button.setAttribute("aria-expanded", String(!menu.hidden)); };
  document.addEventListener("click", (event) => { if (!event.target.closest("#more")) close(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
  for (const item of menu.querySelectorAll("[data-panel]")) item.onclick = () => { close(); openPanel(item.dataset.panel); onPanel(item.dataset.panel); };
  for (const p of document.querySelectorAll(".panel")) p.querySelector(".close").onclick = () => (p.hidden = true);
}
export function openPanel(name) {
  for (const p of document.querySelectorAll(".panel")) p.hidden = p.id !== "panel-" + name;
  $("panel-" + name).scrollIntoView({ behavior: "smooth", block: "nearest" });
}
export const panelOpen = (name) => !$("panel-" + name).hidden;

// RECORDED DATA: every answer kept (storage.js), newest first, of one exercise or all; more on request; the whole log
// as a file -- `labelOf(mode)` an exercise's name
const PAGE = 100;
export function showData(answers, profile, labelOf) {
  const modes = [...new Set(answers.map((a) => a.mode))];
  const kept = $("data-mode").value;
  $("data-mode").replaceChildren(new Option(t("every-exercise"), ""), ...modes.map((m) => new Option(labelOf(m), m)));
  $("data-mode").value = modes.includes(kept) ? kept : "";
  const first = answers[0] ? new Date(answers[0].time).toLocaleDateString() : "–";
  $("data-summary").textContent = t("data-summary", { n: answers.length, date: first, name: profile.name ?? "–" });
  let shown = PAGE;
  const rows = () => {
    const list = answers.filter((a) => !$("data-mode").value || a.mode === $("data-mode").value).slice().reverse();
    $("data-body").replaceChildren(...list.slice(0, shown).map((a) => element("tr", a.correct ? "" : "missed",
      element("td", "", new Date(a.time).toLocaleString([], { dateStyle: "short", timeStyle: "short" })), element("td", "", labelOf(a.mode)),
      element("td", "", a.prompt), element("td", "", a.answer), element("td", "", a.chosen), element("td", "", a.correct ? "✓" : "✗"), element("td", "", (a.ms / 1000).toFixed(1)))));
    $("data-more").hidden = list.length <= shown;
  };
  $("data-mode").onchange = () => { shown = PAGE; rows(); };
  $("data-more").onclick = () => { shown += PAGE; rows(); };
  $("data-download").onclick = () => {
    const blob = new Blob([JSON.stringify({ profile, answers }, null, 1)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `trainer-data-${new Date().toISOString().slice(0, 10)}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  rows();
}
