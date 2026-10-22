# 中文 — the Chinese words of the concepts

Standard Mandarin in simplified characters, one word per line, in the same topic files as the concept index
(`../concepts/<folder>/<file>.txt` ↔ `zh/<folder>/<file>.txt`). Every line names the CONCEPT it says -- its Slovak ID,
exactly as the index writes it (`../DESIGN.md`) -- after ` = `. A concept may have several Chinese words (synonyms,
told apart by FREQ and register); a word with two meanings has a line for each.

    # feelings
    1 N 感觉 {感觉} [gǎnjué], 种 = pocit
    1 V 感觉 {感觉} [gǎnjué] = cítiť
    1 V 回来 {回来} [huílái] = vrátiť sa
    2 AN 骄傲 {骄傲} [jiāo'ào] = hrdý

## A line

    [- ]FREQ POS CHINESE = CONCEPT

- `- ` — a DERIVED word, in the family of the last line without one (*幸福* → `- 幸福感`);
- `FREQ` — `1` the ~1,000 commonest everyday words (about HSK 1-3), `2` common up to ~5,000 (HSK 4-6), `3` the rest;
- `POS` — `N V AN AV PRE P CON NUM PAR INT PHR` (as German; `AN` an adjective -- a stative verb --, `PRE` a
  preposition or coverb (在 从 给 跟 对), `PAR` a particle (了 吗 的 吧), no ART);
- the Chinese side: `word {word} [pinyin]`, then by POS (below), ending in its COMBINATIONS in parentheses if any
  (`(给)`, `(对)`, `(跟 ... 一起)`);
- ` = ` and the concept's ID (one; nothing after it).

`{parts}`: the word repeated; a `|` only at the joint of a SEPARABLE verb-object compound (`{睡|觉}` 睡觉, `{吃|饭}`,
`{见|面}`, `{唱|歌}`: 了 and a measure go between the parts -- 睡了一觉); removing the `|` gives the word back. The
brackets hold the PINYIN with tone marks (`shū`, `xuéshēng`, `péngyou`: the syllables of a word written together,
a neutral tone unmarked, an apostrophe only where the reading needs one -- `Xī'ān`, `nǚ'ér` --, ü written ü); the
compiler turns it into the engine's IPA with tone digits (`tools/pinyin.py`: ɕɥɛ2ʂɤŋ1 -- one vowel per syllable: the
medials as glides j w ɥ, ai ei ao ou as diphthongs aɪ eɪ aʊ oʊ). Citation tones: 不 `bù`, 一
`yī` (the engine says the sandhi); the neutral tone of 子 们 的 了 and of the second syllable of 朋友 东西 妈妈 unmarked.

| POS | laid out | example |
|---|---|---|
| `N` | `WORD {WORD} [pinyin], MEASURE` -- the measure word the noun is counted with (个 本 张 只 条 把 件 辆 杯 瓶 ...; `个` when no other is usual; `-` for a noun never counted: 水 天气) | `1 N 书 {书} [shū], 本 = kniha` · `1 N 水 {水} [shuǐ], - = voda` |
| `V` | `WORD {WORD} [pinyin]` (a separable compound with `\|` in the braces) | `1 V 吃饭 {吃\|饭} [chīfàn] = jesť` · `1 V 去 {去} [qù] = ísť (pešo)` |
| `AN` | `WORD {WORD} [pinyin]` | `1 AN 大 {大} [dà] = veľký` |
| `PRE` `AV` `P` `CON` `NUM` `PAR` `INT` `PHR` | `word {word} [pinyin]` | `1 PRE 在 {在} [zài] = v` · `1 PHR 对不起 {对不起} [duìbuqǐ] = prepáč` |

The trainer drills a concept in any pair of languages (Slovak included), the measure words, and the aspect particles
(了 过 着) in sentences. The concept index and the world: `../DESIGN.md`. Checked and compiled by `python3
tools/words.py zh [--compile]`.

## Derived adverbs

An adjective concept of the index may declare its adverb (`AN dobrý : adverb dobre`, tools/concepts.py). This language
says the adverb concept by an explicit `AV` line where it has one; where it has none and the language has an adverb
rule (tools/adverbs.py: English -ly, German and Chinese the adjective itself, Spanish and Italian -mente), the
compile derives a line from every adjective word of the parent concept (shown as a derived word of the adjective's
family). `rules/adverbs.txt` silences the rule for an adjective whose derived word is wrong or means something else
(`hard = -`: hardly is not hard's adverb); French, Russian and Polish have no rule, their adverbs are all written.

## Composition of characters (composition.txt)

`character:components` in the order they are written -- `的:白|勺`, `想:相/心`, `国:囗+玉` (`|` left to right, `/` top to
bottom, `+` one over or inside the other; a space groups). A part not broken up has its stroke count (`豕:7`, `⺀:2`), `?`
when unknown; the CJK stroke characters (㇐ ㇑ ㇒ ...) are strokes. engine/hanzi.js reads it for the dictionary: a
character's components and stroke count, every character a component is in, the index of components by strokes
(dictionary.html, 部件). Add a line for a character the dictionary has and the file lacks; keep its components characters
of the file (or radical forms with a count line of their own) so that the stroke count comes out.

## Meanings of characters (chars.txt)

A character that is no word of its own -- used only inside words (子 in 桌子, 意 in 意思) -- and a component that is no
character (氵 亻 丨 ⺀) get their meaning here, for the dictionary's character lists and component views:
`子 [zǐ] = dieťa, syn, semeno -- ako prípona podstatných mien bez tónu: 桌子` -- the reading with tone marks (none for a
component with no reading: `氵 = voda -- zložka: tvar znaku 水 na ľavej strane`), a line per reading that matters
(`乐 [lè]`, `乐 [yuè]`), the meanings in Slovak, a note after ` -- `. A character the dictionary has as a word takes its
meaning from its entries; add a line here for a new character of composition.txt that is no word.

## Regional words (rules/regional.txt)

Words not said everywhere Chinese is spoken -- Taiwan (`公升`), Hong Kong/Cantonese (`煲`), the north (`胡同`, `啥`), the
south (`晓得`): `POS word = CODES -- note` (../DESIGN.md "Regional words").

## Names (names.txt)

How international names are written in Chinese -- people, cities, dinosaurs, geologic periods, stars: `伦敦 [Lúndūn] =
Londýn -- note`. They are NOT concepts: the other languages keep the international form, only Chinese needs to know the
characters (a transliteration, a translation of the meaning, or an epithet; the note says which when it is not plain
transliteration). tools/words.py does not read the file; a name that becomes a word every language has (恐龙
dinosaurus) belongs in the concept index instead.
