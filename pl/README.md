# Polski — the Polish words of the concepts

Standard Polish, one word per line, in the same topic files as the concept index (`../concepts/<folder>/<file>.txt` ↔
`pl/<folder>/<file>.txt`). Every line names the CONCEPT it says -- its Slovak ID, exactly as the index writes it
(`../DESIGN.md`) -- after ` = `. A concept may have several Polish words (synonyms, told apart by FREQ, register,
valence); a word with two meanings has a line for each.

    # feelings
    1 N uczucie {uczucie} [uˈtʂutɕɛ], n, uczucia = pocit
    1 V czuć {czuć} [tʂutɕ], poczuć = cítiť
    1 V wracać {wracać} [ˈvratsatɕ], wrócić = vrátiť sa
    2 AN dumny {dumny} [ˈdumnɨ] (z + D) = hrdý

## A line

    [- ]FREQ POS POLISH = CONCEPT

- `- ` — a DERIVED word, in the family of the last line without one (*szczęśliwy* → `- szczęście`);
- `FREQ` — `1` the ~1,000 commonest everyday words, `2` common up to ~5,000, `3` the rest;
- `POS` — `N V AN AV PRE P CON ART NUM PAR INT PHR` (as German; Polish has no articles -- no ART lines);
- the Polish side: `word {parts} [ipa]`, then by POS (below), ending in its COMBINATIONS in parentheses if any: the
  case it governs (`(B)` accusative, `(D)` genitive, `(C)` dative, `(N)` instrumental, `(Ms)` locative), a preposition
  with its case (`(o + Ms)`, `(na + B)`), `(+ inf)`, `(że)`, `(żeby)`;
- ` = ` and the concept's ID (one; nothing after it).

`{parts}`: the word with `|` at a compound's joint or after a living prefix (`{samo|lot}`, `{pod|pisać}`); removing
every `|` gives the word back. `[ipa]`: as `../../lang-data/IPA-GUIDE.md` says for Polish -- the vowels `a ɛ i ɨ ɔ u`
only (e is always `ɛ`, o always `ɔ`), ę ą `ɛ̃ ɔ̃` before a fricative and at the end (a final ę usually `ɛ`), else the
vowel + the nasal of the following stop (`ɛn ɛm ɛŋ ɔn ɔm ɔŋ`); `w` for ł; `ʂ ʐ tʂ dʐ` for sz ż/rz cz dż; `ɕ ʑ tɕ dʑ` for
ś ź ć dź; `ɲ`; `x` for h/ch; `ʲ` on a labial before i (`pʲ bʲ mʲ vʲ fʲ`); final devoicing and assimilation; `r` the
trill; the stress mark `ˈ` on the penultimate syllable of every word of more than one syllable.

| POS | laid out | example |
|---|---|---|
| `N` | `WORD {…} […], GENDER, PLURAL[, ndm]` -- the gender `m` `ż` `n`, `lm` for a plural-only word; the nominative plural always written: `-` none (*mleko*), the word itself when it does not change; `ndm` an indeclinable word (kakao, menu, taxi). Animacy and personhood are not written: the world knows what is a person or an animal. | `1 N książka {książka} [ˈkɕɔ̃ʐka], ż, książki = kniha` · `1 N człowiek {człowiek} [ˈtʂwɔvʲɛk], m, ludzie = človek` · `1 N kakao {kakao} [kaˈkaɔ], n, -, ndm = kakao` |
| `V` | `IMPERFECTIVE {…} […], PERFECTIVE` -- the imperfective infinitive is the word, its perfective partner after the comma (`-` when the verb has none: być, wiedzieć, mieć, mieszkać; `dk` when the concept exists only as a perfective: ocknąć się). A reflexive verb with `się`. The forms the rules get wrong (iść: idę, szedł; brać: biorę) are in `pl/rules/irregular.txt`. | `1 V czytać {czytać} [ˈtʂɨtatɕ], przeczytać (B) = čítať` · `1 V iść {iść} [iɕtɕ], pójść = ísť (pešo)` · `1 V być {być} [bɨtɕ], - = byť` · `1 V myć się {myć się} [mɨtɕ ɕɛ], umyć się = umývať sa` |
| `AN` | `MASCULINE {…} […]`, then its COMPARATIVE only when irregular (lepszy, gorszy, większy, mniejszy, starszy, wyższy, dłuższy, bliższy, lżejszy) | `1 AN duży {duży} [ˈduʐɨ], większy = veľký` · `1 AN czerwony {czerwony} [tʂɛrˈvɔnɨ] = červený` |
| `PRE` `AV` `P` `CON` `NUM` `PAR` `INT` `PHR` | `word {…} […]` (a preposition with its case in parentheses) | `1 PRE w {w} [v] (B, Ms) = v` · `1 PHR do widzenia {do widzenia} [dɔ viˈdzɛɲa] = dovidenia` |

The trainer drills a concept in any pair of languages (Slovak included), and the Polish forms (cases, the verb's
persons and past, the aspect pair) in sentences. The concept index and the world: `../DESIGN.md`. Checked and
compiled by `python3 tools/words.py pl [--compile]`.

## Derived adverbs

An adjective concept of the index may declare its adverb (`AN dobrý : adverb dobre`, tools/concepts.py). This language
says the adverb concept by an explicit `AV` line where it has one; where it has none and the language has an adverb
rule (tools/adverbs.py: English -ly, German and Chinese the adjective itself, Spanish and Italian -mente), the
compile derives a line from every adjective word of the parent concept (shown as a derived word of the adjective's
family). `rules/adverbs.txt` silences the rule for an adjective whose derived word is wrong or means something else
(`hard = -`: hardly is not hard's adverb); French, Russian and Polish have no rule, their adverbs are all written.
