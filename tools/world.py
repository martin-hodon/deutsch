#!/usr/bin/env python3
"""THE WORLD's sheets (sentences/STORIES.md): what places, weather and people ARE like -- read, checked against the
dictionary, and compiled into rows of scenes.tsv (tools/scenes.py calls world_rows). Files in sentences/world/:

    properties.txt   PROPERTY temperature : kalt < kühl < warm < heiß ; of place weather   (a scale, low to high)
                     PROPERTY colour : rot | blau | grün                                   (kinds, no order)
    weather.txt      WEATHER Regen : verb=regnen subj=es ; wetness nass ; noun Regen  (how it is said, in the tests.txt
                     format, what it makes the place, its noun); SEASON Winter : Schnee {3} | kalt {2} (its weather)
    places/*.txt     PLACE Küche : in ; temperature warm ; light hell ; things Herd | Tisch ; people Koch ; weather ...
    rules.txt        RULE weather Regen & out -> thing nass ; wear Regenjacke | Regenschirm
    people.txt       TRAIT freundlich | fleißig ...; TASTE food : Kaffee | Kuchen ... (what one may like or not)
    tools.txt        TOOL reparieren : Werkzeug | Schraubenzieher   (what a mending verb is done with)
    cast.txt         ACTOR Lisa : f ; job Lehrerin ; traits freundlich ; likes Kaffee | lesen ; dislikes Regen ; home Wohnung
    people.txt       SHOWS geduldig : langsam | vorsichtig   (how a trait shows: adverbs of grammar.txt manner.<adverb>)
    procedures.txt   PROCEDURE braten : meat | dish ; here Pfanne/Bratpfanne, then its lines: step/process/key[?] clause
                     ; gives Noun:objstate   (what doing a wish is, step by step)
    body.txt         SIGN hungrig : verb=knurren subj=Magen   (how a state shows)

    python3 tools/world.py      checks the sheets alone (the problems, file:line)
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check, concepts

WORLD = os.path.join(check.WORLD, "world")


def lines(name):
    """(file:line, text) of a world file or of every file of a world folder; # comments dropped"""
    path = os.path.join(WORLD, name)
    files = sorted(os.path.join(path, f) for f in os.listdir(path) if f.endswith(".txt")) if os.path.isdir(path) else [path] if os.path.exists(path) else []
    for f in files:
        for n, raw in enumerate(open(f, encoding="utf-8"), 1):
            s = raw.split("#")[0].strip()
            if s: yield f"world/{os.path.relpath(f, WORLD)}:{n}", s


def split_list(v):
    return [x.strip() for x in v.split("|") if x.strip()]


def weighted(v):
    """`Schnee {3} | kalt` -> [(Schnee, 3), (kalt, 1)]"""
    out = []
    for x in split_list(v):
        m = re.match(r"^([^\s{]+)\s*(?:\{([\d.]+)\})?$", x)
        out.append((m.group(1), float(m.group(2) or 1)) if m else (x, None))
    return out


def world_rows(senses, states, objstates, names):
    """-> (rows for scenes.tsv, problems); senses: (pos, word) -> [meanings] (tools/scenes.py dictionary())"""
    rows, errs = [], []
    gwords, cats = grammar_words(), categories()
    RELATIONS = {m.group(1) for m in re.finditer(r"^RELATION (\S+)", open(os.path.join(check.WORLD, "relations.txt"), encoding="utf-8").read(), re.M)}
    # (the world's words are concepts -- tokens with _ for a space: tešiť_sa)
    noun = lambda w: concepts.has("N", w)
    adj = lambda w: concepts.has("AN", w)
    verb = lambda w: concepts.has("V", w)

    # ---- PROPERTIES: the words a place, a thing, the weather can be said with
    props = {}
    for at, s in lines("properties.txt"):
        m = re.match(r"^PROPERTY (\S+) : ([^;]+?)(?: ; of (.+))?$", s)
        if not m: errs.append(f"{at}: PROPERTY name : a < b < c | or a | b ; of kinds"); continue
        scale = "<" in m.group(2)
        vals = [x.strip() for x in re.split(r"[<|]", m.group(2)) if x.strip()]
        for v in vals:
            if not adj(v): errs.append(f"{at}: no adjective {v!r}")
        props[m.group(1)] = vals
        rows.append(f"PROP\t{m.group(1)}\t{'<' if scale else '|'}\t{'|'.join(vals)}\t{m.group(3) or ''}")
    valueOf = {v: p for p, vs in props.items() for v in vs}

    def prop_fields(at, parts, allowed=("things", "people", "weather")):
        """`temperature warm` / `light hell | dunkel` -> ["temperature=warm", ...]; the other keys returned apart"""
        out, other = [], {}
        for part in parts:
            k, _, v = part.strip().partition(" ")
            v = v.strip()
            if k in props:
                for x in split_list(v):
                    if x not in props[k]: errs.append(f"{at}: {x!r} is no value of {k} ({' '.join(props[k])})")
                out.append(f"{k}={v.replace(' ', '')}")
            elif k in allowed: other[k] = v
            else: errs.append(f"{at}: unknown field {k!r} (a property: {', '.join(props)}; or {', '.join(allowed)})")
        return out, other

    # ---- WEATHER and SEASONS
    weathers = {}
    for at, s in lines("weather.txt"):
        m = re.match(r"^WEATHER (\S+) : ([^;]+)((?: ; [^;]+)*)$", s)
        if m:
            args = m.group(2).strip()
            for k, v in re.findall(r"([\w.]+)=(\S+)", args):
                if k == "verb" and not verb(v): errs.append(f"{at}: no verb {v!r}")
                if v.startswith("adj:") and not adj(v[4:]): errs.append(f"{at}: no adjective {v[4:]!r}")
                if re.match(r"^(def|indef|none):", v) and not noun(v.split(":", 1)[1]): errs.append(f"{at}: no noun {v!r}")
            ps, other = prop_fields(at, [x for x in m.group(3).split(" ; ")[1:] if x.strip() != "bad"], ("noun",))
            if " ; bad" in m.group(3) + " ": ps.append("bad")   # (weather one would rather not be out in: a cause, not a scene)
            if other.get("noun") and not noun(other["noun"]): errs.append(f"{at}: no noun {other['noun']!r}")
            weathers[m.group(1)] = True
            rows.append(f"WEATHER\t{m.group(1)}\t{args}\t{' '.join(ps)}\t{other.get('noun', '')}")
            continue
        m = re.match(r"^SEASON (\S+) : (.+)$", s)
        if m:
            if not noun(m.group(1)): errs.append(f"{at}: no noun {m.group(1)!r}")
            ws = weighted(m.group(2))
            for w, n in ws:
                if n is None: errs.append(f"{at}: cannot read {w!r} (weather {{n}})")
            rows.append(f"SEASON\t{m.group(1)}\t{'|'.join(f'{w}:{n:g}' for w, n in ws if n is not None)}")
            continue
        errs.append(f"{at}: cannot read {s!r}")
    for r in [r for r in rows if r.startswith("SEASON")]:
        for wn in r.split("\t")[2].split("|"):
            if wn.split(":")[0] not in weathers: errs.append(f"weather.txt: SEASON {r.split(chr(9))[1]}: no WEATHER {wn.split(':')[0]}")

    # ---- PLACES: what a place is like
    seen = {}
    for at, s in lines("places"):
        m = re.match(r"^PLACE (\S+) : (in|out)((?: ; [^;]+)*)$", s)
        if not m: errs.append(f"{at}: PLACE Noun : in|out ; property value ; things A | B ; people A ; weather w {{n}}"); continue
        w = m.group(1)
        if not noun(w): errs.append(f"{at}: no noun {w!r}")
        if w in seen: errs.append(f"{at}: {w} again (first {seen[w]})")
        seen[w] = at
        ps, other = prop_fields(at, m.group(3).split(" ; ")[1:])
        for k in ("things", "people"):
            for x in split_list(other.get(k, "")):
                if not noun(x): errs.append(f"{at}: no noun {x!r}")
        ws = weighted(other.get("weather", ""))
        for x, n in ws:
            if x not in weathers: errs.append(f"{at}: no WEATHER {x!r}")
        if ws and m.group(2) == "in": errs.append(f"{at}: weather only for an outside place")
        rows.append(f"PLACE\t{w}\t{m.group(2)}\t{' '.join(ps)}\t{'|'.join(split_list(other.get('things', '')))}\t{'|'.join(split_list(other.get('people', '')))}\t{'|'.join(f'{x}:{n:g}' for x, n in ws if n)}")

    # ---- RULES: what follows from the place and the weather
    for at, s in lines("rules.txt"):
        m = re.match(r"^RULE (.+?) -> (.+)$", s)
        if not m: errs.append(f"{at}: RULE cond & cond -> effect ; effect"); continue
        conds, effects = [], []
        for c in m.group(1).split("&"):
            k, _, v = c.strip().partition(" ")
            if k in ("in", "out") and not v: conds.append(k)
            elif k == "weather" and v in weathers: conds.append(f"weather={v}")
            elif k in props and v in props[k]: conds.append(f"{k}={v}")
            else: errs.append(f"{at}: condition {c.strip()!r} (in, out, weather W, a property and its value)")
        for e in m.group(2).split(";"):
            k, _, v = e.strip().partition(" ")
            if k == "state" and v in states: effects.append(f"state={v}")
            elif k == "thing" and v in objstates: effects.append(f"thing={v}")
            elif k == "wear" and all(noun(x) for x in split_list(v)): effects.append(f"wear={'|'.join(split_list(v))}")
            else: errs.append(f"{at}: effect {e.strip()!r} (state STATE, thing OBJSTATE, wear Noun | Noun -- dictionary words)")
        rows.append(f"RULE\t{'&'.join(conds)}\t{';'.join(effects)}")

    # ---- TOOLS: what a mending verb is done with
    for at, s in lines("tools.txt"):
        m = re.match(r"^TOOL (\S+) : (.+?)(?: ; for (.+))?$", s)
        if not m: errs.append(f"{at}: TOOL verb : Noun | Noun [; for cat | cat]"); continue
        for c in split_list(m.group(3) or ""):
            if c not in cats: errs.append(f"{at}: for {c!r}: no category")
        if not verb(m.group(1)): errs.append(f"{at}: no verb {m.group(1)!r}")
        for x in split_list(m.group(2)):
            if not noun(x): errs.append(f"{at}: no noun {x!r}")
        rows.append(f"TOOL\t{m.group(1)}\t{'|'.join(split_list(m.group(2)))}\t{'|'.join(split_list(m.group(3) or ''))}")

    # ---- PEOPLE: traits, tastes; the CAST
    traits, tastes = set(), {}
    for at, s in lines("people.txt"):
        m = re.match(r"^TRAIT (.+)$", s)
        if m:
            for x in split_list(m.group(1)):
                if not adj(x): errs.append(f"{at}: no adjective {x!r}")
                traits.add(x)
            rows.append(f"TRAIT\t{'|'.join(split_list(m.group(1)))}")
            continue
        m = re.match(r"^TASTE (\S+) : (.+)$", s)
        if m:
            for x in split_list(m.group(2)):
                if not (noun(x) or verb(x)): errs.append(f"{at}: no noun or verb {x!r}")
                tastes[x] = m.group(1)
            rows.append(f"TASTE\t{m.group(1)}\t{'|'.join(split_list(m.group(2)))}")
            continue
        if not s.startswith("SHOWS "): errs.append(f"{at}: cannot read {s!r}")   # (SHOWS: below, with the traits known)
    for at, s in lines("cast.txt"):
        m = re.match(r"^ACTOR (\S+) : (f|m)((?: ; [^;]+)*)$", s)
        if not m: errs.append(f"{at}: ACTOR Name : f|m ; job Noun ; traits a | b ; likes x | y ; dislikes z ; home Noun"); continue
        if m.group(1) not in names.get(m.group(2), set()): errs.append(f"{at}: {m.group(1)} is no name.{m.group(2)} (grammar.txt)")
        f = {}
        for part in m.group(3).split(" ; ")[1:]:
            k, _, v = part.strip().partition(" ")
            f[k] = v.strip()
            if k in ("job", "home") and not noun(v.strip()): errs.append(f"{at}: no noun {v.strip()!r}")
            elif k == "traits":
                for x in split_list(v):
                    if x not in traits: errs.append(f"{at}: {x!r} is no TRAIT (people.txt)")
            elif k in ("likes", "dislikes"):
                for x in split_list(v):
                    if x not in tastes: errs.append(f"{at}: {x!r} is in no TASTE (people.txt)")
            elif k not in ("job", "home"): errs.append(f"{at}: unknown field {k!r}")
        if set(split_list(f.get("likes", ""))) & set(split_list(f.get("dislikes", ""))): errs.append(f"{at}: likes and dislikes the same")
        rows.append(f"ACTOR\t{m.group(1)}\t{m.group(2)}\t{f.get('job', '')}\t{'|'.join(split_list(f.get('traits', '')))}\t{'|'.join(split_list(f.get('likes', '')))}\t{'|'.join(split_list(f.get('dislikes', '')))}\t{f.get('home', '')}")

    # ---- TRAITS SHOW in the manner of what one does: adverbs with a grammar.txt list manner.<adverb>
    for at, s in lines("people.txt"):
        m = re.match(r"^SHOWS (\S+) : (.+)$", s)
        if not m: continue
        if m.group(1) not in traits: errs.append(f"{at}: {m.group(1)!r} is no TRAIT")
        for x in split_list(m.group(2)):
            if f"manner.{x}" not in gwords: errs.append(f"{at}: no list manner.{x} in grammar.txt (which verbs it goes with)")
        rows.append(f"SHOWS\t{m.group(1)}\t{'|'.join(split_list(m.group(2)))}")

    # the nouns, verbs, adjectives of a clause in the tests.txt format (a procedure's line, a sign): checked, and a
    # manner only with a verb of its grammar.txt list
    ROLES = {"patient", "second", "recipient", "as", "theme", "topic", "cause", "basis", "purpose", "companion", "opponent",
             "instrument", "share", "result", "substitute", "location", "goal", "source", "path", "bare"}
    PRONS = {"1sg", "2sg", "3sg.m", "3sg.f", "3sg.n", "1pl", "2pl", "3pl", "formal", "one", "someone", "noone", "something", "nothing", "everything", "this"}
    DET = r"^(def|indef|none|no|new|own|bare|num\.\S+|poss\.\S+|this|every|all|some|both|many|few|several):"
    # the nouns, verbs, adjectives of a clause in the language-free format (world/CLAUSES.md): checked, and a manner
    # only with a verb of its list (world/lists.txt manner.<adverb>)
    def clause_words(at, clause, things=None):
        kv = re.findall(r"([\w.]+)=(\"[^\"]*\"|\S+)", clause)
        if not kv: errs.append(f"{at}: no clause {clause!r}")
        v = dict(kv).get("verb", "").strip('"')
        if not verb(v): errs.append(f"{at}: no verb {v!r}")
        for k, x in kv:
            if x.startswith("$"): continue   # (a story's slot: $doer -- the one at work)
            if k == "subj" or k in ROLES or k == "pp":
                np = x.split(":", 1)[1] if k == "pp" else x   # (pp=onto:def:stôl -> def:stôl)
                if k == "pp" and x.split(":", 1)[0] not in RELATIONS: errs.append(f"{at}: {x!r}: no relation {x.split(':', 1)[0]!r} (world/relations.txt)")
                n = re.sub(DET, "", np.split("+")[0]).lstrip("~")
                if n == "obj" or n in PRONS or n == "it" or n.startswith("$"): continue
                for alt in n.split("/"):
                    if not noun(alt): errs.append(f"{at}: no noun {alt!r}")
                if things is not None: things.add(n)
                for mod in np.split("+")[1:]:
                    if mod.startswith("adj:") and not adj(mod[4:]): errs.append(f"{at}: no adjective {mod[4:]!r}")
            elif k == "pred" and x.startswith("adj:") and not adj(x[4:]): errs.append(f"{at}: no adjective {x[4:]!r}")
            elif k == "manner" and f"manner.{x}" in gwords and v not in gwords[f"manner.{x}"]: errs.append(f"{at}: {v} is not in manner.{x} (world/lists.txt)")
        return v

    # ---- PROCEDURES: what doing a wish is, step by step
    procs = closes = 0
    for at, s in lines("procedures.txt"):
        m = re.match(r"^PROCEDURE (.+?) : ([^;]+?)(?: ; here (.+))?$", s)
        if m:
            for v in split_list(m.group(1)):   # (one block for several verbs: nähen | reparieren)
                if not verb(v): errs.append(f"{at}: no verb {v!r}")
            for c in split_list(m.group(2)):
                if c not in cats and not noun(c) and c != "-": errs.append(f"{at}: {c!r} is no category (categories.txt), no noun and not - (no object)")
            for g in split_list(m.group(3) or ""):
                for alt in g.split("/"):
                    if not noun(alt): errs.append(f"{at}: no noun {alt!r}")
            rows.append(f"PROC\t{'|'.join(split_list(m.group(1)))}\t{'|'.join(split_list(m.group(2)))}\t{'|'.join(split_list(m.group(3) or ''))}")
            procs += 1; keys = closes = 0; named = {"obj"} | {g for g in split_list(m.group(3) or "")}
            continue
        m = re.match(r"^(step|process|key|close)(\?)?\s+(.+?)((?: ; [^;]+)*)$", s)
        if m and procs:
            extra, marks = {}, []
            for x in m.group(4).split(" ; ")[1:]:
                k, _, v = x.strip().partition(" ")
                if k in ("gives", "if") and v: extra[k] = v
                elif k in ("senses", "moment", "fetch") and not v: marks.append(k)
                else: errs.append(f"{at}: {x.strip()!r}: gives Noun:state, if cat, or a mark senses | moment | fetch")
            if "fetch" in marks and "patient=" not in m.group(3): errs.append(f"{at}: fetch: a line with its patient= (what is fetched)")
            if m.group(1) == "close": closes += 1
            elif closes: errs.append(f"{at}: the close line is the last")
            for c in split_list(extra.get("if", "")):
                if c not in cats and not noun(c): errs.append(f"{at}: if {c!r}: no category, no noun")
            clause_words(at, m.group(3), named)
            subj = re.search(r"\bsubj=", m.group(3))
            if m.group(1) == "process" and not subj: errs.append(f"{at}: a process needs its subj= (the thing that does it)")
            if m.group(1) != "process" and subj: errs.append(f"{at}: a {m.group(1)} is done by the person: no subj=")
            if closes > 1: errs.append(f"{at}: a second close line")
            if m.group(1) == "key" and not extra.get("if"): keys += 1   # (keys for different kinds of thing: each with its if)
            if keys > 1: errs.append(f"{at}: a second key step")
            gives = split_list(extra.get("gives", ""))
            for g in gives:
                t, _, st = g.partition(":")
                if t not in named: errs.append(f"{at}: gives {g!r}: {t} is not named in this procedure")
                if st not in objstates: errs.append(f"{at}: gives {g!r}: {st} is no OBJSTATE (settings.txt)")
            rows.append(f"PLINE\t{m.group(1)}\t{m.group(3)}\t{'|'.join(gives)}\t{'detail' if m.group(2) else ''}\t{'|'.join(split_list(extra.get('if', '')))}\t{'|'.join(marks)}")
            continue
        errs.append(f"{at}: cannot read {s!r} (PROCEDURE verb : cats ; here Noun | Noun/Noun, then step|process|key|close[?] clause [; gives Noun:state] [; if cat | Noun] [; senses|moment|fetch])")

    # ---- AMBIENCE: what a thing of a place sounds, smells, looks like (no subj=: the thing itself)
    for at, s in lines("ambience.txt"):
        m = re.match(r"^(SOUND|SMELL|SIGHT) (\S+) : (.+?)(?: ; omen (\S+))?$", s)
        if not m: errs.append(f"{at}: SOUND|SMELL|SIGHT Noun : clause [; omen OBJSTATE]"); continue
        if not noun(m.group(2)): errs.append(f"{at}: no noun {m.group(2)!r}")
        if m.group(4) and m.group(4) not in objstates: errs.append(f"{at}: omen {m.group(4)!r} is no OBJSTATE")
        clause_words(at, m.group(3))
        rows.append(f"AMB\t{m.group(1)}\t{m.group(2)}\t{m.group(3)}\t{m.group(4) or ''}")

    # ---- SIDE TASKS: what the other one does while she works, by place
    for at, s in lines("side.txt"):
        m = re.match(r"^SIDE (.+?) : (.+)$", s)
        if not m: errs.append(f"{at}: SIDE Place | Place : clause"); continue
        for pl in split_list(m.group(1)):
            if not noun(pl): errs.append(f"{at}: no noun {pl!r}")
        clause_words(at, m.group(2))
        rows.append(f"SIDE\t{'|'.join(split_list(m.group(1)))}\t{m.group(2)}")

    # ---- TEXTURE: what a dish is like when done
    for at, s in lines("texture.txt"):
        m = re.match(r"^TEXTURE (.+?) : (.+)$", s)
        if not m: errs.append(f"{at}: TEXTURE kind | Noun : adjective | adjective"); continue
        for c in split_list(m.group(1)):
            if c not in cats and not noun(c): errs.append(f"{at}: {c!r}: no category, no noun")
        for x in split_list(m.group(2)):
            if not adj(x): errs.append(f"{at}: no adjective {x!r}")
        rows.append(f"TEX\t{'|'.join(split_list(m.group(1)))}\t{'|'.join(split_list(m.group(2)))}")

    # ---- SIGNS: how a state shows
    for at, s in lines("body.txt"):
        m = re.match(r"^SIGN (\S+) : (.+)$", s)
        if not m: errs.append(f"{at}: SIGN state : clause"); continue
        if m.group(1) not in states and not adj(m.group(1)): errs.append(f"{at}: {m.group(1)!r} is no STATE and no adjective")
        clause_words(at, m.group(2))
        rows.append(f"SIGN\t{m.group(1)}\t{m.group(2)}")
    return rows, errs


def grammar_words():
    """the WORDS lists of world/lists.txt and the German grammar.txt: name -> [words]"""
    out = {}
    for s in [*open(os.path.join(check.WORLD, "lists.txt"), encoding="utf-8"), *open(os.path.join(check.ROOT, "rules", "grammar.txt"), encoding="utf-8")]:
        m = re.match(r"^WORDS (\S+): (.*)$", s)
        if m: out[m.group(1)] = [x.split(" [")[0].split("{")[0].strip() for x in m.group(2).split("|")]
    return out


def categories():
    """the category names of categories.txt (`name : parent -- ...`, `entity -- ...`)"""
    out = set()
    for s in open(os.path.join(check.WORLD, "categories.txt"), encoding="utf-8"):
        m = re.match(r"^([a-z][\w-]*)\s*(?::|--)", s)
        if m: out.add(m.group(1))
    return out


def names_of():
    """the first names of grammar.txt (WORDS name.f / name.m)"""
    out = {"f": set(), "m": set()}
    for s in open(os.path.join(check.ROOT, "rules", "grammar.txt"), encoding="utf-8"):
        m = re.match(r"^WORDS name\.(f|m): (.*)$", s)
        if m: out[m.group(1)] |= {x.split(" [")[0].strip() for x in m.group(2).split("|")}
    return out


if __name__ == "__main__":
    import scenes
    senses, _ = scenes.dictionary()
    _, states, objstates, _ = scenes.settings(senses)
    rows, errs = world_rows(senses, states, objstates, names_of())
    for e in errs: print(e)
    kinds = {}
    for r in rows: kinds[r.split("\t")[0]] = kinds.get(r.split("\t")[0], 0) + 1
    print(", ".join(f"{n} {k}" for k, n in kinds.items()) + f"; {len(errs)} problems")
    sys.exit(1 if errs else 0)
