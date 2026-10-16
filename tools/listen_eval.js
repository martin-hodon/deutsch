// HOW WELL THE LISTENING RECOGNISES (engine/listen.js): N dictionary words of a language said by ANOTHER voice of the
// synthesizer (woman / child, a changed tempo) are matched against the man's templates -- top-1 and top-5 hits. A
// stand-in for a human voice (no recordings here): it shows the matcher's robustness to pitch and tempo, not its real
// accuracy. Run: gjs -m tools/listen_eval.js de woman 1.15 200
import Gio from "gi://Gio";
import GLib from "gi://GLib";
const TOP = GLib.path_get_dirname(GLib.path_get_dirname(import.meta.url.replace(/^file:\/\//, "")));
const read = (p) => { const [ok, bytes] = Gio.File.new_for_path(p).load_contents(null); return bytes; };
globalThis.fetch = async (url) => { const bytes = read(TOP + "/" + url.replace(/^\.?\//, "")); return { ok: true, text: async () => new TextDecoder().decode(bytes), json: async () => JSON.parse(new TextDecoder().decode(bytes)), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }; };
const { render, loadProsody } = await import("../engine/speak.js");
const { loadTemplates, recognizeAll } = await import("../engine/listen.js");
const [lang = "de", voice = "woman", tempo = "1.15", N = "200"] = ARGV;
const T = await loadTemplates(`${lang}/listen`), P = await loadProsody(`${lang}/rules/speech.txt`);
const rows = new TextDecoder().decode(read(`${TOP}/${lang}/dict.tsv`)).trim().split("\n"), cols = rows[0].split("\t"), ci = Object.fromEntries(cols.map((c, i) => [c, i]));
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = T.list.filter((t) => !t.word.includes(" ")).sort(() => rnd() - .5).slice(0, Number(N));
let top1 = 0, top5 = 0, none = 0; const t0 = Date.now(), misses = [];
for (const t of pick) {
  const ipa = rows[t.i[0] + 1].split("\t")[ci.ipa];
  const res = recognizeAll(render(ipa, voice, { prosody: P, tempo: Number(tempo) }), 22050, T, { top: 5 });
  if (!res.length) { none++; continue; }
  const hit = (r) => r.i.some((i) => t.i.includes(i));
  if (hit(res[0])) top1++;
  if (res.some(hit)) top5++; else if (misses.length < 8) misses.push(`${t.word} -> ${res.slice(0, 3).map((r) => r.word + " " + r.score.toFixed(2)).join(", ")}`);
}
print(`${lang} ${voice} tempo ${tempo}: ${pick.length} words, top-1 ${(100 * top1 / pick.length).toFixed(0)}%, top-5 ${(100 * top5 / pick.length).toFixed(0)}%, none ${none}, ${((Date.now() - t0) / pick.length).toFixed(0)} ms a word`);
print("misses: " + misses.join(" | "));
