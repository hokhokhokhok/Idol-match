#!/usr/bin/env python3
"""Fold the Tox21 androgen-receptor screen into the app as measured fact.

The gap this fills. Everything else in the tool is inference, and the answer
it gives most often - "this ingredient does not bind AR" - rested on almost
nothing: three of the 28 curated references are nominal 4.00 placeholders
rather than measurements, and the expanded ChEMBL library is only 5% below
pKi 5, because nobody publishes a negative result. Tox21 did: it ran ~10,000
compounds through AR agonist and antagonist reporters and recorded every
outcome, active or not, cosmetic ingredients among them.

So this is not another predictor. It is a lookup: if the queried compound
was actually tested, say what the assay found and stop guessing.

Three PubChem summary assays are used, the curated ones that already fold in
the counter-screens:

  743053  agonist mode,    BLA line,     autofluorescence counter-screened
  743054  antagonist mode, MDA-kb2 line, viability counter-screened
  743063  antagonist mode, BLA line,     viability counter-screened

The summary column distinguishes "inconclusive antagonist (cytotoxic)" from
a real antagonist call, which matters: antagonist-mode signal in a reporter
assay is confounded by anything that kills the cell, and reading those as
antiandrogens is a classic way to generate false positives.

    python3 build_tox21.py --raw <dir with aid_*.csv>
"""

import argparse
import csv
import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parent / "web"

ASSAYS = [
    ("743053", "agonist", "BLA", "자가형광 대조 스크린 반영"),
    ("743054", "antagonist", "MDA-kb2", "세포생존 대조 스크린 반영"),
    ("743063", "antagonist", "BLA", "세포생존 대조 스크린 반영"),
]

# one character per assay, in the order above
CODES = {
    "inactive": "0",
    "active agonist": "1",
    "active antagonist": "2",
    "cytotoxic": "4",
    "inconclusive": "3",
}

KEY_JS = r"""
const AR = require(%(armodel)s);
const fs = require('fs');
const lines = fs.readFileSync(%(infile)s, 'utf8').split('\n');
const out = [];
for (const line of lines) {
  if (!line) continue;
  const tab = line.indexOf('\t');
  const id = line.slice(0, tab), smiles = line.slice(tab + 1);
  try {
    const m = AR.parseSmiles(smiles);
    const d = AR.computeDescriptors(m);
    if (!(d.mw > 0) || d.heavy < 2) { out.push(id + '\t'); continue; }
    out.push(id + '\t' + AR.structureIdOf(m));
  } catch (err) { out.push(id + '\t'); }
}
fs.writeFileSync(%(outfile)s, out.join('\n'));
"""


def q(p):
    return json.dumps(str(p))


def classify(summary, outcome):
    s = (summary or "").strip().lower()
    if s == "inactive":
        return CODES["inactive"]
    if "cytotoxic" in s:
        return CODES["cytotoxic"]
    if s.startswith("active agonist"):
        return CODES["active agonist"]
    if s.startswith("active antagonist"):
        return CODES["active antagonist"]
    if s.startswith("inconclusive"):
        return CODES["inconclusive"]
    o = (outcome or "").strip().lower()
    if o == "inactive":
        return CODES["inactive"]
    if o == "active":
        return CODES["inconclusive"]
    return CODES["inconclusive"]


# the keying step above already emits the app's own structure id, so that a
# browser lookup needs no crypto and no async
def short(key):
    return key


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", type=pathlib.Path, required=True,
                    help="directory holding aid_743053.csv and the other two")
    ap.add_argument("--out", type=pathlib.Path,
                    default=WEB / "assets" / "tox21_ar.json")
    args = ap.parse_args()

    # smiles -> {aid: code}
    calls, smiles_of = {}, {}
    for aid, mode, line, _ in ASSAYS:
        path = args.raw / ("aid_%s.csv" % aid)
        if not path.exists():
            raise SystemExit("missing %s" % path)
        n = 0
        with open(path, newline="", encoding="utf-8", errors="replace") as fh:
            for row in csv.DictReader(fh):
                cid = (row.get("PUBCHEM_CID") or "").strip()
                smi = (row.get("PUBCHEM_EXT_DATASOURCE_SMILES") or "").strip()
                if not cid.isdigit() or not smi:
                    continue
                code = classify(row.get("Activity Summary"),
                                row.get("PUBCHEM_ACTIVITY_OUTCOME"))
                calls.setdefault(cid, {})[aid] = code
                smiles_of[cid] = smi
                n += 1
        print("  %s  %s %-8s  %d rows" % (aid, mode, line, n))

    print("\ndistinct compounds: %d" % len(smiles_of))

    # structure keys through the app's own parser, so a lookup matches
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="tox21-"))
    infile, outfile, script = tmp / "in.tsv", tmp / "out.tsv", tmp / "key.js"
    infile.write_text("\n".join("%s\t%s" % (cid, smi)
                                for cid, smi in smiles_of.items()), encoding="utf-8")
    script.write_text(KEY_JS % {"armodel": q(WEB / "armodel.js"),
                                "infile": q(infile), "outfile": q(outfile)},
                      encoding="utf-8")
    proc = subprocess.run(["node", "--max-old-space-size=4096", str(script)],
                          capture_output=True, text=True)
    if proc.returncode != 0:
        raise SystemExit("keying failed:\n" + proc.stderr[-2000:])

    keyed, unparsed = {}, 0
    for line in outfile.read_text(encoding="utf-8").split("\n"):
        if not line:
            continue
        cid, _, key = line.partition("\t")
        if not key:
            unparsed += 1
            continue
        keyed[cid] = key
    print("parsed by the app's engine: %d (%.0f%%), unreadable %d"
          % (len(keyed), 100.0 * len(keyed) / max(1, len(smiles_of)), unparsed))

    # collapse to structure, dropping structures whose records disagree
    table, collisions = {}, 0
    for cid, key in keyed.items():
        code = "".join(calls.get(cid, {}).get(aid, "9") for aid, _, _, _ in ASSAYS)
        h = short(key)
        if h in table and table[h] != code:
            collisions += 1
            # keep the more informative record (fewer "not tested" slots)
            if table[h].count("9") <= code.count("9"):
                continue
        table[h] = code
    print("distinct structures: %d (%d records disagreed and were reconciled)"
          % (len(table), collisions))

    tally = {}
    for code in table.values():
        for i, (aid, mode, line, _) in enumerate(ASSAYS):
            tally.setdefault(aid, {}).setdefault(code[i], 0)
            tally[aid][code[i]] += 1
    rev = {v: k for k, v in CODES.items()}
    for aid, mode, line, _ in ASSAYS:
        parts = ["%s %d" % (rev.get(k, k), v) for k, v in sorted(tally[aid].items())]
        print("  %s %-10s %-8s  %s" % (aid, mode, line, ", ".join(parts)))

    payload = {
        "source": "Tox21 / PubChem BioAssay summary",
        "assays": [{"aid": aid, "mode": mode, "line": line, "note": note}
                   for aid, mode, line, note in ASSAYS],
        "codes": {v: k for k, v in CODES.items()},
        "calls": table,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print("\nwrote %s (%.0f KB)" % (args.out, args.out.stat().st_size / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
