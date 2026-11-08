"""앱 DB(정시 반영식·모집인원 데이터)에서 블로그용 데이터를 만든다. 모든 값에 출처(요강·쪽)를 붙인다."""
from __future__ import annotations

from datetime import date
from pathlib import Path

import yaml

from engine.jeongsi_data import group_for, load

from .models import SV, Source

ROOT = Path(__file__).resolve().parent.parent
QUOTA = ROOT / "data" / "parsed" / "jeongsi_2027" / "quota_dept.yaml"
FULL = {"국": "국어", "수": "수학", "탐": "탐구", "영": "영어", "한국사": "한국사"}
METRIC_TXT = {"std": "표준점수", "pct": "백분위", "conv": "변환표준점수(대학 자체)", "std_max": "표준점수÷최고점"}


def available(dept: str) -> list[str]:
    q = yaml.safe_load(QUOTA.read_text(encoding="utf-8")) or {}
    return list((q.get(dept) or {}).keys())


def _log_url(univ: str, year: int) -> str:
    import csv
    with (ROOT / "data" / "download_log.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if (r["univ"], r["year"], r["kind"], r["doc"]) == (univ, str(year), "정시", "요강"):
                return r["url"]
    return ""


def _src(univ: str, name: str, url: str, page, year: int = 2027, kind: str = "공식") -> Source:
    return Source(doc=f"{name} {year}학년도 정시모집요강", url=url, collected_at=str(date.today()), page=str(page), kind=kind)


def _tables(formula: dict) -> tuple[dict | None, str, dict | None]:
    f = formula["best_of"][0] if "best_of" in formula else formula
    eng, mode, hist = None, "환산점수", None
    for p in f["parts"]:
        if p["area"] == "영" and p["metric"] == "grade_table":
            eng = {i + 1: v for i, v in enumerate(p["table"])}
    for p in f.get("post", []):
        tab = {i + 1: v for i, v in enumerate(p["table"])}
        if p["area"] == "영":
            eng, mode = tab, ("가산점" if p["op"] == "add" else "감점")
        if p["area"] == "한국사":
            sign = "" if p["op"] == "add" else "−"
            hist = {f"{g}등급": (f"{sign}{v:g}" if v else "0") for g, v in tab.items()}
            hist = {k: v for k, v in hist.items()}
    return eng, mode, hist


def build_overview(univ: str, dept: str) -> dict:
    groups, meta = load()
    m = meta[univ]
    g = group_for(univ, dept)
    q = yaml.safe_load(QUOTA.read_text(encoding="utf-8"))[dept][univ]
    url = m["source_url"]
    kind = "공식" if "negagea" not in url else "미러"
    S27 = _src(univ, m["name"], url, q["page"][2027], 2027, kind)
    url26 = _log_url(univ, 2026)
    S26 = Source(doc=f"{m['name']} 2026학년도 정시모집요강", url=url26, collected_at=str(date.today()),
                 page=str(q["page"][2026]), kind="공식" if "negagea" not in url26 else "미러")
    SF = _src(univ, m["name"], url, g.page, 2027, kind)
    st = "검증 필요"
    w = g.weights()
    eng, mode, hist = _tables(g.formula) if g.formula else (None, "", None)
    f0 = g.formula["best_of"][0] if g.formula and "best_of" in g.formula else (g.formula or {})
    metrics = sorted({METRIC_TXT.get(p["metric"], p["metric"]) for p in f0.get("parts", []) if p["area"] in ("국", "수", "탐")})
    j = {
        "group": SV(f"{q['group']}군", S27, st),
        "quota_2027": SV(q["quota"][2027], S27, st),
        "quota_2026": SV(q["quota"][2026], S26, st),
        "ratio": SV({FULL.get(k, k): v for k, v in w.items()}, SF, st, "만점 기여 비율로 계산(감점식 영어·한국사 제외)"),
        "formula_text": SV(g.text, SF, st),
        "score_index": SV(", ".join(metrics), SF, st),
    }
    if eng:
        j["eng_table"], j["eng_mode"] = SV(eng, SF, st), SV(mode, SF, st)
    if hist:
        j["hist_table"] = SV(hist, SF, st)
    rec = [n for n in m["notes"] if "학생부" in n]
    if rec:
        j["record_reflect"] = SV(rec[0], SF, st)
    return {"univ": {"id": univ, "name": m["name"]}, "program": {"name": SV(q["unit"].split()[-1], S27, st)},
            "jeongsi": j, "past": [], "insights": [], "data_snapshot_date": str(date.today())}


def build_compare(univs: list[str], dept: str) -> dict:
    groups, meta = load()
    out = {"dept": dept, "schools": [], "data_snapshot_date": str(date.today())}
    for u in univs:
        d = build_overview(u, dept)
        g = group_for(u, dept)
        w = g.weights()
        ranked = "국·수(우수)" in w
        if ranked:         # 성균관대 순위 가중치는 비교 차트에서 국·수 평균으로 표시
            hi, lo = w.pop("국·수(우수)"), w.pop("국·수(나머지)")
            w = {"국": (hi + lo) / 2, "수": (hi + lo) / 2, **w}
            wtext = f"국어·수학 중 우수 영역 {hi:g}%/나머지 {lo:g}% · " + " · ".join(
                f"{FULL.get(k, k)} {v:g}%" for k, v in w.items() if k not in ("국", "수"))
        else:
            wtext = " · ".join(f"{FULL.get(k, k)} {v:g}%" for k, v in w.items())
        j = d["jeongsi"]
        out["schools"].append({"univ": u, "name": d["univ"]["name"], "group": j["group"], "q27": j["quota_2027"],
                               "q26": j["quota_2026"], "weights": SV(w, j["ratio"].source, "검증 필요"),
                               "formula_text": j["formula_text"], "wtext": wtext, "kind": g.kind, "ranked": ranked})
    return out
