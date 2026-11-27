#!/usr/bin/env python3
"""Offline checks for train_qsar.py's cleaning rules and model path.

No network: ChEMBL responses are synthesised with the same field names the
API returns. The model section needs RDKit and scikit-learn and is skipped
if they are missing.

    python3 test_pipeline.py
"""

import contextlib
import io
import math
import pathlib
import pickle
import sys
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import train_qsar  # noqa: E402

PASS = FAIL = 0


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok    {name:<44} {detail}")
    else:
        FAIL += 1
        print(f"  FAIL  {name:<44} {detail}")


def rec(smiles, **kw):
    """A ChEMBL activity record with sensible defaults."""
    base = {
        "canonical_smiles": smiles,
        "standard_type": "Ki",
        "standard_relation": "=",
        "standard_units": "nM",
        "standard_value": "10",
        "pchembl_value": "8.0",
        "data_validity_comment": None,
        "molecule_chembl_id": "CHEMBL_X",
    }
    base.update(kw)
    return base


# ------------------------------------------------------------- cleaning

def test_cleaning():
    print("cleaning rules")
    records = [
        rec("c1ccccc1", pchembl_value="8.0"),                      # keep
        rec("c1ccccc1", pchembl_value="8.4"),                      # keep (replicate)
        rec("CCO", standard_relation=">"),                         # censored
        rec("CCO", standard_relation="<"),                         # censored
        rec("CCN", data_validity_comment="Outside typical range"),  # flagged
        rec("CCC", standard_type="Inhibition"),                    # wrong type
        rec("CCCC", canonical_smiles=None),                        # no structure
        rec("CCCCC", pchembl_value=None, standard_value="100"),    # derive 7.0
        rec("CCCCCC", pchembl_value=None, standard_units="%",
            standard_value="50"),                                  # unusable units
        rec("CCCCCCC", pchembl_value="1.0"),                       # below range
        rec("CCCCCCCC", pchembl_value="13.0"),                     # above range
        rec("CCCCCCCCC", pchembl_value=None, standard_value="0"),  # zero -> skip
    ]
    kept = train_qsar.clean(records)

    check("censored relations dropped", "CCO" not in kept)
    check("data_validity_comment dropped", "CCN" not in kept)
    check("non Ki/IC50/Kd/EC50 dropped", "CCC" not in kept)
    check("structureless dropped", None not in kept)
    check("below 2.0 dropped", "CCCCCCC" not in kept)
    check("above 12.0 dropped", "CCCCCCCC" not in kept)
    check("unusable units dropped", "CCCCCC" not in kept)
    check("zero nM dropped", "CCCCCCCCC" not in kept)
    check("replicates grouped", len(kept.get("c1ccccc1", [])) == 2,
          f"{len(kept.get('c1ccccc1', []))} points")

    derived = kept.get("CCCCC", [])
    check("pKi derived from nM when pChEMBL absent",
          derived and abs(derived[0][0] - 7.0) < 1e-9,
          f"9 - log10(100) = {derived[0][0] if derived else '?'}")

    # relation "~" and None are both acceptable
    loose = train_qsar.clean([rec("CO", standard_relation="~"),
                              rec("CN", standard_relation=None)])
    check("'~' and None relations kept", "CO" in loose and "CN" in loose)


# --------------------------------------------------------- consolidation

def test_consolidate():
    print("\nconsolidation")
    kept = {
        "c1ccccc1": [(7.0, "CHEMBL1", "Ki"), (9.0, "CHEMBL1", "IC50"),
                     (8.0, "CHEMBL1", "Ki")],
        "CCO": [(5.0, "CHEMBL2", "Ki")],
    }
    entries = {e["s"]: e for e in train_qsar.consolidate(kept)}
    benzene = entries["c1ccccc1"]
    check("median not mean", abs(benzene["p"] - 8.0) < 1e-9, f"p = {benzene['p']}")
    check("spread recorded", abs(benzene["_spread"] - 2.0) < 1e-9,
          benzene["note"])
    check("replicate count recorded", benzene["_n"] == 3)
    check("assay types listed", "IC50" in benzene["note"] and "Ki" in benzene["note"])
    check("singleton has no spread note", "spread" not in entries["CCO"]["note"])

    check("classify strong", train_qsar.classify(8.5) == "strong binder")
    check("classify binder", train_qsar.classify(7.0) == "binder")
    check("classify weak", train_qsar.classify(5.5) == "weak")
    check("classify non-binder", train_qsar.classify(4.0) == "non-binder")


# ---------------------------------------------------------- stratifying

def test_stratify():
    print("\nstratified sampling")
    # 400 actives, 40 inactives: taking the top N would keep only actives
    entries = []
    for i in range(400):
        entries.append({"s": f"C{i}", "p": 9.0 + (i % 5) * 0.1, "_n": 1,
                        "_spread": 0.0})
    for i in range(40):
        entries.append({"s": f"N{i}", "p": 3.0 + (i % 5) * 0.1, "_n": 1,
                        "_spread": 0.0})

    out = train_qsar.stratified_sample(entries, 100)
    check("respects the cap", len(out) == 100, f"{len(out)} entries")
    low = [e for e in out if e["p"] < 5.0]
    check("keeps the inactive end", len(low) > 0,
          f"{len(low)} of {len(out)} below pKi 5")
    top_n = sorted(entries, key=lambda e: -e["p"])[:100]
    check("beats naive top-N, which keeps zero inactives",
          len([e for e in top_n if e["p"] < 5.0]) == 0 and len(low) > 0)

    small = entries[:10]
    check("no sampling below the cap", len(train_qsar.stratified_sample(small, 100)) == 10)

    # better-replicated, tighter measurements win inside a bin
    noisy = [{"s": "A", "p": 7.0, "_n": 1, "_spread": 3.0},
             {"s": "B", "p": 7.1, "_n": 9, "_spread": 0.1}]
    picked = train_qsar.stratified_sample(noisy, 1)
    check("prefers well-replicated points in a bin", picked[0]["s"] == "B")


# ---------------------------------------------------------------- model

def make_dataset():
    """Several scaffolds with substituents, so scaffold grouping is meaningful."""
    subs = ["", "C", "CC", "CCC", "F", "Cl", "Br", "O", "N", "C(F)(F)F",
            "C#N", "[N+](=O)[O-]", "C(C)C", "OC", "S", "CO", "CCO", "C(=O)C"]
    cores = [
        "CC(=O)Nc1ccc({x})cc1",
        "c1ccc({x})cc1",
        "O=C(O)c1ccc({x})cc1",
        "c1ccc(-c2ccc({x})cc2)cc1",
        "CC1(C)N(c2ccc({x})cc2)C(=O)NC1=O",
        "C1CCC({x})CC1",
    ]
    out = []
    for core in cores:
        for s in subs:
            out.append(core.format(x=s) if s else core.replace("({x})", ""))
    return out


def test_model():
    print("\nmodel fitting")
    try:
        from rdkit import Chem, RDLogger
        from rdkit.Chem import Descriptors
        RDLogger.DisableLog("rdApp.*")
    except ImportError:
        print("  skipped (RDKit not installed)")
        return
    try:
        import sklearn  # noqa: F401
    except ImportError:
        print("  skipped (scikit-learn not installed)")
        return

    entries = []
    for smi in make_dataset():
        mol = Chem.MolFromSmiles(smi)
        if mol is None:
            continue
        # a clean, learnable target so the machinery is what is under test
        p = 4.0 + 0.45 * Descriptors.MolLogP(mol) + 0.004 * Descriptors.MolWt(mol)
        entries.append({"s": smi, "p": round(min(12.0, max(2.0, p)), 3),
                        "n": smi, "c": "x", "note": ""})
    check("dataset built", len(entries) >= 50, f"{len(entries)} molecules")
    if len(entries) < 50:
        return

    work = pathlib.Path(tempfile.mkdtemp(prefix="qsar-test-"))

    # --- random split: should be accurate enough to trip the leakage warning
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        train_qsar.build_model(entries, work / "ar_model.pkl", scaffold_split=False)
    random_out = buf.getvalue()
    print("    " + " / ".join(l.strip() for l in random_out.splitlines()
                              if l.strip().startswith(("MAE", "RMSE", "R2", "OOB"))))

    check("model pickle written", (work / "ar_model.pkl").exists())
    with open(work / "ar_model.pkl", "rb") as fh:
        blob = pickle.load(fh)
    check("pickle carries model and metrics",
          "model" in blob and "metrics" in blob and blob["metrics"]["n"] == len(entries),
          f"n = {blob['metrics']['n']}")
    check("pickle records the feature recipe",
          blob["descriptor_names"] == train_qsar.DESCRIPTOR_NAMES
          and blob["fingerprint"]["n_bits"] == 2048,
          f"{len(blob['descriptor_names'])} descriptors + ECFP4")

    mae = blob["metrics"]["mae"]
    check("random-split metrics finite", math.isfinite(mae) and math.isfinite(
        blob["metrics"]["rmse"]), f"MAE {mae:.3f}")

    warned = "WARNING" in random_out and "leakage" in random_out
    if mae < 0.5:
        check("sub-0.5 MAE triggers the leakage warning", warned,
              f"MAE {mae:.3f} -> warning {'shown' if warned else 'MISSING'}")
        check("warning names the remedy", "--scaffold-split" in random_out)
    else:
        check("no spurious warning above 0.5 MAE", not warned, f"MAE {mae:.3f}")

    # --- scaffold split: same data, grouped by Murcko scaffold
    buf2 = io.StringIO()
    with contextlib.redirect_stdout(buf2):
        train_qsar.build_model(entries, work / "scaffold.pkl", scaffold_split=True)
    scaffold_out = buf2.getvalue()
    print("    " + " / ".join(l.strip() for l in scaffold_out.splitlines()
                              if l.strip().startswith(("MAE", "RMSE", "R2", "OOB"))))

    check("scaffold split runs", (work / "scaffold.pkl").exists())
    check("scaffold split is labelled as such",
          "scaffold-grouped" in scaffold_out, "cv name recorded")
    check("no leakage warning under scaffold split",
          "WARNING" not in scaffold_out)

    with open(work / "scaffold.pkl", "rb") as fh:
        sblob = pickle.load(fh)
    smae = sblob["metrics"]["mae"]
    check("scaffold MAE is the harsher number", smae >= mae,
          f"random {mae:.3f} -> scaffold {smae:.3f} (+{smae - mae:.3f})")

    # --- unparseable structures must not abort the run
    buf3 = io.StringIO()
    with contextlib.redirect_stdout(buf3):
        train_qsar.build_model(
            entries + [{"s": "not_a_smiles", "p": 7.0}],
            work / "robust.pkl", scaffold_split=False)
    check("bad SMILES skipped, not fatal",
          (work / "robust.pkl").exists() and "could not be featurised" in buf3.getvalue())

    # --- too small a set is refused rather than fitted
    buf4 = io.StringIO()
    with contextlib.redirect_stdout(buf4):
        train_qsar.build_model(entries[:10], work / "tiny.pkl", scaffold_split=False)
    check("refuses to fit under 50 molecules",
          not (work / "tiny.pkl").exists() and "too few" in buf4.getvalue())


def main():
    test_cleaning()
    test_consolidate()
    test_stratify()
    test_model()
    print(f"\n  pipeline: {PASS} passed, {FAIL} failed")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
