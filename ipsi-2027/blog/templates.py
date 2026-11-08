"""F10 포스트 템플릿 6종 — 소제목 구조와 필수 데이터 필드 정의.

필드 키는 앱 DB(v2 스키마) 경로를 따른다.
  program.*        programs 테이블 (모집단위)
  jeongsi.*        jeongsi_rules
  susi.*           susi_live
  past[]           past_results (연도별)
  carryover.*      carryover
  insights[]       insights (학원·유튜브 — '참고 의견'으로만 표시)
  timeline.*       docs/context.md 일정 (대교협 기본사항)
required=True 필드가 비어 있으면 해당 유형으로 생성 불가.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Section:
    key: str
    heading: str              # 본문 소제목(문구 틀). {univ} {dept} {year} 치환
    purpose: str              # 이 섹션이 하는 일
    fields: tuple[str, ...] = ()
    required: bool = True     # False: 데이터 없으면 섹션 생략


@dataclass(frozen=True)
class PostTemplate:
    id: str
    name: str
    univ_count: tuple[int, int]   # (최소, 최대) 학교 수
    phase: str
    sections: tuple[Section, ...]
    title_keywords: tuple[str, ...]
    status: str = "설계"          # 구현 / 설계


# 모든 유형 공통으로 앞뒤에 붙는 섹션
HEAD = Section("summary3", "(소제목 없음) 첫 3줄 요약",
               "스크롤을 멈추게 하는 핵심 숫자·결론 3줄", ("자동: 유형별 핵심 수치 3개",))
TAIL = (
    Section("checkbox", "📌 지원 전 체크 3가지", "요약 박스", ("자동: 본문 수치에서 도출",)),
    Section("author", "✍️ 필자의 한마디", "필자 메모를 녹인 고유 관점 (메모 없으면 내보내기 비활성화)", ("author_memo",)),
    Section("question", "(소제목 없음) 독자 참여 질문", "댓글 유도 질문 1개", ()),
    Section("sources", "출처", "모든 수치의 문서명·페이지·URL·수집일", ("sources[]",)),
    Section("disclaimer", "(소제목 없음) 고지", "'2027학년도 ○월 ○일 기준, 최종 지원 전 대학 모집요강 확인' + 광고 표기(해당 시)",
            ("data_snapshot_date",)),
)


def _t(id, name, uc, phase, body, kw, status="설계"):
    return PostTemplate(id, name, uc, phase, (HEAD, *body, *TAIL), kw, status)


TEMPLATES: dict[str, PostTemplate] = {t.id: t for t in [
    _t("jeongsi_overview", "① 학과 정시 총정리", (1, 1), "Phase 3 (~12/5)", (
        Section("quota", "{univ} {dept} 2027 정시, 몇 명 뽑나", "모집군·인원·전년 대비 증감",
                ("program.name", "jeongsi.group", "jeongsi.quota_2027", "jeongsi.quota_2026")),
        Section("ratio", "수능 반영비율 — 어떤 과목이 무거울까", "영역별 반영비율·활용지표·탐구 개수·선택과목 조건 + 비율 차트",
                ("jeongsi.ratio", "jeongsi.score_index", "jeongsi.inquiry_count", "jeongsi.elective_rule")),
        Section("eng_hist", "영어·한국사는 이렇게 환산된다", "등급별 환산표(감점 폭 강조)",
                ("jeongsi.eng_table", "jeongsi.hist_table")),
        Section("record", "학생부도 보나? 졸업생·검정고시는?", "학생부 반영 여부·졸업연도별 처리·검정고시 처리",
                ("jeongsi.record_reflect", "jeongsi.grad_record_policy", "jeongsi.ged_policy")),
        Section("past", "최근 3년 입결 (참고치)", "50%/70% 컷·경쟁률·충원율 표 + 추이 차트. '참고치' 명시",
                ("past[].year", "past[].cut50", "past[].cut70", "past[].competition", "past[].fill_rate")),
        Section("factors", "2027에 달라지는 변수", "N수생 증가·안정 지원 등 환경 보정 요인 (학원 관점 배지)",
                ("insights[]",), required=False),
    ), ("{univ} {dept} 정시", "2027", "모집인원", "반영비율", "입결"), status="구현"),

    _t("rival_compare", "② 라이벌 학과 비교", (2, 4), "Phase 3 (~12/5)", (
        Section("table", "{univs} {dept} 한눈에 비교", "군·인원·반영비율·영어 감점·학생부 비교표",
                ("program.name[]", "jeongsi.group[]", "jeongsi.quota_2027[]", "jeongsi.ratio[]", "jeongsi.eng_table[]", "jeongsi.record_reflect[]")),
        Section("structure", "어떤 점수 구조에 유리할까", "수학 강세/국어 강세/탐구 강세별 유리 학교(반영비율 기반 자동 도출)",
                ("jeongsi.ratio[]", "jeongsi.score_index[]")),
        Section("past", "전년 입결 나란히 보기 (참고치)", "학교별 70%컷·경쟁률·충원율. 환산 만점이 다르면 백분위 기준 병기",
                ("past[].cut70[]", "past[].competition[]", "past[].fill_rate[]")),
        Section("combo", "같은 군? 다른 군? 조합 포인트", "모집군이 겹치면 택1, 다르면 동시 지원 가능 안내",
                ("jeongsi.group[]",)),
    ), ("{univs} {dept} 비교", "2027 정시", "반영비율"), status="구현"),

    _t("susi_vs_jeongsi", "③ 수시 vs 정시 경로 비교", (1, 1), "Phase 5 (구현)", (
        Section("susi_list", "{univ} {dept} 수시, 수능 이후 남은 전형", "전형명·인원·최저·논술/면접일·발표일",
                ("susi[].name", "susi[].quota", "susi[].min_req", "susi[].exam_date", "susi[].announce_date")),
        Section("eligibility", "졸업생도 지원할 수 있나", "전형별 졸업생 가능 여부·졸업연도 제한",
                ("susi[].eligibility_grad_ok", "susi[].grad_year_limit")),
        Section("jeongsi", "정시로 가면", "정시 군·인원·반영비율 요약", ("jeongsi.group", "jeongsi.quota_2027", "jeongsi.ratio")),
        Section("kidnap", "수시 납치 vs 수시 포기, 무엇을 볼까", "정시 예상 위치와 수시 대학 수준 비교 기준 (F3 연계)",
                ("past[].cut70", "insights[]")),
        Section("rule", "꼭 알아둘 규칙", "수시 합격(충원 포함) 시 정시·추가모집 지원 불가", ("timeline.susi_rule",)),
    ), ("{univ} {dept} 수시", "정시", "최저", "논술"), status="구현"),

    _t("timely_news", "④ 시점형 속보", (1, 4), "Phase 5 (구현)", (
        Section("what", "[{event}] 지금 무슨 일이", "이벤트 요약(수능 직후/성적 발표/이월 발표/원서 경쟁률/충원)",
                ("timeline.event", "timeline.date")),
        Section("numbers", "{univ} {dept} 숫자로 보기", "이벤트별 데이터: 이월 인원 / 실시간 경쟁률 / 충원 차수",
                ("carryover.added_quota", "carryover.announced_at", "live.competition", "live.fill_round"), required=False),
        Section("impact", "이 숫자가 의미하는 것", "최종 모집인원 변화·전년 대비 비교 (단정 금지)", ("jeongsi.quota_2027", "past[].competition")),
        Section("todo", "다음 할 일 (D-day)", "세그먼트별 다음 액션", ("timeline.next[]",)),
    ), ("{univ} {dept}", "{event}", "2027"), status="구현"),

    _t("segment_guide", "⑤ 세그먼트형 가이드", (1, 2), "Phase 5 (구현)", (
        Section("who", "{segment}가 {univ} {dept}를 노린다면", "대상 세그먼트 정의와 이 글의 범위", ("audience.segment",)),
        Section("rules", "{segment}에게 달라지는 전형 조건", "졸업생 학생부 처리·검정고시·수시 졸업생 자격",
                ("jeongsi.grad_record_policy", "jeongsi.ged_policy", "susi[].eligibility_grad_ok")),
        Section("position", "경쟁 환경 — 올해는 누구와 겨루나", "N수생 유입·안정 지원 등 환경 요인 (학원 관점 배지)",
                ("insights[]",)),
        Section("checklist", "{segment} 체크리스트", "세그먼트별 판단 재료 (N수·반수는 중립 톤, F8 연계)", ("segment.checklist[]",)),
    ), ("{segment}", "{univ} {dept}", "2027 정시"), status="구현"),

    _t("change_2027", "⑥ 2027 변화 해설", (1, 4), "Phase 5 (구현)", (
        Section("change", "2027 {topic}, 무엇이 바뀌었나", "변화 주제(무전공·사탐런·확통런·N수 증가) 사실 정리",
                ("change.topic", "change.facts[]")),
        Section("dept_link", "{univ} {dept}에는 어떤 영향?", "모집인원·선택과목 조건·반영비율과 연결",
                ("jeongsi.quota_2027", "jeongsi.quota_2026", "jeongsi.elective_rule")),
        Section("views", "기관별 전망 비교", "종로·대성·메가 등 의견을 나란히 (학원 관점 배지, 출처당 짧은 인용 1회)",
                ("insights[].org", "insights[].summary", "insights[].evidence_type")),
        Section("so_what", "그래서 수험생은 무엇을 확인할까", "확인 항목 3~5개 (단정 금지)", ()),
    ), ("2027", "{topic}", "{univ} {dept}"), status="구현"),
]}


def templates_markdown() -> str:
    lines = ["# F10 블로그 포스트 템플릿 6종", "",
             "> `blog/templates.py` 에서 자동 생성 (`python -m blog.build_docs`). 직접 수정하지 말 것.", "",
             "모든 유형은 **첫 3줄 요약 → 본문 소제목 → 체크 3가지 → 필자의 한마디 → 참여 질문 → 출처 → 고지** 순서를 공유한다.", ""]
    for t in TEMPLATES.values():
        lines += [f"## {t.name}  (`{t.id}`)", "",
                  f"- 학교 수: {t.univ_count[0]}~{t.univ_count[1]}개 · 적용 단계: {t.phase} · 상태: **{t.status}**",
                  f"- 검색형 제목 키워드: {', '.join(t.title_keywords)}", "",
                  "| # | 소제목 | 역할 | 필수 데이터 필드 | 필수 |", "|---|---|---|---|---|"]
        for i, s in enumerate(t.sections, 1):
            f = "<br>".join(f"`{x}`" for x in s.fields) or "—"
            lines.append(f"| {i} | {s.heading} | {s.purpose} | {f} | {'●' if s.required else '선택'} |")
        lines.append("")
    return "\n".join(lines)
