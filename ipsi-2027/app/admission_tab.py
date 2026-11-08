"""F5 합격 가능성 탭: 전년도 입결 + 환경 보정 → 안정/적정/소신/위험, 가·나·다 조합 경고, 입결 가져오기."""
from __future__ import annotations

import csv
import io
from pathlib import Path

import streamlit as st

from engine import admission as A
from engine import db
from engine import updates as UP

ICON = {"안정": "🟢 안정", "적정": "🔵 적정", "소신": "🟠 소신", "위험": "🔴 위험"}
UNIV_NAME = {"dongguk": "동국대"}
REQUIRED = ["univ", "year", "unit", "group", "quota", "kor_pct", "math_pct", "eng_grade", "inq_pct", "pct_avg", "pct_sd",
            "avg_weights", "basis", "source_url", "page"]


def _import_box() -> None:
    with st.expander("입결 가져오기 (CSV) — 다른 대학 입결을 직접 추가", expanded=False):
        st.markdown(
            "어디가(adiga.kr)는 자동 수집을 막고 있어 앱이 대신 받을 수 없습니다. 대학 입학처·어디가에서 받은 입결을 아래 형식의 CSV로 "
            "올리면 이 기기에만 저장되어 분석에 쓰입니다. 출처 URL·쪽수가 없는 행은 거부합니다.")
        st.code(",".join(REQUIRED) + "\n"
                "dongguk,2026,경영대학,다,102,93.87,77.39,2.72,91.30,88.27,1.25,국35/수25/탐25,최종등록자 상위80% 평균,https://...,26",
                language="text")
        st.caption("avg_weights: pct_avg(계열 가중 백분위 평균)를 만든 가중치. 대학 입결표에 가중 평균이 없으면 국어·수학·탐구 반영비율을 넣으세요.")
        up = st.file_uploader("CSV 선택", type=["csv"])
        if up is not None:
            rows = list(csv.DictReader(io.StringIO(up.getvalue().decode("utf-8-sig"))))
            missing = [c for c in REQUIRED if rows and c not in rows[0]]
            bad = [i for i, r in enumerate(rows, 2) if not r.get("source_url") or not r.get("page")]
            if missing:
                st.error(f"필수 열 없음: {', '.join(missing)}")
            elif bad:
                st.error(f"출처 URL 또는 쪽수가 없는 행: {bad[:10]} — 출처 없는 수치는 넣지 않습니다.")
            elif st.button(f"{len(rows)}행 저장"):
                univ = rows[0]["univ"]
                out = A.RESULTS / f"import_{univ}.csv"
                with out.open("w", encoding="utf-8", newline="") as f:
                    w = csv.DictWriter(f, fieldnames=REQUIRED + ["track", "conv_avg", "status"])
                    w.writeheader()
                    for r in rows:
                        w.writerow({**{k: r.get(k, "") for k in REQUIRED}, "track": r.get("track", ""),
                                    "conv_avg": r.get("conv_avg", ""), "status": "사용자 입력"})
                A.load_results.cache_clear()
                st.success(f"{out.name} 저장 — 새로고침하면 목록에 나타납니다.")


def render(con, profile: dict | None) -> None:
    st.caption("기준: 대학 공식 입결의 '최종등록자 상위 80% 계열 가중 백분위 평균'. 환산점수는 해마다 산출식이 바뀔 수 있어 참고로만 표시합니다. "
               "현재 앱에 출처가 확인된 입결은 동국대(2024·2026)뿐이며, 다른 대학은 아래 '입결 가져오기'로 추가할 수 있습니다.")
    sv = db.get_state(con, "js_scores")
    if not sv:
        st.warning("먼저 '🧮 정시 환산' 탭에서 성적(백분위 포함)을 입력하고 저장하세요.")
        _import_box()
        return
    pct = {"kor": sv["kor_p"], "math": sv["mat_p"], "inq": (sv["t1p"] + sv["t2p"]) / 2}
    eng = int(sv["eng"])
    st.write(f"내 백분위: 국어 {pct['kor']} · 수학 {pct['math']} · 탐구 평균 {pct['inq']:.1f} · 영어 {eng}등급 "
             "(정시 환산 탭에 저장된 값)")

    # ---------- 보정 요인 ----------
    saved_f = db.get_state(con, "adm_factors", {})
    with st.expander("환경 보정 요인 · 판정 기준 (모두 조절 가능)", expanded=False):
        factors = {}
        for k, v in A.FACTORS.items():
            c1, c2 = st.columns([2, 1])
            w = c1.slider(f"{v['label']} — 가중치", 0.0, 2.0, float(saved_f.get(k, {}).get("weight", v["weight"])), 0.1, key=f"fw_{k}")
            s = c2.number_input("이동폭(백분위 점)", 0.0, 3.0, float(saved_f.get(k, {}).get("shift", v["shift"])), 0.05, key=f"fs_{k}")
            st.caption(f"근거: {v['evidence']} · {v['note']}")
            factors[k] = {**v, "weight": w, "shift": s}
        st.caption(f"모집인원 1% 증가 → 기준 {A.QUOTA_K}점 하락, 경쟁률 1% 상승 → 기준 {A.COMP_K}점 상승 (가정값). "
                   "이월 인원은 12월 말 대학 발표 후 아래 표에 입력하세요.")
        t1, t2, t3 = st.columns(3)
        thresh = {"안정": t1.number_input("안정 z ≥", -3.0, 3.0, float(saved_f.get("_t", {}).get("안정", A.THRESH["안정"])), 0.1),
                  "적정": t2.number_input("적정 z ≥", -3.0, 3.0, float(saved_f.get("_t", {}).get("적정", A.THRESH["적정"])), 0.1),
                  "소신": t3.number_input("소신 z ≥", -4.0, 3.0, float(saved_f.get("_t", {}).get("소신", A.THRESH["소신"])), 0.1)}
        st.caption("z = (내 점수 − 보정 기준) ÷ 표준편차. 상위 80% 평균은 실제 최저 합격선보다 높으므로, z가 음수여도 합격할 수 있습니다.")
        if st.button("보정·기준 저장"):
            db.set_state(con, "adm_factors", {**{k: {"weight": v["weight"], "shift": v["shift"]} for k, v in factors.items()},
                                              "_t": thresh})
            st.success("저장했습니다.")

    recs = A.load_results()
    univs = sorted({r.univ for r in recs})
    if not univs:
        st.info("입결 데이터가 없습니다.")
        _import_box()
        return
    u = st.selectbox("대학", univs, format_func=lambda x: UNIV_NAME.get(x, x))
    latest = max(r.year for r in recs if r.univ == u)
    cand = [r for r in recs if r.univ == u and r.year == latest]
    hist = (profile or {}).get("history_type") or "현역"
    track_pref = st.radio("계열", ["전체", "인문", "자연"], horizontal=True)
    cand = [r for r in cand if track_pref == "전체" or r.track == track_pref]
    saved_units = [x for x in db.get_state(con, f"adm_units_{u}", []) if x in {r.unit for r in cand}]
    units = st.multiselect(f"모집단위 ({latest}학년도 입결 기준)", [r.unit for r in cand], default=saved_units)
    if st.button("선택 저장"):
        db.set_state(con, f"adm_units_{u}", units)

    if not units:
        st.info("모집단위를 고르면 판정이 나옵니다.")
        _import_box()
        return
    extra = db.get_state(con, f"adm_extra_{u}", {})
    st.markdown("**2027 변동 입력 (선택)** — 2027 모집인원·수시 이월·원서 접수 후 경쟁률 변화, 학원 모의지원 결과(교차검증용)")
    rows_in = st.data_editor(
        [{"모집단위": x, "2027 모집인원": extra.get(x, {}).get("q", None),
          "이월 인원": extra.get(x, {}).get("c") or (UP.carryover_for(u, x).added if UP.carryover_for(u, x) else 0),
          "경쟁률 변화(%)": extra.get(x, {}).get("cc", 0.0), "모의지원 결과(직접 입력)": extra.get(x, {}).get("mock", "")}
         for x in units], hide_index=True, disabled=["모집단위"], key=f"ed_{u}", use_container_width=True)
    if st.button("변동 입력 저장"):
        db.set_state(con, f"adm_extra_{u}", {r["모집단위"]: {"q": r["2027 모집인원"], "c": r["이월 인원"] or 0,
                                                         "cc": r["경쟁률 변화(%)"] or 0.0, "mock": r["모의지원 결과(직접 입력)"]}
                                             for r in rows_in})
        st.success("저장했습니다.")

    out, by_group = [], {}
    for r_in in rows_in:
        rec = next(r for r in cand if r.unit == r_in["모집단위"])
        prev = next((h for h in A.history(u, rec.unit) if h.year < rec.year), None)
        a = A.assess(rec, pct, eng, factors, r_in["2027 모집인원"] or None, int(r_in["이월 인원"] or 0),
                     float(r_in["경쟁률 변화(%)"] or 0), thresh, prev)
        if a is None:
            out.append({"판정": "계산 불가", "모집단위": rec.unit, "근거": "계열 가중치 정보 없음(예체능 등)"})
            continue
        by_group.setdefault(rec.group, []).append((rec.unit, a.grade))
        out.append({"판정": ICON[a.grade], "모집단위": rec.unit, "군": rec.group, "인원": rec.quota,
                    "내 점수": round(a.my, 2), "기준": rec.avg, "보정 기준": round(a.adj_ref, 2), "z": round(a.z, 2),
                    "근거": a.reason, "주의": "; ".join(a.warnings),
                    "추세": (f"{prev.year}→{rec.year} {a.trend:+.2f}" if a.trend is not None else "-"),
                    "환산점수 평균(참고)": rec.conv, "모의지원": r_in["모의지원 결과(직접 입력)"] or "",
                    "출처": f"p.{rec.page}"})
    st.subheader("판정")
    st.dataframe(out, hide_index=True, use_container_width=True,
                 column_config={"근거": st.column_config.TextColumn(width="large"),
                                "주의": st.column_config.TextColumn(width="medium")})
    st.caption(f"출처: {UNIV_NAME.get(u, u)} {latest}학년도 입학전형 결과(공식) — {cand[0].source_url} · 상태: {cand[0].status}. "
               "실시간 모의지원 데이터가 없으므로, 대형 입시업체 모의지원 결과를 '모의지원' 칸에 적어 교차검증하세요. "
               "이 판정은 합격을 보장하지 않습니다.")
    if hist in ("재수", "삼수", "N수", "반수"):
        st.caption("N수·반수생: 결과를 받아들이는 것과 다시 도전하는 것 모두 정당한 선택입니다. 판정은 판단 재료 중 하나일 뿐입니다.")

    # ---------- 간이 조합 ----------
    st.subheader("가·나·다 간이 조합")
    st.caption("같은 대학 안의 빠른 확인용입니다. 여러 대학·직접 후보를 합친 추천은 '🧩 가나다 조합' 탭에서 보세요.")
    picks = []
    cols = st.columns(3)
    for i, gname in enumerate(("가", "나", "다")):
        opts = ["(선택 안 함)"] + [f"{unit} · {g}" for unit, g in by_group.get(gname, [])]
        ch = cols[i].selectbox(f"{gname}군", opts, key=f"combo_{u}_{gname}")
        if ch != "(선택 안 함)":
            picks.append(ch.rsplit(" · ", 1)[1])
    msg = A.combo_risk(picks)
    if msg:
        st.warning(msg)
    elif picks:
        st.success("안정 카드가 포함된 조합입니다.")
    _import_box()
