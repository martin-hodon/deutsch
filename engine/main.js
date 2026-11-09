// THE ONE PAGE (index.html): the page's words in the learner's own language, the header, then the view the address asks
// for -- #grammar (the trainer, engine/app.js: started at once), #dictionary or a dictionary entry #de/Haus
// (engine/dictionary.js), #reading (engine/reading.js) -- the dictionary and the reading started when first shown; the
// trainer's #more and #panel-... are its own (app.js route). A change of view or language changes nothing but what is shown.
import { LANGS } from "./langs.js";
import { keptPair } from "./storage.js";
import { loadText, applyText } from "./text.js";
import { mountHeader, showView } from "./header.js";
import * as trainer from "./app.js";
import * as dictionary from "./dictionary.js";
import * as reading from "./reading.js";

const started = {};
const once = async (name, start) => { if (!started[name]) { started[name] = start(); } await started[name]; };
function viewOf(hash) {
  if (hash === "#dictionary") return "dictionary";
  if (hash === "#reading") return "reading";
  const m = hash.match(/^#(\w\w)(\/.*)?$/);
  if (m && LANGS[m[1]]?.dict) return "dictionary";   // (an entry, a category, a component -- or the language alone)
  return "trainer";
}
async function route() {
  const view = viewOf(location.hash);
  showView(view);
  if (view === "dictionary") await once("dictionary", dictionary.start);
  if (view === "reading") await once("reading", reading.start);
}
async function main() {
  const pair = keptPair();
  await loadText(LANGS[pair.other]?.ui ?? "sk/ui.txt", LANGS.en.ui);
  applyText(); document.documentElement.lang = pair.other;
  mountHeader();
  window.addEventListener("hashchange", route);
  await route();
  once("trainer", trainer.start);
}
main();
