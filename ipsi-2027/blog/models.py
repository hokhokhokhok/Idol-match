"""출처가 붙은 값(SourcedValue) — 앱 DB의 모든 입시 수치는 이 형태로만 포스트에 들어간다.

규칙
- source 가 없으면 포스트 생성 자체를 거부한다 (guardrails.check_sources).
- status 가 '검증 필요' 또는 '더미' 이면 경고를 띄우고 내보내기 결과에 표시를 남긴다.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

Status = Literal["확정", "임시", "검증 필요", "더미"]


@dataclass(frozen=True)
class Source:
    doc: str                 # 문서명 (예: "연세대 2027 정시 모집요강")
    url: str                 # 원문 URL
    collected_at: str        # 수집일 YYYY-MM-DD
    page: str | None = None  # 페이지/표 번호
    kind: Literal["공식", "학원", "유튜브", "더미"] = "공식"

    def label(self) -> str:
        page = f" p.{self.page}" if self.page else ""
        return f"{self.doc}{page} ({self.collected_at} 수집)"


@dataclass(frozen=True)
class SV:
    """Sourced Value."""
    value: Any
    source: Source | None
    status: Status = "확정"
    note: str = ""

    @property
    def needs_warning(self) -> bool:
        return self.status in ("검증 필요", "더미")


@dataclass
class PostInput:
    univ_ids: list[str]
    dept: str
    post_type: str
    audience: list[str]
    tone: str
    author_memo: str
    ad_links: list[str] = field(default_factory=list)
