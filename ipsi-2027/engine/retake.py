"""재도전 판단 재료 (F8, N수·반수 전용). 결정을 대신하지 않는다.

- 점수 추이는 '본인 기록'으로만 계산한다(외부 평균 향상폭 같은 일반화 수치는 쓰지 않음).
- 2028 체제 변화는 출처 있는 인사이트(topic '2028 체제 변화')에서 가져온다.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Exam:
    label: str          # 예: 2025 6월 모평, 2025 수능
    kor: float
    math: float
    inq: float
    is_csat: bool

    @property
    def avg(self) -> float:
        return (self.kor + self.math + self.inq) / 3


def trend(exams: list[Exam]) -> dict:
    """본인 기록 기준 변화. 수능끼리, 같은 해 모평→수능 변화를 따로 본다."""
    csat = [e for e in exams if e.is_csat]
    out = {"n": len(exams), "csat_n": len(csat), "csat_deltas": [], "best": None, "last": None, "mock_to_csat": []}
    if exams:
        out["best"] = max(exams, key=lambda e: e.avg)
        out["last"] = exams[-1]
    for a, b in zip(csat, csat[1:]):
        out["csat_deltas"].append((f"{a.label} → {b.label}", round(b.avg - a.avg, 1)))
    # 같은 해 모평 → 그해 수능 (라벨 앞 4글자가 연도인 경우)
    for c in csat:
        year = c.label[:4]
        mocks = [e for e in exams if not e.is_csat and e.label[:4] == year]
        if mocks:
            out["mock_to_csat"].append((f"{year} 모평 평균 → 수능", round(c.avg - sum(m.avg for m in mocks) / len(mocks), 1)))
    return out


def reality_lines(t: dict) -> list[str]:
    """중립적인 문장으로 정리. 단정·압박 표현 금지."""
    lines = []
    if t["csat_n"] < 2:
        lines.append("수능 기록이 1회 이하라 수능 간 변화는 계산하지 않았습니다. 모의평가와 수능의 차이를 함께 보세요.")
    else:
        ds = [d for _, d in t["csat_deltas"]]
        lines.append(f"본인 수능 기록 {t['csat_n']}회 기준, 수능 간 평균 백분위 변화는 " +
                     ", ".join(f"{lab}: {d:+.1f}" for lab, d in t["csat_deltas"]) + "입니다.")
        if len(ds) >= 2 and ds[-1] < ds[0]:
            lines.append("최근 변화폭이 이전보다 작습니다. 다음 시험에서 같은 폭을 기대할 수 있을지 본인 공부 방식의 변화와 함께 점검해 보세요.")
    for lab, d in t["mock_to_csat"]:
        lines.append(f"{lab}: {d:+.1f} — 모평 성적이 수능에서 그대로 이어졌는지 보는 참고치입니다.")
    return lines


CHECK_HALF = [
    "지금 대학(또는 올해 합격 대학)에 등록 후 휴학이 가능한지 — 신입생 첫 학기 휴학을 제한하는 대학이 있음 (예: 홍익대 수시요강 14쪽 '입학 후 1년간 휴학 불가')",
    "등록금·생활비 부담과 학점 관리를 병행할 수 있는지",
    "다음 해 합격 시 현 소속 대학과의 이중등록 금지 — 등록 포기·자퇴 시점",
    "학교생활과 수능 공부를 병행할 시간 계획",
]
CHECK_FULL = [
    "1년을 온전히 수능에 쓸 수 있는 환경(학원·독학·비용)",
    "2028학년도부터 바뀌는 수능·내신 체제와 N수생 수시 지원 조건",
    "올해 약점 영역이 무엇이고, 그 원인을 바꿀 구체적 방법이 있는지",
    "심리적 소진 정도 — 주변 사람·전문 상담과 함께 점검",
]
CHECK_ACCEPT = [
    "올해 결과 중 가장 만족스러운 선택지에서 할 수 있는 것(전공 탐색, 복수전공·전과 제도)",
    "학교 안에서 진로를 넓힐 수 있는 경로(편입학·대학원 등) — 각 대학 학사 규정 확인",
    "결과를 받아들이는 것도 충분히 정당한 선택이라는 점",
]
