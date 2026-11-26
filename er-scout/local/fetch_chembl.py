#!/usr/bin/env python3
"""Pull measured ERalpha activities from ChEMBL and aggregate one row per molecule.

Target CHEMBL206 is human estrogen receptor alpha. Only exact-relation values
with a pChEMBL number survive; everything else (">", "<", flagged data) is
dropped rather than guessed at. One molecule can carry several assays, so the
median is taken and the spread kept, which is what the note column reports.

Output: assets/chembl_er.json  [{"n","s","p","c","note"}]
"""
import json, pathlib, statistics, sys, time, urllib.parse, urllib.request

BASE = "https://www.ebi.ac.uk/chembl/api/data/activity.json"
TARGET = "CHEMBL206"
TYPES = {"Ki", "IC50", "EC50", "Kd"}
UA = "er-scout-dataset-builder/1.0 (research tool; single-file HTML app)"
PAGE = 1000


def get(url):
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA,
                                                       "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as exc:                      # noqa: BLE001
            if attempt == 4:
                raise
            print("  retry %d: %s" % (attempt + 1, exc), file=sys.stderr)
            time.sleep(3 * (attempt + 1))


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
        rec = by_mol.setdefault(mid, {"smiles": smi, "vals": [], "types": set()})
        rec["vals"].append(float(pch))
        rec["types"].add(a["standard_type"])

    out = []
    for mid, rec in by_mol.items():
        vals = rec["vals"]
        p = round(statistics.median(vals), 3)
        if p < 4:
            continue
        band = ("strong binder" if p >= 8 else
                "binder" if p >= 6 else
                "weak" if p >= 5 else "non-binder")
        note = "ChEMBL %s; n=%d; %s" % (mid, len(vals), ",".join(sorted(rec["types"])))
        if len(vals) > 1:
            note += "; spread %.2f log" % (max(vals) - min(vals))
        out.append({"n": mid, "s": rec["smiles"], "p": p, "c": band, "note": note})

    out.sort(key=lambda e: -e["p"])
    dest = pathlib.Path(__file__).resolve().parent.parent / "web/assets/chembl_er.json"
    dest.write_text(json.dumps(out, separators=(",", ":")), encoding="utf8")
    print("molecules: %d -> %s" % (len(out), dest), file=sys.stderr)


if __name__ == "__main__":
    main()
