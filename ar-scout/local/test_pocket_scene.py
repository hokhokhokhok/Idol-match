#!/usr/bin/env python3
"""Validate the pre-computed binding scene the web app ships.

Everything in pocket_scene.json is presented to the user as real structural
data, so it is worth checking that it still is: coordinates finite and near
the crystallographic site, residue names matching the receptor it came from,
contact lists agreeing with the coordinates they were derived from, and
unplaced poses carrying no coordinates at all.

    python3 test_pocket_scene.py
"""

import json
import math
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parent / "web"
sys.path.insert(0, str(HERE))
import ar_dock  # noqa: E402

SCENE = WEB / "assets" / "pocket_scene.json"
DOCK = HERE / "dock"

PASS = FAIL = 0


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok    {name:<44} {detail}")
    else:
        FAIL += 1
        print(f"  FAIL  {name:<44} {detail}")


def dist(a, b):
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))


def main() -> int:
    if not SCENE.exists():
        print("  skipped: no pocket_scene.json (run build_pocket_scene.py)")
        return 0
    scene = json.loads(SCENE.read_text(encoding="utf-8"))

    # --- shape ------------------------------------------------------------
    check("declares its source structure", scene.get("pdb") == "2AM9", scene.get("pdb"))
    check("pocket present", len(scene.get("pocket", [])) > 15,
          f"{len(scene.get('pocket', []))} residues")
    check("co-crystal ligand present", len(scene.get("crystal", {}).get("a", [])) == 21,
          f"{len(scene.get('crystal', {}).get('a', []))} heavy atoms (DHT)")
    check("poses present", len(scene.get("poses", {})) > 50,
          f"{len(scene['poses'])} compounds")

    # --- coordinates ------------------------------------------------------
    bad = 0
    allpts = []
    for res in scene["pocket"]:
        for a in res["a"]:
            if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in a[:3]):
                bad += 1
            allpts.append(a[:3])
    check("pocket coordinates finite", bad == 0, f"{len(allpts)} atoms")

    cry = [a[:3] for a in scene["crystal"]["a"]]
    centre = [sum(p[i] for p in cry) / len(cry) for i in range(3)]
    far = max(dist(p, centre) for p in allpts)
    check("pocket surrounds the ligand", far < 22.0, f"furthest atom {far:.1f} A")

    # --- cross-check against the receptor it was cut from -----------------
    if (DOCK / "receptor.pdb").exists():
        receptor = list(ar_dock.parse_pdb_atoms((DOCK / "receptor.pdb").read_text()))
        real = {}
        for a in receptor:
            real.setdefault(a["resname"].upper() + a["resseq"], 0)
            real[a["resname"].upper() + a["resseq"]] += 1
        missing = [r["id"] for r in scene["pocket"] if r["id"] not in real]
        check("every pocket residue exists in 2AM9", not missing,
              "; ".join(missing[:4]) or "all matched")

        anchors = set()
        for group in ar_dock.ANCHORS.values():
            anchors |= group
        present = {r["id"] for r in scene["pocket"]}
        check("anchor residues are in the scene", anchors <= present,
              ", ".join(sorted(anchors - present)) or "all 7 present")
    else:
        print("  note: dock/receptor.pdb absent, skipping receptor cross-check")

    # --- poses ------------------------------------------------------------
    placed = [p for p in scene["poses"].values() if p.get("placed")]
    unplaced = [p for p in scene["poses"].values() if not p.get("placed")]
    check("most compounds placed", len(placed) > len(unplaced),
          f"{len(placed)} placed, {len(unplaced)} not")

    leak = [p["n"] for p in unplaced if p.get("a")]
    check("unplaced poses carry no coordinates", not leak,
          "; ".join(leak[:4]) or "none leak a clashing pose")

    off = []
    for p in placed:
        pc = [sum(a[i] for a in p["a"]) / len(p["a"]) for i in range(3)]
        if dist(pc, centre) > 12.0:
            off.append(f"{p['n']} {dist(pc, centre):.1f}A")
    check("placed poses sit in the site", not off, "; ".join(off[:4]) or "all within 12 A")

    nan = [p["n"] for p in placed
           if not all(math.isfinite(v) for a in p["a"] for v in a[:3])]
    check("pose coordinates finite", not nan, "; ".join(nan[:4]) or "clean")

    # affinities must be negative for anything we claim was placed
    pos = [f"{p['n']} {p['aff']}" for p in placed if p["aff"] >= 0]
    check("placed poses have negative affinity", not pos, "; ".join(pos[:4]) or "all < 0")

    # --- contacts agree with the coordinates ------------------------------
    if (DOCK / "receptor.pdb").exists():
        sample = sorted(placed, key=lambda p: p["aff"])[:5]
        mismatches = []
        for p in sample:
            atoms = [{"element": a[3], "x": a[0], "y": a[1], "z": a[2]} for a in p["a"]]
            fresh = ar_dock.analyse_contacts(receptor, atoms)
            got = {r["residue"] for r in fresh["residues"]}
            stored = set(p.get("c", []))
            if got != stored:
                mismatches.append(f"{p['n']}: stored {len(stored)}, recomputed {len(got)}")
        check("stored contacts match the stored pose", not mismatches,
              "; ".join(mismatches[:3]) or f"{len(sample)} strongest poses re-verified")

    # --- the reference androgens should all be in there -------------------
    names = {p["n"] for p in scene["poses"].values()}
    want = {"Dihydrotestosterone", "Testosterone", "Bicalutamide", "Enzalutamide"}
    check("key reference compounds included", want <= names,
          ", ".join(sorted(want - names)) or "all present")

    size = SCENE.stat().st_size / 1024
    check("payload stays small", size < 900, f"{size:.0f} KB")

    print(f"\n  pocket scene: {PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
