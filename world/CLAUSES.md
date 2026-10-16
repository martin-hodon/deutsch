# The clause format: a sentence as the world says it

A sentence PLAN in text -- what the planner makes, what a story's moves, a procedure's steps, a weather's or a sound's
line say, what a language's tests are built from (`<lang>/rules/tests.txt`). Language-free: concepts (their Slovak
IDs), roles (`roles.txt`), relations (`relations.txt`), links -- no word order, no case, no article form. Each
language's realizer (`<lang>/realize.js`) says it.

    Weil sie Hunger hatte, schaltete Lisa den Herd ein.        (German; English: Because she was hungry, Lisa ...)
      S: 1 , 2 .
      1 SUB link=because verb=mať subj=3sg.f bare=none:hlad tense=past
      2 MAIN verb=zapnúť subj=name:Lisa patient=def:sporák tense=past

## A sentence: `S:` and its clauses

`S:` the clause ids in order, punctuation, quotes („ “), a dash (–), and the COORDINATORS between clauses: `and`,
`but`, `or`, `for` (it explains: denn), `either` ... `or`, `admittedly` ... `but` (zwar ... aber). A clause line:
`ID KIND key=value ...`; a value with spaces in "quotes"; a key may come more than once (`pp=`); a concept ID's
spaces are written `_` (`verb=tešiť_sa`, `patient=def:domáca_úloha`).

| KIND | the clause | German |
|---|---|---|
| `MAIN` | a statement (after a clause in front or a quote too: the language turns the order) | Er kommt. / ..., kommt er. |
| `YESNO` `WH` `IMP` | a question, a question with a question word (`wh=`), a command (`imp=2sg|2pl|formal`) | Kommt er? Wann kommt er? Komm! |
| `SUB` | a clause with its `link=`: because, although, if, if-unreal, when, when-past, before, after, as-soon-as, in-case, while, until, as-long-as, since, so-that, by-doing, with-result, without-that, instead-that, as-if, that, whether; the-more (je), the-more-so (desto) | weil, obwohl, wenn ... |
| `REL` | a relative clause (`relrole=`: subj, the head's role in it -- patient, recipient, a role with a preposition --, owner, where, what) | der Mann, den ich kenne |
| `WHOEVER` | a free relative: who does ..., (he) ... | Wer Hunger hat, (der) isst. |
| `INF` | an infinitive: as an object (its subject `ctrl=`), or with `link=purpose|without|instead` | zu kommen; um ... zu |
| `REP` | reported speech (after a verb of saying) | Er sagt, er sei krank. |
| `FRAG` | no verb: `np=` and its `pp=` | Ein Hauch von Salz. |

## A clause's parts

- `verb=` the verb concept; `modal=` a modal concept (môcť, musieť, chcieť, smieť, mať_(povinnosť) ...); `raise=`
  (zdať_sa: seems to); `inf=` a bare infinitive's verb (goes swimming, has it repaired)
- `subj=` and the ROLES of its frame: `patient=`, `second=`, `recipient=`, `theme=`, `topic=`, `cause=`, `basis=`,
  `purpose=`, `companion=`, `opponent=`, `instrument=`, `share=`, `result=`, `substitute=`, `location=`, `goal=`,
  `source=`, `path=`, `as=`, `bare=` (a noun with no article: hlad in *Hunger haben*), `pred=` (adj:X, a noun phrase,
  name:, age:, clock:), `clause=ID` (a that-/whether-/infinitive object)
- `fixed=` a word the verb's phrase carries in some language, as its concept (robiť + `fixed=ľúto`: es tut mir leid /
  I am sorry; byť + `fixed=dôležitý`: es ist wichtig / it is important; dať + `fixed=k_tomu`: gab dazu / added) --
  each language's frames say it (de/rules/frames.txt `={leid}`, en/rules/frames.txt `={ľúto}`), else it is an adverb
- `pp=RELATION:value` a free phrase (`pp=onto:def:stôl`, `pp=with:def:nôž`, `pp=into:def:kuchyňa`)
- `tense=` present past perfect pluperfect future future2; `mood=` hypo (if-unreal, a wish, polite) reported;
  `voice=` passive state (is opened); `neg=` yes | no-more | not-yet | not-at-all
- adverbs: `time=` `freq=` `manner=` `place=` `sentence=` `conn=` -- a concept (`time=dnes`), or a phrase:
  `on-day:pondelok`, `in-period:máj`, `at-hour:osem`, `date:3:máj`, `last:týždeň`, `next:rok`, `every:deň`,
  `since:dva:rok`, `ago:tri:deň`, `in-time:dva:týždeň`; `place=home` (zu Hause) or `place=RELATION:value`;
  `because-of=` `despite=` `during=` `instead-of=` (a noun phrase)
- `wh=` who whom what when where whence whither why how how-old how-late how-often, `which:NP`, `what-kind:NP`,
  `how-many:NP`, `ROLE:who|what` (with whom, about what)
- a language's own choices, prefixed by the language: `de.front=time` (what stands first), `de.part=doch_mal`
  (particles), `de.form=verb-first` (Hätte ich Zeit, ...) -- other languages ignore them

## A value

A PRONOUN: `1sg 2sg 3sg.m 3sg.f 3sg.n 1pl 2pl 3pl formal`, `one` (man), `someone`, `noone`, `something`, `nothing`,
`everything`, `this` (Das ist ...), `who`; a NAME `name:Anna`; or a NOUN PHRASE `det:noun+mod+mod`:

- det: `def indef none no` (kein), `poss.1sg` ... `poss.3pl`, `this` `every` `all` `some` `both` `many` `few`
  `several` `which`, `num.N` (a number concept: num.dva), `name.Peter` (Peters ...)
- mod: `pl`, `adj:X` (more than one: `adj:X+adj:Y`), `deg:X` (veľmi), `comp`, `sup`, `more` (no ... any more),
  `owner(NP)` (the father's car; a friend of mine), `rel(ID)`, `part(I,verb)` `part(II,verb[,by(NP)])`
  `part(zuI,verb)`, `pair(and|or|both-and|neither-nor|not-but|not-only-but-also,NP)`, `one` (this one plate),
  `of(NP)` (a pinch of salt), `post(...)`, `@verb` as the noun (das Lesen)
