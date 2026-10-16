# Italiano — the Italian words of the concepts

Standard Italian (the IPA with open/closed e and o, geminates, the stressed vowel long in an open syllable), one word
per line, in the same topic files as the concept index (`../concepts/<folder>/<file>.txt` ↔ `it/<folder>/<file>.txt`).
Every line names the CONCEPT it says -- its Slovak ID, exactly as the index writes it (`../DESIGN.md`) -- after ` = `.
A concept may have several Italian words (synonyms, told apart by FREQ, register, valence); a word with two meanings
has a line for each.

    # feelings
    1 N il sentimento {sentimento} [sentiˈmento], sentimenti = pocit
    1 V sentire {sentire} [senˈtiːre] = cítiť
    1 V tornare {tornare} [torˈnaːre], essere = vrátiť sa
    2 AN orgoglioso {orgoglioso} [orɡoʎˈʎoːzo], orgogliosa (di) = hrdý

## A line

    [- ]FREQ POS ITALIAN = CONCEPT

- `- ` — a DERIVED word, in the family of the last line without one (*felice* → `- felicità`);
- `FREQ` — `1` the ~1,000 commonest everyday words, `2` common up to ~5,000, `3` the rest;
- `POS` — `N V AN AV PRE P CON ART NUM PAR INT PHR` (as German);
- the Italian side: `word {parts} [ipa]`, then by POS (below), ending in its COMBINATIONS in parentheses if any: what
  the word typically goes with -- a preposition (`(di)`, `(a, con)`), `(a + inf)`, `(che + cong)`;
- ` = ` and the concept's ID (one; nothing after it).

`{parts}`: the word with `|` at a compound's joint or before a living suffix (`{felic|ità}`, `{ri|fare}`); removing
every `|` gives the word back (a noun's parts: without its article). `[ipa]`: as `../../lang-data/IPA-GUIDE.md` says
for Italian -- `ɛ ɔ` only in stressed syllables, a stressed vowel in an open non-final syllable long (`ˈkaːza`), a
double consonant with `ː` (`ˈɡatːo`; `ttʃ ddʒ tts ddz` for double affricates), `ʎ ɲ ʃ` long between vowels, `ts dz tʃ
dʒ`, `r` the trill, `z` for the voiced s (casa, rosa); the stress mark on every word of more than one syllable; a noun's
IPA without its article.

| POS | laid out | example |
|---|---|---|
| `N` | `il/lo/la/l'/i/gli/le WORD {…} […], PLURAL` -- with its article; after `l'` the gender: `l'acqua (f)`, `l'uomo (m)`; the plural always written: the same word when it does not change (*la città …, città*), `-` none (*il latte …, -*), `PL` plural-only (*i pantaloni …, PL*); a country or a name with no article: its gender -- `Roma (f)` | `1 N il libro {libro} [ˈliːbro], libri = kniha` · `1 N l'acqua (f) {acqua} [ˈakːwa], acque = voda` · `1 N lo studente {studente} [stuˈdɛnte], studenti = študent` |
| `V` | `infinitive {…} […]`, then `isc` for an -ire verb with -isc- (finisco), `irr` when not regular (its forms in `it/rules/irregular.txt`), its PARTICIPLE when irregular (*fatto*, *preso*), `essere` when the passato prossimo takes it; a reflexive verb with `-si` (`alzarsi`) | `1 V andare {andare} [anˈdaːre], irr, essere = ísť (pešo)` · `1 V finire {finire} [fiˈniːre], isc = skončiť` · `1 V parlare {parlare} [parˈlaːre] = hovoriť` · `1 V fare {fare} [ˈfaːre], irr, fatto = robiť` |
| `AN` | `masculine {…} […]`, then its FEMININE when it differs (*rosso …, rossa*; *verde* nothing), then `MASC-PL/FEM-PL` when the plural is not by the rule (-o → -i, -a → -e, -e → -i; -co/-go → -chi/-ghi): *amico … amici* is for nouns; adjectives: *lungo …, lunga, lunghi/lunghe* needs nothing, *simpatico …, simpatica, simpatici/simpatiche* does | `1 AN rosso {rosso} [ˈrosːo], rossa = červený` · `1 AN grande {grande} [ˈɡrande] = veľký` |
| `PRE` `AV` `P` `CON` `ART` `NUM` `PAR` `INT` `PHR` | `word {…} […]` | `1 PHR di nuovo {di nuovo} [di ˈnwɔːvo] = znova` |

The trainer drills a concept in any pair of languages (Slovak included), the articles, and the Italian forms (the
verb's persons and tenses, the plural, the agreement) in sentences. The concept index and the world: `../DESIGN.md`.
Checked and compiled by `python3 tools/words.py it [--compile]`.

## Derived adverbs

An adjective concept of the index may declare its adverb (`AN dobrý : adverb dobre`, tools/concepts.py). This language
says the adverb concept by an explicit `AV` line where it has one; where it has none and the language has an adverb
rule (tools/adverbs.py: English -ly, German and Chinese the adjective itself, Spanish and Italian -mente), the
compile derives a line from every adjective word of the parent concept (shown as a derived word of the adjective's
family). `rules/adverbs.txt` silences the rule for an adjective whose derived word is wrong or means something else
(`hard = -`: hardly is not hard's adverb); French, Russian and Polish have no rule, their adverbs are all written.
