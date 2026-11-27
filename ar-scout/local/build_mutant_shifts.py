#!/usr/bin/env python3
"""Dock every known compound into the AR resistance mutants and record the shift.

Why this and not a contact count. The residues named as deciding antagonism -
Trp741, Thr877, Phe876 - are known from resistance mutations: W741L turns
bicalutamide into an agonist, T877A does the same for hydroxyflutamide and
cyproterone, F876L for enzalutamide. It is tempting to turn that into "an
antagonist contacts these residues", but measured over the docked panel that
is simply false: Trp741 is touched by 75% of agonists and 87% of antagonists,
Phe876 by 88% and 93%, Thr877 by every single compound. They line the pocket,
so everything touches them.

The mutation evidence is about what happens when the residue is *removed*, not
about contact. So measure that directly: dock the same ligand into the wild
type and into each mutant, and look at the shift. An antagonist held out by a
side chain fits better once that side chain is gone; an agonist, which was
using the intact pocket, fits worse.

    python3 build_mutant_shifts.py --smina /path/to/smina

Writes web/assets/mutant_shifts.json, keyed by structure like the binding
scene so the app can look a compound up however its SMILES was written.
"""

import argparse
import json
import pathlib
import subprocess
import sys
import tempfile
import time

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parent / "web"

sys.path.insert(0, str(HERE))
import ar_dock  # noqa: E402

# workdir -> (label, pdb id, what the mutation is)
MUTANTS = [
    ("dock2", "t877a", "2OZ7", "Thr877Ala"),
    ("dock3", "w741l", "1Z95", "Trp741Leu"),
]
WILD_TYPE = ("dock", "2AM9")

LIST_JS = r"""
const PR = require(%(predict)s);
const seen = {}, rows = [];
function add(name, smiles) {
  if (seen[smiles]) return;
  seen[smiles] = 1;
  rows.push({ name: name, smiles: smiles });
}
for (const e of PR.REFERENCE_DEFAULT) add(e.n, e.s);
for (const t of PR.INGREDIENTS) add(t[1], t[2]);
console.log(JSON.stringify(rows));
"""

KEY_JS = r"""
const AR = require(%(armodel)s);
const fs = require('fs');
const rows = JSON.parse(fs.readFileSync(%(infile)s, 'utf8'));
const out = {};
for (const r of rows) {
  try {
    const m = AR.parseSmiles(r.smiles);
    out[r.smiles] = AR.structureIdOf(m);
  } catch (err) { out[r.smiles] = null; }
}
fs.writeFileSync(%(outfile)s, JSON.stringify(out));
"""


def q(p):
    return json.dumps(str(p))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--smina", default="smina")
    ap.add_argument("--out", type=pathlib.Path,
                    default=WEB / "assets" / "mutant_shifts.json")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    for workdir, _, pdb, _ in MUTANTS:
        if not (HERE / workdir / "receptor.pdb").exists():
            raise SystemExit("run: python3 ar_dock.py --prepare --pdb %s --workdir %s"
                             % (pdb, HERE / workdir))

    listing = subprocess.run(["node", "-e", LIST_JS % {"predict": q(WEB / "predict.js")}],
                             capture_output=True, text=True)
    if listing.returncode != 0:
        raise SystemExit("could not read the compound list:\n" + listing.stderr)
    rows = json.loads(listing.stdout)
    if args.limit:
        rows = rows[:args.limit]

    tmp = pathlib.Path(tempfile.mkdtemp(prefix="mutant-"))
    infile, keyfile, script = tmp / "in.json", tmp / "keys.json", tmp / "key.js"
    infile.write_text(json.dumps(rows), encoding="utf-8")
    script.write_text(KEY_JS % {"armodel": q(WEB / "armodel.js"),
                                "infile": q(infile), "outfile": q(keyfile)},
                      encoding="utf-8")
    if subprocess.run(["node", str(script)], capture_output=True, text=True).returncode != 0:
        raise SystemExit("keying failed")
    keys = json.loads(keyfile.read_text(encoding="utf-8"))

    # keyed by the engine's own structure id, the same as the Tox21 table, so
    # a browser lookup needs no crypto and the two tables agree
    # wild-type scores come from the binding scene that is already built
    scene_path = WEB / "assets" / "pocket_scene.json"
    wild = {}
    if scene_path.exists():
        scene = json.loads(scene_path.read_text(encoding="utf-8"))
        for k, p in scene["poses"].items():
            wild[k] = p.get("aff")

    # Checkpoint as we go. This run takes the better part of an hour and a
    # container restart kills it silently; without this the work is simply
    # lost, which is what happened the first time.
    ckpt = args.out.parent / "_mutant_progress.json"
    shifts = {}
    if ckpt.exists():
        try:
            shifts = json.loads(ckpt.read_text(encoding="utf-8"))
            have = sum(1 for v in shifts.values()
                       for _, lb, _, _ in MUTANTS if lb in v)
            print("resuming: %d compounds, %d dockings already done"
                  % (len(shifts), have))
        except Exception:
            shifts = {}
    total = len(rows) * len(MUTANTS)
    done, started = 0, time.time()
    for workdir, label, pdb, mutation in MUTANTS:
        box = json.loads((HERE / workdir / "box.json").read_text(encoding="utf-8"))
        receptor = HERE / workdir / "receptor.pdb"
        print("\n=== %s (%s, %s) ===" % (label, pdb, mutation))
        for row in rows:
            key = keys.get(row["smiles"])
            done += 1
            if not key:
                continue
            entry = shifts.setdefault(key, {"n": row["name"]})
            if label in entry:
                continue
            try:
                ar_dock.ligand_to_sdf(row["smiles"], row["name"], tmp / "lig.sdf")
                scores = ar_dock.run_smina(receptor, tmp / "lig.sdf",
                                           tmp / "out.sdf", box, args.smina)
                entry[label] = round(scores[0], 2)
            except Exception:
                entry[label] = None
            if done % 25 == 0:
                rate = (time.time() - started) / max(1, done)
                print("  %d/%d  (%.1fs each, ~%.0f min left)"
                      % (done, total, rate, rate * (total - done) / 60), flush=True)
                ckpt.write_text(json.dumps(shifts), encoding="utf-8")

    payload = {
        "wild_type": {"pdb": WILD_TYPE[1], "note": "intact AR LBD"},
        "mutants": [{"key": label, "pdb": pdb, "mutation": mutation}
                    for _, label, pdb, mutation in MUTANTS],
        "shifts": {},
    }
    for key, entry in shifts.items():
        wt = wild.get(key)
        rec = {"n": entry["n"]}
        if wt is not None:
            rec["wt"] = wt
        for _, label, _, _ in MUTANTS:
            if entry.get(label) is not None:
                rec[label] = entry[label]
                if wt is not None:
                    rec["d_" + label] = round(entry[label] - wt, 2)
        payload["shifts"][key] = rec

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    withboth = sum(1 for r in payload["shifts"].values()
                   if "d_t877a" in r and "d_w741l" in r)
    print("\ncompounds           %d" % len(payload["shifts"]))
    print("with both shifts    %d" % withboth)
    print("wrote %s (%.0f KB)" % (args.out, args.out.stat().st_size / 1024))
    ckpt.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
