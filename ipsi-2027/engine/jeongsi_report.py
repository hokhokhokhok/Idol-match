"""data/parsed/jeongsi_2027 → docs/jeongsi_2027_review.md (요강 대조용). python -m engine.jeongsi_report"""
from collections import Counter

from .jeongsi_data import ROOT, load


def main() -> None:
    groups, meta = load()
    c = Counter(g.kind for g in groups)
    lines = ["# 2027 정시 수능 반영식 검토표", "",
             "> `python -m engine.jeongsi_report` 로 자동 생성. 원본 `data/parsed/jeongsi_2027/*.yaml`. 상태: **검증 필요**.",
             f"> {len(meta)}개교 · {len(groups)}개 모집단위 그룹 — 요강식 {c['요강식']} · 근사식 {c['근사식']} · 비율만 {c['비율만']}",
             "> 요강 계산 예시로 검증: 서강대(504.82), 중앙대(711.194·701.523), 동국대(721.175·649.058·709.403), 홍익대(135.2) — `tests/test_conversion.py`",
             ""]
    for u, m in sorted(meta.items(), key=lambda x: x[1]["name"]):
        lines += [f"## {m['name']} — {m['track']}", f"원문: `{m['pdf']}` · [요강 링크]({m['source_url']})", ""]
        lines += [f"- {n}" for n in m["notes"]] + [""]
        lines += ["| 그룹 | 계산 | 반영 비중 | 요강 요약 | 쪽 |", "|---|---|---|---|---|"]
        for g in [g for g in groups if g.univ == u]:
            w = " · ".join(f"{k} {v:g}%" for k, v in g.weights().items())
            lines.append(f"| {g.label} | {g.kind}{' — ' + g.blocked if g.blocked else ''} | {w} | {g.text} | {g.page} |")
        if m["dept_map"]:
            lines.append("")
            lines.append("학과 매핑(블로그용): " + ", ".join(f"{k} → {v}" for k, v in m["dept_map"].items()))
        lines.append("")
    (ROOT / "docs" / "jeongsi_2027_review.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"{len(groups)} groups → docs/jeongsi_2027_review.md")


if __name__ == "__main__":
    main()
