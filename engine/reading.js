// THE READING PAGE (reading.html): a text pasted in a language is shown word by word; a word under the mouse shows what
// the dictionary knows of it -- the dictionary word it is a form of (läuft -> laufen), its meanings, its IPA --, a click
// says it (speak.js, the form's own sound by the language's letter rules, engine/sounds.js), a 📖 in the tip opens its
// dictionary entry, and each paragraph has a 🔊 that reads it whole. Forms are found through an index of every word's
// forms (engine/wordforms.js, shared with the dictionary) built once for the language; Chinese text is cut into dictionary words by the longest match.
// The text is kept in the browser (localStorage) for the next visit.
import { loadDictionary, shown, spoken } from "./data.js";
import { LANGS } from "./langs.js";
import { keptPair, keepLearn } from "./storage.js";
import { mountHeader } from "./header.js";
import { formsIndex, fold, ELISIONS } from "./wordforms.js";
import { loadDerivations, derivationText } from "./derive.js";
import { loadSounds } from "./sounds.js";
import { loadCharMeanings } from "./hanzi.js";
import { createVoice, loadProsody, phrase } from "./speak.js";
import { loadText, t, applyText } from "./text.js";
import * as DE from "../de/morph.js";   // (pluralIPA: a German plural's sound)

const $ = (id) => document.getElementById(id);
const el = (tag, cls, ...kids) => { const x = document.createElement(tag); if (cls) x.className = cls; for (const k of kids) if (k != null) x.append(k); return x; };
const dicts = {}, voice = createVoice();
let lang = "de", dict = null;

// a language's dictionary with an index of every form it knows: form (folded) -> entries
async function loadLang(l) {
  if (dicts[l]) return dicts[l];
  const d = await loadDictionary(LANGS[l].dict, LANGS[l].order, l);
  if (LANGS[l].morph) d.morph = await (await import("../" + LANGS[l].morph)).loadMorphology(LANGS[l].irregular);
  if (l === "de") await DE.loadMorphology("de/rules/morphology.txt");
  d.ipaOf = await loadSounds(`${l}/rules/sounds.txt`, new Map(d.entries.map((e) => [e.word, e])));
  await formsIndex(d, l);   // (every form -> its entries: engine/wordforms.js, shared with the dictionary)
  d.derive = (await loadDerivations(l)).derive;   // (a word it has not: a known word + a regular derivation -- roughly)
  d.maxLen = l === "zh" ? Math.max(...d.entries.map((e) => e.word.length)) : 0;
  if (l === "zh") d.charMeanings = await loadCharMeanings("zh/chars.txt");   // (a character that is no word: its meaning)
  return (dicts[l] = d);
}

// the text cut into tokens: words (letters, with ' and - inside) and the rest; Chinese by the longest dictionary word
function tokenize(text) {
  if (lang === "zh") {
    const out = [];
    for (let i = 0; i < text.length; ) {
      if (!/[一-鿿]/.test(text[i])) { const m = text.slice(i).match(/^[^一-鿿]+/); out.push({ w: m[0] }); i += m[0].length; continue; }
      let n = Math.min(dict.maxLen || 4, text.length - i);
      while (n > 1 && !dict.index.has(text.slice(i, i + n))) n--;
      out.push({ w: text.slice(i, i + n), word: true }); i += n;
    }
    return out;
  }
  const out = [], re = /\p{L}[\p{L}\p{M}'’-]*|[^\p{L}]+/gu;
  for (const m of text.matchAll(re)) {
    const el = ELISIONS[lang] && m[0].match(/^(\p{L}{1,5})['’](\p{L}.*)$/u);   // (d'un: d' + un -- when d' is an elided word)
    if (el && ELISIONS[lang][el[1].toLowerCase() + "'"]) { out.push({ w: el[1] + "'", word: true }, { w: el[2], word: true }); continue; }
    out.push({ w: m[0], word: /^\p{L}/u.test(m[0]) });
  }
  return out;
}
// what the dictionary knows of a token: the entries it is a form of (the word itself first, then its forms) -- none: the
// known words it is derived from (engine/derive.js: roughly -> rough + -ly), each hit with its `derived` reading
function know(w) {
  const k = fold(w.replace(/’/g, "'")), hits = dict.index.get(k) ?? dict.index.get(k.replace(/'$/, "")) ?? [];
  if (!hits.length) return dict.derive(w, dict).slice(0, 2).map((x) => ({ e: x.e, cell: "", ipa: "", derived: x }));
  const exact = hits.filter((h) => fold(h.e.word) === k), rest = hits.filter((h) => fold(h.e.word) !== k);
  return [...exact, ...rest].sort((a, b) => a.e.freq - b.e.freq || a.e.rank - b.e.rank).slice(0, 5);
}
// how a token sounds: the entry's IPA for the word itself, else the form by the letter rules, else nothing
const soundOf = (w, hit) => (hit && fold(hit.e.word) === fold(w) ? hit.e.ipa : hit?.ipa || dict.ipaOf(w) || hit?.e.ipa || "");

// ---- the page --------------------------------------------------------------------------------------------------------------
let tip = null, tipFor = null;
function showTip(span, hits) {
  hideTip();
  tip = el("div", "tip");
  const asChar = hits.length ? [] : dict.charMeanings?.get(span.textContent) ?? [];   // (zh/chars.txt: 们 [men] = ...)
  for (const r of asChar) tip.append(el("div", "tip-word", span.textContent, el("span", "tip-pos", ` ${r.pinyin}`)), el("div", "", r.meanings.join(", ")));
  if (!hits.length && !asChar.length) tip.append(el("div", "tip-word mute", "?"));
  for (const h of hits.slice(0, 4)) {
    if (h.derived) tip.append(el("div", "tip-derived", `${span.textContent} = ${derivationText(h.derived)}`));
    const e = h.e, head = el("div", "tip-word", shown(e), el("span", "tip-pos", ` ${e.pos}`));
    const a = el("a", "tip-open", "📖"); a.href = `dictionary.html#${lang}/${encodeURIComponent(e.id)}`; a.title = t("dictionary"); head.append(" ", a);
    tip.append(head);
    tip.append(el("div", "tip-ipa", (e.pinyin ? e.pinyin + " · " : "") + (e.ipa ? `[${e.ipa}]` : "")));
    tip.append(el("div", "tip-sk", e.sk.slice(0, 3).join(", ") + (h.cell && h.cell !== "form" ? ` · ${h.cell.replace(/^[A-Z]+\./, "")}` : "")));
  }
  document.body.append(tip);
  const r = span.getBoundingClientRect(), tw = tip.offsetWidth;
  tip.style.left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + window.scrollX)) + "px";
  tip.style.top = (r.bottom + window.scrollY + 6) + "px";
  tipFor = span;
}
function hideTip() { tip?.remove(); tip = null; tipFor = null; }

function renderText(text) {
  const out = $("text"); out.replaceChildren();
  for (const para of text.split(/\n\s*\n|\n/)) {
    if (!para.trim()) continue;
    const toks = tokenize(para), p = el("p", "para"), sayAll = el("button", "say-para", "🔊");
    sayAll.title = t("say-again");
    sayAll.onclick = () => { const words = toks.filter((x) => x.word).map((x) => { const h = know(x.w)[0]; return { w: x.w, ipa: soundOf(x.w, h) }; }); voice.say(phrase(words, voice.prosody)); document.body.dataset.said = "para"; };
    p.append(sayAll);
    for (const tk of toks) {
      if (!tk.word) { p.append(tk.w); continue; }
      const hits = know(tk.w), span = el("span", "w" + (!hits.length ? " unknown" : hits[0].derived ? " derived" : ""), tk.w);
      span.onmouseenter = () => showTip(span, hits);
      span.onmouseleave = () => { if (tipFor === span) hideTip(); };
      span.onclick = () => { const ipa = soundOf(tk.w, hits[0]); if (ipa) { voice.say(ipa); document.body.dataset.said = ipa; } showTip(span, hits); };
      p.append(span);
    }
    out.append(p);
  }
  $("text").hidden = false;
}

async function useLang(l) {
  lang = l; keepLearn(l); Object.assign($("title"), { textContent: LANGS[l].flag, title: LANGS[l].name });   // (the title: the language's flag -- chosen in the settings)
  $("status").textContent = t("making");
  dict = await loadLang(l);
  voice.prosody = await loadProsody(LANGS[l].speech);
  $("status").textContent = "";
}
export async function start() {
  const pair = keptPair();
  await loadText(LANGS[pair.other]?.ui ?? "sk/ui.txt", "en/ui.txt");
  applyText(); mountHeader("reading");
  const kept = JSON.parse(localStorage.getItem("trainer:reading") ?? "null");
  await useLang(pair.learn);   // (the one language chosen across the pages, not the text's: a kept text of another language is just shown)
  if (kept?.text) { $("input").value = kept.text; renderText(kept.text); }
  // the text is shown as soon as it is pasted, or when typing pauses (no button)
  const show = () => { const text = $("input").value; try { localStorage.setItem("trainer:reading", JSON.stringify({ lang, text })); } catch { /* (storage blocked) */ } if (text.trim()) renderText(text); else { $("text").hidden = true; $("text").replaceChildren(); } };
  let timer = null;
  $("input").oninput = () => { clearTimeout(timer); timer = setTimeout(show, 700); };
  $("input").onpaste = () => { clearTimeout(timer); timer = setTimeout(show, 50); };
  $("input").onkeydown = (ev) => { if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { clearTimeout(timer); show(); } };
  $("title").onclick = () => (location.href = "trainer.html");
  document.addEventListener("click", (ev) => { if (!ev.target.closest(".w, .tip")) hideTip(); });
}
