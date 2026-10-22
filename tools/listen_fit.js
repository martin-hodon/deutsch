// THE LISTENING PROFILES (engine/listen.json): each speech-sound class of engine/listen.js measured on a labelled corpus
// of real voices -- the Berlin emotional speech database (emodb.bilderbar.info, free: 10 speakers, 535 sentences, phone
// labels in lablaut/ with START times). Every recording is heard twice: as it is, and through a random cheap microphone (a
// bass cut 80-400 Hz, a tilt, noise 20-40 dB under the peak). A class is a mixture of up to three full-covariance
// Gaussians (EM from k-means), each variance at least a tenth of the feature's over all frames; a class with few frames
// (ø, ʒ: none in German sentences) borrows its group's. Run with gjs (no node on this PC):
//
//   gjs -m tools/listen_fit.js CORPUS                  (CORPUS: the unpacked database, with wav/ and lablaut/)
//   gjs -m tools/listen_fit.js CORPUS 03,16 OUT.json   (speakers 03 and 16 left out, the frame accuracy on them printed;
//                                                       OUT.json for tools/listen_eval.js -- engine/listen.json untouched)
import Gio from "gi://Gio";
import GLib from "gi://GLib";
const TOP = GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace(/^file:\/\//, "")));
const L = await import("../engine/listen.js");
const [corpus, leave = "", out = `${TOP}/engine/listen.json`] = ARGV;
if (!corpus) { print("usage: gjs -m tools/listen_fit.js CORPUS [SPEAKERS-LEFT-OUT OUT.json]"); throw new Error("no corpus"); }
const left = leave ? leave.split(",") : [];

const { emodbFrames } = await import("./listen_corpus.js");
// a recording's frames, each with the class of the phone at its middle (the frames with none left out)
function labelled(name, mic) {
  const { F, cls } = emodbFrames(corpus, name, mic), rows = [];
  cls.forEach((c, t) => { if (c) rows.push({ c, x: F.x.subarray(t * L.DIMS, t * L.DIMS + L.MIXTURE_DIMS) }); });
  return rows;
}
const names = [];
const files = Gio.File.new_for_path(`${corpus}/wav`).enumerate_children("standard::name", 0, null);
for (let info; (info = files.next_file(null)); ) { const n = info.get_name(); if (n.endsWith(".wav")) names.push(n.slice(0, -4)); }
names.sort();
const fitNames = names.filter((n) => !left.includes(n.slice(0, 2))), testNames = names.filter((n) => left.includes(n.slice(0, 2)));
const train = [...fitNames.flatMap((n) => labelled(n, false)), ...fitNames.flatMap((n) => labelled(n, true))];
print(`${fitNames.length} recordings (x2: as they are and through a microphone), ${train.length} frames`);

// ---- the Gaussians -------------------------------------------------------------------------------------------------------
const D = L.MIXTURE_DIMS, SHRINK = .1, TAU = 400, K = 3, MIN = 300;
const VFLOOR = (() => { const m = new Float64Array(D), v = new Float64Array(D); for (const r of train) for (let i = 0; i < D; i++) m[i] += r.x[i] / train.length; for (const r of train) for (let i = 0; i < D; i++) v[i] += (r.x[i] - m[i]) ** 2 / train.length; return Array.from(v, (x) => .1 * x); })();
// one full-covariance Gaussian (shrunk a tenth toward its diagonal, the variance floor), inverted -> { m, ic, ld }
function gauss(rows) {
  const n = rows.length, m = new Float64Array(D), C = Array.from({ length: D }, () => new Float64Array(D));
  for (const r of rows) for (let i = 0; i < D; i++) m[i] += r.x[i] / n;
  for (const r of rows) for (let i = 0; i < D; i++) { const di = r.x[i] - m[i]; for (let j = 0; j < D; j++) C[i][j] += di * (r.x[j] - m[j]) / n; }
  for (let i = 0; i < D; i++) { C[i][i] = Math.max(C[i][i], .01, VFLOOR[i]); for (let j = 0; j < D; j++) if (i !== j) C[i][j] *= 1 - SHRINK; }
  const A = C.map((r, i) => [...r, ...Array.from({ length: D }, (_, j) => (i === j ? 1 : 0))]);
  let ld = 0;
  for (let i = 0; i < D; i++) {
    let p = i; for (let k = i + 1; k < D; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    [A[i], A[p]] = [A[p], A[i]];
    const v = A[i][i]; ld += Math.log(Math.abs(v));
    for (let j = 0; j < 2 * D; j++) A[i][j] /= v;
    for (let k = 0; k < D; k++) if (k !== i) { const f = A[k][i]; if (f) for (let j = 0; j < 2 * D; j++) A[k][j] -= f * A[i][j]; }
  }
  return { m: Array.from(m), ic: A.map((r) => r.slice(D)), ld };
}
const quad = (g, x) => { let q = 0; for (let i = 0; i < D; i++) { let s = 0; for (let j = 0; j < D; j++) s += g.ic[i][j] * (x[j] - g.m[j]); q += (x[i] - g.m[i]) * s; } return q; };
// up to K components: k-means (6 rounds) for a start, then 8 rounds of EM (a frame to the component most likely its); a
// component under MIN frames is dropped
function mixture(rows) {
  const n = rows.length, k = Math.max(1, Math.min(K, Math.floor(n / MIN)));
  if (k === 1) return [{ w: 1, ...gauss(rows) }];
  let cent = Array.from({ length: k }, (_, j) => Array.from(rows[Math.floor((j + .5) * n / k)].x));
  const as = new Int32Array(n);
  for (let it = 0; it < 6; it++) {
    for (let i = 0; i < n; i++) { let b = 0, bd = Infinity; for (let j = 0; j < k; j++) { let d = 0; for (let t = 0; t < D; t++) d += (rows[i].x[t] - cent[j][t]) ** 2; if (d < bd) { bd = d; b = j; } } as[i] = b; }
    cent = cent.map((c, j) => { const m = rows.filter((_, i) => as[i] === j); return m.length ? c.map((_, t) => m.reduce((s, r) => s + r.x[t], 0) / m.length) : c; });
  }
  let comps = Array.from({ length: k }, (_, j) => rows.filter((_, i) => as[i] === j)).filter((m) => m.length >= MIN).map((m) => ({ w: m.length / n, ...gauss(m) }));
  for (let it = 0; it < 8 && comps.length > 1; it++) {
    const pick = comps.map(() => []);
    for (const r of rows) { let b = 0, bl = -Infinity; comps.forEach((g, j) => { const l = Math.log(g.w) - .5 * Math.min(200, quad(g, r.x)) - .5 * g.ld; if (l > bl) { bl = l; b = j; } }); pick[b].push(r); }
    comps = pick.filter((m) => m.length >= MIN).map((m) => ({ w: m.length / n, ...gauss(m) }));
    const tw = comps.reduce((s, g) => s + g.w, 0); comps.forEach((g) => (g.w /= tw));
  }
  return comps;
}
// a class's frames; one with few borrows its group's, thinned to about TAU of them, its own counted three times
function framesOf(c) {
  const own = train.filter((r) => r.c === c);
  if (own.length >= 4 * TAU) return own;
  const group = train.filter((r) => L.GROUP[r.c] === L.GROUP[c] && r.c !== c), step = Math.max(1, Math.round(group.length / TAU));
  return [...own, ...own, ...own, ...group.filter((_, i) => i % step === 0)];
}
const G = Object.fromEntries(L.CLASS_NAMES.map((c) => [c, mixture(framesOf(c))]));
print("components: " + L.CLASS_NAMES.map((c) => c + G[c].length).join(" "));

// the speakers left out: their frames classified by the profiles alone (the likeliest class)
if (testNames.length) {
  const test = testNames.flatMap((n) => labelled(n, false));
  const cost = (x, c) => { const l = G[c].map((g) => Math.log(g.w) - .5 * Math.min(60, quad(g, x)) - .5 * g.ld), mx = Math.max(...l); return -(mx + Math.log(l.reduce((s, v) => s + Math.exp(v - mx), 0))); };
  let right = 0;
  for (const r of test) { let best = null, bc = Infinity; for (const c of L.CLASS_NAMES) { const k = cost(r.x, c); if (k < bc) { bc = k; best = c; } } if (best === r.c) right++; }
  print(`speakers ${leave} left out: ${test.length} frames, ${(100 * right / test.length).toFixed(1)}% classed right`);
}
const r4 = (v) => +v.toPrecision(4);
const json = { made: new Date().toISOString().slice(0, 10), corpus: "Berlin emotional speech database" + (leave ? `, speakers ${leave} left out` : ""), features: L.FEATURES,
  classes: Object.fromEntries(Object.entries(G).map(([c, gs]) => [c, gs.map((g) => ({ w: r4(g.w), m: g.m.map(r4), ld: r4(g.ld), ic: g.ic.flatMap((row, i) => row.slice(i)).map(r4) }))])) };
Gio.File.new_for_path(out).replace_contents(new TextEncoder().encode(JSON.stringify(json) + "\n"), null, false, Gio.FileCreateFlags.NONE, null);
print(`${out} written`);
