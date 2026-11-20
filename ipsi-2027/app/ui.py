"""화면 공통 스타일과 카드 도우미 — 읽기 쉬운 글자 크기·간격, 판정 배지, 결과 카드."""
from __future__ import annotations

import html

import streamlit as st

CSS = """
<style>
@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css");
:root{--blue:#3182f6;--blue-soft:#e8f3ff;--ink:#191f28;--ink2:#4e5968;--ink3:#8b95a1;--line:#e5e8eb;--fill:#f2f4f6;--card:#fff;
  --ok:#03b26c;--ok-bg:#e5f8f0;--warn:#b45309;--warn-bg:#fff4e0;--bad:#f04452;--bad-bg:#ffeeee;--info:#1b64da;--info-bg:#e8f3ff;--mute-bg:#f2f4f6}
html, body, [class*="css"], .stMarkdown, .stText, button, input, select, textarea{font-family:"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif !important;letter-spacing:-.01em}
html, body, .stMarkdown{font-size:17px}
.block-container{max-width:1080px;padding-top:2rem}
.stMarkdown p, .stMarkdown li{line-height:1.7}
[data-testid="stCaptionContainer"], .stCaption{font-size:.93rem !important;color:#6b7684 !important;line-height:1.6}
h1{font-size:1.8rem !important;font-weight:800 !important;letter-spacing:-.03em} h2{font-size:1.4rem !important;font-weight:700 !important;letter-spacing:-.02em} h3{font-size:1.15rem !important;font-weight:700 !important}
[data-testid="stWidgetLabel"] p{font-size:.95rem !important;font-weight:600;color:var(--ink2)}
[data-testid="stSidebar"]{background:#fff;border-right:1px solid var(--line)}
[data-testid="stSidebar"] [role="radiogroup"] label{padding:8px 10px;border-radius:12px;width:100%}
[data-testid="stSidebar"] [role="radiogroup"] label:has(input:checked){background:var(--blue-soft)}
[data-testid="stSidebar"] [role="radiogroup"] label:has(input:checked) p{color:var(--info);font-weight:700}
[data-testid="stSidebar"] [role="radiogroup"] label > div:first-child{display:none}
[data-testid="stSidebar"] [role="radiogroup"] label p{font-size:1rem}
.stButton > button, .stDownloadButton > button{border-radius:12px;border:none;background:var(--fill);font-weight:600;padding:.55rem 1.1rem}
.stButton > button[kind="primary"]{background:var(--blue);color:#fff}
.stButton > button:hover{background:var(--blue-soft);color:var(--info)}
[data-baseweb="input"], [data-baseweb="select"] > div, [data-baseweb="textarea"]{border-radius:12px !important}
[data-testid="stExpander"] details{border-radius:16px;border:none;background:#fff}
[data-testid="stVerticalBlockBorderWrapper"]{border-radius:20px}
[data-testid="stAlert"]{border-radius:16px}
[data-testid="stDataFrame"]{font-size:1rem;border-radius:16px;overflow:hidden}
.ui-card{border-radius:20px;padding:20px 22px;margin:0 0 12px;background:var(--card);box-shadow:0 1px 2px rgba(0,0,0,.04)}
.ui-card h4{margin:0 0 4px;font-size:1.1rem;font-weight:700;letter-spacing:-.02em}
.ui-card h4 small{font-weight:500;color:var(--ink3);font-size:.9rem;margin-left:6px}
.ui-row{display:flex;gap:12px;align-items:flex-start;margin-top:12px}
.ui-row .ui-pill{flex:0 0 auto;min-width:100px;text-align:center}
.ui-why{color:var(--ink3);font-size:.93rem;line-height:1.55}
.ui-name{font-weight:700;color:var(--ink)}
.ui-foot{border-top:1px solid var(--line);margin-top:14px;padding-top:10px;color:var(--ink3);font-size:.9rem}
.ui-pill{display:inline-block;font-weight:700;font-size:.82rem;padding:4px 10px;border-radius:8px;white-space:nowrap}
.p-ok{background:var(--ok-bg);color:var(--ok)}.p-warn{background:var(--warn-bg);color:var(--warn)}
.p-bad{background:var(--bad-bg);color:var(--bad)}.p-info{background:var(--info-bg);color:var(--info)}.p-mute{background:var(--mute-bg);color:var(--ink3)}
.ui-score{font-size:1.85rem;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums;color:var(--ink)}
.ui-score span{font-size:1rem;font-weight:600;color:var(--ink3)}
.ui-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.ui-grid .ui-card{margin:0}
.ui-chips{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 14px}
.ui-hero{background:var(--blue);color:#fff;border-radius:20px;padding:24px 26px;margin-bottom:16px}
.ui-hero small{opacity:.85;font-weight:600}
.ui-hero strong{display:block;font-size:1.55rem;font-weight:800;letter-spacing:-.03em;margin:4px 0}
.ui-fact .v{font-size:1.15rem;font-weight:800;letter-spacing:-.02em;margin:4px 0}
@media (max-width:640px){.ui-row{flex-direction:column;gap:4px}.ui-row .ui-pill{min-width:0}}
@media (prefers-color-scheme: dark){:root{--ink:#f9fafb;--ink2:#c3c8cf;--ink3:#8b95a1;--line:#2c2c35;--fill:#2c2c35;--card:#1e1e24;--ok:#3ddc97;--ok-bg:#12302a;--warn:#fbbf24;--warn-bg:#3a2c10;
  --bad:#ff6b77;--bad-bg:#3d1b20;--info:#8fbaff;--info-bg:#1b2a44;--mute-bg:#2c2c35;--blue-soft:#1b2a44}}
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


def hero(small: str, title: str, sub: str = "") -> None:
    show(f'<div class="ui-hero"><small>{e(small)}</small><strong>{e(title)}</strong>' + (f'<span style="opacity:.9">{e(sub)}</span>' if sub else "") + "</div>")


def fact(label: str, value: str, note: str, status: str, link: str) -> str:
    st = {"추정": "p-warn", "보도": "p-info", "공식": "p-ok"}.get(status, "p-mute")
    return (f'<div class="ui-card ui-fact"><div style="display:flex;justify-content:space-between;gap:6px"><span class="ui-why" style="font-weight:600">{e(label)}</span>'
            f'<span class="ui-pill {st}">{e(status)}</span></div><div class="v">{e(value)}</div><div class="ui-why">{e(note)} · {link}</div></div>')
