#!/usr/bin/env python3
"""Merge the ChEMBL reference set into the curated 28 for the web app.

Replacing the curated library with ChEMBL outright is a bad trade: the AR
data there is 94% aromatic medicinal-chemistry series, so DHT ends up with a
nearest neighbour of 0.34 and falls out of the applicability domain.
Appending instead keeps both, but naively appending is also wrong, because
20 of the 28 curated structures already appear in ChEMBL and 8 of those
disagree by more than 0.5 log. Left as duplicates, read-across would average
two contradictory values for one structure and the nearest-neighbour report
would show whichever copy sorted first.

So: deduplicate on structure (formula plus Morgan fingerprint, which is how
the engine itself compares, and is blind to stereochemistry the same way).
Curated entries win collisions - they are hand-picked literature consensus
and they are what the tool's published accuracy is measured against.
Duplicates inside ChEMBL collapse to their median.

    python3 merge_library.py --chembl qsar/ar_reference.json \\
                             --out qsar/ar_reference_merged.json
"""

import argparse
import json
import pathlib
import statistics
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parent / "web"

PROBE = r"""
const AR = require(%(armodel)s);
const PR = require(%(predict)s);
const fs = require('fs');
const chembl = JSON.parse(fs.readFileSync(%(chembl)s, 'utf8'));
const curated = PR.libraryAsJson();

function key(s) {
  try {
    const m = AR.parseSmiles(s);
    const d = AR.computeDescriptors(m);
    const fp = AR.morganFingerprint(m, 2);
    let bits = '';
    for (let i = 0; i < fp.length; i++) if (fp[i]) bits += i + ',';
    return d.formula + '|' + bits;
  } catch (err) { return null; }
}
const out = { curated: [], chembl: [] };
for (const e of curated) out.curated.push({ e: e, k: key(e.s) });
for (const e of chembl) out.chembl.push({ e: e, k: key(e.s) });
fs.writeFileSync(%(outfile)s, JSON.stringify(out));
"""


def q(p):
    return json.dumps(str(p))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--chembl", type=pathlib.Path,
                    default=HERE / "qsar" / "ar_reference.json")
    ap.add_argument("--out", type=pathlib.Path,
                    default=HERE / "qsar" / "ar_reference_merged.json")
    args = ap.parse_args()

    if not args.chembl.exists():
        raise SystemExit("no ChEMBL library at %s - run train_qsar.py first" % args.chembl)

    tmp = args.out.parent / "_keys.json"
    args.out.parent.mkdir(parents=True, exist_ok=True)
    script = args.out.parent / "_probe.js"
    script.write_text(PROBE % {
        "armodel": q(WEB / "armodel.js"), "predict": q(WEB / "predict.js"),
        "chembl": q(args.chembl), "outfile": q(tmp),
    }, encoding="utf-8")
    proc = subprocess.run(["node", str(script)], capture_output=True, text=True)
    script.unlink(missing_ok=True)
    if proc.returncode != 0:
        raise SystemExit("keying failed:\n" + proc.stderr)
    keyed = json.loads(tmp.read_text(encoding="utf-8"))
    tmp.unlink(missing_ok=True)

    merged, seen = [], {}
    for row in keyed["curated"]:
        entry, k = row["e"], row["k"]
        entry["src"] = "curated"
        merged.append(entry)
        if k:
            seen[k] = entry

    # group remaining ChEMBL entries by structure
    groups = {}
    unkeyed = 0
    for row in keyed["chembl"]:
        entry, k = row["e"], row["k"]
        if not k:
            unkeyed += 1
            continue
        groups.setdefault(k, []).append(entry)

    collided, internal_dupes, added = 0, 0, 0
    for k, entries in groups.items():
        if k in seen:
            collided += len(entries)
            continue
        if len(entries) > 1:
            internal_dupes += len(entries) - 1
            median = statistics.median(e["p"] for e in entries)
            pick = min(entries, key=lambda e: abs(e["p"] - median))
            pick = dict(pick)
            pick["p"] = round(median, 3)
            pick["note"] = (pick.get("note", "") +
                            "; %d duplicate structures merged to the median"
                            % len(entries))
        else:
            pick = dict(entries[0])
        pick["src"] = "chembl"
        merged.append(pick)
        added += 1

    payload = [{"n": e["n"], "s": e["s"], "p": e["p"], "c": e.get("c", ""),
                "note": e.get("note", "")} for e in merged]
    args.out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    print("curated entries kept          %d" % len(keyed["curated"]))
    print("ChEMBL entries added          %d" % added)
    print("  dropped, already curated    %d" % collided)
    print("  collapsed, duplicate inside %d" % internal_dupes)
    if unkeyed:
        print("  skipped, unparseable        %d" % unkeyed)
    print("merged library                %d entries -> %s (%.0f KB)"
          % (len(payload), args.out, args.out.stat().st_size / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
