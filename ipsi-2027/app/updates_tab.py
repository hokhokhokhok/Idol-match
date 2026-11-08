"""🔄 공지 반영: 수시 이월 인원, 대학별 탐구 변환표준점수표, 수능 최고 표준점수 (모두 출처 필수)."""
from __future__ import annotations

import csv
import io

import streamlit as st

from engine import updates as UP

UNIVS = {"서울대": "snu", "연세대": "yonsei", "고려대": "korea", "서강대": "sogang", "성균관대": "skku", "한양대": "hanyang",
         "중앙대": "cau", "경희대": "khu", "한국외대": "hufs", "서울시립대": "uos", "이화여대": "ewha", "건국대": "konkuk",
         "동국대": "dongguk", "홍익대": "hongik", "숙명여대": "sookmyung", "국민대": "kookmin", "숭실대": "ssu", "세종대": "sejong",
         "광운대": "kw", "서울과기대": "seoultech"}
ID2NAME = {v: k for k, v in UNIVS.items()}


def render() -> None:
    st.caption("대학들이 성적 발표(12월 11일) 이후 변환표준점수표를, 수시 충원 마감(12월 30일) 후 정시 이월 인원을 공지합니다. "
               "공지 원문 URL과 함께 넣으면 환산·합격 가능성·블로그에 자동 반영되고 '임시' 표시가 사라집니다. 추측값은 넣지 마세요.")

    st.subheader("1. 수시 이월 인원")
    cur = UP.load_carryover()
    if cur:
        st.dataframe([{"대학": ID2NAME.get(c.univ, c.univ), "모집단위": c.unit, "이월": c.added, "발표일": c.announced_at,
                       "출처": c.source_url} for c in cur], hide_index=True, use_container_width=True)
    with st.form("carry"):
        c1, c2, c3 = st.columns(3)
        uname = c1.selectbox("대학", list(UNIVS))
        unit = c2.text_input("모집단위 (입결·요강 표기와 같게)")
        n = c3.number_input("이월 인원", 0, 500, 0)
        c4, c5, c6 = st.columns([1, 3, 1])
        when = c4.date_input("발표일")
        url = c5.text_input("출처 URL (대학 정시 모집인원 확정 공지)")
        page = c6.text_input("쪽/게시글 번호", "")
        if st.form_submit_button("이월 인원 저장"):
            try:
                UP.save_carryover([{"univ": UNIVS[uname], "unit": unit.strip(), "added_quota": n,
                                    "announced_at": str(when), "source_url": url.strip(), "page": page}])
                st.success("저장했습니다. 합격 가능성 탭의 '이월 인원' 기본값과 블로그 '수시 이월' 속보에 반영됩니다.")
            except UP.UpdateError as e:
                st.error(str(e))

    st.subheader("2. 대학별 탐구 변환표준점수표")
    st.markdown("대학 공지 표를 아래 형식의 CSV로 옮겨 올리세요. **백분위가 표에 없으면 보간하지 않고** 그 과목은 표준점수로 임시 계산합니다.")
    st.code("pct,사탐,과탐,source_url\n100,70.12,71.03,https://대학 공지 URL\n99,69.50,70.40,\n98,68.91,69.83,", language="text")
    u2 = st.selectbox("대학 ", list(UNIVS), key="conv_univ")
    have = UP.load_conv(UNIVS[u2])
    if have:
        st.caption(f"현재 저장됨: 사탐 {len(have['사탐'])}행 · 과탐 {len(have['과탐'])}행 · 출처 {have['source_url']}")
    up = st.file_uploader("변환표 CSV", type=["csv"], key="conv_up")
    if up is not None and st.button("변환표 저장"):
        try:
            rows = list(csv.DictReader(io.StringIO(up.getvalue().decode("utf-8-sig"))))
            n = UP.save_conv(UNIVS[u2], rows)
            st.success(f"{u2} 변환표 {n}행 저장 — 정시 환산 탭에서 이 대학 계산에 자동 적용됩니다.")
        except (UP.UpdateError, KeyError, ValueError) as e:
            st.error(f"저장 실패: {e}")

    st.subheader("3. 2027 수능 최고 표준점수")
    cm = UP.load_csat_max()
    with st.form("cmax"):
        a, b, c = st.columns(3)
        k = a.number_input("국어 최고 표준점수", 0, 200, int(cm.get("국", 0)))
        m = b.number_input("수학 최고 표준점수", 0, 200, int(cm.get("수", 0)))
        t = c.number_input("탐구 최고 (선택)", 0, 100, int(cm.get("탐", 0) or 0))
        url = st.text_input("출처 URL (평가원 채점 결과 보도자료 등)")
        if st.form_submit_button("최고점 저장"):
            try:
                UP.save_csat_max(k, m, url.strip(), t or None)
                st.success("저장했습니다. '표준점수÷최고점' 방식 대학(한국외대·시립대·이화여대·숙명여대 등)이 계산됩니다.")
            except UP.UpdateError as e:
                st.error(str(e))
    st.caption("탐구 최고점은 대학별 '최고 변환표준점수'를 쓰는 곳이 많아, 대학 공지를 확인한 경우에만 넣으세요.")
