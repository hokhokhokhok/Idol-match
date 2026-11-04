#!/usr/bin/env python3
"""Offline checks for ar_dock.py's PDB handling, box maths and contact logic.

Needs no network, no RDKit and no smina: it builds a synthetic PDB with the
same record layout as an RCSB entry and runs the parsing path over it.

    python3 test_ar_dock.py
"""

import json
import pathlib
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ar_dock  # noqa: E402


def atom(record, serial, name, resname, chain, resseq, x, y, z, element):
    """One fixed-width PDB record, columns as the format specifies."""
    return (
        f"{record:<6}{serial:>5} {name:^4}{'':1}{resname:>3} {chain:1}{resseq:>4}"
        f"{'':4}{x:>8.3f}{y:>8.3f}{z:>8.3f}{1.00:>6.2f}{20.00:>6.2f}"
        f"{'':10}{element:>2}"
    )


def build_pdb() -> str:
    lines = ["HEADER    SYNTHETIC TEST ENTRY", "MODEL        1"]
    serial = 1

    # Pocket residues ringing the origin. Distances are chosen so the ligand
    # below lands inside the 4.5 A contact cutoff for some and outside for
    # others.
    pocket = [
        ("GLN711", "NE2", 3.0, 0.0, 0.0, "N"),     # 3.0 A -> contact + H-bond
        ("ARG752", "NH1", 0.0, 3.2, 0.0, "N"),     # 3.2 A -> contact + H-bond
        ("ASN705", "ND2", 0.0, 0.0, 3.4, "N"),     # 3.4 A -> contact + H-bond
        ("THR877", "OG1", -4.0, 0.0, 0.0, "O"),    # 4.0 A -> contact, no H-bond
        ("MET895", "SD", 0.0, -4.2, 0.0, "S"),     # 4.2 A -> contact
        ("ILE899", "CD1", 0.0, 0.0, -4.4, "C"),    # 4.4 A -> contact, carbon
        ("LEU880", "CD2", 9.0, 0.0, 0.0, "C"),     # 9.0 A -> no contact
        ("PHE764", "CZ", 12.0, 12.0, 12.0, "C"),   # far away
    ]
    for i, (res, name, x, y, z, el) in enumerate(pocket):
        lines.append(atom("ATOM", serial, name, res[:3], "A", res[3:], x, y, z, el))
        serial += 1

    # Co-crystal ligand: a 6 A cube of carbons centred on the origin.
    for i, (x, y, z) in enumerate([
        (-3, -3, -3), (3, -3, -3), (-3, 3, -3), (3, 3, -3),
        (-3, -3, 3), (3, -3, 3), (-3, 3, 3), (3, 3, 3),
    ]):
        lines.append(atom("HETATM", serial, "C%d" % i, "DHT", "A", "1001",
                          x, y, z, "C"))
        serial += 1

    # Solvent and additives that must be stripped.
    for res, el in (("HOH", "O"), ("SO4", "S"), ("GOL", "C"), ("EDO", "C"),
                    ("ZN", "ZN")):
        lines.append(atom("HETATM", serial, el, res, "A", "2001",
                          20.0, 20.0, 20.0, el))
        serial += 1

    lines.append("ENDMDL")
    # A second NMR-style model: everything past ENDMDL must be ignored.
    lines.append("MODEL        2")
    for i in range(40):
        lines.append(atom("ATOM", serial, "CA", "GLY", "A", str(500 + i),
                          99.0, 99.0, 99.0, "C"))
        serial += 1
    lines.append("ENDMDL")
    lines.append("END")
    return "\n".join(lines) + "\n"


def main() -> int:
    passed = failed = 0

    def check(name, cond, detail=""):
        nonlocal passed, failed
        if cond:
            passed += 1
            print(f"  ok    {name:<38} {detail}")
        else:
            failed += 1
            print(f"  FAIL  {name:<38} {detail}")

    work = pathlib.Path(tempfile.mkdtemp(prefix="ardock-test-"))
    (work / "TEST.pdb").write_text(build_pdb(), encoding="utf-8")

    box = ar_dock.prepare("TEST", work)

    # --- ENDMDL truncation -------------------------------------------------
    atoms = list(ar_dock.parse_pdb_atoms((work / "TEST.pdb").read_text()))
    check("stops at first ENDMDL", len(atoms) == 21,
          f"{len(atoms)} atoms (8 protein + 8 ligand + 5 junk)")

    # --- solvent stripping and ligand detection ----------------------------
    receptor = (work / "receptor.pdb").read_text()
    ligand_ref = (work / "ligand_ref.pdb").read_text()
    check("receptor keeps only ATOM", receptor.count("ATOM  ") == 8,
          f"{receptor.count('ATOM  ')} protein atoms")
    for junk in ("HOH", "SO4", "GOL", "EDO"):
        check(f"strips {junk}", junk not in receptor and junk not in ligand_ref)
    check("picks the largest heteroresidue", ligand_ref.count("DHT") == 8,
          "8 DHT atoms")

    # --- box from the ligand, not guessed ----------------------------------
    # cube spans -3..3 on every axis: centre 0, size 6 + 2*5 = 16 (> 14 min)
    check("box centred on the ligand",
          all(abs(box["center_" + a]) < 1e-6 for a in "xyz"),
          f"({box['center_x']}, {box['center_y']}, {box['center_z']})")
    check("box = span + 2x padding",
          all(abs(box["size_" + a] - 16.0) < 1e-6 for a in "xyz"),
          f"{box['size_x']} A")

    # a ligand smaller than the minimum must be floored, not shrunk
    tiny = ar_dock.box_from_atoms([
        {"x": 0.0, "y": 0.0, "z": 0.0}, {"x": 1.0, "y": 1.0, "z": 1.0},
    ])
    check("box floored at the minimum", abs(tiny["size_x"] - ar_dock.BOX_MIN) < 1e-6,
          f"{tiny['size_x']} A")

    check("box.json written", (work / "box.json").exists(),
          json.dumps({k: box[k] for k in ("center_x", "size_x")}))

    # --- contacts ----------------------------------------------------------
    receptor_atoms = list(ar_dock.parse_pdb_atoms(receptor))
    pose = [{"element": "O", "x": 0.0, "y": 0.0, "z": 0.0}]
    analysis = ar_dock.analyse_contacts(receptor_atoms, pose)
    contacted = {r["residue"] for r in analysis["residues"]}

    check("contacts within 4.5 A",
          contacted == {"GLN711", "ARG752", "ASN705", "THR877", "MET895", "ILE899"},
          ", ".join(sorted(contacted)))
    check("LEU880 at 9 A excluded", "LEU880" not in contacted)

    hb = {h["residue"] for h in analysis["hbonds"]}
    check("H-bonds need <=3.5 A and N/O/S both ends",
          hb == {"GLN711", "ARG752", "ASN705"}, ", ".join(sorted(hb)))
    check("carbon contact is not an H-bond", "ILE899" not in hb)
    check("THR877 at 4.0 A contacts but does not H-bond",
          "THR877" in contacted and "THR877" not in hb)

    check("anchors use the web app's residues",
          analysis["anchors"]["A-ring"] == ["ARG752", "GLN711"] and
          analysis["anchors"]["D-ring"] == ["ASN705", "THR877"],
          "A-ring + D-ring both hit")

    # --- interpretation ----------------------------------------------------
    strong = ar_dock.interpret(analysis, -11.2)
    check("both anchors -> typical binding mode",
          "전형적 AR 리간드 결합 양상" in strong, strong)
    check("helix-12 contact flags antagonism", "AF-2 교란 가능" in strong)
    check("weak affinity flagged",
          "위양성 의심" in ar_dock.interpret(analysis, -5.1))
    check("strong affinity not flagged", "위양성 의심" not in strong)

    # Met895 lines the pocket in the agonist form, so on its own it must not
    # read as helix-12 displacement; Ile899 must.
    wall = {"anchors": {"A-ring": ["GLN711"], "D-ring": ["ASN705"],
                        "helix-12": ["MET895", "LEU880"]}}
    check("Met895/Leu880 alone is not displacement",
          "AF-2" not in ar_dock.interpret(wall, -9.0))
    tip = {"anchors": {"A-ring": ["GLN711"], "D-ring": ["ASN705"],
                       "helix-12": ["MET895", "ILE899"]}}
    check("Ile899 is displacement", "AF-2" in ar_dock.interpret(tip, -9.0))

    # a clashing pose must be called out, not dressed up with anchors
    clash = ar_dock.interpret(analysis, 9.2)
    check("positive affinity reported as a failure to place",
          "배치 실패" in clash, clash[:46])
    check("clashing pose does not claim a binding mode",
          "전형적 AR 리간드 결합 양상" not in clash)

    empty = {"anchors": {"A-ring": [], "D-ring": [], "helix-12": []}}
    check("no anchors -> hydrophobic only",
          "소수성 접촉만" in ar_dock.interpret(empty, -9.0))
    one = {"anchors": {"A-ring": ["GLN711"], "D-ring": [], "helix-12": []}}
    check("one anchor -> unstable orientation",
          "배향 불안정 가능" in ar_dock.interpret(one, -9.0))

    # --- SDF reader --------------------------------------------------------
    sdf = work / "pose.sdf"
    sdf.write_text(
        "probe\n  test\n\n"
        "  3  0  0  0  0  0  0  0  0  0999 V2000\n"
        "    1.0000    2.0000    3.0000 C   0  0\n"
        "    4.0000    5.0000    6.0000 O   0  0\n"
        "    7.0000    8.0000    9.0000 H   0  0\n"
        "M  END\n$$$$\n", encoding="utf-8")
    heavy = ar_dock.read_sdf_heavy_atoms(sdf)
    check("SDF reader drops hydrogens", len(heavy) == 2, f"{len(heavy)} heavy atoms")
    check("SDF coordinates parsed",
          heavy[0]["element"] == "C" and abs(heavy[0]["x"] - 1.0) < 1e-9 and
          heavy[1]["element"] == "O" and abs(heavy[1]["z"] - 6.0) < 1e-9)

    # --- smina score parsing ------------------------------------------------
    sample = (
        "mode |   affinity | dist from best mode\n"
        "     | (kcal/mol) | rmsd l.b.| rmsd u.b.\n"
        "-----+------------+----------+----------\n"
        "1       -11.5      0.000      0.000\n"
        "2       -10.2      1.934      3.011\n"
        "3        -9.8      2.104      3.552\n"
    )
    scores = [float(m.group(2)) for m in ar_dock.SCORE_RE.finditer(sample)]
    check("smina scores parsed", scores == [-11.5, -10.2, -9.8], str(scores))

    print(f"\n  ar_dock: {passed} passed, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
