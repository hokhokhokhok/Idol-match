"""8. 재도전 판단 (F8, N수·반수만 노출)."""
from __future__ import annotations

import io

import matplotlib.pyplot as plt
import streamlit as st

from blog.charts import FONT, GRID, INK, INK2, S1, S2, SURFACE  # noqa: F401 (한글 폰트 설정)
from engine import db
from engine import retake as R
from insights import store as INS


def render(con, profile: dict | None) -> None:
    st.info("이 화면은 결정을 대신하지 않습니다. 올해 결과를 받아들이는 것과 다시 도전하는 것 모두 정당한 선택입니다. "
            "진로·심리 고민은 학교 상담실이나 전문 상담과 함께 보시길 권합니다.", icon="🤝")
    sv = db.get_state(con, "retake", {})
    attempt = (profile or {}).get("attempt_count") or 2

    st.subheader("1. 올해 예상 결과와 목표")
    c = st.columns(4)
    best = c[0].text_input("최선(갈 수 있을 것 같은 가장 좋은 곳)", sv.get("best", ""))
    exp = c[1].text_input("기대(가장 가능성 높은 곳)", sv.get("exp", ""))
    worst = c[2].text_input("최악(안정 카드)", sv.get("worst", ""))
    target = c[3].text_input("목표 대학·학과", sv.get("target", ""))
    st.caption(f"수험 횟수: {attempt}번째 ('시작하기'에서 수정) · 합격 가능성·조합 결과를 참고해 적어 보세요.")
    record = st.text_area("학생부 상황 (정시 학생부 반영 대학 지원 시 참고)", sv.get("record", ""), height=70)

    st.subheader("2. 내 점수 추이 (모평·수능 백분위)")
    st.caption("라벨 앞 4글자를 연도로 써 주세요(예: '2025 9월 모평', '2025 수능'). 이 기록만으로 계산하며 외부 평균은 쓰지 않습니다.")
    rows = st.data_editor(sv.get("exams", [{"시험": "2026 6월 모평", "국어": 0, "수학": 0, "탐구": 0, "수능": False}]),
                          num_rows="dynamic", hide_index=True, use_container_width=True, key="retake_ed",
                          column_config={"수능": st.column_config.CheckboxColumn(default=False)})
    if st.button("저장 (이 기기에만)"):
        db.set_state(con, "retake", {"best": best, "exp": exp, "worst": worst, "target": target, "record": record, "exams": rows})
        st.success("저장했습니다.")
    exams = [R.Exam(r["시험"], float(r["국어"] or 0), float(r["수학"] or 0), float(r["탐구"] or 0), bool(r.get("수능")))
             for r in rows if r.get("시험") and any(r.get(k) for k in ("국어", "수학", "탐구"))]
    if len(exams) >= 2:
        fig, ax = plt.subplots(figsize=(8, 3.6), dpi=130)
        fig.patch.set_facecolor(SURFACE)
        ax.set_facecolor(SURFACE)
        xs = [e.label for e in exams]
        for key, lab, col in (("kor", "국어", S1), ("math", "수학", S2), ("inq", "탐구", "#1baf7a")):
            ax.plot(xs, [getattr(e, key) for e in exams], marker="o", lw=2, ms=7, color=col, label=lab, mec=SURFACE, mew=2)
        for i, e in enumerate(exams):
            if e.is_csat:
                ax.axvline(i, color=GRID, lw=6, zorder=0)
        for s in ("top", "right", "left"):
            ax.spines[s].set_visible(False)
        ax.grid(axis="y", color=GRID)
        ax.tick_params(colors=INK2)
        ax.legend(frameon=False, ncol=3, labelcolor=INK2)
        plt.xticks(rotation=20, ha="right")
        fig.tight_layout()
        buf = io.BytesIO()
        fig.savefig(buf, format="png", facecolor=SURFACE)
        plt.close(fig)
        st.image(buf.getvalue(), caption="영역별 백분위 추이 · 회색 세로 띠 = 수능")
    t = R.trend(exams)
    for line in R.reality_lines(t):
        st.write("- " + line)

    st.subheader("3. 2028학년도부터 달라지는 것")
    for i in INS.filter_items(INS.load(), topic="2028 체제 변화"):
        st.markdown(f"- {i.summary} ([{i.org}, {i.date:%Y.%m}]({i.url}) · {i.status})")
    st.caption("2028 고3부터 내신 5등급제가 적용되고 통합형 수능(선택과목 폐지)이 시행됩니다(교육부 원문 미확보, 보도로 확인 — docs/context.md 10번).")

    st.subheader("4. 선택지별 체크리스트")
    cc = st.columns(3)
    for col, title, items in ((cc[0], "등록 후 반수", R.CHECK_HALF), (cc[1], "전면 재도전", R.CHECK_FULL),
                              (cc[2], "올해 결과 수용", R.CHECK_ACCEPT)):
        with col:
            with st.container(border=True):
                st.markdown(f"**{title}**")
                for it in items:
                    st.checkbox(it, key=f"chk_{title}_{it[:10]}")
    st.caption("세 선택지는 우열이 아니라 조건이 다릅니다. 체크한 내용은 저장하지 않습니다(생각 정리용).")
