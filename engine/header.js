// THE HEADER OF THE ONE PAGE (index.html): on the left the FLAG of the language learned -- a click opens the languages, and
// the one chosen is learned in every view at once (the trainer, the dictionary, the reading: each registers `onLearn`);
// in the middle the view tabs (Grammar | Dictionary | Reading); on the right ☰ -- a popup (closed with ✕, Escape or a click
// outside) with the dictionary's filters and print when the dictionary is shown, and the trainer's own sections: the
// settings (one's own language, speech, the version), statistics, the recorded data, the sentence generator.
import { t } from "./text.js";
import { LANGS } from "./langs.js";
import { keepLearn, keptPair } from "./storage.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, ...kids) => { const x = document.createElement(tag); if (cls) x.className = cls; for (const k of kids) if (k != null) x.append(k); return x; };
export const VIEWS = ["trainer", "dictionary", "reading"];   // (the tab keys: their words in <lang>/ui.txt carry the icons: 📖 Slovník)
const HASH = { trainer: "#grammar", dictionary: "#dictionary", reading: "#reading" };
const listeners = [];
let learn = keptPair().learn;

export function mountHeader() {
  const nav = $("pages");
  nav.replaceChildren(...VIEWS.map((key) => { const a = el("a", "", t(key)); a.href = HASH[key]; a.dataset.t = key; a.dataset.view = key; return a; }));
  // the languages: flag and name each, the one learned marked
  const pop = $("lang-pop");
  pop.replaceChildren(el("h4", "", t("learning-title")), ...Object.keys(LANGS).filter((c) => LANGS[c].dict).map((c) => {
    const b = el("button", "lang-choice", el("span", "lang-flag", LANGS[c].flag), el("span", "lang-name", LANGS[c].name));
    b.dataset.lang = c; b.onclick = () => { closePops(); chooseLearn(c); };
    return b;
  }));
  showFlag();
  $("lang-btn").onclick = (ev) => { ev.stopPropagation(); togglePop("lang-pop"); };
  $("menu-btn").onclick = (ev) => { ev.stopPropagation(); togglePop("menu"); };
  $("menu").querySelector(".pop-close").onclick = closePops;
  for (const a of $("menu-more").querySelectorAll("a")) a.addEventListener("click", closePops);   // (a section chosen: the menu goes)
  document.addEventListener("click", (ev) => { if (!ev.target.closest(".pop")) closePops(); });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closePops(); });
}
function togglePop(id) { const was = !$(id).hidden; closePops(); $(id).hidden = was; }
export function closePops() { for (const p of document.querySelectorAll(".pop")) p.hidden = true; }
function showFlag() {
  Object.assign($("lang-btn"), { textContent: LANGS[learn].flag, title: `${LANGS[learn].name} · ${t("learning-title")}` });
  for (const b of document.querySelectorAll(".lang-choice")) b.classList.toggle("chosen", b.dataset.lang === learn);
}
// the language learned: chosen in the popup, or by a dictionary link into another language -- kept (storage.js
// keepLearn: the pair setting, the one record of it), the flag shown, every view told
export const learning = () => learn;
export function onLearn(fn) { listeners.push(fn); }
export function chooseLearn(code) {
  if (!LANGS[code]?.dict || code === learn) return;
  learn = code; keepLearn(code); showFlag();
  for (const fn of listeners) fn(code);
}
// which view is shown: its section, its tab marked, the dictionary's part of ☰ with it
export function showView(view) {
  document.body.dataset.view = view;
  for (const v of VIEWS) $("view-" + (v === "trainer" ? "grammar" : v)).hidden = v !== view;
  for (const a of document.querySelectorAll(".pages a")) a.classList.toggle("current", a.dataset.view === view);
  $("menu-dict").hidden = view !== "dictionary";
  closePops();
}
