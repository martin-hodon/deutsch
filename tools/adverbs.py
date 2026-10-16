#!/usr/bin/env python3
"""DERIVED ADVERBS: an adjective concept of the index may declare its adverb -- `AN dobrý : adverb dobre` -- which
makes the concept `AV dobre` without an index line of its own (tools/concepts.py). A language says a derived adverb
either by an explicit dictionary line (`1 AV well {well} [wel] = dobre`) or, when it has none, by the RULE of this
module applied to each of its words for the adjective (good -> goodly? no: the rule is overridden by the explicit
line; happy -> happily, grande -> grandemente, groß -> groß, 大 -> 大). Languages whose adverb is not made by a rule
(French -ment on the feminine with its own sound, Russian, Polish) have no rule here: their lines are written.
A rule can be silenced for one adjective in <lang>/rules/adverbs.txt: `hard = -` (hardly means something else).

    adverb(lang, word, ipa) -> (word, parts, ipa) or None
"""
import re

VOWELS = "aeiouyáéíóúàèìòù"


def english(w, ipa):
    if w.endswith("ly") or w.endswith("ful") and False: return None
    if w.endswith("y") and len(w) > 2 and w[-2] not in VOWELS:            # happy -> happily
        return w[:-1] + "ily", w[:-1] + "i|ly", (ipa[:-1] if ipa[-1:] in "iɪ" else ipa) + "ɪli"
    if w.endswith("le") and w[-3] not in VOWELS:                           # simple -> simply, gentle -> gently
        return w[:-1] + "y", w[:-1] + "|y", re.sub(r"əl$|l$", "", ipa) + "li"
    if w.endswith("ic"): return w + "ally", w + "|ally", ipa + "əli"       # basic -> basically
    if w.endswith("ue"): return w[:-1] + "ly", w[:-1] + "|ly", ipa + "li"   # true -> truly
    if w.endswith("ll"): return w + "y", w + "|y", ipa + "i"               # full -> fully
    if ipa.endswith("l"): return w + "ly", w + "|ly", (ipa[:-1] if ipa.endswith("əl") else ipa[:-1] + "ə") + "li"   # formal -> ˈfɔːməli, beautiful -> ˈbjuːtɪfəli
    return w + "ly", w + "|ly", ipa + "li"


def spanish(w, ipa):
    if w.endswith("o"): return w[:-1] + "amente", w[:-1] + "a|mente", (ipa[:-1] if ipa.endswith("o") else ipa) + "aˌmente"   # (the adverb's main stress stays the adjective's: rápidamente)
    return w + "mente", w + "|mente", ipa + "ˌmente"


def italian(w, ipa):
    if w.endswith("o"): return w[:-1] + "amente", w[:-1] + "a|mente", (ipa[:-1] if ipa.endswith("o") else ipa) + "aˈmente"
    if re.search(r"[aeiou][lr]e$", w): return w[:-1] + "mente", w[:-1] + "|mente", (ipa[:-1] if ipa.endswith("e") else ipa) + "ˈmente"   # facile -> facilmente
    return w + "mente", w + "|mente", ipa + "ˈmente"


def same(w, ipa): return w, w, ipa          # German, Chinese: the adjective itself is the adverb


RULES = {"en": english, "de": same, "zh": same, "es": spanish, "it": italian}


def adverb(lang, word, ipa):
    """the adverb of a one-word adjective by the language's rule: (word, parts, ipa), or None"""
    rule = RULES.get(lang)
    if not rule or " " in word or not word: return None
    return rule(word, ipa)


def silenced(path):
    """<lang>/rules/adverbs.txt: the adjectives whose adverb the rule must not make (`hard = -`)"""
    try: lines = open(path, encoding="utf-8").read().split("\n")
    except FileNotFoundError: return set()
    return {s.split(" = ")[0].strip() for s in lines if " = -" in s and not s.startswith("#")}
