# Français — the French words of the concepts

French of France, one word per line, in the same topic files as the concept index (`../concepts/<folder>/<file>.txt`
↔ `fr/<folder>/<file>.txt`). Every line names the CONCEPT it says -- its Slovak ID, exactly as the index writes it
(`../DESIGN.md`) -- after ` = `. A concept may have several French words (synonyms, told apart by FREQ, register,
valence); a word with two meanings has a line for each.

    # feelings
    1 N le sentiment {senti|ment} [sɑ̃tiˈmɑ̃], sentiments = pocit
    1 V sentir {sentir} [sɑ̃ˈtiʁ], irr, senti = cítiť
    1 V aller {aller} [aˈle], irr, être = ísť (pešo)
    2 AN fier {fier} [fjɛʁ], fière (de) = hrdý

## A line

    [- ]FREQ POS FRENCH = CONCEPT

- `- ` — a DERIVED word, in the family of the last line without one (*heureux* → `- bonheur`);
- `FREQ` — `1` the ~1,000 commonest everyday words, `2` common up to ~5,000, `3` the rest;
- `POS` — `N V AN AV PRE P CON ART NUM PAR INT PHR` (as German);
- the French side: `word {parts} [ipa]`, then by POS (below), ending in its COMBINATIONS in parentheses if any: what
  the word typically goes with -- a preposition (`(de)`, `(à, avec)`), `(qn)`, `(qch)`, `(de + inf)`, `(que + subj)`;
- ` = ` and the concept's ID (one; nothing after it).

`{parts}`: the word with `|` at a compound's joint or before a living suffix (`{senti|ment}`, `{dé|faire}`); removing
every `|` gives the word back (a noun's parts: without its article). `[ipa]`: standard French, in the IPA of
`../../lang-data/IPA-GUIDE.md` (`ʁ`, nasal vowels `ɑ̃ ɛ̃ ɔ̃ œ̃`, the stress mark on the last full syllable of a word of
two or more); a noun's IPA without its article.

| POS | laid out | example |
|---|---|---|
| `N` | `le/la/l'/les WORD {…} […], PLURAL` -- with its article; after `l'` and `les` the gender: `l'eau (f)`, `les gens (m)`; the plural always written: the same word when it does not change (*le bras …, bras*), `-` none, `PL` plural-only | `1 N l'eau (f) {eau} [o], eaux = voda` |
| `V` | `infinitive {…} […]`, then `irr` when not regular (-er like *parler*, -ir like *finir*; its forms in `fr/rules/irregular.txt`), its PARTICIPLE when irregular (*fait*, *pris*), `être` when the passé composé takes it; a reflexive verb with `se`/`s'` (`se lever`) | `1 V aller {aller} [aˈle], irr, être = ísť (pešo)` · `1 V parler {parler} [paʁˈle] = hovoriť` |
| `AN` | `masculine {…} […]`, then its FEMININE when it differs (*petit …, petite*; *rouge* nothing), then `MASC-PL/FEM-PL` when a plural is not the word + s | `1 AN beau {beau} [bo], belle, beaux/belles = pekný` |
| `PRE` `AV` `P` `CON` `ART` `NUM` `PAR` `INT` `PHR` | `word {…} […]` | `1 PHR de nouveau {de nouveau} [də nuˈvo] = znova` |

The trainer drills a concept in any pair of languages (Slovak included), and French irregular verbs. The concept index
and the world: `../DESIGN.md`. Checked and compiled by `python3 tools/words.py fr [--compile]`.

## Derived adverbs

An adjective concept of the index may declare its adverb (`AN dobrý : adverb dobre`, tools/concepts.py). This language
says the adverb concept by an explicit `AV` line where it has one; where it has none and the language has an adverb
rule (tools/adverbs.py: English -ly, German and Chinese the adjective itself, Spanish and Italian -mente), the
compile derives a line from every adjective word of the parent concept (shown as a derived word of the adjective's
family). `rules/adverbs.txt` silences the rule for an adjective whose derived word is wrong or means something else
(`hard = -`: hardly is not hard's adverb); French, Russian and Polish have no rule, their adverbs are all written.
