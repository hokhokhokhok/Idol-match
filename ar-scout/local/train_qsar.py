#!/usr/bin/env python3
"""Pull androgen-receptor activity data from ChEMBL and build two artefacts.

  ar_reference.json  the web app's reference library, widened from the 28
                     hand-curated entries to a few thousand measured points
  ar_model.pkl       a RandomForest regressor over RDKit descriptors + ECFP4

Usage
-----
    python3 train_qsar.py                       # fetch, clean, build both
    python3 train_qsar.py --cache               # reuse the raw JSON on disk
    python3 train_qsar.py --skip-model          # reference library only
    python3 train_qsar.py --max-ref 1000
    python3 train_qsar.py --scaffold-split      # Murcko-grouped evaluation

Only the model step needs RDKit and scikit-learn; the reference library can
be built with the standard library plus requests.
"""

import argparse
import json
import math
import pathlib
import statistics
import sys
import time
from collections import defaultdict

try:
    import requests
except ImportError:  # pragma: no cover
    requests = None

TARGET = "CHEMBL1871"  # human androgen receptor
ENDPOINT = "https://www.ebi.ac.uk/chembl/api/data/activity.json"
PAGE_SIZE = 1000
ACCEPTED_TYPES = ("Ki", "IC50", "Kd", "EC50")

# A relation other than these means the measurement was censored - the true
# value lies somewhere beyond the reported number. Averaging censored and
# exact points together quietly biases the whole set, so they are dropped.
ACCEPTED_RELATIONS = {"=", "~", None, ""}

P_MIN, P_MAX = 2.0, 12.0
BIN_WIDTH = 0.5

HERE = pathlib.Path(__file__).resolve().parent

DESCRIPTOR_NAMES = [
    "MolWt", "MolLogP", "TPSA", "NumHDonors", "NumHAcceptors",
    "NumRotatableBonds", "RingCount", "NumAromaticRings",
    "FractionCSP3", "HeavyAtomCount", "MolMR", "LabuteASA",
]


# --------------------------------------------------------------- fetching

def fetch_activities(cache_path: pathlib.Path, use_cache: bool) -> list:
    if use_cache and cache_path.exists():
        print("reading cached activities from %s" % cache_path)
        return json.loads(cache_path.read_text(encoding="utf-8"))

    if requests is None:
        raise SystemExit("requests is not installed: pip install -r requirements.txt")

    records, offset = [], 0
    while True:
        params = {
            "target_chembl_id": TARGET,
            "limit": PAGE_SIZE,
            "offset": offset,
        }
        payload = _get_with_retry(ENDPOINT, params)
        page = payload.get("activities", [])
        records.extend(page)
        total = payload.get("page_meta", {}).get("total_count")
        print("  fetched %d / %s" % (len(records), total if total is not None else "?"))
        if not page or len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
        if total is not None and offset >= total:
            break

    cache_path.write_text(json.dumps(records), encoding="utf-8")
    print("cached %d raw activities to %s" % (len(records), cache_path))
    return records


def _get_with_retry(url: str, params: dict, attempts: int = 3) -> dict:
    delay = 2.0
    last = None
    for i in range(attempts):
        try:
            resp = requests.get(url, params=params, timeout=60)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:  # network, HTTP or JSON failure
            last = exc
            if i == attempts - 1:
                break
            print("  retry %d/%d after %.0fs (%s)" % (i + 1, attempts - 1, delay, exc))
            time.sleep(delay)
            delay *= 2
    raise SystemExit("ChEMBL request failed after %d attempts: %s" % (attempts, last))


# --------------------------------------------------------------- cleaning

def to_pchembl(record: dict):
    """pChEMBL as reported, else derived from a nanomolar standard_value."""
    raw = record.get("pchembl_value")
    if raw not in (None, ""):
        try:
            return float(raw)
        except (TypeError, ValueError):
            pass
    if record.get("standard_units") != "nM":
        return None
    value = record.get("standard_value")
    if value in (None, ""):
        return None
    try:
        nm = float(value)
    except (TypeError, ValueError):
        return None
    if nm <= 0:
        return None
    return 9.0 - math.log10(nm)


def clean(records: list):
    kept = defaultdict(list)
    drops = defaultdict(int)

    for rec in records:
        if rec.get("standard_type") not in ACCEPTED_TYPES:
            drops["type"] += 1
            continue
        if rec.get("standard_relation") not in ACCEPTED_RELATIONS:
            drops["censored relation"] += 1
            continue
        if rec.get("data_validity_comment"):
            drops["validity comment"] += 1
            continue
        smiles = rec.get("canonical_smiles")
        if not smiles:
            drops["no structure"] += 1
            continue
        p = to_pchembl(rec)
        if p is None:
            drops["no usable value"] += 1
            continue
        if not (P_MIN <= p <= P_MAX):
            drops["out of range"] += 1
            continue
        kept[smiles].append((p, rec.get("molecule_chembl_id") or "", rec.get("standard_type")))

    print("\ncleaning")
    for reason, n in sorted(drops.items(), key=lambda kv: -kv[1]):
        print("  dropped %6d  %s" % (n, reason))
    print("  kept    %6d measurements on %d distinct structures"
          % (sum(len(v) for v in kept.values()), len(kept)))
    return kept


def consolidate(kept: dict) -> list:
    """Median per structure; the spread is kept so it can be read later."""
    out = []
    for smiles, points in kept.items():
        values = [p for p, _, _ in points]
        median = statistics.median(values)
        spread = max(values) - min(values)
        chembl_id = points[0][1]
        types = sorted({t for _, _, t in points if t})
        note = "ChEMBL %s; n=%d; %s" % (chembl_id, len(values), ",".join(types))
        if len(values) > 1:
            note += "; spread %.2f log" % spread
        out.append({
            "n": chembl_id or smiles[:24],
            "s": smiles,
            "p": round(median, 3),
            "c": classify(median),
            "note": note,
            "_spread": spread,
            "_n": len(values),
        })
    return out


def classify(p: float) -> str:
    if p >= 8.0:
        return "strong binder"
    if p >= 6.5:
        return "binder"
    if p >= 5.0:
        return "weak"
    return "non-binder"


def stratified_sample(entries: list, cap: int) -> list:
    """Even coverage across 0.5-log bins.

    Taking the top N instead would leave a library of actives only, and a
    model trained on actives cannot tell you that something is inactive -
    which is the question this tool is actually asked.
    """
    if len(entries) <= cap:
        return sorted(entries, key=lambda e: -e["p"])

    bins = defaultdict(list)
    for e in entries:
        bins[int(e["p"] / BIN_WIDTH)].append(e)
    for key in bins:
        # inside a bin prefer well-replicated, tightly agreeing measurements
        bins[key].sort(key=lambda e: (-e["_n"], e["_spread"]))

    chosen, keys = [], sorted(bins)
    idx = 0
    while len(chosen) < cap:
        progressed = False
        for key in keys:
            if idx < len(bins[key]):
                chosen.append(bins[key][idx])
                progressed = True
                if len(chosen) >= cap:
                    break
        if not progressed:
            break
        idx += 1

    print("  stratified %d -> %d across %d bins of %.1f log"
          % (len(entries), len(chosen), len(keys), BIN_WIDTH))
    return sorted(chosen, key=lambda e: -e["p"])


def write_reference(entries: list, path: pathlib.Path) -> None:
    payload = [
        {"n": e["n"], "s": e["s"], "p": e["p"], "c": e["c"], "note": e["note"]}
        for e in entries
    ]
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    print("wrote %s (%d entries)" % (path, len(payload)))
    print("  paste this into the web app's 레퍼런스 라이브러리 tab, or upload it")


# ------------------------------------------------------------------ model

def build_model(entries: list, out_path: pathlib.Path, scaffold_split: bool) -> None:
    try:
        from rdkit import Chem, RDLogger
        from rdkit.Chem import Descriptors, rdFingerprintGenerator
        from rdkit.Chem.Scaffolds import MurckoScaffold
        import numpy as np
        from sklearn.ensemble import RandomForestRegressor
        from sklearn.model_selection import KFold, GroupKFold, cross_val_predict
        from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
        import pickle
    except ImportError as exc:
        print("\nskipping model: %s" % exc)
        print("  pip install -r requirements.txt")
        return

    RDLogger.DisableLog("rdApp.*")
    gen = rdFingerprintGenerator.GetMorganGenerator(radius=2, fpSize=2048)

    X, y, groups, failed = [], [], [], 0
    for e in entries:
        mol = Chem.MolFromSmiles(e["s"])
        if mol is None:
            failed += 1
            continue
        try:
            desc = [getattr(Descriptors, name)(mol) for name in DESCRIPTOR_NAMES]
        except Exception:
            failed += 1
            continue
        if any(v is None or not math.isfinite(float(v)) for v in desc):
            failed += 1
            continue
        fp = np.frombuffer(bytes(gen.GetFingerprintAsNumPy(mol)), dtype=np.uint8)
        X.append(np.concatenate([np.array(desc, dtype=np.float64), fp.astype(np.float64)]))
        y.append(e["p"])
        try:
            groups.append(MurckoScaffold.MurckoScaffoldSmiles(mol=mol) or "")
        except Exception:
            groups.append("")

    if failed:
        print("\n  %d structures could not be featurised" % failed)
    if len(X) < 50:
        print("  too few usable structures (%d) to fit a model" % len(X))
        return

    X = np.vstack(X)
    y = np.asarray(y, dtype=np.float64)
    print("\nmodel matrix: %d molecules x %d features" % X.shape)

    model = RandomForestRegressor(
        n_estimators=500, min_samples_leaf=2, max_features="sqrt",
        oob_score=True, n_jobs=-1, random_state=42,
    )

    if scaffold_split:
        n_groups = len(set(groups))
        n_splits = min(5, n_groups)
        if n_splits < 2:
            print("  only %d scaffold group(s); falling back to KFold" % n_groups)
            cv, cv_name = KFold(n_splits=5, shuffle=True, random_state=42), "random 5-fold"
            cv_groups = None
        else:
            cv = GroupKFold(n_splits=n_splits)
            cv_name = "scaffold-grouped %d-fold" % n_splits
            cv_groups = groups
    else:
        cv, cv_name = KFold(n_splits=5, shuffle=True, random_state=42), "random 5-fold"
        cv_groups = None

    print("cross-validating (%s)..." % cv_name)
    pred = cross_val_predict(model, X, y, cv=cv, groups=cv_groups, n_jobs=None)
    mae = mean_absolute_error(y, pred)
    rmse = math.sqrt(mean_squared_error(y, pred))
    r2 = r2_score(y, pred)
    print("  MAE  %.3f log" % mae)
    print("  RMSE %.3f log" % rmse)
    print("  R2   %.3f" % r2)

    if mae < 0.5 and not scaffold_split:
        print("\n  WARNING: MAE %.3f is below 0.5 log." % mae)
        print("  Assay reproducibility alone is about +-0.5 log, so a random")
        print("  split scoring better than that is a leakage signal, not a good")
        print("  model: analogues from one congeneric series land on both sides")
        print("  of the split and the model is rewarded for recognising the")
        print("  series rather than for predicting affinity.")
        print("  Re-run with --scaffold-split to evaluate on unseen scaffolds.")

    model.fit(X, y)
    oob = getattr(model, "oob_score_", None)
    if oob is not None:
        print("  OOB R2 %.3f" % oob)

    with open(out_path, "wb") as fh:
        pickle.dump({
            "model": model,
            "descriptor_names": DESCRIPTOR_NAMES,
            "fingerprint": {"type": "ECFP4", "radius": 2, "n_bits": 2048},
            "metrics": {"mae": mae, "rmse": rmse, "r2": r2, "cv": cv_name,
                        "n": int(len(y))},
        }, fh)
    print("wrote %s" % out_path)


# ------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cache", action="store_true",
                    help="reuse chembl_ar_raw.json instead of refetching")
    ap.add_argument("--skip-model", action="store_true",
                    help="build the reference library only")
    ap.add_argument("--max-ref", type=int, default=2500,
                    help="cap on reference library entries (default 2500)")
    ap.add_argument("--scaffold-split", action="store_true",
                    help="evaluate with Murcko-scaffold GroupKFold")
    ap.add_argument("--outdir", type=pathlib.Path, default=HERE)
    args = ap.parse_args()

    args.outdir.mkdir(parents=True, exist_ok=True)
    raw = fetch_activities(args.outdir / "chembl_ar_raw.json", args.cache)
    print("\n%d raw activity records for %s" % (len(raw), TARGET))

    kept = clean(raw)
    if not kept:
        raise SystemExit("nothing survived cleaning - check the target id")

    entries = consolidate(kept)
    multi = [e for e in entries if e["_n"] > 1]
    if multi:
        spreads = sorted(e["_spread"] for e in multi)
        print("  %d structures have replicates; median spread %.2f log, "
              "90th percentile %.2f log"
              % (len(multi), spreads[len(spreads) // 2],
                 spreads[int(len(spreads) * 0.9)]))

    entries = stratified_sample(entries, args.max_ref)
    write_reference(entries, args.outdir / "ar_reference.json")

    if not args.skip_model:
        build_model(entries, args.outdir / "ar_model.pkl", args.scaffold_split)
    return 0


if __name__ == "__main__":
    sys.exit(main())
