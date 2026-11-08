"""사용자 세그먼트(축 A 입시 성향 × 축 B 수험 이력) → 대시보드 구성. 기획안 v2 4장."""
from __future__ import annotations

from dataclasses import dataclass

TRACKS = {
    "수시": "수시파이터 — 수시 6장이 주력, 수능은 최저 충족 목적",
    "정시": "정시파이터 — 수시 미지원 또는 형식적 지원, 수능이 주력",
    "병행": "병행형 — 수시·정시 둘 다 실질적으로 노림",
}
HISTORIES = {
    "현역": "고3 재학생",
    "재수": "고교 졸업 후 두 번째 수능",
    "삼수": "세 번째 수능",
    "N수": "네 번째 이상",
    "반수": "대학 재학(휴학) 중 다시 응시",
    "검정고시": "검정고시 출신 (학생부 대체: 비교내신 등)",
}
RETAKE = {"재수", "삼수", "N수", "반수"}   # F8 재도전 판단 화면 노출 대상


@dataclass(frozen=True)
class Card:
    key: str
    title: str
    feature: str      # 기획안 기능 번호
    phase: str        # 구현 단계


C = {
    "min_check": Card("min_check", "수능 최저 충족 판정", "F3", "Phase 2"),
    "exam_cal": Card("exam_cal", "수능 이후 논술·면접 일정", "F3", "Phase 2"),
    "kidnap": Card("kidnap", "수시 납치 위험 점검", "F3", "Phase 5"),
    "jeongsi_backup": Card("jeongsi_backup", "정시 보험 (수시 불합격 시)", "F5", "Phase 4"),
    "grad_ok": Card("grad_ok", "졸업생 지원 가능 여부 (전형별)", "F2·F3", "Phase 2"),
    "jeongsi_compare": Card("jeongsi_compare", "수시 대학 vs 정시 예상 위치 비교", "F3·F5", "Phase 4"),
    "conversion": Card("conversion", "대학별 환산점수", "F4", "Phase 3"),
    "nsu_adjust": Card("nsu_adjust", "N수생 유입 보정 예측", "F5", "Phase 4"),
    "combo": Card("combo", "가/나/다 군 조합", "F6", "Phase 6"),
    "record_policy": Card("record_policy", "정시 학생부 반영·졸업생 처리", "F2", "Phase 3"),
    "retake": Card("retake", "재도전 판단 재료", "F8", "Phase 6"),
    "scenario_tree": Card("scenario_tree", "수시 결과 시나리오 트리 (전부 불합격 / A 합격 / 충원 대기)", "F3·F6", "Phase 4"),
    "ged_policy": Card("ged_policy", "대학별 검정고시 처리 방식", "F2", "Phase 3"),
    "current_univ": Card("current_univ", "현 소속 대학과 비교·이중등록 금지 일정", "F6", "Phase 6"),
}


def dashboard(track: str, history: str) -> list[Card]:
    """기획안 4장 '세그먼트별 대시보드 우선순위'를 그대로 옮긴 규칙."""
    if track == "병행":
        cards = ["scenario_tree", "min_check", "conversion", "combo"]
    elif track == "수시":
        cards = (["min_check", "exam_cal", "kidnap", "jeongsi_backup"] if history == "현역"
                 else ["min_check", "grad_ok", "jeongsi_compare"])
    else:  # 정시
        cards = (["conversion", "nsu_adjust", "combo"] if history == "현역"
                 else ["conversion", "record_policy", "combo", "retake"])
    if history == "검정고시" and "ged_policy" not in cards:
        cards.insert(1, "ged_policy")
    if history == "반수":
        cards.append("current_univ")
    if history in RETAKE and track != "정시" and "retake" not in cards:
        cards.append("retake")
    if history not in RETAKE:
        cards = [c for c in cards if c != "retake"]
    return [C[c] for c in dict.fromkeys(cards)]


def notes(track: str, history: str) -> list[str]:
    """세그먼트 고유 이슈 (기획안 4장 축 B 표). 단정·압박 표현 금지."""
    n = {
        "현역": "올해는 N수생 유입이 클 것으로 예상돼 정시 경쟁 환경이 전년과 다를 수 있습니다.",
        "재수": "2028학년도부터 수능·내신 체제가 바뀌므로, 다시 도전할 경우 조건이 달라진다는 점을 함께 고려하세요.",
        "삼수": "학생부 반영 대학에서는 오래된 학생부가 어떻게 처리되는지 확인해 두는 것이 좋습니다.",
        "N수": "결과를 받아들이는 것과 다시 도전하는 것 모두 정당한 선택입니다. 판단 재료는 '재도전 판단' 화면에 모아 둡니다.",
        "반수": "현 소속 대학과 이중등록은 금지됩니다. 등록 마감 일정을 놓치지 않도록 타임라인을 확인하세요.",
        "검정고시": "대학마다 검정고시 출신의 학생부 대체 방식(비교내신 등)이 다릅니다.",
    }[history]
    out = [n]
    if track in ("수시", "병행"):
        out.append("수시에 합격(충원 포함)하면 등록 여부와 관계없이 정시·추가모집에 지원할 수 없습니다.")
    return out
