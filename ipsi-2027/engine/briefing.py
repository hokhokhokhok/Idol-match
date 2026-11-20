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
