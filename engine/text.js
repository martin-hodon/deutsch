// THE TRAINER'S WORDS in the learner's own language (<lang>/ui.txt: `key = text`, with {holes} the page fills; `key.1`,
// `key.few`, `key.many` the forms by number). English (en/ui.txt) is the fallback for a key a language has not.
//
//   await loadText("sk/ui.txt", "en/ui.txt")
//   t("hello", { name })            -> "Ahoj, Martin!"
//   tn("answers", 3)                -> "odpovede"   (key.1 for 1, key.few for 2-4 when there is one, else key.many, else key)
//   applyText()                     every element with data-t (its text), data-t-title (its title) set from its key
let table = {}, fallback = {};

async function read(url) {
  const out = {};
  if (!url) return out;
  for (const raw of (await (await fetch(url)).text()).split("\n")) {
    const m = raw.match(/^([\w.-]+) = (.*)$/);
    if (m && !raw.startsWith("#")) out[m[1]] = m[2].trim();
  }
  return out;
}
export async function loadText(url, fallbackUrl = null) {
  [table, fallback] = await Promise.all([read(url), fallbackUrl && fallbackUrl !== url ? read(fallbackUrl) : {}]);
}
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
export const t = (key, vars = {}) => fill(table[key] ?? fallback[key] ?? key, vars);
export const has = (key) => key in table || key in fallback;
export function tn(key, n, vars = {}) {
  const form = n === 1 && has(`${key}.1`) ? `${key}.1` : n >= 2 && n <= 4 && has(`${key}.few`) ? `${key}.few` : has(`${key}.many`) ? `${key}.many` : key;
  return t(form, { n, ...vars });
}
export function applyText(root = document) {
  for (const el of root.querySelectorAll("[data-t]")) el.textContent = t(el.dataset.t);
  for (const el of root.querySelectorAll("[data-t-title]")) el.title = t(el.dataset.tTitle);
  for (const el of root.querySelectorAll("[data-t-placeholder]")) el.placeholder = t(el.dataset.tPlaceholder);
}
