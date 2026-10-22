// THE LANGUAGES the trainer drills (DESIGN.md): each one's dictionary -- made by tools/compile.py (de), tools/en.py
// (en, es, fr, it, pl, ru, zh) -- and its words' order (tools/order.py: the commonest first; none yet: the file order). Slovak is the concept
// index: every entry's concept is a Slovak ID, so any two languages meet in it. `speech`: how the language sounds
// (<lang>/rules/speech.txt: its rhythm, lengths, pauses, pitch -- speak.js says its words' IPA with it); `morph` +
// `irregular`: its verbs' forms (the irregular-verb drill); `ui`: the trainer's words in the language (engine/text.js),
// shown when it is the learner's own; `flag`: the language in every page's title.
export const LANGS = {
  de: { name: "Deutsch", flag: "🇩🇪", dict: "de/dict.tsv", order: "de/order.tsv", speech: "de/rules/speech.txt", ui: "de/ui.txt" },
  en: { name: "English", flag: "🇬🇧", dict: "en/dict.tsv", order: "en/order.tsv", speech: "en/rules/speech.txt", ui: "en/ui.txt" },
  es: { name: "Español", flag: "🇪🇸", dict: "es/dict.tsv", order: "es/order.tsv", speech: "es/rules/speech.txt", ui: "es/ui.txt", morph: "es/morph.js", irregular: "es/rules/irregular.txt" },
  fr: { name: "Français", flag: "🇫🇷", dict: "fr/dict.tsv", order: "fr/order.tsv", speech: "fr/rules/speech.txt", ui: "fr/ui.txt", morph: "fr/morph.js", irregular: "fr/rules/irregular.txt" },
  it: { name: "Italiano", flag: "🇮🇹", dict: "it/dict.tsv", order: "it/order.tsv", speech: "it/rules/speech.txt", ui: "it/ui.txt", morph: "it/morph.js", irregular: "it/rules/irregular.txt" },
  pl: { name: "Polski", flag: "🇵🇱", dict: "pl/dict.tsv", order: "pl/order.tsv", speech: "pl/rules/speech.txt", ui: "pl/ui.txt", morph: "pl/morph.js", irregular: "pl/rules/irregular.txt" },
  ru: { name: "Русский", flag: "🇷🇺", dict: "ru/dict.tsv", order: "ru/order.tsv", speech: "ru/rules/speech.txt", ui: "ru/ui.txt", morph: "ru/morph.js", irregular: "ru/rules/irregular.txt" },
  zh: { name: "中文", flag: "🇨🇳", dict: "zh/dict.tsv", order: "zh/order.tsv", speech: "zh/rules/speech.txt", ui: "zh/ui.txt", morph: "zh/morph.js", irregular: "zh/rules/classifiers.txt" },
  sk: { name: "Slovensky", ui: "sk/ui.txt" },
};
