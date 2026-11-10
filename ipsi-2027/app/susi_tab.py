"""4. 수시 대응 탭 (F3): 가채점 → 최저 판정, 수능 이후 고사 캘린더, 졸업생 자격 필터."""
from __future__ import annotations

from datetime import date

import streamlit as st

from engine import db
from engine.minreq import judge
from engine.kidnap import judge_app, scenarios
from engine.susi_data import calendar, load
from engine import admission as A

import ui

AREAS = [("국", "국어"), ("수", "수학"), ("영", "영어"), ("탐1", "탐구1"), ("탐2", "탐구2"), ("한국사", "한국사")]
STATUS_ICON = {"충족": "🟢 충족", "경계": "🟡 경계", "미충족": "🔴 미충족", "기준 없음": "⚪ 최저 없음"}
CSAT = date(2026, 11, 19)
WD = "월화수목금토일"


def _grades_input(con) -> tuple[dict, dict, str]:
    saved = db.get_state(con, "susi_grades", {})
    st.markdown("**가채점 등급**")
    st.caption("등급컷 근처라 한 등급 떨어질 수도 있으면 '한 등급 낮을 수도'를 체크하세요. 그러면 좋을 때와 나쁠 때를 모두 따져 판정합니다.")
    cols = st.columns(6)
    ranges = {}
    for i, (k, label) in enumerate(AREAS):
        with cols[i]:
            g = st.number_input(label, 1, 9, int(saved.get(k, [2, 2])[0]), key=f"g_{k}")
            edge = st.checkbox("한 등급 낮을 수도", value=saved.get(k, [2, 2])[1] > saved.get(k, [2, 2])[0], key=f"e_{k}")
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
    st.caption("20개 대학 2027 수시 모집요강을 옮긴 값입니다(검증 필요). 카드 아래 요강 기준과 쪽수로 꼭 대조하세요.")

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
        rows, chosen, statuses = [], [], []
        for label in sel:
            t, gi = options[label]
            g = t.groups[gi]
            v = judge(g.rule, ranges, inq_types, math_el)
            chosen.append(t)
            statuses.append((t, g, v.status))
            detail = (v.optimistic.detail if v.optimistic else "")
            if v.status == "경계":
                detail = f"등급이 좋게 나오면 충족, 한 등급 낮으면 못 맞춥니다. 갈리는 과목: {', '.join(v.swing)}"
            elif v.status == "미충족" and v.pessimistic:
                detail = v.optimistic.detail
            rows.append({"판정": STATUS_ICON[v.status], "대학": t.univ_name, "전형": t.name, "모집단위": g.units,
                         "근거": detail, "기준(정리)": g.text,
                         "요강 원문": f"{t.min_text} (p.{t.min_page})"})
        n0 = {k: sum(x[2] == k for x in statuses) for k in STATUS_ICON}
        ui.chips([(k, f"{ui.LABEL[k]} {n0[k]}") for k in ("충족", "경계", "미충족", "기준 없음") if n0[k]])
        for r, (t, g, stt) in zip(rows, statuses):
            ui.show(ui.card(t.univ_name, t.name, ui.row(stt, g.units, (r["근거"] or "수능 최저가 없는 전형입니다.").replace("최선 조합", "가장 유리한 조합")),
                            foot=f"요강 기준: {ui.e(t.min_text)} · {t.min_page}쪽"))
        with st.expander("표로 보기"):
            st.dataframe(rows, hide_index=True, use_container_width=True)
        n = {s: sum(r["판정"] == STATUS_ICON[s] for r in rows) for s in STATUS_ICON}
        st.caption("아슬아슬한 전형은 실채점(12월 11일 성적 통지)으로 확정됩니다. 미충족이 확실한 전형의 고사 응시 여부는 본인 판단이지만, "
                   "아슬아슬한 전형은 응시해 두는 쪽이 선택지를 남깁니다.")

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
        _kidnap(con, statuses)

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


GRADES = ["모름", "안정", "적정", "소신", "위험"]
UNIVS = ["서울대", "연세대", "고려대", "서강대", "성균관대", "한양대", "중앙대", "경희대", "한국외대", "서울시립대", "이화여대",
         "건국대", "동국대", "홍익대", "숙명여대", "국민대", "숭실대", "세종대", "광운대", "서울과기대"]
V_ICON = {"재고 필요": "🟠 재고 필요", "수시 응시 강력 권장": "🟢 응시 강력 권장", "응시 유지": "🔵 응시 유지",
          "판단 재료 부족": "⚪ 판단 재료 부족", "최저 미충족": "🔴 최저 미충족"}


def _admission_cards(con) -> list[str]:
    sv = db.get_state(con, "js_scores")
    if not sv:
        return []
    pct = {"kor": sv["kor_p"], "math": sv["mat_p"], "inq": (sv["t1p"] + sv["t2p"]) / 2}
    out = []
    recs = A.load_results()
    for u in sorted({r.univ for r in recs}):
        latest = max(r.year for r in recs if r.univ == u)
        for unit in db.get_state(con, f"adm_units_{u}", []):
            rec = next((r for r in recs if r.univ == u and r.year == latest and r.unit == unit), None)
            a = rec and A.assess(rec, pct, int(sv["eng"]))
            if a:
                out.append(f"{ {'dongguk': '동국대'}.get(u, u)} {unit}({rec.group}군 {a.grade})")
    return out


def _kidnap(con, statuses) -> None:
    st.subheader("수시 납치 점검")
    st.caption("수시 원서는 이미 냈으므로 남은 선택은 '수능 이후 고사에 응시할지'입니다(결시하면 불합격 처리). "
               "아래 판단은 선택을 대신하지 않고 재료를 정리합니다. 정시 예상 위치는 '정시 · 합격 가능성' 판정이나 학원 모의지원 결과를 참고해 넣으세요.")
    prefs = st.multiselect("대학 선호 순위 (먼저 고른 대학이 더 선호)", UNIVS, default=db.get_state(con, "susi_prefs", []))
    pos_saved = db.get_state(con, "jeongsi_pos", {})
    targets = list(dict.fromkeys(prefs + [t.univ_name for t, _, _ in statuses]))
    cols = st.columns(4)
    pos = {}
    for i, u in enumerate(targets):
        pos[u] = cols[i % 4].selectbox(f"{u} 정시 예상", GRADES, index=GRADES.index(pos_saved.get(u, "모름")), key=f"jp_{u}")
    if st.button("선호 순위·정시 예상 저장"):
        db.set_state(con, "susi_prefs", prefs)
        db.set_state(con, "jeongsi_pos", pos)
        st.success("저장했습니다.")
    rows = []
    for t, g, status in statuses:
        v = judge_app(t.univ_name, t.name, status, prefs, pos)
        exams = [e for e in t.events if e.kind in ("논술", "면접") and e.date >= CSAT]
        rows.append({"판단": V_ICON[v.verdict], "대학": t.univ_name, "전형": t.name, "최저": status,
                     "수능 후 고사": ", ".join(f"{e.kind} {e.date:%m/%d}" for e in exams) or "없음(서류·교과)",
                     "근거": v.reason})
    st.dataframe(rows, hide_index=True, use_container_width=True, column_config={"근거": st.column_config.TextColumn(width="large")})
    st.caption("반대 경우도 점검합니다: 수시로 갈 수 있는 대학이 정시로는 소신·위험이면 '응시 강력 권장'으로 표시합니다.")

    st.subheader("수시 결과별 정시 시나리오")
    res_saved = db.get_state(con, "susi_results", {})
    results = {}
    rc = st.columns(3)
    for i, (t, g, status) in enumerate(statuses):
        k = f"{t.univ_name} {t.name}"
        opts = ["대기", "합격", "충원대기", "불합격"]
        results[k] = rc[i % 3].selectbox(k, opts, index=opts.index(res_saved.get(k, "대기")), key=f"sr_{i}")
    if st.button("수시 결과 저장"):
        db.set_state(con, "susi_results", results)
        st.success("저장했습니다.")
    for cond, action in scenarios(results, _admission_cards(con)):
        st.markdown(f"- **{cond}** → {action}")
