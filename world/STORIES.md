# Stories: a world model over the sentence generator

A STORY is a few sentences about one little world -- a setting, two people, a few things, their states -- in which
something happens, goes wrong and is mended. The sentence generator (README.md) makes good single sentences; a story
needs what single sentences never had: the same people and things again (ein Mantel, then der Mantel, then er), a
time line (dann, später), reasons and results across sentences (Anna hatte Hunger. Deshalb kochte sie.), and states
that change (the plate was dirty; now it is clean).

## The layers

    data                                   code                     what it decides
    ------------------------------------   ----------------------   -------------------------------------------
    dictionary, morphology.txt             morph.js                 the forms
    categories.txt, meaning/**             meaning.js               what fits what (frames, adjectives)
    settings.txt, scenes/*, conditions*    scenes.js                where words belong; what actions need, give
    valence.txt                            scenes.js                good / bad (feelings, comments, consistency)
    situations/*.txt                       scenes.js                concrete scenes: place, people, wants, troubles
    world/properties.txt                   tools/world.py           what places, things, weather can be (scales)
    world/places/*.txt                     scenes.js world          each place's sheet: in/out, properties, things
    world/weather.txt, rules.txt           story.js climate()       season, weather; what follows (heiß -> durstig)
    world/people.txt, cast.txt             story.js WHO             traits, tastes; the 16 actors' sheets; SHOWS: a
                                                                    trait's manner (geduldig: langsam | vorsichtig)
    world/procedures.txt                   story.js PROCEDURE       what doing a wish IS, step by step (WORK*)
    world/body.txt                         story.js signs           how a state shows (Ihr Magen knurrte.)
                                           story.js STORE           what each thing is now and what was done to it
    stories.txt                            story.js                 PLOTS, PARTS, the MOVES' ways (clause blocks)
                                           story.js CONDS, SLOTS    what a way needs of the world; its values
                                           story.js REFERENCE       who and what is known: ein/der, er/sie
    grammar.txt, tests.txt format          sentences.js realize()   the sentence from a clause structure

Between settings and stories: SITUATIONS (below) -- the concrete scenes that give a story its place, people, things,
wants and troubles.

The narrator never writes German: it builds the realizer's clause structures (the format of tests.txt: verb=,
subj=name:Anna, A=def:Mantel, pred=adj:kaputt, conn=deshalb, front=conn, tense=past), and realize() makes the
sentence with the same rules and morphology as every other sentence. A story's trace IS those structures.

## Situations: the layer between settings and stories

A setting (settings.txt, scenes/*) says what words are ABOUT a topic -- traffic has Frachter, Kutsche,
Rettungshubschrauber -- not what is HERE, who OWNS it, who ACTS here. The first stories took their people and things
from the settings and the critic found exactly that: "Laura hatte einen Rettungshubschrauber", "Der Kapitän schleppte
den Zug ab", and threads that did not meet (hungry, then a dirty helicopter). So the words that carry a plot come from
SITUATIONS (sentences/situations/*.txt) -- small blocks, one concrete scene each:

    SITUATION frühstück : kitchen -- morgens frühstücken
      place   Küche
      people  kin
      things  Tisch | Teller | Tasse | Toaster | Kaffeemaschine | Brot | Kaffee | Milch
      own     Korb
      want    hungrig : Brot toasten ; uses Toaster
      want    durstig : Kaffee kochen ; uses Kaffeemaschine | Tasse
      trouble Toaster kaputt : reparieren
      trouble Tasse schmutzig : spülen

`things`: what is there (said der Toaster at once); `own`: what the first person has with her (ihr Korb); `want`: a
STATE, the action it makes one want, said as after "sie wollte ..." -- bare (Brot toasten), ein (ein Buch lesen), der
(den Tisch decken: the one here), sein (sein Gesicht waschen: her own), a plural (Kekse backen), sich (sich ausruhen)
-- and the things the action needs; `trouble`: what can go wrong with a thing (an OBJSTATE) and the action that mends
it (`by` who); `lack`: a thing she may not have and where she gets it (lack Mehl : Supermarkt -- the errand plot).
The ONE coupling that makes a story is that the trouble (or the lack) hits a thing the wanted action uses.
tools/scenes.py reads and checks every word and compiles the blocks into scenes.tsv (a want as its fields: state,
verb, object, article, number, uses); scenes.situations() gives them to the stories. A state the data marks `wish`
is said only with its wish (Er hatte Lust, einen Film zu sehen); a `default` state is no motive.

## The world: sheets for places, weather and people (sentences/world/)

ONE vocabulary of properties (properties.txt: temperature kalt < kühl < warm < heiß, wetness, light, loudness, crowd,
comfort ...: each value a dictionary adjective, its valence from valence.txt) is used by every sheet:

    PLACE Wüste : out ; temperature heiß ; wetness trocken ; light hell ; things Sand | Düne | Kamel ; weather sonnig {6} | heiß {4}
    PLACE Küche : in ; temperature warm ; comfort gemütlich ; things Herd | Kühlschrank | Tisch ; people Koch
    WEATHER Regen : verb=regnen subj=es ; wetness nass ; light dunkel ; noun Regen ; bad
    SEASON Herbst : Regen {4} | windig {3} | neblig {2} | kühl {2}
    RULE weather Regen & out -> thing nass ; wear Regenschirm | Jacke
    RULE temperature heiß & out -> state durstig ; wear Sonnenbrille
    ACTOR Lisa : f ; job Lehrerin ; traits freundlich | neugierig ; likes Kaffee | Regen | lesen ; dislikes Hitze

A story's world: an actor of the cast; a situation; its place's sheet; a season that fits the place (a beach in
summer); the weather (outside: the place's own as the season has it; bad weather only when it causes the trouble);
the RULES that fire on the place's and the weather's properties -- a motive WITH its cause (Es war heiß. Sie war
durstig.), a trouble with its cause (Es regnete. Bald wurde das Holz nass.), what she wears. The wish is chosen
weighted by what the rules cause and what she likes. A thing the place's sheet lists is there at once (die Dusche of
a bathroom); a role the sheet's people list is there to be called (Also rief sie den Bademeister.). tools/world.py
checks every word and compiles the sheets into scenes.tsv.

LESSON (benches 5 and 8): a detail must EARN its place -- a feature, a plan, a job, a past action, an introduced
thing that nothing in the story uses is read as filler ("Das Klassenzimmer war laut.", "Am Wochenende wollte sie
tanzen."). So each world move has a `when` that ties it to the plot: DESCRIBE only the feature that caused the wish,
PAST only a liked activity that made the state, PLAN only to do it again, JOB only where her work is.

## Plots, parts and moves (stories.txt) -- all data

    PLOT obstacle {3} : OPEN WANT BLOCK FEEL? MEND DONE (FINISH) RESULT PLAN?
    PLOT weather {2}  : WOPEN WANT SPOIL FEEL? MEND DONE (FINISH) RESULT PLAN?
    PART OPEN : WOPEN {5} | SET (JOB) (OWN) (THERE) (DESCRIBE) {2} | SET (OWN) (THERE) {2}
    PART MEND : ASK? HELP THANK? {2} | CALL ARRIVE THANK? {1}
    MOVE SPOIL when caused : @story.against 1 .
      1 MAIN $becomes subj=$trouble time=@story.soon front=time tense=past
    MOVE THANK {2} when p2 : 1 : „ danke ! “
      1 MAIN verb=sagen subj=$p1 tense=past
    JOIN WISH BLOCK {.4} : 1 , @story.against 2 .

X must be told, X? half the time, (X) when the world has it; a PART's alternative is chosen among those whose first
must-token can be told. A MOVE has one block per way of telling it -- the clauses in the tests.txt format with
$slots (the world's values: $p1 $trouble $weather ...) and @lists (WORDS) -- chosen by weight among the ways whose
`when` holds (story.js CONDS: weather-told, caused, p2.here ...; or a flag a move `sets`). A new kind of sentence, a
new alternative, a new plot: data only; a new kind of world fact: one CONDS or SLOTS entry. story.js keeps who and what
is known: a thing is ein first, der then (an indefinite wish stays ein until the thing is there), her own things ihr
... first; er/sie is the last subject unless a thing of the same gender was just named; a noun's sense is the
setting's (die Leiter) and is told to the realizer as word=sense.

## The plan: arcs, beats, narrators, the session (2026-10-11)

A story is PLANNED before a word is told, so stories differ in shape, not only in fillers:

    PLOT order/classic {1.4}     : SETTING ASKING (MIX) WORK* KITCHEN-TROUBLE? WORK* TASTING ENDING
    PLOT order/voice-first {1.2} : ASKING SETTING-AFTER (MIX) WORK* KITCHEN-TROUBLE? WORK* TASTING ENDING
    PLOT order/surprise {.7}     : SETTING SURPRISE (MIX) WORK* KITCHEN-TROUBLE-ALONE? WORK* TASTING COMEHOME ENDING
    BEAT KITCHEN-TROUBLE : [trouble] BLOCK FEEL? MEND {2} | [lack] LACK FETCH BACK? {2}
    BEAT ENDING : SERVE (REACT) {3} | [~quiet] SERVE (REACT) (APRON) {2} | [~talk] SERVE PRAISE {2} | ...
    NARRATOR painter {2} : joins=1.3 maybe=.65 decor=.75 adorn=.5 manner=.65 speech=.7 scene=3 quiet=2

- ARCS: a plot's lines are its shapes (`PLOT name/arc`), chosen by weight -- the asking first or the scene first; she
  surprises him (no one asks; he comes in at the end); in a hurry; it burns after the decisive step and he laughs it
  off -- they order a pizza (story.in-work: the work stops there); a favor with his broken thing told first; a wish
  with her state first.
- BEATS: chosen when the story is planned -- an opening, a complication (an order whose stove is broken, whose
  ingredient is missing: the obstacle and errand machinery inside an order), the tasting, the ending. The plan then
  knows what it holds: `plotHas` reads the plan, so the work waits at the obstacle the plan chose (a PART is still
  chosen while telling; a plan whose musts cannot be told is drawn again, four times per arc).
- the NARRATOR of a story: how often moves join, optional moves are told, things are described, a manner is said, a
  way with speech is taken; tags `~scene ~talk ~quiet ~inner` on alternatives weigh them by its taste; `WORDS
  key@narrator` its own words.
- the SESSION: the arcs, beats, ways, joins, a part's alternatives and the words told lately are less likely again;
  the memory halves after each story (one teller = one session).
- every token a plot, beat or part names must be a move, part or beat (checked when the teller is made).

Measured by `shape.py` (the move skeleton reduced to functions -- setup, want, pressure, trouble, help, work, end):
48 order stories (C=3) before: 2 shapes, the commonest 58% (S-P-W-E), sentence frames repeated in a session 26%;
after: 10-11 shapes, the commonest 19-33%, frames repeated 11-16%; no story fails to plan (benches po7, p7 at C=3,
p7c2 at C=2). Blind A/B critic (16 old vs 16 new stories, ab1): the new
set chosen -- shape variety 3 vs 2, templated feel 2 vs 1, richness 1.44 vs 1.19, but coherence .63 vs .44 (the
combinations exposed old faults: a person's er taken for the grill, the pan taken off and still sizzling, soft after
drained) -- fixed: a person's pronoun forgets the thing's, smoke only when nothing fries after it, the texture said
before what is done with the done dish (`story.after-done`), the hot brow while it cooks. Round 2 (ab2, labels swapped,
fixed new set vs old): the new set better on every count -- coherence .38 vs .50, richness 1.44 vs 1.13, odd lines 35
vs 36, shape variety 3 vs 2, templated feel 2 vs 1. Still named: data faults older than the planner (a dish from
nothing: "eine Suppe kochte", jam made sweet by boiling, tasting before it is done) and stock lines inside a shape.

## Results (story benchmark: 48 stories, seeds 301-306 x 8; STORY PENALTY = sentence penalty + coherence / 2)

    0  pilot: world from the settings, moves in a row               0.904  (sentences 60% OK, 8/48 coherent)
    1  12 hand-written situations, plots, links by relation          0.335  (82% OK, 30/42 coherent, 0 incoherent)
    2  115 helper-written situations, joined sentences, mishap      0.314  (79% OK, 39/48 coherent, 0 incoherent)
    3  audited situations (articles, own, motives), companion, errand 0.168  (88% OK, 44/48 coherent)
    4  2nd audit, direct speech, sense by setting, own introduced     0.119  (89% OK, 47/48 coherent)
    5  THERE (+ a random thing), calls before arrivals                0.140  (filler things: "Es gab dort einen Himmel")
    6  THERE only what is used, mass flags                            0.124  (sentences 0.092 -- best; 45/48 coherent)
    7  FINISH (STATE ends essen), pronoun rivals, indef wishes         0.127  (46/48 coherent)
    8  WORLD: places, weather, rules, cast; moves as data; new moves  0.216  (41/48: filler -- unused features, plans)
    9  world moves only when they matter (the lesson above)          0.150  (sentences 0.098; 43/48 coherent)
   10  weather only when it acts, SELF mend, 166 situations          0.096  (91% OK, 48/48 coherent) -- best

   11  complexity 3: joins as an author (nachdem, als...dass, weil, ob)  0.135  (47/48 coherent)
   12  + tools, comments, adjectives, varied wordings                 0.186  (odd tools: Kamera mit einem Hammer)
   13  + 450 coverage situations, repetition memory, object pronouns  0.264  (weak new data: wish and trouble apart)
   14  audit of the new data, Dort stand/lag ..., decoration rules    0.156  (46/48)
   15  praise by kind, decoration by property, trimmed tools          0.171  (45/48)
(benches 11-16 at complexity 3 -- the complex stories; 1-10 at the old medium joins)

REACH (rounds/reach.py: 400 stories, complexity 3, no critic) -- the vocabulary goal:

    world model (bench 10)            140 situations   416 words (75 V, 323 N, 18 AN)   5.5 words/sentence  top-20 45%
    + joins, ways (bench 11)          194              533 (75, 406, 52)                 6.7                 42%
    + varied wordings                 203              587 (89, 430, 68)                 6.6                 41%
    + coverage situations             280              777 (160, 550, 67)                6.7                 42%
    after audit + quality rules       256-268          ~700-730 (150, 510, 50)           6.5                 39-40%
(top-20: the share of the 20 most frequent content words among all; the same opening twice in a row: 4%)

REPETITION, as an author avoids it (story.js): the words a story said are counted -- of a list's words the least said
wins (dann / danach / anschließend / später; aber / doch; deshalb / also / daher / darum); a way of telling or a join
told before is less likely again; a sentence that would open like the one before is set aside while another way can
be told; a thing just named is er/sie/es (as an object unless a thing or person of its gender was just named; never
before a named subject: "spülte es seine Schwester" -> "spülte seine Schwester das Glas"); the second person after
a first mention is er/sie when the two differ in gender (bedankte sich bei ihm).

The loop stopped after bench 7: three rounds (5, 6, 7) without beating bench 4 (0.119). The rest of the penalty is
small and spread (an odd helper, a filler "Es gab dort einen Tisch", a weak motive) and near the bench's noise (about
+-0.02 at 48 stories); what every critic names but does not score is the ONE TEMPLATE and the small vocabulary
(~180 words in 48 stories). Those need the next structure (the review below), not more fixes. After bench 7, unbenched:
THERE's things count as rivals for er/sie, and a noun with more senses is told to the realizer as word=sense
(Leiter=rebrík -- die Leiter; sentences.js word()).

## Showing, not telling: procedures, the things' store, the body (2026-10-10)

The goal (user, 2026-10-10): stories in the style of literary prose -- "Töpfe klapperten, Öl zischte in heißen
Pfannen ... Mit einem Löffel probierte er eine winzige Portion. Perfekt." -- from the existing vocabulary. An
analyst / architect / implementer / critic loop; the critic (rounds/STORY-CRITIC-R.md) adds a RICHNESS score per
story (0 primer sentences .. 3 close to the model) and the tag F (an unearned detail); rounds/richness.py counts the
devices in the traces (adjectives, participles, manners, clause kinds, chains, speech, fragments per 100 sentences).

- PROCEDURES (world/procedures.txt): a wish's action as its lines -- `step` (she does it), `process` (a thing does
  it: Das Wasser kochte.), `key` (the decisive step: Jetzt kam der entscheidende Augenblick.), `?` a detail of complex
  stories, `; gives Thing:state`, `; if cat`. Clauses in the tests.txt format; nouns are the story's things
  (Pfanne/Bratpfanne: the one the situation has; ~Lampe: only where there is one; obj: the wish's thing). The plot's
  WORK* tells the lines while it can: up to the one that uses the thing in the way (it waits until the flag
  `cleared`: HELP, FIX, ARRIVE, SELF, FETCH), then the rest after the mending -- the trouble hits the work in
  progress: "Als sie die Pfanne auf den Herd stellen wollte, sah sie, dass der Herd kaputt war." No procedure: DONE.
- THE THINGS' STORE (story.js): each thing's states (set by the verbs' conditions -- füllen gives voll --, by what a
  sentence says -- Der Herd war kaputt --, by a line's gives) and what was done to it (a verb of participle.II;
  a process of participle.I). A known thing is said with the latest of them, now and then, one a sentence, each once,
  a named state not at once again: in die heiße Pfanne, das kochende Wasser, die gebratenen Frikadellen, den
  reparierten Herd. (story.no-attribute: ganz, fertig, voll.)
- SIGNS (world/body.txt): a state shown, not named -- STATE, FEEL, RESULT ways: Ihr Magen knurrte. Sie schüttelte den
  Kopf. Endlich atmete sie tief aus und lächelte.
- MANNERS: a trait's adverbs (people.txt SHOWS), only with the verbs of grammar.txt manner.<adverb>; the decisive
  step's from story.careful (Vorsichtig legte sie ...). Realizer: front=pp (Mit dem Löffel ...), front=manner,
  the manner before a new object (trank langsam einen Schluck), sich before a noun subject (Nun freute sich Max).

Later rounds (2026-10-10, same day):
- MENDING as a procedure too (procedures.txt, keyed by the trouble's verb; by kind of thing -- a tyre patched, a bulb
  changed, a seam sewn --, the generic blocks last: of procedures that fit equally the first wins). Two procedures,
  the wish's and the mend's, each with its own cursor; a PART names its FOCUS (`PART FIXWORK mend : ...`), $doer is
  the one who does the steps (the helper once ASK / ARRIVE set `helper`, else she). A PART alternative may carry
  conditions: `[mend p2.here] ASK OFFER? FIXWORK* THANK?`. The mending done clears the way (`cleared`, `helped`), the
  thing loses its trouble state, and a wish step the mending did already is skipped.
- EARNED evaluations: `sensed` (a line marked `; senses` -- tasted, looked at) before a verdict or a comment; `tense`
  (a bad feeling told, a hurry) before relief; endlich only after a call or a hurry; `close` lines end a story with a
  last touch (Sie biss in den warmen Kuchen. Er sah das Foto an.); `moment` only for the cook's decisive step.
- AMBIENCE (world/ambience.txt): only what earns its place -- a thing the work uses, a smell of the wish's kind that
  makes her hungry (Es duftete nach frischem Brot, und ihr Magen knurrte.), or an OMEN (`; omen kaputt`: the trouble's
  first sign -- Die Lampe flackerte, und plötzlich ging sie kaputt.).
- DIALOGUE: quote first, the inquit after (realizer `„ 2 ! “ , 1 .` with 1 INVERTED): „So ein Mist!“, rief Lisa.
  „Hilfst du mir?“, fragte sie ihren Bruder. „Klar!“, sagte er. WAIT: Lisa wartete. / Sie sah auf die Uhr (impatient).
- JOINS with `when` (the world's conds, or of the two clauses: same-subj before a subject is dropped, durative-a/-b
  before während): Während der Mechaniker das Kabel ansah, wartete Lisa. / Dann kam er und zog den Stecker. /
  Nachdem er den Stecker gezogen hatte, ... A thing the first half named is a pronoun in the second.
- Feelings at complexity 3 are shown (body.txt, 42 signs), named only below; "Es gab dort ..." only below 3.
- PLOT favor: one of hers asks her to mend his thing (Kannst du meine Lampe reparieren?) -- she does it step by step.
- SCENE opening at complexity 3: the place and its atmosphere first, then she is placed (In der Küche summte der
  Kühlschrank. Anna stand mit ihrer Oma am Backofen.); a HEAT sign while the work is hot, joined with während
  (Ihre Stirn glänzte von der Hitze, während sie die Suppe konzentriert umrührte.); cooking smells with the dish's
  participle (Es duftete nach gebratenen Frikadellen.); a FRAG clause (realizer: a noun phrase alone -- Eine
  Tomatensoße mit Knoblauch und Basilikum.); requests and plans change nothing in the store (YESNO, modal, als).
- SIDE tasks (world/side.txt): the other one does something while she works (Während Lukas das Öl in die Pfanne
  gab, stellte seine Mutter Gläser auf den Tisch.); an urgent order („Die Gäste kommen in zehn Minuten!“) makes
  tension and earns relief; the same subject goes on as sie/er even after a thing of her gender was named.
- PLOT order (the kitchen passage's shape): one of hers asks for a dish -- „Ich habe Hunger!“, rief ihr Vater. --,
  she answers -- „Klar!“, antwortete Maria, ohne den Blick vom Topf zu wenden. --, makes it step by step, serves it,
  he tastes it and nods; Perfekt. Only where the wish is a dish with a procedure (about 2 stories in 100).
- What remains (the critics, benches 21-23): situation data (places like "in der Kasse", bare plurals "Einkäufe
  bezahlen", one grape bought for "Weintrauben"), the one plot frame (want, trouble, help, thanks), repeated nouns
  where a pronoun is ambiguous, and concrete words the dictionary lacks (abschrauben, aufpumpen, flicken, quietschen,
  knistern, rauschen ...: listed in the round-4 draft, scratchpad ar4/procedures-draft.txt).

    bench   change                                                          richness  story penalty
    17      baseline (critic with RICH, F)                                    0.35      0.297
    18      procedures (18), store attributes, signs, trait manners          0.29      0.329
    19      mend procedures, focus, ambience, dialogue, earned evaluations   0.62      0.342
    20      join guards, 12 joins, step chains, earned ambience/relief       0.44      0.371
    21      mending by kind (76 procedures), closes, 42 signs, omens         0.56      0.320
    22      no "Es gab dort" at 3, zuerst, nachdem joins, fewer end gestures 0.52      0.310
    23      the same texts as 22, scored again (the order plot fits none)    0.67      0.339
    24      favor plot, heat sign + während, cooking smells, FRAG compose    0.62      0.341
    25      sensory process lines (flackern, dampfen, summen), dann joins    0.58      0.380
    26      scene openings, 74 situations built for procedures, data audit  0.54      0.415
    27      heat only when hot, endings only after tension, fixes           0.56      0.376
    28      pronoun continuity, side tasks (während), urgent orders         0.54      0.408
KITCHEN BENCH (the passage's own domain: only `order` stories -- sentences.html?story=8&plot=order; rounds/sbench.sh
with PLOT=order): o1 0.92 (pen .315) -- dense order plot: scene, urgency, voice, reply, heat, meanwhile, taste,
verdict, nod; o2 1.15 (.289) -- "Kein Problem!" to a hurry, ingredients fetched first, relief only when urgent; o3
1.00 (.297) -- check-in dialogue („Bist du bald fertig?“ -- „Gleich!“, antwortete sie, ohne den Blick vom Herd zu
wenden), seasoning, eggs cracked, serving on plates; o4 0.90 (.312, sentence penalty .165 -- the best) -- spices
only, one check-in; o5 1.17 (.267) -- setups paid off: the guests arrive (Da klingelte es an der Tür. Die Gäste
waren da.), the tasting finds what is missing (Die Suppe brauchte noch Salz. Sie gab Salz dazu. Sie probierte noch
einmal. -- Perfekt.), varied reactions; o6 1.06 (.170) -- the guests taste it, tools by kind of food (a fork for
meat), soups ladled; o7 1.17 (.189; 42/48 coherent) -- zwei Eier, serving by kind, the moment only with guests.
o8 0.94 (.184; 44/48 coherent) -- varied arcs: three openings (scene first, the request first, the time of day
first), complications (Heißes Fett spritzte auf ihre Hand. / Plötzlich roch es nach Rauch. Schnell nahm sie die
Pfanne vom Herd.), the other's impatience shown (trommelte mit den Fingern, sah auf die Uhr), endings (relief, or Sie
trocknete die Hände an ihrer Schürze und lächelte leise. -- after kneading, washing, spatter), noodles into a sieve,
the dough rests. Mixed bench 29 (all plots): 0.60 / .380 -- no regression. Kitchen: 4-13 of 48 stories rated 2,
none 3; o9 1.17 (.231) -- TEXTURE (world/texture.txt: what a dish is when done -- Bald waren die Nudeln weich. --
then on the noun: die weichen Nudeln), a hint of taste (Ein Hauch von Knoblauch. Perfekt.), a tiny portion tasted
(probierte eine winzige Portion). Nine kitchen rounds within 0.90-1.17 (critic noise +-0.15): this design's
ceiling, while the penalty fell from .315 to about .15-.23. What the critics still name: every kitchen story
on one skeleton, the guests announced and never arriving, stock beats (nickte zufrieden, atmete tief aus).

LOOP STOPPED 2026-10-10 after bench 28: ten rounds (19-28) within the critics' own noise (0.52-0.67) -- the plateau
of this design. Further gains need: the missing concrete words (user's decision), more plot frames than want/
trouble/help (and order, favor), cleaner situation data (each new batch first lowers quality: 26), and pronouns
across same-gender people.
(richness: the critic's 0-3 per story, mean of 48; bench 23 measured the critics' own noise: the same 48 stories
scored 0.52 and 0.67, penalty 0.310 and 0.339 -- a round moves +-0.15 richness by the critics alone; benches 19-23
sit on a plateau around 0.56, against 0.29-0.35 before the procedures. Stories told with a
procedure score about twice the others: 0.53 vs 0.28 at bench 20; 43 of 48 have one at bench 21.)

## Why this can cover the whole vocabulary

Nothing in the narrator is about a particular setting: every setting with a room, a person noun, a few things and
some actions with conditions can tell stories, and the words come from the setting's members. What decides coverage
is DATA:
- members of each setting (all 7451 nouns and verbs placed already),
- conditions: which actions have needs and gives (316 verbs now) -- the more, the more NEED/ACT/NEXT/MEND choices,
- object states and the verbs that mend them (A:kaputt -> reparieren; A:schmutzig -> putzen ...),
- valence (1062 words) for feelings, comments and consistency.
Growing the conditions per setting (helpers, as the scenes were built) widens the stories without code.

## How it is improved

The same loop as the sentences: a fixed STORY BENCHMARK (48 stories, seeds 301-306 x 8), a story critic
(scratchpad rounds/STORY-CRITIC.md: each sentence 0/1/2 in context with W/L/R tags, each story's coherence 0/1/2),
STORY PENALTY = sentence penalty + coherence / 2; the critic's notes and the per-MOVE OK rates (each sentence carries
its move) show which move or which data is weakest.

## Review: what to try (kept current; architecture reviews by a separate agent, 2026-10-09)

Done from the first review: situations, plots, dialogue (ASK, THANK). From the second (after bench 5):
- MOVES AS DATA: each move's ways of telling as blocks in the tests.txt format with $slots and @word lists, needs and
  effects in the condition atoms; alternatives by weight; joins as data (JOIN WANT BLOCK : 1 , @story.against 2 .);
  a story GRAMMAR by role (OPEN EPISODE CLOSE; EPISODE: GOAL OBSTACLE MEND DONE | GOAL LACK FETCH DONE | LOSE SEARCH
  FIND | VISIT TOGETHER | GIFT REACT | CAUSE TURN MEND; MEND: SELF | HELP THANK? | ASK HELP | ASK REFUSE CALL HELP;
  CLOSE: RESULT | COMMENT | PLAN); story.js an interpreter over a fact store (known, own, here, states, has).
- DERIVE, don't declare: troubles from affordances + conditions (reparieren needs A:kaputt, its frame's subjects
  are the menders), lacks from needs has:X + a SOURCE file (Supermarkt : food drink), OBJSTATE `become` (kaputt:
  kaputtgehen) -- situations keep place / people / things / own / want; explicit troubles only as overrides.
- COVERAGE moves from setting members, capped and measured: DESCRIBE (Die Küche war klein und hell), POSITION (Auf
  dem Tisch stand eine Vase; stehen/liegen/hängen by category), MEANWHILE (ihr Bruder las die Zeitung).
- metrics beside the penalty: words some move can reach (scenes.py --gaps), distinct lemmas per FREQ band over 2000
  stories, distinct episode shapes; per-move OK rates.
- episodes chained by conditions (arbeiten gives müde -> sich ausruhen).
