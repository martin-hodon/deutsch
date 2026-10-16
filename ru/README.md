# Русский — the Russian words of the concepts

Standard Russian (Moscow pronunciation, with the vowel reduction in the IPA), one word per line, in the same topic
files as the concept index (`../concepts/<folder>/<file>.txt` ↔ `ru/<folder>/<file>.txt`). Every line names the
CONCEPT it says -- its Slovak ID, exactly as the index writes it (`../DESIGN.md`) -- after ` = `. A concept may have
several Russian words (synonyms, told apart by FREQ, register, valence); a word with two meanings has a line for each.

    # feelings
    1 N чувство {чувство} [ˈtɕustvə], с, чувства = pocit
    1 V чувствовать {чувствовать} [ˈtɕustvəvətʲ], почувствовать (В) = cítiť
    1 V возвращаться {воз|вращаться} [vəzvrɐˈɕːatsə], вернуться = vrátiť sa
    2 AN гордый {гордый} [ˈɡordɨj] (Т) = hrdý

## A line

    [- ]FREQ POS RUSSIAN = CONCEPT

- `- ` — a DERIVED word, in the family of the last line without one (*счастливый* → `- счастье`);
- `FREQ` — `1` the ~1,000 commonest everyday words, `2` common up to ~5,000, `3` the rest;
- `POS` — `N V AN AV PRE P CON ART NUM PAR INT PHR` (as German; Russian has no articles -- no ART lines);
- the Russian side: `word {parts} [ipa]`, then by POS (below), ending in its COMBINATIONS in parentheses if any: the
  case it governs (`(В)` accusative, `(Д)`, `(Р)`, `(Т)`, `(П)`), a preposition with its case (`(о + П)`, `(на + В)`),
  `(+ inf)`, `(что)`, `(чтобы)`;
- ` = ` and the concept's ID (one; nothing after it).

`{parts}`: the word with `|` at a compound's joint or after a living prefix (`{само|лёт}`, `{под|писать}`); removing
every `|` gives the word back. The word is written WITHOUT a stress mark (the IPA carries the stress). `[ipa]`: as
`../../lang-data/IPA-GUIDE.md` says for Russian -- unstressed о/а `ɐ` right before the stress and at the word's start,
`ə` elsewhere; unstressed е/я `ɪ`; `ɨ` for ы and for и after ж ш ц; `ʲ` on every soft consonant; ж ш ц hard `ʐ ʂ ts`,
ч щ `tɕ ɕː`; final devoicing (`ɡorət`), voicing assimilation; `x` for х; `r` the trill (`rʲ` soft); `ˈ` before the
stressed syllable of every word of more than one syllable. ё is always stressed.

| POS | laid out | example |
|---|---|---|
| `N` | `WORD {…} […], GENDER, PLURAL[, нескл]` -- the gender `м` `ж` `с`, `мн` for a plural-only word; the nominative plural always written: `-` none (*молоко*), the word itself when it does not change; `нескл` an indeclinable word (кофе, метро, такси). Animacy is not written: the world knows what is a person or an animal. | `1 N книга {книга} [ˈknʲiɡə], ж, книги = kniha` · `1 N человек {человек} [tɕɪlɐˈvʲek], м, люди = človek` · `1 N кофе {кофе} [ˈkofʲɪ], м, -, нескл = káva` |
| `V` | `IMPERFECTIVE {…} […], PERFECTIVE` -- the imperfective infinitive is the word, its perfective partner after the comma (`-` when the verb has none: быть, знать, жить, стоить; `св` when the concept exists only as a perfective: очнуться). A reflexive verb with -ся / -сь. The forms the rules get wrong (идти: иду, шёл; писать: пишу) are in `ru/rules/irregular.txt`. | `1 V читать {читать} [tɕɪˈtatʲ], прочитать (В) = čítať` · `1 V идти {идти} [ɪˈtʲːi], пойти = ísť (pešo)` · `1 V быть {быть} [bɨtʲ], - = byť` |
| `AN` | `MASCULINE {…} […]`, then its COMPARATIVE only when irregular (больше, лучше, меньше, хуже, старше, выше, дешевле) | `1 AN большой {большой} [bɐlʲˈʂoj], больше = veľký` · `1 AN красный {красный} [ˈkrasnɨj] = červený` |
| `PRE` `AV` `P` `CON` `NUM` `PAR` `INT` `PHR` | `word {…} […]` (a preposition with its case in parentheses) | `1 PRE в {в} [v] (В, П) = v` · `1 PHR до свидания {до свидания} [də svʲɪˈdanʲɪjə] = dovidenia` |

The trainer drills a concept in any pair of languages (Slovak included), and the Russian forms (cases, the verb's
persons and past, the aspect pair) in sentences. The concept index and the world: `../DESIGN.md`. Checked and
compiled by `python3 tools/words.py ru [--compile]`.

## Derived adverbs

An adjective concept of the index may declare its adverb (`AN dobrý : adverb dobre`, tools/concepts.py). This language
says the adverb concept by an explicit `AV` line where it has one; where it has none and the language has an adverb
rule (tools/adverbs.py: English -ly, German and Chinese the adjective itself, Spanish and Italian -mente), the
compile derives a line from every adjective word of the parent concept (shown as a derived word of the adjective's
family). `rules/adverbs.txt` silences the rule for an adjective whose derived word is wrong or means something else
(`hard = -`: hardly is not hard's adverb); French, Russian and Polish have no rule, their adverbs are all written.
