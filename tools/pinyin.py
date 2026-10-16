#!/usr/bin/env python3
"""PINYIN -> IPA WITH TONE DIGITS (zh/README.md, ../lang-data/IPA-GUIDE.md "Chinese"): the Chinese dictionary writes a
word's pinyin (xuéshēng); the compiler says it in the engine's IPA, each syllable followed by its tone (1 2 3 4, 5 the
neutral tone): ɕɥɛ2ʂɤŋ1. The syllables of a word are written together; a space separates the words of a phrase; an
apostrophe parts syllables where the spelling would be read otherwise (Xī'ān). A final r (huār, diǎnr) is erhua: ɹ.

A final is ONE syllable's worth of sound for the engine (speak.js counts a vowel as a syllable): the medial i u ü before
another vowel is a glide (j w ɥ: ia -> ja, uo -> wo, üe -> ɥɛ), the off-glide of ai ei ao ou a diphthong symbol (aɪ eɪ
aʊ oʊ), so that iao is jaʊ -- one syllable --, not three vowels in a row.

    to_ipa("xuéshēng") -> "ɕɥɛ2ʂɤŋ1"      syllables("xuéshēng") -> [("x", "üe", 2, False), ("sh", "eng", 1, False)]
"""
import unicodedata

TONE_MARKS = {"̄": 1, "́": 2, "̌": 3, "̀": 4}   # macron, acute, caron, grave
INITIALS = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l", "g", "k", "h", "j", "q", "x", "r", "z", "c", "s"]
INITIAL_IPA = {"b": "p", "p": "pʰ", "m": "m", "f": "f", "d": "t", "t": "tʰ", "n": "n", "l": "l", "g": "k", "k": "kʰ", "h": "x",
               "j": "tɕ", "q": "tɕʰ", "x": "ɕ", "zh": "tʂ", "ch": "tʂʰ", "sh": "ʂ", "r": "ɻ", "z": "ts", "c": "tsʰ", "s": "s", "": ""}
# the finals as spelled after an initial, and their IPA (o after an initial -- bo po mo fo -- is wo: to_ipa)
FINALS = {"a": "a", "o": "o", "e": "ɤ", "ê": "ɛ", "i": "i", "u": "u", "ü": "y", "ai": "aɪ", "ei": "eɪ", "ao": "aʊ", "ou": "oʊ", "an": "an",
          "en": "ən", "ang": "aŋ", "eng": "ɤŋ", "ong": "ʊŋ", "er": "ɐɹ", "ia": "ja", "ie": "jɛ", "iao": "jaʊ", "iu": "joʊ", "ian": "jɛn",
          "in": "in", "iang": "jaŋ", "ing": "iŋ", "iong": "jʊŋ", "ua": "wa", "uo": "wo", "uai": "waɪ", "ui": "weɪ", "uan": "wan",
          "un": "wən", "uang": "waŋ", "ueng": "wɤŋ", "üe": "ɥɛ", "üan": "ɥɛn", "ün": "yn"}
# the finals with no initial, as pinyin spells them (yi, wu, yu ...) -> the final they are
ZERO = {"a": "a", "o": "o", "e": "e", "ê": "ê", "ai": "ai", "ei": "ei", "ao": "ao", "ou": "ou", "an": "an", "en": "en", "ang": "ang", "eng": "eng",
        "er": "er", "yi": "i", "ya": "ia", "ye": "ie", "yao": "iao", "you": "iu", "yan": "ian", "yin": "in", "yang": "iang", "ying": "ing",
        "yong": "iong", "wu": "u", "wa": "ua", "wo": "uo", "wai": "uai", "wei": "ui", "wan": "uan", "wen": "un", "wang": "uang", "weng": "ueng",
        "yu": "ü", "yue": "üe", "yuan": "üan", "yun": "ün"}
APICAL = {"z", "c", "s", "zh", "ch", "sh", "r"}       # i -> ɨ after these
PALATAL = {"j", "q", "x"}                              # u written for ü after these
VOWELS = tuple("aeiouü")                               # (a syllable never begins with a vowel letter but after an apostrophe)


def _plain(s):
    """the tone marks taken off: (letters, the tone or None)"""
    tone, out = None, ""
    for ch in unicodedata.normalize("NFD", s):
        if ch in TONE_MARKS: tone = TONE_MARKS[ch]
        else: out += ch
    return unicodedata.normalize("NFC", out), tone


def _finals(ini):
    """the finals that may follow an initial, as spelled: (spelling, final)"""
    if not ini: return list(ZERO.items())
    if ini in PALATAL: return [(f.replace("ü", "u"), f) for f in FINALS if "ü" in f] + [(f, f) for f in FINALS if "u" not in f or f == "iu"]   # (ju qu xu: ü)
    return [(f, f) for f in FINALS]


def syllables(pinyin):
    """[(initial, final, tone 1..5, erhua)] with None between words -- raises ValueError on what is not pinyin"""
    out = []
    for word in pinyin.replace("v", "ü").split():
        for part in word.split("'"):
            s = part
            while s:
                plain = _plain(s)[0].lower()
                cands = sorted({(ini, sp, fin) for ini in INITIALS + [""] if plain.startswith(ini) for sp, fin in _finals(ini) if plain[len(ini):].startswith(sp)}, key=lambda x: -(len(x[0]) + len(x[1])))
                found = False
                for ini, sp, fin in cands:
                    n = len(ini) + len(sp)
                    k, taken = 0, 0                     # (as many marked characters as carry those letters)
                    while taken < n: taken += len(_plain(s[k])[0]); k += 1
                    tone = _plain(s[:k])[1] or 5
                    rest = s[k:]
                    er = rest[:1] == "r" and (len(rest) == 1 or _plain(rest[1])[0].lower() not in tuple("aeiouüy"))   # (erhua: an r no syllable can start with)
                    if er: rest = rest[1:]
                    if rest and _plain(rest[0])[0].lower() in VOWELS: continue   # (the next syllable may not begin with a vowel)
                    if ini in APICAL and fin == "i": fin = "ɨ"
                    out.append((ini, fin, tone, er)); s = rest; found = True
                    break
                if not found: raise ValueError(f"not pinyin: {part!r} at {s!r}")
        out.append(None)
    while out and out[-1] is None: out.pop()
    return out


def to_ipa(pinyin):
    parts = []
    for x in syllables(pinyin):
        if x is None: parts.append(" "); continue
        ini, fin, tone, er = x
        final = "ɨ" if fin == "ɨ" else "wo" if fin == "o" and ini else FINALS[fin]
        parts.append(INITIAL_IPA[ini] + final + ("ɹ" if er else "") + str(tone))
    return "".join(parts)


if __name__ == "__main__":
    import sys
    for w in sys.argv[1:] or ["xuéshēng", "nǐhǎo", "Xī'ān", "fāng'àn", "Jǐnán", "zhèr", "yīdiǎnr", "lǚyóu", "qù", "zǒu", "èr", "shì", "huā", "diànnǎo", "péngyou"]:
        print(w, to_ipa(w))
