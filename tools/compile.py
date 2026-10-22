#!/usr/bin/env python3
"""Compile every German dictionary file (de/README.md) into one machine file, de/dict.tsv -- and the world's files:

    python3 tools/compile.py

One line per entry, tab-separated, the first line the column names. Lists inside a field (translations,
combinations) are joined by ` | `; an empty field is empty. Lines are read by check.parse_line (the reference reader),
so a line check.py rejects stops the compile.

    category   folder/file of the entry (abstract/time) -- its topic
    root       the main word of its family (itself for a main line)
    derived    1 for a `- ` line, else 0
    freq pos article word plural ipa parts forms aux comparison case comb sk
    opposite   the concept's opposites as `POS id` (concepts/opposites.txt), ` | `-joined
    generic    the generic concept the entry's concept is declared `of`, `POS id @ context` (tools/concepts.py)
    section    the concept's place in the concepts' organization: group/topic/section (life/animals/mammals-wild)
    region     where the word is said when not everywhere: codes of de/rules/regional.txt (AT, CH, DE-S ...)
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check, concepts, offline, meaning, scenes, words

COLS = ["category", "root", "derived", "freq", "pos", "article", "word", "plural", "ipa", "parts",
        "forms", "aux", "comparison", "case", "comb", "sk", "formsIpa", "opposite", "generic", "section", "region"]


def main():
    rows, root, said, seen = [], None, set(), {}
    for path in check.files([]):
        cat = os.path.splitext(os.path.relpath(path, check.ROOT))[0].replace(os.sep, "/")
        for n, s in enumerate(open(path, encoding="utf-8"), 1):
            s = s.rstrip("\n")
            if not s.strip() or s.startswith("#"):
                continue
            try:
                d = check.parse_line(s)
            except check.Bad as e:
                raise SystemExit(f"{path}:{n}: {e}")
            if not d["derived"]:
                root = d["word"]
            d.update(category=cat, root=root, derived=int(d["derived"]),
                     forms="/".join(d.get("forms") or []), formsIpa="/".join(d.get("formsIpa") or []), comparison="/".join(d.get("comparison") or []),
                     comb=" | ".join(d["comb"]), sk=d["sk"][0], sks=" | ".join(d["sk"]))
            said.add((d["pos"], d["sk"])); seen[(d["word"], d["pos"], d["sk"])] = path
            rows.append(d)
    words.derive_adverbs("de", check.ROOT, concepts.read(), rows, said, seen, COLS)   # (the declared adverbs: gut the adjective says gut the adverb)
    words.mark_opposites(rows)   # (the opposite concepts: concepts/opposites.txt)
    words.mark_generic(rows)     # (the generic concept and context a concept is declared `of`)
    words.mark_section(rows)     # (the section of its concept's topic file: mammals-wild)
    bad = words.mark_region(rows, "de")   # (the regional words: de/rules/regional.txt)
    if bad: raise SystemExit("\n".join(bad))
    out = ["\t".join(COLS)] + ["\t".join(str({**d, "sk": d.get("sks") or d["sk"]}.get(c, "")) for c in COLS) for d in rows]   # (the sk column: all the Slovak meanings)
    dest = os.path.join(check.ROOT, "dict.tsv")
    open(dest, "w", encoding="utf-8").write("\n".join(out) + "\n")
    print(f"{len(out) - 1} entries -> {dest}")
    try: concepts.main()     # (the concept index, and the dictionary's words against it: tools/concepts.py)
    except SystemExit as e:
        if e.code: raise
    meaning.compile_all()   # (the sentence generator's meaning data, one file: tools/meaning.py)
    try: scenes.main()      # (its scenes: settings, members, conditions -> scenes.tsv)
    except SystemExit as e:
        if e.code: raise
    offline.main()   # (the offline package's list and version: what the trainer keeps -- tools/offline.py)


if __name__ == "__main__":
    main()
