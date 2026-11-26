#!/usr/bin/env python3
"""Attach ChEMBL preferred names to the aggregated molecules.

The activity endpoint gives ids and structures but no names, so the molecule
endpoint is asked in chunks. Most screening compounds have no preferred name;
those keep their ChEMBL id, which is what the reference table then shows.
"""
import json, pathlib, sys, time, urllib.parse, urllib.request

HERE = pathlib.Path(__file__).resolve().parent
UA = "er-scout-dataset-builder/1.0 (research tool; single-file HTML app)"
CHUNK = 40


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


def main():
    lib = json.loads((HERE.parent / "web/assets/chembl_er.json").read_text())
    ids = [e["n"] for e in lib]
    cache_path = HERE / "cache/names.json"
    names = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    todo = [i for i in ids if i not in names]
    print("%d molecules, %d to look up" % (len(ids), len(todo)), file=sys.stderr)
    for k in range(0, len(todo), CHUNK):
        batch = todo[k:k + CHUNK]
        q = urllib.parse.urlencode({
            "molecule_chembl_id__in": ",".join(batch),
            "only": "molecule_chembl_id,pref_name,max_phase",
            "limit": CHUNK,
        })
        page = get("https://www.ebi.ac.uk/chembl/api/data/molecule.json?" + q)
        for m in page.get("molecules", []):
            names[m["molecule_chembl_id"]] = {
                "name": m.get("pref_name"),
                "phase": m.get("max_phase"),
            }
        for b in batch:
            names.setdefault(b, {"name": None, "phase": None})
        if k % (CHUNK * 10) == 0:
            cache_path.write_text(json.dumps(names))
            print("  %d/%d" % (k + len(batch), len(todo)), file=sys.stderr)
    cache_path.write_text(json.dumps(names))
    named = sum(1 for v in names.values() if v.get("name"))
    print("named: %d/%d" % (named, len(names)), file=sys.stderr)


if __name__ == "__main__":
    main()
