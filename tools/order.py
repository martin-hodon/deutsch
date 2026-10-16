#!/usr/bin/env python3
"""Order a language's words by how common they are: <lang>/order.tsv, the default order in which a learner meets
new words (the topic files say what a word is and where it belongs; this says which comes first).

    CORPUS=.../deu_news_2022_1M-words.txt python3 tools/order.py
    CORPUS=.../eng_news_2023_1M-words.txt python3 tools/order.py en      (English: en/, its forms by english_forms)
    CORPUS=.../spa_news_2023_1M-words.txt python3 tools/order.py es      (Spanish, French: romance_forms)
    CORPUS=.../rus_news_2023_300K-words.txt python3 tools/order.py ru    (Russian: russian_forms -- the stem with the
                                                                           case and person endings, roughly)
    CORPUS=.../zho_news_2020_100K-words.txt python3 tools/order.py zh    (Chinese: a word as written, no forms)

A word is counted by its forms in the Leipzig news corpus (CORPUS, as for hints.py; its -sentences.txt beside it):
  N    singular, genitive -s/-es, the plural from the entry (and its dative -n)
  V    the conjugated forms, the irregular ones from the entry; a separable verb only where it is written as one word
       (`anspricht`, `angesprochen`, `anzusprechen`: `spricht ... an` is not seen, so these count low)
  AN   the endings, the comparison
  the closed classes and the commonest irregular verbs by their forms written out below; other words as written.
A form two words share is split between them; a capitalised form at the start of a sentence (`Kommen`) counts only
where no word is written so (`Ende` is the noun's, not `enden`'s). A word of several words is counted in the sentences.

order.tsv: a header, then one line per word and part of speech, commonest first (homonyms share a line):
  rank  word  pos  count
"""
import collections, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check
from hints import CORPUS

SENTENCES = CORPUS.replace("-words.txt", "-sentences.txt")
LANG = sys.argv[1] if len(sys.argv) > 1 else "de"
DEST = os.path.join(check.TOP, LANG, "order.tsv")

# the forms the rules below do not make
WRITTEN_OUT = {
    ("der", "ART"): "der den dem des", ("die", "ART"): "die", ("das", "ART"): "das",
    ("ein", "ART"): "ein eine einen einem einer eines", ("kein", "ART"): "kein keine keinen keinem keiner keines",
    ("ich", "P"): "ich mich mir", ("du", "P"): "du dich dir", ("er", "P"): "er ihn ihm", ("sie", "P"): "sie ihnen",
    ("wir", "P"): "wir uns", ("ihr", "P"): "ihr ihre ihren ihrem ihrer ihres euch", ("Sie", "P"): "Sie Ihnen",
    ("mein", "P"): "mein meine meinen meinem meiner meines", ("dein", "P"): "dein deine deinen deinem deiner deines",
    ("sein", "P"): "sein seine seinen seinem seiner seines", ("unser", "P"): "unser unsere unseren unserem unserer unseres",
    ("euer", "P"): "euer eure euren eurem eurer eures", ("wer", "P"): "wer wen wem wessen",
    ("dieser", "P"): "dieser diese dieses diesen diesem", ("jener", "P"): "jener jene jenes jenen jenem",
    ("welcher", "P"): "welcher welche welches welchen welchem", ("jeder", "P"): "jeder jede jedes jeden jedem",
    ("sein", "V"): "sein bin bist ist sind seid war warst waren wart gewesen sei seien wäre wären wärst",
    ("haben", "V"): "haben habe hast hat habt hatte hattest hatten hattet gehabt hätte hätten hättest",
    ("werden", "V"): "werden werde wirst wird werdet wurde wurdest wurden wurdet geworden worden würde würden würdest",
    ("können", "V"): "können kann kannst könnt konnte konnten könnte könnten könne gekonnt",
    ("müssen", "V"): "müssen muss musst müsst musste mussten müsste müssten müsse gemusst",
    ("sollen", "V"): "sollen soll sollst sollt sollte sollten solle",
    ("wollen", "V"): "wollen will willst wollt wollte wollten wolle gewollt",
    ("dürfen", "V"): "dürfen darf darfst dürft durfte durften dürfte dürften dürfe",
    ("mögen", "V"): "mögen mag magst mochte mochten möchte möchten möchtest gemocht",
    ("wissen", "V"): "wissen weiß weißt wisst wusste wussten wüsste gewusst",
}
INSEPARABLE = ("be", "ge", "er", "ver", "zer", "ent", "emp", "miss")
UMLAUT = str.maketrans("aouAOU", "äöüÄÖÜ")


def verb_forms(word, parts, forms):
    """the forms of a verb; `forms` the irregular 3rd person/past/participle of its entry, or None"""
    prefix = parts.split("·")[0].replace("|", "") if "·" in parts else ""     # an·sprechen: an
    core = word[len(prefix):]
    stem = core[:-2] if core.endswith("en") else core[:-1]
    if forms:
        third, past = (f.split(" ")[0] for f in forms[:2])                   # (`spricht an`: the finite part)
        finite = {third, third[:-1] + "st", past, past + "st", past + "en", past + "t"}
        finite |= {past.translate(UMLAUT) + e for e in ("e", "en", "est", "et")}
        participle = forms[2]                                                # (angesprochen: the whole word)
    else:
        finite = {stem + e for e in ("e", "st", "t", "en", "et", "est", "te", "test", "ten", "tet")}
        participle = prefix + ("" if core.startswith(INSEPARABLE) else "ge") + stem + "t"
    # a separable verb only where it is one word: `dass er anspricht`, `anzusprechen`
    return {word, participle, prefix + stem + "end"} | {prefix + f for f in finite} | ({prefix + "zu" + core} if prefix else set())


def adjective_forms(word, comparison):
    endings = ("", "n", "r", "s", "m") if word.endswith("e") else ("", "e", "en", "er", "es", "em")
    stems = [word]
    if comparison:
        stems += [comparison[0], comparison[1].replace("am ", "")[:-1]]          # größer, größte(n)
    else:
        stems += [word + "er", word + ("est" if re.search(r"[dtsßxz]$", word) else "st")]
    return {s + e for s in stems for e in endings}


# English forms the rules below do not make (pronouns' cases, be / have / do), and American spellings counted with
# the British word (the corpus is mostly American news)
EN_WRITTEN = {
    ("be", "V"): "be am is are was were been being", ("have", "V"): "have has had having", ("do", "V"): "do does did done doing",
    ("I", "P"): "I me my mine myself", ("he", "P"): "he him his himself", ("she", "P"): "she her hers herself",
    ("we", "P"): "we us our ours ourselves", ("they", "P"): "they them their theirs themselves", ("you", "P"): "you your yours yourself yourselves",
    ("it", "P"): "it its itself", ("this", "P"): "this these", ("that", "P"): "that those", ("who", "P"): "who whom whose",
}
def american(f):
    return {f, re.sub(r"our(s?)$", r"or\1", f), re.sub(r"ence$", "ense", f), re.sub(r"is(e|ed|es|ing|ation|ations)$", r"iz\1", f),
            re.sub(r"tre(s?)$", r"ter\1", f), re.sub(r"ll(ed|ing)$", r"l\1", f), re.sub(r"ogue$", "og", f)}


def english_forms(d):
    if (d["word"], d["pos"]) in EN_WRITTEN:
        return set(EN_WRITTEN[(d["word"], d["pos"])].split())
    return {a for f in english_forms1(d) for a in american(f)}


def english_forms1(d):
    """an English entry's forms: a noun's plural and 's, a verb's -s -ing -ed or irregular forms (en/morph.js's rules,
    roughly: counting needs no more), an adjective's comparison"""
    w, pos = d["word"], d["pos"]
    if pos == "N":
        return {w, w + "'s"} | ({d["plural"]} if d["plural"] not in ("-", "PL", "") else set())
    if pos == "V":
        stem = w[:-1] if w.endswith("e") else w[:-1] + "i" if re.search(r"[^aeiou]y$", w) else w
        out = {w, w + "es" if re.search(r"(s|x|z|ch|sh|o)$", w) else stem + "es" if stem != w and stem.endswith("i") else w + "s",
               (w[:-1] if w.endswith("e") and not w.endswith("ee") else w) + "ing", stem + ("d" if w.endswith("e") else "ed")}
        if re.search(r"(^|[^aeiou])[aeiou][^aeiouwxy]$", w): out |= {w + w[-1] + "ed", w + w[-1] + "ing"}
        return out | set(d["forms"].split("/")) if d["forms"] else out
    if pos == "AN" and d["comparison"]:
        return {w} | set(x for x in d["comparison"].split("/") if " " not in x)
    if pos == "AN" and " " not in w and len(w) < 7:
        return {w, (w[:-1] if w.endswith("e") else w) + "er", (w[:-1] if w.endswith("e") else w) + "est"}
    return {w}


ES_END = {"ar": "o as a amos áis an é aste ó aron aba abas ábamos aban e es emos en ara aras aran ado ada ados adas ando aré ará arán aría arían",
          "er": "o es e emos éis en í iste ió imos ieron ía ías íamos ían a as amos an iera ieran ido ida idos idas iendo eré erá erán ería erían",
          "ir": "o es e imos ís en í iste ió ieron ía ías íamos ían a as amos an iera ieran ido ida idos idas iendo iré irá irán iría irían"}
FR_END = {"er": "e es ons ez ent é ée és ées ais ait aient ant erai era eront erait eraient a èrent",
          "ir": "is it issons issez issent i ie is ies issais issait issaient issant irai ira iront irait iraient",
          "re": "s t ons ez ent u ue us ues ais ait aient ant rai ra ront rait raient"}


IRREGULAR = {}
def irregular_forms(verb):
    """the forms <lang>/rules/irregular.txt writes out for a verb (être: suis es est ...; tener: tengo ... tuv-)"""
    if not IRREGULAR:
        path = os.path.join(check.TOP, LANG, "rules", "irregular.txt")
        for s in open(path, encoding="utf-8") if os.path.exists(path) else []:
            if ":" not in s or s.startswith("#"): continue
            v, rest = s.split(":", 1)
            IRREGULAR[v.strip()] = [f for part in rest.split("|") for f in part.split()[1:] if f != "-"]
    return set(IRREGULAR.get(verb, []))


IT_END = {"are": "o i a iamo ate ano avo avi ava avamo avate avano ai asti ò ammo aste arono erò erai erà eremo erete eranno erei eresti erebbe eremmo ereste erebbero assi asse assimo assero ato ata ati ate ando",
          "ere": "o i e iamo ete ono evo evi eva evamo evate evano ei esti é emmo este erono erò erai erà eremo erete eranno erei eresti erebbe eremmo ereste erebbero a essi esse essimo essero uto uta uti ute endo",
          "ire": "o i e iamo ite ono isco isci isce iscono ivo ivi iva ivamo ivate ivano ii isti ì immo iste irono irò irai irà iremo irete iranno irei iresti irebbe iremmo ireste irebbero a isca iscano issi isse issimo issero ito ita iti ite endo"}


def romance_forms(d):
    """a Spanish or French entry's forms, roughly (counting needs no more): a noun's plural, an adjective's feminine
    and plurals, a verb's regular endings on its stem -- and on its changed stem (vuelv-, tien-: the forms the
    dictionary does not give are counted where the endings meet a written form)"""
    w, pos = d["word"], d["pos"]
    if pos == "N":
        return {w} | ({d["plural"]} if d["plural"] not in ("-", "PL", "") else set())
    if pos == "AN":
        out = {w, w + "s", w + "es"}
        if d["feminine"]: out |= {d["feminine"], d["feminine"] + "s"}
        if d["comparison"]: out |= set(d["comparison"].split("/"))
        return out
    if pos == "V":
        v = re.sub(r"(se|^se |^s')$", "", w.split(" ")[0]) if LANG == "es" else re.sub(r"rsi$", "re", w.split(" ")[0]) if LANG == "it" else re.sub(r"^(se |s')", "", w).split(" ")[0]
        ends = ES_END if LANG == "es" else IT_END if LANG == "it" else FR_END
        cls = v[-2:] if LANG == "es" else v[-3:] if LANG == "it" else ("er" if v.endswith("er") else "ir" if v.endswith("ir") else "re")
        stem = v[:-2] if LANG != "it" else v[:-3]
        out = {v} | ({stem + e for e in ends.get(cls, "").split()} if len(stem) >= 3 else set())   # (dar, ir: d-, i- would take de, una)
        if d["forms"]: out.add(d["forms"])
        return out | irregular_forms(v)
    return {w}


RU_N = "а я ы и у ю е ё ой ей ом ем ов ев ей ам ям ами ями ах ях ь й ию ии ей ью"
RU_V = "ю у ешь ёшь ет ёт ем ём ете ёте ют ут ишь ит им ите ят ат л ла ло ли ть й йте и ите"
RU_A = "ый ой ий ая яя ое ее ые ие ого его ому ему ым им ых их ыми ими ую юю ей о е"
def russian_forms(d):
    """a Russian entry's forms, roughly (counting needs no more): the stem with the case endings, a verb's and its
    perfective partner's with the person and past endings (+ ся / сь), an adjective's with its agreement endings"""
    w, pos = d["word"], d["pos"]
    if " " in w or "-" in w: return {w}
    if pos == "N":
        stem = w[:-1] if w[-1] in "аяоеьй" else w
        out = {w} | ({d["plural"]} if d["plural"] not in ("-", "") else set())
        return out | ({stem + e for e in RU_N.split()} if len(stem) >= 3 else set())
    if pos == "V":
        out = set()
        for v in [w] + ([d["forms"]] if d["forms"] else []):
            refl = v.endswith(("ся", "сь")); inf = re.sub(r"(ся|сь)$", "", v)
            stem = re.sub(r"(ать|ять|еть|ить|ыть|уть|оть|ти|чь)$", "", inf)
            if len(stem) < 2: out.add(v); continue
            fs = {inf} | {stem + e for e in RU_V.split()} | {stem + v + e for v in "аяеиу" for e in ("л", "ла", "ло", "ли", "ть")}
            out |= {f + ("сь" if f[-1] in "аеёиоуыэюя" else "ся") for f in fs} if refl else fs
        return out
    if pos == "AN":
        stem = w[:-2] if re.search(r"(ый|ой|ий)$", w) else w
        out = {w} | ({d["comparison"]} if d["comparison"] else set())
        return out | ({stem + e for e in RU_A.split()} if len(stem) >= 3 else set())
    return {w}


PL_N = "a u owi em e ie u y i ę ą ów om ami ach i y ia iu iem"
PL_V = "m sz my cie ją ę esz e emy ecie ą isz i imy icie ysz y ymy ycie ł ła ło li ły łem łeś łam łaś liśmy liście łyśmy łyście j jcie"
PL_A = "y i a e ego emu ym im ej ą ych ich ymi imi"
def polish_forms(d):
    """a Polish entry's forms, roughly (counting needs no more): the stem with the case endings, a verb's and its
    perfective partner's with the person and past endings (+ się), an adjective's with its agreement endings"""
    w, pos = d["word"], d["pos"]
    if "-" in w: return {w}
    if pos == "N":
        if " " in w: return {w}
        stem = w[:-1] if w[-1] in "aoeęy" else w
        out = {w} | ({d["plural"]} if d["plural"] not in ("-", "") else set())
        return out | ({stem + e for e in PL_N.split()} if len(stem) >= 3 else set())
    if pos == "V":
        out = set()
        for v in [w] + ([d["forms"]] if d["forms"] else []):
            refl = v.endswith(" się"); inf = v.removesuffix(" się")
            if " " in inf: out.add(v); continue
            stem = re.sub(r"(ać|ować|ywać|iwać|eć|ieć|ić|yć|ąć|nąć|ść|źć|c)$", "", inf)
            if len(stem) < 2: out.add(v); continue
            fs = {inf} | {stem + e for e in PL_V.split()} | {stem + x + e for x in ("a", "ie", "i", "y", "uj", "ą", "ę", "n") for e in PL_V.split()}
            out |= fs
        return out
    if pos == "AN":
        if " " in w: return {w}
        stem = w[:-1] if w[-1] in "yi" else w
        out = {w} | ({d["comparison"]} if d["comparison"] else set())
        return out | ({stem + e for e in PL_A.split()} if len(stem) >= 3 else set())
    return {w}


def forms_of(d):
    """the corpus forms of one entry, as written (case kept)"""
    if LANG == "en":
        return english_forms(d)
    if LANG in ("es", "fr", "it"):
        return romance_forms(d)
    if LANG == "ru":
        return russian_forms(d)
    if LANG == "pl":
        return polish_forms(d)
    if LANG == "zh":
        return {d["word"]}
    key, w = (d["word"], d["pos"]), d["word"]
    if key in WRITTEN_OUT:
        out = set(WRITTEN_OUT[key].split())
    elif d["pos"] == "N":
        out = {w, w + "s", w + "es"}
        if d["plural"] not in ("-", "PL"):
            for p in d["plural"].split("/"):
                out |= {p} if p.endswith(("n", "s")) else {p, p + "n"}
    elif d["pos"] == "V":
        out = verb_forms(w.removeprefix("sich "), d["parts"].removeprefix("sich "), d.get("forms"))
    elif d["pos"] == "AN":
        out = adjective_forms(w, d.get("comparison"))
    else:
        out = {w}
    return out


def sentence_start(forms):
    return {f[:1].upper() + f[1:] for f in forms} - forms


def entries():
    """(order, parsed line) of every entry, in file order"""
    n = 0
    if LANG != "de":
        import words
        for path in words.files(LANG):
            for s in open(path, encoding="utf-8"):
                s = s.rstrip("\n")
                if s.strip() and not s.startswith("#"):
                    n += 1
                    yield n, words.parse_line(s, LANG)
        return
    for path in check.files([]):
        for s in open(path, encoding="utf-8"):
            s = s.rstrip("\n")
            if s.strip() and not s.startswith("#"):
                n += 1
                yield n, check.parse_line(s)


def count_phrases(phrases):
    """phrase (lowercase words tuple) -> occurrences in the sentences"""
    by_first, counts = collections.defaultdict(list), collections.Counter()
    for p in phrases:
        by_first[p[0]].append(p)
    for line in open(SENTENCES, encoding="utf-8", errors="replace"):
        tokens = re.findall(r"[a-zäöüßáéíóúñàâçèêëîïôûùüÿœìòąćęłńóśźżа-яё']+", line.lower()) if LANG != "zh" else list(line.split("\t")[-1].strip())
        for i, t in enumerate(tokens):
            for p in by_first.get(t, ()):
                if tuple(tokens[i:i + len(p)]) == p:
                    counts[p] += 1
    return counts


def main():
    words = collections.Counter()
    for line in open(CORPUS, encoding="utf-8", errors="replace"):
        f = line.rstrip("\n").split("\t")
        if len(f) == 3:
            words[f[1]] += int(f[2])

    first, freq, phrases = {}, {}, {}
    owners, start_owners = collections.defaultdict(set), collections.defaultdict(set)   # form -> words written so / capitalised
    for n, d in entries():
        key = (d["word"], d["pos"])
        if key in first:
            continue                                  # (a homonym: the same forms)
        first[key], freq[key] = n, d["freq"]
        plain = d["word"].removeprefix("sich ")
        if " " in plain or (LANG == "zh" and len(plain) > 1 and d["word"] not in words):   # (a Chinese word the list has not: counted in the sentences, character by character)
            phrases[key] = tuple(re.findall(r"[a-zäöüßáéíóúñàâçèêëîïôûùüÿœа-яё']+", plain.lower())) if LANG != "zh" else tuple(plain)
        else:
            forms = forms_of(d)
            for form in forms:
                owners[form].add(key)
            for form in sentence_start(forms) if d["pos"] != "N" else ():
                start_owners[form].add(key)

    count = collections.Counter()
    for form in owners.keys() | start_owners.keys():
        keys = owners.get(form) or start_owners[form]
        for key in keys:
            count[key] += words[form] / len(keys)
    found = count_phrases(set(phrases.values()))
    for key, tokens in phrases.items():
        count[key] += found[tokens]

    ranked = sorted(first, key=lambda k: (-round(count[k]), freq[k], first[k]))
    with open(DEST, "w", encoding="utf-8") as out:
        out.write("rank\tword\tpos\tcount\n")
        for rank, (word, pos) in enumerate(ranked, 1):
            out.write(f"{rank}\t{word}\t{pos}\t{round(count[(word, pos)])}\n")
    print(f"{len(ranked)} words -> {DEST}; {sum(1 for k in ranked if count[k] == 0)} not found in the corpus")


if __name__ == "__main__":
    main()
