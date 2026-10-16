// STORIES (sentences/STORIES.md): a little WORLD and what happens in it, told in a few sentences. The world: a
// SITUATION (sentences/situations/*.txt: a place, the people, the things, what someone wants and what can go wrong),
// the PLACE's sheet, the season and the weather, the RULES that follow from them (sentences/world/*: hot -> thirsty,
// rain -> wet things, what to wear), a person of the CAST with her likes. The PLOT (its arcs), its BEATS (planned
// before a word is told), PARTS, the MOVES' ways of telling and the NARRATORS are data (sentences/stories.txt): this
// file only builds the world, plans the story, fills the moves' $slots from it, keeps
// who and what is known (ein -> der, er/sie), and has a language's realizer say each clause plan -- in the
// language-free clause format (world/CLAUSES.md: concepts, roles, relations; a thing's pronoun it:X, a person's
// 3sg.f) -- that plan is the story's trace. The world's words are concepts, as tokens (tešiť_sa).
//
//   const teller = createStoryteller(gen, dict, storiesText, say)    (say: plan -> text, e.g. de/realize.js)
//   teller.story(rnd, complexity 1-3, only plot?) -> { sentences: [{ text, move, trace, plan }], world } | null; teller.why()

export function createStoryteller(gen, dict, text, say = (b) => gen.realize(b)) {
  const { meaning, scenes, grammar } = gen;
  if (!scenes?.world) throw new Error("stories need the scenes and the world (scenes.tsv)");
  const W = scenes.world;
  const { plots, parts, beats, moves, joins, narrators, words } = parseStories(text);
  // (every token a plot, beat or part names is a move, a part or a beat: a typo would silently tell nothing)
  for (const toks of [...plots.map((p) => p.tokens), ...[...parts.values(), ...beats.values()].flatMap((alts) => alts.map((a) => a.tokens))])
    for (const t of toks) { const { name } = token(t); if (!moves.has(name) && !parts.has(name) && !beats.has(name)) throw new Error(`stories: no move, part or beat ${name}`); }
  // ---- THE SESSION's memory (one teller, several stories): the ways, joins, beats, arcs and words told -- less likely
  //      again; it fades by half after each story told, so a reader of several stories meets no frame over and over
  const told = new Map(), seen = new Map(), fade = (m) => { for (const [k, v] of m) m.set(k, v / 2); };
  const byWord = new Map();   // ("Leiter|N" -> its entries, every sense)
  for (const e of dict.entries) { const k = `${e.word}|${e.pos}`; if (!byWord.has(k)) byWord.set(k, []); byWord.get(k).push(e); }
  // (a word; or a CONCEPT's ID -- the world's data names concepts --: its words, the commonest first)
  const byConcept = new Map();
  for (const e of dict.entries) { const k = `${e.concept}|${e.pos}`; if (!byConcept.has(k)) byConcept.set(k, []); byConcept.get(k).push(e); }
  for (const es of byConcept.values()) es.sort((a, b) => (a.sense > 0) - (b.sense > 0) || a.rank - b.rank);   // (a word's other sense last: data.js)
  // (a concept's words: the one the realizer says first -- gen.word: its commonest, or the language's preferred one)
  const entries = (w, pos) => { const es = byWord.get(`${w}|${pos}`); if (es) return es; const cs = byConcept.get(`${String(w).replace(/_/g, " ")}|${pos}`) ?? [], main = cs.length > 1 ? gen.word(w, pos) : null; return main ? [main, ...cs.filter((e) => e !== main)] : cs; };
  const entry = (w, pos) => entries(w, pos)[0];
  // (a pronoun: a person's by sex -- 3sg.f --, a thing's as it:X / them:X, X its concept: each language says it its way)
  const PERSON = new Set(["3sg.m", "3sg.f", "3pl"]);
  const isPron = (v) => PERSON.has(v) || /^(it|them):/.test(v ?? "");
  const thingPron = (v) => /^(it|them):/.test(v ?? "");
  const personPron = (ent) => (ent.g === "f" ? "3sg.f" : "3sg.m");
  const names = { m: (grammar.words["name.m"] ?? []).map((x) => x.split(" [")[0]), f: (grammar.words["name.f"] ?? []).map((x) => x.split(" [")[0]) };
  const val = (e) => (e ? scenes.valence(e) : 0);
  const gender = (n) => (n.article === "die" ? "f" : n.article === "das" ? "n" : "m");   // (German's: when er/sie/es would be unclear)
  const feelings = (sign) => (words[sign < 0 ? "story.bad-feeling" : "story.good-feeling"] ?? []).filter((w) => Math.sign(val(entry(w, "AN"))) === sign);
  // (what makes a state: an action that gives it and needs no object -- gearbeitet: müde; for PAST)
  const makers = new Map();
  const makersOf = (state) => {
    // (only what needs nothing but the normal states -- gesund, wach --: not hungern, which needs arm)
    if (!makers.has(state)) makers.set(state, dict.entries.filter((e) => { const c = scenes.cond(e); return e.pos === "V" && c?.gives?.includes(state) && !c.involuntary && c.needs.every((a) => scenes.state(a)?.default) && meaning.frames(e).some((f) => !f.slots.length); }));
    return makers.get(state);
  };

  let why = "";   // (why the last story could not be told: teller.why())
  // complexity 1-3: how often two moves become one sentence (JOINS), which ways may be told (MOVE ... level N)
  const JOINS = [0, 0, 1, 1.8];
  // (only: a plot's name -- the stories of one plot, for a bench of it)
  function story(rnd, complexity = 2, only = null) {
    const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
    const chance = (p) => rnd() < p;
    const weighted = (xs) => { let r = rnd() * xs.reduce((t, x) => t + x.w, 0); for (const x of xs) if ((r -= x.w) < 0) return x; return xs[xs.length - 1]; };
    // ---- THE NARRATOR (stories.txt NARRATOR): how this story is told -- how often two moves join (joins), an
    //      optional move is told (maybe), a thing is described (decor, adorn), a manner said (manner), a way with
    //      speech is chosen (speech); its other keys weigh the alternatives tagged ~key; WORDS name@narrator: its words
    const nar = { joins: 1, maybe: .5, decor: .55, adorn: .35, manner: .5, speech: 1, ...(narrators.length ? weighted(narrators) : { name: "-" }) };
    const taste = (alt) => alt.when.filter((c) => c.startsWith("~")).reduce((t, c) => t * (nar[c.slice(1)] ?? 1), 1);
    const used = {};   // (a joining word not twice in a row: dann ... danach)
    // (REPETITION: the words said, counted -- this story's and, fading, the session's: a list's word least said wins)
    const times = (w) => seen.get(String(w).toLowerCase()) ?? 0;
    const word = (k) => { const xs = words[`${k}@${nar.name}`] ?? words[k] ?? [""], rest = xs.filter((x) => x !== used[k]), pool = rest.length ? rest : xs; return (used[k] = weighted(pool.map((x) => ({ x, w: 1 / (1 + 3 * times(x)) }))).x); };

    // ---- WHO: a person of the cast (her sheet: job, traits, likes, dislikes)
    const actor = pick(W.actors) ?? null;
    const g1 = actor?.g ?? (chance(.5) ? "f" : "m");
    const p1 = { name: actor?.name ?? pick(names[g1]), g: g1, actor };
    const likes = new Set(actor?.likes ?? []), dislikes = new Set(actor?.dislikes ?? []);

    // ---- WHERE and WHEN: the situation, its place's sheet, the season, the weather
    const sit = pick(scenes.situations());
    if (!sit) return (why = "no situation"), null;
    const placeWord = pick(sit.place), sheet = W.places.get(placeWord) ?? { out: false, props: {}, things: [], people: [], weather: [] };
    const out = sheet.out;
    // (outside, the place's own weather as far as the season has it -- a beach in summer, not in autumn; the season
    //  chosen by how well its weather fits the place)
    const fit = (season) => { const sp = W.seasons.get(season) ?? []; return sheet.weather.flatMap(([k, a]) => sp.filter(([j]) => j === k).map(([, b]) => [k, a * b])); };
    const seasons = [...W.seasons.keys()].map((k) => ({ k, w: out && sheet.weather.length ? fit(k).reduce((t, [, x]) => t + x, 0) : 1 })).filter((x) => x.w > 0);
    const season = seasons.length ? weighted(seasons).k : pick([...W.seasons.keys()]) ?? null;
    const wPairs = out && sheet.weather.length && fit(season).length ? fit(season) : W.seasons.get(season) ?? [];
    // (bad weather where it could spoil something -- the situation's troubles a rule could cause: rain, a wet tent --
    //  is more likely: a story is told for what happens)
    const spoilable = out && sit.troubles.some((t) => W.rules.some((r) => r.then.some((e) => e.kind === "thing" && e.values.includes(t.state))));
    const pickWeather = (fine) => { const xs = wPairs.filter(([k]) => !fine || !W.weather.get(k)?.bad).map(([k, w]) => ({ k, w: w * (spoilable && W.weather.get(k)?.bad ? 4 : 1) })); return xs.length ? weighted(xs).k : null; };
    // (what the place is like -- outside, its weather too -- and what follows from it: RULES)
    function climate(name) {
      const weather = W.weather.get(name) ?? null, env = { ...sheet.props, ...(out && weather ? weather.props : {}) };
      const holds = (c) => (c === "out" ? out : c === "in" ? !out : c.startsWith("weather=") ? c.slice(8) === name : (([k, v]) => !!env[k]?.includes(v))(c.split("=")));
      const fired = W.rules.filter((r) => r.when.every(holds));
      const effects = (kind) => fired.flatMap((r) => r.then.filter((e) => e.kind === kind).flatMap((e) => e.values));
      return { name, weather, fired, states: effects("state"), things: effects("thing"), wear: effects("wear").filter((w) => entry(w, "N")) };
    }
    let cl = climate(pickWeather(false));

    // ---- WHAT: the wish (caused by the place or liked: more likely), what is in the way, who helps
    const wants = sit.wants.filter((w) => !scenes.state(w.state)?.default);   // (a normal state is no motive)
    if (!wants.length) return (why = `${sit.name}: no want`), null;
    const want = weighted(wants.map((w) => ({ ...w, w: 1 + (cl.states.includes(w.state) ? 4 : 0) + (likes.has(w.obj) || likes.has(w.verb) ? 2 : 0) - (dislikes.has(w.obj) || dislikes.has(w.verb) ? 0.9 : 0) })));
    const troubles = sit.troubles.filter((t) => want.uses.includes(t.thing));
    let caused = troubles.filter((t) => out && cl.things.includes(t.state));   // (rain: her book gets wet)
    // (out in bad weather only when it causes the trouble -- not watering the flowers in the rain)
    if (out && cl.weather?.bad && !caused.length) { cl = climate(pickWeather(true)); caused = troubles.filter((t) => cl.things.includes(t.state)); }
    const { name: weatherName, weather, fired } = cl, causedStates = cl.states, wearable = cl.wear;
    const trouble = (caused.length && chance(.7) ? pick(caused) : pick(troubles)) ?? null;
    const lack = pick(sit.lacks.filter((l) => want.uses.includes(l.thing) || l.thing === want.obj)) ?? null;
    let p2 = null;
    const who = trouble?.by === actor?.job ? null : trouble?.by ?? pick(sit.people.filter((x) => x !== actor?.job)) ?? "kin";   // (not one of her own trade: she mends it herself)
    if (who === "kin") { const n = entry(pick(words["story.kin"] ?? ["brat"]), "N"); if (n) p2 = { noun: n, g: gender(n), kin: true }; }
    else if (who) { const n = entry(who, "N"); if (n) p2 = { noun: n, g: gender(n), kin: (words["story.close"] ?? []).includes(who) }; }   // (sein Freund: one of hers)

    // ---- the THINGS: a thing's sense is a thing's (inanimate), the one of the setting (die Leiter, not der Leiter)
    const things = new Map();
    const sense = (w) => { const es = entries(w, "N"), thingy = es.filter((e) => meaning.fits(e, "inanimate")); return thingy.find((e) => scenes.local(sit.setting, e)) ?? thingy[0] ?? es[0]; };
    // (w: as the realizer is told it; states: what it is now -- heiß, sauber -- and done: what was done to it, for its attributes)
    const thing = (w) => { if (!things.has(w)) { const n = sense(w); if (!n) return null; things.set(w, { noun: n, g: gender(n), base: w, w, states: new Map(), done: null }); } return things.get(w); };
    const wantObj = want.obj ? thing(want.obj) : null;
    for (const t of sit.troubles) { const x = thing(t.thing); if (x && x !== wantObj) x.here = true; }
    for (const w of sit.own) { const x = thing(w); if (x) x.own = true; }
    const placeN = entry(placeWord, "N");
    if (!placeN) return (why = `no place ${placeWord}`), null;
    const place = { noun: placeN, g: gender(placeN), w: placeWord, here: true };
    const troubleT = trouble && thing(trouble.thing), lackT = lack && thing(lack.thing);
    const world = { situation: sit.name, setting: sit.setting, place: placeWord, season, weather: weatherName, actor: p1.name, p1, p2, said: [], failed: [], flags: new Set() };

    // ---- REFERENCE: a name; ihr Bruder / der Kellner; er/sie for the last subject unless a thing of the same gender
    //      was just named; a thing: ein first (none for a mass noun), der then; her own: ihr ... first
    let lastSubj = null, mentioned = [], before = [];
    const pronThing = new Map();   // (a thing said as a pronoun -- it:X: which one)
    // (works there -- the place's people, a role of the setting, or staff every building has: der Hausmeister)
    const p2here = () => !!p2 && !p2.kin && (!!scenes.role(sit.setting, p2.noun) || sheet.people.includes(p2.noun.cid) || (!out && (words["story.building-staff"] ?? []).includes(p2.noun.cid)));
    const owner = () => (p1.g === "f" ? "poss.3sg.f" : "poss.3sg.m");
    function ref(ent, asSubj = false) {
      let r;
      // (a thing of the same gender just named makes er/sie unclear -- unless she was named in this sentence already)
      const rival = !mentioned.includes(ent) && [...before, ...mentioned].some((x) => x !== p1 && x !== p2 && x.g === ent.g);
      // (and a person just named, not the subject, when the other person is of the other gender: bedankte sich bei ihm)
      const clear = (ent === p1 || ent === p2) && [...before, ...mentioned].includes(ent) && !(p1 && p2 && p1.g === p2.g && p2.known);
      // (the same one goes on doing things: sie -- a thing of her gender named meanwhile does not make that unclear,
      //  only the other person of her gender: "Sarah nahm die Pfanne. Sie stellte sie auf den Herd.")
      const goesOn = asSubj && (ent === p1 || ent === p2) && ent === lastSubj && ![...before, ...mentioned].some((x) => (x === p1 || x === p2) && x !== ent && x.g === ent.g);
      if ((ent === p1 || ent === p2) && (((ent === lastSubj || clear) && !rival) || goesOn)) r = personPron(ent);
      else if (ent.name) r = "name:" + ent.name;
      else if (ent.kin) r = p1.known || !p1.name ? `${owner()}:${ent.noun.cid}` : `name.${p1.name}:${ent.noun.cid}`;   // (before she is named: Lisas Bruder)
      else if (ent === p2) r = (ent.known || p2here() ? "def:" : "indef:") + ent.noun.cid;
      else if (ent.own && !ent.known) r = `${owner()}:${ent.w}` + decorate(ent);
      // (a thing just named, when nothing else of its gender was: Es gab dort einen Toaster. Aber er war kaputt.
      //  as an object only another THING of its gender makes it unclear: Ihr Bruder reparierte ihn; nahm den Kuchen und aß ihn)
      //  -- nor a person of its gender just named: "Während sie ihr Freund reparierte" (Laura or the camera?))
      else if (ent.known && [...before, ...mentioned].includes(ent) && ![...before, ...mentioned].filter((x) => asSubj || (x !== p1 && x !== p2)).concat(asSubj ? [p1, p2].filter((p) => p?.known) : []).some((x) => x !== ent && x.g === ent.g)) { r = `it:${ent.w}`; pronThing.set(r, ent); }
      else r = ent.known || ent.here ? "def:" + ent.w + decorate(ent) : (ent.states && gen.uncounted(ent.noun) ? "none:" : "indef:") + ent.w;   // (Öl, Wasser: no article)
      ent.known = true;
      if (ent !== p1 && ent !== p2) ent.real = true;   // (named as there -- not only wished for)
      mentioned.push(ent);
      if (asSubj) lastSubj = ent;
      return r;
    }
    // the wanted action's object as the situation says it: bare (Brot toasten), ein (then der), der, sein Gesicht
    function wantArg() {
      const pl = (want.num === "pl" ? "+pl" : "") + (want.adj ? "+adj:" + want.adj : "");   // (das alte Haus)
      if (want.det === "none") { if (!wantObj.own) wantObj.known = true; return "none:" + wantObj.w + pl; }   // (Fahrrad fahren ... aber ihr Fahrrad)
      if (want.det === "poss") { wantObj.own = true; return `${owner()}:${wantObj.w}${pl}`; }
      if (want.det === "def") wantObj.here = true;
      if (want.det === "indef" && !wantObj.real) { wantObj.known = true; return "indef:" + wantObj.w + pl; }   // (ein Foto machen ... machte ein Foto)
      const r = ref(wantObj);
      return thingPron(r) ? r : r + pl;   // (no adjective on a pronoun)
    }
    // (a state's forms are concepts: said with their German words -- hladný -> hungrig)
    const stateWord = (atom) => { const st = scenes.state(atom), fs = st?.forms.filter(([k, w]) => entry(w, k === "adj" ? "AN" : "N")) ?? []; return fs.length ? pick(fs) : null; };
    const thereList = () => {
      // (every thing the story will use is placed first -- critics read "die Waage" unintroduced as an error, even where
      //  the place has one; not die Wand of a room)
      const fresh = (x) => x && !x.own && !x.known && !meaning.fits(x.noun, "building-part");
      const solid = (x) => (meaning.fits(x.noun, "object") || meaning.fits(x.noun, "food")) && !gen.uncounted(x.noun);   // (not "Es gab dort eine Temperatur / Wasser")
      const told = want.det === "def" && fresh(wantObj) && solid(wantObj) ? wantObj : null;   // (die Torte essen: es gab eine Torte)
      const used = ["BLOCK", "BREAK", "SPOIL"].some(plotHas);   // (the trouble's thing only when the plot puts it in the way)
      return [...new Set([told, used && fresh(troubleT) && solid(troubleT) ? troubleT : null].filter(Boolean))];   // (not "eine Glocke und eine Glocke")
    };
    // (a feature of the place to say -- only one that causes the wish: Die Sauna war heiß. Sie war durstig.; a feature
    //  that leads nowhere reads as filler -- story bench 8)
    // (in der hellen Küche: a property of its sheet first -- each as likely -- then its value; now and then)
    const placeAdorned = () => {
      const ok = (v) => entry(v, "AN") && val(entry(v, "AN")) >= 0 && !states.has(v) && !inWord(v, placeN) && forPlace.has(v);
      const ps = Object.values(sheet.props).map((vs) => vs.filter(ok)).filter((vs) => vs.length);
      return `def:${place.w}` + (complexity >= 2 && ps.length && chance(nar.adorn * .85) ? `+adj:${pick(pick(ps))}` : "");
    };
    const featureRule = fired.find((r) => r.then.some((e) => e.kind === "state" && e.values.includes(want.state)) && r.when.some((c) => sheet.props[c.split("=")[0]]));
    const featureCond = featureRule?.when.find((c) => sheet.props[c.split("=")[0]]);
    const feature = featureCond ? featureCond.split("=")[1] : null;
    // (the wanted object was many: a plural; or bare food whose plural is the same word -- Würstchen grillen, not Schlitten fahren)
    //  -- unless it was bought as one: kaufte einen Kuchen ... aß ihn)
    const manyOf = () => want.num === "pl" || (!wantObj.one && want.det === "none" && wantObj.noun.plural === wantObj.noun.word && meaning.fits(wantObj.noun, "food"));
    const many = (r) => { if (!manyOf()) return r; if (!thingPron(r)) return r + "+pl"; const t = `them:${wantObj.w}`; pronThing.set(t, wantObj); return t; };   // (die Frikadellen ... sie waren)
    const endsVerb = () => { const st = scenes.state(want.state), ends = st?.ends; return ends && ends !== want.verb && wantObj && (st.of ?? []).some((c) => meaning.fits(wantObj.noun, c)) ? ends : null; };
    // (what she did before that made the state: one she likes -- her sheet: Vorher war sie geschwommen.)
    const pastVerb = pick(makersOf(want.state).filter((e) => likes.has(e.cid)).map((e) => e.cid)) ?? null;
    const obstacle = () => (words["story.obstacles"] ?? []).some(plotHas);   // (the plot puts something in the way)
    const resultMemo = new Map();
    const resultAdj = () => { const k = `${world.flags.has("finished")}|${world.flags.has("helped")}|${tenseNow()}`; if (!resultMemo.has(k)) resultMemo.set(k, resultOf()); return resultMemo.get(k); };   // (one answer: the conds and the slots agree)
    function resultOf() {   // (what the last action gives the doer -- satt after essen -- or after an obstacle a good feeling)
      const v = entry(world.flags.has("finished") ? endsVerb() : want.verb, "V"), gives = (v && scenes.cond(v)?.gives) ?? [];
      // (an end: the opposite of a bad state -- satt after hungrig, sauber after schmutzig; not "nun war er müde")
      const good = (a) => { const st = scenes.state(a), adj = st?.forms.find(([k]) => k === "adj"); return !!adj && val(entry(adj[1], "AN")) >= 0 && !!st.opposite && !scenes.state(st.opposite)?.default; };
      const st = gives.find((a) => good(a) && a !== want.state && !scenes.state(a).default);
      const glad = [...feelings(1), ...(world.flags.has("helped") && hurried() ? words["story.relieved"] ?? [] : [])];   // (erleichtert: after help, when she was in a hurry)
      if ((words["story.sombre"] ?? []).includes(want.verb)) return null;   // (no glad end to a burial)
      if (world.flags.has("praised")) return world.flags.has("urgent") ? pick(words["story.relieved"] ?? []) ?? pick(feelings(1)) : pick(feelings(1));   // (one of hers liked what she made -- in time: relief)
      return st ? scenes.state(st).forms.find(([k]) => k === "adj")[1] : obstacle() && tenseNow() ? pick(glad) : null;
    }
    // (an everyday adjective that fits a noun -- not a state, of the valence asked: neutral to describe a thing that
    //  will go wrong -- einen alten Toaster --, good for a result -- Die Torte war lecker.)
    const states = new Set(grammar.words["adj.state"] ?? []);
    const inWord = (a, noun) => { const w = entry(a, "AN")?.word ?? a; return noun.word.toLowerCase().includes(w.slice(0, -1)); };   // (not "die alte Altstadt": said in German)
    const bland = new Set(words["story.bland"] ?? []);
    const describe = (noun, sign) => pick((grammar.words["adj.free"] ?? []).filter((a) => !states.has(a) && !bland.has(a) && !inWord(a, noun) && entry(a, "AN") && meaning.describes(entry(a, "AN"), noun) && Math.sign(val(entry(a, "AN"))) === sign)) ?? null;
    // (decoration: only the properties of story.adorn-place / adorn-thing -- colour, size, comfort -- now and then)
    const adornWords = (k) => new Set((words[k] ?? []).flatMap((p) => W.props.get(p)?.values ?? []));
    const forPlace = adornWords("story.adorn-place"), forThing = adornWords("story.adorn-thing");
    const adorn = (np, noun) => { const a = complexity >= 2 && chance(nar.adorn) ? pick([...forThing].filter((x) => entry(x, "AN") && !inWord(x, noun) && meaning.describes(entry(x, "AN"), noun))) : null; return a ? `${np}+adj:${a}` : np; };
    const tool = trouble && pick((W.tools.get(trouble.verb) ?? []).filter((t) => !t.for.length))?.n;
    // (what she says of it: a word of praise that fits the thing -- Die Torte war lecker, der Film spannend)
    const praise = wantObj && Object.keys(words).find((k) => k.startsWith("story.praise.") && meaning.fits(wantObj.noun, k.slice(13)));
    const comment = praise && pick(words[praise].filter((a) => entry(a, "AN") && !inWord(a, wantObj.noun) && meaning.describes(entry(a, "AN"), wantObj.noun)));
    let plot = null;
    const plotHas = (name) => !!plot && tokensOf(plot).includes(name);

    // ---- THE THINGS' STORE: what each is now (states: heiß, sauber -- set by what is done to it, by what the story
    //      says of it) and what was done to it (done: gebraten; kochend while it boils) -- said with it later, as an
    //      author would: in die heiße Pfanne, das kochende Wasser, die gebratenen Frikadellen, den reparierten Herd
    const entOf = (v) => { if (!v) return null; if (pronThing.has(v)) return pronThing.get(v); const m = String(v).match(/^(?:def|indef|none|no|poss[\w.]*|it|them):([^+]+)/); return m ? [...things.values()].find((t) => t.w === m[1] || t.base === m[1]) ?? null : null; };
    const setState = (t, st, named) => { const os = scenes.objstate(st); if (!t?.states || !os) return; if (os.opposite) t.states.delete(os.opposite); t.states.set(st, { at: world.said.length, named, used: false }); };
    const noAttr = new Set(words["story.no-attribute"] ?? []), partII = new Set(grammar.words["participle.II"] ?? []), partI = new Set(grammar.words["participle.I"] ?? []);
    let decor = [];   // (this sentence's attributes: marked as said when it is told -- one a sentence)
    function decorate(ent) {
      if (complexity < 2 || decor.length || !ent.states) return "";
      // (a state the story just named is not said again at once: not "Die Pfanne war schmutzig. Sie spülte die schmutzige Pfanne.")
      const mending = ent === troubleT && (mendProc()?.cursor > 0 || world.flags.has("cleared"));   // (not "die kaputte Lampe" while it is mended)
      const cands = [...ent.states].filter(([st, x]) => !x.used && !noAttr.has(st) && entry(st, "AN") && (!x.named || world.said.length - x.at >= 2) && !(mending && st === trouble.state)).map(([st, x]) => ({ at: x.at, mod: "adj:" + st, mark: x }));
      // (and what was done to it -- gebraten --; what it is doing, kochend, not right after it was said: "Das Wasser kochte.")
      if (ent.done && !ent.done.used && (ent.done.kind === "II" || world.said.length - ent.done.at >= 2)) cands.push({ at: ent.done.at + .5, mod: `part(${ent.done.kind},${ent.done.verb})`, mark: ent.done });
      const c = cands.sort((a, b) => b.at - a.at)[0];
      if (!c || !chance(nar.decor)) return "";
      decor.push(c.mark);
      // (a second word of the same moment -- the texture of a dish: die goldenen, knusprigen Brötchen)
      const twin = c.mod.startsWith("adj:") && cands.find((x) => x !== c && x.mod.startsWith("adj:") && x.at === c.at && !x.mark.named);
      if (twin) { decor.push(twin.mark); return `+${c.mod}+${twin.mod}`; }
      return "+" + c.mod;
    }
    // what a told sentence changes: the states its verbs give (füllen: voll; conditions.txt), what it says a thing is
    // (Der Herd war kaputt.), what it did to a thing (participle.II: gebraten; a process: participle.I, kochend), the
    // procedure's `gives`
    function effects(clauses, move) {
      const marks = words["story.marks"] ?? [];
      for (const c of Object.values(clauses)) {
        // (a question, a wish, a plan changes nothing: "Kannst du meinen Stuhl putzen?" does not make it clean)
        if (["YESNO", "WH"].includes(c.type) || c.args.modal || c.args.mood || ["when-past", "when", "if", "if-unreal", "whether"].includes(c.args.link?.[0])) continue;
        const a = c.args, v = a.verb?.[0], e = v && entry(v, "V"), obj = entOf(a.patient?.[0]), subj = entOf(a.subj?.[0]);
        for (const atom of (e && scenes.cond(e)?.gives) ?? []) if (atom.startsWith("A:")) setState(obj, atom.slice(2), false);
        if (/^adj:/.test(a.pred?.[0] ?? "") && (v === "byť" || v === "stať_sa")) setState(subj, a.pred[0].slice(4), true);
        if (trouble && v && v === scenes.objstate(trouble.state)?.become) setState(subj, trouble.state, true);   // (ging kaputt)
        if (!move.split("+").some((m) => marks.includes(m))) continue;
        if (obj?.states && partII.has(v)) obj.done = { verb: v, kind: "II", at: world.said.length, used: false };
        else if (subj?.states && !a.patient && partI.has(v)) subj.done = { verb: v, kind: "I", at: world.said.length, used: false };
      }
      for (const { l, p: pr } of pending) if (pr.mend) for (const w of wantProc()?.lines ?? []) if (w.verb === l.verb && w.things.some((x) => l.things.includes(x))) w.skip = true;
      for (const { l } of pending) {
        for (const g of l.gives) { const [n, st] = g.split(":"); setState(n === "obj" ? l.obj : thing(oneOf(n)), st, false); }
        if (l.marks.includes("senses")) world.flags.add("sensed");   // (she tasted it, looked at it: a verdict is earned)
      }
      // (a procedure told to its end -- but its close: the mend's clears the way (helped, when another did it); the
      //  wish's makes its thing what was done: die gebratenen Frikadellen)
      for (const pr of new Set(pending.map((x) => x.p))) {
        if (pr.lines.slice(pr.cursor).some((l) => l.kind !== "close")) continue;
        if (pr.mend) {   // (and the thing is no more what was wrong: not "der kaputte Backofen" after the repair)
          world.flags.add("cleared"); if (world.flags.has("helper")) world.flags.add("helped");
          const op = scenes.objstate(trouble.state)?.opposite; troubleT.states.delete(trouble.state); if (op) setState(troubleT, op, false);
        }
        else if (wantObj && partII.has(want.verb)) wantObj.done = { verb: want.verb, kind: "II", at: world.said.length, used: false };
      }
    }

    // ---- THE PROCEDURES (world/procedures.txt): what doing the wish is -- and mending its trouble -- step by step,
    //      told instead of one sentence. The WISH's: the thing in the way stops it at the first line that uses it
    //      (broken or spoilt in use: the line after it); from there it waits for the flag `cleared`. The MEND's: its
    //      obj the thing in the way, done by her or by the one who helps (the flag `helper`); told to its end, it clears
    //      the way. The FOCUS says which one the moves tell: a PART names it (PART FIXWORK mend : ...).
    const avail = new Set([...sit.things, ...want.uses, ...sheet.things, ...sit.own]);
    // (how surely a thing is here: the wish uses it, the situation has it, the place has it)
    const rank = (n) => (want.uses.includes(n) ? 3 : sit.things.includes(n) || sit.own.includes(n) ? 2 : sheet.things.includes(n) ? 1 : 0);
    const oneOf = (g) => g.split("/").filter((n) => avail.has(n)).sort((a, b) => rank(b) - rank(a))[0] ?? g.split("/")[0];   // (Pfanne/Bratpfanne: the one here)
    const NOUNED = new Set(["subj", "pp", "patient", "second", "recipient", "as", "theme", "topic", "cause", "basis", "purpose", "companion", "opponent", "instrument", "share", "result", "substitute", "location", "goal", "source", "path", "bare"]);
    function readLine(l, obj) {
      const parts = [...l.clause.matchAll(/([\w.-]+)=("[^"]*"|\S+)/g)].map(([, k, v]) => {
        v = v.replace(/^"|"$/g, "");
        const prep = k === "pp" ? v.slice(0, v.indexOf(":") + 1) : "", np = v.slice(prep.length);
        if (!NOUNED.has(k) || np === "3sg.n" || /^(def|indef|none|no|num\.\w+):/.test(np)) return { k, v };   // (said as it stands)
        const nw = np.match(/^(new|own|bare):(.*)$/);   // (new:obj -- einen neuen Stift; own:Bauch -- ihren Bauch; bare:obj -- nach gebratenen Frikadellen)
        if (nw) { const [head, ...mods] = nw[2].split("+"); return { k, prep, base: head === "obj" ? "obj" : oneOf(head), mods, [nw[1]]: true }; }
        const [head, ...mods] = np.split("+"), opt = head.startsWith("~"), base = head === "obj" ? "obj" : oneOf(head.replace(/^~/, ""));
        return { k, prep, base, mods, opt };
      });
      const nouns = parts.filter((p) => p.base).map((p) => p.base);
      return { ...l, parts, obj, verb: parts.find((p) => p.k === "verb")?.v, nouns, things: nouns.map((n) => (n === "obj" ? obj?.base : n)) };
    }
    // the lines of the procedure for `verb` whose object `objT` (the noun `objWord`) fits -- of those, the one whose
    // things are most surely here (a counter's scales, not a shelf); a detail only in complex stories, a line with an
    // `if` only for its kind of thing, a ~thing only where it is, a fetch not when its thing is there already
    function pickProc(verb, objT, objWord) {
      const fits = (c) => (c === "-" ? !objT : !!objT && (/^[A-ZÄÖÜ]/.test(c) ? objWord === c : meaning.fits(objT.noun, c)));   // (- no object: sich ausruhen)
      const score = (p) => p.here.reduce((t, g) => t + Math.max(...g.map(rank)), 0);
      const P = W.procedures.filter((p) => p.verbs.includes(verb) && p.of.some(fits) && p.here.every((g) => g.some((n) => avail.has(n)))).sort((a, b) => score(b) - score(a))[0];
      if (!P) return null;
      const there = (l) => { const a = l.parts.find((p) => p.k === "patient"); return !!a?.base && (a.base !== "obj" ? avail.has(a.base) : objT !== wantObj || avail.has(want.obj) || want.det === "def" || !!wantObj.own); };
      return P.lines.filter((l) => (complexity >= 3 || !l.detail) && (!l.if.length || l.if.some(fits))).map((l) => readLine(l, objT))
        .filter((l) => l.parts.every((p) => !p.opt || avail.has(p.base)) && !(l.marks.includes("fetch") && there(l)));
    }
    const procs = new Map(), memo = (k, f) => { if (!procs.has(k)) procs.set(k, f()); return procs.get(k); };
    const wantProc = () => (!plot ? null : memo(plot.key, () => {
      if (complexity < 2) return null;
      // (a step the mending does already is not done again: the waiter filled the cup -- she does not fill it)
      const lines = pickProc(want.verb, wantObj, want.obj)?.filter((l) => !(trouble && troubleT && l.verb === trouble.verb && l.nouns.includes(troubleT === wantObj ? "obj" : troubleT.base)));
      if (!lines?.length) return null;
      const obst = plotHas("LACK") ? lackT : ["BLOCK", "BREAK", "SPOIL"].some(plotHas) ? troubleT : null;
      const at = obst ? lines.findIndex((l) => l.nouns.includes(obst === wantObj ? "obj" : obst.base)) : -1;
      // (nothing in the way: no line waits; in the way but not used by a line: all wait for the mending)
      // (a missing thing is seen before the work begins: not the oil heating while she walks to the market; the dish
      //  that burns: the work stops after its decisive step -- story.in-work: BURN)
      const burnAt = (words["story.in-work"] ?? []).some(plotHas) ? lines.findIndex((l) => l.kind === "key") : -1;
      const stop = !obst ? (burnAt >= 0 ? burnAt + 1 : lines.length) : at < 0 || obst === lackT ? 0 : at + ((words["story.in-use"] ?? []).some(plotHas) ? 1 : 0);
      return !obst || stop < lines.filter((l) => l.kind !== "close").length ? { lines, stop, at, cursor: 0 } : null;   // (in the way: at least one line after it)
    }));
    const mendProc = () => memo("mend", () => { const lines = complexity >= 2 && trouble && troubleT ? pickProc(trouble.verb, troubleT, trouble.thing) : null; return lines?.length ? { lines, stop: lines.length, at: -1, cursor: 0, mend: true } : null; });
    let focus = "want", pending = [];   // (which procedure the moves tell; the lines the sentence being built tells, with theirs)
    const proc = () => (focus === "mend" ? mendProc() : wantProc());
    const lineAt = (k) => proc()?.lines[k] ?? null;
    // (a step the mending did already is not done again -- he switched the lamp on: she does not; effects marks them)
    const settle = (pr) => { while (pr?.lines[pr.cursor]?.skip) pr.cursor++; return pr; };
    const cur = () => settle(proc())?.cursor ?? 0;
    const waits = (k) => k >= proc().stop && !world.flags.has("cleared");
    const nextIs = (kind, k = cur()) => { const l = lineAt(k); return !!l && l.kind === kind && !waits(k); };
    // (who does the steps: her -- or, mending, the one who helps)
    const doer = () => (focus === "mend" && world.flags.has("helper") && p2 ? p2 : p1);
    // a line as the parts of a clause: its nouns the story's things (der Herd once it is there), obj the wish's
    function lineFrag(line) {
      const f = {};
      for (const p of line.parts) {
        let v = p.v;
        if (p.base) {
          // (the wish's thing: as the wish said it until it is there -- bare stays bare: füllte das Glas mit Wasser)
          // (in a prepositional phrase with its article -- auf das Fahrrad --, but a mass as it is: mit Wasser)
          //  -- a mass or many: holte Fahrrad is no German, holte ihr Fahrrad is)
          const t = p.base === "obj" ? line.obj : thing(p.base);
          if (!t) return null;
          if (p.bare) { (f[p.k] ??= []).push(p.prep + `none:${t.w}` + (t === wantObj && partII.has(want.verb) ? `+part(II,${want.verb})` : "") + (t === wantObj && manyOf() ? "+pl" : "")); continue; }
          if (p.new || p.own) { (f[p.k] ??= []).push(p.prep + (p.new ? `${t.newSaid ? "def" : "indef"}:${t.w}+adj:neu` : `${owner()}:${t.w}`) + (p.mods.length ? "+" + p.mods.join("+") : "")); if (p.new) t.newSaid = true; continue; }   // (einen neuen ..., then den neuen)
          if (p.base === "obj" && t !== wantObj) v = ref(t, p.k === "subj");   // (the thing in the way: der Herd, er)
          else if (p.base === "obj") { const bare = want.det === "none" && !wantObj.real && (gen.uncounted(wantObj.noun) || manyOf()) && (p.k === "patient" || p.k === "pp"); v = (wantObj.known || p.k !== "patient" || want.det === "none") && !bare ? many(ref(wantObj, p.k === "subj")) : wantArg(); if (bare) wantObj.real = true; }   // (in sein Auto, not "in Auto")
          else { if (avail.has(p.base)) t.here = true; v = ref(t, p.k === "subj"); }
          if (p.k === "pp" && isPron(v)) v = `def:${t.w}` + (v.startsWith("them:") ? "+pl" : "");   // (auf das Fahrrad, not "auf es")
          if (p.mods.length && !isPron(v)) v += "+" + p.mods.join("+");
          else if (p.mods.includes("pl") && v.startsWith("it:")) { v = `them:${t.w}`; pronThing.set(v, t); }   // (die Kohlen ... sie glühten)
          v = p.prep + v;
        }
        (f[p.k] ??= []).push(v);
      }
      return f;
    }
    // (what the next step is done with: a tool of tools.txt the situation or the place has -- Mit dem Löffel ...)
    // (a tool `for` some kinds only for a thing of those: a fork for the steak, a spoon for the soup)
    const toolOf = (l) => (l && !l.parts.some((p) => p.k === "pp" && p.v?.startsWith("with:")) && (W.tools.get(l.verb) ?? []).find((t) => avail.has(t.n) && (!t.for.length || (!!l.obj && t.for.some((c) => meaning.fits(l.obj.noun, c)))))?.n) || null;
    // (a manner: one of `advs` whose grammar.txt list manner.<adverb> has the verb -- the least said; now and then)
    function mannerFor(verb, args, advs, must = false) {
      if (!verb || args?.manner || complexity < 2 || (!must && !chance(nar.manner))) return null;
      const ok = advs.filter((a) => (grammar.words["manner." + a] ?? []).includes(verb));
      return ok.length ? ok.sort((a, b) => times(a) - times(b))[0] : null;
    }
    // (how a state shows -- world/body.txt: Ihr Magen knurrte. Sie atmete tief aus. -- one sign once a story)
    const signsTold = new Set();
    const signsOf = (state, self = false) => (state && W.signs.get(state)?.filter((c) => !signsTold.has(c) && (!self || !/\bsubj=/.test(c)))) ?? [];
    // (self: one she does herself -- the second of a chain: und lächelte; who: whose sign -- the other one's impatience)
    function signFrag(state, self = false, who = p1) {
      const c = pick(signsOf(state, self));
      if (!c) return null;
      signsTold.add(c);
      const a = argsOf(c), f = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, [v]]));
      // (ihr Magen, ihre Hände; or she; den Kopf -- then "er" is unclear; an article of its own as it stands: ein Lied;
      //  own:Werk -- hers)
      // (before she is named: Lisas Magen knurrte.)
      const poss = who === p1 && !p1.known && p1.name ? `name.${p1.name}` : who.g === "f" ? "poss.3sg.f" : "poss.3sg.m", own = (x) => x.replace(/^own:/, poss + ":");
      f.subj = [a.subj ? `${poss}:${a.subj}` : ref(who, true)];
      if (a.patient) { f.patient = [/^(def|indef|none|own):/.test(a.patient) ? own(a.patient) : `def:${a.patient}`]; const n = entry(a.patient.replace(/^\w+:/, "").split("+")[0], "N"); if (n) mentioned.push({ g: gender(n) }); }
      if (a.pp) f.pp = [a.pp.replace(/:own:/, `:${poss}:`)];
      return f;
    }
    const hurried = () => (words["story.hurry"] ?? []).includes(want.state);
    const tenseNow = () => world.flags.has("tense") || hurried();
    // (the AMBIENCE: what the things here sound, smell, look like -- world/ambience.txt; never the thing that will be
    //  wanted or break; the work's own things first; two at most)
    const toldAmb = new Set();
    // (scene: the opening shot -- the place's own things may set it: In der Küche summte der Kühlschrank.)
    let lastSound = null;   // (the last sound told: its verb and its thing -- über das Summen des Kühlschranks hinweg)
    function ambienceCands(scene = false) {
      if (toldAmb.size >= (scene ? 3 : 2)) return [];
      // (earned: a thing the work will use -- the dripping tap she fills the pot at --, or a smell that makes her
      //  hungry: story.ambience-states; the rest is filler -- story bench 19: "Der Kühlschrank summte." in every kitchen)
      const not = new Set([wantObj, troubleT, lackT].filter(Boolean).map((t) => t.base)), work = new Set([...(wantProc()?.lines ?? []), ...(mendProc()?.lines ?? [])].flatMap((l) => l.nouns));
      const smells = (words["story.ambience-states"] ?? []).includes(want.state);
      const smelt = [...toldAmb].some((k) => k.endsWith("SMELL"));   // (one smell: not "es duftete nach Brot, und es duftete nach Kuchen")
      const inside = new Set(words["story.inside-only"] ?? []);   // (the sun through the window: not in a courtyard)
      const ok = (n, a) => !a.omen && !toldAmb.has(n + a.kind) && !(smelt && a.kind === "SMELL") && !(out && inside.has(n)) && (work.has(n) || (smells && a.kind === "SMELL" && smellFits(n)) || (scene && sheet.things.includes(n) && a.kind !== "SMELL"));
      return [...new Set([...avail, ...sheet.things])].filter((n) => !not.has(n) && entry(n, "N"))
        .map((n) => ({ n, as: (W.ambience.get(n) ?? []).filter((a) => ok(n, a)), w: Math.max(rank(n), 1) * (work.has(n) ? 3 : 1) })).filter((c) => c.as.length);
    }
    function ambienceFrag(scene = false) {
      const cs = ambienceCands(scene);
      if (!cs.length) return null;
      const c = weighted(cs), a = pick(c.as);
      if (a.kind === "SMELL") world.flags.add("smelled");
      return ambClause(c.n, a);
    }
    // (a smell shares a kind with the wish: bread smells for bread, not for broccoli -- story.smell-kinds)
    const smellFits = (n) => { const e = entry(n, "N"); return !!wantObj && !!e && (words["story.smell-kinds"] ?? []).some((c) => meaning.fits(e, c) && meaning.fits(wantObj.noun, c)); };
    // (an OMEN: the trouble's first sign -- Der Wasserhahn tropfte. -- told only of the thing that will be in that state)
    const omenOf = () => (troubleT && trouble ? (W.ambience.get(troubleT.base) ?? []).find((a) => a.omen === trouble.state && !toldAmb.has(troubleT.base + a.kind)) : null);
    function ambClause(n, a) {
      const t = thing(n);
      if (!t) return null;
      t.here = true;
      toldAmb.add(n + a.kind);
      const f = Object.fromEntries(Object.entries(argsOf(a.clause)).map(([k, v]) => [k, [v]]));
      if (!f.subj) { f.subj = [ref(t, true)]; if (a.kind === "SOUND") lastSound = { verb: f.verb[0], w: t.w }; }
      else t.known = true;
      return f;
    }
    // (what her work stands on: the first thing of the procedure one stands at -- the stove, the grill; not the dough)
    const workThing = () => (wantProc() ?? mendProc())?.lines.flatMap((l) => l.things).map((x) => x && x !== wantObj?.base && rank(x) > 0 && thing(x)).find((t) => t && (words["story.stand-at"] ?? []).some((c) => meaning.fits(t.noun, c)));
    let lackMemo, smokeMemo, reliefMemo, heatMemo;
    // (what the dish is like when done -- world/texture.txt: golden, then said with it: die knusprigen Brötchen)
    const texture = () => (wantObj ? W.textures.find((x) => x.of.some((c) => (/^[A-ZÄÖÜ]/.test(c) ? want.obj === c : meaning.fits(wantObj.noun, c))))?.adjs ?? [] : []);
    // (the pan or pot on the stove, hot: what spatters, what she pulls off the stove when it smells of smoke)
    const hotPan = () => [...things.values()].find((t) => (words["story.pans"] ?? []).includes(t.base) && t.states.has("horúci"));
    const spices = () => ingredients().filter((t) => (words["story.spices"] ?? []).includes(t.base));
    // (not the one missing while it is: "Zuerst mischte er Mehl und Butter. Doch er hatte keine Butter.")
    const missing = () => !!lack && plotHas("LACK") && !world.flags.has("cleared");
    const ingredients = () => (wantObj ? [...new Set([...want.uses, ...(lack ? [lack.thing] : [])])].filter((w) => w !== want.obj && !(missing() && w === lack.thing)).map(thing).filter((t) => t && meaning.fits(t.noun, "food")) : []);
    let feelMemo;
    const feelWord = () => (feelMemo ??= (() => { const bad = feelings(-1), cross = (actor?.traits ?? []).some((t) => (words["story.impatient"] ?? []).includes(t)); return (cross ? bad.find((w) => w === "rozladený") : null) ?? pick(bad) ?? null; })());

    // ---- CONDS: what a way of telling needs of the world (stories.txt `when`); else a flag a move `sets`
    const CONDS = {
      // (only weather that does something: it caused the wish, or the trouble -- story bench 9: "Es war Winter" for nothing)
      "weather-told": () => !!weather && (causedStates.includes(want.state) || (caused.includes(trouble) && plotHas("SPOIL"))),
      "weather-taste": () => !!weather?.noun && (likes.has(weather.noun) || dislikes.has(weather.noun)),
      "weather-liked": () => !!weather?.noun && likes.has(weather.noun),
      wear: () => out && wearable.length > 0,
      "job-fits": () => !!actor?.job && sheet.people.includes(actor.job),   // (her work is here: the place's people)
      "own-trouble": () => !!troubleT?.own && troubleT !== wantObj && !troubleT.known && ["BLOCK", "BREAK", "SPOIL"].some(plotHas),
      there: () => thereList().length > 0,
      "there-one": () => thereList().length === 1 && !!SLOTS["there.verb"](),
      feature: () => !!feature,
      past: () => !!pastVerb,
      fond: () => !!wantObj && likes.has(want.obj),
      wish: () => !!scenes.state(want.state)?.wish,
      trouble: () => !!troubleT,
      breaks: () => !!troubleT && !caused.includes(trouble) && !!scenes.objstate(trouble.state)?.become && scenes.objstate(trouble.state).become !== "werden",   // (werden: it becomes so -- needs a cause)   // (werden needs a cause: SPOIL)
      caused: () => !!troubleT && caused.includes(trouble) && !!scenes.objstate(trouble.state)?.become,
      lack: () => !!lackT,
      p2: () => !!p2,
      "p2.here": () => !!p2?.known && (!world.flags.has("away") || world.flags.has("home")),   // (named, and not away: the one she surprises)
      "p2.away": () => !!p2 && !p2.known,
      "p2.kin": () => !!p2?.kin,
      // (an order: one of hers asks her for what she can make, step by step -- a dish)
      // (a favor: one of hers asks her to mend his thing -- she does it, step by step)
      favor: () => !!mendProc() && !!troubleT && troubleT !== wantObj && !troubleT.own,
      asked: () => world.flags.has("asked"),
      // (the work is hot -- a stove, an oven, a pan: her brow shines while she works; once)
      // (the other one does something meanwhile -- world/side.txt, by place: one of hers who is there, not at the work)
      side: () => complexity >= 3 && !world.flags.has("sidedone") && !!p2?.known && doer() !== p2 && cur() > 0 && (W.side.get(placeWord)?.length ?? 0) > 0,
      urgent: () => world.flags.has("urgent"),
      // (a complication while she cooks -- fat spatters on her hand; it smells of smoke, she pulls the pan off: once)
      spatter: () => complexity >= 3 && !world.flags.has("spattered") && !world.flags.has("smoked") && doer() === p1 && !!hotPan() && (proc()?.lines ?? []).slice(0, cur()).some((l) => l.things.includes("olej")),
      smoke: () => complexity >= 3 && !world.flags.has("smoked") && !world.flags.has("spattered") && doer() === p1 && !!hotPan() && (proc()?.lines ?? []).slice(0, cur()).some((l) => l.kind === "key") && (proc()?.lines ?? []).slice(cur()).every((l) => l.kind !== "process" && l.kind !== "key") && (smokeMemo ??= chance(.4)),   // (and nothing fries after it: the pan is off)
      relief: () => (reliefMemo ??= chance(.5)),
      scene3: () => ambienceCands(true).length >= 3,
      noisy: () => !!lastSound,
      "durative-next": () => (words["story.durative"] ?? []).includes(lineAt(cur())?.verb),
      // (it turned golden: once the decisive step is done, the dish in the work)
      done: () => complexity >= 3 && !world.flags.has("textured") && texture().length > 0 && !!wantProc() && wantProc().lines.slice(0, wantProc().cursor).some((l) => l.kind === "key") && (() => { const rest = wantProc().lines.slice(wantProc().cursor).filter((l) => l.kind !== "close"); return rest.every((l) => l.kind !== "process") && (!rest.length || (words["story.after-done"] ?? []).includes(rest[0].verb)); })(),   // (the cooking through -- no process left: not "braun", then "zischte" --, before what is done with the done dish: soft, then drained; else at the end)
      hint: () => complexity >= 3 && world.flags.has("sensed") && !world.flags.has("hinted") && spices().length > 0,
      // (her hands got dirty or wet: kneading, washing, cutting -- or the fat spattered: then she dries them)
      "hands-busy": () => world.flags.has("spattered") || [...(wantProc()?.lines ?? [])].slice(0, wantProc()?.cursor ?? 0).some((l) => (words["story.hand-verbs"] ?? []).includes(l.verb)),
      "asked-q": () => world.flags.has("asked-q"),
      checkin: () => complexity >= 3 && !world.flags.has("checked") && cur() >= 2 && (proc()?.lines ?? []).slice(cur()).some((l) => l.kind !== "close") && !!workThing(),   // (the work well under way, not done; once)
      // (seasoned once it cooks -- a savory dish, with what seasons: salt, herbs, garlic; not jam with apricots)
      // (her tasting finds a seasoning missing -- half the time, when the dish was not seasoned yet)
      lacking: () => complexity >= 3 && world.flags.has("sensed") && !world.flags.has("seasoned") && !world.flags.has("lacked") && spices().length > 0 && (lackMemo ??= chance(.6)),
      spice: () => spices().length > 0 && (proc()?.lines ?? []).slice(0, cur()).some((l) => l.kind === "key" || l.nouns.includes("obj")) && ["meat", "vegetable", "grain", "dish"].some((c) => meaning.fits(wantObj.noun, c)),
      soup: () => !!want.obj && (words["story.soups"] ?? []).includes(want.obj),
      plated: () => !!wantObj && ["meat", "vegetable", "grain"].some((c) => meaning.fits(wantObj.noun, c)),   // (laid on the plates: not a soup)
      baked: () => !!wantObj && ["baked-goods", "sweets"].some((c) => meaning.fits(wantObj.noun, c)),
      workthing: () => !!workThing(),
      "hot-work": () => complexity >= 3 && !world.flags.has("heated") && !world.flags.has("textured") && (proc()?.lines ?? []).slice(cur()).some((l) => l.kind === "process" || l.kind === "key") && (heatMemo ??= chance(.4)) && cur() > 0 && [...things.values()].some((t) => t.states.get("horúci")?.at < world.said.length - 1),   // (hot since a sentence before)   // (something here IS hot: the pan on the stove, the oven switched on)
      // (what the dish is made of: the food the wish uses -- Eine Tomatensoße mit Knoblauch und Basilikum.)
      ingredients: () => ingredients().length > 0,
      order: () => (words["story.prepares"] ?? []).includes(want.verb) && !!wantObj && meaning.fits(wantObj.noun, "food") && !!wantProc(),
      tool: () => !!tool && !!entry(tool, "N"),
      // (what can burn: fried, baked, grilled -- with a decisive step to burn after)
      burnable: () => complexity >= 3 && (words["story.burns"] ?? []).includes(want.verb) && !!wantProc()?.lines.some((l) => l.kind === "key"),
      comment: () => !!comment && !!wantObj?.known,
      // (ging in die Küche, auf den Berg -- not "in die Kreuzung"; an object said with its article or a mass -- not "um Auto zu fahren")
      goto: () => (!out || !!meaning.flag?.(placeN, "auf") || !!meaning.flag?.(placeN, "an")) && (!wantObj || want.det !== "none" || gen.uncounted(wantObj.noun) || meaning.fits(wantObj.noun, "consumable")),
      "call-plain": () => SLOTS.call() === "volať",   // (a relative clause would split "rief ... an")
      self: () => !!trouble && trouble.by === actor?.job,   // (her own trade: a Fischer mends his net himself)
      finish: () => !!endsVerb() && (words["story.prepares"] ?? []).includes(want.verb),   // (eaten after it was made ready, not after fangen)
      result: () => !!resultAdj(),
      glad: () => !!resultAdj() && feelings(1).includes(resultAdj()),   // (the end is a feeling, not what the action gave: Nun freute sie sich.)
      // (the procedure: there is one; its next line is a step / process / key and may be told now -- not waiting)
      proc: () => !!wantProc(),
      mend: () => !!mendProc(),
      step: () => nextIs("step"),
      process: () => nextIs("process"),
      key: () => nextIs("key"),
      close: () => nextIs("close"),
      "first-step": () => cur() === 0 && nextIs("step") && nextIs("step", 1),   // (zuerst: another step follows)
      "manner-in": () => !!lineAt(cur())?.parts.some((p) => p.k === "manner"),
      moment: () => nextIs("key") && lineAt(cur()).marks.includes("moment"),
      step2: () => nextIs("step") && nextIs("step", cur() + 1),
      step3: () => nextIs("step") && nextIs("step", cur() + 1) && nextIs("step", cur() + 2),
      // (the step that waits is the one that uses the thing in the way: Als sie den Herd einschalten wollte, ...)
      waiting: () => { const w = wantProc(), l = w?.lines[w.cursor]; return !!l && !!troubleT && w.cursor === w.at && w.cursor >= w.stop && l.kind !== "process" && !world.flags.has("cleared") && l.nouns.includes(troubleT === wantObj ? "obj" : troubleT.base); },
      with: () => !!toolOf(lineAt(cur())),
      helper: () => world.flags.has("helper"),
      mending: () => { const m = mendProc(); return !!m && m.cursor > 0 && m.cursor < m.lines.length; },
      // (tension: a bad feeling was told, she waited, she was in a hurry -- what makes relief and endlich earned)
      tense: () => tenseNow(),
      impatient: () => hurried() || (actor?.traits ?? []).some((t) => (words["story.impatient"] ?? []).includes(t)),
      ambience: () => ambienceCands().length > 0,
      scene: () => ambienceCands(true).length > 0,
      omen: () => !!omenOf() && ["BLOCK", "BREAK"].some(plotHas) && !troubleT.known,
      smelled: () => world.flags.has("smelled"),
      complex: () => complexity >= 3,
      // (the end is a feeling -- glücklich, froh -- not what the action gave -- satt, sauber)
      "result-feel": () => !!resultAdj() && [...feelings(1), ...(words["story.relieved"] ?? [])].includes(resultAdj()),
      "sign.wait": () => (words["story.wait-feel"] ?? []).some((w) => signsOf(w).length),
      "there-at": () => thereList().length === 1 && (words["story.stand-at"] ?? []).some((c) => meaning.fits(thereList()[0].noun, c)),
      tasty: () => !!wantObj && meaning.fits(wantObj.noun, "consumable"),
      dish: () => !!wantObj && meaning.fits(wantObj.noun, "food") && !meaning.fits(wantObj.noun, "drink"),
      made: () => (words["story.prepares"] ?? []).includes(want.verb) && !!wantProc(),   // (she made it, step by step: a verdict is earned)
      "sign.want": () => signsOf(want.state).length > 0,
      "sign.feel": () => signsOf(feelWord()).length > 0,
      "sign.end": () => signsOf(resultAdj()).length > 0,
      "sign.end.self": () => signsOf(resultAdj(), true).length > 0,
    };
    const cond = (c) => (CONDS[c] ? CONDS[c]() : world.flags.has(c));
    const whenHolds = (when) => when.every((c) => c.startsWith("~") || (c.startsWith("!") ? !cond(c.slice(1)) : cond(c)));   // (~tag: the narrator's taste, no condition)
    const holdsWhen = (way) => way.level <= complexity && whenHolds(way.when);   // (and the story's complexity)

    // ---- SLOTS: the world's values for $name (a string; or, alone in a clause, several parts at once)
    const SLOTS = {
      p1: (k) => ref(p1, k === "subj"),
      p2: (k) => ref(p2, k === "subj"),
      tool: () => tool,
      wantobj: (k) => many(ref(wantObj, k === "subj")),
      comment: () => comment,
      "p1.pron": () => personPron(p1),
      "p2.pron": () => (p2 ? personPron(p2) : null),
      along: () => { if (!(p2?.kin && (words["story.along"] ?? []).some(plotHas))) return null; p2.known = true; return `with:${owner()}:${p2.noun.cid}`; },   // (a relative who will help is there from the start)
      // (to the place, at it: into / onto / to the side, by the kind of place -- in a room, on a field, at the shore)
      to: () => { const r = meaning.flag?.(placeN, "auf") ? "onto" : meaning.flag?.(placeN, "an") ? "to-side" : "into"; place.known = true; return `${r}:def:${place.w}`; },
      at: () => { const r = meaning.flag?.(placeN, "auf") ? "on" : meaning.flag?.(placeN, "an") ? "at" : "in"; place.known = true; return `${r}:` + placeAdorned(); },
      season: () => (season ? "none:" + season : null),
      "weather.noun": () => (weather?.noun ? "none:" + weather.noun : null),
      "weather.word": () => weather?.noun ?? null,
      weather: () => (weather ? argsOf(weather.clause) : null),
      wear: () => { const t = thing(pick(wearable)); if (!t) return null; t.own = true; const r = `${owner()}:${t.w}`; t.known = true; mentioned.push(t); return r; },
      job: () => (actor?.job ? "none:" + actor.job : null),
      own: (k) => adorn(ref(troubleT, k === "subj"), troubleT.noun),
      // (how a thing is there: Dort stand ein Toaster / lag ein Buch / hing ein Bild -- story.stand / lie / hang)
      "there.verb": () => { const [x] = thereList(); return x && ["stand", "lie", "hang"].map((k) => ({ k, v: { stand: "stáť_(v_stoji)", lie: "ležať", hang: "visieť" }[k] })).find(({ k }) => (words["story." + k] ?? []).some((c) => meaning.fits(x.noun, c)))?.v; },
      there: () => { const xs = thereList(); if (!xs.length) return null; const [a, b] = xs.map((x) => adorn((gen.uncounted(x.noun) ? "none:" : "indef:") + x.w, x.noun)); for (const x of xs) { x.known = x.real = true; mentioned.push(x); } return b ? `${a}+pair(and,${b})` : a; },
      place: (k) => ref(place, k === "subj"),
      feature: () => feature,
      past: () => (pastVerb ? { verb: pastVerb } : null),
      fond: () => "none:" + wantObj.w + (want.num === "pl" || !(gen.uncounted(wantObj.noun) || meaning.fits(wantObj.noun, "consumable")) ? "+pl" : ""),   // (mochte Blumen, Hunde; Kaffee, Brot)
      state: () => { const f = stateWord(want.state); return f && (f[0] === "adj" ? { verb: "byť", pred: "adj:" + f[1] } : { verb: "mať_(vlastniť)", bare: "none:" + f[1] }); },
      act: () => ({ verb: want.verb, ...(wantObj ? { patient: wantArg() } : {}) }),
      trouble: (k) => ref(troubleT, k === "subj"),
      "trouble.state": () => trouble?.state,
      "trouble.verb": () => trouble?.verb,
      becomes: () => { const b = scenes.objstate(trouble.state)?.become; return b === "werden" ? { verb: "stať_sa", pred: "adj:" + trouble.state } : b ? { verb: b } : null; },
      lack: () => { lackT.known = true; return lackT.w + (lackT === wantObj && manyOf() ? "+pl" : ""); },   // (keine Linsen: the many wished)
      "lack.place": () => lack.place,
      "lack.verb": () => lack.verb,
      "lack.get": () => { lackT.real = true; if (lackT === wantObj && manyOf()) return `none:${lackT.w}+pl`; if (!gen.uncounted(lackT.noun)) lackT.one = true; return (gen.uncounted(lackT.noun) ? "none:" : "indef:") + lackT.w; },   // (kaufte Mehl, lieh ein Buch aus -- then: den Döner)
      feel: () => feelWord(),
      call: () => (p2here() && !p2.kin ? "volať" : "zavolať"),   // (der Kellner is there: rufen; the others: anrufen)
      finish: () => { world.flags.add("finished"); return endsVerb(); },
      "finish.obj": () => many(ref(wantObj)),
      result: () => resultAdj(),
      end: () => word(world.flags.has("called") || hurried() ? "story.end-waited" : "story.end"),   // (endlich: after a call, a hurry)
      "end.waited": () => (world.flags.has("called") ? word("story.end-waited") : null),   // (in a joined sentence: no "jetzt")
      // (the procedure's next line -- told: step; only looked at: next -- its tool, how she does it, how a state shows)
      step: () => { const pr = proc(), l = pr?.lines[pr.cursor], f = l && lineFrag(l); if (!f) return null; pr.cursor++; pending.push({ l, p: pr }); return f; },
      next: () => { const l = lineAt(cur()); return l ? lineFrag(l) : null; },
      with: () => { const t = thing(toolOf(lineAt(cur()))); if (!t) return null; t.here = true; return "with:" + ref(t); },
      // (what her work stands on, for "ohne den Blick vom Herd zu wenden": the first thing of the wish's procedure)
      workthing: () => { const t = workThing(); if (!t) return null; t.here = true; return ref(t); },
      "with.thing": () => { const t = thing(toolOf(lineAt(cur()))); if (!t) return null; t.here = true; return ref(t); },
      doer: (k) => ref(doer(), k === "subj"),
      manner: (k, args) => (doer() === p1 ? mannerFor(args?.verb?.[0], args, (actor?.traits ?? []).flatMap((t) => W.shows.get(t) ?? [])) : null),   // (her traits: a patient one langsam)
      ambience: () => ambienceFrag(),
      scene: () => ambienceFrag(true),
      side: () => { const c = pick(W.side.get(placeWord) ?? []); if (!c) return null; const f = Object.fromEntries(Object.entries(argsOf(c)).map(([k, v]) => [k, [v === "$doer" ? ref(doer()) : v]])); f.subj = [ref(p2, true)]; return f; },
      "p2.voice": () => (p2 ? `${p2.g === "f" ? "poss.3sg.f" : "poss.3sg.m"}:hlas` : null),
      "doer.brow": () => (doer() === p1 && p1.name ? `name.${p1.name}:čelo` : `${doer().g === "f" ? "poss.3sg.f" : "poss.3sg.m"}:čelo`),   // (Pauls Stirn: not "seine", after the other one acted)
      "manner.focus": (k, args) => mannerFor(args?.verb?.[0], args, ["sústredený"], true),
      "manner.process": (k, args) => mannerFor(args?.verb?.[0], args, words["story.process-manner"] ?? [], true),   // (a thing's: langsam -- not konzentriert)
      dish: () => (manyOf() ? "none:" : "indef:") + wantObj.w + (manyOf() ? "+pl" : ""),
      // (what she surprises him with: what is fried or boiled, bare with how -- mit gebratenem Speck --; a dish: mit einer Suppe)
      "dish.with": () => (partII.has(want.verb) && ["meat", "vegetable", "grain"].some((c) => meaning.fits(wantObj.noun, c)) ? `none:${wantObj.w}+part(II,${want.verb})${manyOf() ? "+pl" : ""}` : (manyOf() || gen.uncounted(wantObj.noun) ? "none:" : "indef:") + wantObj.w + (manyOf() ? "+pl" : "")),
      // (the texture said: the first word as the predicate, the others kept for the noun later -- die knusprigen Brötchen)
      texture: () => { const [first, ...rest] = texture(); if (!first) return null; wantObj.states.set(first, { at: world.said.length, named: true, used: false }); for (const a of rest) wantObj.states.set(a, { at: world.said.length, named: false, used: false }); return first; },
      // (golden und knusprig: the texture's first two)
      "texture.pair": () => { const [, second] = texture(), first = SLOTS.texture(); if (!first) return null; if (second) wantObj.states.get(second).named = true; return second ? `${first}+and(${second})` : first; },
      // (a pinch of what is powder -- eine Prise Salz; else the thing itself)
      "spice.measure": () => { const t = spices()[0]; if (!t) return null; return (words["story.pinches"] ?? []).includes(t.base) ? `indef:štipka+of(none:${t.w})` : `none:${t.w}`; },
      // (über das Summen des Kühlschranks hinweg: the last sound told)
      noise: () => (lastSound ? `def:@${lastSound.verb}+owner(def:${lastSound.w})+post(hinweg)` : null),
      "spice.one": () => (spices()[0] ? `none:${spices()[0].w}` : null),
      spices: () => { const xs = spices().slice(0, 2).map((t) => `none:${t.w}`); return xs.length === 2 ? `${xs[0]}+pair(and,${xs[1]})` : xs[0] ?? null; },
      ingredients: () => { const xs = ingredients().slice(0, 2).map((t) => `none:${t.w}` + (!gen.uncounted(t.noun) && ["vegetable", "fruit"].some((c) => meaning.fits(t.noun, c)) ? "+pl" : "")); return xs.length === 2 ? `${xs[0]}+pair(and,${xs[1]})` : xs[0] ?? null; },
      // (die Lampe ihres Bruders: his thing, said once she is known)
      "trouble.his": () => { if (!p2 || !p1.known) return null; troubleT.known = true; mentioned.push(troubleT); return `def:${troubleT.w}+owner(${owner()}:${p2.noun.cid})`; },
      "trouble.mine": () => { troubleT.known = true; mentioned.push(troubleT); return `poss.1sg:${troubleT.w}`; },
      omen: () => { const a = omenOf(); return a ? ambClause(troubleT.base, a) : null; },
      "sign.wait": () => signFrag(pick((words["story.wait-feel"] ?? []).filter((w) => signsOf(w).length))),
      "there.at": () => { const [x] = thereList(); x.known = x.real = true; return `at:def:${x.w}`; },
      "manner.key": (k, args) => mannerFor(args?.verb?.[0], args, words["story.careful"] ?? [], true),
      "sign.want": () => signFrag(want.state),
      "sign.feel": () => signFrag(feelWord()),
      "sign.end": () => signFrag(resultAdj()),
      "sign.end.self": () => signFrag(resultAdj(), true),
      "sign.p2wait": () => (p2 ? signFrag(pick(words["story.wait-feel"] ?? []), true, p2) : null),
      "p1.hand": () => `${owner()}:ruka`,
      "p1.apron": () => `${owner()}:zástera`,
      workpan: () => { const t = hotPan(); if (!t) return null; return ref(t); },
    };

    // ---- TELLING: a way's clauses with the slots filled; the realizer; joins
    const fill = (str, key, args) => {
      let ok = true, gap = false;
      const s = str.replace(/\$([\w.-]+)(\?)?/g, (_, name, opt) => { const v = SLOTS[name]?.(key, args); if (v == null) { if (opt) gap = true; else ok = false; return ""; } return v; })
        .replace(/@([\w.-]+)/g, (_, k) => word(k));
      return !ok ? undefined : gap ? null : s;   // (undefined: the way cannot be told; null: the part is left out)
    };
    // a way's (or a join's) clauses with the slots filled; a join's `= A` / `= B`: the two moves' clause 1, changed
    function build(way, from = {}) {
      const clauses = {};
      if (!from.B) decor = [];   // (a join keeps its second sentence's attributes: they are said)
      for (const c of way.clauses) {
        const base = c.from ? from[c.from] : null;
        if (c.from && !base) return null;
        const args = base ? Object.fromEntries(Object.entries(base.args).map(([k, v]) => [k, [...v]])) : {};
        for (const p of c.parts) {
          if (p.drop) { delete args[p.drop]; continue; }
          if (p.frag) { const f = SLOTS[p.frag]?.(); if (!f) return null; for (const [k, v] of Object.entries(f)) (args[k] ??= []).push(...[v].flat()); continue; }
          const v = fill(p.value, p.key, args);
          if (v === undefined) return null;
          // (a join drops B's subject only when it is A's person: not "war im Park und knurrte" for "ihr Magen knurrte")
          if (base && p.key === "drop" && !sameDoer(base.args.subj?.[0], from.A?.args.subj?.[0])) return null;
          if (base || (p.key === "subj" && v !== null)) delete args[p.key];   // (a changed part replaces the move's; the move's subj a frag's -- subj=drop)
          if (v !== null) (args[p.key] ??= []).push(v);
        }
        // (an object pronoun before a named subject reads wrong -- "spülte es seine Schwester", "Nachdem sie Peter
        //  geläutet hatte": then the thing's noun again)
        const subj = args.subj?.[0];
        // (nor an object pronoun the same as the subject's: "probierte sie sie" -> sie probierte die Suppe)
        // (two pronouns that sound alike -- German's: "probierte sie sie" -- the object said as its noun)
        const surface = (v) => (v === "3sg.f" ? "f" : v === "3sg.m" ? "m" : v === "3pl" || v?.startsWith("them:") ? "pl" : v?.startsWith("it:") ? gender(entOf(v)?.noun ?? {}) : v);
        const same = (v) => surface(v) === surface(subj);
        if (subj && isPron(subj)) for (const k of ["patient", "recipient"]) { const v = args[k]?.[0], t = pronThing.get(v); if (t && same(v)) args[k] = [`def:${t.w}${v.startsWith("them:") ? "+pl" : ""}`]; }
        if (subj && !isPron(subj) && !args.drop) for (const k of ["patient", "recipient"]) { const v = args[k]?.[0], t = pronThing.get(v); if (t && isPron(v)) args[k] = [`def:${t.w}${v.startsWith("them:") ? "+pl" : ""}`]; }
        clauses[c.id] = { type: c.type ?? base?.type, args };
      }
      return { clauses, seq: way.seq.flatMap((x) => (x.startsWith("@") ? word(x.slice(1)).split(" ") : [x])) };   // (so ein Mist: three words)
    }
    const sameDoer = (b, a) => !!b && (b === a || isPron(b) || b === "name:" + p1.name || (p2 && b.endsWith(":" + p2.noun.cid)));
    const DEFAULT_JOIN = [{ id: "1", from: "A", parts: [] }, { id: "2", from: "B", parts: [] }];
    const trace = (clauses) => Object.entries(clauses).map(([id, c]) => `${id} ${c.type} ${Object.entries(c.args).flatMap(([k, v]) => v.map((x) => `${k}=${x}`)).join(" ")}`).join(" || ");
    function realize(move, b) {
      let t;
      try { t = say(b); } catch (e) { world.failed.push(`${move}: ${e.message}`); return null; }
      return t && !/undefined|null/.test(t) ? t : null;
    }
    // (what telling a way changes -- who and what is known, the flags, the words' memory: undone when the way is not told)
    const ents = () => [p1, p2, place, ...things.values()].filter(Boolean);
    const snapshot = () => ({ e: ents().map((x) => [x, { known: x.known, real: x.real, own: x.own, here: x.here }]), mentioned: [...mentioned], lastSubj, flags: new Set(world.flags), used: { ...used }, cursors: [...procs.values()].filter(Boolean).map((p) => [p, p.cursor]), pending: [...pending] });
    const restore = (sn) => { for (const [x, v] of sn.e) Object.assign(x, v); mentioned = [...sn.mentioned]; lastSubj = sn.lastSubj; world.flags = new Set(sn.flags); Object.assign(used, sn.used); for (const [p, c] of sn.cursors) p.cursor = c; pending = [...sn.pending]; };
    const opener = (t) => t.split(/\s+/)[0].toLowerCase().replace(/[^a-zäöüß]/g, "");
    function tell(name) {
      let ways = (moves.get(name) ?? []).filter(holdsWhen), aside = null;
      const prevText = world.said[world.said.length - 1]?.text;
      while (ways.length || aside) {
        if (!ways.length) { restore(aside.after); return commit(name, aside.way, aside.b, aside.t); }   // (only that one: told anyway)
        const way = weighted(ways.map((w) => ({ ...w, w: w.w * (w.seq.includes("„") ? nar.speech : 1) / (1 + 2 * (told.get(w) ?? 0)), orig: w }))).orig;
        ways = ways.filter((x) => x !== way);
        const sn = snapshot();
        pending = [];
        const b = build(way);
        const t = b && realize(name, b);
        if (!t) { restore(sn); continue; }
        // (not two sentences opening alike -- "Sie ... Sie ...", "Dann ... Dann ..." -- while another way can be told)
        if (prevText && opener(t) === opener(prevText) && ways.length && !aside) { aside = { way, b, t, after: snapshot() }; restore(sn); continue; }
        return commit(name, way, b, t);
      }
      return false;
    }
    function commit(name, way, b, t) {
      told.set(way, (told.get(way) ?? 0) + 1);
      // (two moves in one sentence, as an author would: Nachdem ihr Bruder den Toaster repariert hatte, bedankte sie
      //  sich bei ihm. -- the more often, the more complex the story)
      // (a join's `when`: the world's conds, or of the two clauses -- same-subj: one doer, so B's subject may drop;
      //  durative-a / -b: that clause's verb takes time -- während needs it, not "während der Ofen funktionierte")
      const prev = world.said[world.said.length - 1], A = prev?.clauses["1"], B = b.clauses["1"];
      const durative = new Set(words["story.durative"] ?? []), JC = { "same-subj": () => sameDoer(B?.args.subj?.[0], A?.args.subj?.[0]) && sameDoer(A?.args.subj?.[0], B?.args.subj?.[0]),
        "durative-a": () => durative.has(A?.args.verb?.[0]), "durative-b": () => durative.has(B?.args.verb?.[0]) };
      const js = ((prev && joins.get(`${prev.move}|${name}`)) ?? []).filter((j) => j.when.every((c) => { const neg = c.startsWith("!"), k = neg ? c.slice(1) : c; return (JC[k] ? JC[k]() : cond(k)) !== neg; }));
      // (only plain ways join -- one clause, no words but a joining one: not "sagte: „Danke!“")
      const plain = way.clauses.length === 1 && way.seq.filter((x) => !x.startsWith("@")).join(" ") === "1 .";
      let said = { text: t, move: name, trace: trace(b.clauses), clauses: b.clauses, plan: b, plain };
      const single = prev?.plain && plain;
      if (js.length && single && chance(Math.min(.9, js.reduce((t, j) => t + j.w, 0) * JOINS[complexity] * nar.joins))) {
        const j = weighted(js.map((x) => ({ ...x, w: x.w / (1 + 2 * (told.get(x) ?? 0)), orig: x }))).orig, jb = build({ ...j, clauses: j.clauses.length ? j.clauses : DEFAULT_JOIN }, { A, B });
        // (joined, a thing the first half named is a pronoun in the second: reparierte den Computer und schaltete ihn ein)
        if (jb) for (const c of Object.values(jb.clauses)) {
          if (c === jb.clauses[Object.keys(jb.clauses)[0]]) continue;
          // (and the one the first half called is er/sie: rief die Lehrerin, und bald kam sie)
          if (p2 && c.args.subj?.[0] === A.args.patient?.[0] && /:/.test(c.args.subj[0]) && c.args.subj[0].endsWith(p2.noun.cid)) c.args.subj = [personPron(p2)];
          for (const k of ["patient", "recipient"]) { const v = c.args[k]?.[0], t = entOf(v); if (t?.states && /^def:/.test(v) && Object.values(A.args).flat().includes(v) && c.args.drop) c.args[k] = [`${v.includes("+pl") ? "them" : "it"}:${t.w}`]; }
        }
        const jt = jb && realize(`${prev.move}+${name}`, jb);
        if (jt) { told.set(j, (told.get(j) ?? 0) + 1); world.said.pop(); said = { text: jt, move: `${prev.move}+${name}`, trace: trace(jb.clauses), clauses: jb.clauses, plan: jb, plain: false }; }
      }
      world.said.push(said);
      for (const w of said.text.toLowerCase().match(/\p{L}+/gu) ?? []) seen.set(w, (seen.get(w) ?? 0) + 1);
      for (const f of way.sets) world.flags.add(f);
      effects(b.clauses, name);   // (this move's own clauses: a join's first half was told already)
      // (someone else the subject at the end -- die Gäste, sie.pl --: her next "sie" would be unclear, say her name)
      const sj = Object.values(said.clauses).map((c) => c.args.subj?.[0]).filter(Boolean).pop();
      if (sj === "3pl" || (sj && /:/.test(sj) && !/^name:/.test(sj) && !entOf(sj) && !(p2 && sj.endsWith(":" + p2.noun.cid)))) lastSubj = null;   // (people, not a thing: the water boiling keeps her "sie")
      for (const m of decor) m.used = true;
      pending = []; decor = [];
      before = mentioned; mentioned = [];
      return true;
    }
    // a token: MOVE (must), MOVE? (half the time), (MOVE) (when it can be told); a PART: one of its alternatives
    // (a part names its procedure: FIXWORK mend -- the moves inside it tell that one; restored whatever happens)
    // (a part's alternatives weighed by the stories before -- not this one's: its steps may come again and again)
    const prior = new Map(told), partsUsed = new Set();
    const inFocus = (name, f) => { const pf = parts.get(name)?.focus, prev = focus; if (pf) focus = pf; try { return f(); } finally { focus = prev; } };
    const canTell = (tok) => { const { name } = token(tok); return parts.has(name) ? inFocus(name, () => parts.get(name).some(canStart)) : (moves.get(name) ?? []).some(holdsWhen); };
    const canStart = (alt) => { if (!whenHolds(alt.when)) return false; const first = alt.tokens.find((t) => token(t).kind === "must"); return !first || canTell(first); };   // (its conditions, its first must)
    function run(tokens) {
      for (const tok of tokens) {
        const { name, kind } = token(tok);
        if (kind === "maybe" && !chance(nar.maybe)) continue;
        if (kind === "many") { for (let n = 0; n < 8 && canTell(name); n++) if (!run([name])) break; continue; }   // (WORK*: the procedure's lines, while they can be told)
        let ok;
        if (parts.has(name)) ok = inFocus(name, () => { const alts = parts.get(name).filter(canStart); if (!alts.length) return false; const a = weighted(alts.map((x) => ({ ...x, w: x.w * taste(x) / (1 + (prior.get(x) ?? 0)), orig: x }))).orig; if (!partsUsed.has(a)) { partsUsed.add(a); told.set(a, (told.get(a) ?? 0) + 1); } return run(a.tokens); });
        else ok = (moves.get(name) ?? []).some(holdsWhen) && tell(name);
        if (!ok && kind === "must") { world.stuck = world.stuck ?? name; return false; }
      }
      return true;
    }
    // ---- THE PLAN: the plot's shape (one of its ARCS) and its BEATS, chosen before a word is told -- each beat one of
    //      its alternatives whose conds hold now, weighed by the narrator's taste (~tag) and by what the session told
    //      lately; so the plan knows what it holds (an obstacle in an order: the work waits for it). A plan whose
    //      musts cannot be told is drawn again (four times), else it is the other arcs and plots
    function expand(tokens, chosen) {
      const out = [];
      for (const tok of tokens) {
        const { name, kind } = token(tok);
        if (!beats.has(name)) { out.push(tok); continue; }
        if (kind === "maybe" && !chance(nar.maybe)) continue;
        const alts = beats.get(name).filter((a) => whenHolds(a.when));
        if (!alts.length) { if (kind === "must") return null; continue; }
        const alt = weighted(alts.map((a) => ({ ...a, w: a.w * taste(a) / (1 + 2 * (told.get(a) ?? 0)), orig: a }))).orig;
        chosen.push(alt);
        const sub = expand(alt.tokens, chosen);
        if (!sub) return null;
        out.push(...sub);
      }
      return out;
    }
    const plans = [];
    let planNo = 0;
    for (const arc of plots.filter((p) => !only || p.name === only)) for (let i = 0; i < 4; i++) {
      plot = { ...arc, key: ++planNo };   // (while it is planned: its beats' every alternative counts for plotHas)
      const chosen = [], tokens = expand(arc.tokens, chosen);
      if (!tokens) continue;
      plot = { ...arc, tokens, chosen, src: arc, key: ++planNo };
      if (tokens.every((tok) => token(tok).kind !== "must" || canTell(tok))) { plans.push(plot); break; }
    }
    if (!plans.length) return (why = `${sit.name}: no plot`), null;
    plot = weighted(plans.map((p) => ({ ...p, w: p.w / (1 + 2 * (told.get(p.src) ?? 0)) })));
    for (const x of [plot.src, ...plot.chosen]) told.set(x, (told.get(x) ?? 0) + 1);
    Object.assign(world, { plot: plot.name, arc: plot.arc, narrator: nar.name, beats: plot.chosen.map((a) => a.label) });
    // (an order is asked by one of hers -- not by the mechanic the situation's trouble would have called)
    if (plotHas("ASKFIX") && troubleT) troubleT.own = false;   // (his lamp, not hers)
    if ((words["story.kin-asks"] ?? []).some(plotHas) && !p2?.kin) { const n = entry(pick(words["story.kin"] ?? ["brat"]), "N"); if (n) world.p2 = p2 = { noun: n, g: gender(n), kin: true }; }
    if (!run(plot.tokens)) return (why = `${sit.name}/${plot.name}: ${world.stuck} ${world.failed.join("; ")}`), null;
    fade(told); fade(seen);
    return { sentences: world.said.map(({ clauses, plain, ...s }) => s), world };
  }
  // (every token a plot may tell, through its parts)
  const tokensOf = (plot) => { const out = []; const walk = (toks) => { for (const t of toks) { const { name } = token(t); out.push(name); for (const alt of parts.get(name) ?? beats.get(name) ?? []) walk(alt.tokens); } }; walk(plot.tokens); return out; };
  return { story, why: () => why };
}

// a plot token: NAME (must), NAME? (maybe), (NAME) (when it can), NAME* (while it can)
function token(tok) {
  if (tok.endsWith("?")) return { name: tok.slice(0, -1), kind: "maybe" };
  if (tok.endsWith("*")) return { name: tok.slice(0, -1), kind: "many" };
  if (tok.startsWith("(")) return { name: tok.slice(1, -1), kind: "can" };
  return { name: tok, kind: "must" };
}
// `verb=pršať subj=3sg.n` -> { verb: "pršať", subj: "3sg.n" }: a weather's clause as parts
function argsOf(s) {
  const out = {};
  for (const [, k, v] of s.matchAll(/([\w.-]+)=("[^"]*"|\S+)/g)) out[k] = v.replace(/^"|"$/g, "");
  return out;
}

// sentences/stories.txt: PLOT, BEAT, PART, MOVE (+ its clause lines), JOIN, NARRATOR, WORDS
export function parseStories(text) {
  const plots = [], parts = new Map(), beats = new Map(), moves = new Map(), joins = new Map(), narrators = [], words = {};
  const weightOf = (s) => { const m = s.match(/\{([\d.]+)\}\s*$/); return [m ? s.slice(0, m.index).trim() : s.trim(), m ? Number(m[1]) : 1]; };
  let cur = null;
  for (const raw of text.split("\n")) {
    if (/^\s+\S/.test(raw) && cur && !raw.trim().startsWith("#")) {   // (a clause line of the move or join above)
      // ID TYPE parts; in a JOIN also ID = A|B [TYPE] parts -- that move's clause 1, changed (-key: left out)
      const toks = raw.replace(/\s#.*$/, "").trim().match(/[\w.-]+="[^"]*"|\S+/g);
      const id = toks.shift(), from = toks[0] === "=" ? (toks.shift(), toks.shift()) : null;
      const type = toks.length && !toks[0].includes("=") && !/^[-$]/.test(toks[0]) ? toks.shift() : null;
      cur.clauses.push({ id, from, type, parts: toks.map((p) => (p.startsWith("$") ? { frag: p.slice(1) } : p.startsWith("-") ? { drop: p.slice(1) } : { key: p.slice(0, p.indexOf("=")), value: p.slice(p.indexOf("=") + 1).replace(/^"|"$/g, "") })) });
      continue;
    }
    const s = raw.replace(/#.*/, "").trim();
    if (!s) continue;
    cur = null;
    const i = s.indexOf(" : "), head = i < 0 ? s : s.slice(0, i), body = i < 0 ? "" : s.slice(i + 3).trim();
    let m;
    // (PLOT order/rush: the plot `order` told in the shape `rush` -- one of its ARCS)
    if ((m = head.match(/^PLOT ([\w-]+)(?:\/([\w-]+))?\s*(?:\{([\d.]+)\})?$/))) plots.push({ name: m[1], arc: m[2] ?? m[1], w: Number(m[3] ?? 1), tokens: body.split(/\s+/) });
    else if ((m = head.match(/^(PART|BEAT) (\S+)(?: (\w+))?$/))) {   // (PART FIXWORK mend : ... -- the procedure its moves tell; [cond ...] an alternative's conditions; - an empty one)
      const alts = body.split("|").map((alt, i) => { const [t, w] = weightOf(alt), c = t.match(/^\[([^\]]*)\]\s*/); return { tokens: (c ? t.slice(c[0].length) : t).split(/\s+/).filter((x) => x && x !== "-"), w, when: c ? c[1].trim().split(/\s+/) : [], label: `${m[2]}.${i + 1}` }; });
      alts.focus = m[3] ?? null;
      (m[1] === "BEAT" ? beats : parts).set(m[2], alts);
    }
    else if ((m = head.match(/^NARRATOR (\S+)\s*(?:\{([\d.]+)\})?$/))) narrators.push({ name: m[1], w: Number(m[2] ?? 1), ...Object.fromEntries(body.split(/\s+/).filter(Boolean).map((kv) => kv.split("=")).map(([k, v]) => [k, Number(v)])) });
    else if ((m = head.match(/^MOVE (\S+)\s*(?:\{([\d.]+)\})?(?:\s+level (\d))?((?:\s+when(?:\s+(?!sets\b)\S+)+)?)((?:\s+sets(?:\s+\S+)+)?)$/))) {
      cur = { w: Number(m[2] ?? 1), level: Number(m[3] ?? 1), when: m[4].trim().split(/\s+/).slice(1), sets: m[5].trim().split(/\s+/).slice(1), seq: body.split(/\s+/), clauses: [] };
      if (!moves.has(m[1])) moves.set(m[1], []);
      moves.get(m[1]).push(cur);
    } else if ((m = head.match(/^JOIN (\S+) (\S+)\s*\{([\d.]+)\}((?:\s+when(?:\s+\S+)+)?)$/))) {
      cur = { w: Number(m[3]), seq: body.split(/\s+/), clauses: [], when: m[4].trim().split(/\s+/).slice(1) };
      const k = `${m[1]}|${m[2]}`;
      if (!joins.has(k)) joins.set(k, []);
      joins.get(k).push(cur);
    }
    else if ((m = s.match(/^WORDS (\S+):\s*(.*)$/))) words[m[1]] = m[2].split("|").map((x) => x.trim()).filter(Boolean);
    else throw new Error(`stories: cannot read "${s}"`);
  }
  return { plots, parts, beats, moves, joins, narrators, words };
}
