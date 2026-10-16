#!/usr/bin/env python3
"""A LANGUAGE'S DICTIONARY (<lang>/README.md): read every line as the app will, check it against the concept index, and
compile <lang>/dict.tsv. English, Spanish, French, Russian and Chinese lines share their shape -- `[- ]FREQ POS word
{parts} [ipa][, MORE] [(combinations)] = CONCEPT-ID` -- and differ in what a noun's word carries (an article), in MORE
(TAILS below), and in the brackets: Chinese writes its pinyin there, compiled to IPA with tone digits (tools/pinyin.py).

    python3 tools/words.py es            # check every es/<folder>/<file>.txt
    python3 tools/words.py es --compile  # ... and write es/dict.tsv          (tools/en.py: the same, for en)
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check, concepts, adverbs, pinyin

POSES = {"N", "V", "AN", "AV", "PRE", "P", "CON", "ART", "NUM", "PAR", "INT", "PHR"}
COLS = ["category", "root", "derived", "freq", "pos", "word", "article", "gender", "plural", "ipa", "parts", "forms", "comparison",
        "feminine", "model", "aux", "comb", "sk", "pinyin", "classifier"]
ARTICLES = {"en": None, "es": ("el", "la", "los", "las"), "fr": ("le", "la", "l'", "les"), "it": ("il", "lo", "la", "l'", "i", "gli", "le"), "ru": None, "pl": None, "zh": None}
ES_MODELS = {"e>ie", "o>ue", "e>i", "u>ue", "i>ie", "c>zc", "i>í", "u>ú", "irr"}
RU_GENDERS = {"м", "ж", "с", "мн"}
RU_VOWELS = "аеёиоуыэюя"
# the Slavic tails (ru, pl): the genders, the mark of an indeclinable noun, of a perfective-only verb
SLAVIC = {"ru": (RU_GENDERS, "нескл", "св", "м ж с мн"), "pl": ({"m", "ż", "n", "lm"}, "ndm", "dk", "m ż n lm")}
PL_VOWELS = "aeiouyąęó"
IPA_VOWELS = "aeiouyæɒɜɑʌɪʊəøœɛɔʏɐɨɤ"


class Bad(Exception):
    pass


def noun_word(lang, w, d):
    """a noun's article (es, fr) and gender: `la mano`, `el agua (f)`, `l'eau (f)`"""
    if not ARTICLES[lang]:
        return w
    m = re.match(r"^(los|las|les|gli|el|la|le|il|lo|i|l')(?: |(?<='))(.+?)(?: \((m|f)\))?$", w)
    if not m and re.match(r"^[^\s(]+(?: [^\s(]+)* \((m|f)\)$", w):      # (a word with no article: España (f), janvier (m))
        d["gender"] = w[-2]
        return w[:-4]
    if not m or m.group(1) not in ARTICLES[lang]:
        raise Bad(f"a noun is written with its article ({'/'.join(ARTICLES[lang])}): {w!r}")
    art, word, g = m.groups()
    if art in ("l'", "les") and not g:
        raise Bad("after l' / les the gender is written: (m) or (f)")
    d["article"], d["gender"] = art, g or {"el": "m", "los": "m", "le": "m", "la": "f", "las": "f", "il": "m", "lo": "m", "i": "m", "gli": "m"}[art]   # (it: le is feminine plural, la feminine)
    return word


def tails(lang, d, more):
    """what follows the IPA, by POS -- see each <lang>/README.md"""
    pos, items = d["pos"], [x.strip() for x in more.split(",")] if more else []
    if lang in SLAVIC:
        genders, indecl, pfonly, gnames = SLAVIC[lang]
        if pos == "N":
            if len(items) < 2 or items[0] not in genders or (len(items) == 3 and items[2] != indecl) or len(items) > 3:
                raise Bad(f"a noun's tail: GENDER ({gnames}), PLURAL (- none; the word itself when it is the same)[, {indecl}]")
            d["gender"], d["plural"] = items[0], items[1]
            if len(items) == 3: d["model"] = indecl
        elif pos == "V":
            if len(items) != 1 or (" " in items[0] and lang == "ru" and items[0] not in ("-", pfonly)): raise Bad(f"a verb's tail: its PERFECTIVE partner (- none, {pfonly} when the word itself is perfective only)")
            if items[0] == pfonly: d["model"] = pfonly
            elif items[0] != "-": d["forms"] = items[0]
        elif pos == "AN":
            if len(items) > 1: raise Bad("an adjective's tail: its irregular comparative only (больше, лучше; lepszy, większy), or nothing")
            d["comparison"] = items[0] if items else ""
        elif items: raise Bad(f"nothing after the IPA for {pos}: {more!r}")
        return
    if lang == "zh":
        if pos == "N":
            if len(items) != 1 or " " in items[0]: raise Bad("a Chinese noun's tail: its MEASURE WORD (个 本 张 ...; - for a noun never counted)")
            d["classifier"] = items[0] if items[0] != "-" else ""
        elif items: raise Bad(f"nothing after the brackets for {pos}: {more!r}")
        return
    if pos == "N":
        if len(items) != 1: raise Bad("a noun needs its plural (- none, PL plural-only), and nothing else")
        d["plural"] = items[0]
    elif pos == "V":
        if lang == "en":
            if items and (len(items) != 1 or items[0].count("/") != 1): raise Bad(f"a verb's irregular forms are PAST/PARTICIPLE, not {more!r}")
            d["forms"] = items[0] if items else ""
        for x in items if lang != "en" else []:
            if lang == "es" and x in ES_MODELS: d["model"] = x
            elif lang == "fr" and x == "irr": d["model"] = "irr"
            elif lang == "fr" and x == "être": d["aux"] = "être"
            elif lang == "it" and x in ("irr", "isc"): d["model"] = x
            elif lang == "it" and x == "essere": d["aux"] = "essere"
            elif re.fullmatch(r"[^\s/]+", x) and not d["forms"]: d["forms"] = x            # (an irregular participle: vuelto, fait, fatto)
            else: raise Bad(f"a verb's tail: {'a model ' + '/'.join(sorted(ES_MODELS)) if lang == 'es' else 'irr, être' if lang == 'fr' else 'isc, irr, essere'}, an irregular participle -- not {x!r}")
    elif pos == "AN":
        if lang == "en":
            if items and (len(items) != 1 or items[0].count("/") != 1): raise Bad(f"an adjective's comparison is COMPARATIVE/SUPERLATIVE, not {more!r}")
            d["comparison"] = items[0] if items else ""
        else:
            if len(items) > 2 or (len(items) == 2 and items[1].count("/") != 1): raise Bad(f"an adjective's tail: FEMININE[, MASC-PL/FEM-PL], not {more!r}")
            d["feminine"] = items[0] if items else ""
            d["comparison"] = items[1] if len(items) == 2 else ""      # (fr, it: its irregular plurals, beaux/belles, simpatici/simpatiche)
    elif items:
        raise Bad(f"nothing after the IPA for {pos}: {more!r}")


def parse_line(s, lang="en"):
    d = {"derived": s.startswith("- ")}
    if d["derived"]: s = s[2:]
    m = re.match(r"^([123]) (\S+) (.*)$", s)
    if not m: raise Bad("not `FREQ POS ...`")
    d["freq"], d["pos"], rest = int(m.group(1)), m.group(2), m.group(3)
    if d["pos"] not in POSES: raise Bad(f"no POS {d['pos']!r}")
    if rest.count(" = ") != 1: raise Bad("needs exactly one ` = `")
    word, d["sk"] = rest.split(" = ")
    d["sk"] = d["sk"].strip()
    d["comb"] = []
    m = re.match(r"^(.*\](?:, [^()]*)?) \(([^()]+)\)$", word)
    if m: word, d["comb"] = m.group(1), [x.strip() for x in m.group(2).split(",")]
    # (the combinations may also stand right after the IPA, before the tail: desire [..] (for), desires)
    m = re.match(r"^(.+?) \{([^}]*)\} \[([^\]]*)\](?: \(([^()]+)\))?(?:, (.*))?$", word)
    if not m: raise Bad("not `word {parts} [ipa]`")
    d["word"], d["parts"], d["ipa"], more = m.group(1), m.group(2), m.group(3), m.group(5)
    if m.group(4): d["comb"] = [x.strip() for x in m.group(4).split(",")] + d["comb"]
    for k in ("article", "gender", "plural", "forms", "comparison", "feminine", "model", "aux", "pinyin", "classifier"): d[k] = ""
    if d["pos"] == "N": d["word"] = noun_word(lang, d["word"], d)
    if d["parts"].replace("|", "").replace("·", " ") != d["word"]:   # (· is a phrasal verb's space: {give·up}; | a Chinese verb-object joint)
        raise Bad(f"parts {{{d['parts']}}} do not give the word {d['word']!r}")
    if lang == "zh":   # (the brackets hold the pinyin; the IPA is made of it)
        if re.search(r"[\u4e00-\u9fff]", d["ipa"]) or not d["ipa"]: raise Bad("the brackets hold the word's pinyin (xuéshēng)")
        try: d["pinyin"], d["ipa"] = d["ipa"], pinyin.to_ipa(d["ipa"])
        except ValueError as e: raise Bad(str(e))
        if not re.fullmatch(r"[\u4e00-\u9fff·…A-Za-z0-9 ]+", d["word"]): raise Bad(f"a Chinese word is written in characters: {d['word']!r}")
    elif not d["ipa"] or "ɹ" in d["ipa"]: raise Bad("IPA empty or with ɹ (write r)")
    if lang == "ru":
        if re.search(r"[A-Za-z]", d["word"]): raise Bad(f"a Russian word is written in Cyrillic: {d['word']!r}")
        if " " not in d["word"] and sum(ch in RU_VOWELS for ch in d["word"].lower()) > 1 and "ˈ" not in d["ipa"]: raise Bad(f"[{d['ipa']}] has no stress mark")
        if re.search(r"[аеёиоуыэюя]", d["ipa"]): raise Bad(f"[{d['ipa']}] is not IPA")
    if lang == "pl":
        if " " not in d["word"] and len(re.findall(r"i(?![aeouąęó])|[aeouyąęó]", d["word"].lower())) > 1 and "ˈ" not in d["ipa"]: raise Bad(f"[{d['ipa']}] has no stress mark")   # (an i before a vowel is no syllable: wciąż)
        if re.search(r"[ąęłńśźżćeo]", d["ipa"]): raise Bad(f"[{d['ipa']}] is not Polish IPA (ɛ ɔ, never e o; w for ł)")
    if lang == "it":
        w = d["word"].split(" ")[-1] if d["pos"] != "N" else d["word"]
        if " " not in d["word"] and sum(ch in "aeiouàèéìòóù" for ch in d["word"].lower()) > 1 and "ˈ" not in d["ipa"]: raise Bad(f"[{d['ipa']}] has no stress mark")
    tails(lang, d, more)
    return d


def files(lang):
    root = os.path.join(check.TOP, lang)
    return sorted(os.path.join(dp, f) for dp, _, fs in os.walk(root) for f in fs if f.endswith(".txt") and "/_" not in dp and "/rules" not in dp and dp != root)   # (the topic folders only: not ui.txt, not the rules)


def derive_adverbs(lang, root, idx, rows, said, seen, cols):
    """the declared adverb concepts (tools/adverbs.py) the language has no line for: a row after each word of the
    adjective, made by the language's rule -- unless <lang>/rules/adverbs.txt silences that adjective"""
    quiet = adverbs.silenced(os.path.join(root, "rules", "adverbs.txt"))
    for k, v in idx.items():
        if "of" not in v: continue
        for r in [r for r in rows if r["pos"] == "AN" and r["sk"] == v["of"][1]]:   # (every adjective word's, beside an explicit line: fast and quickly)
            a = None if r["word"] in quiet else adverbs.adverb(lang, r["word"], r["ipa"])
            if not a or (a[0], "AV", k[1]) in seen: continue
            seen[(a[0], "AV", k[1])] = "derived"
            rows.insert(rows.index(r) + 1, {**{c: "" for c in cols}, "category": r["category"], "root": r["root"], "derived": 1, "freq": r["freq"], "pos": "AV",
                                            "word": a[0], "parts": a[1], "ipa": a[2], "pinyin": r.get("pinyin", ""), "sk": k[1]})
            said.add(k)


def main(lang):
    root = os.path.join(check.TOP, lang)
    idx, bad, n, said, seen, rows = concepts.read(), 0, 0, set(), {}, []
    for f in files(lang):
        rel = os.path.relpath(f, root); cat = os.path.splitext(rel)[0]; family = None
        for i, s in enumerate(open(f, encoding="utf-8"), 1):
            s = s.rstrip("\n")
            if not s.strip() or s.startswith("#"): continue
            try: d = parse_line(s, lang)
            except Bad as e: print(f"{lang}/{rel}:{i}: {e}\n    {s}"); bad += 1; continue
            k = (d["pos"], d["sk"])
            if k not in idx: print(f"{lang}/{rel}:{i}: {d['pos']} {d['sk']} is no concept"); bad += 1
            dup = (d["word"], d["pos"], d["sk"])
            if dup in seen: print(f"{lang}/{rel}:{i}: {d['word']} {d['pos']} = {d['sk']} twice (also {seen[dup]})"); bad += 1
            seen[dup] = f"{rel}:{i}"; said.add(k); n += 1
            if not d["derived"]: family = d["word"]
            rows.append({**d, "category": cat, "root": family, "derived": int(d["derived"]), "comb": " | ".join(d["comb"])})
    derive_adverbs(lang, root, idx, rows, said, seen, COLS)
    missing = sorted(set(k for k in idx) - said)
    for k in missing[:30]: print(f"no {lang} word for {k[0]} {k[1]} (concepts/{idx[k]['file']})")
    print(f"{n} {lang} lines; {len(said)} of {len(idx)} concepts said; {len(missing)} without; {bad} problems")
    if "--compile" in sys.argv and not bad:
        open(os.path.join(root, "dict.tsv"), "w", encoding="utf-8").write("\t".join(COLS) + "\n" + "".join("\t".join(str(r.get(c, "")) for c in COLS) + "\n" for r in rows))
        print(f"{lang}/dict.tsv written")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main(sys.argv[1])
