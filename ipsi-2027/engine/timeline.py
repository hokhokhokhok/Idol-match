"""2027학년도 대입 주요 일정 — 대교협 「2027학년도 대학입학전형기본사항」(2026.7.31 개정) 본문 49쪽(PDF 53쪽) 별첨1.

모든 항목에 출처를 붙인다. 대학별 고사 일정(논술·면접)은 Phase 2에서 모집요강 파싱 후 추가.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime

SOURCE = {
    "doc": "한국대학교육협의회, 2027학년도 대학입학전형기본사항 (2026.7.31 개정)",
    "url": "https://kcue.or.kr/_upload/news/2026/07/31/application_8366fe4b41bdfd2721e0b5596d3a265d.pdf",
    "page": "본문 49쪽 별첨1 (정시 36쪽, 추가모집 37쪽)",
    "collected_at": "2026-11-08",
}


@dataclass(frozen=True)
class Event:
    start: date
    end: date
    title: str
    tracks: tuple[str, ...]      # 해당 축 A: 수시/정시/병행
    note: str = ""


def d(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()


ALL = ("수시", "정시", "병행")
SUSI = ("수시", "병행")
EVENTS = [
    Event(d("2026-11-19"), d("2026-11-19"), "수능 시행", ALL),
    Event(d("2026-11-30"), d("2026-11-30"), "정시 학생부 작성 기준일", ALL),
    Event(d("2026-12-11"), d("2026-12-11"), "수능 성적 통지", ALL),
    Event(d("2026-12-18"), d("2026-12-18"), "수시 합격자 발표 마감", SUSI, "대학별 발표일은 이보다 이를 수 있음"),
    Event(d("2026-12-21"), d("2026-12-23"), "수시 합격자 등록", SUSI),
    Event(d("2026-12-24"), d("2026-12-29"), "수시 미등록 충원 합격 통보 (마감일 18시)", SUSI, "홈페이지 발표 14시까지, 14~18시 개별 통보"),
    Event(d("2026-12-30"), d("2026-12-30"), "수시 충원 등록 마감 (22시)", SUSI),
    Event(d("2027-01-04"), d("2027-01-07"), "정시 원서접수 (대학별 3일 이상)", ALL),
    Event(d("2027-01-11"), d("2027-01-17"), "정시 가군 전형기간", ALL),
    Event(d("2027-01-18"), d("2027-01-24"), "정시 나군 전형기간", ALL),
    Event(d("2027-01-25"), d("2027-01-31"), "정시 다군 전형기간", ALL),
    Event(d("2027-02-05"), d("2027-02-05"), "정시 합격자 발표 마감", ALL),
    Event(d("2027-02-10"), d("2027-02-12"), "정시 합격자 등록", ALL),
    Event(d("2027-02-13"), d("2027-02-17"), "정시 충원 합격 통보 (마감일 18시)", ALL),
    Event(d("2027-02-18"), d("2027-02-18"), "정시 충원 등록 마감 (22시)", ALL),
    Event(d("2027-02-19"), d("2027-02-26"), "추가모집 (접수·전형·발표·등록, 등록 마감 22시)", ALL),
]
# (규칙, 기본사항 PDF 쪽) — 원문 확인 완료
RULES = [
    ("수시모집 합격자(최초 합격자 및 충원 합격자)는 정시모집 및 추가모집에 지원할 수 없다. (등록 여부와 무관)", "PDF 46쪽 복수지원 금지사항"),
    ("정시모집은 군별로 1회씩만 지원할 수 있다 (가·나·다군 최대 3회). 같은 군 대학 간 복수지원 금지.", "PDF 45~46쪽"),
    ("수시모집은 모든 전형을 합해 6회까지 지원할 수 있으며, 초과분은 무효.", "PDF 45~46쪽"),
]


def upcoming(today: date, track: str, n: int = 5) -> list[tuple[Event, int]]:
    """오늘 이후(진행 중 포함) 일정과 D-day."""
    out = [(e, (e.start - today).days) for e in EVENTS if e.end >= today and track in e.tracks]
    return out[:n]
