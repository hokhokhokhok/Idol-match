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
    if rec:   # 앱 내부 메모 문장은 블로그에 넣지 않음
        clean = ". ".join(x for x in rec[0].split(". ") if "앱" not in x).rstrip(".")
        j["record_reflect"] = SV(clean, SF, st)
    return {"univ": {"id": univ, "name": m["name"]}, "program": {"name": SV(q["unit"].split()[-1], S27, st)},
            "jeongsi": j, "past": [], "insights": insight_svs("N수생 증가", limit=2), "data_snapshot_date": str(date.today())}


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


# ---------------------------------------------------------------- 유형 ③~⑥ 데이터
from engine import timeline as TL  # noqa: E402
from engine.susi_data import load as load_susi  # noqa: E402
from insights import store as INS  # noqa: E402

DEPT_HINT = {"경영": ("경영", "상경", "사회", "인문", "전 ", "전체", "전 모집단위", "전 계열")}
KCUE = Source(doc=TL.SOURCE["doc"], url=TL.SOURCE["url"], collected_at=TL.SOURCE["collected_at"], page=TL.SOURCE["page"],
              kind="공식")


def insight_svs(topic: str | None = None, segment: str | None = None, limit: int = 4) -> list[SV]:
    items = INS.filter_items(INS.load(), segment, topic)
    out = []
    for i in items[:limit]:
        src = Source(doc=f"{i.org} {i.title}", url=i.url, collected_at=str(i.date), kind="공식" if i.kind == "공식" else "학원")
        out.append(SV({"org": i.org, "kind": i.kind, "badge": i.badge, "summary": i.summary, "title": i.title},
                      src, "확정" if i.status == "확인" else "검증 필요"))
    return out


def _susi_group(t, dept: str):
    hints = DEPT_HINT.get(dept, ("전",))
    for g in t.groups:
        if any(h in g.units for h in hints):
            return g
    return t.groups[0]


def build_susi_vs(univ: str, dept: str) -> dict:
    base = build_overview(univ, dept)
    tracks, _ = load_susi()
    rows = []
    for t in [t for t in tracks if t.univ == univ]:
        src = Source(doc=f"{t.univ_name} 2027학년도 수시모집요강", url=t.source_url, collected_at=t.collected_at,
                     page=str(t.min_page), kind="공식" if "negagea" not in t.source_url else "미러")
        g = _susi_group(t, dept)
        exams = [e for e in t.events if e.kind in ("논술", "면접")]
        ann = next((e.date for e in t.events if e.kind == "최초합격발표"), None)
        rows.append({"name": SV(t.name, src, "검증 필요"), "type": t.type, "units": g.units,
                     "min": SV(g.text, src, "검증 필요"),
                     "exam": SV(", ".join(f"{e.kind} {e.date:%m/%d}" for e in exams) or "-", src, "검증 필요"),
                     "announce": SV(f"{ann:%m/%d}" if ann else "-", src, "검증 필요"),
                     "grad": SV(t.grad_note or "-", src, "검증 필요"), "grad_ok": t.grad_ok,
                     "grad_year_min": t.grad_year_min})
    base["susi"] = rows
    base["rule"] = SV("수시모집 합격자(최초·충원)는 정시모집 및 추가모집에 지원할 수 없음", KCUE, "확정")
    return base


def build_timely(univ: str, dept: str, event: str, numbers: dict | None = None) -> dict:
    """event: 수능 직후 | 성적 발표 | 수시 이월 | 원서 경쟁률 | 충원 현황
    numbers: {"value": 숫자, "label": "이월 인원", "url": 출처, "page": 쪽} — 사용자가 출처와 함께 입력"""
    base = build_overview(univ, dept)
    tracks, _ = load_susi()
    base["event"] = event
    base["timeline"] = [SV(f"{e.start:%m/%d}" + (f"~{e.end:%m/%d}" if e.end != e.start else "") + f" {e.title}", KCUE, "확정")
                        for e in TL.EVENTS]
    base["timeline_raw"] = TL.EVENTS
    exams = []
    for t in [t for t in tracks if t.univ == univ]:
        for e in t.events:
            if e.kind in ("논술", "면접") and e.date >= TL.d("2026-11-20"):
                src = Source(doc=f"{t.univ_name} 2027학년도 수시모집요강", url=t.source_url, collected_at=t.collected_at,
                             page=str(t.pages.get("일정")), kind="공식" if "negagea" not in t.source_url else "미러")
                exams.append(SV(f"{e.date:%m/%d} {t.name} {e.kind}" + (f"({e.units})" if e.units else ""), src, "검증 필요"))
    base["susi_exams"] = exams
    if numbers and numbers.get("value") is not None:
        src = Source(doc=numbers.get("doc", f"{base['univ']['name']} 발표 자료"), url=numbers.get("url", ""),
                     collected_at=str(date.today()), page=str(numbers.get("page", "")), kind="공식")
        base["live"] = SV(numbers["value"], src, "검증 필요")
        base["live_label"] = numbers.get("label", "")
    base["insights"] = insight_svs("N수생 증가", limit=2)
    return base


def build_segment(univ: str, dept: str, segment: str) -> dict:
    base = build_susi_vs(univ, dept)
    base["segment"] = segment
    seg_key = {"N수생": "N수", "재수생": "재수", "반수생": "반수", "현역 정시파이터": "현역", "수시파이터": "수시"}.get(segment, segment)
    base["insights"] = insight_svs(None, seg_key, limit=4)
    return base


def build_change(univ: str, dept: str, topic: str) -> dict:
    base = build_overview(univ, dept)
    base["topic"] = topic
    base["insights"] = insight_svs(topic, None, limit=4)
    return base
