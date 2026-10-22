// THE HEADER OF EVERY PAGE (trainer.html, dictionary.html, reading.html): the page's title on the left; in the upper
// right corner the page tabs (Grammar | Dictionary | Reading | ⋯ -- trainer.html is the grammar page), and under them the
// learner's name. The small ⋯ tab is the trainer's own section (trainer.html#more): the settings -- the language learned
// and one's own among them -- open, then statistics, the recorded data, the sentence generator. One place for the markup
// the three pages share; on the trainer engine/app.js switches between the exercises and ⋯ without leaving the page.
import { t } from "./text.js";
import { peekName } from "./storage.js";

const el = (tag, cls, ...kids) => { const x = document.createElement(tag); if (cls) x.className = cls; for (const k of kids) if (k != null) x.append(k); return x; };
export const PAGES = [["trainer", "trainer.html"], ["dictionary", "dictionary.html"], ["reading", "reading.html"]];
export const MORE = "trainer.html#more";

// `page`: which tab is current; on the trainer the ⋯ tab waits hidden until the learner is in (ui.showTrainer), and
// ui.showView moves the current mark between Grammar and ⋯
export function mountHeader(page) {
  const head = document.querySelector("header.top");
  if (!head || head.querySelector(".corner")) return;
  const nav = el("nav", "pages");
  for (const [key, href] of PAGES) { const a = el("a", key === page ? "current" : "", t(key)); a.href = href; a.dataset.t = key; nav.append(a); }   // (the translations carry their icons: 📖 Slovník)
  const more = el("a", "more-tab", "⋯"); more.id = "moreTab"; more.href = MORE; more.hidden = page === "trainer";
  more.dataset.tTitle = "more"; more.title = t("more");   // (the word in the tooltip only: the tab is the icon)
  nav.append(more);
  const learner = el("span", "", peekName() ?? ""); learner.id = "learner";
  head.append(el("div", "corner", nav, el("div", "who", learner)));
}
