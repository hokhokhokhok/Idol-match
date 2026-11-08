"""F10 품질·리스크 가드레일."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Iterable

from .models import SV

BANNED = ["무조건", "100% 합격", "100%합격", "합격 보장", "합격보장", "확실히 합격", "반드시 합격", "100% 붙", "프리패스"]
AD_NOTICE = "※ 이 글에는 제휴·광고 링크가 포함되어 있으며, 구매·가입 시 필자가 수수료를 받을 수 있습니다."
DAILY_LIMIT_DEFAULT = 3
MEMO_MIN_CHARS = 20


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)    # 생성/내보내기 차단
    warnings: list[str] = field(default_factory=list)  # 표시만

    @property
    def export_allowed(self) -> bool:
        return not self.errors


def iter_values(obj: Any, path: str = "") -> Iterable[tuple[str, SV]]:
    if isinstance(obj, SV):
        yield path, obj
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from iter_values(v, f"{path}.{k}" if path else str(k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from iter_values(v, f"{path}[{i}]")


def check_sources(data: dict, report: Report) -> None:
    dummy, unverified = 0, []
    for path, sv in iter_values(data):
        if sv.source is None or not sv.source.url:
            report.errors.append(f"출처 없는 값: {path} — 생성 금지")
        elif sv.status == "더미":
            dummy += 1
        elif sv.status == "검증 필요":
            unverified.append(path)
    if dummy:
        report.warnings.append(f"더미 데이터 {dummy}개 사용 중 — 미리보기 전용, 발행 금지 (내보내기에 '샘플' 표시가 붙음)")
    if unverified:
        report.warnings.append(f"'검증 필요' 값 {len(unverified)}개: {', '.join(unverified)}")


def check_memo(memo: str, report: Report) -> None:
    if len(memo.strip()) < MEMO_MIN_CHARS:
        report.errors.append(f"필자 메모가 비었거나 너무 짧음({len(memo.strip())}자 < {MEMO_MIN_CHARS}자) — 내보내기 비활성화")


def check_banned(text: str, report: Report) -> None:
    plain = re.sub(r"<[^>]+>", "", text)
    for w in BANNED:
        if w in plain:
            report.errors.append(f"과장·보장 표현 금지: '{w}'")


def check_daily_limit(count_today: int, report: Report, limit: int = DAILY_LIMIT_DEFAULT) -> None:
    if count_today >= limit:
        report.errors.append(f"오늘 생성 {count_today}개 — 일 생성 한도({limit}개) 도달. 하루에 대량 발행하지 마세요.")


def ngrams(text: str, n: int = 3) -> set[str]:
    t = re.sub(r"\s+|<[^>]+>", "", text)
    return {t[i:i + n] for i in range(max(len(t) - n + 1, 0))}


def similarity(a: str, b: str) -> float:
    A, B = ngrams(a), ngrams(b)
    return len(A & B) / len(A | B) if A and B else 0.0


def check_duplicates(body: str, key: tuple, previous: list[dict], report: Report, threshold: float = 0.6) -> None:
    """previous: [{'key': (univ_ids, dept, post_type), 'body': str, 'created_at': str}]"""
    for p in previous:
        sim = similarity(body, p["body"])
        same_target = tuple(p["key"][:2]) == tuple(key[:2])
        if sim >= threshold:
            report.warnings.append(f"이전 포스트({p['created_at']})와 유사도 {sim:.0%} — 내용을 바꿔주세요")
        elif same_target and p["key"][2] == key[2]:
            report.warnings.append(f"같은 학교·학과·유형 포스트가 이미 있음({p['created_at']}) — 다른 유형(비교·세그먼트형 등)이나 관점을 추천")
