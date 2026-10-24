#!/usr/bin/env python3
"""THE OFFLINE PACKAGE: offline.json -- every file the trainer needs, and a version (a hash of their contents). The service
worker (sw.js) keeps exactly these in the browser, and the trainer's Update compares this version with its own copy's.

    python3 tools/offline.py          (tools/compile.py runs it too: compile, then push)
"""
import glob, hashlib, json, os, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check

# what the trainer and the speech bench load (sw.js itself is the browser's to keep)
LANGS = ["de", "en", "es", "fr", "it", "pl", "ru", "zh"]   # (the languages the trainer drills: engine/langs.js)
PATTERNS = ["index.html", "trainer.html", "dictionary.html", "reading.html", "speak.html", "sentences.html", "engine/*.js", "engine/*.css", "engine/listen.json", "engine/listen_net.json", "world/*.txt", "world/*.tsv", "sk/ui.txt", "concepts/labels.txt"] + \
    [f"{l}/{p}" for l in LANGS for p in ("*.js", "dict.tsv", "order.tsv", "ui.txt", "composition.txt", "chars.txt", "rules/*.txt")]


def main():
    files = sorted({os.path.relpath(p, check.TOP) for pat in PATTERNS for p in glob.glob(os.path.join(check.TOP, pat))})
    # every file of the package must be ONLINE: one that git ignores is never pushed, the site answers 404, and every
    # learner's update fails on it (engine/listen.json did, caught by `*/listen.json` meant for the languages' templates)
    ignored = subprocess.run(["git", "-C", check.TOP, "check-ignore", "--no-index", *files], capture_output=True, text=True).stdout.split()
    if ignored: raise SystemExit("offline.json: these are in the package but git ignores them -- fix .gitignore: " + ", ".join(ignored))
    tracked = set(subprocess.run(["git", "-C", check.TOP, "ls-files"], capture_output=True, text=True).stdout.split())
    new = [f for f in files if f not in tracked]
    if new: print("offline.json: not in git yet -- `git add` them before pushing, or every update fails on them: " + ", ".join(new))
    h = hashlib.sha1()
    for f in files + ["sw.js"]:
        h.update(f.encode()); h.update(open(os.path.join(check.TOP, f), "rb").read())
    out = {"version": h.hexdigest()[:10], "made": time.strftime("%Y-%m-%d %H:%M"), "files": files + ["offline.json"]}
    open(os.path.join(check.TOP, "offline.json"), "w", encoding="utf-8").write(json.dumps(out, indent=1) + "\n")
    print(f"offline.json: version {out['version']}, {len(files)} files")


if __name__ == "__main__":
    main()
