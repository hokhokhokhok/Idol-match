#!/usr/bin/env python3
"""Mutate a residue in place in the prepared receptor, keeping everything else.

Why this exists. The first resistance-mutant experiment compared smina scores
across three different crystals - 2AM9 wild type, 2OZ7 for T877A, 1Z95 for
W741L. That comparison cannot isolate the mutation. The same repository
measured that the choice of structure moves the ranking more than the choice
of ligand (r^2 0.026 / 0.293 / 0.050 on the same 22 compounds), and that each
receptor favours its own co-crystal ligand - 1Z95 ranks R-bicalutamide 1st of
22. Bicalutamide's headline "rescue" in 1Z95 was therefore mostly self-docking
bias, not W741L.

Cutting the side chain out of the wild-type structure keeps the backbone, the
box, the resolution and every other side chain fixed, so what changes is the
side chain and nothing else.

  THR877 -> ALA   exact: Thr has OG1 + CG2 past CB, Ala has nothing
  TRP741 -> ALA   "gate removed" - removes more than W741L does, and says so
  TRP741 -> LEU   approximate: keeps CB/CG/CD1/CD2 from the indole and
                  renames. The geometry is borrowed from an sp2 ring, so it
                  is a stand-in for Leu, not a modelled Leu.
"""

import argparse
import pathlib
import shutil
import sys

KEEP = {
    "ALA": {"N", "CA", "C", "O", "CB"},
    "LEU": {"N", "CA", "C", "O", "CB", "CG", "CD1", "CD2"},
}


def mutate(src: pathlib.Path, dst: pathlib.Path, resnum: str, target: str) -> int:
    keep = KEEP[target]
    out, dropped, seen = [], 0, False
    for line in src.read_text().splitlines(True):
        if line.startswith(("ATOM", "HETATM")) and line[22:26].strip() == resnum:
            seen = True
            atom = line[12:16].strip()
            if atom not in keep:
                dropped += 1
                continue
            line = line[:17] + target.ljust(3) + line[20:]
        out.append(line)
    if not seen:
        raise SystemExit("residue %s not found in %s" % (resnum, src))
    dst.write_text("".join(out))
    return dropped


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--from-dir", type=pathlib.Path, required=True)
    ap.add_argument("--to-dir", type=pathlib.Path, required=True)
    ap.add_argument("--resnum", required=True)
    ap.add_argument("--to", dest="target", required=True, choices=sorted(KEEP))
    args = ap.parse_args()

    args.to_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy(args.from_dir / "box.json", args.to_dir / "box.json")
    n = mutate(args.from_dir / "receptor.pdb", args.to_dir / "receptor.pdb",
               args.resnum, args.target)
    print("%s -> %s: dropped %d side-chain atoms, box copied unchanged"
          % (args.resnum, args.target, n))
    return 0


if __name__ == "__main__":
    sys.exit(main())
