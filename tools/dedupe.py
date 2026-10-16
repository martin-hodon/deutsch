#!/usr/bin/env python3
"""One place a word (deutsch/README.md): a word written twice with one part of speech -- two builders adding the
same derived word -- is kept once, its translations joined. Two senses of one spelling in ONE file (Bank: lavica /
banka, its translations disjoint) are not touched. Which copy stays: the one with derived words under it, else the
earlier file (the topics in ../lang's order, grammar/ last).

    python3 tools/dedupe.py          # rewrites the files in place, prints what it joined
"""
import os, sys, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check

ORDER = check.TOPICS + ["grammar"]
def rank(rel): return (ORDER.index(rel.split(os.sep)[0]) if rel.split(os.sep)[0] in ORDER else 99, rel)

lines, entries = {}, collections.defaultdict(list)
for path in check.files([]):
    rel = os.path.relpath(path, check.ROOT)
    L = open(path, encoding="utf-8").read().split("\n")
    lines[rel] = L
    for i, s in enumerate(L):
        if not s.strip() or s.startswith("#"):
            continue
        d = check.parse_line(s)
        kids = 0
        if not d["derived"]:
            j = i + 1
            while j < len(L) and L[j].startswith("- "): kids += 1; j += 1
        entries[(d["word"], d["pos"])].append({"rel": rel, "i": i, "d": d, "kids": kids})
drop = collections.defaultdict(set)
for (w, pos), es in entries.items():
    if len(es) < 2:
        continue
    files = {e["rel"] for e in es}
    if len(files) == 1 and all(not (set(a["d"]["sk"]) & set(b["d"]["sk"])) for a in es for b in es if a is not b):
        continue                                     # (two senses in one file)
    if pos == "N" and len({e["d"]["article"] for e in es}) > 1 and len(files) == 1:
        continue                                     # (der Erbe / das Erbe)
    es = sorted(es, key=lambda e: (-(e["kids"] > 0), rank(e["rel"]), e["i"]))
    keep, rest = es[0], es[1:]
    if any(r["kids"] for r in rest):
        print(f"  BOTH HAVE FAMILIES, by hand: {w} {pos}: " + ", ".join(f"{e['rel']}:{e['i'] + 1}" for e in es)); continue
    sk = list(keep["d"]["sk"])
    for r in rest:
        sk += [t for t in r["d"]["sk"] if t not in sk]
        drop[r["rel"]].add(r["i"])
    s = lines[keep["rel"]][keep["i"]]
    lines[keep["rel"]][keep["i"]] = s.split(" = ")[0] + " = " + ", ".join(sk)
    print(f"  {w} {pos}: kept {keep['rel']}:{keep['i'] + 1}, dropped " + ", ".join(f"{r['rel']}:{r['i'] + 1}" for r in rest))
for rel, L in lines.items():
    if drop[rel]:
        out = [s for i, s in enumerate(L) if i not in drop[rel]]
        open(os.path.join(check.ROOT, rel), "w", encoding="utf-8").write("\n".join(out))
