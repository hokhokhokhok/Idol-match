#!/usr/bin/env python3
"""Resolve the curated ERalpha reference set against ChEMBL and merge it with
the bulk aggregate.

Nothing here is hand-typed chemistry: each curated compound is looked up by
name in ChEMBL, and its structure and its activity against CHEMBL206 (human
ERalpha) both come back from there. A compound that cannot be resolved, or
that has no measured value, is reported and left out of the read-across
library rather than filled in from memory.

Output: web/assets/er_reference.json
"""
import json, pathlib, re, statistics, sys, time, urllib.parse, urllib.request

HERE = pathlib.Path(__file__).resolve().parent
ASSETS = HERE.parent / "web/assets"
UA = "er-scout-dataset-builder/1.0 (research tool; single-file HTML app)"
TARGET = "CHEMBL206"
TYPES = {"Ki", "IC50", "EC50", "Kd"}


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def get(url):
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA,
                                                       "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as exc:                      # noqa: BLE001
            if attempt == 4:
                print("  give up: %s" % exc, file=sys.stderr)
                return None
            time.sleep(2 * (attempt + 1))


def search_molecule(name, aliases=()):
    for candidate in [name] + list(aliases):
        hit = _search_one(candidate)
        if hit:
            return hit
    return None


def _search_one(name):
    q = urllib.parse.urlencode({"q": name, "limit": 25})
    page = get("https://www.ebi.ac.uk/chembl/api/data/molecule/search.json?" + q)
    if not page:
        return None
    want = norm(name)
    best = None
    for m in page.get("molecules", []):
        struct = (m.get("molecule_structures") or {})
        smi = struct.get("canonical_smiles")
        if not smi or "." in smi:
            continue
        names = [m.get("pref_name")] + [s.get("synonyms") for s in (m.get("molecule_synonyms") or [])]
        if any(norm(n) == want for n in names if n):
            cand = {"id": m["molecule_chembl_id"], "smiles": smi,
                    "pref": m.get("pref_name"), "exact": True}
            if m.get("pref_name") and norm(m["pref_name"]) == want:
                return cand
            best = best or cand
    return best


def activities_for(mol_id):
    q = urllib.parse.urlencode({
        "target_chembl_id": TARGET, "molecule_chembl_id": mol_id,
        "pchembl_value__isnull": "false", "limit": 1000,
    })
    page = get("https://www.ebi.ac.uk/chembl/api/data/activity.json?" + q)
    if not page:
        return [], set()
    vals, types = [], set()
    for a in page.get("activities", []):
        if a.get("standard_relation") != "=" or a.get("data_validity_comment"):
            continue
        if a.get("standard_type") not in TYPES:
            continue
        vals.append(float(a["pchembl_value"]))
        types.add(a["standard_type"])
    return vals, types


def main():
    bulk = json.loads((ASSETS / "chembl_er.json").read_text())
    by_id = {e["n"]: e for e in bulk}
    names = json.loads((HERE / "cache/names.json").read_text())
    by_name = {}
    for cid, rec in names.items():
        if rec.get("name"):
            by_name.setdefault(norm(rec["name"]), cid)

    curated_in = json.loads((HERE / "curated.json").read_text())
    cache_path = HERE / "cache/curated_resolved.json"
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}

    curated, missing, dictionary = [], [], []
    for entry in curated_in:
        key = entry["name"]
        if key in cache:
            hit = cache[key]
        else:
            cid = by_name.get(norm(key))
            hit = None
            if cid and cid in by_id:
                hit = {"id": cid, "smiles": by_id[cid]["s"], "pref": names[cid]["name"]}
            else:
                hit = search_molecule(key, entry.get("alias", []))
            if hit:
                vals, types = ([], set())
                if hit["id"] in by_id:
                    agg = by_id[hit["id"]]
                    hit["p"] = agg["p"]
                    hit["src"] = agg["note"]
                    for k in ("pB", "nB", "pF", "nF"):
                        if k in agg:
                            hit[k] = agg[k]
                else:
                    vals, types = activities_for(hit["id"])
                    if vals:
                        hit["p"] = round(statistics.median(vals), 3)
                        hit["src"] = "ChEMBL %s; n=%d; %s" % (
                            hit["id"], len(vals), ",".join(sorted(types)))
                        if len(vals) > 1:
                            hit["src"] += "; spread %.2f log" % (max(vals) - min(vals))
                    else:
                        hit["p"] = None
                        hit["src"] = "ChEMBL %s; ERa 정량값 없음" % hit["id"]
            cache[key] = hit
            cache_path.write_text(json.dumps(cache, ensure_ascii=False))
        if not hit:
            missing.append((key, "ChEMBL에서 찾지 못함"))
            continue
        dictionary.append({"n": entry["ko"], "en": hit.get("pref") or key,
                           "s": hit["smiles"], "note": entry.get("note", "")})
        if entry.get("dict_only"):
            continue
        if hit.get("p") is None:
            # A compound nobody has measured against ERalpha cannot carry a
            # number here. The negative controls are the one exception: their
            # floor is marked as a floor, not passed off as a measurement.
            if entry.get("floor"):
                curated.append({
                    "n": entry["ko"], "en": hit.get("pref") or key, "s": hit["smiles"],
                    "p": entry["floor"], "c": entry["c"],
                    "note": entry["note"] + " · ERa 결합 보고 없음, pKi %.1f은 측정값이 아닌 하한선"
                            % entry["floor"],
                    "curated": True, "floor": True,
                })
                continue
            missing.append((key, hit.get("src", "정량값 없음")))
            continue
        row = {
            "n": entry["ko"], "en": hit.get("pref") or key, "s": hit["smiles"],
            "p": hit["p"], "c": entry["c"],
            "note": entry["note"] + " · " + hit["src"],
            "curated": True,
        }
        for k in ("pB", "nB", "pF", "nF"):
            if k in hit:
                row[k] = hit[k]
        curated.append(row)

    print("%-26s %-14s %-6s %s" % ("curated", "chembl", "pKi", "class"), file=sys.stderr)
    for e in curated:
        m = re.search(r"CHEMBL\d+", e["note"])
        print("%-26s %-14s %-6.2f %s" % (e["en"][:26], m.group(0) if m else "-",
                                         e["p"], e["c"]), file=sys.stderr)
    for name, why in missing:
        print("MISSING %-22s %s" % (name, why), file=sys.stderr)

    curated_ids = set()
    for e in curated:
        m = re.search(r"CHEMBL\d+", e["note"])
        if m:
            curated_ids.add(m.group(0))
    merged = list(curated)
    for e in bulk:
        if e["n"] in curated_ids:
            continue
        nm = names.get(e["n"], {}).get("name")
        row = {"n": nm.title() if nm else e["n"], "s": e["s"], "p": e["p"],
               "c": e["c"], "note": e["note"]}
        for k in ("pB", "nB", "pF", "nF"):
            if k in e:
                row[k] = e[k]
        merged.append(row)

    out = ASSETS / "er_reference.json"
    out.write_text(json.dumps(merged, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf8")
    dict_out = ASSETS / "er_names.json"
    seen, rows = set(), []
    for e in dictionary:
        if e["s"] in seen:
            continue
        seen.add(e["s"])
        rows.append(e)
    dict_out.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf8")
    print("curated %d, library %d -> %s (%.0f KB); dictionary %d -> %s"
          % (len(curated), len(merged), out, out.stat().st_size / 1024,
             len(rows), dict_out), file=sys.stderr)


if __name__ == "__main__":
    main()
