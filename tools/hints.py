#!/usr/bin/env python3
"""What an entry is started from (deutsch/README.md): for each German word of a ../lang/ topic file -- its English
gloss, parts and IPA there, how often its forms occur in a German news corpus (count, and rank among all ../lang/
German words), and what ../../../../languages/deutsch (the Slovak-German lists) already says of it: Slovak, article,
plural (written out), verb forms.

    python3 tools/hints.py OUTDIR            # one hint file per topic file, and OUTDIR/ranks.txt
    CORPUS=.../deu_news_2022_1M-words.txt python3 tools/hints.py OUTDIR
"""
import os, re, sys, collections

HERE = os.path.dirname(os.path.abspath(__file__))
LANG = os.path.normpath(os.path.join(HERE, "..", "..", "lang-data"))
SKDE = os.path.normpath(os.path.join(HERE, "..", "..", "..", "..", "languages", "deutsch"))
# (the Leipzig corpus' word list: the 100K sentences beside the lists by default; CORPUS= the 1M one, extracted, counts better)
CORPUS = os.environ.get("CORPUS") or os.path.normpath(os.path.join(HERE, "..", "..", "..", "language", "deutsch", "deu_news_2022_100K", "deu_news_2022_100K-words.txt"))
TOPICS = ["abstract", "natural-world", "life", "cognitive", "humans"]
ART = {"r": "der", "e": "die", "s": "das"}
UML = {"a": "ä", "o": "ö", "u": "ü", "au": "äu", "A": "Ä", "O": "Ö", "U": "Ü"}


def plural_of(word, code):
    """'Farbton', 'ö-e' -> 'Farbtöne'; 'en' -> word+en; '-' -> '-'"""
    if code in ("-", ""):
        return "-"
    m = re.match(r"^(ä|ö|ü|äu)(?:-(.*))?$", code)
    if m:
        v, end = m.group(1), m.group(2) or ""
        src = {"ä": "a", "ö": "o", "ü": "u", "äu": "au"}[v]
        i = word.rfind(src)
        if src == "a":   # (au -> äu: the a of au takes the umlaut too)
            i = word.rfind("a")
        if i < 0:
            return word + end
        return word[:i] + v + word[i + len(src):] + end
    return word + code


def read_skde():
    """German (plain) -> [{sk, art, pl, forms}]"""
    out = collections.defaultdict(list)
    for dp, dn, fn in os.walk(SKDE):
        for f in fn:
            for line in open(os.path.join(dp, f), encoding="utf-8", errors="replace"):
                s = line.strip().lstrip("=").lstrip("-").strip()
                if ", " not in s or s.startswith("#"):
                    continue
                sk, de = s.split(", ", 1)
                for alt in de.split(" + "):
                    alt = alt.strip()
                    m = re.match(r"^(?:(r|e|s) )?([^\s/]+)(?:/(.*))?$", alt)
                    if not m:
                        continue
                    art, w, tail = m.group(1), m.group(2), m.group(3)
                    plain = w.replace("|", "")
                    e = {"sk": sk}
                    if art:
                        e["art"] = ART[art]
                        if tail is not None:
                            e["pl"] = plural_of(plain, tail)
                    elif tail and "/" in tail:
                        e["forms"] = tail
                    out[plain].append(e)
    return out


def read_corpus():
    c = collections.Counter()
    for line in open(CORPUS, encoding="utf-8", errors="replace"):
        p = line.rstrip("\n").split("\t")
        if len(p) == 3:
            c[p[1]] += int(p[2])
    return c


def forms_of(w):
    """the inflected forms worth counting for a word (a rough net: nouns, verbs, adjectives)"""
    f = {w}
    if w[:1].isupper():
        f |= {w + s for s in ("s", "es", "n", "en", "e", "er", "ern")}
    elif w.endswith(("en", "ern", "eln")) and " " not in w:
        st = w[:-2] if w.endswith("en") else w[:-1]
        f |= {st + s for s in ("e", "st", "t", "te", "ten", "test", "tet", "end")} | {"ge" + st + "t", w.capitalize()}
    else:
        f |= {w + s for s in ("e", "en", "er", "es", "em", "ere", "eren", "ste", "sten", "er")}
    return f


def main():
    out = sys.argv[1]
    skde, corpus = read_skde(), read_corpus()
    entries = []   # (topic file, section, english, german field)
    for t in TOPICS:
        for f in sorted(os.listdir(os.path.join(LANG, t))):
            sec = None
            for line in open(os.path.join(LANG, t, f), encoding="utf-8"):
                s = line.strip()
                if not s:
                    continue
                if s.startswith("#"):
                    sec = s[1:].strip(); continue
                fields = s.split(", ")
                if len(fields) < 2:
                    continue
                en = re.sub(r" \{.*", "", fields[0]); de = fields[1]
                entries.append((f"{t}/{f}", sec, en, de))
    counts = {}
    for _, _, _, de in entries:
        w = re.sub(r" \{.*", "", de)
        extra = set()
        for h in skde.get(w, []):
            if h.get("pl") and h["pl"] != "-": extra.add(h["pl"])
            if h.get("forms"): extra |= set(h["forms"].split("/"))
        counts[w] = sum(corpus[x] for x in forms_of(w) | extra)
    rank = {w: i + 1 for i, (w, _) in enumerate(sorted(counts.items(), key=lambda x: -x[1]))}
    # (ONE PLACE A WORD: a German word ../lang/ lists in several files belongs to the first, in TOPICS order)
    owner = {}
    for tf, _, _, de in entries:
        owner.setdefault(re.sub(r" \{.*", "", de), tf)
    by_file = collections.defaultdict(list)
    for tf, sec, en, de in entries:
        by_file[tf].append((sec, en, de))
    for tf, rows in by_file.items():
        os.makedirs(os.path.join(out, os.path.dirname(tf)), exist_ok=True)
        with open(os.path.join(out, tf), "w", encoding="utf-8") as fo:
            sec0 = None
            for sec, en, de in rows:
                if sec != sec0:
                    fo.write(f"\n# {sec}\n"); sec0 = sec
                w = re.sub(r" \{.*", "", de)
                hs = "; ".join(f"sk: {h['sk']}" + (f" | {h['art']}" if h.get("art") else "") + (f" pl {h['pl']}" if h.get("pl") else "") + (f" | forms {h['forms']}" if h.get("forms") else "") for h in skde.get(w, [])[:3])
                own = "" if owner[w] == tf else f"  ||  ELSEWHERE: belongs to {owner[w]}"
                fo.write(f"{de}  ||  en: {en}  ||  count {counts[w]} rank {rank[w]}" + (f"  ||  {hs}" if hs else "") + own + "\n")
    with open(os.path.join(out, "ranks.txt"), "w", encoding="utf-8") as fo:
        for w, r in sorted(rank.items(), key=lambda x: x[1]):
            fo.write(f"{r}\t{w}\t{counts[w]}\t{owner[w]}\n")
    print(f"{len(entries)} words in {len(by_file)} files; {sum(1 for _, _, _, de in entries if skde.get(re.sub(r' \{.*', '', de)))} with Slovak hints -> {out}")


if __name__ == "__main__":
    main()
