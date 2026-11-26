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
    # --- the dictionary also carries the adipocyte panel's compounds, so that
    # "로지글리타존" or "troglitazone" resolves to a structure. Korean spellings
    # are given for the ones a Korean user is likely to type; the rest are
    # searchable by their English name, which is what ChEMBL knows them as.
    KO = {
        "ROSIGLITAZONE": "로지글리타존", "PIOGLITAZONE": "피오글리타존",
        "TROGLITAZONE": "트로글리타존", "LOBEGLITAZONE": "로베글리타존",
        "FARGLITAZAR": "파글리타자르", "CIGLITAZONE": "시글리타존",
        "DEXAMETHASONE": "덱사메타손", "HYDROCORTISONE": "하이드로코르티손",
        "CORTISOL": "코르티솔", "PREDNISOLONE": "프레드니솔론",
        "BETAMETHASONE": "베타메타손", "TRIAMCINOLONE": "트리암시놀론",
        "FLUTICASONE": "플루티카손", "MOMETASONE": "모메타손",
        "CLOBETASOL PROPIONATE": "클로베타솔 프로피오네이트",
        "QUERCETIN": "쿠에르세틴", "KAEMPFEROL": "캠페롤",
        "RESVERATROL": "레스베라트롤", "BERBERINE": "베르베린",
        "CURCUMIN": "커큐민", "CAPSAICIN": "캡사이신",
        "EPIGALLOCATECHIN GALLATE": "에피갈로카테킨 갈레이트",
        "NOBILETIN": "노빌레틴", "TELMISARTAN": "텔미사르탄",
        "INDOMETHACIN": "인도메타신", "ROSUVASTATIN": "로수바스타틴",
        "GENISTEIN": "제니스테인", "DAIDZEIN": "다이드제인",
        "BISPHENOL A": "비스페놀 A",
    }
    extra = []
    seen_smiles = {r[2] for r in ing_rows}
    seen_names = {r[1].upper() for r in ing_rows}

    def add_extra(name, smiles):
        if not name or not smiles or smiles in seen_smiles:
            return
        up = name.upper()
        if up in seen_names or up.startswith("CHEMBL"):
            return
        seen_smiles.add(smiles)
        seen_names.add(up)
        ko = KO.get(up, name)
        extra.append([ko, name, smiles])

    for panel_file in ("panel_pparg.json", "panel_gr.json"):
        path = ASSETS / panel_file
        if not path.exists():
            continue
        pdata = json.loads(path.read_text())
        for idx, nm in (pdata.get("nm") or {}).items():
            try:
                add_extra(nm, pdata["rows"][int(idx)][0])
            except (IndexError, ValueError):
                pass
    adipo_path = ASSETS / "adipo_pheno.json"
    if adipo_path.exists():
        for rec in json.loads(adipo_path.read_text())["records"].values():
            if rec.get("s"):
                add_extra(rec["n"].title(), rec["s"])

    ing_rows = ing_rows + extra
    print("dictionary: %d ER names + %d adipocyte-panel names"
          % (len(ing_rows) - len(extra), len(extra)), file=sys.stderr)

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
