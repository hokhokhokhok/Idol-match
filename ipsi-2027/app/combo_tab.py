"""6. 가/나/다 전략 보드 (F6)."""
from __future__ import annotations

import streamlit as st

from engine import admission as A
from engine import combo as CB
from engine import db

UNAME = {"dongguk": "동국대"}
GRADES = ["안정", "적정", "소신", "위험"]


def _auto(con) -> list[dict]:
    sv = db.get_state(con, "js_scores")
    if not sv:
        return []
    pct = {"kor": sv["kor_p"], "math": sv["mat_p"], "inq": (sv["t1p"] + sv["t2p"]) / 2}
    recs = A.load_results()
    out = []
    for u in sorted({r.univ for r in recs}):
        latest = max(r.year for r in recs if r.univ == u)
        extra = db.get_state(con, f"adm_extra_{u}", {})
        for unit in db.get_state(con, f"adm_units_{u}", []):
            rec = next((r for r in recs if r.univ == u and r.year == latest and r.unit == unit), None)
            if not rec:
                continue
            e = extra.get(unit, {})
            a = A.assess(rec, pct, int(sv["eng"]), quota_2027=e.get("q") or None, carryover=int(e.get("c") or 0))
            if a:
                out.append({"대학": UNAME.get(u, u), "모집단위": unit, "군": rec.group, "판정": a.grade, "출처": "자동 판정"})
    return out


def render(con, profile: dict | None) -> None:
    st.caption("후보는 합격 가능성 탭의 자동 판정(입결 있는 대학)과, 직접 넣은 후보(학원 모의지원 판정 등)를 합칩니다. "
               "판정별 합격 확률은 근거 데이터가 없는 가정값이므로 아래에서 조절하세요. 추천은 판단 재료이며 합격을 보장하지 않습니다.")
    res = db.get_state(con, "susi_results", {})
    passed = [k for k, v in res.items() if v == "합격"]
    if passed:
        st.error(f"수시 합격({', '.join(passed)}) — 등록 여부와 관계없이 정시에 지원할 수 없습니다(대교협 기본사항 PDF 46쪽).")
        return
    if any(v in ("대기", "충원대기") for v in res.values()):
        st.info("대기 중인 수시가 있습니다. 하나라도 합격(충원 포함)하면 아래 조합은 쓸 수 없습니다.")

    hist = (profile or {}).get("history_type") or "현역"
    # ---------- 프리셋 ----------
    current_pref = None
    if hist in ("재수", "삼수", "N수"):
        will = st.radio("재도전 의사", ["낮음 — 올해 결과를 받아들일 생각", "있음 — 원하는 곳이 아니면 다시 볼 생각"], horizontal=True)
        default = "안정 우선" if will.startswith("낮음") else "상향 허용"
    elif hist == "반수":
        default = "균형"
    else:
        default = "균형"
    preset = st.radio("전략 프리셋", list(CB.PRESETS), index=list(CB.PRESETS).index(default), horizontal=True,
                      help="균형: 안정1·적정1·소신1 / 안정 우선: 안정2·적정1 / 상향 허용: 적정1·소신2")

    with st.expander("판정별 합격 확률 (가정값 — 조절 가능)", expanded=False):
        cols = st.columns(4)
        p = {g: cols[i].slider(g, 0.0, 1.0, CB.P_DEFAULT[g], 0.05) for i, g in enumerate(GRADES)}
        st.caption("이 확률은 통계 근거가 아닌 설명용 가정입니다. 실제 합격률은 대학·연도·모집단위마다 다릅니다.")

    # ---------- 후보 ----------
    auto = _auto(con)
    saved = db.get_state(con, "combo_manual", [])
    st.markdown("**후보 목록** — 선호 순위(1=가장 원함)를 매기세요. 직접 후보는 행을 추가해 넣습니다.")
    base = [{**a, "선호 순위": next((m["선호 순위"] for m in saved if m["대학"] == a["대학"] and m["모집단위"] == a["모집단위"]), i + 1)}
            for i, a in enumerate(auto)]
    manual = [m for m in saved if m.get("출처") == "직접 입력"]
    rows = st.data_editor(base + manual, num_rows="dynamic", hide_index=True, use_container_width=True, key="combo_ed",
                          column_config={"군": st.column_config.SelectboxColumn(options=["가", "나", "다"]),
                                         "판정": st.column_config.SelectboxColumn(options=GRADES),
                                         "선호 순위": st.column_config.NumberColumn(min_value=1, step=1),
                                         "출처": st.column_config.TextColumn(default="직접 입력")})
    if st.button("후보 저장"):
        db.set_state(con, "combo_manual", rows)
        st.success("저장했습니다.")
    cands = []
    for r in rows:
        if r.get("대학") and r.get("군") in ("가", "나", "다") and r.get("판정") in GRADES and r.get("선호 순위"):
            cands.append(CB.Cand(r["대학"], r.get("모집단위") or "", r["군"], r["판정"], int(r["선호 순위"]), r.get("출처") or "직접 입력"))
    if hist == "반수":
        cur = st.number_input("현 소속 대학의 선호 순위 (이보다 순위가 높은 후보만 추천)", 1, 50,
                              int(db.get_state(con, "halfsu_rank", 5)))
        current_pref = cur
        st.caption("반수생은 현 소속 대학과 이중등록할 수 없습니다. 정시 등록 마감(2.10~12)과 충원 등록(~2.18 22시) 일정을 꼭 확인하세요.")
    if len(cands) < 2:
        st.info("후보가 2개 이상이어야 조합을 비교할 수 있습니다.")
        return

    st.subheader(f"추천 조합 — {preset}")
    combos = CB.recommend(cands, preset, p, top=3, current_pref=current_pref)
    if not combos:
        st.warning("조건에 맞는 조합이 없습니다.")
        return
    for i, cb in enumerate(combos, 1):
        g = cb.by_group()
        with st.container(border=True):
            st.markdown(f"**조합 {i}** · 전부 불합격 확률 {cb.p_all_fail:.0%} · 기대 선호도 {cb.expected_pref:.2f} · "
                        f"프리셋과 차이 {cb.mismatch}")
            cc = st.columns(3)
            for j, grp in enumerate(("가", "나", "다")):
                c = g.get(grp)
                cc[j].markdown(f"**{grp}군**  \n" + (f"{c.label}  \n{c.grade} · 선호 {c.pref}위 · {c.source}" if c else "— 비움"))
            for w in cb.warnings:
                st.caption("⚠️ " + w)
    st.caption("기대 선호도 = 더 원하는 곳부터 합격할 확률을 곱해 더한 값(1에 가까울수록 원하는 곳에 갈 가능성이 큼). "
               "정시는 군별로 1곳씩만 지원할 수 있고, 같은 군 대학 간 복수지원은 금지됩니다.")
