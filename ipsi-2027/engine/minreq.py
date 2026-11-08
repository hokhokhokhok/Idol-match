"""수능 최저학력기준 판정 엔진 (F3).

규칙(rule) 스키마 — data/parsed/susi_2027/*.yaml 의 min_req 와 같은 형태
  pool:      판정에 쓰는 영역. "국","수","영","탐" 또는 탐구 개별 과목을 따로 셀 때 "탐1","탐2"
  inq:       "탐"의 계산 방식. best1(상위 1과목) | avg2(2과목 평균)
             | avg2_or_sci1(2과목 평균과 과탐 상위 1과목 중 유리한 쪽, 성균관대) — 기본 best1
  inq_round: avg2 일 때 소수점 처리. none(그대로) | floor(버림) | ceil(올림) — 기본 none
  pick:      pool 중 몇 개 영역을 고르는지
  sum_max:   고른 영역 등급 합의 상한 (없으면 합 조건 없음)
  each_max:  고른 영역 각각의 등급 상한 (예: '3개 영역 각 3등급 이내')
  must_any:  고른 영역에 이 중 하나 이상 포함 (예: ["국","수"])
  must_all:  고른 영역에 모두 포함 (예: ["수"])
  extra:     별도 조건 {"영": 3, "한국사": 4} — 각 등급 이하
  inq_type:  탐구 과목 제한 "과탐" | "사탐" (해당 과목만 탐구 등급으로 인정)
  math:      수학 선택과목 제한 ["미적분","기하"]
  eng_12:    true 면 영어 1·2등급을 1등급으로 간주 (중앙대)
  any_of:    [rule, ...] 중 하나만 충족해도 됨 (통합·택1 기준). 이 키가 있으면 나머지 키는 무시

성적 입력 — 각 영역에 (낙관 등급, 비관 등급). 가채점이 등급컷 근처면 비관을 1 높게 넣는다.
  {"국": (2,3), "수": (1,1), "영": (2,2), "탐1": (2,2), "탐2": (3,3), "한국사": (3,3)}
  탐구 과목 종류: {"탐1": "사탐", "탐2": "과탐"}, 수학 선택: "미적분"
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from itertools import combinations

AREAS = ("국", "수", "영", "탐1", "탐2", "한국사")


@dataclass
class Scores:
    grades: dict[str, int]                       # 한 시나리오의 등급
    inq_types: dict[str, str] = field(default_factory=dict)   # 탐1/탐2 → 사탐/과탐
    math_elective: str | None = None


@dataclass
class Check:
    ok: bool
    detail: str                                  # 사람이 읽는 설명
    margin: float | None = None                  # sum_max - 최소합 (여유, 음수면 부족)


def _inq_values(rule: dict, s: Scores) -> dict[str, float] | str:
    allowed = [k for k in ("탐1", "탐2") if k in s.grades and (
        not rule.get("inq_type") or s.inq_types.get(k) == rule["inq_type"])]
    if not allowed:
        return f"{rule.get('inq_type', '탐구')} 응시 과목 없음"
    vals = {k: float(s.grades[k]) for k in allowed}
    pool = rule.get("pool", [])
    if "탐1" in pool or "탐2" in pool:          # 개별 과목을 각각 영역처럼
        return vals
    mode = rule.get("inq", "best1")
    if mode in ("avg2", "avg2_or_sci1"):
        if len(vals) < 2:
            return "탐구 2과목 평균 기준인데 해당 과목이 2개 미만"
        v = sum(vals.values()) / 2
        r = rule.get("inq_round", "none")
        v = math.floor(v) if r == "floor" else math.ceil(v) if r == "ceil" else v
        if mode == "avg2_or_sci1":
            sci = [vals[k] for k in vals if s.inq_types.get(k) == "과탐"]
            if sci:
                v = min(v, min(sci))
        return {"탐": v}
    return {"탐": min(vals.values())}


def check_rule(rule: dict, s: Scores) -> Check:
    if "any_of" in rule:
        results = [check_rule(r, s) for r in rule["any_of"]]
        best = next((r for r in results if r.ok), None)
        if best:
            return Check(True, "택1 기준 중 하나 충족: " + best.detail, best.margin)
        margins = [r.margin for r in results if r.margin is not None]
        return Check(False, "택1 기준 모두 미충족 — " + " / ".join(r.detail for r in results),
                     max(margins) if margins else None)

    if rule.get("eng_12") and s.grades.get("영") == 2:
        s = Scores({**s.grades, "영": 1}, s.inq_types, s.math_elective)

    if rule.get("math") and s.math_elective and s.math_elective not in rule["math"]:
        return Check(False, f"수학 선택과목 조건({'/'.join(rule['math'])}) 불일치")

    fails = []
    for area, lim in (rule.get("extra") or {}).items():
        g = s.grades.get(area)
        if g is None:
            fails.append(f"{area} 성적 없음")
        elif g > lim:
            fails.append(f"{area} {g}등급 > {lim}등급")

    pool = rule.get("pool")
    if not pool:   # 별도 조건만 있는 규칙
        return Check(not fails, "; ".join(fails) or "별도 조건 충족")

    inq = _inq_values(rule, s)
    if isinstance(inq, str):
        return Check(False, inq)
    values: dict[str, float] = {}
    for a in pool:
        if a in ("탐", "탐1", "탐2"):
            if a == "탐":
                if "탐" in inq:
                    values["탐"] = inq["탐"]
            elif a in inq:
                values[a] = inq[a]
        elif a in s.grades:
            values[a] = float(s.grades[a])

    pick, smax, emax = rule["pick"], rule.get("sum_max"), rule.get("each_max")
    must_any, must_all = set(rule.get("must_any") or []), set(rule.get("must_all") or [])
    best_combo, best_sum = None, None
    for combo in combinations(values, pick):
        cs = set(combo)
        if must_any and not (cs & must_any):
            continue
        if must_all and not must_all <= cs:
            continue
        if emax is not None and any(values[a] > emax for a in combo):
            continue
        total = sum(values[a] for a in combo)
        if best_sum is None or total < best_sum:
            best_combo, best_sum = combo, total
    if best_combo is None:
        cond = f"{pick}개 영역" + (f" 각 {emax}등급 이내" if emax else "")
        return Check(False, f"{cond} 조건을 만족하는 조합 없음" + (f"; {'; '.join(fails)}" if fails else ""))
    desc = "+".join(f"{a}({values[a]:g})" for a in best_combo) + f"={best_sum:g}"
    margin = None
    if smax is not None:
        margin = smax - best_sum
        if best_sum > smax:
            fails.insert(0, f"최선 조합 {desc} > {smax}")
    if fails:
        return Check(False, "; ".join(fails), margin)
    return Check(True, f"최선 조합 {desc}" + (f" (기준 {smax} 이내)" if smax is not None else ""), margin)


@dataclass
class Verdict:
    status: str          # 충족 | 미충족 | 경계 | 기준 없음
    optimistic: Check | None
    pessimistic: Check | None
    swing: list[str]     # 경계일 때 결과를 가르는 영역


def judge(rule: dict | None, grade_ranges: dict[str, tuple[int, int]], inq_types=None, math_elective=None) -> Verdict:
    if not rule:
        return Verdict("기준 없음", None, None, [])
    inq_types = inq_types or {}
    opt = Scores({k: v[0] for k, v in grade_ranges.items()}, inq_types, math_elective)
    pes = Scores({k: v[1] for k, v in grade_ranges.items()}, inq_types, math_elective)
    co, cp = check_rule(rule, opt), check_rule(rule, pes)
    if co.ok and cp.ok:
        return Verdict("충족", co, cp, [])
    if not co.ok:
        return Verdict("미충족", co, cp, [])
    # 낙관이면 충족, 비관이면 미충족 → 어떤 영역이 결과를 가르는지
    swing = []
    for k, (a, b) in grade_ranges.items():
        if a == b:
            continue
        g = dict(opt.grades)
        g[k] = b
        if not check_rule(rule, Scores(g, inq_types, math_elective)).ok:
            swing.append(k)
    return Verdict("경계", co, cp, swing)


def describe(rule: dict | None) -> str:
    """규칙을 사람이 읽는 문장으로 (원문 대조용)."""
    if not rule:
        return "최저 없음"
    if "any_of" in rule:
        return " 또는 ".join(f"[{describe(r)}]" for r in rule["any_of"])
    parts = []
    if rule.get("pool"):
        pool = ",".join(rule["pool"])
        inq = {"best1": "탐구 상위 1과목", "avg2": "탐구 2과목 평균",
               "avg2_or_sci1": "탐구 2과목 평균 또는 과탐 상위 1과목 중 유리한 쪽"}.get(rule.get("inq", "best1"))
        if "탐1" in rule["pool"]:
            inq = "탐구 과목별 개별"
        s = f"{pool} 중 {rule['pick']}개"
        if rule.get("must_all"):
            s += f"({'·'.join(rule['must_all'])} 포함)"
        if rule.get("must_any"):
            s += f"({'·'.join(rule['must_any'])} 중 1개 이상 포함)"
        if rule.get("sum_max") is not None:
            s += f" 합 {rule['sum_max']} 이내"
        if rule.get("each_max") is not None:
            s += f" 각 {rule['each_max']}등급 이내"
        if any(a.startswith("탐") for a in rule["pool"]):
            s += f" [{inq}" + (f", {rule['inq_round']}" if rule.get("inq_round", "none") != "none" else "") + "]"
        parts.append(s)
    for a, lim in (rule.get("extra") or {}).items():
        parts.append(f"{a} {lim}등급 이내")
    if rule.get("inq_type"):
        parts.append(f"탐구는 {rule['inq_type']}만")
    if rule.get("eng_12"):
        parts.append("영어 1·2등급은 1등급으로 간주")
    if rule.get("math"):
        parts.append(f"수학 {'/'.join(rule['math'])}")
    return ", ".join(parts)
