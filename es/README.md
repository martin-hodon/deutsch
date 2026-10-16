# Español — the Spanish words of the concepts

Spanish of Spain (Castilian: *vosotros*; IPA with `θ` for z/ce/ci), one word per line, in the same topic files as the
concept index (`../concepts/<folder>/<file>.txt` ↔ `es/<folder>/<file>.txt`). Every line names the CONCEPT it says --
its Slovak ID, exactly as the index writes it (`../DESIGN.md`) -- after ` = `. A concept may have several Spanish words
(synonyms, told apart by FREQ, register, valence); a word with two meanings has a line for each.

    # feelings
    1 N el sentimiento {sentimiento} [sentiˈmjento], sentimientos = pocit
    1 V sentir {sentir} [senˈtiɾ], e>ie = cítiť
    1 V volver {volver} [bolˈβeɾ], o>ue, vuelto (a + inf) = vrátiť sa
    2 AN orgulloso {orgulloso} [oɾɣuˈʎoso], orgullosa (de) = hrdý

## A line

    [- ]FREQ POS SPANISH = CONCEPT

- `- ` — a DERIVED word, in the family of the last line without one (*feliz* → `- felicidad`);
- `FREQ` — `1` the ~1,000 commonest everyday words, `2` common up to ~5,000, `3` the rest;
- `POS` — `N V AN AV PRE P CON ART NUM PAR INT PHR` (as German);
- the Spanish side: `word {parts} [ipa]`, then by POS (below), ending in its COMBINATIONS in parentheses if any: what
  the word typically goes with -- a preposition (`(de)`, `(en, con)`), `(a + inf)`, `(que + subj)`;
- ` = ` and the concept's ID (one; nothing after it).

`{parts}`: the word with `|` at a compound's joint or before a living suffix (`{felic|idad}`,
`{des|hacer}`); removing every `|` gives the word back (a noun's parts: without its article). `[ipa]`: Castilian, in
the IPA of `../../lang-data/IPA-GUIDE.md` (`β ð ɣ` between vowels, `ɾ` / `r`, `ʎ`, `x`, `θ`; the stress mark on every
word of more than one syllable); a noun's IPA without its article.

| POS | laid out | example |
|---|---|---|
| `N` | `el/la WORD {…} […], PLURAL` -- with its article (`los/las` for a plural-only word); a feminine noun with `el` says so: `el agua (f)`; the plural always written: the same word when it does not change (*la crisis …, crisis*), `-` none (*la salud …, -*), `PL` plural-only (*las gafas …, PL*); a country or a name with no article: its gender -- `España (f)` | `1 N la mano {mano} [ˈmano], manos = ruka (orgán)` |
| `V` | `infinitive {…} […]`, then its MODEL when not regular -- a stem change `e>ie` `o>ue` `e>i` `u>ue` `i>ie`, `c>zc` (conozco), an accent `i>í` `u>ú` (aíslo, continúo), or `irr` (ser, ir, tener: its forms in `es/rules/irregular.txt`) --, then its PARTICIPLE only when irregular; a reflexive verb with `-se` (`levantarse`) | `1 V volver {volver} [bolˈβeɾ], o>ue, vuelto = vrátiť sa` · `1 V hablar {hablar} [aˈβlaɾ] = hovoriť` |
| `AN` | `masculine {…} […]`, then its FEMININE when it differs (*rojo …, roja*; *verde* nothing) | `1 AN rojo {rojo} [ˈroxo], roja = červený` |
| `PRE` `AV` `P` `CON` `ART` `NUM` `PAR` `INT` `PHR` | `word {…} […]` | `1 PHR de nuevo {de nuevo} [de ˈnweβo] = znova` |

The trainer drills a concept in any pair of languages (Slovak included), and Spanish irregular verbs. The concept
index and the world: `../DESIGN.md`. Checked and compiled by `python3 tools/words.py es [--compile]`.

## Derived adverbs

An adjective concept of the index may declare its adverb (`AN dobrý : adverb dobre`, tools/concepts.py). This language
says the adverb concept by an explicit `AV` line where it has one; where it has none and the language has an adverb
rule (tools/adverbs.py: English -ly, German and Chinese the adjective itself, Spanish and Italian -mente), the
compile derives a line from every adjective word of the parent concept (shown as a derived word of the adjective's
family). `rules/adverbs.txt` silences the rule for an adjective whose derived word is wrong or means something else
(`hard = -`: hardly is not hard's adverb); French, Russian and Polish have no rule, their adverbs are all written.
