# lang/ — one world, many languages (design)

The trainer, the sentence generator and the story teller talk about ONE WORLD, written once in language-free CONCEPTS;
each language only says it: German, English, Spanish, French, Italian, Polish, Russian, Chinese — any of them learned
through any other, Slovak the index everything is keyed by. (`../deutsch/` is the German-only original, kept as it was.)

## Layers

    lang/
      concepts/          THE INDEX: every concept once, by its Slovak name -- the IDs everything else uses
      world/             language-free: categories (what a thing is), meanings (what a verb asks for), settings,
                         conditions, valence, situations, places, procedures, the cast, the stories' plots and moves,
                         the shared syllabus, the simple-sentence patterns
      engine/            language-free code: the planner, the story teller, the trainer, the dictionary, the reading
                         page, speech, listening, the grammar engine (paradigms, forms index)
      tools/             checks and builds (Python; two ES-module tools run under gjs)
      de/ en/ es/ fr/    one folder per language: its dictionary (topic files, one line a word), its rules
      it/ pl/ ru/ zh/    (rules/neutral.txt the closed words, roles.txt + frames.txt how its verbs mark their roles,
                         prefer.txt its word choices, forms.txt the morphology drills, speech.txt its prosody,
                         sounds.txt its letter rules, adverbs.txt, irregular.txt, tests.txt), its realizer
                         (realize.js) and morphology (morph.js), ui.txt (the interface in that language), dict.tsv
                         (compiled), order.tsv (corpus ranks), listen.json + listen.bin (listening templates)
      *.html             the pages: trainer.html (the Grammar page: words, morphology, syntax, overview), dictionary, reading, sentences/stories, speech benches

What may depend on what: `world/` and `engine/` know no language; a language folder knows the world (its lines end
in concept IDs) and the engine (its realizer implements the engine's interface); nothing in `engine/` imports a
language folder by name except German's morphology where German tables are read (de/morph.js) -- the page says which
languages to load (engine/langs.js).

## Concepts (the index)

A concept is a meaning, named by its Slovak word -- with a short Slovak gloss only where one Slovak word has two
meanings (then every sense is glossed: never `jazyk` beside `jazyk (reč)`). The ID is `POS name`: `N jazyk (orgán)`,
`V položiť`, `AN hrdý`, `CON pretože`.

    concepts/<folder>/<file>.txt        the same topics as the dictionaries (abstract/time.txt, life/animals.txt ...)
    # feelings
    N cit
    V cítiť
    AN dobrý : adverb dobre
    N jazyk (orgán) -- v ústach

`-- note` says what a gloss means when it needs saying. A language word points at ONE concept; a concept may have
several words in a language (synonyms: *anfangen*, *beginnen* -> `V začať`), told apart by their own FREQ, register
and valence. The trainer asks a concept; any of its words in the language is right, the commonest shown. A dictionary
line names the concept first on its Slovak side, further Slovak words after it (accepted answers, not IDs):

    1 N die Zunge {Zunge} [ˈtsʊŋə], Zungen = jazyk (orgán)
    1 N die Sprache {Sprache} [ˈʃpʁaːxə], Sprachen = jazyk (reč), reč

**Derived adverbs.** An adjective declares its adverb (`AN dobrý : adverb dobre`); `concepts.read()` lists `AV dobre`
as a concept of its own, linked to the adjective (`of`). A language says it by an explicit `AV` line (well, fast, hard,
vite, bien) or, where it has none and the language has an adverb RULE (tools/adverbs.py: English -ly with its
spellings, German and Chinese the adjective itself, Spanish and Italian -mente on the feminine), the compile derives a
row after each adjective word of the parent (derived = 1, root = the adjective: the dictionary's family shows happy ->
happily). `<lang>/rules/adverbs.txt` silences the rule for an adjective whose derived word is wrong or means something
else (`hard = -`, `long = -`: hardly, longly). French, Russian and Polish have no rule; their adverbs are all written.

**Language-specific closed words** (的, 了, doch, dont, же, by ...) have no Slovak word: their concept is a short Slovak
description of the function, in the `# language-specific closed words` block at the end of the grammar files, one per
function shared by every language that has such a word (`PAR opytovacia častica` for ли and 吗, `PAR hľa` for ecco and
вот, `P oni`, `P ich`, `PAR by`, `PHR treba`, `PAR častica prívlastku (的)`, `PAR počítacie slovo (个)` -- one per
measure word). Content concepts a single language's word lists needed (angličtina, zelený čaj, letenka ...) are in
`concepts/abstract/added.txt`.

Coverage is not 100 % by design: a language without a usual word for a sense says nothing (an adverb no one uses, a
closed word of another language). `python3 tools/words.py LANG` reports what a language leaves unsaid.

**Opposites.** `concepts/opposites.txt` pairs concepts that are opposites, one unordered pair per line, as a rule both of
one part of speech: `AN chudobný <> bohatý`, `V kupovať <> predávať`, `N deň <> noc`, `PRE pred <> za` (the second side
names its POS only when it differs: `PAR áno <> AV nie`). A concept may have several
(`AN studený <> horúci`, `AN studený <> teplý`); the adjectives' pairs carry over to their declared adverbs (dobre <> zle).
`concepts.opposites()` reads and checks the file (both IDs concepts, no pair twice); the compile writes each row's
`opposite` column (the opposite concepts as `POS id`, ` | `-joined), and the dictionary page lists their words in the language
under "opposites" among the related words. The relation is between concepts, so it is declared once for all languages.

**A generic concept in a context.** A concept may be declared the same thing as a more general concept, said in a
context: `N odlet : of odjazd @ lietanie`, `V žrať : of jesť @ zvieratá` (the generic's POS only when it differs;
several grammar items `; `-separated: `: adverb rýchlo; of ...`). `concepts.generics()` reads them; the compile writes
each row's `generic` column (`POS id @ context`); the dictionary page shows the generic's words under "in general ·
context" and, on the generic word, the words of its contexts under "in a context" (Abfahrt: Abflug · lietanie). The
relation is between concepts, declared once for all languages.

**The category tree on the dictionary page.** A noun's concept has its categories (`world/categories.txt`,
engine/meaning.js); the page shows each one with its parents up to the root (Affe: mammal ‹ beast ‹ animal ‹ living ‹
concrete ‹ entity), the affordances apart ("one can": openable, washable -- the `AFFORDANCE` directive). A category may be
NAMED by a concept (`mammal : beast = cicavec`, `openable : concrete = V otvoriť`): the page then shows the language's word
for it (Säugetier) instead of the code, and that word's own entry lists the category's subcategories and its direct
members (the nouns in `mammal` itself, not under it: the lists stay short). A category opens a category view
(`#de/cat/mammal`: its way up, its subcategories with their size, its direct members).

**Two more views of the dictionary's list.** "By frequency" lists the language's words in the order of its
`order.tsv` (the commonest first, a hundred at a time, the next hundred loading as the list is scrolled to its end, the search narrowing them). "My list" is the learner's own:
the ★ on a word's card puts the word aside (localStorage `dictionary:list`, `lang|id` entries, kept across languages),
the list shows them with a ✕ each -- what was hard, to come back to.

## The world, in concepts

Every world file names concepts, never a language's words: categories (`N banán : fruit`), verb frames, settings,
conditions, valence, situations (`trouble hriankovač pokazený : opraviť`), places, procedures, the cast, stories.
Lists about MEANING (everyday verbs, what one does gladly, states, owners ...) are in `world/lists.txt`; lists about a
language's GRAMMAR (its conjunction words, particles, degree words) stay with the language.

**Frames.** A verb concept's frame names its subject's category and its slots by SEMANTIC ROLES (`world/roles.txt`:
patient, recipient, theme, topic, cause, companion, instrument, goal, location, source ...; clauses `that`,
`whether`, `inf`; `adj`, `pred`):

    V čakať : person > theme event           de: warten (auf A)      en: wait (for)      es: esperar (a)     fr: attendre (A)
    V pomôcť : person > recipient person     de: helfen (D)          en: help (A)        es: ayudar (a)      fr: aider (A)
    V položiť : person > patient thing, goal place

Each language marks a role by default (`<lang>/rules/roles.txt`: patient -> A, recipient -> D) and says, per word, the
marking that differs (`<lang>/rules/frames.txt`: `warten > theme = auf A`); reflexive verbs are the language's own
business. Where-roles (location, goal, source, path) carry no preposition: the language chooses it by the noun's kind
of place (`world/meaning` flags).

**Relations** (free phrases of place, time, manner) are named the same way -- `world/relations.txt`: in, into, on,
onto, at, to, from, under, with, by, for, about, at-hour, on-day, since, ago, because-of ...; each language maps them to
its prepositions (`<lang>/rules/neutral.txt`).

## Sentences: plan once, say in each language

1. **The planner** (`engine/sentences.js` + `world/shapes.txt`, language-free): a sentence PLAN -- clauses with their
   LINKS (because, although, if-unreal, before, after, purpose, relative, that, whether, reported ...), each clause's
   verb concept and frame, its subject and objects (noun concept, number, determiner kind, adjective, degree, owner,
   relative clause), tense, mood, voice, modal, negation, adverbs. Every check that keeps sentences sensible
   (categories, scenes, conditions, valence, the critic rounds' rules) lives here, once, for all languages. The
   planner takes the LEVEL'S WORDS FIRST (`levelFirst`): a verb, noun or adverb above the level is drawn only when no
   word of the level fits the slot.
2. **The realizer** (`<lang>/realize.js` + its rules + `morph.js`): the plan in its language -- word order, agreement,
   articles, cases, the verb cluster, its conjunction for each link (because -> weil | da | denn), its idioms (`hladný`
   -> *Hunger haben*, *be hungry*, *tener hambre*, *avoir faim*, *avere fame*, *być głodnym*).

One plan, several realizers: the same sentence or story in every language side by side. The text form of a plan is the
clause format of `rules/tests.txt` and the stories' moves, language-free (concept IDs, slot names, link concepts, no
word order; inversion is German's business):

    1 MAIN verb=položiť subj=$p1 patient=$wantobj pp=onto:def:stôl tense=past

**The syllabus** is ONE, shared (`world/syllabus.txt`): features named after the plans' constructions (recipient,
direction, no-det, particle-verbs, that-because-if, owner, idioms, relative, passive ...), in German's order of
teaching. A target language's own GATES decide which of its words a feature unlocks (German: separable and reflexive
verbs; English: phrasal verbs need particle-verbs; Romance: a reflexive verb needs reflexive), and its words' FREQ the
level (`loadSentences({ lang })`). `engine/structures.js` reads a plan's structures (the features it shows).

What the planner decides in neutral terms: a verb's frame by ROLES (`world/meaning`: `fixed {concepts}` for a word the
phrase carries), a role's relation by the noun's kind, the links and coordinators as codes, the degree adverbs, pairs,
names, fixed places, correlates as concepts (`world/lists.txt`). Each realizer picks its words (`rules/prefer.txt`;
German weil | da 3:1, its own sich where its frame has one).

Still German inside `engine/sentences.js` (the legacy German path beside planOf): the German token building and its
morphology calls, the particles, the negation token lists, the passive check.

**Tests.** `<lang>/rules/tests.txt`: 136 plans with the sentence each language must say; `sentences.html?test=de/rules/tests.txt`
runs German's, the other languages' run through the realizer alone. Passing: de 136, en 134, es 131, fr 132, it 84,
pl 77, ru 88, zh 70 of 136. The rest are word choices between synonyms, the-more and as-if constructions, idioms, the
Italian passato prossimo against the imperfetto, Polish adverb placement, Chinese 了 placement and pair constructions.

## The languages

The line formats are in each `<lang>/README.md`; the shared parser is `tools/words.py` (German: `tools/check.py`).

- **German** (`de/`): the original dictionary with articles, plurals, the three verb forms and their IPA, cases of
  prepositions, combinations; `de/rules/morphology.txt` the full tables (articles, der- and ein-words, pronouns,
  contractions, endings, umlaut, irregular verbs); the planner's own realizer path. Morphology drills: cases, verb
  forms, adjective endings, the plural; der · die · das.
- **English** (`en/`): forms `past/participle` for irregular verbs, `comparative/superlative`; letter rules for -s -ed
  -ing and `word` lines for the forms no rule makes (be / have / do, the pronouns, irregular plurals).
- **Spanish, French, Italian** (`es/ fr/ it/`): a noun with its article and plural, a verb with its model (`e>ie`,
  `irr`, `isc`), its irregular participle and auxiliary (`être`, `essere`), an adjective with its feminine (and the
  Italian irregular plural pair). Italian's realizer: passato prossimo with avere or essere and participle agreement,
  the imperfetto for states and habits, the congiuntivo, the clitics (glielo, c'è, se n'è andato), the articles by the
  next word's sound and their contractions, di + infinitive for the same subject. The trainer drills the Italian
  articles (il · lo · la · l').
- **Russian, Polish** (`ru/ pl/`): a noun with its gender and plural (`нескл` / `ndm` indeclinable), a verb as the
  imperfective with its perfective partner (`св` / `dk` perfective only), an adjective's irregular comparative; IPA
  with reduction and soft consonants (Russian), `ɛ ɔ` only and penultimate stress (Polish). `morph.js` declines the
  six cases in both numbers by stem class with the consonant alternations and vowel changes, conjugates (Russian two
  conjugations with the 1sg mutations; Polish -am -em -uję -nę -mę and the -ę -isz class), the past by gender (Polish
  by gender × person), the conditional, imperative, participles; `rules/irregular.txt` holds what the rules get wrong.
  The realizers: cases by role marking, the negated object in the genitive, the subject pronoun dropped (Polish),
  się / бы placement, the predicate instrumental, у меня есть / nie ma + genitive, zostać for the passive event, czy
  only with Pan, the perception clause. The trainer drills the gender of nouns whose ending hides it and the aspect
  pairs (one implementation, parametrised by language).
- **Chinese** (`zh/`): the PINYIN in the brackets (compiled to IPA with tone digits by `tools/pinyin.py`: medials as
  glides, ai ei ao ou as diphthongs, r as ɻ), a noun's MEASURE WORD after it, `|` in the braces of a separable
  verb-object compound ({睡|觉}: 了 goes between); measure words are entries too (POS PAR). No morphology beyond the
  measure words and the aspect particles. The realizer is ORDER and PARTICLES: the subject, the time words, the coverb
  phrases before the verb (`frames.txt` with `pre` / `post` and `…` where the noun goes), 了 after the verb for a
  completed event, 把 when an object is placed or given, 吗 or the question word in place, 因为……所以 / 虽然……但是 /
  如果……就, ……的时候 at the end of its clause, the relative clause before its noun, 很 before a predicate adjective,
  比 for comparison, 是……的 for a past passive with an agent, 着 for a state, the measure word with 这 / 一 / a number,
  们 for persons. The adverb of a bare adjective holds only before a verb (快走, 认真学习); else 慢慢, 好好, 高兴地.

Sizes: dict.tsv rows de 12,705, en 13,016, es 13,972, fr 13,744, it 15,462, pl 14,356, ru 13,960, zh 18,376; the index
11,832 concepts (N 5,913, V 2,387, AN 2,004, AV 1,076 of which 839 derived, PHR 132, PAR 101, P 57, PRE 62, NUM 47,
CON 39, INT 8, ART 6). Chinese covers HSK 1-6 except names, erhua variants and bound phrases (24 / 18 / 44 / 45 / 63 /
104 of the six levels unsaid).

## The grammar page (trainer.html, engine/app.js; the tab is called Grammar)

The page speaks THE LEARNER'S OWN LANGUAGE (engine/text.js: `<lang>/ui.txt`, `sk/ui.txt` -- Slovak by default, English
the fallback for a missing key; chosen in the settings, "my language", with the vocabulary asked through it); the
language LEARNED is chosen on one line with the EXERCISE -- **Words**, **Morphology**, **Syntax**, **Overview** -- and that exercise's
filters (the level, the word category's first level, the structure, the rule set, the verbs); the word modes (the
vocabulary both ways, der/die/das, the plural, gender, aspect, measure word, articles) are tabs under it. Every choice
is kept across visits (engine/storage.js: the name and the settings `view`, `pair` = { learn, other: my language },
`speech` in localStorage and in the IndexedDB profile, stamped { t, v }, the newer wins; the answer log in IndexedDB),
and a language change keeps the kind of exercise (morphology in German -> morphology in Spanish). The welcome screen
shows once a browsing session; `trainer.html#panel-settings|stats|data` opens the trainer on that panel at once.

- **Words** (spaced repetition, srs.js): the level is one FREQ (1, 2 or 3), not "up to". The word asked or answered
  is SPOKEN (engine/speak.js). The category filter and the statistics use the categories' first level only. The
  vocabulary exercises show up to three example sentences of the word WITH THE QUESTION (the word marked, or a blank
  till answered; a sentence clicked is spoken): SIMPLE SENTENCES (engine/simple.js, patterns in world/simple.txt) --
  a pattern in the clause format with holes (`$FRAME` a verb's frame filled with the commonest nouns that fit, `$N`
  `$AN` `$AV` the word, `$NOUN`, `$ADJ`, `$AVKEY`), said by the language's realizer with the word asked (`say.use`).
- **Grammar** (engine/practice.js over the planner; the level is the FREQ of what is practised, the planner steered to
  a word of that FREQ; a form or structure the sentences say only with commoner words is marked "none at FREQ n"). A
  grammar sentence is NOT read aloud. **Syntax** -- a sentence with the grammar structure chosen to build again from its
  words: the words AS WRITTEN, the punctuation FIXED in its slot; a click on a word below fills the next slot, a click
  on a word in the sentence takes it back. The chosen structure stays IN FOCUS: beside it a sentence may only show the
  base morphology (present, objects, predicates, object pronouns) and time / place / manner words (ADJUNCT_RULES), a
  second clause only when the structure itself links clauses (CLAUSE_RULES: coord, that-because-if, relative,
  temporal, purpose, conditional ...; the given clause shows as dotted tiles), and never more than nine words to place
  (WORDS.max); "all structures" allows up to three structures and two clauses. Every order the language says the plan
  in with these very words is right. **Morphology** -- a sentence with one word left out, its right form among two
  wrong ones of the same word that other rules make: each language's rule sets in `<lang>/rules/forms.txt`, the forms
  from engine/paradigm.js (each language's own morph.js); the verbs switch (all / irregular) narrows it to forms the
  regular rule alone would make differently.
- **The structures a language has, and a sentence for each** (`world/structures.txt`, engine/structures.js
  `loadStructures`): one or two SIMPLE language-free example plans per structure of the syllabus, which every language's
  realizer says; `-ru -zh` after a structure's name marks a plan a realizer cannot say (no such construction, or said
  wrong). The Syntax exercise offers a language only the structures with a plan it says; it draws the planner's
  sentences first -- a word of the level, then any level (`PHASES`: the words need not be of the level where the
  structure is rare), then longer sentences -- and when none shows the structure, says a declared plan: a structure
  always has a sentence (at German FREQ 1 the planner alone found one for 16 of 66). A structure's IMPLIED ones (a
  polite request is a modal in the Konjunktiv II, a question; an indirect yes/no question a whether-clause) do not
  count against it in focus.
- **Overview** (engine/practice.js `overview`, ui.showOverview): in the card's place, the language's structures by
  stage, each with its declared example sentence, every word in the colour of its part of speech (the word looked up in
  the language's forms index, engine/wordforms.js -- the plan's own concepts first), then the rule sets of forms, each
  with one of those sentences where a form it asks stands (the form marked, by engine/forms.js formsQuestion). A row
  clicked opens that exercise on the structure or rule set.
- **Recorded data** (⋯): every answer kept in the browser, newest first, by exercise, and the whole log as JSON.

## The header (engine/header.js)

One header for the three pages, built at start: the title left (a click switches trainer <-> dictionary); in the upper
right corner the page tabs Grammar | 📖 Dictionary | 📄 Reading and, under them, the learner's name and the ⋯ menu
(icon only): settings, statistics, recorded data -- the trainer's panels, from another page links into the trainer --
and the sentence generator. ONE LANGUAGE across the pages: the pair setting is the only record of the language chosen;
the dictionary and the reading page read it on start and write `learn` back when their select changes (storage.js
`keptPair` / `keepLearn`).

## The dictionary (dictionary.html, engine/dictionary.js)

A language chosen, a word typed is looked up as one types: the word itself first, then a word the typed FORM belongs
to (dem -> der · dat.m, sind -> sein · present.1pl, them -> they · pron.3pl, della -> di), then the Slovak meanings
(and Chinese pinyin, with or without tone digits) -- a PATTERN: letters from the word's start, `*` anything, the end
open unless a final `.` closes it (haus: Haus, Haushalt ...; haus.: Haus; *ung.: the -ung words; *lauf*: lauf inside).
An entry shows everything the data holds: the word with its article, IPA (pinyin for Chinese) and a 🔊, part of speech,
FREQ, category and parts, the Slovak meanings, the grammar details (gender, plural, aspect partner, participle,
comparison, auxiliary, model, measure word, combinations), "the same word" as other parts of speech (work N · práca /
V · fungovať), its MORPHOLOGY TABLE from engine/paradigm.js's cells laid out per language and part of speech
(`LAYOUTS`, rows and columns in the language's own grammar words), RELATED WORDS as links: the concept's other words,
its OPPOSITES (the `opposite` concepts' words: arm <> reich), the word family (`root`, derived adverbs included), the
words sharing a component of its `parts` or its stem (laufen <> aus·laufen, Haus <> Haus|tür -- a component counts only
when it is a word of the dictionary), the translations in the other seven languages (loaded when asked), three example
sentences (spoken on click), and a 🎤 that recognises a word said (Listening). The address hash holds language and
entry. German has a der · die · das mode (the toggle beside the search): the pattern's nouns counted and shared by
article, then listed by article (*ung. -> die 99 %).

**Chinese characters (engine/hanzi.js, zh/composition.txt).** The composition file gives each character its components
in the order they are written (`的:白|勺`; `|` left to right, `/` top to bottom, `+` one over or inside the other), down
to radical forms (扌 氵 亻) and strokes (the CJK stroke characters ㇐ ㇑ ㇒, or a stroke count for a part not broken up:
`豕:7`, `⺀:2`). From it: a character's components and STROKE COUNT (the sum over the sequence as written -- 心 has ㇔
three times) and, the other way, every character a component is written in, directly or inside one of its components
(木 in 相, so in 想). A Chinese entry lists its CHARACTERS: each with its layout (every component a link), its stroke
count and "in N characters · in N words". A component opens the COMPONENT VIEW (`#zh/comp/木`): its dictionary entries
if it is a word, its composition one level down, the characters it is in (direct ones first and bold, those through a
component lighter; glossed with pinyin and meaning when they are words), and the dictionary words containing it. A
character or component typed in the search gets a "component" row above the words. The 部件 toggle beside the search
(`#zh/comp/`) is the INDEX OF COMPONENTS by stroke count, the most used first (with how many characters have each) -- the
way in for a learner who sees a character and knows only its parts. Composition covers ~2,350 characters (the commonest
first); a character without a line has no characters section.

## Reading (reading.html, engine/reading.js)

A text pasted in a language is shown word by word as soon as it is pasted or when typing pauses. A word under the mouse
shows the dictionary words it is a form of (läuft -> laufen present.3sg, ogrodzie -> ogród loc.sg), their meanings and
IPA, with a 📖 into the dictionary; a click says it -- the form's own sound where it is known, else the base word's;
each paragraph has a 🔊 that reads it whole. French and Italian tokens are cut at an elision apostrophe (d'un -> d' + un);
Chinese text is cut into dictionary words by the longest match. A word the dictionary does not know is grey. The text
is kept in localStorage.

**The forms index** (engine/wordforms.js, shared by the dictionary and the reading page), built once per language:
every entry's word, plural, given forms and paradigm forms (engine/paradigm.js; a separable verb's finite part alone is
left out); the German article, der-word and ein-word tables and contractions (de/morph.js); the Italian articulated
prepositions (it/morph.js contract), au/aux/du/des, del/al and the elided forms (d', l', qu', dell' ...); pronouns and
determiners declined as adjectives (Slavic P entries through the AN paradigm, Romance -o pronouns through adjForm);
and the realizers' own closed-word data (`pron`, `det`, `wh` lines of `<lang>/rules/neutral.txt`: I/me/my,
mon,ma,mes, este/esta/estos). Not made yet: German ordinals' forms, Polish and Russian possessives where the base
pronoun is missing, English contractions (don't, it's).

## Listening (engine/listen.js, `<lang>/listen.json` + `listen.bin`)

A spoken word recognised among a language's dictionary words with no downloaded model: the synthesizer says every word
once, offline (`gjs -m tools/listen_templates.js LANG`, about three minutes a language), and what it said is kept as
FEATURES: 12 mel-cepstral coefficients a 10 ms frame (16 kHz, 25 ms Hamming frames, 512-point spectrum, 26 mel bands
100-7000 Hz, DCT, c0 dropped), the word's frames only (trimmed 30 dB under the peak), each coefficient normalised over
the word and quantised to a byte -- words with the same IPA share a template; 8-12 MB a language, not in the offline
list (fetched when the 🎤 is first used). The microphone (push to talk, stopped by silence or after 3 s) gives the same
features; the match: the templates within half to double the length, the 400 nearest by an 8-slice sketch, then dynamic
time warping in a 30 % band, over seven vocal-tract warps of the mel bank; the nearest words are listed with a score,
the best first. `tools/listen_eval.js` measures top-1 / top-5 hits of words said by the woman's or the child's voice
against the man's templates (a stand-in for a human voice): German woman 92 / 98 %, child 85 / 93 %, man 100 %; Polish
93 / 97 %; Chinese 60 / 85 % -- the tones are not in the features (a pitch contour would be the next feature).

## Speech (engine/speak.js, `<lang>/rules/speech.txt`)

One formant synthesizer says every language: the SOUNDS are shared, the IPA comes from the dictionaries (a noun's
article from the dictionary's own ART entry). What differs between languages is DATA, the PROSODY in
`<lang>/rules/speech.txt`: the rhythm -- `stress` (German, English, Russian: the stressed syllables keep the beat, the
unstressed ones squeezed toward feet of one length) or `syllable` (Spanish, French, Italian, Polish, Chinese: every
syllable pulled toward one length) with `even` saying how far --, `long`, `stress` and `unstressed` (a vowel's length
by stress), `final`, `pause` (ms between words), `accent` and `range` (the pitch on a stressed vowel, its fall over a
statement; a question rises), `aspiration`, `say X = Y` (a symbol's sound), `tune KEY = value` (a language's finish:
Chinese eases its tones over 50 ms), `weak = ...` (the words that carry no stress in a phrase).

A word's IPA is the dictionary's; a form the dictionary has not is read by the language's LETTER RULES
(`<lang>/rules/sounds.txt`, engine/sounds.js: `suffix` rules for regular endings, `letters` rules reading the spelling,
`stem ENDING = ...` rules carrying a dictionary word's stress, `stress = penult`, `word X = IPA` for forms no rule
makes). In a sentence (speak.js `phrase`) the weak words carry no stress, a content word without a mark gets one, a
stretch of more than `run` syllables without a beat gets a half stress; the evening-out of the rhythm is bounded (a
vowel .8 to 1.25 of its length). The listener's TEMPO scales every sound and pause on top of the language's `slow`.
Voiced friction is pulsed by the glottal cycle; the glottal source is scaled by 275/f0 so a man's voice stands as
strong against breath and friction as a child's. `ʲ` is a palatalised consonant (place toward the palate, a short j
into the vowel); `ʰ` an aspirated stop; a TONE DIGIT 1-5 after a Mandarin syllable gives its rime a pitch contour (two
third tones in a row said as 2 + 3; a toned rime lasts at least 130 ms). The voice's FINISH is one table, `TUNE`
(raised-cosine glottal closure, filters retuned every 1 ms, longer formant glides, slight jitter; `speak_ab.html` the
A/B bench). Nasal vowels (French ɑ̃ ɔ̃ ɛ̃ œ̃) by a Klatt pole-zero pair (a nasal pole at 270 Hz, the zero moved to `nz`).
Clarity is measured, not guessed: h/hnr2.html (voice over noise), h/ratio_check.html (rhythm), Whisper closed sets
(intelligibility) -- the ear still judges.

## Tools and the data pipeline

- `python3 tools/words.py LANG [--compile]` reads a language's topic files against the index, reports what it leaves
  unsaid, writes dict.tsv (derived adverbs included); `python3 tools/compile.py` the same for German (tools/check.py
  the reader); `python3 tools/concepts.py` checks the index (every sense glossed, the German coverage).
- `python3 tools/offline.py` writes offline.json (the file list of the offline copy); `tools/order.py` ranks a
  language's words by its Leipzig corpus (`../../language/<lang>/`, not in the repository) into order.tsv.
- `gjs -m tools/listen_templates.js LANG`, `gjs -m tools/listen_eval.js LANG voice tempo N` -- the listening templates
  and their evaluation (gjs runs the engine's ES modules without node).
- Data is written in batches by Sonnet helpers from briefs: a batch's lines are checked with the shared parser and
  merged into the concept's topic file at the end of its section; concept proposals (`@ POS ID -- note`) are unified to
  one ID per function before they enter the index. The scratchpad holds the briefs and the mergers (mk_in / valw /
  merge_pos / apply_review / apply_grammar).
- Headless checks run pages in Chromium through the DevTools protocol (scratchpad h/tdrive.py URL JSFILE): the test
  pages, the dictionary and reading checks, the gap check (the top 1,000 corpus words a dictionary knows nothing of).

Seeds: `../lang-data/` (4,573 concepts in 8 languages with IPA, function words, spelling rules), the user's own
`~/store/welle/languages/` lists, the Leipzig news corpora, the HSK 1-9 word list.
