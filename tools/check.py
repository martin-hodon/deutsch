#!/usr/bin/env python3
"""Check the German-Slovak database (deutsch/README.md): every line read as the app will read it.

    python3 tools/check.py [file ...]        # default: every .txt under deutsch/ (not tools/)

Prints each line that does not read, with why, then counts (by POS, by FREQ, families). Exit 1 if any line failed.
The parser here IS the reference reader: `parse_line` turns a line into a dict.
"""
import os, re, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
TOP = os.path.dirname(HERE)                # lang/: the engine, the world, a folder per language
ROOT = os.path.join(TOP, "de")             # the German dictionary (its topic folders)
WORLD = os.path.join(TOP, "world")         # the language-free world: categories, meanings, scenes, stories

POS = {"N", "V", "AN", "AV", "P", "PRE", "CON", "ART", "NUM", "PAR", "INT", "PHR"}
ARTICLES = {"der", "die", "das", "der/das", "der/die", "die/das", "der/die/das", "(das)"}
AUX = {"hat", "ist", "hat/ist"}
CASES = {"N", "A", "D", "G"}
PREP_CASES = {"A", "D", "G", "A/D", "D/G", "A/G"}

WORD = re.compile(r"^(?P<word>[^{}\[\]()=]+?) \{(?P<parts>[^{}]+)\} \[(?P<ipa>[^\[\]]+)\]$")


class Bad(Exception):
    pass


def split_word(s):
    """'word {parts} [ipa]' + ', rest' -> (word, parts, ipa, [rest items])"""
    m = re.match(r"^(?P<w>[^{}\[\]()=]+?) \{(?P<parts>[^{}]+)\} \[(?P<ipa>[^\[\]]+)\](?P<rest>.*)$", s)
    if not m:
        raise Bad("no `word {parts} [ipa]`")
    w, parts, ipa, rest = m["w"], m["parts"], m["ipa"], m["rest"]
    if parts.replace("|", "").replace("·", "") != w:
        raise Bad(f"parts {{{parts}}} do not spell {w!r}")
    nuclei = re.findall(r"[aeiouyæɛɪɔʊøœɐəʏ]", re.sub(r"aɪ|aʊ|ɔʏ|eɪ|oʊ|[aiyeøuoɛɔʊɪʏ]ːɐ|[aiyeøuoɛɔʊɪʏ]ɐ", "a", ipa))   # (a diphthong, a vowel and its vocalised r: one)
    if "ˈ" not in ipa and " " not in w and len(nuclei) > 1:
        raise Bad(f"[{ipa}] has no stress mark")
    items = []
    if rest:
        if not rest.startswith(", "):
            raise Bad(f"after the pronunciation: {rest!r} (expected `, …`)")
        items = rest[2:].split(", ")
    return w, parts, ipa, items


def parse_line(line):
    """one entry line -> dict (raises Bad)"""
    d = {"derived": False}
    s = line.rstrip("\n")
    if s != s.strip():
        raise Bad("spaces at the start or the end")
    if s.startswith("- "):
        d["derived"] = True; s = s[2:]
    tok = s.split(" ", 2)
    if len(tok) < 3:
        raise Bad("too short")
    freq, pos, rest = tok
    if freq not in {"1", "2", "3"}:
        raise Bad(f"FREQ {freq!r} (1, 2 or 3)")
    if pos not in POS:
        raise Bad(f"POS {pos!r}")
    d["freq"], d["pos"] = int(freq), pos
    if rest.count(" = ") != 1:
        raise Bad("needs exactly one ` = `")
    de, sk = rest.split(" = ")
    d["sk"] = sk.split(", ")
    if not sk or any(not t.strip() or t != t.strip() for t in d["sk"]):
        raise Bad("an empty Slovak translation")
    if ";" in sk or ";" in de:
        raise Bad("a `;` (not used)")
    if any(t.count("(") != t.count(")") for t in d["sk"]):   # (a note with a comma split in two: `hrať (na scéne, v ...)`)
        raise Bad("a Slovak translation with unbalanced parentheses (no `, ` inside them)")
    # the combinations: a final (...)
    d["comb"] = []
    m = re.match(r"^(.*\]|.*\], [^()]*) \((?P<c>[^()]+)\)$", de)
    if m:
        de = m.group(1)
        d["comb"] = m["c"].split(", ")
        for c in d["comb"]:
            words = c.split(" ")
            if not any(w in CASES for w in words) and not re.match(r"^(sich|haben|machen|sein|werden|lassen|geben|kommen|gehen|bringen|nehmen|halten|stellen|setzen|legen|tun|stehen|liegen|es)\b", c):
                raise Bad(f"combination {c!r} has no case (N A D G) and is no fixed word")
            for w in words:
                if len(w) == 1 and w.isupper() and w not in CASES:
                    raise Bad(f"combination {c!r}: case {w!r}")
    elif "(" in de.split("]")[-1]:
        raise Bad("parentheses that are not a final combination list")
    if pos == "N":
        m2 = re.match(r"^(der/die/das|der/das|der/die|die/das|der|die|das|\(das\)) (.+)$", de)
        if not m2:
            raise Bad("a noun begins with its article (der die das)")
        d["article"], de = m2.group(1), m2.group(2)
    w, parts, ipa, items = split_word(de)
    d.update(word=w, parts=parts, ipa=ipa)
    if pos == "N":
        if len(items) != 1:
            raise Bad("a noun has its plural (or `-`, `PL`) after the pronunciation, and only that")
        d["plural"] = items[0]
        if not w[0].isupper():
            raise Bad("a noun is capitalised")
        if items[0] not in ("-", "PL") and not items[0][0].isupper():
            raise Bad(f"plural {items[0]!r}")
    elif pos == "V":
        if not items or items[-1] not in AUX:
            raise Bad("a verb ends in its auxiliary (hat, ist, hat/ist)")
        d["aux"] = items[-1]
        if len(items) == 2:
            # the forms, and (an irregular verb's) their IPA: `spricht/sprach/gesprochen [ʃpʁɪçt/ʃpʁaːx/ɡəˈʃpʁɔxən]`
            m3 = re.match(r"^(.*?)(?: \[([^\[\]]+)\])?$", items[0])
            forms = m3.group(1).split("/")
            if len(forms) != 3 or not all(forms):
                raise Bad(f"verb forms {items[0]!r}: 3rd person/past/participle")
            d["forms"] = forms
            if m3.group(2) is not None:
                fi = m3.group(2).split("/")
                if len(fi) != 3 or not all(fi):
                    raise Bad(f"verb forms' IPA [{m3.group(2)}]: one for each of the three forms")
                for f, i in zip(forms, fi):
                    if f.count(" ") != i.count(" "):
                        raise Bad(f"the IPA {i!r} is not of the form {f!r} (a separable verb's prefix: its own word in both)")
                d["formsIpa"] = fi
        elif len(items) > 2:
            raise Bad("a verb has at most FORMS and AUX")
    elif pos == "AN":
        if len(items) == 1:
            cs = items[0].split("/")
            if len(cs) != 2 or not cs[1].startswith("am "):
                raise Bad(f"comparison {items[0]!r}: comparative/am superlative")
            d["comparison"] = cs
        elif items:
            raise Bad("an adjective has at most its comparison")
    elif pos == "PRE":
        if len(items) != 1 or items[0] not in PREP_CASES:
            raise Bad("a preposition has its case (A, D, G, A/D)")
        d["case"] = items[0]
    elif items:
        raise Bad(f"a {pos} has no grammar after the pronunciation")
    return d


LANG = os.path.join(os.path.dirname(TOP), "lang-data")
TOPICS = ["abstract", "natural-world", "life", "cognitive", "humans"]


def lang_owners():
    """a German word of ../lang/ -> the file it belongs to here (the first it appears in, in TOPICS order)"""
    own = {}
    for t in TOPICS:
        d = os.path.join(LANG, t)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            for line in open(os.path.join(d, f), encoding="utf-8"):
                p = line.strip().split(", ")
                if len(p) > 1 and not line.startswith("#"):
                    own.setdefault(re.sub(r" \{.*", "", p[1]), f"{t}/{f}")
    return own


def files(args):
    if args:
        return args
    out = []
    for dp, dn, fn in os.walk(ROOT):
        if os.path.relpath(dp, ROOT).split(os.sep)[0] in ("_staging", "rules") or dp == ROOT:   # (not dictionary lines: the staging, the rules, de/ui.txt)
            continue
        out += [os.path.join(dp, f) for f in fn if f.endswith(".txt")]
    return sorted(out)


def main():
    bad, seen, owners = 0, {}, lang_owners()
    # (what each file writes, by word and POS: another POS of the same spelling -- verlegen the verb beside verlegen
    #  the adjective -- is another word, not the owner's)
    owned_pos = {}
    for path in files(sys.argv[1:] if False else []):
        r = os.path.relpath(path, ROOT)
        for line in open(path, encoding="utf-8"):
            t = line.rstrip("\n")
            if t.strip() and not t.startswith(("#", "@ ")):
                try:
                    q = parse_line(t); owned_pos.setdefault(r, set()).add((q["word"], q["pos"]))
                except Bad:
                    pass
    by_pos, by_freq, n, fam = collections.Counter(), collections.Counter(), 0, 0
    for path in files(sys.argv[1:]):
        rel = os.path.relpath(path, ROOT)
        root = None
        for i, line in enumerate(open(path, encoding="utf-8"), 1):
            s = line.rstrip("\n")
            if not s.strip():
                continue
            if s.startswith("#"):
                root = None
                continue
            if s.startswith("@ "):         # (a staging file's target line: _staging/, merged by tools/merge.py)
                root = None
                continue
            try:
                d = parse_line(s)
                if d["derived"] and root is None:
                    raise Bad("a derived line with no root word before it")
                if not d["derived"]:
                    root = d; fam += 1
                # (one place a word: a word ../lang/ has belongs to the file of the same name it is in there)
                o = owners.get(d["word"])
                if o and o != rel and rel.split(os.sep)[0] in TOPICS and (d["word"], d["pos"]) in owned_pos.get(o, set()):
                    raise Bad(f"{d['word']!r} belongs to {o} (../lang/ lists it there)")
                key = (d["word"], d["pos"], d["sk"][0])
                if key in seen:
                    raise Bad(f"twice: also {seen[key]}")
                seen[key] = f"{rel}:{i}"
                n += 1; by_pos[d["pos"]] += 1; by_freq[d["freq"]] += 1
            except Bad as e:
                bad += 1
                print(f"{rel}:{i}: {e}\n    {s}")
    print(f"\n{n} entries in {fam} families; " + " ".join(f"{k} {v}" for k, v in sorted(by_pos.items(), key=lambda x: -x[1])))
    print("FREQ " + " ".join(f"{k}: {by_freq[k]}" for k in (1, 2, 3)) + (f"; {bad} lines FAILED" if bad else "; all lines read"))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
