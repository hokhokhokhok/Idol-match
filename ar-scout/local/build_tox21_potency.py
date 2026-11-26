#!/usr/bin/env python3
"""Pull AC50 and efficacy out of the Tox21 AR screens.

Why. The tool had no efficacy axis at all. Everything it called an
antagonist meant "binds, and resembles things that antagonise", and the
rankings sorted by predicted pKi, which is affinity. Antagonist potency is
not affinity - bicalutamide binds AR about two orders of magnitude more
weakly than DHT and is the clinical antagonist.

These assays carry what was missing: AR Potency (uM), the concentration at
which the reporter signal moves, and AR Efficacy (%), how far it moves.
That is cellular potency and response size, measured, for every compound in
the screen.

They also carry the viability counter-screen, which makes a real
cytotoxicity correction possible instead of a yes/no flag. A compound whose
AR potency sits at or above the concentration where the cells start dying
is not demonstrating antagonism - it is demonstrating death. The margin
between the two is the number worth keeping.

    python3 build_tox21_potency.py --raw tox21_raw
"""

import argparse
import csv
import json
import pathlib
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parent / "web"

ASSAYS = [
    ("743053", "agonist", "BLA"),
    ("743054", "antagonist", "MDA-kb2"),
    ("743063", "antagonist", "BLA"),
]

KEY_JS = r"""
const AR = require(%(armodel)s);
const fs = require('fs');
const out = [];
for (const line of fs.readFileSync(%(infile)s, 'utf8').split('\n')) {
  if (!line) continue;
  const tab = line.indexOf('\t');
  const cid = line.slice(0, tab), smi = line.slice(tab + 1);
  try { out.push(cid + '\t' + AR.structureIdOf(AR.parseSmiles(smi))); }
  catch (err) { /* unparsable rows simply do not get a key */ }
}
fs.writeFileSync(%(outfile)s, out.join('\n'));
"""


def num(v):
    try:
        f = float(str(v).strip())
    except (TypeError, ValueError):
        return None
    return f if f == f else None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raw", type=pathlib.Path, default=HERE / "tox21_raw")
    ap.add_argument("--out", type=pathlib.Path,
                    default=WEB / "assets" / "tox21_potency.json")
    args = ap.parse_args()

    rows, smiles_of = {}, {}
    for aid, mode, line in ASSAYS:
        path = args.raw / ("aid_%s.csv" % aid)
        if not path.exists():
            raise SystemExit("missing %s" % path)
        kept = 0
        with open(path, newline="", encoding="utf-8", errors="replace") as fh:
            for row in csv.DictReader(fh):
                cid = (row.get("PUBCHEM_CID") or "").strip()
                smi = (row.get("PUBCHEM_EXT_DATASOURCE_SMILES") or "").strip()
                if not cid.isdigit() or not smi:
                    continue
                # MDA-kb2 reports "AR ..."; the two BLA screens are
                # ratiometric (460/530 beta-lactamase) and report "Ratio ..."
                pot = num(row.get("AR Potency (uM)"))
                if pot is None:
                    pot = num(row.get("Ratio Potency (uM)"))
                eff = num(row.get("AR Efficacy (%)"))
                if eff is None:
                    eff = num(row.get("Ratio Efficacy (%)"))
                vpot = num(row.get("Viability Potency (uM)"))
                if pot is None and eff is None:
                    continue              # nothing measurable to record
                smiles_of[cid] = smi
                rec = rows.setdefault(cid, {})
                rec[mode if mode == "agonist" else "ant_" + line] = {
                    "p": pot, "e": eff, "v": vpot}
                kept += 1
        print("  %s %-10s %-8s  %d rows with a value" % (aid, mode, line, kept))

    print("\ncompounds with any potency: %d" % len(rows))

    tmp = pathlib.Path(tempfile.mkdtemp(prefix="potency-"))
    infile, outfile, script = tmp / "in.tsv", tmp / "out.tsv", tmp / "key.js"
    infile.write_text("\n".join("%s\t%s" % (c, s) for c, s in smiles_of.items()),
                      encoding="utf-8")
    script.write_text(KEY_JS % {"armodel": json.dumps(str(WEB / "armodel.js")),
                                "infile": json.dumps(str(infile)),
                                "outfile": json.dumps(str(outfile))},
                      encoding="utf-8")
    proc = subprocess.run(["node", "--max-old-space-size=4096", str(script)],
                          capture_output=True, text=True)
    if proc.returncode:
        raise SystemExit("keying failed:\n" + proc.stderr[-2000:])
    keyed = {}
    for ln in outfile.read_text(encoding="utf-8").split("\n"):
        if not ln:
            continue
        cid, key = ln.split("\t")
        keyed[cid] = key

    out = {}
    for cid, rec in rows.items():
        key = keyed.get(cid)
        if not key:
            continue
        # Both antagonist-mode lines, kept apart.
        #
        # Picking whichever had the lower AC50 and calling it "the"
        # antagonist reading was wrong: resveratrol came out with an
        # antagonist-mode efficacy of +232%, apigenin +84%, butylparaben
        # +60% - all signal increases, reported under a label that says
        # antagonist. The two lines genuinely disagree for these
        # compounds, and that disagreement is the information. So each
        # line is recorded, and the one chosen as the headline is the one
        # that actually shows a decrease.
        lines = {}
        for name in ("ant_MDA-kb2", "ant_BLA"):
            r = rec.get(name)
            if not r or r.get("p") is None:
                continue
            lines[name.split("_")[1]] = r
        down = [(k, v) for k, v in lines.items()
                if v.get("e") is not None and v["e"] < 0]
        if down:
            k, v = min(down, key=lambda kv: kv[1]["p"])
        elif lines:
            k, v = min(lines.items(), key=lambda kv: kv[1]["p"])
        else:
            k, v = None, None
        best = dict(v, line=k) if v else None
        entry = {}
        if lines:
            entry["lines"] = {k: {"p": round(v["p"], 4),
                                  "e": None if v.get("e") is None else round(v["e"], 1),
                                  "v": None if v.get("v") is None else round(v["v"], 4)}
                              for k, v in lines.items()}
            entry["disagree"] = (len(lines) > 1 and
                                 len({(v.get("e") or 0) >= 0 for v in lines.values()}) > 1)
        if best:
            entry["ap"] = round(best["p"], 4)            # antagonist AC50, uM
            if best.get("e") is not None:
                entry["ae"] = round(best["e"], 1)        # efficacy, %
            if best.get("v") is not None:
                entry["vp"] = round(best["v"], 4)        # viability AC50, uM
                # how much room there is between antagonism and cell death
                entry["m"] = round(best["v"] / best["p"], 2) if best["p"] else None
            entry["l"] = best["line"]
        ago = rec.get("agonist")
        if ago and ago.get("p") is not None:
            entry["gp"] = round(ago["p"], 4)
            if ago.get("e") is not None:
                entry["ge"] = round(ago["e"], 1)
        if entry:
            out[key] = entry

    payload = {
        "source": "PubChem AID 743053 / 743054 / 743063 (Tox21 AR)",
        "fields": {
            "ap": "길항제 모드 AC50 (µM, 두 세포주 중 더 센 쪽)",
            "ae": "길항제 모드 효력 (%, 기준 작용제 신호를 얼마나 떨어뜨렸나)",
            "vp": "같은 웰의 세포생존 AC50 (µM)",
            "m": "vp / ap — 1보다 충분히 크지 않으면 길항이 아니라 세포독성",
            "gp": "작용제 모드 AC50 (µM)",
            "ge": "작용제 모드 효력 (%)",
            "l": "ap가 나온 세포주 (신호가 내려간 쪽을 우선)",
            "lines": "두 길항 세포주의 값을 각각 보관",
            "disagree": "두 세포주가 서로 반대 방향이면 true",
        },
        "data": out,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False,
                                   separators=(",", ":")), encoding="utf-8")
    print("keyed structures: %d" % len(out))
    print("wrote %s (%.0f KB)" % (args.out, args.out.stat().st_size / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
