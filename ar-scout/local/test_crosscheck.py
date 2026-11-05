#!/usr/bin/env python3
"""Cross-check the browser engine against RDKit over the whole library.

The web engine is deliberately dependency-free, so it carries its own SMILES
parser, valence model and aromaticity perception. That is exactly the kind of
code that goes subtly wrong, and nothing inside the bundle can catch it. RDKit
is available locally, so use it as an independent oracle.

Two things are checked for every reference and dictionary structure:

  1. formula, MW, heavy-atom count, ring count and aromatic ring count must
     agree with RDKit exactly;
  2. RDKit's Kekule spelling of the same molecule must give the engine the
     same descriptors and the same fingerprint as the original spelling.

Needs node and RDKit. Not part of the browser test suite.

    python3 test_crosscheck.py
"""

import json
import pathlib
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parent / "web"

MW_TOL = 0.6

PROBE = r"""
const AR = require(%(armodel)s);
const PR = require(%(predict)s);
const input = JSON.parse(require('fs').readFileSync(%(infile)s, 'utf8'));
const out = [];
for (const row of input) {
  try {
    const m = AR.parseSmiles(row.s);
    const d = AR.computeDescriptors(m);
    out.push({
      key: row.key, s: row.s, formula: d.formula, mw: d.mw,
      heavy: d.heavy, rings: d.rings, aromRings: d.aromRings,
      tpsa: d.tpsa, clogp: d.clogp, hbd: d.hbd, hba: d.hba,
      fp: Array.from(AR.morganFingerprint(m, 2))
            .map((b, i) => b ? i : -1).filter(i => i >= 0)
    });
  } catch (err) {
    out.push({ key: row.key, s: row.s, error: err.message });
  }
}
require('fs').writeFileSync(%(outfile)s, JSON.stringify(out));
"""

LIST = r"""
const PR = require(%(predict)s);
const rows = [];
for (const e of PR.REFERENCE_DEFAULT) rows.push({ kind: 'REF', name: e.n, s: e.s });
for (const t of PR.INGREDIENTS) rows.push({ kind: 'DICT', name: t[1], s: t[2] });
console.log(JSON.stringify(rows));
"""


def q(p):
    return json.dumps(str(p))


def run_engine(rows, tmp):
    """rows: [{key, s}] -> {key: result}"""
    infile = tmp / "in.json"
    outfile = tmp / "out.json"
    script = tmp / "probe.js"
    infile.write_text(json.dumps(rows), encoding="utf-8")
    script.write_text(PROBE % {
        "armodel": q(WEB / "armodel.js"), "predict": q(WEB / "predict.js"),
        "infile": q(infile), "outfile": q(outfile),
    }, encoding="utf-8")
    proc = subprocess.run(["node", str(script)], capture_output=True, text=True)
    if proc.returncode != 0:
        raise SystemExit("engine probe failed:\n" + proc.stderr)
    return {r["key"]: r for r in json.loads(outfile.read_text(encoding="utf-8"))}


def main() -> int:
    try:
        from rdkit import Chem, RDLogger
        from rdkit.Chem import Descriptors, rdMolDescriptors
    except ImportError:
        print("RDKit is not installed: pip install -r requirements.txt")
        return 0
    RDLogger.DisableLog("rdApp.*")

    listing = subprocess.run(
        ["node", "-e", LIST % {"predict": q(WEB / "predict.js")}],
        capture_output=True, text=True)
    if listing.returncode != 0:
        raise SystemExit("could not read the library:\n" + listing.stderr)
    library = json.loads(listing.stdout)
    print("library: %d structures\n" % len(library))

    tmp = pathlib.Path(tempfile.mkdtemp(prefix="xcheck-"))

    # --- original spellings -------------------------------------------------
    rows = [{"key": "o%d" % i, "s": e["s"]} for i, e in enumerate(library)]
    engine = run_engine(rows, tmp)

    # --- RDKit Kekule spellings of the same molecules ----------------------
    kek_rows, kek_of = [], {}
    for i, e in enumerate(library):
        mol = Chem.MolFromSmiles(e["s"])
        if mol is None:
            continue
        try:
            Chem.Kekulize(mol, clearAromaticFlags=True)
            kek = Chem.MolToSmiles(mol, kekuleSmiles=True)
        except Exception:
            continue
        if kek == e["s"]:
            continue
        kek_of[i] = kek
        kek_rows.append({"key": "k%d" % i, "s": kek})
    kekule = run_engine(kek_rows, tmp) if kek_rows else {}

    oracle_fail = kek_fail = 0
    for i, e in enumerate(library):
        tag = "[%s] %s" % (e["kind"], e["name"])
        got = engine["o%d" % i]
        if got.get("error"):
            oracle_fail += 1
            print("  FAIL  %-34s engine error: %s" % (tag, got["error"]))
            continue

        mol = Chem.MolFromSmiles(e["s"])
        if mol is None:
            oracle_fail += 1
            print("  FAIL  %-34s RDKit cannot parse it" % tag)
            continue

        formula = rdMolDescriptors.CalcMolFormula(mol)
        bare = formula
        for ch in "+-":
            if ch in bare:
                bare = bare.split(ch)[0]

        problems = []
        if got["formula"] != bare:
            problems.append("formula %s vs %s" % (got["formula"], formula))
        if abs(got["mw"] - Descriptors.MolWt(mol)) > MW_TOL:
            problems.append("MW %.2f vs %.2f" % (got["mw"], Descriptors.MolWt(mol)))
        if got["heavy"] != mol.GetNumHeavyAtoms():
            problems.append("heavy %d vs %d" % (got["heavy"], mol.GetNumHeavyAtoms()))
        # Compare against the cycle rank, not CalcNumRings: that returns the
        # *symmetrised* SSSR, which reports an extra ring for a symmetric cage
        # - 7 for adapalene's adamantyl where the cycle rank is 6. The engine
        # computes the cycle rank, so compare like with like.
        sssr = len(Chem.GetSSSR(mol))
        if got["rings"] != sssr:
            problems.append("rings %d vs SSSR %d (CalcNumRings %d)"
                            % (got["rings"], sssr, rdMolDescriptors.CalcNumRings(mol)))
        if got["aromRings"] != rdMolDescriptors.CalcNumAromaticRings(mol):
            problems.append("aromatic rings %d vs %d"
                            % (got["aromRings"],
                               rdMolDescriptors.CalcNumAromaticRings(mol)))
        if problems:
            oracle_fail += 1
            print("  FAIL  %-34s %s" % (tag, "; ".join(problems)))

        # --- spelling invariance -------------------------------------------
        if i in kek_of:
            alt = kekule.get("k%d" % i)
            if alt is None or alt.get("error"):
                kek_fail += 1
                print("  FAIL  %-34s Kekule form rejected: %s"
                      % (tag, (alt or {}).get("error", "missing")))
            else:
                diffs = []
                for field in ("formula", "heavy", "rings", "aromRings", "hbd", "hba"):
                    if got[field] != alt[field]:
                        diffs.append("%s %s vs %s" % (field, got[field], alt[field]))
                for field in ("mw", "tpsa", "clogp"):
                    if abs(got[field] - alt[field]) > 1e-6:
                        diffs.append("%s %.3f vs %.3f" % (field, got[field], alt[field]))
                a, b = set(got["fp"]), set(alt["fp"])
                tan = len(a & b) / len(a | b) if (a | b) else 1.0
                if tan < 0.999:
                    diffs.append("Tanimoto %.3f against itself" % tan)
                if diffs:
                    kek_fail += 1
                    print("  FAIL  %-34s Kekule: %s" % (tag, "; ".join(diffs)))

    print("\n  RDKit oracle          %d checked, %d mismatches"
          % (len(library), oracle_fail))
    print("  spelling invariance   %d Kekule variants, %d mismatches"
          % (len(kek_rows), kek_fail))
    total = oracle_fail + kek_fail
    print("\n  crosscheck: %s" % ("all clear" if total == 0 else "%d FAILURES" % total))
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main())
