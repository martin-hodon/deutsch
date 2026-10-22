# THE LISTENING NETWORK (engine/listen_net.json): a small network trained from scratch that tells engine/listen.js's
# speech-sound classes apart from a window of frames (CONTEXT: 0.2 s around the frame) -- what the per-frame Gaussians of
# engine/listen.json cannot see: a glide into a vowel, lips closing, a burst. Plain numpy: two hidden layers (ReLU), a
# softmax over the classes, Adam. Trained on the packs of tools/listen_data.js (frames + each one's class, 255: none);
# speakers held out (`--hold`) give the frame accuracy on voices it never heard. The weights are kept as int8, a scale for
# each unit (row); the class priors go with them (the page divides by them: a likelihood, not a posterior).
#
# A few voices read for hours (VoxForge: two speakers are most of it) -- `--cap`: each epoch takes at most that many hours
# of any one speaker, a new draw each time.
#
#   python3 tools/listen_train.py OUT.json PACK... [--hold SPEAKER,...] [--cap HOURS] [--hidden 320] [--epochs 12]
import argparse, base64, json, sys, time
import numpy as np

CONTEXT = list(range(-10, 11))
ap = argparse.ArgumentParser()
ap.add_argument("out"); ap.add_argument("packs", nargs="+")
ap.add_argument("--hold", default=""); ap.add_argument("--cap", type=float, default=0); ap.add_argument("--hidden", type=int, default=320); ap.add_argument("--epochs", type=int, default=12)
ap.add_argument("--batch", type=int, default=512); ap.add_argument("--lr", type=float, default=1e-3); ap.add_argument("--seed", type=int, default=1)
A = ap.parse_args()
hold = set(filter(None, A.hold.split(",")))

# ---- the frames: every pack's utterances end to end; each labelled frame's window as indices clamped to its utterance --
# (the packs' frames read from disk as needed -- memory-mapped, normalised a batch at a time: VoxForge whole is gigabytes)
xs, ys, los, his, helds, spks, speakers = [], [], [], [], [], [], {}
at = 0
for p in A.packs:
    meta = json.load(open(p + ".json"))
    D, C = len(meta["features"]), len(meta["classes"])
    xs.append(np.memmap(p + ".x", dtype=np.float32, mode="r").reshape(-1, D)); ys.append(np.fromfile(p + ".y", dtype=np.uint8))
    k = 0
    for u in meta["utterances"]:
        n = u["n"]; los.append(np.full(n, at + k, np.int32)); his.append(np.full(n, at + k + n - 1, np.int32)); helds.append(np.full(n, u["speaker"] in hold))
        spks.append(np.full(n, speakers.setdefault(u["speaker"], len(speakers)), np.int32)); k += n
    at += len(ys[-1])
Y = np.concatenate(ys); LO = np.concatenate(los); HI = np.concatenate(his); HELD = np.concatenate(helds); SPK = np.concatenate(spks)
starts = np.cumsum([0] + [len(y) for y in ys])
def rows(j):   # global frame indices -> their features (any shape), from whichever pack holds each
    flat = j.ravel(); out = np.empty((len(flat), D), np.float32); k = np.searchsorted(starts, flat, side="right") - 1
    for q in np.unique(k): sel = k == q; out[sel] = xs[q][flat[sel] - starts[q]]
    return out.reshape(*j.shape, D)
names = meta["classes"]
sample = np.sort(np.random.default_rng(0).choice(len(Y), min(len(Y), 200000), replace=False))
mean, std = rows(sample).mean(0), rows(sample).std(0) + 1e-6
lab = np.flatnonzero(Y != 255)
held = HELD[lab]
train, test = lab[~held], lab[held]
print(f"{len(Y)} frames, {len(train)} to train on, {len(test)} held out ({len(hold)} speakers), {D} features x {len(CONTEXT)} frames", flush=True)
offs = np.array(CONTEXT)
def windows(idx):
    j = np.clip(idx[:, None] + offs[None, :], LO[idx][:, None], HI[idx][:, None])
    return ((rows(j) - mean) / std).astype(np.float32).reshape(len(idx), -1)

# ---- the network ---------------------------------------------------------------------------------------------------------
rng = np.random.default_rng(A.seed)
sizes = [D * len(CONTEXT), A.hidden, A.hidden, C]
W = [rng.normal(0, np.sqrt(2 / a), (a, b)).astype(np.float32) for a, b in zip(sizes, sizes[1:])]
B = [np.zeros(b, np.float32) for b in sizes[1:]]
params = W + B
m1 = [np.zeros_like(p) for p in params]; m2 = [np.zeros_like(p) for p in params]
def forward(x):
    hs = [x]
    for k in range(len(W)):
        z = hs[-1] @ W[k] + B[k]
        hs.append(np.maximum(z, 0) if k < len(W) - 1 else z)
    return hs
def logsoftmax(z):
    z = z - z.max(1, keepdims=True)
    return z - np.log(np.exp(z).sum(1, keepdims=True))
def accuracy(idx):
    right = 0
    for a in range(0, len(idx), 8192):
        b = idx[a:a + 8192]; right += (forward(windows(b))[-1].argmax(1) == Y[b]).sum()
    return right / max(1, len(idx))

step = 0
for epoch in range(A.epochs):
    t0 = time.time(); order = rng.permutation(train); loss = 0
    if A.cap:   # (the first `cap` hours of each speaker's frames in this epoch's order)
        s = SPK[order]; first = np.argsort(s, kind="stable"); seen = np.empty(len(order), np.int64)
        start = np.searchsorted(s[first], s[first]); seen[first] = np.arange(len(order)) - start
        order = order[seen < A.cap * 360000]
    lr = A.lr * (.5 ** max(0, epoch - A.epochs // 2))   # (halved each epoch over the second half)
    for a in range(0, len(order), A.batch):
        b = order[a:a + A.batch]; hs = forward(windows(b)); lp = logsoftmax(hs[-1])
        loss += -lp[np.arange(len(b)), Y[b]].sum()
        g = np.exp(lp); g[np.arange(len(b)), Y[b]] -= 1; g /= len(b)
        gW, gB = [None] * len(W), [None] * len(W)
        for k in range(len(W) - 1, -1, -1):
            gW[k] = hs[k].T @ g; gB[k] = g.sum(0)
            if k: g = (g @ W[k].T) * (hs[k] > 0)
        step += 1
        for i, (p, gr) in enumerate(zip(params, gW + gB)):
            m1[i] = .9 * m1[i] + .1 * gr; m2[i] = .999 * m2[i] + .001 * gr * gr
            p -= lr * (m1[i] / (1 - .9 ** step)) / (np.sqrt(m2[i] / (1 - .999 ** step)) + 1e-8)
    print(f"epoch {epoch + 1}: loss {loss / len(order):.3f}, held-out frames right {100 * accuracy(test):.1f} %, {time.time() - t0:.0f} s", flush=True)

# ---- out: int8 rows (a scale each), the priors -------------------------------------------------------------------------
def q8(w):   # w: (in, out) -> rows by unit: (out, in)
    r = w.T; s = np.abs(r).max(1) / 127 + 1e-12
    return base64.b64encode(np.round(r / s[:, None]).astype(np.int8).tobytes()).decode(), [float(f"{v:.5g}") for v in s]
prior = np.bincount(Y[train], minlength=C) / len(train)
layers = []
for w, b in zip(W, B):
    q, s = q8(w); layers.append({"in": w.shape[0], "out": w.shape[1], "w": q, "scale": s, "b": [float(f"{v:.5g}") for v in b]})
json.dump({"made": time.strftime("%Y-%m-%d"), "packs": [p.split("/")[-1] for p in A.packs], "held_out": sorted(hold), "context": CONTEXT,
           "features": meta["features"], "classes": names, "mean": [float(f"{v:.5g}") for v in mean], "std": [float(f"{v:.5g}") for v in std],
           "prior": [float(f"{max(v, 1e-5):.5g}") for v in prior], "layers": layers}, open(A.out, "w"))
print(f"{A.out}: {sum(w.size for w in W)} weights")
