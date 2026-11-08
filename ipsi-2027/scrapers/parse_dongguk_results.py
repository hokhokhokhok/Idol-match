"""동국대 공식 입결 PDF → data/parsed/results/dongguk.csv

대상: '전형별 수능 성적(일반)' 표 (정시 일반전형, 최종등록자/최종합격자 백분위 상위 80% 기준)
열: 모집단위 · 모집군 · 모집인원 · 국어 · 수학 · 영어(등급) · 탐구 · 평균(계열 가중) · 표준편차 · [환산점수 평균]
실행: python -m scrapers.parse_dongguk_results
"""
from __future__ import annotations

import csv
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "parsed" / "results" / "dongguk.csv"
FILES = {  # 입결 학년도: (파일, 기준 설명, URL)
    2026: ("data/raw/dongguk/2026_수시정시_입결.pdf", "최종등록자 백분위 상위 80% 평균",
           "https://ipsi.dongguk.edu/upload/file/202609181646284P926C.PDF"),
    2024: ("data/raw/dongguk/2024_정시_입결.pdf", "최종합격자 백분위 상위 80% 평균",
           "https://ipsi.dongguk.edu/upload/file/20240501095746JHGHCW.PDF"),
}
WEIGHTS = {"인문": {"kor": 35, "math": 25, "inq": 25}, "자연": {"kor": 25, "math": 35, "inq": 25}}  # 2027 정시요강 40쪽과 동일


def track_of(kor: float, mat: float, inq: float, avg: float) -> tuple[str, str]:
    """입결표 '평균'(계열 가중 백분위)을 재현하는 가중치로 계열 판정."""
    best = min(WEIGHTS.items(), key=lambda tw: abs((tw[1]["kor"] * kor + tw[1]["math"] * mat + tw[1]["inq"] * inq)
                                                     / sum(tw[1].values()) - avg))
    t, w = best
    v = (w["kor"] * kor + w["math"] * mat + w["inq"] * inq) / sum(w.values())
    if abs(v - avg) <= 0.02:
        return t, f"국{w['kor']}/수{w['math']}/탐{w['inq']}"
    return "기타", ""


NUM = r"(\d+(?:\.\d+)?)"
ROW = re.compile(rf"^\s*(?:\S+\s{{2,}})?(?P<unit>[^\s].*?)\s+(?P<grp>[가나다])\s+(?P<q>\d+)\s+{NUM}\s+{NUM}\s+{NUM}\s+{NUM}\s+{NUM}\s+{NUM}(?:\s+{NUM})?\s*$")


def parse(year: int, path: str, basis: str, url: str) -> list[dict]:
    txt = subprocess.run(["pdftotext", "-layout", str(ROOT / path), "-"], capture_output=True, text=True).stdout
    pages = txt.split("\f")
    rows = []
    for pno, page in enumerate(pages, 1):
        if "수능 성적(일반)" not in page:
            continue
        for line in page.splitlines():
            m = ROW.match(line)
            if not m:
                continue
            unit = re.sub(r"\s{2,}", " ", m["unit"]).strip()
            unit = re.sub(r"^(불교|문과|이과|법과|사회과학|경찰사법|경영|바이오\s*시스템|공과|첨단융합|사범|예술|약학|미래융합)\s+", "", unit)
            g = m.groups()
            vals = [float(x) for x in g[3:9]]
            conv = float(g[9]) if g[9] else None
            kor, mat, eng, inq, avg, sd = vals
            rows.append({"univ": "dongguk", "year": year, "unit": unit, "group": m["grp"], "quota": int(m["q"]),
                         "kor_pct": kor, "math_pct": mat, "eng_grade": eng, "inq_pct": inq, "pct_avg": avg, "pct_sd": sd,
                         "conv_avg": conv, "basis": basis, "track": track_of(kor, mat, inq, avg)[0],
                         "avg_weights": track_of(kor, mat, inq, avg)[1],
                         "source_url": url, "page": pno, "status": "검증 필요"})
    return rows


def main() -> None:
    allrows = []
    for y, (p, b, u) in FILES.items():
        r = parse(y, p, b, u)
        print(y, len(r), "rows")
        allrows += r
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(allrows[0]))
        w.writeheader()
        w.writerows(allrows)
    print(f"→ {OUT}")


if __name__ == "__main__":
    main()
