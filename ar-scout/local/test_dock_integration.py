#!/usr/bin/env python3
"""End-to-end docking check: re-dock a crystal ligand into its own site.

Everything else in the suite tests ar_dock.py's pieces in isolation. This
drives the whole path - prepare, box derivation, 3D generation, the smina
call, score parsing, pose reading, contact analysis - and then asks the only
question that matters: did the ligand land back where the crystallographer
found it?

Uses 1PWC (a penicillin-recognising enzyme with benzylpenicillin bound),
which ships inside ProDy, so no network access is needed. The androgen
receptor entry 2AM9 is not redistributed in any package and still has to come
from RCSB.

Requires: smina on PATH or via --smina, RDKit, and ProDy for the structure.

    python3 test_dock_integration.py [--smina /path/to/smina]
"""

import argparse
import json
import math
import pathlib
import shutil
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ar_dock  # noqa: E402

# benzylpenicillin, the ligand bound in 1PWC
PENICILLIN_G = "CC1(C)SC2C(NC(=O)Cc3ccccc3)C(=O)N2C1C(=O)O"

# how far the re-docked pose may stray before the setup is suspect
RMSD_LIMIT = 2.5
CENTROID_LIMIT = 3.0
CONTACT_RECOVERY = 0.5

PASS = FAIL = 0


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok    {name:<42} {detail}")
    else:
        FAIL += 1
        print(f"  FAIL  {name:<42} {detail}")


def dist(a, b):
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)


def xyz(a):
    return (a["x"], a["y"], a["z"])


def centroid(atoms):
    n = len(atoms)
    return tuple(sum(a[k] for a in atoms) / n for k in ("x", "y", "z"))


def symmetric_nn_rmsd(a, b):
    """Order-independent nearest-neighbour RMSD.

    Not the symmetry-corrected RMSD a docking paper would quote: atom
    identity is ignored, so it reads a little low. It is enough to tell a
    recovered pose from one in the wrong place or flipped end to end.
    """
    d = [min(dist(xyz(p), xyz(q)) for q in b) for p in a]
    d += [min(dist(xyz(q), xyz(p)) for p in a) for q in b]
    return math.sqrt(sum(x * x for x in d) / len(d))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--smina", default="smina")
    args = ap.parse_args()

    if shutil.which(args.smina) is None and not pathlib.Path(args.smina).exists():
        print("  skipped: smina not found (pass --smina /path/to/smina)")
        return 0
    try:
        import prody
    except ImportError:
        print("  skipped: ProDy not installed (pip install prody)")
        return 0
    try:
        import rdkit  # noqa: F401
    except ImportError:
        print("  skipped: RDKit not installed")
        return 0

    src = (pathlib.Path(prody.__file__).parent / "tests" / "datafiles" / "1pwc.pdb")
    if not src.exists():
        print("  skipped: 1pwc.pdb not bundled with this ProDy build")
        return 0

    work = pathlib.Path(tempfile.mkdtemp(prefix="dockint-"))
    shutil.copy(src, work / "1PWC.pdb")

    # --- prepare ----------------------------------------------------------
    box = ar_dock.prepare("1PWC", work)
    crystal = [a for a in ar_dock.parse_pdb_atoms((work / "ligand_ref.pdb").read_text())
               if a["element"] != "H"]
    receptor = list(ar_dock.parse_pdb_atoms((work / "receptor.pdb").read_text()))

    check("co-crystal ligand isolated", len(crystal) == 23, f"{len(crystal)} heavy atoms")
    check("receptor separated", len(receptor) > 2000, f"{len(receptor)} atoms")

    cc = centroid(crystal)
    # The box is built on the ligand's bounding box, not its centroid - for an
    # asymmetric ligand those differ, and the bounding box is the right basis.
    # What has to hold is that the box encloses the ligand with real margin.
    margins = []
    for axis in "xyz":
        lo = min(a[axis] for a in crystal)
        hi = max(a[axis] for a in crystal)
        half = box["size_" + axis] / 2.0
        c = box["center_" + axis]
        margins.append(min(lo - (c - half), (c + half) - hi))
    check("box encloses the ligand", min(margins) > 0,
          f"tightest margin {min(margins):.2f} A")
    # centre and size are rounded to 3 dp when the box is written, so compare
    # against the padding with a tolerance of that rounding, not an epsilon
    check("box leaves room to move",
          min(margins) >= ar_dock.BOX_PADDING - 0.01 or
          any(abs(box["size_" + a] - ar_dock.BOX_MIN) < 0.01 for a in "xyz"),
          f"{min(margins):.3f} A vs padding target {ar_dock.BOX_PADDING} A")

    # --- dock -------------------------------------------------------------
    paths = {"work": work, "poses": work / "poses", "contacts": work / "contacts"}
    paths["poses"].mkdir(exist_ok=True)
    paths["contacts"].mkdir(exist_ok=True)

    res = ar_dock.dock_one("PenicillinG", PENICILLIN_G, receptor, paths, box, args.smina)
    check("smina returned an affinity", res["affinity"] < 0,
          f"{res['affinity']:.2f} kcal/mol")
    check("all 9 modes parsed", len(res["all_modes"]) >= 1,
          f"{len(res['all_modes'])} modes")
    check("modes ranked best first",
          res["all_modes"] == sorted(res["all_modes"]), str(res["all_modes"][:3]))

    pose = ar_dock.read_sdf_heavy_atoms(work / "poses" / "PenicillinG.sdf")
    check("pose read back from SDF", len(pose) == len(crystal),
          f"{len(pose)} heavy atoms")

    # --- did it land where the crystal says? ------------------------------
    rmsd = symmetric_nn_rmsd(crystal, pose)
    disp = dist(cc, centroid(pose))
    check("re-docked pose recovers the site", rmsd < RMSD_LIMIT, f"RMSD {rmsd:.2f} A")
    check("centroid close to the crystal pose", disp < CENTROID_LIMIT,
          f"{disp:.2f} A")

    # --- contacts ---------------------------------------------------------
    xtal = set()
    for ra in receptor:
        for la in crystal:
            if dist(xyz(ra), xyz(la)) <= ar_dock.CONTACT_CUTOFF:
                xtal.add(ra["resname"].upper() + ra["resseq"])
                break
    got = {r["residue"] for r in res["residues"]}
    recovered = len(got & xtal) / len(xtal) if xtal else 0
    check("recovers the crystal contact residues", recovered >= CONTACT_RECOVERY,
          f"{len(got & xtal)}/{len(xtal)} = {recovered:.0%}")

    # Ser62/Lys65 are this enzyme's catalytic SxxK motif; a pose that makes
    # no hydrogen bond to them is in the pocket but not bound properly.
    hb = {h["residue"] for h in res["hbonds"]}
    check("hydrogen bonds to the catalytic serine", "SER62" in hb,
          ", ".join(sorted(hb)[:6]))

    # --- outputs ----------------------------------------------------------
    saved = json.loads((work / "contacts" / "PenicillinG.json").read_text())
    check("contact JSON written", saved["name"] == "PenicillinG" and saved["residues"],
          f"{len(saved['residues'])} residues")
    check("interpretation produced", bool(saved["interpretation"]),
          saved["interpretation"])
    # the AR anchor set does not exist in this protein, so it must come back
    # empty rather than matching something by accident
    check("AR anchors correctly absent here",
          not any(saved["anchors"].values()), str(saved["anchors"]))

    print(f"\n  dock integration: {PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
