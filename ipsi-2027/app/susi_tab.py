"""4. 수시 대응 탭 (F3): 가채점 → 최저 판정, 수능 이후 고사 캘린더, 졸업생 자격 필터."""
from __future__ import annotations

from datetime import date

import streamlit as st

from engine import db
from engine.minreq import judge
from engine.susi_data import calendar, load

AREAS = [("국", "국어"), ("수", "수학"), ("영", "영어"), ("탐1", "탐구1"), ("탐2", "탐구2"), ("한국사", "한국사")]
STATUS_ICON = {"충족": "🟢 충족", "경계": "🟡 경계", "미충족": "🔴 미충족", "기준 없음": "⚪ 최저 없음"}
CSAT = date(2026, 11, 19)
WD = "월화수목금토일"


def _grades_input(con) -> tuple[dict, dict, str]:
    saved = db.get_state(con, "susi_grades", {})
    st.markdown("**가채점 등급** — 등급컷 근처라 한 등급 내려갈 수 있으면 '경계'를 체크하세요. "
                "기관별 예상 등급컷은 수능 당일 저녁부터 발표되니, 여러 기관 컷을 보고 보수적으로 넣는 걸 권합니다.")
    cols = st.columns(6)
    ranges = {}
    for i, (k, label) in enumerate(AREAS):
        with cols[i]:
            g = st.number_input(label, 1, 9, int(saved.get(k, [2, 2])[0]), key=f"g_{k}")
            edge = st.checkbox("경계", value=saved.get(k, [2, 2])[1] > saved.get(k, [2, 2])[0], key=f"e_{k}")
            ranges[k] = (g, min(g + 1, 9) if edge else g)
    c1, c2, c3 = st.columns(3)
    t1 = c1.selectbox("탐구1 종류", ["사탐", "과탐"], index=["사탐", "과탐"].index(saved.get("_t1", "사탐")))
    t2 = c2.selectbox("탐구2 종류", ["사탐", "과탐"], index=["사탐", "과탐"].index(saved.get("_t2", "사탐")))
    maths = ["확률과 통계", "미적분", "기하"]
    m = c3.selectbox("수학 선택과목", maths, index=maths.index(saved.get("_m", "확률과 통계")))
    if st.button("가채점 저장 (이 기기에만)"):
        db.set_state(con, "susi_grades", {**{k: list(v) for k, v in ranges.items()}, "_t1": t1, "_t2": t2, "_m": m})
        st.success("저장했습니다.")
    return ranges, {"탐1": t1, "탐2": t2}, m


def render(con, profile: dict | None) -> None:
    tracks, errors = load()
    if errors:
        st.error("데이터 검증 오류: " + "; ".join(errors))
    st.caption("데이터: 20개교 2027 수시 모집요강을 사람이 읽고 옮긴 값입니다(상태: **검증 필요**). "
               "판정 옆 원문 발췌·쪽수로 반드시 대조하고, 최종 판단은 대학 공식 요강으로 하세요.")

    # ---------- 졸업생 자격 ----------
    hist = (profile or {}).get("history_type") or "현역"
    with st.expander(f"지원 자격 기준 · 수험 이력: {hist}", expanded=False):
        default_year = 2027 if hist == "현역" else 2026
        grad_year = st.number_input("고교 졸업(예정) 연도 (2월 졸업 기준)", 2005, 2027,
                                    int(db.get_state(con, "grad_year", default_year)))
        ged = st.checkbox("검정고시 출신", value=(hist == "검정고시"))
        if st.button("자격 기준 저장"):
            db.set_state(con, "grad_year", grad_year)
            st.success("저장했습니다.")

    # ---------- 성적 ----------
    ranges, inq_types, math_el = _grades_input(con)

    # ---------- 내 수시 지원 ----------
    st.divider()
    st.subheader("내 수시 지원 (최대 6장)")
    only_ok = st.toggle("내가 지원 가능한 전형만 보기", value=True)
    options = {}
    for t in tracks:
        el = t.eligibility(grad_year, ged)
        if only_ok and el == "불가":
            continue
        for gi, g in enumerate(t.groups):
            label = f"{t.univ_name} · {t.name} · {g.units}" + ("" if el == "가능" else f"  [{el}]")
            options[label] = (t, gi)
    saved_sel = [s for s in db.get_state(con, "susi_apps", []) if s in options]
    sel = st.multiselect("대학 · 전형 · 모집단위 그룹", list(options), default=saved_sel, max_selections=6)
    if st.button("지원 목록 저장"):
        db.set_state(con, "susi_apps", sel)
        st.success("저장했습니다.")
    if not sel:
        st.info("지원한 전형을 고르면 최저 판정과 고사 캘린더가 나옵니다. 아래 '전체 전형 보기'에서 기준을 먼저 둘러볼 수 있어요.")

    # ---------- 판정 ----------
    if sel:
        st.subheader("수능 최저 판정")
        rows, chosen = [], []
        for label in sel:
            t, gi = options[label]
            g = t.groups[gi]
            v = judge(g.rule, ranges, inq_types, math_el)
            chosen.append(t)
            detail = (v.optimistic.detail if v.optimistic else "")
            if v.status == "경계":
                detail = f"낙관: {v.optimistic.detail} / 비관: {v.pessimistic.detail} · 결과를 가르는 영역: {', '.join(v.swing)}"
            elif v.status == "미충족" and v.pessimistic:
                detail = v.optimistic.detail
            rows.append({"판정": STATUS_ICON[v.status], "대학": t.univ_name, "전형": t.name, "모집단위": g.units,
                         "근거": detail, "기준(정리)": g.text,
                         "요강 원문": f"{t.min_text} (p.{t.min_page})"})
        st.dataframe(rows, hide_index=True, use_container_width=True,
                     column_config={"근거": st.column_config.TextColumn(width="large"),
                                    "요강 원문": st.column_config.TextColumn(width="large")})
        n = {s: sum(r["판정"] == STATUS_ICON[s] for r in rows) for s in STATUS_ICON}
        st.caption(f"충족 {n['충족']} · 경계 {n['경계']} · 미충족 {n['미충족']} · 최저 없음 {n['기준 없음']}. "
                   "경계는 실채점(12월 11일 성적 통지)으로 확정됩니다. 미충족이 확실한 전형의 고사 응시 여부는 본인 판단이지만, "
                   "경계인 전형은 응시해 두는 쪽이 선택지를 남깁니다.")

        # ---------- 캘린더 ----------
        st.subheader("수능 이후 일정")
        cal = calendar(chosen, since=CSAT)
        if not cal:
            st.write("수능 이후 일정이 없습니다.")
        else:
            if any(r["conflict"] for r in cal):
                st.warning("같은 날 고사가 2개 이상 있습니다. '대상/비고'의 계열(인문/자연)이 내 지원 계열과 다르면 실제로는 겹치지 않을 수 있습니다. "
                           "시간대(오전/오후)와 이동 시간을 각 대학 공지로 꼭 확인하세요.")
            st.dataframe([{"날짜": f"{r['date']:%m/%d}({WD[r['date'].weekday()]})", "일정": r["kind"], "대학": r["univ"], "전형": r["track"],
                           "대상/비고": " ".join(x for x in (r["units"], r["note"]) if x),
                           "겹침": "⚠️" if r["conflict"] else ""} for r in cal],
                         hide_index=True, use_container_width=True)
        st.caption("수시 합격(충원 포함) 시 등록 여부와 관계없이 정시·추가모집에 지원할 수 없습니다 (대교협 기본사항 PDF 46쪽).")

    # ---------- 전체 보기 ----------
    with st.expander("전체 전형 보기 (20개교)", expanded=not sel):
        kinds = st.multiselect("전형 유형", ["교과", "종합", "논술"], default=["교과", "종합", "논술"])
        only_min = st.checkbox("최저 있는 전형만", value=False)
        allrows = []
        for t in tracks:
            if t.type not in kinds or (only_min and not t.has_min):
                continue
            el = t.eligibility(grad_year, ged)
            exams = [e for e in t.events if e.kind in ("면접", "논술") and e.date >= CSAT]
            for g in t.groups:
                allrows.append({"대학": t.univ_name, "전형": t.name, "유형": t.type, "모집단위": g.units,
                                "최저(정리)": g.text, "내 자격": el, "자격 조건": t.grad_note,
                                "수능 후 고사": ", ".join(f"{e.kind} {e.date:%m/%d}" for e in exams) or "-",
                                "발표": next((f"{e.date:%m/%d}" for e in t.events if e.kind == "최초합격발표"), "-")})
        st.dataframe(allrows, hide_index=True, use_container_width=True)
        st.caption("범위: 대학별 일반 전형(교과·종합·논술) 위주. 기회균형·특기자·실기·정원외 전형은 아직 정리하지 않았습니다.")
