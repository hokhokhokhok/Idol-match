#!/usr/bin/env python3
"""Pre-compute the 3D binding scene the web app displays.

The browser cannot dock. What it can do is show a real pocket and a real
pose, provided both are computed here first and shipped with the bundle.
So this docks every compound the web app knows about into 2AM9 with smina
and writes one compact JSON holding:

  * the crystallographic pocket - every residue with an atom within a cutoff
    of the co-crystal ligand, as real coordinates from the PDB entry;
  * the co-crystal ligand itself (DHT), which is the reference for what a
    bound androgen actually looks like in this site;
  * the best docked pose for each compound, keyed by structure rather than
    by SMILES string so the app finds it however the user typed the molecule.

Poses that smina could not place are recorded with placed=false and no
coordinates: a clashing pose drawn in the pocket would look like a result.

    python3 build_pocket_scene.py --smina /path/to/smina
"""

import argparse
import json
import math
import pathlib
import subprocess
import sys
import tempfile
import time

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parent / "web"

sys.path.insert(0, str(HERE))
import ar_dock  # noqa: E402

POCKET_CUTOFF = 8.0      # angstrom from any co-crystal ligand atom
COORD_DP = 2

LIST_JS = r"""
const PR = require(%(predict)s);
const seen = {};
const rows = [];
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
    const d = AR.computeDescriptors(m);
    const fp = AR.morganFingerprint(m, 2);
    let bits = '';
    for (let i = 0; i < fp.length; i++) if (fp[i]) bits += i + ',';
    out[r.smiles] = d.formula + '|' + bits;
  } catch (err) { out[r.smiles] = null; }
}
fs.writeFileSync(%(outfile)s, JSON.stringify(out));
"""


def q(p):
    return json.dumps(str(p))


def structure_keys(rows, tmp):
    infile, outfile = tmp / "in.json", tmp / "keys.json"
    script = tmp / "key.js"
    infile.write_text(json.dumps(rows), encoding="utf-8")
    script.write_text(KEY_JS % {
        "armodel": q(WEB / "armodel.js"), "infile": q(infile), "outfile": q(outfile)
    }, encoding="utf-8")
    proc = subprocess.run(["node", str(script)], capture_output=True, text=True)
    if proc.returncode != 0:
        raise SystemExit("keying failed:\n" + proc.stderr)
    return json.loads(outfile.read_text(encoding="utf-8"))


def dist(a, b):
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)


def build_pocket(receptor_atoms, ligand_atoms):
    """Residues lining the site, with their real coordinates."""
    keep = {}
    for ra in receptor_atoms:
        if ra["element"] == "H":
            continue
        key = (ra["resname"].upper(), ra["resseq"])
        if key in keep:
            keep[key].append(ra)
            continue
        for la in ligand_atoms:
            if dist((ra["x"], ra["y"], ra["z"]), (la["x"], la["y"], la["z"])) <= POCKET_CUTOFF:
                keep[key] = [ra]
                break

    residues = []
    for (resname, resseq), atoms in sorted(keep.items(), key=lambda kv: int(kv[0][1])):
        residues.append({
            "id": resname + resseq,
            "a": [[round(a["x"], COORD_DP), round(a["y"], COORD_DP),
                   round(a["z"], COORD_DP), a["element"]] for a in atoms],
            "b": bonds_within(atoms),
        })
    return residues


def bonds_within(atoms, cutoff=1.95):
    """Connectivity by distance; good enough for drawing residue sticks."""
    out = []
    for i in range(len(atoms)):
        for j in range(i + 1, len(atoms)):
            d = dist((atoms[i]["x"], atoms[i]["y"], atoms[i]["z"]),
                     (atoms[j]["x"], atoms[j]["y"], atoms[j]["z"]))
            if d <= cutoff:
                out.append([i, j])
    return out


def ligand_bonds(atoms, cutoff=1.95):
    pts = [(a[0], a[1], a[2]) for a in atoms]
    out = []
    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            if dist(pts[i], pts[j]) <= cutoff:
                out.append([i, j])
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--smina", default="smina")
    ap.add_argument("--workdir", type=pathlib.Path, default=HERE / "dock")
    ap.add_argument("--out", type=pathlib.Path, default=WEB / "assets" / "pocket_scene.json")
    ap.add_argument("--limit", type=int, default=0, help="dock only the first N (for testing)")
    args = ap.parse_args()

    work = args.workdir
    if not (work / "receptor.pdb").exists():
        raise SystemExit("run: python3 ar_dock.py --prepare --workdir %s" % work)
    box = json.loads((work / "box.json").read_text(encoding="utf-8"))
    receptor = list(ar_dock.parse_pdb_atoms((work / "receptor.pdb").read_text()))
    crystal = [a for a in ar_dock.parse_pdb_atoms((work / "ligand_ref.pdb").read_text())
               if a["element"] != "H"]

    listing = subprocess.run(["node", "-e", LIST_JS % {"predict": q(WEB / "predict.js")}],
                             capture_output=True, text=True)
    if listing.returncode != 0:
        raise SystemExit("could not read the compound list:\n" + listing.stderr)
    rows = json.loads(listing.stdout)
    if args.limit:
        rows = rows[:args.limit]
    print("compounds to dock: %d" % len(rows))

    tmp = pathlib.Path(tempfile.mkdtemp(prefix="scene-"))
    keys = structure_keys(rows, tmp)

    poses, failed, unplaced = {}, [], 0
    started = time.time()
    for i, row in enumerate(rows, 1):
        key = keys.get(row["smiles"])
        if not key:
            failed.append(row["name"])
            continue
        if key in poses:
            continue
        try:
            ar_dock.ligand_to_sdf(row["smiles"], row["name"], tmp / "lig.sdf")
            scores = ar_dock.run_smina(work / "receptor.pdb", tmp / "lig.sdf",
                                       tmp / "out.sdf", box, args.smina)
            best = scores[0]
            atoms = ar_dock.read_sdf_heavy_atoms(tmp / "out.sdf")
        except Exception as exc:
            failed.append("%s (%s)" % (row["name"], exc))
            continue

        entry = {"n": row["name"], "aff": round(best, 2)}
        if best >= ar_dock.UNPLACEABLE or not atoms:
            # a clashing pose is not a result; keep the score, drop the coordinates
            entry["placed"] = False
            unplaced += 1
        else:
            analysis = ar_dock.analyse_contacts(receptor, atoms)
            entry["placed"] = True
            entry["a"] = [[round(a["x"], COORD_DP), round(a["y"], COORD_DP),
                           round(a["z"], COORD_DP), a["element"]] for a in atoms]
            entry["b"] = ligand_bonds(entry["a"])
            entry["c"] = sorted({r["residue"] for r in analysis["residues"]})
            entry["hb"] = sorted({h["residue"] for h in analysis["hbonds"]})
        poses[key] = entry

        if i % 10 == 0 or i == len(rows):
            rate = (time.time() - started) / i
            print("  %3d/%d  %-28s %7s  (%.1fs each, ~%.0fs left)"
                  % (i, len(rows), row["name"][:28],
                     entry.get("aff", "-"), rate, rate * (len(rows) - i)))

    crystal_atoms = [[round(a["x"], COORD_DP), round(a["y"], COORD_DP),
                      round(a["z"], COORD_DP), a["element"]] for a in crystal]
    scene = {
        "pdb": "2AM9",
        "note": "AR LBD + DHT, 1.64 A, agonist conformation",
        "pocket": build_pocket(receptor, crystal),
        "crystal": {"n": "DHT (co-crystal)", "a": crystal_atoms,
                    "b": ligand_bonds(crystal_atoms)},
        "poses": poses,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(scene, separators=(",", ":")), encoding="utf-8")

    print("\npocket residues   %d" % len(scene["pocket"]))
    print("docked poses      %d (%d could not be placed)" % (len(poses), unplaced))
    if failed:
        print("failed            %d: %s" % (len(failed), "; ".join(failed[:6])))
    print("wrote %s (%.0f KB)" % (args.out, args.out.stat().st_size / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
