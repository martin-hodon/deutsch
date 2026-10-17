#!/usr/bin/env python3
"""THE OFFLINE PACKAGE: offline.json -- every file the trainer needs, and a version (a hash of their contents). The service
worker (sw.js) keeps exactly these in the browser, and the trainer's Update compares this version with its own copy's.

    python3 tools/offline.py          (tools/compile.py runs it too: compile, then push)
"""
import glob, hashlib, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check

# what the trainer and the speech bench load (sw.js itself is the browser's to keep)
LANGS = ["de", "en", "es", "fr", "it", "pl", "ru", "zh"]   # (the languages the trainer drills: engine/langs.js)
PATTERNS = ["index.html", "trainer.html", "dictionary.html", "reading.html", "speak.html", "sentences.html", "engine/*.js", "engine/*.css", "world/*.txt", "world/*.tsv", "sk/ui.txt"] + \
    [f"{l}/{p}" for l in LANGS for p in ("*.js", "dict.tsv", "order.tsv", "ui.txt", "composition.txt", "rules/*.txt")]


def main():
    files = sorted({os.path.relpath(p, check.TOP) for pat in PATTERNS for p in glob.glob(os.path.join(check.TOP, pat))})
    h = hashlib.sha1()
    for f in files + ["sw.js"]:
        h.update(f.encode()); h.update(open(os.path.join(check.TOP, f), "rb").read())
    out = {"version": h.hexdigest()[:10], "made": time.strftime("%Y-%m-%d %H:%M"), "files": files + ["offline.json"]}
    open(os.path.join(check.TOP, "offline.json"), "w", encoding="utf-8").write(json.dumps(out, indent=1) + "\n")
    print(f"offline.json: version {out['version']}, {len(files)} files")


if __name__ == "__main__":
    main()
