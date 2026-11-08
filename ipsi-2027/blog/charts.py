"""DB 데이터 → 차트·썸네일 PNG (matplotlib). 대학 로고·UI 캡처는 쓰지 않는다."""
from __future__ import annotations

import io
from dataclasses import dataclass

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import font_manager  # noqa: E402
import logging  # noqa: E402

logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)

# 한글 폰트 우선순위 (설치된 것 중 첫 번째)
KOREAN_FONTS = ["NanumGothic", "Noto Sans KR", "Noto Sans CJK KR", "Malgun Gothic", "AppleGothic", "WenQuanYi Zen Hei"]
SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
S1, S2 = "#2a78d6", "#eb6834"  # 카테고리 1·2번 (검증된 순서)


def _setup_font() -> str:
    have = {f.name for f in font_manager.fontManager.ttflist}
    for name in KOREAN_FONTS:
        if name in have:
            plt.rcParams["font.family"] = name
            plt.rcParams["axes.unicode_minus"] = False
            return name
    return "DejaVu Sans"


FONT = _setup_font()


@dataclass
class Image:
    filename: str
    png: bytes
    alt: str
    caption: str


def _fig(w=8, h=4.5):
    fig, ax = plt.subplots(figsize=(w, h), dpi=150)
    fig.patch.set_facecolor(SURFACE)
    ax.set_facecolor(SURFACE)
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.tick_params(colors=INK2, length=0, labelsize=11)
    return fig, ax


def _save(fig, top: float = 0.8) -> bytes:
    buf = io.BytesIO()
    fig.tight_layout(pad=1.2, rect=(0, 0, 1, top))
    fig.savefig(buf, format="png", facecolor=SURFACE)
    plt.close(fig)
    return buf.getvalue()


def _title(fig, title, sub):
    fig.text(0.02, 0.95, title, fontsize=16, fontweight="bold", color=INK, ha="left", va="top")
    fig.text(0.02, 0.87, sub, fontsize=10.5, color=INK2, ha="left", va="top")


def ratio_chart(univ: str, dept: str, ratio: dict[str, float], footnote: str) -> Image:
    fig, ax = _fig(8, 4.2)
    names = list(ratio)[::-1]
    vals = [ratio[n] for n in names]
    top = max(vals)
    bars = ax.barh(names, vals, height=0.55, color=[S1 if v == top else "#a9c7ee" for v in vals])
    for b, v in zip(bars, vals):
        ax.text(v + 0.8, b.get_y() + b.get_height() / 2, f"{v:g}%", va="center", fontsize=12, color=INK)
    ax.set_xlim(0, top * 1.25)
    ax.set_xticks([])
    ax.spines["bottom"].set_visible(False)
    ax.tick_params(axis="y", labelsize=13, colors=INK)
    _title(fig, f"{univ} {dept} 수능 영역별 반영비율", footnote)
    img = _save(fig)
    alt = f"{univ} {dept} 2027 정시 수능 반영비율 막대그래프: " + ", ".join(f"{k} {v:g}%" for k, v in ratio.items())
    return Image("chart_ratio.png", img, alt, "수능 영역별 반영비율")


def cut_chart(univ: str, dept: str, past: list[dict], total: int, footnote: str) -> Image:
    fig, ax = _fig(8, 4.5)
    years = [str(p["year"]) for p in past]
    c50 = [p["cut50"] for p in past]
    c70 = [p["cut70"] for p in past]
    ax.plot(years, c50, color=S1, lw=2, marker="o", ms=8, mec=SURFACE, mew=2, label="50% 컷")
    ax.plot(years, c70, color=S2, lw=2, marker="o", ms=8, mec=SURFACE, mew=2, label="70% 컷")
    ax.annotate(f"{c50[-1]:.1f}", (years[-1], c50[-1]), xytext=(10, 4), textcoords="offset points", color=INK, fontsize=11)
    ax.annotate(f"{c70[-1]:.1f}", (years[-1], c70[-1]), xytext=(10, -12), textcoords="offset points", color=INK, fontsize=11)
    ax.grid(axis="y", color=GRID, lw=0.8)
    ax.set_axisbelow(True)
    lo, hi = min(c70), max(c50)
    pad = max((hi - lo) * 0.6, 2)
    ax.set_ylim(lo - pad, hi + pad)
    ax.set_xlim(-0.3, len(years) - 0.5)
    ax.legend(loc="lower left", frameon=False, fontsize=11, labelcolor=INK2, ncol=2)
    _title(fig, f"{univ} {dept} 최근 3년 정시 환산점수 컷 (참고치)", f"{total}점 만점 환산 · {footnote}")
    img = _save(fig)
    alt = (f"{univ} {dept} 연도별 정시 입결 꺾은선그래프({total}점 만점, 참고치): "
           + "; ".join(f"{p['year']}학년도 50%컷 {p['cut50']:.1f}점·70%컷 {p['cut70']:.1f}점" for p in past))
    return Image("chart_cut.png", img, alt, "최근 3년 50%·70% 컷")


def competition_chart(univ: str, dept: str, past: list[dict], footnote: str) -> Image:
    fig, ax = _fig(8, 4.0)
    years = [str(p["year"]) for p in past]
    comp = [p["competition"] for p in past]
    bars = ax.bar(years, comp, width=0.5, color=S1)
    for b, v in zip(bars, comp):
        ax.text(b.get_x() + b.get_width() / 2, v + max(comp) * 0.03, f"{v:g} : 1", ha="center", fontsize=12, color=INK)
    ax.set_yticks([])
    ax.set_ylim(0, max(comp) * 1.3)
    _title(fig, f"{univ} {dept} 연도별 정시 경쟁률", footnote)
    img = _save(fig)
    alt = f"{univ} {dept} 정시 경쟁률 막대그래프: " + ", ".join(f"{p['year']}학년도 {p['competition']:g}대 1" for p in past)
    return Image("chart_competition.png", img, alt, "연도별 정시 경쟁률")


def thumbnail(univ: str, dept: str, headline: str, sub: str, badge: str | None = None) -> Image:
    fig = plt.figure(figsize=(6, 6), dpi=180)
    fig.patch.set_facecolor("#10233f")
    fig.text(0.08, 0.86, "2027 정시", fontsize=20, color="#a9c7ee", fontweight="bold")
    fig.text(0.08, 0.68, f"{univ}\n{dept}", fontsize=44, color="white", fontweight="bold", va="top", linespacing=1.15)
    fig.text(0.08, 0.30, headline, fontsize=30, color="#ffd27a", fontweight="bold")
    fig.text(0.08, 0.20, sub, fontsize=15, color="#dfe6f0")
    fig.add_artist(plt.Line2D([0.08, 0.92], [0.12, 0.12], color="#3a5578", lw=1.5))
    fig.text(0.08, 0.06, "모집인원 · 반영비율 · 입결 총정리", fontsize=13, color="#a9c7ee")
    if badge:
        fig.text(0.92, 0.06, badge, fontsize=12, color="#10233f", ha="right",
                 bbox=dict(boxstyle="round,pad=0.4", fc="#ffd27a", ec="none"))
    buf = io.BytesIO()
    fig.savefig(buf, format="png", facecolor=fig.get_facecolor())
    plt.close(fig)
    alt = f"썸네일: 2027 정시 {univ} {dept}, {headline}, {sub}"
    return Image("thumbnail.png", buf.getvalue(), alt, "썸네일")
