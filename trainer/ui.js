// Everything drawn on the page: the welcome, the mode tabs, the question, the feedback, the status line, the statistics.
import { percentCorrect, averageSeconds } from "./stats.js";

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

// First use: ask for the name, `onName(name)` when given
export function askName(onName) {
  $("welcome-title").textContent = "Willkommen!";
  $("welcome-text").textContent = "Wie heißt du? (Ako sa voláš?)";
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
  const line = row => row ? `${row.answers} ${row.answers === 1 ? "answer" : "answers"} · ${percentCorrect(row)} % right · ${averageSeconds(row)} s` : "–";
  $("welcome-title").textContent = `Hallo, ${name}!`;
  $("welcome-text").textContent = "";
  $("welcome-stats").replaceChildren(
    element("div", "", element("span", "label", "today"), line(today)),
    element("div", "", element("span", "label", "overall"), line(overall)));
  $("welcome-stats").hidden = false;
  $("name-form").hidden = true;
  $("start").hidden = false;
  $("start").focus();
  $("start").onclick = onStart;
}

// THE OFFLINE COPY on the welcome screen: the version kept, and the update only when asked -- `check()` -> the online
// version (null: no network), `update()` fetches it and reloads
export function showVersion(kept, { check, update }) {
  $("version").textContent = kept ? `offline copy ${kept}` : "making the offline copy...";
  $("checkUpdate").hidden = false;
  $("checkUpdate").onclick = async () => {
    $("checkUpdate").disabled = true;
    const online = await check();
    $("checkUpdate").disabled = false;
    if (online === null) return void ($("version").textContent = `offline copy ${kept} · no network: nothing to check`);
    if (online === kept) return void ($("version").textContent = `offline copy ${kept} · the newest`);
    $("version").textContent = `offline copy ${kept} · new: ${online}`;
    Object.assign($("doUpdate"), { hidden: false, textContent: "update now", onclick: async () => {
      $("doUpdate").disabled = true; $("doUpdate").textContent = "updating...";
      try { await update(); } catch { $("doUpdate").disabled = false; $("doUpdate").textContent = "update failed -- try again"; }
    } });
  };
}

export function showTrainer(name) {
  $("welcome").hidden = true;
  $("trainer").hidden = false;
  $("learner").textContent = name;
}

export function showModes(modes, current, onChoose) {
  $("modes").replaceChildren(...Object.entries(modes).map(([name, mode]) => {
    const tab = element("button", name === current ? "tab chosen" : "tab", mode.label);
    tab.dataset.mode = name;
    tab.onclick = () => onChoose(name);
    return tab;
  }));
  document.body.dataset.mode = current;
}

export function showCategories(categories) {
  for (const name of categories) $("category").add(new Option(name, name));
}

// `onChoose(option)` is called on every click of an option: to answer, or (the right one, after answering) to go on
export function showQuestion(entry, question, onChoose) {
  $("card").classList.remove("was-right", "was-wrong");
  $("meta").textContent = `${entry.category} · ${entry.pos} · FREQ ${entry.freq}`;
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
      ? element("div", "verdict right", "✓ správne")
      : element("div", "verdict wrong", "✗ ", withArticleColor(question.answer, !!question.articles), element("span", "go-on", " — click it to go on")),
    element("div", "details", withArticleColor(detailText, !!question.articles)),
  );
}

export function showEmpty(message) {
  $("meta").textContent = "";
  $("prompt").textContent = message;
  $("hint").textContent = "";
  $("options").replaceChildren();
  $("feedback").replaceChildren();
}

export function showStatus({ due, newToday, newPerDay, learned, total }) {
  $("status").textContent = `due ${due} · new today ${newToday}/${newPerDay} · learned ${learned}/${total}`;
}

// The strip above the question: today's right and wrong, and the rates today and overall (all categories)
export function showSummary(today, overall) {
  $("today-right").textContent = today ? today.correct : 0;
  $("today-wrong").textContent = today ? today.answers - today.correct : 0;
  $("today-rate").textContent = today ? `${percentCorrect(today)} % · ${averageSeconds(today)} s` : "–";
  $("overall-rate").textContent = overall ? `${overall.answers} answers · ${percentCorrect(overall)} % · ${averageSeconds(overall)} s` : "–";
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

// One row per category: answers, % right, average seconds -- today and overall
export function showStats(today, overall) {
  const cells = row => row
    ? [element("td", "", row.answers), element("td", "", percentCorrect(row) + " %"), element("td", "", averageSeconds(row) + " s")]
    : [element("td", "", "–"), element("td", "", ""), element("td", "", "")];
  const names = ["all", ...Object.keys(overall).filter(name => name !== "all").sort()];
  $("stats-body").replaceChildren(...names.filter(name => overall[name]).map(name =>
    element("tr", name === "all" ? "total" : "", element("td", "", name), ...cells(today[name]), ...cells(overall[name]))));
}

// the speech controls: how loud (0 off .. 3 loud), and the voice -- `onChange({ level, kind })` when either changes
export function showSpeech({ level, kind }, onChange) {
  $("speech").value = String(level); $("voice").value = kind; $("voice").disabled = !level;
  const changed = () => { const level = Number($("speech").value); $("voice").disabled = !level; onChange({ level, kind: $("voice").value }); };
  $("speech").onchange = changed; $("voice").onchange = changed;
}

export const selected = id => $(id).value;
export const onChange = (id, handler) => ($(id).onchange = handler);

// Keys 1-3 are passed on as the option they number (0-2)
export function onKeys(handler) {
  document.addEventListener("keydown", event => {
    if (["1", "2", "3"].includes(event.key)) handler(Number(event.key) - 1);
  });
}
