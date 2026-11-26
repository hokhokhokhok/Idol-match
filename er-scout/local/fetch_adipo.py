#!/usr/bin/env python3
"""Collect adipocyte-phenotype measurements from ChEMBL.

Receptor activity is one step removed from the thing the question is about.
These assays are the thing itself: preadipocytes put through a differentiation
protocol, with the readout being lipid accumulated (Oil red O, triglyceride) or
a differentiation marker. A compound that shows up here has been measured doing
- or blocking - what the receptor panels only predict.

Direction matters and is read off the assay description: "Induction of
adipocyte differentiation ..." and "Inhibition of adipocyte differentiation ..."
are opposite results from the same kind of experiment, so the two are counted
separately and a compound that has both is reported as having both.

Output: web/assets/adipo_pheno.json, keyed by the engine's structure hash.
"""
import json, pathlib, re, subprocess, sys, time, urllib.parse, urllib.request

HERE = pathlib.Path(__file__).resolve().parent
ASSETS = HERE.parent / "web/assets"
UA = "er-scout-dataset-builder/1.0 (research tool; single-file HTML app)"
BASE = "https://www.ebi.ac.uk/chembl/api/data"

# assay descriptions worth reading, and the cell systems that make them
# adipocyte experiments rather than something else that stores lipid
TOPIC = re.compile(r"adipocyte|adipogen|lipid accumulation|oil red|oil-red|"
                   r"triglyceride accumulation|lipid droplet", re.I)
SYSTEM = re.compile(r"3t3[- ]?l1|st-?13|c3h10t1|10t1/2|hmsc|mesenchymal|"
                    r"preadipocyte|adipocyte", re.I)
UP = re.compile(r"\b(induction|increase|stimulation|promotion|enhancement|"
                r"upregulation|accumulation of lipid|activation)\b", re.I)
DOWN = re.compile(r"\b(inhibition|suppression|reduction|decrease|blockade|"
                  r"downregulation|prevention|attenuation)\b", re.I)


def get(url, tries=5):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA,
                                                       "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as exc:                      # noqa: BLE001
            if attempt == tries - 1:
                print("  give up: %s" % str(exc)[:70], file=sys.stderr)
                return None
            time.sleep(2 * (attempt + 1))


def find_assays():
    """Assay ids whose description is an adipocyte differentiation readout."""
    seen = {}
    for phrase in ["adipocyte differentiation", "adipogenesis", "lipid accumulation",
                   "oil red", "preadipocyte differentiation", "3T3-L1"]:
        offset = 0
        while True:
            q = urllib.parse.urlencode({
                "description__icontains": phrase, "limit": 1000, "offset": offset})
            page = get(BASE + "/assay.json?" + q)
            if not page:
                break
            rows = page.get("assays", [])
            for a in rows:
                desc = a.get("description") or ""
                if not (TOPIC.search(desc) and SYSTEM.search(desc)):
                    continue
                up, down = bool(UP.search(desc)), bool(DOWN.search(desc))
                if up == down:          # ambiguous or neither: not usable
                    continue
                seen[a["assay_chembl_id"]] = {
                    "desc": desc, "dir": "induces" if up else "inhibits",
                    "organism": a.get("assay_organism"),
                }
            total = page.get("page_meta", {}).get("total_count") or 0
            offset += 1000
            print("  %-28s %d/%d  kept %d" % (phrase, min(offset, total), total,
                                              len(seen)), file=sys.stderr)
            if offset >= total or not rows:
                break
    return seen


def activities_for(assay_ids):
    """Measured points on those assays, in chunks."""
    out = []
    ids = list(assay_ids)
    for k in range(0, len(ids), 20):
        chunk = ids[k:k + 20]
        offset = 0
        while True:
            q = urllib.parse.urlencode({
                "assay_chembl_id__in": ",".join(chunk), "limit": 1000, "offset": offset})
            page = get(BASE + "/activity.json?" + q)
            if not page:
                break
            rows = page.get("activities", [])
            out.extend(rows)
            total = page.get("page_meta", {}).get("total_count") or 0
            offset += 1000
            if offset >= total or not rows:
                break
        if k % 200 == 0:
            print("  activities %d/%d assays, %d points" % (k + len(chunk), len(ids),
                                                            len(out)), file=sys.stderr)
    return out


def main():
    cache = HERE / "cache/adipo_assays.json"
    if cache.exists():
        assays = json.loads(cache.read_text())
    else:
        assays = find_assays()
        cache.write_text(json.dumps(assays))
    print("adipocyte assays: %d" % len(assays), file=sys.stderr)

    acache = HERE / "cache/adipo_activities.json"
    if acache.exists():
        acts = json.loads(acache.read_text())
    else:
        acts = activities_for(assays)
        acache.write_text(json.dumps(acts))
    print("activity points: %d" % len(acts), file=sys.stderr)

    by_mol = {}
    for a in acts:
        aid = a.get("assay_chembl_id")
        meta = assays.get(aid)
        smi = a.get("canonical_smiles")
        mid = a.get("molecule_chembl_id")
        if not (meta and smi and mid) or "." in smi:
            continue
        rec = by_mol.setdefault(mid, {"s": smi, "induces": 0, "inhibits": 0,
                                      "uM": None, "desc": None, "org": meta["organism"]})
        rec[meta["dir"]] += 1
        if rec["desc"] is None:
            rec["desc"] = meta["desc"]
        val, unit = a.get("standard_value"), a.get("standard_units")
        if val and unit == "nM":
            try:
                um = float(val) / 1000.0
                if rec["uM"] is None or um < rec["uM"]:
                    rec["uM"] = round(um, 4)
            except ValueError:
                pass

    mols = [(m, r) for m, r in by_mol.items() if r["induces"] or r["inhibits"]]
    print("molecules with a direction: %d" % len(mols), file=sys.stderr)

    proc = subprocess.run(["node", str(HERE / "hash_smiles.js")],
                          input="\n".join(r["s"] for _, r in mols),
                          capture_output=True, text=True, check=True)
    lines = proc.stdout.strip().split("\n")

    # names, so the panel can say which compound the record belongs to
    names = {}
    ids = [m for m, _ in mols]
    for k in range(0, len(ids), 40):
        q = urllib.parse.urlencode({"molecule_chembl_id__in": ",".join(ids[k:k + 40]),
                                    "only": "molecule_chembl_id,pref_name", "limit": 40})
        page = get(BASE + "/molecule.json?" + q)
        for m in (page or {}).get("molecules", []):
            if m.get("pref_name"):
                names[m["molecule_chembl_id"]] = m["pref_name"]

    table, dropped = {}, 0
    for (mid, rec), line in zip(mols, lines):
        h = line.split("\t")[0]
        if h == "-":
            dropped += 1
            continue
        row = {"n": names.get(mid, mid), "i": rec["induces"], "x": rec["inhibits"]}
        # the structure travels only for records that carry a real name: those
        # are the ones the name dictionary can offer the user, and 700 extra
        # SMILES strings for unnamed screening compounds would not earn their
        # place in the bundle
        if mid in names:
            row["s"] = rec["s"]
        if rec["uM"] is not None:
            row["uM"] = rec["uM"]
        prev = table.get(h)
        if prev:
            row["i"] += prev["i"]
            row["x"] += prev["x"]
            if prev.get("uM") is not None and (row.get("uM") is None or
                                               prev["uM"] < row["uM"]):
                row["uM"] = prev["uM"]
            if prev["n"] and not names.get(mid):
                row["n"] = prev["n"]
        table[h] = row

    out = {
        "source": "ChEMBL assay descriptions matching an adipocyte differentiation "
                  "or lipid-accumulation readout",
        "assays": len(assays),
        "records": table,
    }
    dest = ASSETS / "adipo_pheno.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf8")
    ind = sum(1 for r in table.values() if r["i"] and not r["x"])
    inh = sum(1 for r in table.values() if r["x"] and not r["i"])
    both = sum(1 for r in table.values() if r["x"] and r["i"])
    print("structures %d (induce only %d, inhibit only %d, both %d, unparsed %d)"
          " -> %s (%.0f KB)"
          % (len(table), ind, inh, both, dropped, dest, dest.stat().st_size / 1024),
          file=sys.stderr)


if __name__ == "__main__":
    main()
