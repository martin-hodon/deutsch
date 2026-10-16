# Deutsch — a German–Slovak word database

German words with their Slovak translation, pronunciation, part of speech, the word's parts, grammar (a noun's
article and plural, a verb's forms and auxiliary, a preposition's case), the typical combinations it takes and how
common it is (1 / 2 / 3) — the words derived from a root listed under it. Plain text, one word per line, written to be
read by people AND by a program without guessing: a language-learning app (word repetition, article and plural
drills, verb forms) is meant to run on it.

It is built on `../lang/` (the multilingual concept dictionary): the same TAXONOMY (folders → files → `# sections`),
the same written forms, the same PARTS notation (`{Ge|fühl}`, `../lang/SEGMENTATION-GUIDE.md`) and the same IPA
(`../lang/IPA-GUIDE.md`, German). `tools/check.py` verifies every rule below.

    # feelings
    1 N das Gefühl {Ge|fühl} [ɡəˈfyːl], Gefühle (für A) = cit, pocit
    - 1 V fühlen {fühlen} [ˈfyːlən], hat (sich A) = cítiť
    - 3 AN gefühllos {gefühl|los} [ɡəˈfyːlloːs] = bezcitný

    1 V sprechen {sprechen} [ˈʃpʁɛçən], spricht/sprach/gesprochen, hat (mit D, über A) = hovoriť, rozprávať
    - 1 N die Sprache {Sprache} [ˈʃpʁaːxə], Sprachen = jazyk, reč
    - 1 V versprechen {ver|sprechen} [fɛɐˈʃpʁɛçən], verspricht/versprach/versprochen, hat (D) = sľúbiť
    - 2 V aussprechen {aus·sprechen} [ˈaʊsʃpʁɛçən], spricht aus/sprach aus/ausgesprochen, hat = vysloviť

    2 AN stolz {stolz} [ʃtɔlts] (auf A) = hrdý
    1 PRE mit {mit} [mɪt], D = s, so

## Files

    deutsch/<folder>/<file>.txt     the topics of ../lang/ (abstract/time.txt, life/animals.txt, ...)
    deutsch/grammar/<file>.txt      the closed classes ../lang/ keeps elsewhere: articles, pronouns, prepositions,
                                    conjunctions, particles, the modal verbs
    deutsch/humans/countries.txt    countries and continents, with their adjectives and inhabitants (not in ../lang)
    deutsch/tools/                  check.py (this format), hints.py (what the entries were started from),
                                    dedupe.py, merge.py (adding words from outside ../lang), compile.py, order.py
    deutsch/sentences/              the sentence generator's data: categories, meanings, grammar, morphology
                                    (sentences/README.md)
    deutsch/deutsch.tsv             every entry in one machine file (made by compile.py)
    deutsch/meaning.tsv             the meanings in one machine file (made by compile.py)
    deutsch/order.tsv               the words by how common they are, commonest first (made by order.py)

UTF-8. Inside a file: a `# section-name` line starts a section; blank lines are ignored; every other line is an ENTRY.
A word appears in ONE place in the whole database, with one sense — the same spelling twice is two senses, told apart
by their translations (`Bank` the seat, `Bank` the bank).

## A line

    [- ]FREQ POS GERMAN = SLOVAK

- `- ` — a DERIVED word: it belongs to the last line without one (its root word), until the next such line or
  section. A family is one level deep: all derived words are listed under the root.
- `FREQ` — `1`, `2` or `3` (below).
- `POS` — the part of speech, one code (below).
- `GERMAN` — the word, laid out as its part of speech needs (below), ending in its COMBINATIONS in parentheses if it
  has any.
- ` = ` — space, equals, space: the only one on the line.
- `SLOVAK` — the translations, the usual one first, separated by `, `.

## The German side, by part of speech

Every word is written `word {parts} [ipa]`: the written form; the same in braces with its parts marked — `|` at a
compound's joint, a living prefix, a consonant-initial suffix (`../lang/SEGMENTATION-GUIDE.md`), `·` where a verb's
prefix SEPARATES (`auf·stehen`: *ich stehe auf*) — removing every `|` and `·` gives the word back exactly; its
pronunciation in square brackets, with the stress mark. Then, by part of speech:

| POS | | laid out | example |
|---|---|---|---|
| `N` | noun | `ARTICLE Word {…} […], PLURAL` — the article `der`, `die`, `das` (`der/das` when both are used; `der/die` for a noun declined like an adjective; `(das)` for a name that is neuter but used without one: *(das) Deutschland*, *in Deutschland* — while *die Schweiz*, *die USA* keep theirs); the plural written out — the same word when it does not change (*das Zimmer …, Zimmer*), two accepted ones as `Wörter/Worte` — `-` only when it has NONE (*der Frieden …, -*), `PL` when the word itself is a plural (*die Leute …, PL*) | `N der Zufall {Zu|fall} [ˈtsuːfal], Zufälle` |
| `V` | verb | `infinitive {…} […], FORMS, AUX` — FORMS only for an IRREGULAR verb (strong, mixed, *haben*, *sein*, the modals): `3rd person present/simple past/past participle`, a separable one with its prefix where it stands (`steht auf/stand auf/aufgestanden`); AUX the perfect's auxiliary `hat`, `ist` or `hat/ist`; a reflexive verb with its `sich` (`sich freuen`) | `V fahren {fahren} [ˈfaːʁən], fährt/fuhr/gefahren, ist` · `V machen {machen} [ˈmaxən], hat` |
| `AN` | adjective | `word {…} […]`, then `, COMPARATIVE/SUPERLATIVE` when irregular or umlauting | `AN gut {gut} [ɡuːt], besser/am besten` |
| `PRE` | preposition | `word {…} […], CASE` — `A`, `D`, `G` or `A/D` (two-way) | `PRE wegen {wegen} [ˈveːɡən], G` |
| `AV` | adverb | `word {…} […]` | `AV gestern {gestern} [ˈɡɛstɐn]` |
| `P` | pronoun | `word {…} […]` | `P jemand {jemand} [ˈjeːmant]` |
| `CON` | conjunction | `word {…} […]` | `CON obwohl {ob|wohl} [ɔpˈvoːl]` |
| `ART` `NUM` `PAR` `INT` | article, numeral, particle, interjection | `word {…} […]` | `NUM zwanzig {zwanzig} [ˈtsvantsɪç]` |
| `PHR` | fixed phrase (several words, one meaning) | `words {…} […]` | `PHR zu Hause {zu Hause} [tsuː ˈhaʊzə]` |

**COMBINATIONS** — `(…)` at the end of the German side: what the word typically goes with, each item a German piece
with its CASE in capitals — `N` nominative, `A` accusative, `D` dative, `G` genitive — items separated by `, `:
- a preposition and its case: `(auf A)` *stolz auf A*, *warten auf A*; `(mit D, über A)`;
- the bare case of an object: `(D)` *helfen D*; `(D A)` *geben D A* — someone something; `(G)`;
- a fixed word with it: `(sich A)`, `(sich D)` *sich D vorstellen*; `(haben)` *Angst haben*; `(machen)`.

## FREQ

- `1` — the core: the ~1,000 commonest, easy, everyday words;
- `2` — common but less basic, up to ~4,000 words with the first — and every word that is an ALTERNATIVE to a simpler
  common one (*beginnen* when *anfangen* is `1`, *erhalten* beside *bekommen*);
- `3` — the rest: rarer, specialised, literary.

From the frequency of the word's forms in a German news corpus (`tools/hints.py`), set by judgment where news distorts
everyday use: *Apfel* is `1` though the news seldom speak of apples.

## Reading a line (for a program)

1. a `#` line is a section; a blank line is nothing;
2. strip a leading `- ` (derived: its root is the last line without one);
3. the first two tokens are FREQ and POS;
4. split the rest at ` = ` (exactly one): the German side and the Slovak side;
5. the Slovak side: split at `, `;
6. the German side: a final `(…)` is the combinations (split at `, `); a noun begins with its article; then
   `word {parts} [ipa]`; after it, the grammar by POS, separated by `, ` — a verb's FORMS are the item with three
   `/`-separated forms, its AUX the last item (`hat`, `ist`, `hat/ist`).

`python3 tools/check.py` does exactly this, over every file, and reports any line it cannot read.

AN ENTRY'S IDENTITY (for the app's progress records): its word, its POS and its first Slovak translation. The same
spelling with one POS appears twice only for two senses — *die Bank, Bänke = lavica* and *die Bank, Banken = banka*,
*der See = jazero* and *die See = more*, *hängen …, hing … = visieť* and *hängen …, hat = zavesiť* — and with two POS
for two words (*das Gefühl* / *gefühl…*, *sein* the verb and *sein* the possessive).

## Tools

    python3 tools/check.py                 # read every line as the app will; ownership; duplicates
    python3 tools/hints.py OUTDIR          # what the entries were started from (../lang, the corpus, ../../../../languages/deutsch)
    python3 tools/dedupe.py                # a word written twice in one POS: kept once, its translations joined
    python3 tools/merge.py STAGING.txt     # add words: blocks of `@ FILE # SECTION` or `@ FILE < ROOT` + entry lines
    python3 tools/meaning.py               # the sentence generator's meanings: the category graph, every annotation
    python3 tools/compile.py               # all files -> deutsch.tsv (one entry per line, tab-separated, category = folder/file),
                                           # meaning.tsv, offline.json
    CORPUS=.../deu_news_2022_1M-words.txt python3 tools/order.py   # -> order.tsv: rank word pos count, by corpus counts

`trainer.html` drills articles, plurals and vocabulary (DE→SK, SK→DE) from `deutsch.tsv`, three options a question,
with spaced repetition: serve the folder (`python3 -m http.server`, then `localhost:8000/trainer.html`). Its code is in
`trainer/`, one job a file: `data.js` (read the dictionary), `questions.js` (the modes), `plurals.js` (plural rules
for lookalike wrong plurals), `storage.js` (IndexedDB: every answer, the learner's name and settings), `srs.js` (the
schedule, computed from the answers), `stats.js`, `ui.js`, `app.js`, and `speak.js`: the German SPOKEN from each entry's
IPA -- a small formant synthesizer (a few milliseconds a word, no recordings, nothing to download), a man's, a woman's
or a child's voice and four levels (off, quiet, medium, loud) in the toolbar, remembered. Each mode says what it speaks
(`questions.js` `say`): the German question word (DE→SK), the German answer once answered (SK→DE), the word with its
article once its article is answered, the singular asked and the plural answered (its IPA derived from the
singular's: `morph.js` `pluralIPA`). Only German is ever spoken.

`sentences.html` reads and speaks whole sentences made by rule from the dictionary — grammar, morphology and the
words' meanings, each in its own file under `sentences/` (`sentences/README.md`); `trainer/sentences.js` is the library.

## Online, and offline (GitHub Pages)

The trainer is a static site: push this folder to a GitHub repository and turn on Pages (Settings → Pages → Deploy
from a branch → `main`, `/ (root)`); it opens at `https://<user>.github.io/<repo>/` (`index.html` leads to the trainer).
On the first visit `sw.js` (a service worker) keeps every file `offline.json` lists in the browser, and from then on
the trainer opens from that copy -- with no network at all. It does NOT update on its own: the welcome screen shows the
version kept and a **check for update** button; only **update now** fetches the new version, whole, into a new copy and
drops the old one once the new one is complete (a failed download leaves the kept copy as it was). The learner's
answers and settings (IndexedDB) stay through updates.

Before pushing a change: `python3 tools/compile.py` -- it writes `deutsch.tsv` and `offline.json` (the files and their
version, a hash of their contents: tools/offline.py). A new version is what a learner's update then finds.

## What is here (2026-10-07)

8,290 entries in 4,584 families: every German word of ../lang's 37 topic files (4,573 concepts; a word ../lang lists in
several files is in the first), the words derived from their roots, the closed classes (`grammar/`: articles,
pronouns, prepositions, conjunctions, particles and function adverbs), and ~700 lemmas ../lang lacks that are among
the 3,000 commonest word forms of a German news corpus (countries, months, kennen, gelten, Behörde, Regel...; left out:
names, places, clubs, abbreviations, English words and one-off news compounds) — N 4,997, V 1,499, AN 1,171, AV 300,
PHR 88, PRE 70, P 53, NUM 44, CON 40, PAR 12, ART 6, INT 4; FREQ 1: 1,058, 2: 4,185, 3: 3,041. Written by language
models from ../lang, the user's Slovak–German lists and the corpus's frequencies, checked by `tools/check.py` and reviewed by
sample: the Slovak and the rarer plurals deserve a native speaker's look before they are drilled.


2026-10-08: +944 common nouns (everyday A1–B1 vocabulary the database lacked — Tat, Argument, Irrtum, Vortrag,
Hindernis, Umzug, Mühe ... — and the common nouns of the 1M-sentence news corpus no entry covered; feminine forms in
their families) and the verbs anfangen, vorhaben -> 9,236 entries: N 5,942, V 1,506; FREQ 1: 1,066, 2: 4,281,
3: 3,889. A further 442 rarer compounds the same search found wait in `_staging/nouns-rare.txt`, not merged.
2026-10-11: +2,228 verbs and adjectives (`_staging/vocab-0*.txt`): the lemmas of the 1M-sentence news corpus within
its 10,000 commonest word roots that no entry covered (kennenlernen, aufpassen, erwerben, schildern, sich wehren,
brodeln, verstummen, attraktiv, cremig, eiskalt ...; left out: names and the adjectives of places and peoples,
inflected forms, one-off news words) — derived ones in their roots' families, FREQ 2 for the 458 among the 5,000
commonest (order.tsv), else 3 -> 11,470 entries: V 2,611, AN 2,297; FREQ 1: 1,069, 2: 4,784, 3: 5,617.

## Derived adverbs

An adjective concept of the index may declare its adverb (`AN dobrý : adverb dobre`, tools/concepts.py). This language
says the adverb concept by an explicit `AV` line where it has one; where it has none and the language has an adverb
rule (tools/adverbs.py: English -ly, German and Chinese the adjective itself, Spanish and Italian -mente), the
compile derives a line from every adjective word of the parent concept (shown as a derived word of the adjective's
family). `rules/adverbs.txt` silences the rule for an adjective whose derived word is wrong or means something else
(`hard = -`: hardly is not hard's adverb); French, Russian and Polish have no rule, their adverbs are all written.
