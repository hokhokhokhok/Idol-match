"""10. 블로그 포스팅 탭 (F10)."""
from __future__ import annotations

import streamlit as st
import streamlit.components.v1 as components

from blog import render as R
from blog import store
from blog.dummy_data import UNIVERSITIES
from blog.calendar import WINDOWS, recommend
from blog.generator import EVENT_DATE
from blog.real_data import (available, build_change, build_compare, build_overview, build_segment,
                            build_susi_vs, build_timely)
from datetime import date
from insights import store as INS
from blog.generator import AUDIENCES, TONES, body_text, generate
from blog.guardrails import DAILY_LIMIT_DEFAULT, check_daily_limit
from blog.models import PostInput
from blog.templates import TEMPLATES

TARGET_UNIVS = ["서울대", "연세대", "고려대", "서강대", "성균관대", "한양대", "중앙대", "경희대", "한국외대",
                "서울시립대", "이화여대", "건국대", "동국대", "홍익대"]
TARGET_DEPTS = ["경영", "경제", "컴퓨터공학", "전기전자", "기계", "화공", "반도체 계약학과", "의예·약학",
                "미디어·커뮤니케이션", "자유전공(무전공)"]
NAME2ID = {"서울대": "snu", "연세대": "yonsei", "고려대": "korea", "서강대": "sogang", "성균관대": "skku", "한양대": "hanyang",
           "중앙대": "cau", "경희대": "khu", "한국외대": "hufs", "서울시립대": "uos", "이화여대": "ewha", "건국대": "konkuk",
           "동국대": "dongguk", "홍익대": "hongik"}



def _calendar() -> None:
    with st.expander("🗓 발행 캘린더 · 오늘의 추천", expanded=False):
        today = date.today()
        con = store.connect()
        recs = recommend(today, store.previous_posts(con))
        st.markdown(f"**오늘({today:%m/%d}) — {recs[0]['window']}**: " + " / ".join(
            r["name"] + (" (최근 같은 유형 있음)" if r["recent_dup"] else "") for r in recs))
        st.caption(recs[0]["why"] + ". 하루에 대량으로 발행하지 마세요(기본 일 3개 한도).")
        st.dataframe([{"기간": f"{w.start:%m/%d}~{w.end:%m/%d}", "시점": w.title,
                       "추천 유형": " / ".join(f"{t}{'(' + ', '.join(p.values()) + ')' if p else ''}" for t, p in w.picks),
                       "이유": w.why} for w in WINDOWS], hide_index=True, use_container_width=True)


def render() -> None:
    _calendar()
    left, right = st.columns([5, 6], gap="large")
    with left:
        st.subheader("1. 학교·학과")
        univs = st.multiselect("학교 (1~4개)", TARGET_UNIVS, default=["연세대"], max_selections=4)
        dept = st.selectbox("학과", TARGET_DEPTS, index=0)

        st.subheader("2. 유형·독자·톤")
        ptype = st.selectbox("포스트 유형", list(TEMPLATES), format_func=lambda k: f"{TEMPLATES[k].name}"
                             + ("" if TEMPLATES[k].status == "구현" else f"  · {TEMPLATES[k].phase} 예정"))
        params = {}
        if ptype == "timely_news":
            params["event"] = st.selectbox("시점", list(EVENT_DATE))
            if params["event"] in ("수시 이월", "원서 경쟁률", "충원 현황"):
                with st.expander("대학 발표 수치 입력 (출처 필수)", expanded=False):
                    lv = st.number_input("수치", 0.0, 10000.0, 0.0)
                    ll = st.text_input("항목명", {"수시 이월": "수시 이월 인원", "원서 경쟁률": "원서 접수 경쟁률",
                                                "충원 현황": "충원 합격 차수"}[params["event"]])
                    lu = st.text_input("출처 URL")
                    if lv and lu.startswith("http"):
                        params["numbers"] = {"value": lv, "label": ll, "url": lu, "doc": f"{', '.join(univs)} 발표 자료"}
                    elif lv:
                        st.warning("출처 URL이 없는 수치는 넣지 않습니다.")
        elif ptype == "segment_guide":
            params["segment"] = st.selectbox("세그먼트", ["N수생", "재수생", "반수생", "현역 정시파이터", "수시파이터"])
        elif ptype == "change_2027":
            params["topic"] = st.selectbox("주제(인사이트 주제)", sorted({i.topic for i in INS.load()}))
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
    ready = available(dept)
    ids = [NAME2ID.get(u) for u in univs]
    use_dummy = st.sidebar.checkbox("더미 샘플로 보기 (연세대 경영)", value=False) if ptype == "jeongsi_overview" else False
    missing = [u for u, i in zip(univs, ids) if i not in ready]
    if not problems and missing and not use_dummy:
        problems.append(f"{', '.join(missing)} {dept}: 모집인원 데이터가 아직 없습니다. 현재 준비된 학과·학교: "
                        f"경영 — {', '.join(k for k, v in NAME2ID.items() if v in available('경영'))}")

    with right:
        if problems:
            for p in problems:
                st.warning(p)
            return

        con = store.connect()
        inp = PostInput(ids if not use_dummy else ["yonsei"], dept, ptype, audience, tone, memo, [ad] if ad.strip() else [])
        if use_dummy:
            data = UNIVERSITIES["yonsei"]
        elif ptype == "rival_compare":
            data = build_compare(ids, dept)
        elif ptype == "susi_vs_jeongsi":
            data = build_susi_vs(ids[0], dept)
        elif ptype == "timely_news":
            data = build_timely(ids[0], dept, params["event"], params.get("numbers"))
        elif ptype == "segment_guide":
            data = build_segment(ids[0], dept, params["segment"])
        elif ptype == "change_2027":
            data = build_change(ids[0], dept, params["topic"])
        else:
            data = build_overview(ids[0], dept)
        post = generate(inp, data, previous=store.previous_posts(con))
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
