"""2027 수능 직후 브리핑 — data/parsed/csat_2027/briefing.yaml (가채점 추정치·보도, 출처 필수)."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml

PATH = Path(__file__).resolve().parent.parent / "data" / "parsed" / "csat_2027" / "briefing.yaml"


@lru_cache(maxsize=1)
def load() -> dict:
    d = yaml.safe_load(PATH.read_text(encoding="utf-8"))
    for f in d["facts"] + d["advice"]:
        if not str(f.get("url", "")).startswith("http"):
            raise ValueError(f"출처 URL 없음: {f.get('label') or f.get('title')}")
    return d


CUTS = PATH.parent / "cuts.yaml"


@lru_cache(maxsize=1)
def cuts() -> dict:
    d = yaml.safe_load(CUTS.read_text(encoding="utf-8"))
    if not str(d.get("url", "")).startswith("http"):
        raise ValueError("등급컷 출처 URL 없음")
    return d


LINES = PATH.parent / "expect_lines.yaml"


@lru_cache(maxsize=1)
def lines() -> dict:
    """학원 예상 합격선(국수탐 원점수 합 300점) — 참고용, 출처 필수."""
    d = yaml.safe_load(LINES.read_text(encoding="utf-8"))
    orgs = set(d["sources"])
    for s in d["sources"].values():
        if not str(s.get("url", "")).startswith("http"):
            raise ValueError("예상선 출처 URL 없음")
    for x in d["lines"]:
        vals = [x[o] for o in orgs if o in x]
        if not vals or not all(0 < v <= 300 for v in vals):
            raise ValueError(f"예상선 값 오류: {x}")
    return d
