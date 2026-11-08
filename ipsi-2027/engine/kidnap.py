"""수시 납치 판단·수시 결과 시나리오 (F3).

규칙(대교협 기본사항 PDF 46쪽): 수시 합격자(최초·충원)는 등록 여부와 관계없이 정시·추가모집 지원 불가.
→ 수시 원서는 이미 냈으므로, 남은 선택은 '수능 이후 고사(논술·면접)에 응시할지'다. 결시하면 불합격 처리된다.

판단 재료: 대학 선호 순위(사용자) + 대학별 정시 예상 위치(합격 가능성 탭 판정 또는 사용자 입력).
"""
from __future__ import annotations

from dataclasses import dataclass

GOOD = ("안정", "적정")
WEAK = ("소신", "위험")


def _ga(word: str) -> str:
    """받침 유무로 이/가."""
    ch = word[-1]
    return word + ("이" if "가" <= ch <= "힣" and (ord(ch) - 0xAC00) % 28 else "가")


@dataclass
class KidnapVerdict:
    univ: str
    track: str
    verdict: str        # 응시 유지 | 재고 필요 | 수시 응시 강력 권장 | 판단 재료 부족 | 최저 미충족
    reason: str


def judge_app(univ: str, track: str, min_status: str, prefs: list[str], jeongsi_pos: dict[str, str]) -> KidnapVerdict:
    if min_status == "미충족":
        return KidnapVerdict(univ, track, "최저 미충족", "가채점 기준 최저를 못 맞춰 합격 가능성이 낮습니다(실채점으로 확정).")
    rank = {u: i for i, u in enumerate(prefs)}
    own = jeongsi_pos.get(univ, "모름")
    better = [u for u in prefs if univ in rank and rank[u] < rank[univ] and jeongsi_pos.get(u) in GOOD]
    if better:
        return KidnapVerdict(univ, track, "재고 필요",
                             f"정시로 더 선호하는 {', '.join(better)}에 {', '.join(jeongsi_pos[u] for u in better)} 가능성이 있습니다. "
                             "수시에 합격하면 등록하지 않아도 정시에 지원할 수 없습니다.")
    if own in WEAK:
        return KidnapVerdict(univ, track, "수시 응시 강력 권장",
                             f"정시로는 {_ga(univ)} {own} 수준입니다. 수시로 갈 수 있는 기회를 놓치지 않는 쪽이 유리합니다.")
    if own in GOOD:
        return KidnapVerdict(univ, track, "응시 유지",
                             f"정시로도 {univ} {own} 수준이고 더 선호하는 대학의 정시 가능성은 확인되지 않았습니다.")
    if univ not in rank:
        return KidnapVerdict(univ, track, "판단 재료 부족", "대학 선호 순위에 이 대학을 넣어 주세요.")
    return KidnapVerdict(univ, track, "판단 재료 부족", "이 대학과 더 선호하는 대학들의 정시 예상 위치를 입력해 주세요.")


def scenarios(results: dict[str, str], jeongsi_cards: list[str]) -> list[tuple[str, str]]:
    """results: {'대학·전형': 대기|합격|충원대기|불합격}, jeongsi_cards: 정시 후보 요약 문자열."""
    passed = [k for k, v in results.items() if v == "합격"]
    waiting = [k for k, v in results.items() if v in ("대기", "충원대기")]
    cards = ", ".join(jeongsi_cards) if jeongsi_cards else "합격 가능성 탭에서 후보를 고르세요"
    out = []
    if passed:
        out.append(("수시 합격 확정", f"{', '.join(passed)} 합격 — 등록 여부와 관계없이 정시·추가모집 지원 불가. "
                                  "여러 곳 합격 시 한 곳에만 등록(12.21~23)."))
        return out
    if waiting:
        out.append((f"대기 중인 수시가 하나라도 합격(충원 포함)하면", "정시 지원 불가 — 충원 마감 12.29 18시까지 연락 가능하게 유지"))
        out.append(("대기 중인 수시가 모두 불합격하면", f"정시 진행: {cards}"))
    else:
        out.append(("수시 전부 불합격", f"정시 진행: {cards}"))
    return out
