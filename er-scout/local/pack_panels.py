#!/usr/bin/env python3
"""Pack the secondary-receptor libraries small enough to ship.

The ERalpha library keeps its long provenance notes because the reference tab
shows them. The PPARgamma and GR libraries are read-across fodder only - the
panel reports a neighbour's name, its pKi and the similarity - so they travel
as [smiles, pKi, assay_count] rows with a sparse name map, which is less than
half the size of the full records.

Output: web/assets/panel_pparg.json, panel_gr.json
"""
import json, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
ASSETS = HERE.parent / "web/assets"

PANELS = [
    ("chembl_pparg.json", "panel_pparg.json", "CHEMBL235", "PPARγ"),
    ("chembl_gr.json", "panel_gr.json", "CHEMBL2034", "GR"),
]


def main():
    names = {}
    cache = HERE / "cache/names.json"
    if cache.exists():
        names = json.loads(cache.read_text())
    for src, out, target, label in PANELS:
        lib = json.loads((ASSETS / src).read_text())
        rows, nm = [], {}
        for e in lib:
            m = re.search(r"n=(\d+)", e.get("note", ""))
            n_assays = int(m.group(1)) if m else 1
            row = [e["s"], e["p"]]
            if n_assays > 1:
                row.append(n_assays)
            name = (names.get(e["n"]) or {}).get("name")
            if name:
                nm[str(len(rows))] = name.title()
            rows.append(row)
        packed = {"t": target, "label": label, "rows": rows, "nm": nm}
        dest = ASSETS / out
        dest.write_text(json.dumps(packed, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf8")
        print("%-18s %5d rows, %4d named -> %s (%.0f KB, was %.0f KB)"
              % (target, len(rows), len(nm), out, dest.stat().st_size / 1024,
                 (ASSETS / src).stat().st_size / 1024), file=sys.stderr)


if __name__ == "__main__":
    main()
