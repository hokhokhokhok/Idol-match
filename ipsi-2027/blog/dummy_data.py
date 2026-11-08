"""샘플 미리보기용 더미 데이터 — '연세대 경영학과'.

⚠️ 아래 수치는 전부 가상값이다(status='더미'). 실제 2027 모집요강·입결이 아니다.
Phase 1~3에서 data/parsed 의 공식 데이터로 교체되기 전까지 발행에 쓰면 안 된다.
인사이트 문장은 기획안 2장(환경 가정)을 옮긴 것이며 원문 URL 검증 전이라 '검증 필요'.
"""
from __future__ import annotations

from .models import SV, Source

DUMMY = Source(doc="샘플용 더미 데이터 (실제 모집요강 아님)", url="about:blank",
               collected_at="2026-11-08", kind="더미")


def d(v, note=""):
    return SV(v, DUMMY, "더미", note)


def _insight(org, text, url_hint):
    src = Source(doc=f"{org} 공개 분석 (언론 보도 경유)", url=url_hint, collected_at="2026-11-08", kind="학원")
    return SV(text, src, "검증 필요", "기획안 2장 기재 내용 — 원문 확인 전")


YONSEI_BUSINESS = {
    "univ": {"id": "yonsei", "name": "연세대", "full_name": "연세대학교"},
    "program": {"name": d("경영학과"), "college": d("경영대학"), "track": d("인문")},
    "jeongsi": {
        "group": d("나군"),
        "quota_2027": d(98),
        "quota_2026": d(103),
        "score_index": d("국어·수학 표준점수, 탐구 변환표준점수"),
        "ratio": d({"국어": 30.0, "수학": 35.0, "영어": 10.0, "탐구": 25.0}),
        "inquiry_count": d(2),
        "elective_rule": d("선택과목 지정 없음 (사탐·과탐 모두 가능)"),
        "total_points": d(1000),
        "eng_table": d({1: 100, 2: 95, 3: 87.5, 4: 75, 5: 60, 6: 40, 7: 25, 8: 12.5, 9: 0}),
        "hist_table": d({"1~4등급": 0, "5등급": -0.4, "6등급": -0.8, "7등급": -1.2, "8등급": -1.6, "9등급": -2.0}),
        "record_reflect": d("반영 (교과평가 5%, 수능 95%)"),
        "grad_record_policy": d("졸업연도와 관계없이 동일 기준으로 교과평가 (졸업생도 학생부 확인 필요)"),
        "ged_policy": d("검정고시 출신은 수능 성적 기반 비교내신 적용"),
        "tie_break": d("수학 → 국어 → 탐구 환산점수 순"),
    },
    "past": [
        {"year": 2024, "cut50": d(735.4), "cut70": d(731.9), "competition": d(4.12), "fill_rate": d(88.0)},
        {"year": 2025, "cut50": d(738.1), "cut70": d(734.6), "competition": d(3.87), "fill_rate": d(104.2)},
        {"year": 2026, "cut50": d(736.8), "cut70": d(733.0), "competition": d(4.45), "fill_rate": d(92.5)},
    ],
    "insights": [
        _insight("종로학원", "2027학년도 N수생 규모가 23년 만에 최대로 예상되고, 반수생·사탐런·확통런도 최대 수준이라는 분석.",
                 "(수집 예정)"),
        _insight("메가스터디", "개편 전 마지막 수능이라 정시에서 안정 지원 성향이 강해질 수 있다는 전망.", "(수집 예정)"),
        _insight("대성학원", "2027 정시 모집인원은 전년보다 줄고, 대학별 학생부 반영·환산 방식이 바뀌는 곳이 있다는 분석.",
                 "(수집 예정)"),
    ],
    "data_snapshot_date": "2026-11-08",
}

UNIVERSITIES = {"yonsei": YONSEI_BUSINESS}
