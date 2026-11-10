"""화면 공통 스타일과 카드 도우미 — 읽기 쉬운 글자 크기·간격, 판정 배지, 결과 카드."""
from __future__ import annotations

import html

import streamlit as st

CSS = """
<style>
:root{--omr:#c4334f;--ink2:#5f5458;--rule:#ead9dc;--soft:#fbf6f7;
  --ok:#1f7a4d;--ok-bg:#e2f3ea;--warn:#a15c00;--warn-bg:#fbeed8;--bad:#b3261e;--bad-bg:#fbe3e1;--info:#2457a6;--info-bg:#e3ecf9;--mute-bg:#f1eeef}
html, body, [class*="css"], .stMarkdown, .stText{font-size:17px}
.block-container{max-width:1100px;padding-top:2.2rem}
.stMarkdown p, .stMarkdown li{line-height:1.75}
[data-testid="stCaptionContainer"], .stCaption{font-size:.95rem !important;color:var(--ink2) !important;line-height:1.65}
h1{font-size:1.9rem !important} h2{font-size:1.45rem !important} h3{font-size:1.2rem !important}
[data-testid="stWidgetLabel"] p{font-size:1rem !important;font-weight:600}
[data-testid="stSidebar"] [role="radiogroup"] label p{font-size:1.02rem}
[data-testid="stSidebar"] [role="radiogroup"]{gap:.35rem}
[data-testid="stDataFrame"]{font-size:1rem}
.ui-card{border:1px solid var(--rule);border-radius:12px;padding:16px 18px;margin:0 0 12px;background:#fff}
.ui-card h4{margin:0 0 4px;font-size:1.12rem;font-weight:700}
.ui-card h4 small{font-weight:400;color:var(--ink2);font-size:.92rem;margin-left:6px}
.ui-row{display:flex;gap:12px;align-items:flex-start;margin-top:10px}
.ui-row .ui-pill{flex:0 0 auto;min-width:104px;text-align:center}
.ui-why{color:var(--ink2);font-size:.95rem;line-height:1.6}
.ui-name{font-weight:600}
.ui-foot{border-top:1px dashed var(--rule);margin-top:12px;padding-top:8px;color:var(--ink2);font-size:.92rem}
.ui-pill{display:inline-block;font-weight:600;font-size:.88rem;padding:3px 12px;border-radius:999px;white-space:nowrap}
.p-ok{background:var(--ok-bg);color:var(--ok)}.p-warn{background:var(--warn-bg);color:var(--warn)}
.p-bad{background:var(--bad-bg);color:var(--bad)}.p-info{background:var(--info-bg);color:var(--info)}.p-mute{background:var(--mute-bg);color:var(--ink2)}
.ui-score{font-size:1.7rem;font-weight:700;font-variant-numeric:tabular-nums}
.ui-score span{font-size:1rem;font-weight:400;color:var(--ink2)}
.ui-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.ui-grid .ui-card{margin:0}
.ui-chips{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 14px}
@media (max-width:640px){.ui-row{flex-direction:column;gap:4px}.ui-row .ui-pill{min-width:0}}
@media (prefers-color-scheme: dark){:root{--ink2:#b3a4a9;--rule:#3a2f33;--soft:#211b1e;--ok:#6fd3a0;--ok-bg:#183327;--warn:#f0b35a;--warn-bg:#3a2a12;
  --bad:#ff8a80;--bad-bg:#3d1c1a;--info:#8fb5f5;--info-bg:#1a2740;--mute-bg:#2a2326}.ui-card{background:transparent}}
</style>
"""

PILL = {"충족": "p-ok", "경계": "p-warn", "미충족": "p-bad", "기준 없음": "p-mute",
        "안정": "p-ok", "적정": "p-info", "소신": "p-warn", "위험": "p-bad",
        "요강식": "p-ok", "근사(임시)": "p-warn", "근사식": "p-warn", "비율만": "p-mute"}
LABEL = {"충족": "최저 충족", "경계": "아슬아슬", "미충족": "최저 못 맞춤", "기준 없음": "최저 없음",
         "요강식": "요강 공식", "근사(임시)": "근사 계산", "근사식": "근사 계산", "비율만": "비율만 확인"}


def style() -> None:
    st.markdown(CSS, unsafe_allow_html=True)


def e(s) -> str:
    return html.escape(str(s if s is not None else ""))


def pill(key: str, text: str | None = None) -> str:
    return f'<span class="ui-pill {PILL.get(key, "p-mute")}">{e(text or LABEL.get(key, key))}</span>'


def row(key: str, name: str, why: str = "", text: str | None = None) -> str:
    return (f'<div class="ui-row">{pill(key, text)}<div><div class="ui-name">{e(name)}</div>'
            + (f'<div class="ui-why">{e(why)}</div>' if why else "") + "</div></div>")


def card(title: str, sub: str = "", body: str = "", foot: str = "", badges: str = "") -> str:
    head = f'<h4>{e(title)}<small>{e(sub)}</small></h4>' if sub else f"<h4>{e(title)}</h4>"
    if badges:
        head = f'<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">{head}<div>{badges}</div></div>'
    return f'<div class="ui-card">{head}{body}' + (f'<div class="ui-foot">{foot}</div>' if foot else "") + "</div>"


def show(htm: str) -> None:
    st.markdown(htm, unsafe_allow_html=True)


def chips(items: list[tuple[str, str]]) -> None:
    show('<div class="ui-chips">' + "".join(pill(k, t) for k, t in items) + "</div>")
