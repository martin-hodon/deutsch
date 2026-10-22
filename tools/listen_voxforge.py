# VOXFORGE -> the LIST.tsv of tools/listen_data.js (align): every recording's wav, its speaker and the IPA of what was read
# (espeak-ng's German, in engine/speak.js's symbols). VoxForge (voxforge.org, GPL): people reading prompts at home into
# their own microphones -- the voices and rooms the 🎤 meets. Each downloaded archive is unpacked into its own folder
# (plain files only); a recording with no wav (flac only) or no prompt is left out.
#
#   python3 -I tools/listen_voxforge.py TGZ-DIR UNPACK-DIR LIST.tsv
import os, re, subprocess, sys, tarfile

tgz_dir, unpack, out = sys.argv[1:4]
# espeak-ng's German IPA -> speak.js's: its tap r is German's ʁ, its -er ɜ the vocalised ɐ, its long a back
SYMBOLS = {"ɾ": "ʁ", "ɜ": "ɐ", "ɑ": "a", "r": "ʁ"}
def ipa(text):
    said = subprocess.run(["espeak-ng", "-v", "de", "-q", "--ipa", text], capture_output=True, text=True, timeout=30).stdout
    return "".join(SYMBOLS.get(c, c) for c in " ".join(said.split()))
rows = 0
with open(out, "w") as f:
    for name in sorted(os.listdir(tgz_dir)):
        if not name.endswith(".tgz"): continue
        where = os.path.join(unpack, name[:-4])
        if not os.path.isdir(where):
            os.makedirs(where)
            with tarfile.open(os.path.join(tgz_dir, name)) as t: t.extractall(where, filter="data")
        top = next((os.path.join(where, d) for d in os.listdir(where) if os.path.isdir(os.path.join(where, d))), where)
        prompts = os.path.join(top, "etc", "prompts-original")
        if not os.path.exists(prompts): continue
        speaker = re.sub(r"-\d{8}.*", "", name)
        speaker = name[:-4] if speaker == "anonymous" else speaker   # (anonymous: a recording is a voice of its own)
        for line in open(prompts, encoding="utf-8", errors="replace"):
            parts = line.strip().split(None, 1)
            if len(parts) < 2: continue
            wav = os.path.join(top, "wav", parts[0] + ".wav")
            if os.path.exists(wav):
                f.write(f"{wav}\t{speaker}\t{ipa(parts[1])}\n"); rows += 1
print(f"{out}: {rows} recordings")
