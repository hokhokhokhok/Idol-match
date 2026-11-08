"""data/parsed/susi_2027 → docs/susi_2027_review.md (사람이 요강과 대조하는 검토표). python -m engine.susi_report"""
from collections import Counter
from datetime import date

from .susi_data import ROOT, load

CSAT = date(2026, 11, 19)


def main() -> None:
    tracks, errors = load()
    c = Counter(t.type for t in tracks)
    lines = ["# 2027 수시 최저·일정·자격 검토표", "",
             "> `python -m engine.susi_report` 로 자동 생성. 원본은 `data/parsed/susi_2027/*.yaml`.",
             "> 모든 항목 상태: **검증 필요** — 요강 PDF를 읽고 옮긴 값. 쪽수는 PDF 기준(인쇄 쪽번호와 다를 수 있음).",
             f"> {len({t.univ for t in tracks})}개교 · {len(tracks)}개 전형 (교과 {c['교과']} · 종합 {c['종합']} · 논술 {c['논술']})"
             + (f" · 스키마 오류 {len(errors)}건" if errors else ""), ""]
    cur = None
    for t in sorted(tracks, key=lambda x: (x.univ_name, x.type, x.name)):
        if t.univ_name != cur:
            cur = t.univ_name
            lines += ["", f"## {cur}", f"원문: `{t.pdf}` · [{t.source_url[:60]}…]({t.source_url}) · {t.collected_at} 수집", ""]
            lines += [f"- 참고: {n}" for n in t.univ_notes] + ([""] if t.univ_notes else [])
            lines += ["| 전형 | 모집단위 | 최저(정리) | 졸업생 | 수능 후 고사 | 발표 | 쪽(최저/자격/일정) |", "|---|---|---|---|---|---|---|"]
        exams = ", ".join(f"{e.kind} {e.date:%m/%d}" for e in t.events if e.kind in ("면접", "논술") and e.date >= CSAT) or "-"
        ann = next((f"{e.date:%m/%d}" for e in t.events if e.kind == "최초합격발표"), "-")
        grad = {True: "가능", False: "불가(졸업예정자만)", None: "확인 필요"}[t.grad_ok]
        if t.grad_ok and t.grad_year_min:
            grad = f"{t.grad_year_min}년 2월 이후 졸업자부터"
        pg = "/".join(str(t.pages.get(k) or "-") for k in ("최저", "자격", "일정"))
        for i, g in enumerate(t.groups):
            first = i == 0
            lines.append(f"| {t.name if first else ''} | {g.units} | {g.text} | {grad if first else ''} | "
                         f"{exams if first else ''} | {ann if first else ''} | {pg if first else ''} |")
    (ROOT / "docs" / "susi_2027_review.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{len(tracks)} tracks → docs/susi_2027_review.md")


if __name__ == "__main__":
    main()
