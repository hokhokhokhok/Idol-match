"""인서울 입시 전략 분석 앱 (2027).

실행: streamlit run app/streamlit_app.py
현재 화면: 1 온보딩·맞춤 대시보드 / 2 타임라인 / 4 수시 대응 / 9 데이터 상태 / 10 블로그 포스팅 / 템플릿 구조
"""
from __future__ import annotations

import csv
import sys
from datetime import date
from pathlib import Path

import streamlit as st

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "app"))

import blog_tab  # noqa: E402
import susi_tab  # noqa: E402
import jeongsi_tab  # noqa: E402
import admission_tab  # noqa: E402
import dashboard  # noqa: E402
import insights_tab  # noqa: E402
import combo_tab  # noqa: E402
import updates_tab  # noqa: E402
import retake_tab  # noqa: E402
import ui  # noqa: E402
from blog.templates import templates_markdown  # noqa: E402
from engine import db, segments, timeline  # noqa: E402

st.set_page_config(page_title="2027 인서울 입시 전략", page_icon="🎓", layout="wide")
ui.style()
st.info("**지원 전에 꼭 대학 모집요강 원문을 다시 확인하세요.** 이 앱은 모집요강을 옮겨 만든 참고용이고 합격을 보장하지 않습니다.", icon="📌")

con = db.connect()
profile = db.load_profile(con)

MENU = {"🧭 온보딩·대시보드": "🧭 시작하기 · 내 유형", "📅 타임라인": "📅 입시 일정", "🎯 수시 대응": "🎯 수시 · 최저 판정",
        "🧮 정시 환산": "🧮 정시 · 환산점수", "📊 합격 가능성": "📊 정시 · 합격 가능성", "🧩 가나다 조합": "🧩 정시 · 가나다 조합",
        "🔁 재도전 판단": "🔁 재도전 판단", "💡 인사이트": "💡 참고 인사이트", "🔄 공지 반영": "🔄 발표 자료 입력",
        "📝 블로그 포스팅": "📝 블로그 글 만들기", "🗂 데이터 상태": "🗂 데이터 상태", "🧱 템플릿 6종 구조": "🧱 블로그 템플릿 구조"}
if (profile or {}).get("history_type") not in ("재수", "삼수", "N수", "반수"):
    MENU.pop("🔁 재도전 판단")
with st.sidebar:
    st.markdown("### 2027 인서울 입시")
    PAGE = st.radio("메뉴", list(MENU), format_func=MENU.get, key="nav", label_visibility="collapsed")
    st.caption("성적·지원 목록은 이 브라우저에만 저장됩니다.")
    st.divider()

# ---------------------------------------------------------------- 1. 온보딩·대시보드
if PAGE == "🧭 온보딩·대시보드":
    st.subheader("나는 어떤 수험생인가요?")
    st.caption("고른 유형에 맞춰 대시보드와 안내가 바뀝니다.")
    c1, c2 = st.columns(2)
    tr_keys, hi_keys = list(segments.TRACKS), list(segments.HISTORIES)
    with c1:
        track = st.radio("입시 방향", tr_keys, format_func=lambda k: segments.TRACKS[k],
                         index=tr_keys.index(profile["track_type"]) if profile else 1)
    with c2:
        history = st.radio("수험 이력", hi_keys, format_func=lambda k: f"{k} — {segments.HISTORIES[k]}",
                           index=hi_keys.index(profile["history_type"]) if profile else 0)
    attempt, cur = None, None
    if history in ("재수", "삼수", "N수", "반수"):
        attempt = st.number_input("이번이 몇 번째 수능인가요?", 2, 10,
                                  value=(profile or {}).get("attempt_count") or {"재수": 2, "삼수": 3}.get(history, 4))
    if history == "반수":
        cur = st.text_input("현재 소속 대학 (비교·이중등록 경고용)", value=(profile or {}).get("current_univ") or "")
    if st.button("이 설정 저장 (이 기기에만 저장)"):
        db.save_profile(con, track, history, attempt, cur)
        st.success("저장했습니다.")

    st.divider()
    st.subheader(f"맞춤 대시보드 · {track}{'파이터' if track != '병행' else '형'} × {history}")
    for n in segments.notes(track, history):
        st.caption("• " + n)
    cards = segments.dashboard(track, history)
    cols = st.columns(min(len(cards), 4))
    for i, card in enumerate(cards):
        with cols[i % len(cols)]:
            with st.container(border=True):
                st.markdown(f"**{card.title}**")
                live = dashboard.summary(card.key, con)
                if live:
                    st.write(live)
                else:
                    done = card.phase in ("Phase 2", "Phase 3", "Phase 4") or "구현" in card.phase
                    st.caption("왼쪽 메뉴의 해당 화면에서 성적을 넣으면 여기에 요약이 나타납니다." if done else "준비 중입니다.")
    st.markdown("**다음 일정**")
    for e, dd in timeline.upcoming(date.today(), track, 3):
        st.write(f"- {'진행 중' if dd <= 0 else f'D-{dd}'} · {e.start:%m/%d}"
                 + (f"~{e.end:%m/%d}" if e.end != e.start else "") + f" {e.title}")

# ---------------------------------------------------------------- 2. 타임라인
if PAGE == "📅 타임라인":
    st.subheader("2027학년도 대입 주요 일정")
    tr = (profile or {}).get("track_type") or "정시"
    show_all = st.toggle("모든 일정 보기", value=True)
    today = date.today()
    rows = []
    for e in timeline.EVENTS:
        if not show_all and tr not in e.tracks:
            continue
        dd = (e.start - today).days
        rows.append({"D-day": "지남" if e.end < today else ("진행 중" if dd <= 0 else f"D-{dd}"),
                     "기간": f"{e.start:%Y-%m-%d}" + (f" ~ {e.end:%m-%d}" if e.end != e.start else ""),
                     "일정": e.title, "비고": e.note})
    nxt = next((i for i, r in enumerate(rows) if r["D-day"] != "지남"), None)
    ui.show("".join(
        f'<div class="ui-row" style="opacity:{.5 if r["D-day"] == "지남" else 1}">'
        + ui.pill("경계" if i == nxt else ("기준 없음" if r["D-day"] == "지남" else "적정"), r["D-day"])
        + f'<div><div class="ui-name">{ui.e(r["일정"])}</div><div class="ui-why">{ui.e(r["기간"])}'
        + (f' · {ui.e(r["비고"])}' if r["비고"] else "") + "</div></div></div>" for i, r in enumerate(rows)))
    st.write("")
    st.markdown("**꼭 알아둘 규칙**")
    for rule, page in timeline.RULES:
        st.write(f"- {rule}  \n  <small>출처: 대교협 기본사항 {page}</small>", unsafe_allow_html=True)
    s = timeline.SOURCE
    st.caption(f"출처: [{s['doc']}]({s['url']}) · {s['page']} · {s['collected_at']} 수집")

# ---------------------------------------------------------------- 4. 수시 대응
if PAGE == "🎯 수시 대응":
    susi_tab.render(con, profile)

# ---------------------------------------------------------------- 3·5. 정시 환산
if PAGE == "🧮 정시 환산":
    jeongsi_tab.render(con)

# ---------------------------------------------------------------- F5 합격 가능성
if PAGE == "📊 합격 가능성":
    admission_tab.render(con, profile)

# ---------------------------------------------------------------- 6. 가나다 조합
if PAGE == "🧩 가나다 조합":
    combo_tab.render(con, profile)

if PAGE == "🔁 재도전 판단":
    retake_tab.render(con, profile)

if PAGE == "🔄 공지 반영":
    updates_tab.render()

# ---------------------------------------------------------------- 7. 인사이트
if PAGE == "💡 인사이트":
    insights_tab.render(profile)

# ---------------------------------------------------------------- 9. 데이터 상태
if PAGE == "🗂 데이터 상태":
    st.subheader("데이터 상태")
    st.caption("앱이 쓰는 모집요강·입결 파일 목록입니다. 관리용 화면입니다.")
    log = ROOT / "data" / "download_log.csv"
    if not log.exists():
        st.warning("아직 다운로드 기록이 없습니다. `python -m scrapers.download` 를 실행하세요.")
    else:
        with log.open(encoding="utf-8") as f:
            data = list(csv.DictReader(f))
        ok = [r for r in data if r["status"] == "ok"]
        m1, m2, m3 = st.columns(3)
        m1.metric("확보 파일", f"{len(ok)} / {len(data)}")
        m2.metric("공식본", sum(r["source_type"] in ("공식", "대교협") for r in ok))
        m3.metric("검증 필요", sum(r["check"] != "확인" for r in ok))
        st.dataframe([{"대학": r["univ_name"], "학년도": r["year"], "구분": r["kind"], "문서": r["doc"],
                       "출처": r["source_type"], "쪽수": r["pages"], "표지 검증": r["check"], "수집": r["collected_at"][:10],
                       "파싱": ("수시 최저·일정·자격 정리 (검증 필요)" if (r["year"], r["kind"], r["doc"]) == ("2027", "수시", "요강")
                                 else "정시 반영식 정리 (검증 필요)" if (r["year"], r["kind"], r["doc"]) == ("2027", "정시", "요강")
                                 else "미착수")} for r in data], hide_index=True, use_container_width=True)
        st.caption("미러 = cdn013.negagea.net (서울 진로진학 계열 자료 CDN으로 추정). 연세대 2027 정시요강으로 공식본과 sha256 일치를 확인함. "
                   "어디가(adiga.kr)는 robots.txt가 자동 수집을 막아 수동 가져오기로만 지원.")

if PAGE == "🧱 템플릿 6종 구조":
    st.markdown(templates_markdown())

if PAGE == "📝 블로그 포스팅":
    blog_tab.render()
