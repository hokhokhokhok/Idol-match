#!/usr/bin/env python3
"""Recover where each pKi in the reference library actually came from.

The library carried 28 affinities with no record of assay, species or
source - they were treated as one scale and an MAE was quoted against them.
A reviewer is entitled to ask whether rat AR data is mixed in with human,
and the honest answer was "nobody wrote it down".

This asks ChEMBL directly: resolve each reference by structure, pull its
activities against any androgen-receptor target, and report the organism
and assay type behind the numbers. It writes web/assets/reference_prov.json.
"""

import json
import pathlib
import subprocess
import sys
import time
import urllib.parse
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parent / "web"
BASE = "https://www.ebi.ac.uk/chembl/api/data"
OUT = WEB / "assets" / "reference_prov.json"


def get(path, **params):
    url = BASE + path + "?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=45) as fh:
                return json.loads(fh.read().decode())
        except Exception as err:                     # noqa: BLE001
            if attempt == 3:
                raise
            time.sleep(2 * (attempt + 1))
    return None


def references():
    js = ("const PR = require(%s);"
          "console.log(JSON.stringify(PR.REFERENCE_DEFAULT));"
          % json.dumps(str(WEB / "predict.js")))
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True)
    if out.returncode:
        raise SystemExit(out.stderr)
    return json.loads(out.stdout)


def main() -> int:
    refs = references()
    print("references: %d" % len(refs), flush=True)
    rows = {}
    for i, ref in enumerate(refs, 1):
        name = ref["n"]
        rec = {"n": name, "p": ref["p"], "chembl": None,
               "activities": [], "organisms": {}, "types": {}, "error": None}
        try:
            hit = get("/molecule.json", pref_name__iexact=name.split(" (")[0],
                      limit=1)
            mols = hit.get("molecules", []) if hit else []
            if not mols:
                sm = get("/molecule.json",
                         molecule_structures__canonical_smiles__flexmatch=ref["s"],
                         limit=1)
                mols = sm.get("molecules", []) if sm else []
            if not mols:
                rec["error"] = "ChEMBL에서 찾지 못함"
            else:
                cid = mols[0]["molecule_chembl_id"]
                rec["chembl"] = cid
                acts = get("/activity.json", molecule_chembl_id=cid,
                           target_organism__isnull="false",
                           standard_type__in="Ki,IC50,Kd,EC50", limit=200)
                for a in (acts or {}).get("activities", []):
                    tname = (a.get("target_pref_name") or "")
                    if "androgen" not in tname.lower():
                        continue
                    org = a.get("target_organism") or "?"
                    typ = a.get("standard_type") or "?"
                    rec["organisms"][org] = rec["organisms"].get(org, 0) + 1
                    rec["types"][typ] = rec["types"].get(typ, 0) + 1
                    if len(rec["activities"]) < 6:
                        rec["activities"].append({
                            "type": typ, "value": a.get("standard_value"),
                            "units": a.get("standard_units"), "organism": org,
                            "assay": (a.get("assay_description") or "")[:160],
                            "doc": a.get("document_chembl_id")})
        except Exception as err:                     # noqa: BLE001
            rec["error"] = str(err)[:120]
        rows[name] = rec
        print("  %2d/%d  %-34s %-14s org=%s"
              % (i, len(refs), name[:34], rec["chembl"] or "-",
                 ",".join(rec["organisms"]) or "none"), flush=True)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    allorg = {}
    for r in rows.values():
        for o, n in r["organisms"].items():
            allorg[o] = allorg.get(o, 0) + n
    print("\norganisms across all AR activities: %s" % allorg)
    print("wrote %s" % OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
