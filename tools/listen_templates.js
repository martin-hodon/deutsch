// THE LISTENING TEMPLATES of a language (engine/listen.js): every dictionary word said by speak.js once, its features
// kept -- <lang>/listen.json (the index) and <lang>/listen.bin (the Int8 frames). Run with gjs (no node on this PC):
//
//   gjs -m tools/listen_templates.js de            (from lang/; a few minutes a language)
//
// Words with the same sound share one template (its index names every entry row). Entries without IPA are skipped.
import Gio from "gi://Gio";
import GLib from "gi://GLib";
const TOP = GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace(/^file:\/\//, "")));
const read = (p) => { const [ok, bytes] = Gio.File.new_for_path(p).load_contents(null); return new TextDecoder().decode(bytes); };
const write = (p, bytes) => Gio.File.new_for_path(p).replace_contents(bytes, null, false, Gio.FileCreateFlags.NONE, null);
globalThis.fetch = async (url) => { const text = read(TOP + "/" + url.replace(/^\.?\//, "")); return { ok: true, text: async () => text, json: async () => JSON.parse(text) }; };
const { render, loadProsody } = await import("../engine/speak.js");
const { features, DIMS, HOP, RATE } = await import("../engine/listen.js");

const lang = ARGV[0] ?? "de";
const rows = read(`${TOP}/${lang}/dict.tsv`).trim().split("\n");
const cols = rows[0].split("\t"), ci = Object.fromEntries(cols.map((c, i) => [c, i]));
const P = await loadProsody(`${lang}/rules/speech.txt`);
const byIpa = new Map();   // ipa -> { feat, n, rows: [{ i, word, pos }] }
const t0 = Date.now();
let made = 0;
for (let i = 1; i < rows.length; i++) {
  const f = rows[i].split("\t"), ipa = f[ci.ipa], word = f[ci.word], pos = f[ci.pos];
  if (!ipa || !/^(N|V|AN|AV|PRE|P|CON|NUM|PAR|INT|PHR|ART)$/.test(pos)) continue;
  let t = byIpa.get(ipa);
  if (!t) {
    const samples = render(ipa, "man", { prosody: P });
    const feat = features(samples, 22050);
    if (!feat.length) continue;
    t = { feat, n: feat.length / DIMS, rows: [] }; byIpa.set(ipa, t); made++;
    if (made % 500 === 0) print(`${made} templates, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  t.rows.push({ i: i - 1, word, pos });   // (i - 1: the row's index among the entries, as loadDictionary numbers them)
}
const index = [], parts = [];
let total = 0;
for (const t of byIpa.values()) { index.push({ i: t.rows.map((r) => r.i), word: t.rows[0].word, pos: t.rows[0].pos, n: t.n }); parts.push(t.feat); total += t.feat.length; }
const bin = new Uint8Array(total);
let at = 0; for (const p of parts) { bin.set(new Uint8Array(p.buffer, p.byteOffset, p.length), at); at += p.length; }
write(`${TOP}/${lang}/listen.json`, new TextEncoder().encode(JSON.stringify({ version: 1, dims: DIMS, hop: HOP, rate: RATE, voice: "man", index })));
write(`${TOP}/${lang}/listen.bin`, bin);
print(`${lang}: ${index.length} templates for ${rows.length - 1} entries, ${(total / 1024 / 1024).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
