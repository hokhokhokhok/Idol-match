"""맞춤 대시보드 카드의 '지금 상태' 요약 — 각 탭에 저장된 입력값으로 계산."""
from __future__ import annotations

from engine import admission as A
from engine import db
from engine.jeongsi_data import load as load_js
from engine.minreq import judge
from engine.susi_data import load as load_susi


def _susi(con) -> str | None:
    apps = db.get_state(con, "susi_apps", [])
    g = db.get_state(con, "susi_grades")
    if not apps or not g:
        return None
    tracks, _ = load_susi()
    ranges = {k: tuple(v) for k, v in g.items() if not k.startswith("_")}
    cnt = {"충족": 0, "경계": 0, "미충족": 0, "기준 없음": 0}
    for label in apps:
        for t in tracks:
            for grp in t.groups:
                if f"{t.univ_name} · {t.name} · {grp.units}" == label:
                    v = judge(grp.rule, ranges, {"탐1": g.get("_t1"), "탐2": g.get("_t2")}, g.get("_m"))
                    cnt[v.status] += 1
    return f"충족 {cnt['충족']} · 경계 {cnt['경계']} · 미충족 {cnt['미충족']} · 최저 없음 {cnt['기준 없음']}"


def _scores(con) -> dict | None:
    sv = db.get_state(con, "js_scores")
    if not sv:
        return None
    return {"국": {"std": sv["kor_s"], "pct": sv["kor_p"]}, "수": {"std": sv["mat_s"], "pct": sv["mat_p"]},
            "영": {"grade": sv["eng"]}, "한국사": {"grade": sv["his"]},
            "탐1": {"std": sv["t1s"], "pct": sv["t1p"], "type": sv["t1"]},
            "탐2": {"std": sv["t2s"], "pct": sv["t2p"], "type": sv["t2"]}, "_math": sv["mat_e"]}


def _conversion(con) -> str | None:
    s = _scores(con)
    if not s:
        return None
    groups, _ = load_js()
    ok = sum(1 for g in groups if g.formula and (r := g.compute(s)) and r.score is not None)
    return f"{ok}개 그룹 환산 완료 (임시 포함) — 정시 환산 탭에서 확인"


def _admission(con) -> str | None:
    sv = db.get_state(con, "js_scores")
    if not sv:
        return None
    pct = {"kor": sv["kor_p"], "math": sv["mat_p"], "inq": (sv["t1p"] + sv["t2p"]) / 2}
    recs = A.load_results()
    out = []
    for u in sorted({r.univ for r in recs}):
        units = db.get_state(con, f"adm_units_{u}", [])
        latest = max(r.year for r in recs if r.univ == u)
        for unit in units:
            rec = next((r for r in recs if r.univ == u and r.year == latest and r.unit == unit), None)
            a = rec and A.assess(rec, pct, int(sv["eng"]))
            if a:
                out.append(a.grade)
    if not out:
        return "합격 가능성 탭에서 모집단위를 고르면 요약이 나옵니다"
    return " · ".join(f"{g} {out.count(g)}" for g in ("안정", "적정", "소신", "위험") if out.count(g))


SUMMARY = {"min_check": _susi, "exam_cal": _susi, "conversion": _conversion, "nsu_adjust": _admission,
           "jeongsi_backup": _admission, "jeongsi_compare": _admission, "combo": _admission, "scenario_tree": _susi}


def summary(card_key: str, con) -> str | None:
    fn = SUMMARY.get(card_key)
    try:
        return fn(con) if fn else None
    except Exception:  # noqa: BLE001 — 요약 실패가 대시보드를 막지 않게
        return None
