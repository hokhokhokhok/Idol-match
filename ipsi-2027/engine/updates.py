"""성적 발표·이월 발표 후 업데이트 데이터 (Phase 6).

1) 수시 이월 인원 — data/parsed/updates/carryover.csv  (univ, unit, added_quota, announced_at, source_url, page)
2) 대학별 탐구 변환표준점수표 — data/parsed/updates/conv_{univ}.csv  (pct, 사탐, 과탐, source_url)
   백분위 → 변환표준점수. 대학 공지 표를 그대로 옮긴 것만 넣는다. 없는 백분위는 계산하지 않음(보간 금지).
3) 2027 수능 최고 표준점수 — data/parsed/updates/csat_max.yaml (국, 수, source_url)

모든 행은 출처 URL 필수. 값이 들어오면 '임시' 표시가 사라지고 '확정(공지 반영)'으로 바뀐다.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "data" / "parsed" / "updates"
CARRY = DIR / "carryover.csv"
CMAX = DIR / "csat_max.yaml"
CARRY_COLS = ["univ", "unit", "added_quota", "announced_at", "source_url", "page"]


class UpdateError(ValueError):
    pass


@dataclass
class Carry:
    univ: str
    unit: str
    added: int
    announced_at: str
    source_url: str
    page: str


def load_carryover() -> list[Carry]:
    if not CARRY.exists():
        return []
    with CARRY.open(encoding="utf-8") as f:
        return [Carry(r["univ"], r["unit"], int(r["added_quota"]), r["announced_at"], r["source_url"], r.get("page", ""))
                for r in csv.DictReader(f)]


def carryover_for(univ: str, unit: str) -> Carry | None:
    return next((c for c in load_carryover() if c.univ == univ and c.unit == unit), None)


def save_carryover(rows: list[dict]) -> int:
    """rows: CARRY_COLS 키. 출처 없는 행·음수는 거부. 같은 (univ, unit)은 최신 값으로 교체."""
    clean = []
    for i, r in enumerate(rows, 1):
        if not str(r.get("source_url", "")).startswith("http"):
            raise UpdateError(f"{i}행: 출처 URL 없음 — 출처 없는 수치는 넣지 않습니다")
        n = int(r["added_quota"])
        if n < 0:
            raise UpdateError(f"{i}행: 이월 인원은 0 이상")
        clean.append({k: r.get(k, "") for k in CARRY_COLS} | {"added_quota": n})
    old = {(c.univ, c.unit): {"univ": c.univ, "unit": c.unit, "added_quota": c.added, "announced_at": c.announced_at,
                              "source_url": c.source_url, "page": c.page} for c in load_carryover()}
    for r in clean:
        old[(r["univ"], r["unit"])] = r
    DIR.mkdir(parents=True, exist_ok=True)
    with CARRY.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CARRY_COLS)
        w.writeheader()
        w.writerows(old.values())
    return len(clean)


# ---------------------------------------------------------------- 변환표준점수
def conv_path(univ: str) -> Path:
    return DIR / f"conv_{univ}.csv"


def load_conv(univ: str) -> dict | None:
    """{'사탐': {pct: conv}, '과탐': {pct: conv}, 'source_url': ...}"""
    p = conv_path(univ)
    if not p.exists():
        return None
    out = {"사탐": {}, "과탐": {}, "source_url": ""}
    with p.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            pct = int(float(r["pct"]))
            for t in ("사탐", "과탐"):
                if r.get(t) not in (None, ""):
                    out[t][pct] = float(r[t])
            out["source_url"] = out["source_url"] or r.get("source_url", "")
    return out


def save_conv(univ: str, rows: list[dict]) -> int:
    if not rows:
        raise UpdateError("빈 표")
    if not str(rows[0].get("source_url", "")).startswith("http"):
        raise UpdateError("첫 행에 출처 URL 필요 (대학 입학처 변환표준점수 공지)")
    seen = set()
    for i, r in enumerate(rows, 1):
        pct = int(float(r["pct"]))
        if not 0 <= pct <= 100 or pct in seen:
            raise UpdateError(f"{i}행: 백분위 {pct} 범위 밖이거나 중복")
        seen.add(pct)
        if r.get("사탐") in (None, "") and r.get("과탐") in (None, ""):
            raise UpdateError(f"{i}행: 사탐·과탐 값이 모두 비었음")
    DIR.mkdir(parents=True, exist_ok=True)
    with conv_path(univ).open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["pct", "사탐", "과탐", "source_url"])
        w.writeheader()
        for r in rows:
            w.writerow({"pct": int(float(r["pct"])), "사탐": r.get("사탐", ""), "과탐": r.get("과탐", ""),
                        "source_url": r.get("source_url", "")})
    return len(rows)


def apply_conv(univ: str, scores: dict) -> tuple[dict, list[str]]:
    """대학 변환표가 있으면 탐구 과목별 conv 를 백분위로 채운다. (새 scores, 메모)"""
    table = load_conv(univ)
    if not table:
        return scores, []
    out = {**scores}
    notes = []
    for k in ("탐1", "탐2"):
        s = scores.get(k)
        if not s or s.get("pct") is None:
            continue
        t = s.get("type", "사탐")
        v = table.get(t, {}).get(int(s["pct"]))
        if v is None:
            notes.append(f"{univ} 변환표에 {t} 백분위 {s['pct']} 값 없음 — 표준점수로 임시 계산")
            out[k] = {kk: vv for kk, vv in s.items() if kk != "conv"}
        else:
            out[k] = {**s, "conv": v}
    if not notes:
        notes.append(f"{univ} 탐구 변환표준점수 공지 반영")
    return out, notes


# ---------------------------------------------------------------- 최고 표준점수
def load_csat_max() -> dict:
    if not CMAX.exists():
        return {}
    d = yaml.safe_load(CMAX.read_text(encoding="utf-8")) or {}
    return {k: v for k, v in d.items() if k in ("국", "수", "탐") and v}


def save_csat_max(kor: int, math: int, source_url: str, inq: int | None = None) -> None:
    if not source_url.startswith("http"):
        raise UpdateError("출처 URL 필요 (평가원 채점 결과 발표 등)")
    DIR.mkdir(parents=True, exist_ok=True)
    CMAX.write_text(yaml.safe_dump({"국": kor, "수": math, "탐": inq, "source_url": source_url}, allow_unicode=True),
                    encoding="utf-8")
