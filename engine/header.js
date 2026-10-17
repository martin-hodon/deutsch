// THE HEADER OF EVERY PAGE (trainer.html, dictionary.html, reading.html): the page's title on the left; in the upper
// right corner the page tabs (Grammar | Dictionary | Reading -- trainer.html is the grammar page), and under them the learner's name and the ⋯ menu --
// settings, statistics, the recorded data (panels of the trainer: on another page the links open the trainer on that
// panel, trainer.html#panel-settings), the sentence generator. One place for the markup the three pages share;
// engine/ui.js (setupMore) wires the menu on the trainer, the other pages only need the links.
import { t } from "./text.js";
import { peekName } from "./storage.js";

const el = (tag, cls, ...kids) => { const x = document.createElement(tag); if (cls) x.className = cls; for (const k of kids) if (k != null) x.append(k); return x; };
export const PAGES = [["trainer", "trainer.html"], ["dictionary", "dictionary.html"], ["reading", "reading.html"]];
const PANELS = ["settings", "stats", "data"];
const PANEL_KEY = { settings: "settings", stats: "statistics", data: "data" };

// `page`: which tab is current; on the trainer the menu's items open its panels (data-panel, hooked by ui.setupMore)
// and the ⋯ waits hidden until the learner is in (ui.showTrainer); elsewhere they are links into the trainer
export function mountHeader(page) {
  const head = document.querySelector("header.top");
  if (!head || head.querySelector(".corner")) return;
  const nav = el("nav", "pages");
  for (const [key, href] of PAGES) { const a = el("a", key === page ? "current" : "", t(key)); a.href = href; a.dataset.t = key; nav.append(a); }   // (the translations carry their icons: 📖 Slovník)
  const learner = el("span", "", peekName() ?? ""); learner.id = "learner";
  const button = el("button", "more-button", "⋯"); button.id = "moreButton"; button.setAttribute("aria-haspopup", "menu"); button.setAttribute("aria-expanded", "false"); button.title = t("more").replace(/^[^\p{L}]+/u, "");   // (the word alone: the button is the icon)
  const menu = el("div", "menu"); menu.id = "moreMenu"; menu.setAttribute("role", "menu"); menu.hidden = true;
  for (const panel of PANELS) {
    const item = page === "trainer" ? el("button", "", t(PANEL_KEY[panel])) : el("a", "", t(PANEL_KEY[panel]));
    item.setAttribute("role", "menuitem"); item.dataset.t = PANEL_KEY[panel];
    if (page === "trainer") item.dataset.panel = panel; else item.href = `trainer.html#panel-${panel}`;
    menu.append(item);
  }
  const gen = el("a", "", t("generator")); gen.href = "sentences.html"; gen.setAttribute("role", "menuitem"); gen.dataset.t = "generator"; menu.append(gen);
  const more = el("div", "more", button, menu); more.id = "more"; more.hidden = page === "trainer";
  if (page !== "trainer") {   // (no ui.setupMore here: the menu opens and closes on its own)
    button.onclick = (ev) => { ev.stopPropagation(); menu.hidden = !menu.hidden; button.setAttribute("aria-expanded", String(!menu.hidden)); };
    document.addEventListener("click", (ev) => { if (!ev.target.closest("#more")) menu.hidden = true; });
  }
  head.append(el("div", "corner", nav, el("div", "who", learner, more)));
}
