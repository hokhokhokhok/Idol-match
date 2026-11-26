#!/usr/bin/env python3
"""Measure the ERalpha cavity volume from a crystal structure.

A grid is laid over the ligand's neighbourhood; a point counts as cavity when
it clears every protein atom's van der Waals radius plus a 1.4 A probe and is
enclosed by protein in at least 11 of 13 directions. The enclosure test is
what separates a cavity from the open solvent next to it.

Usage: python3 pocket_volume.py <pdb_dir> [PDB LIG]
"""
import pathlib, sys
import numpy as np

VDW = {"C": 1.70, "N": 1.55, "O": 1.52, "S": 1.80, "P": 1.80, "F": 1.47,
       "CL": 1.75, "BR": 1.85, "I": 1.98, "SE": 1.90}
PROBE = float(__import__("os").environ.get("PROBE", "0.0"))
SPACING = 0.5
PAD = 5.0
MIN_ENCLOSED = int(__import__("os").environ.get("ENCL", "11"))


def atoms(path, want_hetero=None):
    prot, lig = [], []
    for line in pathlib.Path(path).read_text().splitlines():
        if not line.startswith(("ATOM", "HETATM")):
            continue
        if line[16] not in (" ", "A"):
            continue
        res = line[17:20].strip()
        el = (line[76:78].strip() or line[12:16].strip()[0]).upper()
        if el in ("H", "D"):
            continue
        xyz = [float(line[30:38]), float(line[38:46]), float(line[46:54])]
        if line.startswith("HETATM") and res == want_hetero and line[21] == "A":
            lig.append((xyz, el))
        elif line.startswith("ATOM") and line[21] == "A":
            prot.append((xyz, el))
    return prot, lig


def main():
    pdbdir = pathlib.Path(sys.argv[1])
    pdb = sys.argv[2] if len(sys.argv) > 2 else "1GWR"
    code = sys.argv[3] if len(sys.argv) > 3 else "EST"
    prot, lig = atoms(pdbdir / (pdb + ".pdb"), code)
    P = np.array([a[0] for a in prot])
    Pr = np.array([VDW.get(a[1], 1.7) for a in prot]) + PROBE
    L = np.array([a[0] for a in lig])
    print("%s: protein atoms %d, ligand %s atoms %d" % (pdb, len(P), code, len(L)))

    lo = L.min(0) - PAD
    hi = L.max(0) + PAD
    dims = np.ceil((hi - lo) / SPACING).astype(int) + 1
    print("grid %s = %d points, spacing %.2f A" % (dims, int(np.prod(dims)), SPACING))

    # occupancy: stamp each atom into the grid instead of testing every
    # grid point against every atom
    occ = np.zeros(tuple(dims), bool)
    sel = ((P >= lo - 6) & (P <= hi + 6)).all(1)
    for centre, radius in zip(P[sel], Pr[sel]):
        rg = int(np.ceil(radius / SPACING))
        idx = np.round((centre - lo) / SPACING).astype(int)
        s0 = np.maximum(idx - rg, 0)
        s1 = np.minimum(idx + rg + 1, dims)
        if (s1 <= s0).any():
            continue
        sub = [np.arange(s0[k], s1[k]) for k in range(3)]
        g = np.stack(np.meshgrid(*sub, indexing="ij"), -1) * SPACING + lo
        d2 = ((g - centre) ** 2).sum(-1)
        occ[s0[0]:s1[0], s0[1]:s1[1], s0[2]:s1[2]] |= d2 < radius ** 2
    free = ~occ
    print("free grid points: %d of %d" % (free.sum(), free.size))

    # enclosure: march along each direction in index space with array shifts
    dirs = [(1, 0, 0), (0, 1, 0), (0, 0, 1), (1, 1, 0), (1, -1, 0), (1, 0, 1),
            (1, 0, -1), (0, 1, 1), (0, 1, -1), (1, 1, 1), (1, 1, -1),
            (1, -1, 1), (1, -1, -1)]
    reach = int(round(10.0 / SPACING))
    enclosed = np.zeros(tuple(dims), np.int8)
    for d in dirs:
        for sign in (1, -1):
            hit = np.zeros(tuple(dims), bool)
            for step in range(1, reach + 1):
                shift = [sign * step * c for c in d]
                src = occ
                for ax, sh in enumerate(shift):
                    if sh:
                        src = np.roll(src, -sh, axis=ax)
                        # rolled-in faces are outside the box: treat as empty
                        sl = [slice(None)] * 3
                        sl[ax] = slice(-abs(sh), None) if sh > 0 else slice(0, abs(sh))
                        src = src.copy()
                        src[tuple(sl)] = False
                hit |= src
            enclosed += hit.astype(np.int8)
    cavity = free & (enclosed >= MIN_ENCLOSED)
    print("cavity points: %d" % cavity.sum())

    # keep only the blob the ligand sits in
    seed = np.zeros(tuple(dims), bool)
    for centre in L:
        idx = np.round((centre - lo) / SPACING).astype(int)
        rg = int(round(2.0 / SPACING))
        s0 = np.maximum(idx - rg, 0)
        s1 = np.minimum(idx + rg + 1, dims)
        seed[s0[0]:s1[0], s0[1]:s1[1], s0[2]:s1[2]] = True
    blob = cavity & seed
    for _ in range(400):
        grown = blob.copy()
        for ax in range(3):
            grown |= np.roll(blob, 1, axis=ax)
            grown |= np.roll(blob, -1, axis=ax)
        grown &= cavity
        if grown.sum() == blob.sum():
            break
        blob = grown
    vol = blob.sum() * SPACING ** 3
    print("connected cavity points: %d" % blob.sum())
    print("CAVITY VOLUME: %.0f A^3 (probe %.1f, spacing %.1f, enclosure %d/13)"
          % (vol, PROBE, SPACING, MIN_ENCLOSED))


if __name__ == "__main__":
    main()
