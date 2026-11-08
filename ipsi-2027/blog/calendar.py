"""F10 발행 캘린더 — 시의성 중심 추천 (기획안 v3). 날짜 구간은 대교협 2027 기본사항 일정 기준."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from .templates import TEMPLATES


@dataclass(frozen=True)
class Window:
    start: date
    end: date
    title: str
    picks: tuple[tuple[str, dict], ...]     # (post_type, params)
    why: str


D = date.fromisoformat
WINDOWS = [
    Window(D("2026-11-19"), D("2026-11-24"), "수능 당일·직후", (("timely_news", {"event": "수능 직후"}), ("susi_vs_jeongsi", {})),
           "가채점 직후 학과별 체크리스트와 수시 고사 응시 판단 수요"),
    Window(D("2026-11-25"), D("2026-12-10"), "수시 고사 기간", (("segment_guide", {"segment": "수시파이터"}), ("change_2027", {"topic": "N수생 증가"})),
           "논술·면접 시즌, 성적 발표 전 변화 해설"),
    Window(D("2026-12-11"), D("2026-12-17"), "수능 성적 발표", (("timely_news", {"event": "성적 발표"}), ("jeongsi_overview", {})),
           "실채점으로 학과별 환산점수 구조 해설 수요"),
    Window(D("2026-12-18"), D("2026-12-27"), "수시 발표·충원", (("segment_guide", {"segment": "현역 정시파이터"}), ("rival_compare", {})),
           "수시 결과별 정시 전략, 라이벌 학과 비교"),
    Window(D("2026-12-28"), D("2027-01-03"), "수시 이월 발표", (("timely_news", {"event": "수시 이월"}), ("rival_compare", {})),
           "학과별 이월 인원 속보 (대학 발표 수치를 출처와 함께 입력)"),
    Window(D("2027-01-04"), D("2027-01-10"), "정시 원서 접수", (("timely_news", {"event": "원서 경쟁률"}), ("jeongsi_overview", {})),
           "경쟁률 중간 점검 — 최종 경쟁률로 판단하라는 안내 포함"),
    Window(D("2027-01-11"), D("2027-02-04"), "정시 전형 기간", (("segment_guide", {"segment": "N수생"}), ("change_2027", {"topic": "2028 체제 변화"})),
           "발표 대기 기간 — 세그먼트·변화 해설"),
    Window(D("2027-02-05"), D("2027-02-26"), "정시 발표·충원·추가모집", (("timely_news", {"event": "충원 현황"}),),
           "충원 현황, 추가모집 안내"),
]


def window_for(day: date) -> Window | None:
    return next((w for w in WINDOWS if w.start <= day <= w.end), None)


def recommend(day: date, previous: list[dict] | None = None) -> list[dict]:
    """오늘 추천 포스트 유형. 같은 유형을 최근에 썼으면 뒤로 미룸(중복 방지)."""
    w = window_for(day)
    picks = list(w.picks) if w else [("change_2027", {"topic": "N수생 증가"}), ("jeongsi_overview", {})]
    used = {p["key"][2] for p in (previous or [])}
    picks.sort(key=lambda x: x[0] in used)
    return [{"type": t, "name": TEMPLATES[t].name, "params": prm, "window": w.title if w else "평시",
             "why": w.why if w else "시점형 이벤트가 없는 기간 — 해설·비교형", "recent_dup": t in used} for t, prm in picks]
