#!/usr/bin/env python3
"""Test the agonist/antagonist call on compounds the tool has never seen.

Every figure quoted for the functional call - 32/38, 84% - is leave-one-out
over the 38 hand-curated references. Trying to validate it against Tox21
instead leaves 3 compounds once everything already used as a reference is
removed, which is no test at all.

But the Tox21 screens hold about 8000 compounds and the dictionary holds
206. The raw tables carry SMILES, so the rest of the screen is an external
set: unambiguous measured verdicts for structures that are in neither the
curated references, the measured read-across pool, nor the dictionary.

    python3 eval_function_external.py
"""

import csv
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parent / "web"
RAW = HERE / "tox21_raw"
ASSAYS = ["743053", "743054", "743063"]

EVAL_JS = r"""
const fs = require('fs');
const AR = require(%(armodel)s);
const PR = require(%(predict)s);
const tox = JSON.parse(fs.readFileSync(%(tox)s, 'utf8'));
PR.registerMeasured(tox);

const known = {};
for (const e of PR.INGREDIENTS) {
  try { known[AR.structureIdOf(AR.parseSmiles(e[2]))] = 1; } catch (err) {}
}
for (const e of PR.functionPool()) known[e.n] = 1;

const rows = JSON.parse(fs.readFileSync(%(infile)s, 'utf8'));
const out = { n: 0, skipped: 0, conf: {}, tiers: {}, wrong: [] };
for (const r of rows) {
  let mol;
  try { mol = AR.parseSmiles(r.s); } catch (err) { out.skipped++; continue; }
  const id = AR.structureIdOf(mol);
  if (known[id]) { out.skipped++; continue; }
  let call;
  try {
    call = PR.callFunction(AR.packFingerprint(AR.morganFingerprint(mol, 2)),
                           { motifs: AR.detectMotifs(mol) });
  } catch (err) { out.skipped++; continue; }
  out.n++;
  const key = r.v + '->' + call.label;
  out.conf[key] = (out.conf[key] || 0) + 1;
  out.tiers[call.tier] = (out.tiers[call.tier] || 0) + 1;
  if (call.label !== 'unknown' && call.label !== r.v && out.wrong.length < 25) {
    out.wrong.push(r.n + ' | ' + r.v + ' -> ' + call.label + ' (' + call.tier + ')');
  }
}
console.log(JSON.stringify(out));
"""

CODES = {"inactive": "0", "active agonist": "1", "active antagonist": "2",
         "cytotoxic": "4", "inconclusive": "3"}
MODES = ["agonist", "antagonist", "antagonist"]


def classify(summary, outcome):
    s = (summary or "").strip().lower()
    if "cytotox" in s:
        return "cytotoxic"
    if "inconclusive" in s:
        return "inconclusive"
    if "antagonist" in s and "active" in s:
        return "active antagonist"
    if "agonist" in s and "active" in s:
        return "active agonist"
    if "inactive" in s:
        return "inactive"
    o = (outcome or "").strip().lower()
    return {"active": "active agonist", "inactive": "inactive"}.get(o, "inconclusive")


def main() -> int:
    calls, smiles, names = {}, {}, {}
    for i, aid in enumerate(ASSAYS):
        with open(RAW / ("aid_%s.csv" % aid), newline="",
                  encoding="utf-8", errors="replace") as fh:
            for row in csv.DictReader(fh):
                cid = (row.get("PUBCHEM_CID") or "").strip()
                smi = (row.get("PUBCHEM_EXT_DATASOURCE_SMILES") or "").strip()
                if not cid.isdigit() or not smi:
                    continue
                calls.setdefault(cid, ["not tested"] * 3)[i] = classify(
                    row.get("Activity Summary"), row.get("PUBCHEM_ACTIVITY_OUTCOME"))
                smiles[cid] = smi
                names[cid] = "CID " + cid

    rows = []
    for cid, c in calls.items():
        ago = any(c[j] == "active agonist" and MODES[j] == "agonist" for j in range(3))
        ant = any(c[j] == "active antagonist" and MODES[j] == "antagonist"
                  for j in range(3))
        if ago and not ant:
            v = "agonist"
        elif ant and not ago:
            v = "antagonist"
        else:
            continue                      # ambiguous or inactive: no ground truth
        rows.append({"n": names[cid], "s": smiles[cid], "v": v})
    print("unambiguous Tox21 verdicts: %d" % len(rows))

    tmp = HERE / "_extern.json"
    tmp.write_text(json.dumps(rows), encoding="utf-8")
    script = HERE / "_extern.js"
    script.write_text(EVAL_JS % {
        "armodel": json.dumps(str(WEB / "armodel.js")),
        "predict": json.dumps(str(WEB / "predict.js")),
        "tox": json.dumps(str(WEB / "assets" / "tox21_ar.json")),
        "infile": json.dumps(str(tmp))}, encoding="utf-8")
    proc = subprocess.run(["node", "--max-old-space-size=4096", str(script)],
                          capture_output=True, text=True)
    if proc.returncode:
        raise SystemExit(proc.stderr[-3000:])
    res = json.loads(proc.stdout)

    print("evaluated %d, skipped %d (unparsable or already a reference)"
          % (res["n"], res["skipped"]))
    print("tiers: %s" % res["tiers"])
    print("confusion: %s" % res["conf"])
    called = sum(v for k, v in res["conf"].items() if not k.endswith("->unknown"))
    right = sum(v for k, v in res["conf"].items()
                if k.split("->")[0] == k.split("->")[1])
    anta = sum(v for k, v in res["conf"].items() if k.startswith("antagonist"))
    total = sum(res["conf"].values())
    if called:
        print("\nof the %d it was willing to call, %d right (%.0f%%)"
              % (called, right, 100.0 * right / called))
    print("always answering 'antagonist': %d/%d (%.0f%%)"
          % (anta, total, 100.0 * anta / max(1, total)))
    # per-class recall and the base rate on the subset it was willing to
    # call, which is the only fair comparison: "always answer antagonist"
    truth = {}
    for k, v in res["conf"].items():
        if k.endswith("->unknown"):
            continue
        truth[k.split("->")[0]] = truth.get(k.split("->")[0], 0) + v
    base = max(truth.values()) / called if called else 0
    recall = {t: res["conf"].get(t + "->" + t, 0) / n for t, n in truth.items()}
    bal = sum(recall.values()) / max(1, len(recall))
    print("base rate on that subset (always antagonist): %.0f%%" % (100 * base))
    print("per-class recall: %s"
          % ", ".join("%s %.0f%%" % (k, 100 * v) for k, v in recall.items()))
    print("balanced accuracy: %.0f%%" % (100 * bal))

    out = {
        "source": "Tox21 AID 743053/743054/743063, compounds absent from every "
                  "reference set used by the tool",
        "n_total": res["n"], "n_called": called, "n_abstained": res["n"] - called,
        "accuracy": round(right / called, 4) if called else None,
        "base_rate": round(base, 4),
        "recall": {k: round(v, 4) for k, v in recall.items()},
        "balanced_accuracy": round(bal, 4),
        "confusion": res["conf"], "tiers": res["tiers"],
    }
    (HERE / "external_function_eval.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\nwrote external_function_eval.json")

    print("\nexamples it got wrong:")
    for w in res["wrong"][:12]:
        print("   " + w)
    tmp.unlink(missing_ok=True)
    script.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
