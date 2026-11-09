"""인사이트(학원·언론·유튜브 관점) 로드·필터·저장 (F7).

- 시드: data/insights/seed.yaml (커밋)
- 사용자 추가: data/insights/user.yaml (로컬 전용, git 제외)
- 원문·자막 전문은 저장하지 않는다. 요약(1~3문장) + 링크만.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "data" / "insights" / "seed.yaml"
from engine.paths import local  # noqa: E402

USER = local("insights", "user.yaml", default=ROOT / "data" / "insights" / "user.yaml")
BADGE = {"공식": "공식 데이터", "학원": "학원 관점", "언론": "언론 보도", "유튜브": "수험생 경험·심리"}
TRUST = {"공식": 0, "학원": 1, "언론": 1, "유튜브": 2}   # 기획안 9장: 공식 > 학원 분석 > 유튜브·커뮤니티
MAX_SUMMARY = 400


@dataclass
class Insight:
    id: str
    org: str
    kind: str
    title: str
    url: str
    date: date
    topic: str
    summary: str
    evidence: str
    status: str
    segments: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    user_added: bool = False

    @property
    def badge(self) -> str:
        return BADGE.get(self.kind, self.kind)


def _read(path: Path, user: bool) -> list[Insight]:
    if not path.exists():
        return []
    rows = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    return [Insight(**{**r, "date": r["date"] if isinstance(r["date"], date) else date.fromisoformat(str(r["date"]))},
                    user_added=user) for r in rows]


def load() -> list[Insight]:
    items = _read(SEED, False) + _read(USER, True)
    return sorted(items, key=lambda i: (TRUST.get(i.kind, 9), -i.date.toordinal()))


def filter_items(items: list[Insight], segment: str | None = None, topic: str | None = None,
                 kinds: list[str] | None = None) -> list[Insight]:
    out = []
    for i in items:
        if segment and i.segments and segment not in i.segments:
            continue
        if topic and i.topic != topic:
            continue
        if kinds and i.kind not in kinds:
            continue
        out.append(i)
    return out


def by_topic(items: list[Insight]) -> dict[str, list[Insight]]:
    d: dict[str, list[Insight]] = {}
    for i in items:
        d.setdefault(i.topic, []).append(i)
    return d


def validate(i: Insight) -> list[str]:
    errs = []
    if not i.url.startswith("http"):
        errs.append("출처 URL 필요")
    if len(i.summary) > MAX_SUMMARY:
        errs.append(f"요약이 너무 깁니다({len(i.summary)}자 > {MAX_SUMMARY}자) — 원문 복제 금지, 1~3문장으로")
    if i.summary.count(".") + i.summary.count("다 ") > 6:
        errs.append("요약은 1~3문장으로")
    return errs


def add_user(i: Insight) -> list[str]:
    errs = validate(i)
    if errs:
        return errs
    rows = yaml.safe_load(USER.read_text(encoding="utf-8")) if USER.exists() else []
    d = asdict(i)
    d.pop("user_added")
    d["date"] = i.date.isoformat()
    rows = [r for r in (rows or []) if r["id"] != i.id] + [d]
    USER.parent.mkdir(parents=True, exist_ok=True)
    USER.write_text(yaml.safe_dump(rows, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return []
