"""정시 수능 환산점수 엔진 (F4).

반영식(formula) 스키마 — data/parsed/jeongsi_2027/*.yaml 의 groups[].formula
  parts:  [{area, metric, coef, n, avg, table}]
          area:   국 | 수 | 탐 (탐구 n과목) | 영 | 한국사
          metric: std   표준점수
                  pct   백분위
                  conv  대학별 탐구 변환표준점수 (성적 입력에 conv 가 없으면 표준점수로 임시 대체)
                  std_max  표준점수 ÷ 최고 표준점수 (탐구는 conv ÷ (최고점×n)) — 최고점은 성적 발표 후 입력
                  grade_table  등급별 점수표(table: 1~9등급)
          coef:   곱하는 수 (기본 1)
          n:      탐구 반영 과목 수 (기본 2, 합산). avg: true 면 평균
  den / scale:  합산값 × scale ÷ den (den 없으면 × scale)
  max:    만점 (명시하지 않으면 parts 의 이론상 최고점으로 계산)
  post:   환산 뒤 더하거나 빼는 항 [{area: 영|한국사, op: add|sub, table: [1~9등급]}]
  bonus:  inq_pct: {과탐: 3}   해당 탐구 과목 점수에 % 가산
          inq_add: {과탐: 4}   해당 탐구 과목 점수에 점수 가산
          inq_all: {type: 사탐, pct: 3}  탐구 2과목이 모두 해당 종류면 탐구 항 전체에 % 가산
          math_pct: 3, math_in: [미적분, 기하]  수학 선택과목 가산(표준점수에 %)
  ratio:  수능 비율 (학생부 등과 합산하는 전형). 최종 = 환산 × ratio
  best_of: [formula, ...]  여러 식으로 계산해 높은 점수 (서강대 A/B, 건국대 자유전공 등). 이 키가 있으면 나머지 무시
  approx: "사유"  요강에 정확한 산출식이 없어 비율 기반으로 근사한 식 → 결과에 임시 표시

성적 입력
  {"국": {"std":131,"pct":96}, "수": {"std":128,"pct":92}, "영": {"grade":2}, "한국사": {"grade":3},
   "탐1": {"std":66,"pct":95,"type":"사탐","conv":64.3}, "탐2": {...}, "_math": "미적분"}
최고 표준점수(std_max용): {"국": 147, "수": 140, "탐": 70}
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Result:
    score: float | None
    max_score: float | None
    parts: list[tuple[str, float]] = field(default_factory=list)
    provisional: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)
    variant: str = ""

    @property
    def ratio(self) -> float | None:
        return self.score / self.max_score if self.score is not None and self.max_score else None


def _inq(part: dict, scores: dict, formula: dict, maxes: dict, res: Result) -> float | None:
    n = part.get("n", 2)
    metric = part["metric"]
    bonus = formula.get("bonus") or {}
    vals = []
    for k in ("탐1", "탐2"):
        s = scores.get(k)
        if not s:
            continue
        if metric in ("conv", "std_max"):
            v = s.get("conv")
            if v is None:
                v = s.get("std")
                if v is not None:
                    res.provisional.append("탐구 변환표준점수 미발표 → 표준점수로 임시 계산")
        else:
            v = s.get(metric)
        if v is None:
            continue
        t = s.get("type")
        v = v * (1 + (bonus.get("inq_pct") or {}).get(t, 0) / 100) + (bonus.get("inq_add") or {}).get(t, 0)
        vals.append((v, t))
    if len(vals) < n:
        res.missing.append(f"탐구 {n}과목 점수 필요")
        return None
    vals = sorted(vals, key=lambda x: -x[0])[:n]
    total = sum(v for v, _ in vals)
    ia = bonus.get("inq_all")
    if ia and n >= 2 and all(t == ia["type"] for _, t in vals):
        total *= 1 + ia["pct"] / 100
    if metric == "std_max":
        if not maxes.get("탐"):
            res.missing.append("탐구 최고 변환표준점수(또는 표준점수 최고점) 입력 필요")
            return None
        return total / (maxes["탐"] * n)
    return total / n if part.get("avg") else total


def _value(part: dict, scores: dict, formula: dict, maxes: dict, res: Result) -> float | None:
    area, metric = part["area"], part["metric"]
    if area == "탐":
        return _inq(part, scores, formula, maxes, res)
    s = scores.get(area) or {}
    if metric == "grade_table":
        g = s.get("grade")
        if g is None:
            res.missing.append(f"{area} 등급 필요")
            return None
        return part["table"][g - 1]
    v = s.get("std" if metric in ("std", "conv", "std_max") else metric)
    if v is None:
        res.missing.append(f"{area} {'표준점수' if metric != 'pct' else '백분위'} 필요")
        return None
    b = formula.get("bonus") or {}
    if area == "수" and b.get("math_pct") and scores.get("_math") in b.get("math_in", []):
        v = v * (1 + b["math_pct"] / 100)
    if metric == "std_max":
        if not maxes.get(area):
            res.missing.append(f"{area} 최고 표준점수 입력 필요")
            return None
        return v / maxes[area]
    return v


def _part_max(part: dict) -> float:
    area, metric = part["area"], part["metric"]
    if metric == "grade_table":
        return max(part["table"])
    if metric == "std_max":
        return 1.0
    per = 100 if (area == "탐" or metric == "pct") else 200
    if area == "탐":
        return per if part.get("avg") else per * part.get("n", 2)
    return per


def _compute_one(formula: dict, scores: dict, maxes: dict) -> Result:
    res = Result(None, None)
    if formula.get("approx"):
        res.provisional.append(f"근사식: {formula['approx']}")
    total, total_max = 0.0, 0.0
    for p in formula["parts"]:
        v = _value(p, scores, formula, maxes, res)
        if v is None:
            continue
        coef = p.get("coef", 1)
        total += v * coef
        total_max += _part_max(p) * coef
        res.parts.append((f"{p['area']}", round(v * coef, 4)))
    if res.missing:
        res.missing = sorted(set(res.missing))
        return res
    den, scale = formula.get("den"), formula.get("scale", 1)
    conv = total * scale / den if den else total * scale
    conv_max = formula.get("max") or (total_max * scale / den if den else total_max * scale)
    for post in formula.get("post", []):
        g = (scores.get(post["area"]) or {}).get("grade")
        if g is None:
            res.missing.append(f"{post['area']} 등급 필요")
            return res
        v = post["table"][g - 1]
        if post["op"] == "add":
            conv += v
            conv_max += max(post["table"])
        else:
            conv -= v
        res.parts.append((f"{post['area']}({'+' if post['op'] == 'add' else '−'})", v))
    r = formula.get("ratio", 1)
    res.score = round(conv * r, 3)
    res.max_score = round(conv_max * r, 3)
    res.provisional = sorted(set(res.provisional))
    return res


def compute(formula: dict, scores: dict, maxes: dict | None = None) -> Result:
    maxes = maxes or {}
    if "best_of" in formula:
        results = []
        for i, f in enumerate(formula["best_of"]):
            r = _compute_one(f, scores, maxes)
            r.variant = f.get("label", f"식{i + 1}")
            results.append(r)
        ok = [r for r in results if r.score is not None]
        if not ok:
            return results[0]
        best = max(ok, key=lambda r: r.score)
        best.parts.append((f"적용: {best.variant}", 0))
        return best
    return _compute_one(formula, scores, maxes)


def weights(formula: dict) -> dict[str, float]:
    """영역별 반영 비중(만점 기여 비율) — '유리한 반영 구조' 비교용."""
    f = formula["best_of"][0] if "best_of" in formula else formula
    w = {}
    for p in f["parts"]:
        w[p["area"]] = w.get(p["area"], 0) + _part_max(p) * p.get("coef", 1)
    for post in f.get("post", []):
        if post["op"] == "add" and post["area"] == "영":
            w["영"] = w.get("영", 0) + max(post["table"])
    tot = sum(w.values())
    return {k: round(v / tot * 100, 1) for k, v in w.items()} if tot else {}
