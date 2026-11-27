#!/usr/bin/env python3
"""Re-run the resistance-mutant question as a controlled experiment.

Same crystal (2AM9), same box, same ligand preparation; the only thing that
differs between runs is one side chain. The wild type is re-docked here too
rather than reused, so every number in the comparison comes from one batch.

Scope is the 38 functionally labelled compounds, because that is the set the
published claim was made on.
"""

import json
import pathlib
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parent / "web"
sys.path.insert(0, str(HERE))
import ar_dock  # noqa: E402

RUNS = [("dock", "wt"), ("dock_t877a", "t877a"),
        ("dock_w741a", "w741a"), ("dock_w741l", "w741l")]
OUT = HERE / "insilico_mutant_scores.json"
SMINA = "/tmp/mm/env/bin/smina"

LIST_JS = r"""
const PR = require(%(predict)s);
const rows = [];
for (const t of PR.INGREDIENTS) {
  const cls = PR.FUNCTION_CLASS[t[1]];
  if (cls) rows.push({ name: t[1], smiles: t[2], cls: cls });
}
console.log(JSON.stringify(rows));
"""


def main() -> int:
    listing = subprocess.run(
        ["node", "-e", LIST_JS % {"predict": json.dumps(str(WEB / "predict.js"))}],
        capture_output=True, text=True)
    if listing.returncode != 0:
        raise SystemExit(listing.stderr)
    rows = json.loads(listing.stdout)
    print("labelled compounds: %d" % len(rows), flush=True)

    scores = {}
    if OUT.exists():
        scores = json.loads(OUT.read_text())
        print("resuming with %d compounds already recorded" % len(scores), flush=True)

    tmp = HERE / "_insilico_tmp"
    tmp.mkdir(exist_ok=True)
    total, done, started = len(rows) * len(RUNS), 0, time.time()
    for workdir, label in RUNS:
        box = json.loads((HERE / workdir / "box.json").read_text())
        receptor = HERE / workdir / "receptor.pdb"
        print("\n=== %s" % label, flush=True)
        for row in rows:
            done += 1
            entry = scores.setdefault(row["name"], {"cls": row["cls"]})
            if label in entry:
                continue
            try:
                ar_dock.ligand_to_sdf(row["smiles"], row["name"], tmp / "lig.sdf")
                got = ar_dock.run_smina(receptor, tmp / "lig.sdf",
                                        tmp / "out.sdf", box, SMINA)
                entry[label] = round(got[0], 2)
            except Exception as err:            # noqa: BLE001
                entry[label] = None
                print("   %s failed: %s" % (row["name"], err), flush=True)
            if done % 10 == 0:
                rate = (time.time() - started) / max(1, done)
                print("  %d/%d  %.1fs each, ~%.0f min left"
                      % (done, total, rate, rate * (total - done) / 60), flush=True)
                OUT.write_text(json.dumps(scores, indent=1))
    OUT.write_text(json.dumps(scores, indent=1))
    print("\nwrote %s" % OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
