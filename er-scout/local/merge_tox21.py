#!/usr/bin/env python3
"""Merge the per-receptor Tox21 tables into one.

Each table was keyed by the same 16-character structure hash, and there are
now six of them, so five copies of that key list were riding along for
nothing - about 800 KB of the bundle. Here the keys are stored once and each
receptor contributes a string array aligned to them, which the page turns
back into a lookup on load.

Output: web/assets/tox21.json
"""
import json, pathlib, sys

HERE = pathlib.Path(__file__).resolve().parent
ASSETS = HERE.parent / "web/assets"

PANELS = [
    ("er", "tox21_er.json"),
    ("pparg", "tox21_pparg.json"),
    ("gr", "tox21_gr.json"),
    ("ar", "tox21_ar.json"),
    ("arom", "tox21_arom.json"),
]


def main():
    tables, meta = {}, {}
    for key, fname in PANELS:
        path = ASSETS / fname
        if not path.exists():
            print("missing %s, skipped" % fname, file=sys.stderr)
            continue
        d = json.loads(path.read_text())
        tables[key] = d
        meta[key] = {"source": d["source"], "assays": d["assays"],
                     "codes": d["codes"]}

    keys = sorted({h for d in tables.values() for h in d["calls"]})
    index = {h: i for i, h in enumerate(keys)}
    print("structures: %d across %d panels" % (len(keys), len(tables)), file=sys.stderr)

    calls, potency = {}, {}
    for key, d in tables.items():
        col = [""] * len(keys)
        for h, code in d["calls"].items():
            col[index[h]] = code
        calls[key] = col
        pot = d.get("potency") or {}
        potency[key] = {h: v for h, v in pot.items()}
        active = sum(1 for c in col if c and [ch for ch in c if ch in "125"])
        print("  %-6s %5d records, %4d with an active call, %4d with AC50"
              % (key, sum(1 for c in col if c), active, len(potency[key])),
              file=sys.stderr)

    out = {"keys": keys, "panels": meta, "calls": calls, "potency": potency}
    dest = ASSETS / "tox21.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf8")
    before = sum((ASSETS / f).stat().st_size for _, f in PANELS if (ASSETS / f).exists())
    print("-> %s (%.0f KB, was %.0f KB across %d files)"
          % (dest, dest.stat().st_size / 1024, before / 1024, len(tables)),
          file=sys.stderr)


if __name__ == "__main__":
    main()
