# Sentences — German sentences made by rule

Whole German sentences, grammatical and sensible, made from the dictionary with no recordings and no learned model:
rules, tables and a graph of categories. `sentences.html` shows and speaks them (serve the folder, open
`localhost:8000/sentences.html`; `?dump=N&level=L` writes N of them as text).

    Der Hund frisst das Fleisch.
    Weil es regnet, bleibt ihr zu Hause.          (shape: a subordinate clause in front, the verb first after it)
    Den Apfel, der auf dem Tisch liegt, hat sie gegessen.

Three kinds of knowledge, each in its own plain-text file, and code that knows nothing of German but what they say:

| what | data | code |
|---|---|---|
| **meaning** — what a word *is*, what a verb *asks for* | `categories.txt`, `meaning/**/*.txt` (→ `../meaning.tsv`) | `trainer/meaning.js` |
| **grammar** — where the parts of a clause go | `grammar.txt` | `trainer/grammar.js` |
| **morphology** — every word's forms, spelled and spoken | `morphology.txt` (+ the dictionary's own forms) | `trainer/morph.js` |
| the **planner** — a clause's content, meaning-checked | — | `trainer/sentences.js` |

## Meaning

`categories.txt` is a graph: `name : parent, parent -- what it is (examples)`. A category may have several parents (a
`meal` is `food` and an `event`); all lead up to `entity`. A word FITS a category when one of its own categories is that
one or lies under it — `Banane : fruit`, and `fruit : food`, `food : consumable`, so a banana fits `food`.

`meaning/` mirrors the dictionary file by file (`meaning/life/animals.txt` ↔ `life/animals.txt`); every noun, verb,
adjective and adverb has a line, identified by the word and its first Slovak meaning:

    N Banane = banán : fruit                         a noun's categories
    N Tür = dvere : building-part, openable, lockable      ... with AFFORDANCES: what one can do with it
    N Geld = peniaze : money ; mass                  flags: mass (no "ein Geld"), auf (auf dem Bahnsteig), an (am Strand)
    AN lecker = chutný : consumable                  what an adjective can describe
    AN ukrainisch = ukrajinský : person, food, -national ; attr
                                                     -x: but not x (no "ukrainischer Engländer"); attr: only before
                                                     a noun, never "ist ukrainisch"
    AV gestern = včera : time past perfect           an adverb's kind: time frequency place direction manner degree
                                                     sentence connective question other; a time adverb's tenses
    AV gern = rád : manner person                    a manner adverb's subject (none: an agent)
    V essen = jesť : animal > A food                 a verb's FRAME (a line each): its subject's category, its slots
    V fahren = cestovať : person > mit D vehicle     a preposition, its case, the category
    V regnen = pršať : es                            es: the impersonal subject
    V wissen = vedieť : person > dass                a clause as the object: dass, ob
    V versuchen = skúsiť : person > zu               a zu-infinitive (Er versucht, das Buch zu lesen) -- its subject
                                                     the clause's, or a person object's before it (erlaubt ihm zu gehen);
                                                     zu.subj: the clause's always (verspricht ihr, pünktlich zu kommen)
    V lehren = učiť : person > A person, A language  two accusatives (lehrt die Kinder Deutsch, kostet mich zehn Euro)
    V nennen = nazvať : person > A person, A= {Held|Lügner}   A=: what the object is (nennt ihn einen Lügner)
    V lassen = nechať : person > A thing, inf.obj    a bare infinitive whose object is the clause's (lässt das Auto
                                                     reparieren); inf: its subject the object or the subject (hört ihn
                                                     singen, geht schwimmen) -- inf {schwimmen|einkaufen}: those verbs
    V haben = mať : person > A0 {Angst}, vor D animal      A0: a bare accusative (Angst haben, Sport treiben)
    V tun = robiť : es > D person, ={leid}           fixed words (es tut mir leid, es geht mir gut)
    V sein = byť : das > N= thing                    N=: a noun said of the subject (Das ist ein Tisch; Ich bin Lehrer)
    V heißen = volať sa : person > name              name, age, clock: Ich heiße Anna, Ich bin 20 Jahre alt, Es ist 8 Uhr
    V ärgern = hnevať : animal > sich, über A entity       sich / sich D: the frame is reflexive (acc / dat)
    V aussehen = vyzerať : thing > adj               a predicative adjective said of the subject
    V kündigen = vypovedať : person -child > A document    exclusions after a subject's or slot's category
    V zumachen = zavrieť : person > A object +openable    +x: it must be x too (an affordance)
    V bellen = brechať : {Hund}                      only these nouns (a verb that narrow)

`python3 tools/meaning.py [file]` checks it all: the graph (no cycles, everything reaches `entity`), every line against
its dictionary file, every entry covered, a frame's preposition taking only the cases the dictionary gives it, and
nothing TOO BROAD: no adjective for any `entity`, `abstract` or `concrete` thing, no verb whose subject or object may be
any `entity`, `abstract` or `concrete` thing (they made most of the nonsense: "Das Quartal gelingt ihm", "hässlicher
September") -- the real categories instead, a frame line each.
`tools/compile.py` writes `../meaning.tsv` from it.

## Grammar

`grammar.txt` is a weighted context-free grammar over the fields of the German clause (front field, finite verb,
middle field, the rest of the verb). Lowercase symbols are ROLES the clause's plan fills — `subj`, `vfin`, `obj.A`,
`neg`, `adv.time` — written where they stand, once per clause (a role put in front is not in the middle field again; a
role the plan does not have is left out). `CLAUSES:` names the rules that get a plan of their own (MAIN, SUB, REL...);
`FILLED:` the rules that must write something (the front field); `WORDS name: a | b` lists that rules or the planner
draw from (the conjunctions; the adjectives left alone; the categories of mass nouns and of nouns that take only
`der/die/das`).

**Agreement** is carried by the roles: the subject's person and number give the finite verb's form; a noun phrase's
role gives its case, its noun the gender and number, its determiner the declension (strong, weak, mixed) of its
adjective (and of an adjectival noun: ein Beteiligter, die Beteiligten); a relative pronoun takes its noun's gender
and number; a reflexive pronoun the subject's person (dative when the verb has an accusative object too).

## The syllabus

THE SYLLABUS (`world/syllabus.txt`, shared by every language since 2026-10-12; the features renamed after the
constructions -- dative -> recipient, two-way -> direction, kein -> no-det, separable -> particle-verbs ...): every
grammar feature in the order German is learnt -- A1.1 (the present, sein
and haben, a statement, a question, nicht, predicates: Ich bin Lehrer, Das ist ein Tisch, Ich heiße Anna, Es ist
acht Uhr) through A1.2 (the accusative, kein, possessives, commands, modals, separable verbs), A2 (the perfect, the
dative, two-way prepositions, reflexives, adjectives, comparison, weil/dass/wenn; the past of sein and haben, polite
forms, welcher, etwas/nichts), B1 (every tense, relative clauses, zu-infinitives, the Konjunktiv II, indirect
questions, the genitive, lassen; the passive, paired conjunctions, correlates) to B2 (every passive, reported speech,
the double infinitive, participles, sein/haben/scheinen + zu, sich lassen, the future perfect; extended participle
attributes, nominal style, wer ..., der ...). Each line: `FEATURE stage name -- what (example)`.

`loadSentences({ dict, stage: "A2.1" })` makes sentences with only the grammar unlocked up to that stage (none:
all of it); the planner asks `has(feature)` before each construction, and a grammar rule tagged `@feature` is taken
only once that feature is unlocked (S -> MAIN "," SUB "." @dass-weil-wenn). The order is the order of teaching, not of
frequency in texts.

## The tests

`tests.txt` holds German sentences from the simple to the complex, in the syllabus's order -- Ich wohne in
Deutschland. ... Wenn man mir das gesagt hätte, hätte ich den Brief, der gestern geschrieben worden war, nicht
schicken müssen. -- each with the structure it is built from (its clauses, verbs, subjects, objects, tenses, moods,
voices; format in trainer/realize.js). `createGenerator().realize(test)` makes the sentence from that structure with
the same rules and morphology the planner uses; `sentences.html?test` runs them all and shows any that differ, word
for word. A new construction gets its test sentence here first.

## What it makes

Main clauses, questions (yes/no; wer, was, wen, wem, wann, wo, warum, wie; welcher / was für ein / wie viele + a noun;
mit wem, womit, worüber), commands (with their particles: Komm doch mal!), subordinate clauses (dass, ob, indirect
questions: ..., wo er wohnt; weil, da, obwohl, wenn, bevor, sobald, falls, während, bis, als, nachdem, seit, damit),
reported speech in the Konjunktiv I (Er sagt, er sei krank), relative clauses in every role (der, den, dem, mit dem,
dessen, wo; alles, was ...), zu-infinitives (versuchen zu; um / ohne / statt ... zu), bare infinitives (lässt ...
reparieren, geht schwimmen, hört ihn singen), coordination (und, aber, denn; with the subject left out: Er kauft Brot
und trinkt Kaffee; entweder ... oder), je ... desto.

The verb in present, past, perfect, pluperfect, future; with a modal (also in the perfect: hat ... lesen müssen);
active, passive (wird gebaut, ist gebaut worden, muss gebaut werden; von + the doer) and the state passive (ist
geöffnet); indicative, Konjunktiv II (hätte, wäre, könnte, würde + infinitive: conditions, wishes, polite questions)
and Konjunktiv I. Negation by nicht, kein, nie, niemand, nichts, weder ... noch, nicht ..., sondern ...; nicht mehr,
noch nicht, gar nicht, kein ... mehr.

Noun phrases with der, ein, kein, possessives, dieser, jeder, alle, viele, einige, manche, beide, viel / wenig,
numbers; adjectives with degree words (sehr, ziemlich, zu ...), comparative and superlative (ein größeres Haus, der
größte Baum; größer als ..., so groß wie ..., am größten); owners (das Auto meines Vaters, Peters Fahrrad, ein Freund
von mir); paired (sowohl ... als auch, nicht nur ..., sondern auch); pronouns personal, reflexive, indefinite (man,
jemand, niemand, etwas, nichts, alles, etwas Neues), names; time phrases (am Montag, im Sommer, um acht Uhr, letzte
Woche, jeden Tag, seit zwei Jahren, vor drei Tagen) and place phrases (zu Hause, im Garten, auf dem Markt); fixed verb
phrases (Angst haben, Bescheid sagen, Platz nehmen; es gibt, es geht um, es tut mir leid).

The VERB CLUSTER is one chain (trainer/sentences.js `verbParts`): the main verb at the bottom, then the passive's
werden, a modal, the perfect's haben/sein, the future's werden, the Konjunktiv II's würde -- each head asking the one
below for its infinitive or participle; tense, mood and voice combine by that one rule.

## Morphology

`morphology.txt`: `key = value` lines, cells `form [ipa]` separated by `|` — the determiners and their endings, the
adjective endings, pronouns, noun declensions (weak, mixed), verb endings and paradigms (sein, haben, werden, the
modals), separable prefixes (no list of inseparable ones: a participle takes ge- only when its stress is on the
first syllable), contractions (in dem → im), da-words (damit, darauf). Irregular forms come from the dictionary
itself (`spricht/sprach/gesprochen [ʃpʁɪçt/ʃpʁaːx/ɡəˈʃpʁɔxən]`). Every form is spelled AND spoken: endings join the
stem's IPA by rule (final devoicing and its undoing, vocalised r, the stress mark), so `speak.js` can say it.

## The planner

`trainer/sentences.js` makes a PLAN for each clause the grammar asks for: a verb (commoner ones likelier, within the
FREQ level) and one of its frames; a subject — a pronoun when a person may be it, `es`, or a noun phrase whose noun
fits the frame's category; objects that fit their slots — a noun phrase, or now and then a pronoun (a person: mich, ihm, für dich — never the
subject itself, never du and Sie in one clause; a thing: es, sie, ihn, and after a preposition its da-word); maybe an adjective that can describe its noun, a relative
clause, adverbs (one of time or frequency), a tense (present, perfect with haben or sein, past, future), a modal verb,
a negation (`kein` for an indefinite object, else `nicht`; none beside nie). A W-question asks for one role; an
imperative has no tense and a subject only as `Sie`. The grammar orders the plan, the morphology forms it.

What keeps it sensible besides the categories (each a declared list in grammar.txt or a few lines in the planner):
- one TIME for the sentence (past or not): every clause's tense from it, and time adverbs only with their tenses;
- COMPLEXITY sets a clause budget (1, 2, 3 clauses, relative and object clauses counted) and the shapes' weights
  (`{0/1/2}` in grammar.txt); fewer free choices -- adjectives, adverbs, relative clauses -- at lower complexity;
- a second clause always goes on with the first one's subject (..., weil er müde ist; und deshalb bleibt er); after
  `aber` the one negated that the first is not (a contrast); er/sie/es as a subject only for someone named before;
  es/ihn/damit for a thing only when a clause before named one;
- the planner adds adverbs of the everyday list only (adv.free; an adjective there is a manner adverb as it is:
  schnell -- and only for a subject it describes);
- a possessive is the subject's (Er wäscht sein Auto); a modal and a manner adverb check the subject (gern: a person);
- a place adverb only for a living subject with no place of its own; comment adverbs only in statements;
  connectives (deshalb, trotzdem) only after und / aber; no `nicht` beside bereits, schon, nie;
- relational adjectives (der jeweilige, der nötige) are not used; an adjective is chosen for the noun in the sense
  the slot took it; nouns with no plural take no `ein`; `nach` + a place takes a name (nach Berlin).

- two clauses are LINKED by what they say: after weil/da a state that explains a negated or routine main clause
  (Er kommt nicht, weil er krank ist), after obwohl a state (..., obwohl sie müde ist), after aber a state, a
  temporal clause a routine (Bevor ich gehe, ...); a relative clause on a thing only says where it lies, whose it is,
  what it costs (rel.thing); werden/bleiben + a state adjective; a measure comes with its number (zehn Euro).

The rules and the annotations were TUNED in rounds (2026-10-08): a blind critic (a language model told to be strict)
scored 100 seeded sentences OK / odd / nonsense; an analyst traced each complaint to its cause (the trace:
`?dump=N&seed=S` prints each clause's verb, frame and categories); the fixes went into the data or a general rule.
At complexity 2, fresh seeds each round:

| round | OK | odd | nonsense | what changed before it |
|---|---|---|---|---|
| 0 | 14 | 38 | 48 | the first annotations |
| 1 | 24 | 38 | 38 | no `entity` adjectives / frames; new categories; connectives; tense frame; antecedents |
| 2 | 25 | 40 | 35 | no `abstract`/`concrete` targets; `-x`, `; attr`; object vs thing; incident, process |
| 3 | 39 | 46 | 15 | complexity budget; linked clauses; everyday adverbs; affordances `+x`; `{words}` |
| 4 | 36 | 50 | 14 | BUCKET slots rewritten; CLOSED categories; everyday adjectives; state/routine clauses |
| 5 | 44.5 | 47.5 | 8 | (200 sentences) living subjects for states; stress after never-stressed prefixes |
| 6 | 55 | 35 | 10 | slot word lists actually read (a parse bug had dropped them); +944 nouns; zu-infinitives; two accusatives |

The biggest steps were structural (fewer free choices, linked clauses, everyday word lists), not finer categories.
What is left is mostly ODD: verb-object pairs that are possible but stretched (Marmelade kauen, Uhr sammeln).

    const gen = await loadSentences({ dict, level: 2, complexity: 2 });   // dict: data.js loadDictionary
    // complexity 1: one clause; 2: now and then two; 3: often two or three, more relative clauses and adjectives
    gen.sentence()   // -> { text, ipa, tokens }

## Scenes

Categories keep each clause possible; they cannot make two clauses belong together (*Er beschloss das Gesetz und
brachte einen Ball*). SCENE MODE (the default when `scenes.tsv` is there; `loadSentences({ scenes: false })` or
`sentences.html?scenes=0` without it) adds two kinds of data, both plain text, compiled by `tools/scenes.py` into
`../scenes.tsv` (`trainer/scenes.js` reads it):

| what | data |
|---|---|
| **settings** — a tree of situations (kitchen under home, doctor under health), with ROLES (guest, staff ...) | `settings.txt` |
| **members** — the nouns and verbs of each setting, a person's or a verb's role there | `scenes/*.txt` |
| **states** — what can be said of a subject (müde, Hunger), of an object (kaputt), with opposites | `settings.txt` |
| **conditions** — what an action NEEDS and GIVES (essen: needs hungrig, gives satt) | `conditions.txt`, `conditions/*.txt` |

A sentence picks one setting; its nouns and verbs come from that setting, the settings above and below it and
`everyday` (`scenes/general.txt`) -- the setting's own words eight times likelier than everyday ones; a verb with a
role takes a subject of that role (der Kellner bringt, der Gast bestellt). Adjectives and adverbs belong everywhere:
their categories already decide where they fit.

The CONDITIONS make the links between clauses (`conditionLink` in the planner):

    weil / da / denn     what the action needs        Der Gast bestellt eine Suppe, weil er Hunger hat.
                         negated: its opposite        Er bestellte nichts, weil er satt war.
    obwohl / aber        the other way round          Die Ärztin operiert den Mann, obwohl er gesund ist.
    the object's state   A:kaputt, A:krank ...        Lukas behandelt das Kind, weil es krank ist.
    nachdem / bevor      one's gift, the other's need Nachdem die Freunde geschlafen haben, stehen sie auf.
    und deshalb / dann   what it gives                Er hat gearbeitet, und deshalb ist er müde.
    um ... zu            what it gives, another needs Er kauft eine Fahrkarte, um nach Berlin zu fahren.
    a state first        an action that needs it      Weil die Frauen Zeit haben, lesen sie. Hätte ich Zeit, ...
    zwar ... aber        an action against the state  Er hat zwar Angst, aber er rettet dich.
    entweder ... oder    two actions, the same need   Entweder gesteht er den Fehler, oder er gibt ihn zu.
    wer ..., der ...     the need, or what it gives   Wer Hunger hat, der isst. Wer arbeitet, der ist müde.
    wenn (Konjunktiv II) the state as the condition   Er würde essen, wenn er Hunger hätte.

A state says itself plainly: sein + adjective or haben + bare noun, now or then, never negated, no modal. A state
may be about one kind of object (`of food`: weil er Hunger hat, bestellt er eine Suppe -- not Wasser); um ... zu
aims only at a GOAL state (`goal`: Geld, Zeit, gesund, stark -- not "rennt, um einzuschlafen"), a thing (`has:Noun`:
the giving verb's object is then that thing -- kauft eine Fahrkarte). A FEELING (froh, Angst) is a reason, never a
step in time (nachdem, bevor, und dann); an INVOLUNTARY action (husten, einschlafen: `; involuntary` on its condition)
never goes against its need (not "hustet, obwohl er gesund ist"); an opposite is declared only where it makes the
action surprising, not impossible (müde has none: not "schläft, obwohl er wach ist"); after a modal no link is made
(durfte nicht ..., weil ...); an object's state is a reason only, never a step between two actions. A link the
conditions do not give is not made in a scene (the usual links, tried there, were mostly unrelated); `und` and a dropped subject
keep a plain second clause now and then, in the first one's tense. Because the links are strict, more two-clause
shapes fail; a one-clause result is drawn again now and then (`SINGLE_AGAIN`) so complexity holds (44% of sentences
with two or more clauses at complexity 3, 48% without scenes).

The data was made in two steps (2026-10-08): a PILOT (7 settings, 181 words, 36 conditions), tuned against a critic;
then the whole vocabulary -- 34 settings, every noun and verb of the dictionary (7451, 10441 memberships), 333
conditions -- by language-model helpers split by dictionary folder (one members file and one conditions file each:
`scenes/household.txt`, `conditions/household.txt` ...), a second pass for conditions with new states, and a review
that dropped weak or tautological ones (stehlen: needs arm; fürchten: needs angst). 100 sentences at complexity 3, a
blind critic that also marks each complaint W -- within a clause -- or L -- the link between clauses:

| round | seed | OK | odd | nonsense | W | L | both |
|---|---|---|---|---|---|---|---|
| without scenes | 909 | 29 | 33 | 38 | 31 | 16 | 24 |
| pilot | 909 | 32 | 53 | 15 | 40 | 14 | 14 |
| whole vocabulary | 909 | 48 | 39 | 13 | 33 | 6 | 13 |
| without scenes | 1111 | 31 | 36 | 33 | 28 | 16 | 25 |
| + second conditions pass | 1111 | 40 | 39 | 21 | 32 | 9 | 19 |
| + wer/entweder/drop links, tautologies out | 4444 | 39 | 51 | 10 | 46 | 6 | 9 |

Nonsense falls by two thirds, link complaints by about as much. What is left is mostly W -- odd verb-object and
adjective-noun pairs inside one clause, which the meaning annotations (above), not the scenes, decide.

States carry FLAGS (settings.txt): `goal` (um ... zu aims at it), `feeling` (a reason, never a step in time),
`default` (the normal state -- gesund, wach: never a reason, only what is against it), `person` (Zeit, Geld, Lust: a
person's only). `entweder ... oder` offers the same action with another object (Entweder trinkt er Kaffee, oder er
trinkt Tee); `aber` against a state only after `zwar`; `und deshalb` only after what is done (past or perfect).

THE IMPROVEMENT LOOP (2026-10-09): each iteration, 4000 generated sentences give the word PAIRS they used -- verb frame
+ slot + noun, adjective + noun, participle + noun, adverb + verb or tense -- unique and not judged before; language-
model helpers, one per group of meaning files, judge every pair and fix the CAUSE of each bad one in the annotation (a
narrower category, `-x`, a word list), reporting what data cannot fix -- those became general rules: declared lists in
grammar.txt (manner.<adverb> verbs, participle.I/-II, participle.person-I/-II, participle.zu, verb.once, infant.verbs,
correlate.verbs, noun.vague, verb.no-command for zu-infinitives too), the categories `role` (a person by what they do
at a time: Kunde, Besucher, Täter), `infant`, `position` (Stelle, Seite: no place), single nouns in any category list
(`-{Opfer|Mensch}`, `{Ehe|Kindheit}`) and the adjective flag `; pred` (froh: "er ist froh", not "der frohe ..."). A fixed benchmark -- seeds 7001-7003, 300
sentences at complexity 3, a blind critic -- measures each iteration; PENALTY = (odd + 2 x nonsense) / sentences:

| iteration | OK | odd | nonsense | penalty | pairs judged (bad) |
|---|---|---|---|---|---|
| 0 | 114 | 133 | 53 | 0.797 | -- |
| 1 | 127 | 120 | 53 | 0.753 | 7974 (~1300) |
| 2 | 145 | 100 | 55 | 0.700 | 6479 (~560) |
| 3 | 172 | 110 | 18 | 0.487 | 5613 (~370) |
| 4 | 153 | 123 | 24 | 0.570 | 5000 (~280) -- a regression: unlinked je ... desto filled the redrawn sentences |
| 5 | 174 | 112 | 14 | 0.467 | 4537 (~230); je ... desto linked by the conditions too |
| 6 | 187 | 102 | 11 | 0.413 | 4242 + 888 frequent rechecked at a STRICT standard (~1100); role/national nouns out of broad slots; participles and frequency adverbs from declared lists; word-list frames 3x likelier |
| 7 | 187 | 103 | 10 | 0.410 | ~3500 + 995 rechecked (~620); `beast` (an animal that is no person); generic persons (Mensch, Person) no objects; voice via the participle lists |
| 8 | 194 | 95 | 11 | 0.390 | ~3100 + 1100 rechecked (~390); sentence adverbs in main clauses only; commands of everyday actions; relative clauses without es/future; nationality adjectives as one positive list |
| 9 | 211 | 78 | 11 | 0.333 | ~2700 + 1181 rechecked (~330); frequency adverbs (nie too) of everyday verbs only; quantifiers on concrete nouns; dative plurals with an article; generic persons only where named; word lists match feminine forms |
| 10 | 198 | 85 | 17 | 0.397 | ~2600 + 1233 rechecked (~340); `professional` CLOSED for adjectives; children do everyday things (child.verbs); owners kin and friends; participles before persons of a list; Konjunktiv II only with a condition or a wish; places only of everyday actions, none of directed verbs -- no gain (the benchmark grows to 600 from iteration 11) |
| 11 | 442/600 | 147 | 11 | 0.282 (a-c .320) | ~2200 + 1233 rechecked (~250); benchmark 600 sentences (6 seeds); paired objects of things only; entweder of everyday things; dessen/deren kin and pets; als agrees in the passive; feelings uncounted; feminine nouns share the masculine person categories (checked by tools/meaning.py) |
| 12 | 466/600 | 120 | 14 | 0.247 (a-c .263) | ~4400 lines (~230); first bench 0.367 (a regression), then: steps in time (nachdem, bevor, und dann) of everyday actions only, bevor in the main clause's time; quantifiers and pairs on things only; ranks (König, Papst) only where named; gut/wichtig no predicate of a person; du/ihr in the perfect; verbringen with a place |
| 13 | 471/600 | 118 | 11 | 0.233 (a-c .253) | ~3700 lines (~320); a profession in a broad slot only doing its scene's own action; Herr, Dame, collectives (Menschheit, Nation), fame (Star, Weltmeister) only where named; role CLOSED for adjectives; no passive of a thing acting on a person; der first after wer; pronoun objects before a noun subject |
| 14 | 456/600 | 134 | 10 | 0.257 (a-c .250) | 6000-sentence sample (~4700 pairs) + 623 clause LINK pairs judged by a conditions helper (tautologies and stretched reasons removed from conditions); no niemand/nichts where no negation is wanted -- no gain |
| 15 | 484/600 | 105 | 11 | 0.212 (a-c .240) | by OK rates per construction over benches 13+14 (1200 judged): relative clauses, time adverbs and phrases of everyday actions; gern a habit now or a wish; no bare so; sofort only ahead |
| 16 | 936/1200 | 244 | 20 | 0.237 | 4300 pairs + 456 links (link data 454/456 OK); zu-infinitives of everyday actions; no perception infinitive in relative clauses; professions only with verbs their own setting lists; groups out of broad slots; no deshalb of the action's own result; Geld no reason -- benchmark grows to 1200 (12 seeds): states 15 and 16 measured at 1200 each (.228 / .237) -- a plateau; no gain |
| 17 | 944/1200 | 234 | 22 | 0.232 | state nouns (Kopfschmerzen, Hunger) only a person's; one place after a preposition; no commands of sehen/hören or out of somewhere -- no gain |
| 18 | 945/1200 | 241 | 14 | 0.224 | sentence adverbs from the everyday list; rarer: relative clauses, degree words on attributes, participle attributes, correlates, haben/scheinen/brauchen zu -- within noise of 15-17: the loop stops (three iterations without a measurable gain) |

From iteration 11 the benchmark had 6 seeds (600 sentences), from 16 twelve (1200): at about 78% OK one critic run of
600 sentences varies by +-0.02 in penalty, more than most single changes. What moved it: rules found by the OK RATE PER
CONSTRUCTION over the judged benchmarks (steps in time only between everyday actions, quantifiers and pairs only on
things, time adverbs and relative clauses of everyday actions -- each lost far more than its share), not more pair
audits, which had become neutral; the clause LINK audit (`LINK weil :: hungrig -> essen`, judged by a conditions helper)
cleaned the conditions to 454/456 OK. A regression was found twice by benching a saved earlier state beside the current
one (A/B). The loop stopped at iteration 18: three iterations (16-18: .237, .232, .224) within the noise of each other,
a plateau near 79% OK, 1-2% nonsense, under a strict critic. What the critic still marks: odd verb-object and
adjective-noun pairs (about two thirds), weak reasons (weil ... Zeit), stacked relative clauses. Open: the subject drop
(..., und dann ...) and um ... zu are rare in scenes (they need everyday steps and goal chains in the conditions).

    python3 tools/scenes.py              # check, compile scenes.tsv, coverage by FREQ
    python3 tools/scenes.py --missing    # the nouns and verbs no setting has yet, by dictionary file
    python3 tools/scenes.py --check F..  # check only these files

## Not yet

The genitive article of proper nouns. The annotations were written by language models and tuned against a critic (above): the
sentences are grammatical far more reliably than they are natural -- what is left is mostly verb-object pairs that are
possible but stretched.
