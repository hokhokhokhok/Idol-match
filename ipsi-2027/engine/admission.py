"""합격 가능성 분석 (F5).

기준: 전년도 정시 입결(최종등록자 상위 80% 계열 가중 백분위 평균·표준편차 등).
  - 환산점수는 해마다 산출식이 바뀔 수 있어 기본 비교 기준은 '계열 가중 백분위 평균'(영어·한국사 제외)
  - 영어는 등급 평균과 따로 비교해 경고
보정 요인: 각 요인의 이동폭(백분위 점수)과 가중치를 공개하고 사용자가 조절. 기본값은 근거 수준과 함께 표시.
판정: z = (내 점수 − 보정 기준) ÷ max(표준편차, sd_floor) → 안정/적정/소신/위험
"""
from __future__ import annotations

import csv
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "data" / "parsed" / "results"
from .paths import local  # noqa: E402

IMPORTS = local("results", default=RESULTS)   # 사용자가 가져온 입결(import_*.csv)

# 보정 요인 기본값 — shift: 기준을 올리는 백분위 점수(가중치 1일 때), evidence: docs/context.md 근거 수준
FACTORS = {
    "nsu": {"label": "N수생 증가", "shift": 0.2, "weight": 1.0, "evidence": "🟡 보도 확인 — 졸업생 지원자 173,706명(+8.6%)",
            "note": "이동폭 0.2점은 근거 수치가 없는 가정값입니다. 체감에 맞게 조절하세요."},
    "stable": {"label": "개편 전 마지막 해 안정 지원", "shift": 0.2, "weight": 0.0,
               "evidence": "🔴 원출처 미확인 — 오히려 수시 상향 지원 증가 보도", "note": "기본 꺼짐"},
}
QUOTA_K = 0.01       # 모집인원 1% 증가 → 기준 0.01점 하락 (가정값)
COMP_K = 0.005       # 경쟁률 1% 상승 → 기준 0.005점 상승 (가정값)
THRESH = {"안정": 0.5, "적정": -0.5, "소신": -1.5}   # z 기준 하한
SD_FLOOR = 0.5


@dataclass
class Record:
    univ: str
    year: int
    unit: str
    group: str
    quota: int
    kor: float
    math: float
    eng: float
    inq: float
    avg: float
    sd: float
    conv: float | None
    track: str
    weights: str
    basis: str
    source_url: str
    page: str
    status: str

    def weight_dict(self) -> dict[str, float]:
        out = {}
        for part in self.weights.split("/"):
            if part:
                out[{"국": "kor", "수": "math", "탐": "inq"}[part[0]]] = float(part[1:])
        return out


@lru_cache(maxsize=1)
def load_results() -> list[Record]:
    recs = []
    files = sorted(RESULTS.glob("*.csv")) + (sorted(IMPORTS.glob("import_*.csv")) if IMPORTS != RESULTS and IMPORTS.exists() else [])
    for f in files:
        with f.open(encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                recs.append(Record(r["univ"], int(r["year"]), r["unit"], r["group"], int(r["quota"] or 0),
                                   float(r["kor_pct"]), float(r["math_pct"]), float(r["eng_grade"] or 0),
                                   float(r["inq_pct"]), float(r["pct_avg"]), float(r["pct_sd"] or 0),
                                   float(r["conv_avg"]) if r.get("conv_avg") else None, r["track"],
                                   r.get("avg_weights", ""), r["basis"], r["source_url"], r["page"],
                                   r.get("status", "검증 필요")))
    return recs


def history(univ: str, unit: str) -> list[Record]:
    return sorted([r for r in load_results() if r.univ == univ and r.unit == unit], key=lambda r: r.year)


@dataclass
class Assessment:
    unit: str
    my: float
    ref: float
    adj_ref: float
    sd: float
    z: float
    grade: str
    reason: str
    shifts: list[tuple[str, float]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    trend: float | None = None


def my_pct_avg(rec: Record, pct: dict) -> float | None:
    w = rec.weight_dict()
    if not w:
        return None
    return sum(w[k] * pct[k] for k in w) / sum(w.values())


def grade_of(z: float, thresh: dict | None = None) -> str:
    t = thresh or THRESH
    if z >= t["안정"]:
        return "안정"
    if z >= t["적정"]:
        return "적정"
    if z >= t["소신"]:
        return "소신"
    return "위험"


def assess(rec: Record, pct: dict, eng_grade: int, factors: dict | None = None, quota_2027: int | None = None,
           carryover: int = 0, comp_change_pct: float = 0.0, thresh: dict | None = None,
           prev: Record | None = None) -> Assessment | None:
    """pct: {"kor":, "math":, "inq": 탐구 2과목 평균 백분위}"""
    my = my_pct_avg(rec, pct)
    if my is None:
        return None
    f = factors or {k: dict(v) for k, v in FACTORS.items()}
    shifts = []
    for k, v in f.items():
        s = v["shift"] * v["weight"]
        if s:
            shifts.append((v["label"], s))
    q27 = (quota_2027 or rec.quota) + carryover
    if rec.quota and q27 != rec.quota:
        d = (q27 - rec.quota) / rec.quota * 100
        shifts.append((f"모집인원 {rec.quota}→{q27}명({d:+.0f}%)", -QUOTA_K * d))
    if comp_change_pct:
        shifts.append((f"경쟁률 변화 {comp_change_pct:+.0f}%", COMP_K * comp_change_pct))
    adj = rec.avg + sum(s for _, s in shifts)
    sd = max(rec.sd, SD_FLOOR)
    z = (my - adj) / sd
    g = grade_of(z, thresh)
    diff = my - adj
    reason = (f"내 계열 가중 백분위 {my:.2f} vs 보정 기준 {adj:.2f}({rec.year} 상위80% 평균 {rec.avg:.2f}"
              + (f" + 보정 {adj - rec.avg:+.2f}" if shifts else "") + f") → {diff:+.2f}점, 표준편차 {sd:.2f} 기준 {z:+.2f}")
    warns = []
    if rec.eng and eng_grade - rec.eng >= 1:
        warns.append(f"영어 {eng_grade}등급 — 합격자 평균 {rec.eng:.2f}등급보다 낮아 백분위 비교보다 실제로 불리할 수 있음")
    if rec.sd < SD_FLOOR:
        warns.append(f"표준편차가 {rec.sd}로 작아 {SD_FLOOR}으로 보정해 계산")
    if rec.quota and rec.quota < 10:
        warns.append(f"모집인원 {rec.quota}명 소수 모집 — 해마다 변동이 큼")
    trend = rec.avg - prev.avg if prev else None
    return Assessment(rec.unit, my, rec.avg, adj, sd, z, g, reason, shifts, warns, trend)


def combo_risk(grades: list[str]) -> str:
    """가/나/다 3장 조합의 위험 경고 (단순 규칙)."""
    if not grades:
        return ""
    if all(g in ("소신", "위험") for g in grades):
        return "⚠️ 모든 카드가 소신·위험 — 전부 불합격할 가능성이 높은 조합입니다."
    if "안정" not in grades and "적정" not in grades[:]:
        return "⚠️ 안정·적정 카드가 없습니다."
    if "안정" not in grades:
        return "안정 카드가 없습니다. 한 장은 안정권으로 두는 것을 고려해보세요."
    return ""
