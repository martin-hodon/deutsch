# English — the English words of the concepts

British English (spelling *colour*, *centre*, *realise*; pronunciation RP), one word per line, in the same topic files
as the concept index (`../concepts/<folder>/<file>.txt` ↔ `en/<folder>/<file>.txt`). Every line names the CONCEPT it
says -- its Slovak ID, exactly as the index writes it (`../DESIGN.md`) -- after ` = `. A concept may have several
English words (synonyms, told apart by their FREQ, register, valence); an English word with two meanings has a line
for each.

    # feelings
    1 N feeling {feel|ing} [ˈfiːlɪŋ], feelings = pocit
    1 V feel {feel} [fiːl], felt/felt = cítiť
    2 AN proud {proud} [praʊd] (of) = hrdý
    1 V give up {give·up} [ɡɪv ˈʌp], gave up/given up = vzdať sa

## A line

    [- ]FREQ POS ENGLISH = CONCEPT

- `- ` — a DERIVED word, in the family of the last line without one (as in German: *happy* → `- happiness`);
- `FREQ` — `1` the ~1,000 commonest everyday words, `2` common up to ~5,000, `3` the rest;
- `POS` — `N V AN AV PRE P CON ART NUM PAR INT PHR` (as German);
- the English side: `word {parts} [ipa]`, then by POS (below), ending in its COMBINATIONS in parentheses if any:
  what the word typically goes with -- a preposition (`(of)`, `(on, about)`), `(sb)`, `(sth)`, `(to do)`, `(-ing)`;
- ` = ` and the concept's ID (one; nothing after it).

`{parts}`: the word with `|` at a compound's joint or before a living suffix (`{sun|rise}`, `{feel|ing}`,
`{un|happy}`), `·` between a phrasal verb's verb and its particle (`{give·up}`, `{turn·off}`); removing every `|` and
`·` gives the word back. `[ipa]`: British RP, with the stress mark, in the IPA of `../../lang-data/IPA-GUIDE.md`
(`ɹ` is written `r`, the vowel of *bed* `e`; long vowels `iː uː ɑː ɔː ɜː`; diphthongs `eɪ aɪ ɔɪ əʊ aʊ ɪə eə ʊə`).

| POS | laid out | example |
|---|---|---|
| `N` | `word {…} […], PLURAL` -- the plural always written: the same word when it does not change (*sheep … , sheep*), `-` when it has none (*information … , -*), `PL` for a plural-only word (*scissors … , PL*) | `N child {child} [tʃaɪld], children` |
| `V` | `infinitive {…} […]`, then `, PAST/PARTICIPLE` only when IRREGULAR (`went/gone`, `put/put`); a phrasal verb with its particle (`give up`, past `gave up/given up`) | `V go {go} [ɡəʊ], went/gone` · `V walk {walk} [wɔːk]` |
| `AN` | `word {…} […]`, then `, COMPARATIVE/SUPERLATIVE` when irregular or written with more/most only where -er/-est would be wrong for a one-syllable word | `AN good {good} [ɡʊd], better/best` |
| `PRE` `AV` `P` `CON` `ART` `NUM` `PAR` `INT` `PHR` | `word {…} […]` | `PHR at home {at home} [ət ˈhəʊm]` |

The trainer drills a concept in any pair of languages (Slovak included); its words in a language are all the lines
with its ID. The concept index and the world: `../DESIGN.md`.

## Derived adverbs

An adjective concept of the index may declare its adverb (`AN dobrý : adverb dobre`, tools/concepts.py). This language
says the adverb concept by an explicit `AV` line where it has one; where it has none and the language has an adverb
rule (tools/adverbs.py: English -ly, German and Chinese the adjective itself, Spanish and Italian -mente), the
compile derives a line from every adjective word of the parent concept (shown as a derived word of the adjective's
family). `rules/adverbs.txt` silences the rule for an adjective whose derived word is wrong or means something else
(`hard = -`: hardly is not hard's adverb); French, Russian and Polish have no rule, their adverbs are all written.
