// SCENES: where words belong and what actions need and give (scenes.tsv, made by tools/scenes.py from
// sentences/settings.txt, sentences/scenes/*.txt, sentences/conditions.txt). A sentence in scene mode takes its nouns
// and verbs from one setting -- and its clause links from the conditions: weil what the action needs, obwohl its
// opposite, deshalb what it gives, nachdem / bevor / um ... zu one action's gift as another's need.
//
//   const sc = parseScenes(text, dict)
//   sc.pick(rnd)                 a setting with enough words for sentences
//   sc.has(setting, entry)       the entry belongs there (or above, below it, or to every setting)
//   sc.local(setting, entry)     it belongs there by the setting's own words, not only as a word of every setting
//   sc.role(setting, entry)      its role there (guest, staff ...), or null
//   sc.together(a, b)            some setting lists both (der Kellner, bringen: restaurant)
//   sc.own(setting, entry)       the setting itself lists it (not only one above or below: the kitchen's Herd)
//   sc.situations()              the SITUATIONS (sentences/situations/*.txt): { name, setting, place, people, things, own,
//                                wants: [{ state, verb, obj, det: none|indef|def|poss, num, uses, adj }], troubles: [{ thing, state, verb, by }], lacks: [{ thing, place, verb }] }
//   sc.cond(entry)               { needs: [atom], gives: [atom], involuntary } or null
//   sc.state(name)               { forms: [[adj|noun, concept]], opposite, of: [category], goal, feeling, default, person, wish, ends: verb } -- a STATE; sc.objstate(name): { opposite, become }
//   sc.stateOf(concept)          the STATE an adjective or a noun says (unavený, hlad -> its state), or null
//   sc.valence(entry)            1 good, -1 bad, 0 neither (sentences/valence.txt: schön, Fest, gewinnen / hässlich, Unfall)
//   sc.world                     the WORLD's sheets (sentences/world/*): props {temperature: {scale, values, of}}, valueOf
//                                (heiß -> temperature), weather, seasons, places {Küche: {out, props, things, people,
//                                weather}}, rules [{when, then: [{kind: state|thing|wear, values}]}], traits, tastes,
//                                tasteOf, tools {reparieren: [Werkzeug ...]}, actors [{name, g, job, traits, likes,
//                                dislikes, home}]
//   sc.attitude(verb)            "like" (sich freuen, lieben), "dislike" (hassen, sich ärgern) or null; sc.carries(verb):
//                                a clause of it is as good as its object (haben, bekommen: einen Unfall haben)

// the WORLD's rows (tools/world.py): properties, weather, seasons, places, rules, traits, tastes, the cast; how traits
// show (SHOWS), the procedures (PROC + its PLINEs), the body's signs (SIGN), what things sound, smell, look like (AMB)
const pairs = (x) => (x || "").split("|").filter(Boolean).map((y) => { const [k, n] = y.split(":"); return [k, Number(n ?? 1)]; });
const props = (x) => Object.fromEntries((x || "").split(" ").filter(Boolean).map((y) => { const [k, v] = y.split("="); return [k, v.split("|")]; }));
const list = (x) => (x || "").split("|").filter(Boolean);
const WORLD = {
  PROP: (f, w) => { w.props.set(f[1], { scale: f[2] === "<", values: list(f[3]), of: (f[4] || "").split(" ") }); for (const v of list(f[3])) w.valueOf.set(v, f[1]); },
  WEATHER: (f, w) => { const ps = (f[3] || "").split(" "); w.weather.set(f[1], { clause: f[2], props: props(ps.filter((x) => x !== "bad").join(" ")), noun: f[4] || null, bad: ps.includes("bad") }); },
  SEASON: (f, w) => w.seasons.set(f[1], pairs(f[2])),
  PLACE: (f, w) => w.places.set(f[1], { out: f[2] === "out", props: props(f[3]), things: list(f[4]), people: list(f[5]), weather: pairs(f[6]) }),
  RULE: (f, w) => w.rules.push({ when: (f[1] || "").split("&").filter(Boolean), then: (f[2] || "").split(";").filter(Boolean).map((e) => { const [k, v] = e.split("="); return { kind: k, values: list(v) }; }) }),
  TRAIT: (f, w) => w.traits.push(...list(f[1])),
  // (a verb's tools; `for`: only for things of those kinds -- probieren with a Gabel for meat, a Löffel for soup)
  TOOL: (f, w) => { if (!w.tools.has(f[1])) w.tools.set(f[1], []); w.tools.get(f[1]).push(...list(f[2]).map((n) => ({ n, for: list(f[3]) }))); },
  TASTE: (f, w) => { w.tastes.set(f[1], list(f[2])); for (const x of list(f[2])) w.tasteOf.set(x, f[1]); },
  ACTOR: (f, w) => w.actors.push({ name: f[1], g: f[2], job: f[3] || null, traits: list(f[4]), likes: list(f[5]), dislikes: list(f[6]), home: f[7] || null }),
  SHOWS: (f, w) => w.shows.set(f[1], list(f[2])),
  // (a procedure: its wish's verb, what of, what must be there; then its lines: step / process / key, the clause, gives)
  PROC: (f, w) => w.procedures.push({ verbs: list(f[1]), of: list(f[2]), here: list(f[3]).map((g) => g.split("/")), lines: [] }),
  PLINE: (f, w) => w.procedures[w.procedures.length - 1].lines.push({ kind: f[1], clause: f[2], gives: list(f[3]), detail: f[4] === "detail", if: list(f[5]), marks: list(f[6]) }),
  TEX: (f, w) => w.textures.push({ of: list(f[1]), adjs: list(f[2]) }),
  SIDE: (f, w) => { for (const pl of list(f[1])) { if (!w.side.has(pl)) w.side.set(pl, []); w.side.get(pl).push(f[2]); } },
  AMB: (f, w) => { if (!w.ambience.has(f[2])) w.ambience.set(f[2], []); w.ambience.get(f[2]).push({ kind: f[1], clause: f[3], omen: f[4] || null }); },
  SIGN: (f, w) => { if (!w.signs.has(f[1])) w.signs.set(f[1], []); w.signs.get(f[1]).push(f[2]); },
};

export function parseScenes(text, dict) {
  // (the world names CONCEPTS: a row is about every word of its concept)
  const byConcept = new Map();
  for (const e of dict.entries) { const k = `${e.pos}|${e.concept}`; if (!byConcept.has(k)) byConcept.set(k, []); byConcept.get(k).push(e); }
  const entriesOf = (pos, id) => byConcept.get(`${pos}|${id.replace(/_/g, " ")}`) ?? [];
  const tok = (x) => (x ? x.replace(/ /g, "_") : x);   // (a concept as the world's tokens write it: pokaziť_sa)
  const settings = new Map(), states = new Map(), objstates = new Map(), members = new Map(), conds = new Map(), vals = new Map(), sits = [];
  const world = { props: new Map(), valueOf: new Map(), weather: new Map(), seasons: new Map(), places: new Map(), rules: [], tools: new Map(), traits: [], tastes: new Map(), tasteOf: new Map(), actors: [], shows: new Map(), procedures: [], signs: new Map(), ambience: new Map(), side: new Map(), textures: [] };
  for (const line of text.trim().split("\n")) {
    const f = line.split("\t");
    if (f[0] === "SET") settings.set(f[1], { parent: f[2] || null, roles: (f[3] || "").split(" ").filter(Boolean) });
    else if (f[0] === "STATE") states.set(f[1], { forms: f[2].split("|").map((x) => { const i = x.indexOf(" "); return [x.slice(0, i), tok(x.slice(i + 1))]; }), opposite: f[3] || null, of: (f[4] || "").split(" ").filter(Boolean), ...Object.fromEntries((f[5] || "").split(" ").filter(Boolean).map((k) => (k.includes("=") ? [k.split("=")[0], tok(k.split("=")[1])] : [k, true]))) });   // (goal, ends=essen)
    else if (f[0] === "OBJSTATE") objstates.set(f[1], { opposite: f[3] || null, become: tok(f[4]) || null });
    else if (WORLD[f[0]]) WORLD[f[0]](f, world);   // (the world's sheets: tools/world.py)
    else if (f[0] === "M") {
      if (!members.has(f[1])) members.set(f[1], new Map());
      for (const e of entriesOf(f[2], f[3])) members.get(f[1]).set(e, f[4] || null);
    } else if (f[0] === "SIT") sits.push({ name: f[1], setting: f[2], what: f[3], place: [], people: [], things: [], own: [], wants: [], troubles: [], lacks: [] });
    else if (f[0] === "SITP") {   // (a situation's line: sentences/situations/*.txt, read into fields by tools/scenes.py)
      const sit = sits[sits.length - 1], v = f[3], list = (x) => x.split("|").map((y) => y.trim()).filter(Boolean);
      if (f[2] === "want") sit.wants.push({ state: f[3], verb: f[4], obj: f[5] || null, det: f[6], num: f[7], uses: list(f[8] ?? ""), adj: f[9] || null });
      else if (f[2] === "lack") sit.lacks.push({ thing: f[3], place: f[4], verb: f[5] });
      else if (f[2] === "trouble") sit.troubles.push({ thing: f[3], state: f[4], verb: f[5], by: f[6] || null });
      else sit[f[2]].push(...list(v));
    } else if (f[0] === "VAL") vals.set(`${f[1]}|${f[2]}|${f[3].length > 2 ? f[3] : "v"}`, f[3]);
    else if (f[0] === "C") {
      for (const e of entriesOf(f[1], f[2])) conds.set(e, { needs: (f[3] || "").split(" ").filter(Boolean), gives: (f[4] || "").split(" ").filter(Boolean), involuntary: (f[5] || "").includes("involuntary") });
    }
  }
  // a setting's RELATED ones: itself, those above it, those below it -- a kitchen word is a home word, and a home word
  // a kitchen one; the root's words (scenes/general.txt) belong to every setting
  const up = (s) => (s ? [s, ...up(settings.get(s)?.parent)] : []);
  const related = new Map();
  for (const s of settings.keys()) related.set(s, new Set([...up(s), ...[...settings.keys()].filter((t) => up(t).includes(s))]));
  // (each setting's words as one set, made when first asked: a sentence asks thousands of times)
  const sets = new Map(), locals = new Map();
  const wordsOf = (setting, own) => {
    const cache = own ? locals : sets;
    if (!cache.has(setting)) cache.set(setting, new Set([...(related.get(setting) ?? [])].filter((s) => !own || settings.get(s).parent).flatMap((s) => [...(members.get(s)?.keys() ?? [])])));
    return cache.get(setting);
  };
  const has = (setting, e) => wordsOf(setting, false).has(e);
  const local = (setting, e) => wordsOf(setting, true).has(e);
  // (the settings that list an entry themselves: a profession's own actions are those listed beside it)
  const own = new Map();
  for (const [st, m] of members) for (const e of m.keys()) { if (!own.has(e)) own.set(e, new Set()); own.get(e).add(st); }
  const together = (a, b) => [...(own.get(a) ?? [])].some((st) => own.get(b)?.has(st));
  const role = (setting, e) => { for (const s of related.get(setting) ?? []) { const r = members.get(s)?.get(e); if (r) return r; } return null; };
  // the settings sentences can be made in: below the root, with nouns and verbs enough of their own
  const count = (s, pos) => [...(related.get(s) ?? [])].reduce((t, x) => t + [...(members.get(x)?.keys() ?? [])].filter((e) => e.pos === pos).length, 0);
  const usable = [...settings.keys()].filter((s) => settings.get(s).parent && count(s, "N") >= 8 && count(s, "V") >= 5);
  return {
    settings, usable,
    pick: (rnd) => usable[Math.floor(rnd() * usable.length)] ?? null,
    has, local, role, together,
    own: (setting, e) => !!members.get(setting)?.has(e),
    situations: () => sits,
    stateNames: () => [...states.keys()],
    cond: (e) => conds.get(e) ?? null,
    state: (name) => states.get(name) ?? null,
    stateOf: (id) => { for (const [name, st] of states) if (st.forms.some((f) => f[1] === id)) return name; return null; },   // (by a concept: hladný, hlad)
    objstate: (name) => objstates.get(name) ?? null,
    world,
    valence: (e) => Number(vals.get(`${e.pos}|${e.concept}|v`) ?? 0),
    attitude: (e) => vals.get(`V|${e.concept}|like`) ?? vals.get(`V|${e.concept}|dislike`) ?? null,
    carries: (e) => vals.has(`V|${e.concept}|carry`),
  };
}
