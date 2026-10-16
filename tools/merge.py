#!/usr/bin/env python3
"""Merge STAGING files into the database (deutsch/README.md): words added from outside a topic file's own build -- the
frequent words a corpus shows missing -- written as blocks, each a target line and the entry lines that go there:

    @ FILE # SECTION      the lines go at the end of that section of FILE (the section, or the file, made if new)
    @ FILE < ROOT         derived lines (`- `) that go at the end of the family of the main word ROOT in FILE

    python3 tools/merge.py _staging/a.txt [...]      # merges, prints what went where; nothing is written if a line fails

Every entry line is read by check.parse_line first. Then run tools/dedupe.py and tools/check.py.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check


def blocks(path):
    cur, out = None, []
    for n, s in enumerate(open(path, encoding="utf-8"), 1):
        s = s.rstrip("\n")
        if not s.strip():
            continue
        if s.startswith("@ "):
            t = s[2:]
            if " # " in t:
                f, sec = t.split(" # ", 1); cur = {"file": f.strip(), "section": sec.strip(), "lines": [], "at": f"{path}:{n}"}
            elif " < " in t:
                f, root = t.split(" < ", 1); cur = {"file": f.strip(), "root": root.strip(), "lines": [], "at": f"{path}:{n}"}
            else:
                raise SystemExit(f"{path}:{n}: a target line is `@ FILE # SECTION` or `@ FILE < ROOT`")
            out.append(cur)
            continue
        if s.startswith("#"):
            continue
        if cur is None:
            raise SystemExit(f"{path}:{n}: an entry before any target line")
        try:
            d = check.parse_line(s)
        except check.Bad as e:
            raise SystemExit(f"{path}:{n}: {e}\n    {s}")
        if "root" in cur and not d["derived"]:
            raise SystemExit(f"{path}:{n}: under a root (`<`) only derived lines go")
        cur["lines"].append(s)
    return out


def main():
    files, bs = {}, []
    for p in sys.argv[1:]:
        bs += blocks(p)
    def lines_of(rel):
        if rel not in files:
            full = os.path.join(check.ROOT, rel)
            files[rel] = open(full, encoding="utf-8").read().split("\n") if os.path.exists(full) else []
        return files[rel]
    placed, failed = 0, []
    for b in bs:
        L = lines_of(b["file"])
        if "section" in b:
            head = "# " + b["section"]
            if head not in L:
                if L and L[-1].strip(): L.append("")
                L += [head]
            i = L.index(head) + 1
            while i < len(L) and not L[i].startswith("# "): i += 1
            while i > 0 and not L[i - 1].strip(): i -= 1        # (before the blank lines that end the section)
            L[i:i] = b["lines"]
        else:
            idx = None
            for i, s in enumerate(L):
                if s.strip() and not s.startswith(("#", "- ")):
                    try:
                        if check.parse_line(s)["word"] == b["root"]: idx = i; break
                    except check.Bad:
                        pass
            if idx is None:
                failed.append(f"{b['at']}: no main word {b['root']!r} in {b['file']}"); continue
            j = idx + 1
            while j < len(L) and L[j].startswith("- "): j += 1
            L[j:j] = b["lines"]
        placed += len(b["lines"])
    for rel, L in files.items():
        full = os.path.join(check.ROOT, rel)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        open(full, "w", encoding="utf-8").write("\n".join(L).rstrip("\n") + "\n")
    print(f"{placed} lines merged into {len(files)} files")
    for f in failed:
        print("NOT PLACED:", f)


if __name__ == "__main__":
    main()
