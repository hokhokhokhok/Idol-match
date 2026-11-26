#!/usr/bin/env python3
"""Build a receptor binding-site scene from crystal structures.

One complex is the frame; every other is superposed onto it by the Calpha
atoms of the residues the two share, so the ligands end up in one coordinate
system and can be drawn in the same pocket. The poses are therefore crystal
poses, not docked ones: nothing here is computed from a scoring function.

Each receptor is a config file, because what separates the ligand classes is
receptor-specific:

  ERalpha  helix 12 moves 11 A when an antagonist binds, so the scene is
           classified by where helix 12 ends up (mode "h12_displacement").
  PPARgamma  helix 12 barely moves; what separates a full agonist from a
           partial one is whether the ligand hydrogen-bonds the Tyr473 /
           His323 / His449 / Ser289 cluster that holds helix 12 in place
           (mode "anchor_hbond").

Usage: python3 build_pocket.py <pdb_dir> [config.json] [out.json]
  default config: local/pocket_er.json
"""
import json, pathlib, sys
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent

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
    cfg_path = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / "pocket_er.json"
    cfg = json.loads(cfg_path.read_text())
    out_path = (pathlib.Path(sys.argv[3]) if len(sys.argv) > 3
                else HERE.parent / "web/assets" / cfg["out"])

    ref_pdb = cfg["ref"]
    ref_lig = cfg["ref_ligand"]
    forced = cfg.get("forced", [])
    mode = cfg.get("mode", "h12_displacement")
    h12 = cfg.get("h12", [])
    h12_cut = cfg.get("h12_cut", 3.0)
    anchors = [a.upper() for a in cfg.get("anchor_hbond", [])]
    pocket_cut = cfg.get("pocket_cut", POCKET_CUT)

    ref_atoms = parse(pdbdir / (ref_pdb + ".pdb"))
    ref_ca = calphas(ref_atoms)
    ref_prot = protein(ref_atoms)
    ref_lig_groups = ligand(ref_atoms, ref_lig, "A")
    if not ref_lig_groups:
        raise SystemExit("no %s in %s chain A" % (ref_lig, ref_pdb))
    ref_ligand_atoms = list(ref_lig_groups.values())[0]
    ref_lig_xyz = np.array([a["xyz"] for a in ref_ligand_atoms])

    # ---- pocket residues: near the reference ligand, plus the forced list
    keep = {}
    for a in ref_prot:
        d = np.linalg.norm(ref_lig_xyz - a["xyz"], axis=1).min()
        if d <= pocket_cut:
            keep.setdefault(a["seq"], a["res"])
    for seq in forced:
        hit = [a for a in ref_prot if a["seq"] == seq]
        if hit:
            keep.setdefault(seq, hit[0]["res"])

    pocket = []
    for seq in sorted(keep):
        ats = [a for a in ref_prot if a["seq"] == seq]
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
    for entry in cfg["complexes"]:
        pdb, code, label = entry["pdb"], entry["lig"], entry.get("n")
        path = pdbdir / (pdb + ".pdb")
        if not path.exists():
            print("missing %s" % pdb, file=sys.stderr)
            continue
        atoms = parse(path)
        rmsd, core_n = None, None
        if pdb == ref_pdb:
            R, t, rmsd, core_n = np.eye(3), np.zeros(3), 0.0, len(ref_ca)
        else:
            ca = calphas(atoms)
            shared = [x for x in sorted(set(ca) & set(ref_ca)) if x not in h12]
            if len(shared) < 60:
                print("%s: only %d shared CA, skipped" % (pdb, len(shared)), file=sys.stderr)
                continue
            # A moving helix would spread its error over the pocket, so the
            # fit is refined on the core: pairs further than 2 A are dropped
            # and the fit repeated.
            P = np.array([ca[x] for x in shared])
            Q = np.array([ref_ca[x] for x in shared])
            R, t = kabsch(P, Q)
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
        contacts, hbonds = [], []
        for pr in pocket:
            pxyz = np.array([[c[0], c[1], c[2]] for c in pr["a"]])
            dm = np.linalg.norm(pxyz[:, None, :] - xyz[None, :, :], axis=2)
            if dm.min() <= CONTACT_CUT:
                contacts.append(pr["id"])
            polar_res = [i for i, c in enumerate(pr["a"]) if c[3] in ("N", "O")]
            polar_lig = [j for j, a in enumerate(placed) if a["el"] in ("N", "O")]
            if polar_res and polar_lig and dm[np.ix_(polar_res, polar_lig)].min() <= HBOND_CUT:
                hbonds.append(pr["id"])

        # ---- which class of ligand is this, measured rather than asserted
        h12_rmsd, conf = None, "unknown"
        if mode == "h12_displacement":
            ca_all = calphas(atoms)
            pairs = [(ca_all[x], ref_ca[x]) for x in h12 if x in ca_all and x in ref_ca]
            if len(pairs) >= 4:
                m = np.array([(R @ pr[0]) + t for pr in pairs])
                q = np.array([pr[1] for pr in pairs])
                h12_rmsd = float(np.sqrt(((m - q) ** 2).sum(1).mean()))
                conf = cfg["classes"][0] if h12_rmsd <= h12_cut else cfg["classes"][1]
        elif mode == "anchor_hbond":
            held = [a for a in anchors if a in [h.upper() for h in hbonds]]
            conf = cfg["classes"][0] if held else cfg["classes"][1]
            h12_rmsd = len(held)

        poses.append({
            "lig": code, "pdb": pdb, "n": label, "conf": conf,
            "h12": None if h12_rmsd is None else round(h12_rmsd, 2),
            "rmsd": None if rmsd is None else round(rmsd, 2),
            "placed": True, "crystal": True,
            "a": [[round(float(a["xyz"][0]), 2), round(float(a["xyz"][1]), 2),
                   round(float(a["xyz"][2]), 2), a["el"].capitalize()] for a in placed],
            "b": bonds_of(placed),
            "c": contacts, "hb": hbonds,
        })
        print("%-5s %-4s core %3s CA, RMSD %-5s | %-7s %-14s | atoms %2d contacts %2d hb %s"
              % (pdb, code, core_n, round(rmsd, 2),
                 "-" if h12_rmsd is None else h12_rmsd, conf,
                 len(placed), len(contacts), ",".join(hbonds)), file=sys.stderr)

    ref_pose = next((p for p in poses if p["pdb"] == ref_pdb), None)
    scene = {
        "pdb": ref_pdb,
        "receptor": cfg.get("receptor", ""),
        "note": cfg.get("note", ""),
        "mode": mode,
        "classes": cfg.get("classes", []),
        "crystal": {"a": ref_pose["a"], "b": ref_pose["b"], "lig": ref_lig,
                    "n": ref_pose["n"]} if ref_pose else None,
        "pocket": pocket,
        "poses": poses,
    }
    out_path.write_text(json.dumps(scene, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf8")
    print("-> %s (%d poses, %.0f KB)" % (out_path, len(poses),
                                         out_path.stat().st_size / 1024), file=sys.stderr)


if __name__ == "__main__":
    main()
