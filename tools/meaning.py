#!/usr/bin/env python3
"""Check the world's MEANING data (world/GENERATOR.md, DESIGN.md): the category graph and the concepts' annotations.

    python3 tools/meaning.py                                 # the graph and every file under world/meaning/
    python3 tools/meaning.py world/meaning/life/animals.txt  # one file (against its index file concepts/life/animals.txt)

A meaning file mirrors a file of the concept index (world/meaning/life/animals.txt <-> concepts/life/animals.txt) and
has a line for every noun, verb, adjective and adverb concept in it (a verb one line per frame), by its ID:

    N banán : fruit
    N peniaze : money ; mass                           (mass: not counted; auf: one is ON it -- a platform, an
                                                        island; an: AT it -- a shore; bare: used as a name)
    V jesť : animal > patient food
    V cestovať : person > instrument vehicle
    V pršať : es
    V vypovedať : person -child > patient document     (-x after a subject or slot category: not those;
                                                        -{človek|osoba}: not these nouns)
    V zavrieť : person > patient object +openable      (+x: it must be that too -- an affordance)
    V brechať : {pes|líška}                            (only these concepts: a verb that narrow)
    V vyzerať : concrete > adj                         (adj: an adjective said of the subject)
    V učiť : person > patient person, second language  (second: a second plain object)
    V nazvať : person > patient person, as {hrdina|klamár}   (as: what the object is taken for)
    V nechať : person > patient thing, inf.obj         (inf.bare / inf.obj: a bare infinitive, maybe its verbs {a|b})
    V skúsiť : person > inf                            (inf: an infinitive, its subject the clause's or a person
                                                        object's; inf.subj: always the clause's)
    V mať : person > bare {strach}                     (bare: a noun with no article -- the verb and it are one idea)
    AN chutný : consumable
    AN ukrajinský : person, food, -national ; attr     (-x: not those; attr: only before a noun; pred: only said)
    AN šťastný : animal, {manželstvo|detstvo}, -{obeť}  ({concepts}: these too; -{concepts}: not these)
    AV včera : time past perfect                       (a time adverb may name the tenses it goes with)
    AV rád : manner person                             (a manner adverb, its subject's category; none: agent)
    AV dúfajme : sentence present perfect future ind   (a sentence adverb's tenses; ind: not in a hypothetical)

A slot is a ROLE (world/roles.txt) and its category -- how a language marks it is the language's (de/rules/frames.txt).
Prints what is wrong and what is missing; exit 1 if anything is.
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check, concepts

SENT = check.WORLD
ROLES = {"patient", "second", "recipient", "as", "theme", "topic", "cause", "basis", "purpose", "companion", "opponent",
         "instrument", "share", "result", "substitute", "location", "goal", "source", "path", "pred", "bare"}
CLAUSES = {"that", "whether", "inf", "inf.subj"}   # a clause as an object; an infinitive (inf.subj: its subject the clause's
#   even after a person object -- promises her to come)
INFS = {"inf.bare", "inf.obj"}   # a bare infinitive: its subject the object before it or the clause's (hears him sing,
#   goes swimming); inf.obj: the object is the infinitive's (has the car repaired) -- either may list its verbs {a|b}
OWN = {"adj", "name", "age", "clock"}   # a predicative adjective; a name (I am called Anna), an age, the clock time;
#   fixed: words the phrase carries, as concepts (es ist wichtig, dass: fixed {dôležitý})
ADVERB_KINDS = {"time", "frequency", "place", "direction", "manner", "degree", "sentence", "connective", "question", "other"}
TENSES = {"present", "past", "perfect", "future"}
# TOO BROAD to be what a word asks for: an adjective for any `entity`, `abstract` or `concrete` thing says nothing; a
# verb whose subject or object may be any `entity`, `abstract` or `concrete` thing makes nonsense -- name the real
# categories, a frame line each (be/become/stay > adj check their adjective instead)
TOO_BROAD = {"AN": {"entity", "concrete", "abstract", "inanimate"}, "V": {"entity", "abstract", "concrete"}}
ADJ_FLAGS = {"attr", "pred"}
NOUN_FLAGS = {"mass", "auf", "an", "bare"}
ANNOTATED = {"N", "V", "AN", "AV"}
TOK = re.compile(r"-?\{[^}]*\}|\S+")


def categories():
    """name -> [parents]; raises on a bad graph"""
    cats, line_of = {}, {}
    for n, s in enumerate(open(os.path.join(SENT, "categories.txt"), encoding="utf-8"), 1):
        s = s.split("--")[0].strip()
        if not s or s.startswith("#"): continue
        if re.match(r"^[A-Z]+:", s): continue   # a directive (BUCKET, CLOSED): read by directives()
        name, _, parents = s.partition(":")
        name = name.strip(); parents = parents.split("=")[0]   # (`= concept`: what names the category -- the dictionary's, engine/meaning.js)
        if not re.fullmatch(r"[a-z][a-z-]*", name): raise SystemExit(f"categories.txt:{n}: name {name!r} (lowercase, hyphens)")
        if name in cats: raise SystemExit(f"categories.txt:{n}: {name} twice")
        cats[name] = [p.strip() for p in parents.split(",") if p.strip()]; line_of[name] = n
    for name, ps in cats.items():
        for p in ps:
            if p not in cats: raise SystemExit(f"categories.txt:{line_of[name]}: {name}'s parent {p!r} is no category")
    def up(c, seen=()):
        if c in seen: raise SystemExit(f"categories.txt: a cycle through {c}")
        return c == "entity" or any(up(p, seen + (c,)) for p in cats[c])
    for c in cats:
        if not up(c): raise SystemExit(f"categories.txt:{line_of[c]}: {c} does not lead up to entity")
    return cats


def directives():
    """categories.txt's directive lines: {"BUCKET": {...}, "CLOSED": {...}}"""
    out = {}
    for s in open(os.path.join(SENT, "categories.txt"), encoding="utf-8"):
        m = re.match(r"^([A-Z]+):\s*(.*)$", s.strip())
        if m: out[m.group(1)] = set(m.group(2).split())
    return out


LINE = re.compile(r"^(N|V|AN|AV) (.+?) : (.+)$")

def under(c, ancestor, cats):
    """c lies under ancestor in the graph (or is it)"""
    return c == ancestor or any(under(p, ancestor, cats) for p in cats.get(c, []))


def named(t, pos, what):
    """{a|b} / -{a|b}: concepts of the index"""
    ws = t.lstrip("-").strip("{}").split("|")
    missing = [w for w in ws if not concepts.has(pos, w)]
    if missing: raise ValueError(f"{what}: no {pos} concept {', '.join(missing)}")


def spec_cats(tokens, cats, what):
    """categories with EXCLUSIONS and REQUIREMENTS: `person, food, -national`, `object +openable`; each `-x` must lie
    under one of the positive ones. `{pes|líška}` instead of a category: only these concepts"""
    if len(tokens) == 1 and tokens[0].startswith("{"):
        named(tokens[0], "N", what); return tokens
    pos = [t for t in tokens if t[0] not in "-+"]
    for t in tokens:
        if t.startswith("-{"): named(t, "N", what); continue
        if t.lstrip("-+") not in cats: raise ValueError(f"no category {t.lstrip('-+')!r}")
        if t.startswith("-") and not any(under(t[1:], p, cats) for p in pos): raise ValueError(f"{what}: {t} is under none of {', '.join(pos)}")
    if not pos: raise ValueError(f"{what}: no category")
    return tokens


BUCKETS = directives().get("BUCKET", set())

def parse(s, cats):
    """a meaning line -> (pos, id, spec); raises ValueError with why"""
    m = LINE.match(s)
    if not m: raise ValueError("not `POS id : ...`")
    pos, cid, spec = m.groups()
    if not concepts.has(pos, cid): raise ValueError(f"no concept {pos} {cid}")
    cat = lambda c: c if c in cats else (_ for _ in ()).throw(ValueError(f"no category {c!r}"))
    if pos == "N":   # categories, then flags
        body, _, flags = spec.partition(";")
        flags = flags.split()
        if set(flags) - NOUN_FLAGS: raise ValueError(f"noun flags {flags} ({', '.join(sorted(NOUN_FLAGS))})")
        return pos, cid, ([cat(c.strip()) for c in body.split(",")], flags)
    if pos == "AN":   # categories (with exclusions, {concepts} too / -{concepts} not these), then flags
        body, _, flags = spec.partition(";")
        toks = [c.strip() for c in body.split(",")]
        listed = [t for t in toks if t.lstrip("-").startswith("{")]
        for t in listed: named(t, "N", "adjective")
        rest = [t for t in toks if t not in listed]
        out = (spec_cats(rest, cats, "adjective") if rest else []) + listed
        if not any(t[0] not in "-+" for t in out): raise ValueError("adjective: no category and no {concepts}")
        flags = flags.split()
        if set(flags) - ADJ_FLAGS: raise ValueError(f"adjective flags {flags} ({', '.join(sorted(ADJ_FLAGS))})")
        broad = TOO_BROAD["AN"] & set(out)
        if broad: raise ValueError(f"an adjective for {'/'.join(sorted(broad))}: too broad -- name what it describes")
        return pos, cid, (out, flags)
    if pos == "AV":
        kind, *tags = spec.split()
        if kind not in ADVERB_KINDS: raise ValueError(f"adverb kind {kind!r} ({', '.join(sorted(ADVERB_KINDS))})")
        if tags and kind == "time" and not set(tags) <= TENSES: raise ValueError(f"tenses {tags} ({', '.join(sorted(TENSES))})")
        if tags and kind == "sentence" and not set(tags) <= TENSES | {"ind"}: raise ValueError(f"tenses {tags} ({', '.join(sorted(TENSES))}, ind)")
        if tags and kind == "manner" and (len(tags) != 1 or tags[0] not in cats): raise ValueError(f"a manner adverb names one category its subject must be: {tags}")
        if tags and kind not in ("time", "manner", "sentence"): raise ValueError("only a time or sentence adverb (its tenses; ind) or a manner adverb (its subject) has more after its kind")
        return pos, cid, (kind, tags)
    subj, gt, rest = spec.partition(">")
    subj = TOK.findall(subj)
    if subj not in (["es"], ["das"]): spec_cats(subj, cats, "subject")   # (es: it rains; das: this is a table)
    slots = []
    for slot in [x.strip() for x in re.split(r",\s*(?![^{]*\})", rest) if x.strip()] if gt else []:
        ts = TOK.findall(slot)
        role, more = ts[0], ts[1:]
        if role in CLAUSES or role in OWN:
            if more: raise ValueError(f"slot {slot!r}: {role} takes nothing after it")
            slots.append((role, None)); continue
        if role == "fixed":   # (fixed {dôležitý|jasný}: concepts the phrase carries -- es ist wichtig, dass)
            if not (len(more) == 1 and more[0].startswith("{")): raise ValueError(f"slot {slot!r}: fixed {{concept|concept}}")
            slots.append((role, more[0])); continue
        if role in INFS:
            if more and not (len(more) == 1 and more[0].startswith("{")): raise ValueError(f"slot {slot!r}: {role} {{verb|verb}}")
            if more: named(more[0], "V", f"slot {slot!r}")
            slots.append((role, more[0] if more else None)); continue
        if role not in ROLES: raise ValueError(f"slot {slot!r}: no role {role!r} (world/roles.txt; or {', '.join(sorted(CLAUSES | OWN | INFS))})")
        if not more: raise ValueError(f"slot {slot!r}: a role and its category")
        slots.append((role, " ".join(spec_cats(more, cats, "slot"))))
    is_cat = lambda r, c: c and r not in INFS and r not in ("pred", "fixed")
    broad = ({subj[0]} | {c.split()[0] for r, c in slots if is_cat(r, c)}) & TOO_BROAD["V"]
    if broad and not any(r == "adj" for r, _ in slots): raise ValueError(f"a frame with {'/'.join(sorted(broad))}: too broad -- a line per real category")
    alone = [t[0] for t in [subj] + [c.split() for r, c in slots if is_cat(r, c)] if t[0] in BUCKETS and not any(x.startswith("+") for x in t)]
    if alone: raise ValueError(f"a frame with {'/'.join(alone)} alone: a bucket -- name a subcategory, add +x or list the concepts {{a|b}}")
    return pos, cid, (" ".join(subj), slots)


def check_file(path, cats):
    rel = os.path.relpath(path, os.path.join(SENT, "meaning"))
    want = {k for k, v in concepts.read().items() if v["file"] == rel and k[0] in ANNOTATED}
    if not os.path.exists(path): return [f"{rel}: not written yet"], 0
    have, errs = set(), []
    for n, s in enumerate(open(path, encoding="utf-8"), 1):
        s = s.rstrip("\n")
        if not s.strip() or s.startswith("#"): continue
        try: pos, cid, _ = parse(s, cats)
        except ValueError as e: errs.append(f"{rel}:{n}: {e}\n    {s}"); continue
        if (pos, cid) not in want: errs.append(f"{rel}:{n}: {pos} {cid} belongs to concepts/{concepts.read()[(pos, cid)]['file']}")
        have.add((pos, cid))
    for pos, cid in sorted(want - have): errs.append(f"{rel}: MISSING {pos} {cid}")
    return errs, len(have & want)


# THE COMPILED FORM (engine/meaning.js): world/meaning.tsv, a line per annotation --
#   pos  id  cats (N, AN: categories; AV: its kind)  subj (V; AN, N: flags; AV: tags)  slots (V: `role|category` each, `;` between)
def compile_all():
    cats = categories()
    out = ["pos\tid\tcats\tsubj\tslots"]
    for dp, _, fs in sorted(os.walk(os.path.join(SENT, "meaning"))):
        for f in sorted(fs):
            if not f.endswith(".txt"): continue
            for s in open(os.path.join(dp, f), encoding="utf-8"):
                s = s.rstrip("\n")
                if not s.strip() or s.startswith("#"): continue
                pos, cid, spec = parse(s, cats)
                if pos == "V": out.append("\t".join([pos, cid, "", spec[0], ";".join(f"{r}|{c or ''}" for r, c in spec[1])]))
                elif pos == "AV": out.append("\t".join([pos, cid, spec[0], ",".join(spec[1]), ""]))
                else: out.append("\t".join([pos, cid, ",".join(spec[0]), ",".join(spec[1]), ""]))
    open(os.path.join(check.WORLD, "meaning.tsv"), "w", encoding="utf-8").write("\n".join(out) + "\n")
    print(f"meaning.tsv: {len(out) - 1} annotations")


def main():
    cats = categories()
    files = sys.argv[1:] or sorted(os.path.join(dp, f) for dp, _, fs in os.walk(os.path.join(SENT, "meaning")) for f in fs if f.endswith(".txt"))
    bad, done = 0, 0
    for f in files:
        errs, n = check_file(os.path.abspath(f), cats)
        done += n
        for e in errs: print(e)
        bad += len(errs)
    print(f"{len(cats)} categories; {done} concepts annotated in {len(files)} files; {bad} problems")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
