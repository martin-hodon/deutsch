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

A concept may be A GENERIC CONCEPT IN A CONTEXT: `V žrať : of jesť @ zvieratá` (žrať is jesť said of animals),
`N odlet : of odjazd @ lietanie`; the generic names its POS only when it differs (`of V ...`). `generics()` gives each
such concept its generic and the context; the dictionaries' `generic` column (tools/words.py) carries `POS id @ context`,
and the dictionary page shows a word's generic concept's words, and on the generic word the words of its contexts
(essen: fressen @ zvieratá). Several grammar items are separated by `; ` (`AN rýchly : adverb rýchlo; of ...`).

LANGUAGE-SPECIFIC CLOSED WORDS (的, 了, doch, dont, же, by ...) have no Slovak word: their concept is a short Slovak
description of the function, in the `# language-specific closed words` block at the end of the grammar files
(`PAR častica prívlastku (的)`, `PAR opytovacia častica`, `P ktorého (vzťažné zámeno)`); one concept per function, shared
by every language that has such a word (ли and 吗 both say `opytovacia častica`).

OPPOSITES: concepts/opposites.txt pairs concepts that are opposites, one unordered pair per line, usually both of one POS:
`AN chudobný <> bohatý`, `V kupovať <> predávať`, `N deň <> noc` -- the second side names its POS only when it differs
(`PAR áno <> AV nie`). `opposites()` gives each concept its opposites as `POS id`; the
adjectives' pairs carry over to their declared adverbs (dobre <> zle from dobrý <> zlý). The dictionaries' `opposite`
column (tools/words.py, tools/compile.py) lists them for the dictionary page.

    python3 tools/concepts.py          # the index, and every language's dictionary against it
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check

INDEX = os.path.join(check.TOP, "concepts")
OPPOSITES = os.path.join(INDEX, "opposites.txt")
LABELS = os.path.join(INDEX, "labels.txt")   # (the groups', topics', sections' names: the dictionary's filter -- not concepts)
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
                if p in (OPPOSITES, LABELS): continue   # (the relation file, the names: not concepts)
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
        # the grammar items (`; `-separated): the declared adverbs -- a concept each, derived from its adjective --, the generics
        for k, v in list(_INDEX.items()):
            for item in [x.strip() for x in v["grammar"].split(";") if x.strip()]:
                if not re.match(r"^(adverb|of) ", item): errs.append(f"concepts/{v['file']}:{v['line']}: cannot read the grammar {item!r}")
            g = re.search(r"(?:^|; )of (?:(" + "|".join(sorted(POSES, key=len, reverse=True)) + r") )?(.+?)(?: @ (.+?))?(?:;|$)", v["grammar"])
            if g:
                gk = (g.group(1) or k[0], g.group(2).strip())
                if gk == k: errs.append(f"concepts/{v['file']}:{v['line']}: {k[0]} {k[1]} of itself")
                v["generic"] = gk; v["context"] = (g.group(3) or "").strip()
        for k, v in list(_INDEX.items()):
            if "generic" in v and v["generic"] not in _INDEX: errs.append(f"concepts/{v['file']}:{v['line']}: the generic {v['generic'][0]} {v['generic'][1]} is no concept")
        for k, v in list(_INDEX.items()):
            m = re.search(r"(?:^|; )adverb (\S+(?: \S+)*?)(?:;|$)", v["grammar"]) if v["grammar"] else None
            if not m: continue
            if k[0] != "AN": errs.append(f"concepts/{v['file']}:{v['line']}: only an adjective declares an adverb"); continue
            a = ("AV", m.group(1))
            if a in _INDEX: _INDEX[a].setdefault("of", k); continue
            _INDEX[a] = {"file": v["file"], "section": v["section"], "grammar": "", "note": "", "line": v["line"], "of": k}
        if errs: raise SystemExit("\n".join(errs))
    return _INDEX


PAIR = re.compile(r"^(\S+) (.+?) <> (?:(" + "|".join(sorted(POSES, key=len, reverse=True)) + r") )?(.+?)(?: -- (.*))?$")   # (the second side's POS only when it differs: PAR áno <> AV nie)
_OPP = None


def opposites():
    """(pos, id) -> ["POS id" of an opposite, ...] from concepts/opposites.txt, the adverbs' derived from their adjectives'; raises SystemExit on a bad line"""
    global _OPP
    if _OPP is None:
        idx, out, errs, seen = read(), {}, [], set()
        adverb = {k: ("AV", m.group(1)) for k, v in idx.items() if (m := re.search(r"(?:^|; )adverb (.+?)(?:;|$)", v["grammar"]))}
        if os.path.exists(OPPOSITES):
            for n, s in enumerate(open(OPPOSITES, encoding="utf-8"), 1):
                s = s.rstrip("\n")
                if not s.strip() or s.startswith("#"): continue
                m = PAIR.match(s)
                if not m or m.group(1) not in POSES or (m.group(3) and m.group(3) not in POSES): errs.append(f"concepts/opposites.txt:{n}: cannot read {s!r}"); continue
                a, b = (m.group(1), m.group(2)), (m.group(3) or m.group(1), m.group(4))
                for k in (a, b):
                    if k not in idx: errs.append(f"concepts/opposites.txt:{n}: {k[0]} {k[1]} is no concept")
                if a == b: errs.append(f"concepts/opposites.txt:{n}: a concept against itself")
                if frozenset((a, b)) in seen: errs.append(f"concepts/opposites.txt:{n}: {a[1]} <> {b[1]} twice")
                seen.add(frozenset((a, b)))
                if a in idx and b in idx and a != b:
                    for x, y in ((a, b), (b, a)):   # (once -- the pair may already be there, derived from the adjectives: často <> zriedka)
                        if " ".join(y) not in out.setdefault(x, []): out[x].append(" ".join(y))
                    if a in adverb and b in adverb and adverb[a] in idx and adverb[b] in idx:   # (dobrý <> zlý: dobre <> zle)
                        for x, y in ((adverb[a], adverb[b]), (adverb[b], adverb[a])):
                            if " ".join(y) not in out.setdefault(x, []): out[x].append(" ".join(y))
        if errs: raise SystemExit("\n".join(errs))
        _OPP = out
    return _OPP


def generics():
    """(pos, id) -> ("POS id" of the generic concept, context) for every concept declared `of` one"""
    return {k: (" ".join(v["generic"]), v["context"]) for k, v in read().items() if "generic" in v}


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
    opp = opposites()
    print(f"{len(idx)} concepts in {len({v['file'] for v in idx.values()})} files; German words cover {len(used & set(idx))}; {sum(map(len, opp.values())) // 2} opposite pairs; {bad} problems")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
