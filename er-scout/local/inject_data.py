#!/usr/bin/env python3
"""Write the generated data blocks into web/predict.js and key the crystal
poses by structure.

Three blocks are generated: the default reference library (the curated subset
of assets/er_reference.json), the name dictionary, and the functional class
map. Keeping them generated means the Korean names, the SMILES and the pKi
values all trace back to the resolver in build_reference.py rather than being
re-typed here.
"""
import json, pathlib, re, subprocess, sys

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parent / "web"
ASSETS = WEB / "assets"

# PDB ligand code -> the dictionary entry whose structure it is
POSE_BY_NAME = {
    "EST": "ESTRADIOL",
    "GEN": "GENISTEIN",
    "OHT": "AFIMOXIFENE",
    "RAL": "RALOXIFENE",
}


def block(text, name, body):
    pattern = re.compile(
        r"(/\* " + name + r":BEGIN[^\n]*\n).*?(/\* " + name + r":END \*/)",
        re.S)
    if not pattern.search(text):
        raise SystemExit("marker %s not found in predict.js" % name)
    return pattern.sub(lambda m: m.group(1) + body + "\n" + m.group(2), text)


def main():
    lib = json.loads((ASSETS / "er_reference.json").read_text())
    names = json.loads((ASSETS / "er_names.json").read_text())
    curated_src = json.loads((HERE / "curated.json").read_text())
    alias_by_name = {c["name"]: c.get("alias", []) for c in curated_src}
    ko_by_name = {c["name"]: c["ko"] for c in curated_src}

    curated = [e for e in lib if e.get("curated")]
    ref_rows = []
    for e in curated:
        row = {"n": e["n"], "en": e.get("en", ""), "p": e["p"], "c": e["c"],
               "s": e["s"], "note": e["note"], "curated": True}
        if e.get("floor"):
            row["floor"] = True
        ref_rows.append(row)
    ref_body = "var REFERENCE_DEFAULT = " + json.dumps(
        ref_rows, ensure_ascii=False, indent=2) + ";"

    ing_rows = []
    for e in names:
        aliases = []
        for key, al in alias_by_name.items():
            if ko_by_name.get(key) == e["n"] and al:
                aliases = al
        row = [e["n"], e["en"], e["s"]]
        if aliases:
            row.append(aliases)
        ing_rows.append(row)
    ing_body = "var INGREDIENTS = " + json.dumps(
        ing_rows, ensure_ascii=False, indent=1) + ";"

    fn = {}
    for e in curated:
        if e["c"] in ("agonist", "antagonist", "partial") and e.get("en"):
            fn[e["en"]] = e["c"]
    fn_body = "var FUNCTION_CLASS = " + json.dumps(
        fn, ensure_ascii=False, indent=2) + ";"

    path = WEB / "predict.js"
    text = path.read_text()
    text = block(text, "REFERENCE", ref_body)
    text = block(text, "INGREDIENTS", ing_body)
    text = block(text, "FUNCTION", fn_body)
    path.write_text(text)
    print("predict.js: %d reference entries, %d dictionary names, %d function labels"
          % (len(ref_rows), len(ing_rows), len(fn)), file=sys.stderr)

    # --- give each crystal pose the SMILES of the compound it is
    scene = json.loads((ASSETS / "pocket_scene.json").read_text())
    by_en = {e["en"]: e["s"] for e in names}
    pdb_ligands = {}
    cache = HERE / "cache/pdb_ligands.json"
    if cache.exists():
        pdb_ligands = json.loads(cache.read_text())
    resolved = 0
    for pose in scene["poses"]:
        smi = None
        want = POSE_BY_NAME.get(pose["lig"])
        if want and want in by_en:
            smi = by_en[want]
            pose["n"] = pose.get("n") or want
        elif pose["lig"] in pdb_ligands:
            smi = pdb_ligands[pose["lig"]]["smiles"]
        if smi:
            pose["s"] = smi
            resolved += 1
    # the structure hash, from the same engine the browser uses
    smiles_list = [p.get("s", "") for p in scene["poses"] if p.get("s")]
    if smiles_list:
        proc = subprocess.run(["node", str(HERE / "hash_smiles.js")],
                              input="\n".join(smiles_list),
                              capture_output=True, text=True, check=True)
        out = proc.stdout.strip().split("\n")
        k = 0
        for pose in scene["poses"]:
            if not pose.get("s"):
                continue
            h, formula = (out[k].split("\t") + [""])[:2]
            k += 1
            if h != "-":
                pose["key"] = h
                pose["formula"] = formula
    (ASSETS / "pocket_scene.json").write_text(
        json.dumps(scene, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    print("pocket_scene.json: %d of %d poses carry a structure"
          % (resolved, len(scene["poses"])), file=sys.stderr)
    for pose in scene["poses"]:
        print("  %-5s %-4s %-11s %-14s %s" % (pose["pdb"], pose["lig"], pose["conf"],
                                              pose.get("formula", "-"),
                                              (pose.get("n") or "")[:40]), file=sys.stderr)


if __name__ == "__main__":
    main()
