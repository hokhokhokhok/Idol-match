#!/usr/bin/env python3
"""Pull measured activities for one receptor from ChEMBL, one row per molecule.

Only exact-relation values with a pChEMBL number survive; everything else
(">", "<", flagged data) is dropped rather than guessed at. One molecule can
carry several assays, so the median is taken and the spread kept, which is
what the note column reports.

Usage: python3 fetch_chembl.py [target_chembl_id] [out_name]
  defaults: CHEMBL206 (human ERalpha) -> assets/chembl_er.json

  CHEMBL206   estrogen receptor alpha
  CHEMBL235   peroxisome proliferator-activated receptor gamma
  CHEMBL2034  glucocorticoid receptor
"""
import json, pathlib, statistics, sys, time, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/chembl/api/data/activity.json"
TARGET = sys.argv[1] if len(sys.argv) > 1 else "CHEMBL206"
OUT = sys.argv[2] if len(sys.argv) > 2 else "chembl_er.json"
TYPES = {"Ki", "IC50", "EC50", "Kd"}
UA = "er-scout-dataset-builder/1.0 (research tool; single-file HTML app)"
PAGE = 1000


def get(url):
    # ChEMBL answers 500 or stalls under load often enough that a short
    # backoff loses whole runs; this waits it out instead.
    for attempt in range(12):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA,
                                                       "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)
        except Exception as exc:                      # noqa: BLE001
            if attempt == 11:
                raise
            wait = min(60, 5 * (attempt + 1))
            print("  retry %d in %ds: %s" % (attempt + 1, wait, str(exc)[:60]),
                  file=sys.stderr)
            time.sleep(wait)


def fetch_all():
    rows, offset = [], 0
    while True:
        q = urllib.parse.urlencode({
            "target_chembl_id": TARGET,
            "pchembl_value__isnull": "false",
            "limit": PAGE,
            "offset": offset,
        })
        page = get(BASE + "?" + q)
        acts = page.get("activities", [])
        rows.extend(acts)
        total = page.get("page_meta", {}).get("total_count")
        print("  %d/%s" % (len(rows), total), file=sys.stderr)
        offset += PAGE
        if not acts or (total is not None and len(rows) >= total):
            break
    return rows


def main():
    raw = fetch_all()
    print("activities: %d" % len(raw), file=sys.stderr)
    # Binding and functional numbers are different quantities and mixing them
    # into one median was wrong: a competitive-binding Ki and a reporter EC50
    # for the same compound routinely differ by a log, because the cell assay
    # carries uptake, metabolism and amplification that the binding assay does
    # not. They are aggregated separately and the binding value leads.
    BINDING = {"Ki", "Kd", "IC50"}
    FUNCTIONAL = {"EC50"}
    by_mol = {}
    for a in raw:
        if a.get("standard_relation") != "=":
            continue
        if a.get("data_validity_comment"):
            continue
        if a.get("standard_type") not in TYPES:
            continue
        if a.get("target_organism") not in (None, "Homo sapiens"):
            continue
        smi = a.get("canonical_smiles")
        pch = a.get("pchembl_value")
        mid = a.get("molecule_chembl_id")
        if not (smi and pch and mid):
            continue
        if "." in smi:                 # salts and mixtures: no single structure
            continue
        rec = by_mol.setdefault(mid, {"smiles": smi, "vals": [], "types": set(),
                                      "binding": [], "functional": []})
        rec["vals"].append(float(pch))
        rec["types"].add(a["standard_type"])
        if a["standard_type"] in BINDING:
            rec["binding"].append(float(pch))
        elif a["standard_type"] in FUNCTIONAL:
            rec["functional"].append(float(pch))

    out = []
    for mid, rec in by_mol.items():
        vals = rec["vals"]
        binding = rec["binding"]
        functional = rec["functional"]
        # the value the model is fitted to: binding where it exists
        p = round(statistics.median(binding if binding else vals), 3)
        if p < 4:
            continue
        band = ("strong binder" if p >= 8 else
                "binder" if p >= 6 else
                "weak" if p >= 5 else "non-binder")
        note = "ChEMBL %s; n=%d; %s" % (mid, len(vals), ",".join(sorted(rec["types"])))
        if len(vals) > 1:
            note += "; spread %.2f log" % (max(vals) - min(vals))
        row = {"n": mid, "s": rec["smiles"], "p": p, "c": band, "note": note}
        if binding:
            row["pB"] = round(statistics.median(binding), 3)
            row["nB"] = len(binding)
        if functional:
            row["pF"] = round(statistics.median(functional), 3)
            row["nF"] = len(functional)
        if binding and functional:
            gap = row["pF"] - row["pB"]
            if abs(gap) >= 1.0:
                row["note"] += "; 결합과 기능값이 %.1f log 차이" % gap
        out.append(row)

    out.sort(key=lambda e: -e["p"])
    dest = pathlib.Path(__file__).resolve().parent.parent / ("web/assets/" + OUT)
    dest.write_text(json.dumps(out, separators=(",", ":")), encoding="utf8")
    print("molecules: %d -> %s" % (len(out), dest), file=sys.stderr)


if __name__ == "__main__":
    main()
