#!/usr/bin/env python3
"""Check and compile the sentence generator's SCENES (sentences/README.md): the settings graph and states
(sentences/settings.txt), the words of each setting (sentences/scenes/*.txt), the actions' conditions
(sentences/conditions.txt) -> scenes.tsv, which trainer/sentences.js reads.

    python3 tools/scenes.py            # check, report coverage (which nouns and verbs belong to no setting yet)
    python3 tools/scenes.py --missing  # ... and list them, by dictionary file
    python3 tools/scenes.py --check F  # check only these scene / condition files (writes nothing)

A member line: `POS word [= slovak] [: role]` -- the Slovak only where the dictionary has the word in several senses.
A condition line: `V word [= slovak] : needs atom atom ; gives atom atom [; involuntary]` -- an atom is a STATE of
settings.txt, A:x (an OBJSTATE of the object), has:A (the action's object), or has:Noun; involuntary: what happens to
one (husten, einschlafen) -- never against its need (not "hustet, obwohl er gesund ist").
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check, concepts, world

SENT = check.WORLD
CONTENT = {"N", "V"}
STATE_FLAGS = {"goal", "feeling", "default", "person", "wish"}   # (settings.txt: what a state is good for in a link)   # (the words a setting must claim; adjectives and adverbs belong to every setting)


def dictionary():
    """(pos, word) -> [first Slovak meaning of each sense], and each entry's file and FREQ"""
    senses, where = {}, {}
    for f in check.files([]):
        for s in open(f, encoding="utf-8"):
            s = s.rstrip("\n")
            if not s.strip() or s.startswith("#"): continue
            try: d = check.parse_line(s)
            except check.Bad: continue
            senses.setdefault((d["pos"], d["word"]), []).append(d["sk"][0])
            if d["pos"] == "N" and d.get("plural") not in (None, "", "-", "PL"): senses.setdefault(("N.pl", d["plural"]), []).append(d["word"])
            where[(d["pos"], d["word"], d["sk"][0])] = (os.path.relpath(f, check.ROOT), d["freq"])
    return senses, where


def settings(senses):
    has_verb = lambda w: concepts.has("V", w)
    sets, states, objstates, errs = {}, {}, {}, []
    for n, s in enumerate(open(os.path.join(SENT, "settings.txt"), encoding="utf-8"), 1):
        s = s.split("#")[0].strip() if s.lstrip().startswith("#") else s.strip()
        if not s: continue
        m = re.match(r"^SETTING (\S+)(?: : (\S+))?\s*(?:--\s*(.*))?$", s)
        if m:
            roles = re.search(r"\(roles: ([^)]*)\)", m.group(3) or "")
            sets[m.group(1)] = {"parent": m.group(2), "roles": roles.group(1).split() if roles else []}
            continue
        m = re.match(r"^STATE (\S+) : ([^;]*)((?: ; [^;]+)*)$", s)
        if m:
            forms = [f.strip().split(" ", 1) for f in m.group(2).split("|")]   # (adj ID | noun ID: concepts)
            for k, w in forms:
                if not concepts.has("AN" if k == "adj" else "N", w): errs.append(f"settings.txt:{n}: no concept {k} {w!r}")
            d = {"forms": forms, "opposite": None, "of": [], "flags": []}
            for part in m.group(3).split(" ; ")[1:]:
                k, _, v = part.strip().partition(" ")
                if k == "opposite": d["opposite"] = v.strip()
                elif k == "of": d["of"] = v.split()
                elif k in STATE_FLAGS and not v: d["flags"].append(k)
                elif k == "ends" and has_verb(v.strip()): d["flags"].append("ends=" + v.strip().replace(" ", "_"))   # (the action that ends it)
                else: errs.append(f"settings.txt:{n}: {part.strip()!r} (opposite x, of cats, ends verb, {', '.join(sorted(STATE_FLAGS))})")
            states[m.group(1)] = d
            continue
        m = re.match(r"^OBJSTATE (\S+)(?: ; opposite (\S+))?(?: ; become (.+?))?$", s)
        if m:
            objstates[m.group(1)] = {"opposite": m.group(2), "become": m.group(3)}
            if m.group(3) and m.group(3) != "werden" and not has_verb(m.group(3)): errs.append(f"settings.txt:{n}: no verb {m.group(3)!r}")
            continue
        errs.append(f"settings.txt:{n}: cannot read {s!r}")
    for name, d in sets.items():
        if d["parent"] and d["parent"] not in sets: errs.append(f"settings.txt: {name}'s parent {d['parent']} is no setting")
    return sets, states, objstates, errs


def identity(pos, cid, senses, at):
    """`ID` (a concept of the index) -> ID, or raises"""
    cid = cid.strip()
    if not concepts.has(pos, cid): raise ValueError(f"{at}: no concept {pos} {cid!r}")
    return cid


def listed(folder, only):
    """the .txt files of sentences/<folder> -- or only those named (--check)"""
    fs = [os.path.join(SENT, folder, f) for f in sorted(os.listdir(os.path.join(SENT, folder))) if f.endswith(".txt")]
    return [f for f in fs if not only or os.path.abspath(f) in only]


def members(sets, senses, only=None):
    out, errs = [], []
    for path in listed("scenes", only):
        f = os.path.basename(path)
        setting = None
        for n, s in enumerate(open(path, encoding="utf-8"), 1):
            s = s.strip()
            if not s or s.startswith("#"): continue
            at = f"scenes/{f}:{n}"
            if s.startswith("SETTING "):
                setting = s.split()[1]
                if setting not in sets: errs.append(f"{at}: no setting {setting} in settings.txt")
                continue
            m = re.match(r"^(N|V|AN|AV) (.+?)(?: : (\S+))?$", s)
            if not m: errs.append(f"{at}: cannot read {s!r}"); continue
            try: cid = identity(m.group(1), m.group(2), senses, at)
            except ValueError as e: errs.append(str(e)); continue
            role = m.group(3) or ""
            if role and role not in sets.get(setting, {}).get("roles", []): errs.append(f"{at}: {setting} has no role {role!r}")
            out.append((setting, m.group(1), cid, role))
    return out, errs


def conditions(states, objstates, senses, only=None):
    """conditions.txt and conditions/*.txt; a verb in several: its needs and gives together"""
    out, errs, seen = [], [], {}
    paths = [os.path.join(SENT, "conditions.txt")] + listed("conditions", None)
    if only: paths = [p for p in paths if os.path.abspath(p) in only]
    lines = [(f"{os.path.relpath(p, SENT)}:{n}", s.strip()) for p in paths for n, s in enumerate(open(p, encoding="utf-8"), 1)]
    for at, s in lines:
        if not s or s.startswith("#"): continue
        m = re.match(r"^(V) (.+?) : (.*)$", s)
        if not m: errs.append(f"{at}: cannot read {s!r}"); continue
        try: cid = identity("V", m.group(2), senses, at)
        except ValueError as e: errs.append(str(e)); continue
        parts, flags = {"needs": [], "gives": []}, []
        for part in m.group(3).split(";"):
            k, *atoms = part.split()
            if k == "involuntary" and not atoms: flags.append(k); continue
            if k not in parts: errs.append(f"{at}: {k!r} (needs, gives, involuntary)"); continue
            for a in atoms:
                ok = a in states or (a.startswith("A:") and a[2:] in objstates) or a == "has:A" or (a.startswith("has:") and concepts.has("N", a[4:]))
                if not ok: errs.append(f"{at}: atom {a!r} (a STATE, A:objstate, has:A, has:Noun)")
            parts[k] = atoms
        if cid in seen:   # (the same verb in two files: both)
            old = out[seen[cid]]
            out[seen[cid]] = (cid, " ".join(dict.fromkeys(old[1].split() + parts["needs"])), " ".join(dict.fromkeys(old[2].split() + parts["gives"])), " ".join(dict.fromkeys(old[3].split() + flags)))
        else:
            seen[cid] = len(out); out.append((cid, " ".join(parts["needs"]), " ".join(parts["gives"]), " ".join(flags)))
    return out, errs


VALENCE_KINDS = {"AN good": ("AN", 1), "AN bad": ("AN", -1), "N good": ("N", 1), "N bad": ("N", -1), "V good": ("V", 1),
                 "V bad": ("V", -1), "LIKE": ("V", "like"), "DISLIKE": ("V", "dislike"), "CARRY": ("V", "carry"), "AV good": ("AV", 1), "AV bad": ("AV", -1)}

def valence(senses):
    """sentences/valence.txt: `AN good : schön | hübsch`, `LIKE : sich freuen | lieben` -> rows (pos, word, value)"""
    out, errs, seen = [], [], {}
    path = os.path.join(SENT, "valence.txt")
    if not os.path.exists(path): return out, errs
    for n, s in enumerate(open(path, encoding="utf-8"), 1):
        s = s.strip()
        if not s or s.startswith("#"): continue
        kind, sep, rest = s.partition(" : ")
        if not sep or kind.strip() not in VALENCE_KINDS: errs.append(f"valence.txt:{n}: cannot read {s[:60]!r} ({', '.join(VALENCE_KINDS)})"); continue
        pos, val = VALENCE_KINDS[kind.strip()]
        for w in (x.strip() for x in rest.split("|")):
            if not w: continue
            if not concepts.has(pos, w): errs.append(f"valence.txt:{n}: no concept {pos} {w!r}"); continue
            key = (pos, w, val if isinstance(val, str) else "v")
            if key in seen: continue   # (two synonyms of one concept: once)
            seen[key] = n
            out.append((pos, w, str(val)))
    # (one word good AND bad: a contradiction)
    vals = {}
    for pos, w, v in out:
        if v in ("1", "-1"): vals.setdefault((pos, w), set()).add(v)
    errs += [f"valence.txt: {p} {w} is both good and bad" for (p, w), v in vals.items() if len(v) > 1]
    return out, errs


# the article of a wanted action's object: ein -> a new thing, den -> the one here, sein -> the doer's own
DETS = {**dict.fromkeys(("ein", "eine", "einen"), "indef"), **dict.fromkeys(("der", "die", "das", "den"), "def"),
        **dict.fromkeys(("sein", "seine", "seinen", "ihr", "ihre", "ihren"), "poss")}


def situations(sets, states, objstates, senses):
    """sentences/situations/*.txt: SITUATION blocks (sentences/STORIES.md) -> rows; every word checked"""
    out, errs = [], []
    has = lambda pos, w: concepts.has(pos, w)
    for path in listed("situations", None):
        f, cur = os.path.basename(path), None
        for n, raw in enumerate(open(path, encoding="utf-8"), 1):
            s = raw.split("#")[0].rstrip() if not raw.lstrip().startswith("#") else ""
            if not s.strip(): continue
            at = f"situations/{f}:{n}"
            m = re.match(r"^SITUATION (.+?) : (\S+)(?:\s*--\s*(.*))?$", s)
            if m:
                cur = m.group(1).strip()
                if m.group(2) not in sets: errs.append(f"{at}: no setting {m.group(2)}")
                out.append(("SIT", cur, m.group(2), m.group(3) or "")); continue
            m = re.match(r"^\s+(place|people|things|own|want|trouble|lack)\s+(.*)$", s)
            if not m or not cur: errs.append(f"{at}: cannot read {s.strip()!r}"); continue
            k, v = m.group(1), m.group(2).strip()
            if k in ("place", "things", "own", "people"):
                for w in (x.strip() for x in v.split("|")):
                    if not (k == "people" and w == "kin") and not has("N", w): errs.append(f"{at}: no noun {w!r}")
            elif k == "want":
                mm = re.match(r"^(\S+) : (.+?)(?: ; uses (.+))?$", v)
                if not mm: errs.append(f"{at}: want STATE : verb=x [patient=det:Object] ; uses Thing | Thing"); continue
                if mm.group(1) not in states: errs.append(f"{at}: no STATE {mm.group(1)}")
                # the action: verb=x, its object patient=det:obj[+pl][+adj:y] -- det none (Brot toasten), indef (ein Buch
                # lesen -- then: das Buch), def (den Tisch decken: the one here), poss (sein Gesicht waschen: her own)
                kv = dict(re.findall(r"([\w.]+)=(\S+)", mm.group(2)))
                verb, obj, det, num, adj = kv.get("verb", ""), None, "none", "", ""
                if kv.get("patient"):
                    head, *mods = kv["patient"].split("+")
                    det, obj = head.split(":", 1)
                    num = "pl" if "pl" in mods else "sg"
                    adj = next((m[4:] for m in mods if m.startswith("adj:")), "")
                    if det not in ("none", "indef", "def", "poss"): errs.append(f"{at}: patient {det}: none, indef, def or poss")
                if not has("V", verb): errs.append(f"{at}: no verb {verb!r}")
                if obj and not has("N", obj): errs.append(f"{at}: no noun {obj!r}")
                if adj and not has("AN", adj): errs.append(f"{at}: no adjective {adj!r}")
                uses = [x.strip() for x in (mm.group(3) or "").split("|") if x.strip()]
                for w in uses:
                    if not has("N", w): errs.append(f"{at}: no noun {w!r}")
                out.append(("SITP", cur, k, "\t".join([mm.group(1), verb, obj or "", det, num, "|".join(uses), adj]))); continue
            elif k == "lack":   # (what she has not: lack Mehl : Supermarkt [holen] -- she gets it there, kaufen if not said)
                mm = re.match(r"^(\S+) : (\S+)(?: (\S+))?$", v)
                if not mm: errs.append(f"{at}: lack Thing : Place [verb]"); continue
                for w in mm.group(1, 2):
                    if not has("N", w): errs.append(f"{at}: no noun {w!r}")
                if mm.group(3) and not has("V", mm.group(3)): errs.append(f"{at}: no verb {mm.group(3)!r}")
                out.append(("SITP", cur, k, "\t".join([mm.group(1), mm.group(2), mm.group(3) or "kúpiť"]))); continue
            else:
                mm = re.match(r"^(\S+) (\S+) : (\S+)(?: by (\S+))?$", v)
                if not mm: errs.append(f"{at}: trouble Thing objstate : verb [by Noun]"); continue
                if not has("N", mm.group(1)): errs.append(f"{at}: no noun {mm.group(1)!r}")
                if mm.group(2) not in objstates: errs.append(f"{at}: no OBJSTATE {mm.group(2)}")
                if not has("V", mm.group(3)): errs.append(f"{at}: no verb {mm.group(3)!r}")
                if mm.group(4) and not has("N", mm.group(4)): errs.append(f"{at}: no noun {mm.group(4)!r}")
                out.append(("SITP", cur, k, "\t".join(x or "" for x in mm.groups()))); continue
            out.append(("SITP", cur, k, v))
    return out, errs


def main():
    senses, where = dictionary()
    sets, states, objstates, errs = settings(senses)
    only = None
    if "--check" in sys.argv:
        only = {os.path.abspath(f) for f in sys.argv[sys.argv.index("--check") + 1:]}
        mem, e2 = members(sets, senses, only)
        cond, e3 = conditions(states, objstates, senses, only)
        for e in errs + e2 + e3: print(e)
        print(f"{len(mem)} members, {len(cond)} conditions; {len(errs + e2 + e3)} problems")
        sys.exit(1 if errs + e2 + e3 else 0)
    mem, e2 = members(sets, senses)
    cond, e3 = conditions(states, objstates, senses)
    val, e4 = valence(senses)
    sits, e5 = situations(sets, states, objstates, senses)
    errs += e2 + e3 + e4 + e5
    for e in errs: print(e)
    rows = [f"SET\t{n}\t{d['parent'] or ''}\t{' '.join(d['roles'])}" for n, d in sets.items()]
    rows += [f"STATE\t{n}\t{'|'.join(' '.join(f) for f in d['forms'])}\t{d['opposite'] or ''}\t{' '.join(d['of'])}\t{' '.join(d['flags'])}" for n, d in states.items()]
    rows += [f"OBJSTATE\t{n}\t\t{o['opposite'] or ''}\t{o['become'] or ''}" for n, o in objstates.items()]
    wrows, e6 = world.world_rows(senses, states, objstates, world.names_of())   # (the world's sheets: tools/world.py)
    for e in e6: print(e)
    errs += e6
    rows += wrows
    rows += [f"M\t{st}\t{p}\t{c}\t{r}" for st, p, c, r in mem]
    rows += [f"C\tV\t{c}\t{nd}\t{gv}\t{fl}" for c, nd, gv, fl in cond]
    rows += [f"VAL\t{p}\t{w}\t{v}" for p, w, v in val]
    rows += ["\t".join(r) for r in sits]
    if not errs: open(os.path.join(check.WORLD, "scenes.tsv"), "w", encoding="utf-8").write("\n".join(rows) + "\n")
    # coverage: the content words (nouns, verbs) of each FREQ that some setting claims
    claimed = {(p, c) for _, p, c, _ in mem}
    by = {}
    for (p, w, sk), (f, freq) in where.items():
        if p in CONTENT: by.setdefault(freq, [0, 0])[0] += 1; by[freq][1] += (p, sk) in claimed   # (sk: the entry's concept)
    cov = ", ".join(f"FREQ {k}: {v[1]}/{v[0]}" for k, v in sorted(by.items()))
    print(f"{len(sets)} settings, {len(mem)} members, {len(cond)} conditions, {len(val)} valences, {sum(r[0] == "SIT" for r in sits)} situations; content words in a setting -- {cov}; {len(errs)} problems")
    if "--missing" in sys.argv:
        for (p, w, sk), (f, freq) in sorted(where.items(), key=lambda x: (x[1][0], x[1][1])):
            if p in CONTENT and (p, sk) not in claimed: print(f"{f}\t{freq}\t{p} {w} = {sk}")
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
