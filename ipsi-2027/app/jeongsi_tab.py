"""3·5. 정시 성적 입력 → 대학별 환산점수, 유리한 반영 구조 (F4)."""
from __future__ import annotations

import streamlit as st

from engine import db
from engine.jeongsi_data import load

KIND_BADGE = {"요강식": "요강식", "근사식": "근사(임시)", "비율만": "비율만"}


def _inputs(con) -> tuple[dict, dict]:
    sv = db.get_state(con, "js_scores", {})
    st.markdown("**수능 성적** — 가채점이면 기관 예상 표준점수·백분위를, 성적표가 나오면(12월 11일) 실제 값을 넣으세요.")
    c = st.columns(4)
    kor_s = c[0].number_input("국어 표준점수", 0, 200, int(sv.get("kor_s", 125)))
    kor_p = c[0].number_input("국어 백분위", 0, 100, int(sv.get("kor_p", 90)))
    mat_s = c[1].number_input("수학 표준점수", 0, 200, int(sv.get("mat_s", 125)))
    mat_p = c[1].number_input("수학 백분위", 0, 100, int(sv.get("mat_p", 90)))
    maths = ["확률과 통계", "미적분", "기하"]
    mat_e = c[1].selectbox("수학 선택", maths, index=maths.index(sv.get("mat_e", "확률과 통계")))
    eng = c[2].number_input("영어 등급", 1, 9, int(sv.get("eng", 2)))
    his = c[2].number_input("한국사 등급", 1, 9, int(sv.get("his", 3)))
    c3 = st.columns(2)
    inq = {}
    for i, col in enumerate(c3, 1):
        with col:
            st.markdown(f"탐구{i}")
            cc = st.columns(4)
            t = cc[0].selectbox("종류", ["사탐", "과탐"], index=["사탐", "과탐"].index(sv.get(f"t{i}", "사탐")), key=f"jt{i}")
            s = cc[1].number_input("표준점수", 0, 100, int(sv.get(f"t{i}s", 63)), key=f"jts{i}")
            p = cc[2].number_input("백분위", 0, 100, int(sv.get(f"t{i}p", 90)), key=f"jtp{i}")
            v = cc[3].number_input("변환표준(선택)", 0.0, 100.0, float(sv.get(f"t{i}c", 0.0)), step=0.01, key=f"jtc{i}",
                                   help="대학별 변환표준점수는 학교마다 다릅니다. 비워두면(0) 표준점수로 임시 계산")
            inq[f"탐{i}"] = {"std": s, "pct": p, "type": t, **({"conv": v} if v > 0 else {})}
            inq[f"_t{i}"] = (t, s, p, v)
    with st.expander("최고 표준점수 (성적 발표 후 입력 — 표준점수÷최고점 방식 대학에 필요)", expanded=False):
        mc = st.columns(3)
        mk = mc[0].number_input("국어 최고 표준점수", 0, 200, int(sv.get("mx_k", 0)))
        mm = mc[1].number_input("수학 최고 표준점수", 0, 200, int(sv.get("mx_m", 0)))
        mt = mc[2].number_input("탐구 최고 (변환)표준점수", 0, 100, int(sv.get("mx_t", 0)))
        st.caption("이 값은 평가원 성적 발표(12월 11일)와 각 대학 변환표 공지 후 알 수 있어 기본값을 넣지 않았습니다. "
                   "비워 두면 해당 대학은 '최고점 입력 필요'로 표시됩니다.")
    if st.button("성적 저장 (이 기기에만)"):
        db.set_state(con, "js_scores", {
            "kor_s": kor_s, "kor_p": kor_p, "mat_s": mat_s, "mat_p": mat_p, "mat_e": mat_e, "eng": eng, "his": his,
            **{f"t{i}": inq[f"_t{i}"][0] for i in (1, 2)}, **{f"t{i}s": inq[f"_t{i}"][1] for i in (1, 2)},
            **{f"t{i}p": inq[f"_t{i}"][2] for i in (1, 2)}, **{f"t{i}c": inq[f"_t{i}"][3] for i in (1, 2)},
            "mx_k": mk, "mx_m": mm, "mx_t": mt})
        st.success("저장했습니다.")
    scores = {"국": {"std": kor_s, "pct": kor_p}, "수": {"std": mat_s, "pct": mat_p}, "영": {"grade": eng},
              "한국사": {"grade": his}, "탐1": inq["탐1"], "탐2": inq["탐2"], "_math": mat_e}
    maxes = {k: v for k, v in (("국", mk), ("수", mm), ("탐", mt)) if v}
    return scores, maxes


def render(con) -> None:
    groups, meta = load()
    st.caption("데이터: 20개교 2027 정시 모집요강의 반영식을 옮긴 값(상태: 검증 필요). '요강식'은 요강 산출식 그대로, "
               "'근사(임시)'는 산출식이 공개되지 않아 비율로 근사한 값, '비율만'은 영어 변환표 등이 미공개라 점수를 계산하지 않음. "
               "서강·중앙·동국·홍익은 요강 계산 예시로 엔진을 검증했습니다.")
    scores, maxes = _inputs(con)

    st.divider()
    fam = st.radio("계열 보기", ["전체", "인문·사회·상경", "자연"], horizontal=True)
    rows = []
    for g in groups:
        lab = g.label
        is_nat = any(k in lab for k in ("자연", "의학", "공학", "유형Ⅱ"))
        if fam == "자연" and not is_nat or fam == "인문·사회·상경" and is_nat:
            continue
        r = g.compute(scores, maxes)
        w = g.weights()
        wtxt = " · ".join(f"{k} {v:g}%" for k, v in w.items())
        if r is None:
            rows.append({"대학": g.univ_name, "모집단위 그룹": lab, "환산점수": float("nan"), "만점": float("nan"), "만점 대비": float("nan"),
                         "계산": KIND_BADGE[g.kind], "비고": g.blocked, "반영 비중": wtxt})
            continue
        note = "; ".join(r.missing or r.provisional)
        nan = float("nan")
        rows.append({"대학": g.univ_name, "모집단위 그룹": lab,
                     "환산점수": r.score if r.score is not None else nan,
                     "만점": r.max_score if r.max_score is not None else nan,
                     "만점 대비": round(r.ratio * 100, 2) if r.ratio else nan, "계산": KIND_BADGE[g.kind],
                     "비고": note, "반영 비중": wtxt})
    st.subheader("대학별 환산점수")
    rows.sort(key=lambda r: r["대학"])
    st.dataframe(rows, hide_index=True, use_container_width=True,
                 column_config={"만점 대비": st.column_config.ProgressColumn("만점 대비(%)", min_value=0, max_value=100, format="%.2f"),
                                "비고": st.column_config.TextColumn(width="large")})
    st.caption("환산점수는 대학마다 만점·척도가 달라 학교끼리 직접 비교할 수 없습니다. 합격 가능성은 대학별 전년도 입결(같은 환산 기준)과 "
               "비교해야 하며, 그 기능은 Phase 4에서 추가합니다. 서울대는 지원자 최고·최저점으로 최종 환산하므로 원점수 합만 표시합니다.")

    # ---------- 유리한 반영 구조 ----------
    st.subheader("나에게 유리한 반영 구조")
    strength = {"국": scores["국"]["pct"], "수": scores["수"]["pct"],
                "탐": (scores["탐1"]["pct"] + scores["탐2"]["pct"]) / 2,
                "영": round((10 - scores["영"]["grade"]) / 9 * 100, 1)}
    mean = sum(strength.values()) / len(strength)
    st.write("영역별 위치(국·수·탐은 백분위, 영어는 등급을 0~100으로 단순 환산): "
             + " · ".join(f"{k} {v:g}" for k, v in strength.items()))
    fits = []
    for g in groups:
        w = dict(g.weights())
        if "국·수(우수)" in w:          # 성균관대: 우수한 영역에 큰 가중치
            hi, lo = sorted(("국", "수"), key=lambda a: -strength[a])
            w[hi] = w.pop("국·수(우수)")
            w[lo] = w.pop("국·수(나머지)")
        tot = sum(v for k, v in w.items() if k in strength) or 1
        fit = sum(v / tot * (strength[k] - mean) for k, v in w.items() if k in strength)
        fits.append((fit, g, w))
    fits.sort(key=lambda x: -x[0])
    st.dataframe([{"순위": i + 1, "대학": g.univ_name, "그룹": g.label, "구조 적합도": round(f, 2),
                   "반영 비중": " · ".join(f"{k} {v:g}%" for k, v in w.items()), "계산": KIND_BADGE[g.kind]}
                  for i, (f, g, w) in enumerate(fits[:10])], hide_index=True, use_container_width=True)
    st.caption("구조 적합도 = Σ(영역 반영 비중 × (내 영역 점수 − 내 평균)). 양수면 내가 강한 영역을 많이 반영하는 구조입니다. "
               "학교 간 지원자 수준 차이는 반영하지 않으므로 합격 가능성과는 별개의 지표입니다.")
