"""10. 블로그 포스팅 탭 (F10)."""
from __future__ import annotations

import streamlit as st
import streamlit.components.v1 as components

from blog import render as R
from blog import store
from blog.dummy_data import UNIVERSITIES
from blog.generator import AUDIENCES, TONES, body_text, generate
from blog.guardrails import DAILY_LIMIT_DEFAULT, check_daily_limit
from blog.models import PostInput
from blog.templates import TEMPLATES

TARGET_UNIVS = ["서울대", "연세대", "고려대", "서강대", "성균관대", "한양대", "중앙대", "경희대", "한국외대",
                "서울시립대", "이화여대", "건국대", "동국대", "홍익대"]
TARGET_DEPTS = ["경영", "경제", "컴퓨터공학", "전기전자", "기계", "화공", "반도체 계약학과", "의예·약학",
                "미디어·커뮤니케이션", "자유전공(무전공)"]
DATA_KEYS = {("연세대", "경영"): "yonsei"}  # 데이터가 준비된 학교·학과 (현재 더미 1건)



def render() -> None:
    left, right = st.columns([5, 6], gap="large")
    with left:
        st.subheader("1. 학교·학과")
        univs = st.multiselect("학교 (1~4개)", TARGET_UNIVS, default=["연세대"], max_selections=4)
        dept = st.selectbox("학과", TARGET_DEPTS, index=0)

        st.subheader("2. 유형·독자·톤")
        ptype = st.selectbox("포스트 유형", list(TEMPLATES), format_func=lambda k: f"{TEMPLATES[k].name}"
                             + ("" if TEMPLATES[k].status == "구현" else f"  · {TEMPLATES[k].phase} 예정"))
        audience = st.multiselect("타깃 독자", AUDIENCES, default=["수험생", "정시파이터"])
        tone = st.radio("톤", list(TONES), horizontal=True)

        st.subheader("3. 필자 메모 (필수)")
        memo = st.text_area("나의 관점·경험·의견 2~3줄 — 비어 있으면 내보내기 비활성화", height=110,
                            value="재수할 때 반영비율을 늦게 확인해서 수학 강세를 못 살린 경험이 있어요. "
                                  "입결 숫자보다 내 점수 구조와 반영비율이 맞는지부터 보시길 권합니다.")
        ad = st.text_input("제휴·광고 링크 (있으면 광고 표기 자동 삽입)", value="")

    tpl = TEMPLATES[ptype]
    problems = []
    if not (tpl.univ_count[0] <= len(univs) <= tpl.univ_count[1]):
        problems.append(f"{tpl.name}은 학교 {tpl.univ_count[0]}~{tpl.univ_count[1]}개를 골라야 합니다.")
    if tpl.status != "구현":
        problems.append(f"{tpl.name}은 {tpl.phase}에 구현 예정입니다. 구조는 '템플릿 6종 구조' 탭에서 볼 수 있어요.")
    key = DATA_KEYS.get((univs[0], dept)) if univs else None
    if not problems and key is None:
        problems.append(f"{univs[0]} {dept}: 아직 파싱된 데이터가 없습니다 (데이터 상태 화면 참고). 현재는 '연세대 경영' 더미만 있음.")

    with right:
        if problems:
            for p in problems:
                st.warning(p)
            return

        con = store.connect()
        inp = PostInput([key], dept, ptype, audience, tone, memo, [ad] if ad.strip() else [])
        post = generate(inp, UNIVERSITIES[key], previous=store.previous_posts(con))
        check_daily_limit(store.count_today(con), post.report, DAILY_LIMIT_DEFAULT)

        for e in post.report.errors:
            st.error(e)
        for w in post.report.warnings:
            st.warning(w)

        st.subheader("제목 후보 5개")
        choice = st.radio("미리보기에 쓸 제목", range(len(post.titles)),
                          format_func=lambda i: f"[{post.titles[i][0]}] {post.titles[i][1]}")
        st.subheader("4. 미리보기 (모바일 폭)")
        components.html(R.phone_preview(post, post.titles[choice][1]), height=1400, scrolling=True)

        st.subheader("5. 내보내기")
        editor_html = R.to_html(post, embed_images=False)
        text = R.to_text(post)
        dis = not post.report.export_allowed
        c1, c2, c3 = st.columns(3)
        c1.download_button("스마트에디터용 HTML", editor_html, "post_smarteditor.html", "text/html", disabled=dis)
        c2.download_button("일반 텍스트", text, "post.txt", "text/plain", disabled=dis)
        c3.download_button("이미지 ZIP", R.to_zip(post), "images.zip", "application/zip", disabled=dis)
        st.caption("자동 발행 기능은 없습니다. HTML을 브라우저로 열어 복사 → 스마트에디터에 붙여넣고, 이미지는 ZIP에서 직접 업로드하세요. "
                   "하루에 대량으로 발행하지 마세요. 네이버 홈피드 노출 기준은 공개되어 있지 않아 노출을 보장하지 않습니다.")
        st.write("**태그**: " + " ".join(f"#{t}" for t in post.tags))
        if st.button("이 초안을 기록에 저장 (중복·일 생성량 검사에 사용)", disabled=dis):
            pid = store.save_post(con, post, editor_html, body_text(post))
            st.success(f"저장됨 (id={pid})")
