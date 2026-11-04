#!/usr/bin/env python3
"""Dock ligands into the androgen receptor LBD with smina and report contacts.

This is the third stage of the workflow: the web app ranks, train_qsar.py
widens the reference set, and this script checks whether a shortlisted
structure can physically make the contacts the 2D rules only inferred.

Usage
-----
    python3 ar_dock.py --prepare                    # fetch and split 2AM9
    python3 ar_dock.py --prepare --pdb 2OZ7         # antagonist-form receptor
    python3 ar_dock.py --smiles "CC12CCC3..." --name DHT
    python3 ar_dock.py --csv shortlist.csv          # name,smiles columns

Outputs land in --workdir (default ./dock):
    receptor.pdb  protein only
    ligand_ref.pdb  the co-crystal ligand, which defines the box
    box.json      docking box derived from that ligand
    poses/*.sdf   docked poses
    contacts/*.json  per-residue contact analysis
    results.csv   one row per ligand, sorted by affinity, Excel-safe
"""

import argparse
import csv
import json
import math
import pathlib
import re
import shutil
import subprocess
import sys
import urllib.request

RCSB = "https://files.rcsb.org/download/%s.pdb"
DEFAULT_PDB = "2AM9"  # AR LBD + DHT, 1.64 A, agonist conformation

# Crystallisation additives and solvent, not part of the binding site.
JUNK_HET = {
    "HOH", "DOD", "WAT", "SO4", "PO4", "GOL", "EDO", "PEG", "PG4", "MPD",
    "ACT", "CL", "NA", "K", "MG", "CA", "ZN", "MN", "FE", "NI", "CD", "IOD",
    "BR", "TRS", "EPE", "DMS", "FMT", "NO3", "CIT", "MES",
}

CONTACT_CUTOFF = 4.5
HBOND_CUTOFF = 3.5
HBOND_ELEMENTS = {"N", "O", "S"}
BOX_PADDING = 5.0
BOX_MIN = 14.0

# Same residue scheme as the web app, so the two outputs can be compared
# line by line rather than eyeballed.
ANCHORS = {
    "A-ring": {"GLN711", "ARG752"},
    "D-ring": {"ASN705", "THR877"},
    "helix-12": {"MET895", "ILE899", "LEU880"},
}

# Contacting helix-12 is not by itself evidence of AF-2 disruption. In the
# agonist conformation (2AM9) Met895 lines the pocket wall, so almost any
# ligand that binds at all touches it - measured over a 22-ligand panel it
# was hit by 19, including niacinamide and panthenol. Leu880 was hit by 12,
# agonists among them. Ile899 sits further out along helix-12 and was
# reached only by ligands that extend toward the AF-2 surface: 5 of 22, and
# all 5 were antagonists. Only that subset is treated as a displacement
# signal; the full set above is still reported as contacts.
#
# This was calibrated on 2AM9 and does NOT transfer: re-run on 2OZ7 (the
# T877A mutant) the same rule flagged metribolone and methyltestosterone,
# both agonists. Treat the antagonism call as meaningful only in the
# wild-type agonist structure, and as a hint to check the pose elsewhere.
H12_DISPLACEMENT = {"ILE899"}

# At or above this score the pose is a clash, not a weak pose: the ligand
# could not be placed in the pocket at all, and its contacts mean nothing.
UNPLACEABLE = 0.0


# ------------------------------------------------------------ PDB handling

def parse_pdb_atoms(text: str):
    """Yield parsed ATOM/HETATM records, stopping at the first ENDMDL.

    NMR entries hold many models stacked in one file; taking them all would
    multiply every atom and wreck both the box and the contact distances.
    """
    for line in text.splitlines():
        if line.startswith("ENDMDL"):
            break
        if not line.startswith(("ATOM  ", "HETATM")):
            continue
        try:
            yield {
                "record": line[:6].strip(),
                "name": line[12:16].strip(),
                "altloc": line[16].strip(),
                "resname": line[17:20].strip(),
                "chain": line[21].strip(),
                "resseq": line[22:26].strip(),
                "x": float(line[30:38]),
                "y": float(line[38:46]),
                "z": float(line[46:54]),
                "element": (line[76:78].strip() or line[12:16].strip()[:1]).upper(),
                "raw": line,
            }
        except (ValueError, IndexError):
            continue


def check_anchor_residues(protein: list) -> list:
    """Warn when the structure does not carry the anchor residues by name.

    Most AR LBD entries that come with a non-steroidal ligand are point
    mutants - 2OZ7 is T877A, 1Z95 is W741L - and the anchor sets here match
    on residue name plus number. A mutated anchor simply never matches, so
    the run quietly loses a hydrogen bond it should have reported.
    """
    seen = {}
    for a in protein:
        seen.setdefault(a["resseq"], a["resname"].upper())
    problems = []
    for label, members in ANCHORS.items():
        for res in sorted(members):
            name, number = res[:3], res[3:]
            actual = seen.get(number)
            if actual is None:
                problems.append("%s (%s): residue %s absent from the structure"
                                % (res, label, number))
            elif actual != name:
                problems.append("%s (%s): structure has %s%s - mutated, so this "
                                "anchor can never match" % (res, label, actual, number))
    return problems


def prepare(pdb_id: str, workdir: pathlib.Path) -> dict:
    workdir.mkdir(parents=True, exist_ok=True)
    raw_path = workdir / ("%s.pdb" % pdb_id.upper())
    if not raw_path.exists():
        url = RCSB % pdb_id.upper()
        print("downloading %s" % url)
        with urllib.request.urlopen(url, timeout=60) as resp:
            raw_path.write_bytes(resp.read())
    text = raw_path.read_text(encoding="utf-8", errors="replace")

    atoms = list(parse_pdb_atoms(text))
    if not atoms:
        raise SystemExit("no atoms parsed from %s" % raw_path)

    protein = [a for a in atoms if a["record"] == "ATOM"]
    het = [a for a in atoms
           if a["record"] == "HETATM" and a["resname"].upper() not in JUNK_HET]

    if not protein:
        raise SystemExit("no protein ATOM records found")

    # the co-crystal ligand: the largest remaining heteroresidue
    groups = {}
    for a in het:
        groups.setdefault((a["chain"], a["resseq"], a["resname"]), []).append(a)
    if not groups:
        raise SystemExit(
            "no co-crystal ligand left after removing solvent and ions; "
            "pass --box-center/--box-size manually"
        )
    key, ligand = max(groups.items(), key=lambda kv: len(kv[1]))
    print("co-crystal ligand: %s %s chain %s, %d atoms"
          % (key[2], key[1], key[0] or "-", len(ligand)))

    (workdir / "receptor.pdb").write_text(
        "\n".join(a["raw"] for a in protein) + "\nEND\n", encoding="utf-8")
    (workdir / "ligand_ref.pdb").write_text(
        "\n".join(a["raw"] for a in ligand) + "\nEND\n", encoding="utf-8")

    box = box_from_atoms(ligand)
    (workdir / "box.json").write_text(json.dumps(box, indent=1), encoding="utf-8")
    print("receptor.pdb: %d atoms" % len(protein))

    for problem in check_anchor_residues(protein):
        print("  WARNING: %s" % problem)
    print("box centre (%.2f, %.2f, %.2f)  size (%.1f, %.1f, %.1f)"
          % (box["center_x"], box["center_y"], box["center_z"],
             box["size_x"], box["size_y"], box["size_z"]))
    return box


def box_from_atoms(atoms: list) -> dict:
    """Box straight off the crystallographic ligand.

    Guessing the pocket from the protein alone is the usual way to dock into
    the wrong cavity; the bound ligand marks the real site.
    """
    xs = [a["x"] for a in atoms]
    ys = [a["y"] for a in atoms]
    zs = [a["z"] for a in atoms]
    box = {}
    for axis, vals in (("x", xs), ("y", ys), ("z", zs)):
        lo, hi = min(vals), max(vals)
        box["center_" + axis] = round((lo + hi) / 2.0, 3)
        box["size_" + axis] = round(max(BOX_MIN, (hi - lo) + 2 * BOX_PADDING), 3)
    box["source_atoms"] = len(atoms)
    return box


# --------------------------------------------------------- ligand 3D prep

def ligand_to_sdf(smiles: str, name: str, path: pathlib.Path) -> None:
    try:
        from rdkit import Chem, RDLogger
        from rdkit.Chem import AllChem
    except ImportError:
        raise SystemExit("RDKit is required to build 3D ligands: "
                         "pip install -r requirements.txt")
    RDLogger.DisableLog("rdApp.*")

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError("RDKit could not parse the SMILES")
    mol = Chem.AddHs(mol)
    params = AllChem.ETKDGv3()
    params.randomSeed = 42
    if AllChem.EmbedMolecule(mol, params) != 0:
        raise ValueError("3D embedding failed")
    try:
        AllChem.MMFFOptimizeMolecule(mol, maxIters=500)
    except Exception:
        pass  # an unoptimised conformer still docks
    mol.SetProp("_Name", name)
    Chem.SDWriter(str(path)).write(mol)


# ----------------------------------------------------------------- docking

SCORE_RE = re.compile(r"^\s*(\d+)\s+(-?\d+\.\d+)\s+", re.MULTILINE)


def run_smina(receptor: pathlib.Path, ligand: pathlib.Path,
              out_sdf: pathlib.Path, box: dict, exe: str) -> list:
    cmd = [
        exe,
        "-r", str(receptor),
        "-l", str(ligand),
        "-o", str(out_sdf),
        "--center_x", str(box["center_x"]),
        "--center_y", str(box["center_y"]),
        "--center_z", str(box["center_z"]),
        "--size_x", str(box["size_x"]),
        "--size_y", str(box["size_y"]),
        "--size_z", str(box["size_z"]),
        "--exhaustiveness", "16",
        "--num_modes", "9",
        "--seed", "42",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or "smina failed").strip()[:400])
    scores = [float(m.group(2)) for m in SCORE_RE.finditer(proc.stdout)]
    if not scores:
        raise RuntimeError("could not parse any affinity from smina output")
    return scores


# ------------------------------------------------------- contact analysis

def read_sdf_heavy_atoms(path: pathlib.Path):
    """First record of an SDF: heavy-atom elements and coordinates."""
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    if len(lines) < 4:
        return []
    counts = lines[3]
    try:
        n_atoms = int(counts[0:3])
    except ValueError:
        return []
    out = []
    for line in lines[4:4 + n_atoms]:
        try:
            x, y, z = float(line[0:10]), float(line[10:20]), float(line[20:30])
        except ValueError:
            continue
        element = line[31:34].strip().upper()
        if element == "H":
            continue
        out.append({"element": element, "x": x, "y": y, "z": z})
    return out


def analyse_contacts(receptor_atoms: list, pose_atoms: list) -> dict:
    residues = {}
    hbonds = []

    for ra in receptor_atoms:
        if ra["element"] == "H":
            continue
        key = "%s%s" % (ra["resname"].upper(), ra["resseq"])
        for la in pose_atoms:
            d = math.sqrt((ra["x"] - la["x"]) ** 2 +
                          (ra["y"] - la["y"]) ** 2 +
                          (ra["z"] - la["z"]) ** 2)
            if d > CONTACT_CUTOFF:
                continue
            entry = residues.setdefault(
                key, {"residue": key, "chain": ra["chain"], "min_dist": d,
                      "n_contacts": 0, "hbond": False})
            entry["n_contacts"] += 1
            if d < entry["min_dist"]:
                entry["min_dist"] = d
            if (d <= HBOND_CUTOFF and ra["element"] in HBOND_ELEMENTS
                    and la["element"] in HBOND_ELEMENTS):
                entry["hbond"] = True
                hbonds.append({"residue": key, "atom": ra["name"],
                               "ligand_element": la["element"], "dist": round(d, 2)})

    for entry in residues.values():
        entry["min_dist"] = round(entry["min_dist"], 2)

    contacted = set(residues)
    hit = {label: sorted(contacted & members) for label, members in ANCHORS.items()}
    return {
        "residues": sorted(residues.values(), key=lambda r: r["min_dist"]),
        "hbonds": hbonds,
        "anchors": hit,
    }


def interpret(analysis: dict, affinity: float) -> str:
    # A clashing pose still produces a contact list, so say so first and do
    # not dress it up with an anchor narrative it cannot support.
    if affinity is not None and affinity >= UNPLACEABLE:
        return ("포켓에 배치 실패 (입체 충돌) — 이 수용체 형태에 들어가지 않음; "
                "접촉 잔기는 의미 없음. 길항 형태(2OZ7 등)에서 재시도 권장")

    a = bool(analysis["anchors"]["A-ring"])
    d = bool(analysis["anchors"]["D-ring"])
    h12 = bool(set(analysis["anchors"]["helix-12"]) & H12_DISPLACEMENT)

    if a and d:
        note = "전형적 AR 리간드 결합 양상"
    elif a or d:
        note = "한쪽 앵커만 충족 — 배향 불안정 가능"
    else:
        note = "소수성 접촉만 — 특이적 결합 근거 약함"

    if h12:
        note += "; helix-12 말단(Ile899) 접촉 — AF-2 교란 가능, 길항 성향 시사"
    if affinity is not None and affinity >= -6.0:
        note += "; 결합 약함, 위양성 의심"
    return note


# -------------------------------------------------------------- the driver

def dock_one(name, smiles, receptor_atoms, paths, box, exe):
    ligand_sdf = paths["work"] / "_ligand.sdf"
    pose_sdf = paths["poses"] / ("%s.sdf" % safe(name))

    ligand_to_sdf(smiles, name, ligand_sdf)
    scores = run_smina(paths["work"] / "receptor.pdb", ligand_sdf, pose_sdf, box, exe)
    best = scores[0]

    pose_atoms = read_sdf_heavy_atoms(pose_sdf)
    analysis = analyse_contacts(receptor_atoms, pose_atoms)
    analysis.update({"name": name, "smiles": smiles,
                     "affinity": best, "all_modes": scores})
    analysis["interpretation"] = interpret(analysis, best)

    (paths["contacts"] / ("%s.json" % safe(name))).write_text(
        json.dumps(analysis, ensure_ascii=False, indent=1), encoding="utf-8")
    return analysis


def safe(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_") or "ligand"


def load_jobs(args) -> list:
    if args.smiles:
        return [(args.name or "ligand", args.smiles)]
    jobs = []
    with open(args.csv, newline="", encoding="utf-8-sig") as fh:
        sample = fh.read(4096)
        fh.seek(0)
        has_header = "smiles" in sample.lower()
        reader = csv.DictReader(fh) if has_header else csv.reader(fh)
        if has_header:
            fields = {(f or "").strip().lower(): f for f in (reader.fieldnames or [])}
            name_key = fields.get("name") or fields.get("이름")
            smi_key = fields.get("smiles")
            if not smi_key:
                raise SystemExit("CSV needs a 'smiles' column")
            for row in reader:
                smi = (row.get(smi_key) or "").strip()
                if smi:
                    jobs.append(((row.get(name_key) or smi)[:60].strip(), smi))
        else:
            for row in reader:
                if len(row) >= 2 and row[1].strip():
                    jobs.append((row[0].strip() or row[1].strip(), row[1].strip()))
    return jobs


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--prepare", action="store_true", help="fetch and split the PDB entry")
    ap.add_argument("--pdb", default=DEFAULT_PDB, help="PDB id (default %s)" % DEFAULT_PDB)
    ap.add_argument("--smiles", help="dock a single SMILES")
    ap.add_argument("--name", help="name for --smiles")
    ap.add_argument("--csv", help="batch file with name,smiles columns")
    ap.add_argument("--workdir", type=pathlib.Path,
                    default=pathlib.Path(__file__).resolve().parent / "dock")
    ap.add_argument("--smina", default="smina", help="path to the smina executable")
    args = ap.parse_args()

    work = args.workdir
    if args.prepare:
        prepare(args.pdb, work)
        if not (args.smiles or args.csv):
            return 0

    if not (args.smiles or args.csv):
        ap.error("give --smiles or --csv (or --prepare on its own)")

    box_path = work / "box.json"
    if not box_path.exists():
        raise SystemExit("no box.json in %s — run with --prepare first" % work)
    box = json.loads(box_path.read_text(encoding="utf-8"))

    receptor_path = work / "receptor.pdb"
    if not receptor_path.exists():
        raise SystemExit("no receptor.pdb in %s — run with --prepare first" % work)
    receptor_atoms = list(parse_pdb_atoms(
        receptor_path.read_text(encoding="utf-8", errors="replace")))

    if shutil.which(args.smina) is None and not pathlib.Path(args.smina).exists():
        raise SystemExit(
            "smina not found on PATH. Install it (conda install -c conda-forge smina, "
            "or download a static build) or pass --smina /path/to/smina"
        )

    paths = {"work": work,
             "poses": work / "poses",
             "contacts": work / "contacts"}
    paths["poses"].mkdir(parents=True, exist_ok=True)
    paths["contacts"].mkdir(parents=True, exist_ok=True)

    jobs = load_jobs(args)
    if not jobs:
        raise SystemExit("no ligands to dock")
    print("docking %d ligand(s)\n" % len(jobs))

    rows = []
    for i, (name, smiles) in enumerate(jobs, 1):
        print("[%d/%d] %s" % (i, len(jobs), name))
        try:
            res = dock_one(name, smiles, receptor_atoms, paths, box, args.smina)
        except Exception as exc:
            print("      failed: %s" % exc)
            rows.append({"name": name, "smiles": smiles, "affinity": "",
                         "a_ring": "", "d_ring": "", "helix12": "",
                         "n_residues": "", "n_hbonds": "",
                         "interpretation": "실패: %s" % exc})
            continue
        print("      affinity %.2f kcal/mol   %s"
              % (res["affinity"], res["interpretation"]))
        rows.append({
            "name": name,
            "smiles": smiles,
            "affinity": round(res["affinity"], 2),
            "a_ring": ";".join(res["anchors"]["A-ring"]),
            "d_ring": ";".join(res["anchors"]["D-ring"]),
            "helix12": ";".join(res["anchors"]["helix-12"]),
            "n_residues": len(res["residues"]),
            "n_hbonds": len(res["hbonds"]),
            "interpretation": res["interpretation"],
        })

    rows.sort(key=lambda r: (r["affinity"] == "", r["affinity"]))
    out_csv = work / "results.csv"
    with open(out_csv, "w", newline="", encoding="utf-8-sig") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    print("\nwrote %s" % out_csv)
    print("poses in %s, contact detail in %s" % (paths["poses"], paths["contacts"]))
    print("\nDocking scores are not affinity predictions, and on this project's "
          "\n22-ligand panel they did not rank reliably either: r^2 against "
          "measured\npKi was 0.03 in 2AM9 and 0.29 in 2OZ7. Read the placement "
          "and the\ncontacts, not the ordering. See README ' 실행 결과'.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
