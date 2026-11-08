"""가/나/다 조합 추천 (F6).

후보: 합격 가능성 탭의 자동 판정(입결 있는 대학) + 사용자가 직접 넣은 후보(학원 모의지원 판정 등).
판정별 합격 확률은 근거 데이터가 없는 '가정값'이며 화면에서 조절한다.
  P(전부 불합격) = Π(1 − p_i)
  기대 선호도 = Σ_i p_i × Π_{더 선호하는 j}(1 − p_j) × 선호점수_i   (더 원하는 곳에 붙으면 그쪽에 감)
프리셋(기획안 6장):
  균형(현역 정시파이터 기본) 안정1·적정1·소신1
  안정 우선(재도전 의사 낮은 N수생) 안정2·적정1
  상향 허용(재도전 의사 있는 N수생) 적정1·소신2 + '실패 시 2028 체제' 경고
  반수생: 현 소속 대학보다 선호 순위가 높은 후보만
"""
from __future__ import annotations

from dataclasses import dataclass
from itertools import product

P_DEFAULT = {"안정": 0.85, "적정": 0.6, "소신": 0.3, "위험": 0.1}
PRESETS = {
    "균형": {"안정": 1, "적정": 1, "소신": 1},
    "안정 우선": {"안정": 2, "적정": 1},
    "상향 허용": {"적정": 1, "소신": 2},
}
RISK_WARN = 0.3


@dataclass(frozen=True)
class Cand:
    univ: str
    unit: str
    group: str        # 가 | 나 | 다
    grade: str        # 안정 | 적정 | 소신 | 위험
    pref: int         # 선호 순위 (1 = 가장 원함)
    source: str = "직접 입력"

    @property
    def label(self) -> str:
        return f"{self.univ} {self.unit}"


@dataclass
class Combo:
    cards: tuple[Cand, ...]
    p_all_fail: float
    expected_pref: float
    mismatch: int
    warnings: list[str]

    def by_group(self) -> dict[str, Cand]:
        return {c.group: c for c in self.cards}


def _pref_score(c: Cand, n: int) -> float:
    return (n - c.pref + 1) / n


def evaluate(cards: tuple[Cand, ...], target: dict[str, int], p: dict[str, float], n_pref: int) -> Combo:
    pf = 1.0
    for c in cards:
        pf *= 1 - p[c.grade]
    exp, miss = 0.0, 1.0
    for c in sorted(cards, key=lambda x: x.pref):          # 더 원하는 곳부터
        exp += miss * p[c.grade] * _pref_score(c, n_pref)
        miss *= 1 - p[c.grade]
    counts = {g: sum(1 for c in cards if c.grade == g) for g in P_DEFAULT}
    mismatch = sum(abs(target.get(g, 0) - counts.get(g, 0)) for g in P_DEFAULT)
    warns = []
    if pf > RISK_WARN:
        warns.append(f"전부 불합격 확률 {pf:.0%} (가정값 기준) — 안정 카드 보강을 고려하세요")
    if not any(c.grade == "안정" for c in cards):
        warns.append("안정 카드가 없습니다")
    if len(cards) < 3:
        warns.append(f"{3 - len(cards)}개 군을 비워 둔 조합입니다")
    return Combo(cards, pf, exp, mismatch, warns)


def recommend(cands: list[Cand], preset: str, p: dict[str, float] | None = None, top: int = 3,
              current_pref: int | None = None) -> list[Combo]:
    p = p or P_DEFAULT
    pool = [c for c in cands if current_pref is None or c.pref < current_pref]      # 반수: 현 소속보다 나은 곳만
    n_pref = max([c.pref for c in pool], default=1)
    by_g = {g: [c for c in pool if c.group == g] for g in ("가", "나", "다")}
    options = [by_g[g] + [None] for g in ("가", "나", "다")]
    target = PRESETS[preset]
    combos = []
    for pick in product(*options):
        cards = tuple(c for c in pick if c is not None)
        if not cards:
            continue
        combos.append(evaluate(cards, target, p, n_pref))
    combos.sort(key=lambda c: (c.mismatch, -c.expected_pref, c.p_all_fail))
    out = combos[:top]
    if preset == "상향 허용":
        for c in out:
            c.warnings.append("실패해 재도전하면 2028학년도부터 수능·내신 체제와 N수생 수시 지원 조건이 달라집니다")
    return out
