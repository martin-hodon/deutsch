#!/usr/bin/env python3
"""THE CONCEPT INDEX (DESIGN.md): concepts/<folder>/<file>.txt, every concept once, named by its Slovak word.

    # feelings
    N cit
    N jazyk (orgán) -- v ústach
    V cítiť

A line: `POS ID` [` : Slovak grammar`] [` -- note`]. The ID is a Slovak dictionary form, with a short gloss in
parentheses only where one Slovak word has two senses -- then EVERY sense is glossed (never `jazyk` beside
`jazyk (reč)`). A concept is `POS ID`: `N jazyk (orgán)`.

An adjective's grammar may DECLARE ITS ADVERB: `AN dobrý : adverb dobre` makes the concept `AV dobre` (no line of its
own; `read()` lists it with "of": ("AN", "dobrý")), which each language says by an explicit line or by its adverb rule
(tools/adverbs.py). An adverb concept that has its own line is only linked to the adjective.

LANGUAGE-SPECIFIC CLOSED WORDS (的, 了, doch, dont, же, by ...) have no Slovak word: their concept is a short Slovak
description of the function, in the `# language-specific closed words` block at the end of the grammar files
(`PAR častica prívlastku (的)`, `PAR opytovacia častica`, `P ktorého (vzťažné zámeno)`); one concept per function, shared
by every language that has such a word (ли and 吗 both say `opytovacia častica`).

    python3 tools/concepts.py          # the index, and every language's dictionary against it
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check

INDEX = os.path.join(check.TOP, "concepts")
LANGS = ("de", "en", "es", "fr", "it", "pl", "ru", "zh")
POSES = {"N", "V", "AN", "AV", "PRE", "P", "CON", "ART", "NUM", "PAR", "INT", "PHR"}
LINE = re.compile(r"^(\S+) (.+?)(?: : ([^-]*?))?(?: -- (.*))?$")
ID = re.compile(r"[^\s,=/:;()]+(?: [^\s,=/:;()]+)*(?: \([^,=/:;()]+\))?")

_INDEX = None


def read():
    """(pos, id) -> {"file", "section", "grammar", "note", "line"}; raises SystemExit on a line it cannot read"""
    global _INDEX
    if _INDEX is None:
        _INDEX, errs = {}, []
        for dp, _, fs in sorted(os.walk(INDEX)):
            for f in sorted(fs):
                if not f.endswith(".txt"): continue
                p = os.path.join(dp, f); rel = os.path.relpath(p, INDEX); section = ""
                for n, s in enumerate(open(p, encoding="utf-8"), 1):
                    s = s.rstrip("\n")
                    if not s.strip(): continue
                    if s.startswith("#"): section = s[1:].strip(); continue
                    m = LINE.match(s)
                    if not m or m.group(1) not in POSES or not ID.fullmatch(m.group(2)):
                        errs.append(f"concepts/{rel}:{n}: cannot read {s!r}"); continue
                    k = (m.group(1), m.group(2))
                    if k in _INDEX: errs.append(f"concepts/{rel}:{n}: {k[0]} {k[1]} twice (also {_INDEX[k]['file']}:{_INDEX[k]['line']})"); continue
                    _INDEX[k] = {"file": rel, "section": section, "grammar": m.group(3) or "", "note": m.group(4) or "", "line": n}
        # the declared adverbs: a concept each, derived from its adjective
        for k, v in list(_INDEX.items()):
            m = re.fullmatch(r"adverb (\S+(?: \S+)*?)", v["grammar"].strip()) if v["grammar"] else None
            if not m: continue
            if k[0] != "AN": errs.append(f"concepts/{v['file']}:{v['line']}: only an adjective declares an adverb"); continue
            a = ("AV", m.group(1))
            if a in _INDEX: _INDEX[a].setdefault("of", k); continue
            _INDEX[a] = {"file": v["file"], "section": v["section"], "grammar": "", "note": "", "line": v["line"], "of": k}
        if errs: raise SystemExit("\n".join(errs))
    return _INDEX


def has(pos, cid):
    return (pos, cid.replace("_", " ")) in read()


def main():
    idx, bad = read(), 0
    # every sense glossed: no bare ID beside a glossed one of the same word
    for (pos, cid), v in sorted(idx.items()):
        if " (" in cid and (pos, cid.split(" (")[0]) in idx:
            print(f"concepts/{v['file']}:{v['line']}: {pos} {cid} beside a bare {cid.split(' (')[0]} -- gloss every sense"); bad += 1
    # each language's dictionary: its lines' first Slovak word is a concept of the index (the German one: check.py's reader)
    used = set()
    for f in check.files([]):
        for n, s in enumerate(open(f, encoding="utf-8"), 1):
            s = s.rstrip("\n")
            if not s.strip() or s.startswith("#"): continue
            try: d = check.parse_line(s)
            except check.Bad: continue
            k = (d["pos"], d["sk"][0])
            used.add(k)
            if k not in idx: print(f"de/{os.path.relpath(f, check.ROOT)}:{n}: {k[0]} {k[1]} is no concept"); bad += 1
    unused = {k for k in set(idx) - used if not ("of" in idx[k] and idx[k]["of"] in used)}   # (a derived adverb is said with its adjective)
    for k in sorted(unused)[:50]: print(f"concepts/{idx[k]['file']}:{idx[k]['line']}: {k[0]} {k[1]}: no German word")
    print(f"{len(idx)} concepts in {len({v['file'] for v in idx.values()})} files; German words cover {len(used & set(idx))}; {bad} problems")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
