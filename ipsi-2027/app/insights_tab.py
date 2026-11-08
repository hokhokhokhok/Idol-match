"""7. 인사이트 피드 (F7): 학원·언론·유튜브 관점을 공식 데이터와 분리해서 보여준다."""
from __future__ import annotations

from datetime import date

import streamlit as st

from insights import store, youtube

KIND_STYLE = {"공식": ("#e6f0fb", "#1a4f8b"), "학원": ("#f3f1ec", "#52514e"), "언론": ("#f3f1ec", "#52514e"),
              "유튜브": ("#fbeee6", "#9a3a10")}
STATUS_ICON = {"확인": "✅ 원문 확인", "검증 필요": "🟡 검증 필요", "미확인": "🔴 원출처 미확인"}
SEGMENTS = ["수시", "정시", "병행", "현역", "재수", "삼수", "N수", "반수", "검정고시"]


def _card(i: store.Insight) -> None:
    bg, fg = KIND_STYLE.get(i.kind, ("#f3f1ec", "#52514e"))
    st.markdown(
        f'<div style="background:{bg};border-radius:8px;padding:12px 14px;margin:6px 0;">'
        f'<span style="font-size:12px;color:#fff;background:{fg};border-radius:4px;padding:1px 6px;">{i.badge}</span> '
        f'<b>{i.org}</b> · <span style="color:#666;font-size:13px">{i.date:%Y.%m.%d} · 근거 유형: {i.evidence} · '
        f'{STATUS_ICON.get(i.status, i.status)}</span><br><b>{i.title}</b><br>'
        f'<span style="font-size:15px;line-height:1.7">{i.summary}</span><br>'
        f'<a href="{i.url}" target="_blank" style="font-size:13px">출처 링크</a>'
        + (' <span style="font-size:12px;color:#888">(직접 추가)</span>' if i.user_added else "") + "</div>",
        unsafe_allow_html=True)


def render(profile: dict | None) -> None:
    st.caption("공식 데이터 > 학원·언론 분석 > 유튜브·커뮤니티 순으로 신뢰도를 표시합니다. 여기 내용은 참고 의견이며, 앱의 계산(최저 판정·환산·"
               "합격 가능성)에는 사용자가 켠 보정 요인만 반영됩니다. 요약은 원문을 옮기지 않고 1~3문장으로 새로 썼습니다.")
    items = store.load()
    my_seg = (profile or {}).get("history_type")
    c1, c2, c3 = st.columns([1, 1, 2])
    seg = c1.selectbox("세그먼트", ["전체"] + SEGMENTS,
                       index=(SEGMENTS.index(my_seg) + 1) if my_seg in SEGMENTS else 0)
    topics = sorted({i.topic for i in items})
    topic = c2.selectbox("주제", ["전체"] + topics)
    kinds = c3.multiselect("종류", ["공식", "학원", "언론", "유튜브"], default=["공식", "학원", "언론", "유튜브"])
    shown = store.filter_items(items, None if seg == "전체" else seg, None if topic == "전체" else topic, kinds)

    view = st.radio("보기", ["주제별 나란히", "목록"], horizontal=True)
    if view == "목록":
        for i in shown:
            _card(i)
    else:
        for t, group in store.by_topic(shown).items():
            st.subheader(t)
            orgs = {i.org for i in group}
            if len(orgs) > 1:
                st.caption("기관마다 관점이 다를 수 있어 나란히 보여줍니다.")
            cols = st.columns(min(len(group), 3))
            for k, i in enumerate(group):
                with cols[k % len(cols)]:
                    _card(i)
    if not shown:
        st.info("조건에 맞는 인사이트가 없습니다.")

    st.divider()
    st.subheader("인사이트 직접 추가")
    st.caption("학원 공개 보도자료·기사·설명회 요약, 또는 직접 고른 유튜브 영상. 유료 배치표·합격예측 자료와 원문 대량 복제는 넣지 마세요. "
               "이 기기에만 저장됩니다(data/insights/user.yaml).")
    with st.form("add_insight"):
        a1, a2 = st.columns(2)
        url = a1.text_input("출처 URL (필수)")
        kind = a2.selectbox("종류", ["학원", "언론", "유튜브", "공식"])
        org = a1.text_input("기관·채널명")
        title = a2.text_input("제목")
        topic_in = a1.text_input("주제 (같은 주제끼리 나란히 표시)", value="N수생 증가")
        evidence = a2.selectbox("근거 유형", ["데이터", "경험", "의견"])
        segs = st.multiselect("대상 세그먼트 (비우면 전체)", SEGMENTS)
        summary = st.text_area("요약 1~3문장 (내 말로)", height=90)
        auto = st.form_submit_button("유튜브 자막에서 요약 초안 만들기")
        save = st.form_submit_button("저장")
    if auto:
        try:
            text = youtube.fetch_transcript(url)
            draft = youtube.summarize(text, 3, [topic_in])
            st.session_state["yt_draft"] = " ".join(draft)
            st.success("자막에서 핵심 문장 3개를 뽑았습니다. 그대로 쓰지 말고 내 말로 다듬어 요약 칸에 넣어 저장하세요. 자막 전문은 저장하지 않습니다.")
        except Exception as e:  # noqa: BLE001
            st.warning(f"자막을 가져오지 못했습니다({type(e).__name__}). 이 환경의 네트워크가 막혀 있거나 자막이 없는 영상일 수 있습니다. "
                       "요약을 직접 입력해 주세요.")
    if st.session_state.get("yt_draft"):
        st.text_area("자동 추출 초안 (참고용, 저장 안 됨)", st.session_state["yt_draft"], height=90, disabled=True)
    if save:
        vid = youtube.video_id(url) if kind == "유튜브" else None
        ins = store.Insight(id=f"user-{vid or abs(hash(url)) % 10**8}", org=org or "미기재", kind=kind, title=title or "(제목 없음)",
                            url=url, date=date.today(), topic=topic_in or "기타", summary=summary.strip(), evidence=evidence,
                            status="검증 필요", segments=segs, tags=[])
        errs = store.add_user(ins)
        if errs:
            st.error(" / ".join(errs))
        else:
            st.success("저장했습니다. 새로고침하면 피드에 나타납니다.")
