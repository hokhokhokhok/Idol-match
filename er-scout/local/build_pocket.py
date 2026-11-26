#!/usr/bin/env python3
"""Build the ERalpha binding-site scene from crystal structures.

1GWR (wild-type ERalpha LBD + 17beta-estradiol + coactivator NR box, 2.4 A)
is the frame. Every other complex is superposed onto it by the Calpha atoms
of the residues the two share, so the ligands end up in one coordinate system
and can be drawn in the same pocket. The poses are therefore crystal poses,
not docked ones: nothing here is computed from a scoring function.

Usage: python3 build_pocket.py <pdb_dir> [out.json]
"""
import json, math, pathlib, sys
import numpy as np

REF = "1GWR"
REF_LIG = "EST"

# (pdb, ligand code, label). The receptor conformation is not asserted here,
# it is measured below from where helix 12 ends up.
COMPLEXES = [
    ("1GWR", "EST", "17b-Estradiol"),
    ("1X7R", "GEN", "Genistein"),
    ("1L2I", "ETC", "THC (tetrahydrochrysene-2,8-diol)"),
    ("2P15", "EZT", "17a-(trifluoromethylphenyl-vinyl)estradiol"),
    ("2B1V", "458", "Bicyclo[3.3.1]nonene phenol agonist"),
    ("3OS8", "KN0", "Benzyl-trifluoromethyl-indazole resorcinol"),
    ("1XP1", "AIH", "Benzoxathiin SERM (dimethylpyrrolidinyl)"),
    ("1SJ0", "E4D", "Benzoxathiin SERM (piperidinyl)"),
    ("3ERT", "OHT", "4-Hydroxytamoxifen"),
    ("1ERR", "RAL", "Raloxifene"),
]

H12 = list(range(536, 545))        # helix 12; moves when an antagonist binds
H12_SHIFT_CUT = 3.0               # A, Calpha RMSD over H12 against the agonist frame

# Residues the UI always shows even when estradiol does not touch them:
# Asp351 is the carboxylate the SERM side chain pairs with, and 536-544 is
# helix 12, which an antagonist pushes out of the AF-2 groove.
FORCED = [351, 347, 383, 536, 537, 538, 539, 540, 541, 542, 543, 544]
POCKET_CUT = 5.0      # A, residue kept in the scene
CONTACT_CUT = 4.0     # A, ligand touches residue
HBOND_CUT = 3.4       # A, N/O to N/O

COVALENT = {"C": 0.77, "N": 0.75, "O": 0.73, "S": 1.02, "P": 1.06,
            "F": 0.71, "CL": 0.99, "BR": 1.14, "I": 1.33, "H": 0.37}

AA3 = {"ALA", "ARG", "ASN", "ASP", "CYS", "GLN", "GLU", "GLY", "HIS", "ILE",
       "LEU", "LYS", "MET", "PHE", "PRO", "SER", "THR", "TRP", "TYR", "VAL",
       "CME", "CCS", "CSO", "MSE"}
# modified residues that stand in for a normal one
ALIAS = {"CME": "CYS", "CCS": "CYS", "CSO": "CYS", "MSE": "MET"}


def parse(path):
    atoms = []
    for line in pathlib.Path(path).read_text().splitlines():
        if not (line.startswith("ATOM") or line.startswith("HETATM")):
            continue
        alt = line[16]
        if alt not in (" ", "A"):
            continue
        el = (line[76:78].strip() or line[12:16].strip()[0]).upper()
        if el == "H" or el == "D":
            continue
        atoms.append({
            "rec": line[:6].strip(),
            "name": line[12:16].strip(),
            "res": line[17:20].strip(),
            "chain": line[21],
            "seq": int(line[22:26]),
            "xyz": np.array([float(line[30:38]), float(line[38:46]), float(line[46:54])]),
            "el": el,
        })
    return atoms


def protein(atoms, chain="A"):
    return [a for a in atoms if a["chain"] == chain and a["res"] in AA3]


def calphas(atoms, chain="A"):
    return {a["seq"]: a["xyz"] for a in atoms
            if a["chain"] == chain and a["name"] == "CA" and a["res"] in AA3}


def ligand(atoms, code, chain=None):
    """All copies of `code`, grouped by (chain, seq)."""
    groups = {}
    for a in atoms:
        if a["res"] != code or a["rec"] != "HETATM":
            continue
        if chain and a["chain"] != chain:
            continue
        groups.setdefault((a["chain"], a["seq"]), []).append(a)
    return groups


def kabsch(P, Q):
    """Rotation+translation taking P onto Q (both N x 3)."""
    pc, qc = P.mean(0), Q.mean(0)
    H = (P - pc).T @ (Q - qc)
    U, _, Vt = np.linalg.svd(H)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    D = np.diag([1.0, 1.0, d])
    R = Vt.T @ D @ U.T
    return R, qc - R @ pc


def bonds_of(ats):
    out = []
    for i in range(len(ats)):
        for j in range(i + 1, len(ats)):
            ri = COVALENT.get(ats[i]["el"], 0.8)
            rj = COVALENT.get(ats[j]["el"], 0.8)
            d = np.linalg.norm(ats[i]["xyz"] - ats[j]["xyz"])
            if d < ri + rj + 0.45:
                out.append([i, j])
    return out


def residue_label(res, seq):
    r = ALIAS.get(res, res)
    return r + str(seq)


def main():
    pdbdir = pathlib.Path(sys.argv[1])
    out_path = (pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else
                pathlib.Path(__file__).resolve().parent.parent / "web/assets/pocket_scene.json")

    ref_atoms = parse(pdbdir / (REF + ".pdb"))
    ref_ca = calphas(ref_atoms)
    ref_prot = protein(ref_atoms)
    ref_lig_groups = ligand(ref_atoms, REF_LIG, "A")
    ref_lig = list(ref_lig_groups.values())[0]
    ref_lig_xyz = np.array([a["xyz"] for a in ref_lig])

    # ---- pocket residues: near the reference ligand, plus the forced list
    keep = {}
    for a in ref_prot:
        d = np.linalg.norm(ref_lig_xyz - a["xyz"], axis=1).min()
        if d <= POCKET_CUT:
            keep.setdefault(a["seq"], a["res"])
    for seq in FORCED:
        hit = [a for a in ref_prot if a["seq"] == seq]
        if hit:
            keep.setdefault(seq, hit[0]["res"])

    pocket = []
    for seq in sorted(keep):
        ats = [a for a in ref_prot if a["seq"] == seq]
        # backbone N/CA/C/O carries no information for a contact map and
        # crowds the picture; the side chain plus CA is what lines the cavity
        ats = [a for a in ats if a["name"] not in ("N", "C")] or ats
        pocket.append({
            "id": residue_label(keep[seq], seq).upper(),
            "seq": seq,
            "a": [[round(float(a["xyz"][0]), 2), round(float(a["xyz"][1]), 2),
                   round(float(a["xyz"][2]), 2), a["el"].capitalize()] for a in ats],
            "b": bonds_of(ats),
        })

    print("pocket residues: %d" % len(pocket), file=sys.stderr)
    print("  " + ", ".join(p["id"] for p in pocket), file=sys.stderr)

    # ---- poses
    poses = []
    for pdb, code, label in COMPLEXES:
        path = pdbdir / (pdb + ".pdb")
        if not path.exists():
            print("missing %s" % pdb, file=sys.stderr)
            continue
        atoms = parse(path)
        R, t = None, None
        rmsd = None
        core_n = None
        if pdb == REF:
            R, t, rmsd = np.eye(3), np.zeros(3), 0.0
            core_n = len(ref_ca)
        else:
            ca = calphas(atoms)
            shared = [s for s in sorted(set(ca) & set(ref_ca)) if s not in H12]
            if len(shared) < 60:
                print("%s: only %d shared CA, skipped" % (pdb, len(shared)), file=sys.stderr)
                continue
            # Helix 12 and the loop before it swing by more than 10 A between
            # the agonist and antagonist forms. Fitting on everything spreads
            # that error over the pocket, so the fit is refined on the core:
            # pairs further than 2 A are dropped and the fit repeated.
            P = np.array([ca[s] for s in shared])
            Q = np.array([ref_ca[s] for s in shared])
            for _ in range(4):
                R, t = kabsch(P, Q)
                d = np.linalg.norm((R @ P.T).T + t - Q, axis=1)
                keep_i = d <= 2.0
                if keep_i.sum() < 50 or keep_i.all():
                    break
                P, Q = P[keep_i], Q[keep_i]
            rmsd = float(np.sqrt((np.linalg.norm((R @ P.T).T + t - Q, axis=1) ** 2).mean()))
            core_n = len(P)
        groups = ligand(atoms, code)
        if not groups:
            print("%s: no %s" % (pdb, code), file=sys.stderr)
            continue
        # the copy that lands in the reference pocket
        best, bestd = None, 1e9
        for key, ats in groups.items():
            xyz = (R @ np.array([a["xyz"] for a in ats]).T).T + t
            d = float(np.linalg.norm(xyz.mean(0) - ref_lig_xyz.mean(0)))
            if d < bestd:
                bestd, best = d, (key, ats, xyz)
        key, ats, xyz = best
        if bestd > 6.0:
            print("%s: ligand %.1f A from the reference site, skipped" % (pdb, bestd),
                  file=sys.stderr)
            continue

        placed = [dict(a, xyz=x) for a, x in zip(ats, xyz)]

        # Where did helix 12 end up? In the agonist form it caps the pocket;
        # an antagonist's side chain pushes it into the AF-2 groove instead.
        ca_all = calphas(atoms)
        h12_pairs = [(ca_all[s], ref_ca[s]) for s in H12 if s in ca_all and s in ref_ca]
        if len(h12_pairs) >= 4:
            m = np.array([(R @ p[0]) + t for p in h12_pairs])
            q = np.array([p[1] for p in h12_pairs])
            h12_rmsd = float(np.sqrt(((m - q) ** 2).sum(1).mean()))
            conf = "agonist" if h12_rmsd <= H12_SHIFT_CUT else "antagonist"
        else:
            h12_rmsd, conf = None, "unknown"
        # contacts against the reference pocket residues
        contacts, hbonds = [], []
        for p in pocket:
            pxyz = np.array([[c[0], c[1], c[2]] for c in p["a"]])
            dm = np.linalg.norm(pxyz[:, None, :] - xyz[None, :, :], axis=2)
            if dm.min() <= CONTACT_CUT:
                contacts.append(p["id"])
            polar_res = [i for i, c in enumerate(p["a"]) if c[3] in ("N", "O")]
            polar_lig = [j for j, a in enumerate(placed) if a["el"] in ("N", "O")]
            if polar_res and polar_lig and dm[np.ix_(polar_res, polar_lig)].min() <= HBOND_CUT:
                hbonds.append(p["id"])

        poses.append({
            "lig": code,
            "pdb": pdb,
            "res": None,
            "n": label,
            "conf": conf,
            "h12": None if h12_rmsd is None else round(h12_rmsd, 2),
            "rmsd": None if rmsd is None else round(rmsd, 2),
            "placed": True,
            "crystal": True,
            "a": [[round(float(a["xyz"][0]), 2), round(float(a["xyz"][1]), 2),
                   round(float(a["xyz"][2]), 2), a["el"].capitalize()] for a in placed],
            "b": bonds_of(placed),
            "c": contacts,
            "hb": hbonds,
        })
        print("%-5s %-4s core %3s CA, RMSD %-5s | H12 %-5s %-10s | atoms %2d contacts %2d hb %s"
              % (pdb, code, core_n, round(rmsd, 2),
                 "-" if h12_rmsd is None else h12_rmsd, conf,
                 len(placed), len(contacts), ",".join(hbonds)), file=sys.stderr)

    # the reference ligand itself, drawn as a faint overlay behind whatever
    # pose is on screen
    ref_pose = next((p for p in poses if p["pdb"] == REF), None)
    scene = {
        "pdb": REF,
        "note": "ERalpha LBD + 17beta-estradiol + coactivator NR box, 2.4 A, agonist conformation",
        "crystal": {"a": ref_pose["a"], "b": ref_pose["b"], "lig": REF_LIG,
                    "n": ref_pose["n"]} if ref_pose else None,
        "pocket": pocket,
        "poses": poses,
    }
    out_path.write_text(json.dumps(scene, separators=(",", ":")), encoding="utf8")
    print("-> %s (%d poses, %.0f KB)" % (out_path, len(poses),
                                         out_path.stat().st_size / 1024), file=sys.stderr)


if __name__ == "__main__":
    main()
