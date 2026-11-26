#!/usr/bin/env python3
"""Fold the Tox21 ERalpha screens into one table keyed by structure.

Four PubChem assays are used, two per direction, so that a compound active in
one cell line but not the other shows up as the disagreement it is:

  743077  agonist     ER-alpha BLA, summary (counter-screens folded in)
  743079  agonist     BG1 cell line
  743078  antagonist  ER-alpha BLA, summary
  743091  antagonist  BG1 cell line, summary

Each compound becomes one character per assay, in that order. The table is
keyed by the engine's structure hash, so a compound the user types as a SMILES
finds its screen result without a name having to match.

Usage: python3 build_tox21.py <csv_dir>
"""
import csv, json, pathlib, subprocess, sys, time, urllib.parse, urllib.request

HERE = pathlib.Path(__file__).resolve().parent
ASSETS = HERE.parent / "web/assets"
UA = "er-scout-dataset-builder/1.0 (research tool; single-file HTML app)"

ASSAYS = [
    ("743077", "agonist", "ERa-BLA", "작용제 요약 (대조 스크린 반영)"),
    ("743079", "agonist", "BG1", "작용제, BG1 세포주"),
    ("743078", "antagonist", "ERa-BLA", "길항제 요약 (대조 스크린 반영)"),
    ("743091", "antagonist", "BG1", "길항제 요약, BG1 세포주"),
]
# one character per assay position
CODES = {"0": "inactive", "1": "active agonist", "2": "active antagonist",
         "3": "inconclusive", "4": "cytotoxic", "9": "not tested"}
CHUNK = 180


def post(url, body):
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, data=body.encode(),
                                         headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read().decode()
        except Exception as exc:                      # noqa: BLE001
            if attempt == 4:
                raise
            print("  retry %d: %s" % (attempt + 1, exc), file=sys.stderr)
            time.sleep(3 * (attempt + 1))


def read_assay(path):
    out = {}
    with open(path, newline="", encoding="utf8") as fh:
        for row in csv.DictReader(fh):
            cid = (row.get("CID") or "").strip()
            if not cid:
                continue
            out[cid] = {
                "outcome": (row.get("Activity Outcome") or "").strip(),
                "uM": (row.get("Activity Value [uM]") or "").strip(),
            }
    return out


def main():
    csvdir = pathlib.Path(sys.argv[1])
    tables, order = {}, []
    for aid, mode, line, note in ASSAYS:
        tables[aid] = read_assay(csvdir / (aid + ".csv"))
        order.append(aid)
        print("%s: %d compounds" % (aid, len(tables[aid])), file=sys.stderr)

    cids = sorted({c for t in tables.values() for c in t})
    print("union: %d CIDs" % len(cids), file=sys.stderr)

    cache_path = HERE / "cache/cid_smiles.json"
    smiles = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    todo = [c for c in cids if c not in smiles]
    for k in range(0, len(todo), CHUNK):
        batch = todo[k:k + CHUNK]
        txt = post("https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/"
                   "property/ConnectivitySMILES/CSV", "cid=" + ",".join(batch))
        for row in csv.DictReader(txt.splitlines()):
            smiles[row["CID"]] = row.get("ConnectivitySMILES") or ""
        for b in batch:
            smiles.setdefault(b, "")
        if k % (CHUNK * 10) == 0:
            cache_path.write_text(json.dumps(smiles))
            print("  smiles %d/%d" % (k + len(batch), len(todo)), file=sys.stderr)
    cache_path.write_text(json.dumps(smiles))

    # structure hashes, computed by the same engine the browser runs
    usable = [c for c in cids if smiles.get(c)]
    proc = subprocess.run(["node", str(HERE / "hash_smiles.js")],
                          input="\n".join(smiles[c] for c in usable),
                          capture_output=True, text=True, check=True)
    hashes = {}
    bad = 0
    for cid, line in zip(usable, proc.stdout.strip().split("\n")):
        h = line.split("\t")[0]
        if h == "-":
            bad += 1
            continue
        hashes[cid] = h
    print("hashed %d, unparsed %d" % (len(hashes), bad), file=sys.stderr)

    calls, potency = {}, {}
    for cid, h in hashes.items():
        code = ""
        best = None
        for aid, mode, line, note in ASSAYS:
            rec = tables[aid].get(cid)
            if rec is None:
                code += "9"
                continue
            o = rec["outcome"].lower()
            if o == "active":
                code += "1" if mode == "agonist" else "2"
                if rec["uM"]:
                    try:
                        val = float(rec["uM"])
                        if best is None or val < best[0]:
                            best = (val, mode)
                    except ValueError:
                        pass
            elif o == "inactive":
                code += "0"
            elif o in ("inconclusive", "unspecified"):
                code += "3"
            elif o == "cytotoxic":
                code += "4"
            else:
                code += "3"
        # a hash can collide across stereoisomers and salts of one compound:
        # the stronger reading wins, so an active result is never hidden
        prev = calls.get(h)
        if prev is None or code.count("0") < prev.count("0"):
            calls[h] = code
        if best:
            prior = potency.get(h)
            if prior is None or best[0] < prior[0]:
                potency[h] = [round(best[0], 4), best[1]]

    out = {
        "source": "Tox21 / PubChem BioAssay, ER-alpha agonist and antagonist screens",
        "assays": [{"aid": a, "mode": m, "line": l, "note": n} for a, m, l, n in ASSAYS],
        "codes": CODES,
        "calls": calls,
        "potency": potency,
    }
    dest = ASSETS / "tox21_er.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf8")
    act = sum(1 for c in calls.values() if "1" in c or "2" in c)
    print("structures %d (%d with an active call) -> %s (%.0f KB)"
          % (len(calls), act, dest, dest.stat().st_size / 1024), file=sys.stderr)


if __name__ == "__main__":
    main()
