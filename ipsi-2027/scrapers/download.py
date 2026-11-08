"""Phase 1 다운로드: 2027·2026 수시/정시 모집요강 + 확인된 입결·대교협 기본사항.

실행:  python -m scrapers.download            (이미 받은 파일은 건너뜀)
       python -m scrapers.download --force    (다시 받기)
       python -m scrapers.download --only yonsei,snu

원칙
- robots.txt 확인 후 차단된 경로는 받지 않음 (status=robots_blocked)
- 요청 간 지연(기본 1.5초), 식별 가능한 User-Agent
- 공식 URL이 있으면 공식본 우선, 없으면 CDN 미러(서울진로진학정보센터 계열 추정)
- 저장: data/raw/{univ}/{year}_{kind}_{doc}.pdf  (data/raw 는 git 제외)
- 로그: data/download_log.csv (URL·수집일·sha256·쪽수·검증 결과) → 커밋 대상
- 보고: docs/download_report.md
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import sys
import time
import urllib.parse
import urllib.robotparser
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path

import httpx
import yaml

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
LOG = ROOT / "data" / "download_log.csv"
REPORT = ROOT / "docs" / "download_report.md"
UA = "ipsi-2027-personal-research/0.1 (non-commercial; low-rate)"
DELAY = 1.5
CDN = "https://cdn013.negagea.net/dgsmidc/omr/seoul/web/"
CDN_FOLDER = {2027: "univ_info2026", 2026: "univ_info2025"}
YEARS = (2027, 2026)
KINDS = ("수시", "정시")


@dataclass
class Target:
    univ: str
    univ_name: str
    year: int
    kind: str
    doc: str
    urls: list[tuple[str, str]]          # [(url, source_type)] 우선순위 순
    found_on: str = ""
    path: Path = field(init=False)

    def __post_init__(self):
        self.path = RAW / self.univ / f"{self.year}_{self.kind}_{self.doc}.pdf"


@dataclass
class Result:
    collected_at: str
    univ: str
    univ_name: str
    year: int
    kind: str
    doc: str
    status: str            # ok | skipped_exists | not_found | robots_blocked | error | not_pdf
    source_type: str = ""
    url: str = ""
    http: str = ""
    bytes: int = 0
    pages: int = 0
    sha256: str = ""
    check: str = ""        # 표지 텍스트 검증: 확인 | 검증 필요 | -
    path: str = ""
    note: str = ""


def load_targets(only: set[str] | None) -> list[Target]:
    unis = yaml.safe_load((ROOT / "config" / "universities.yaml").read_text(encoding="utf-8"))["mvp"]
    extra = yaml.safe_load((ROOT / "config" / "sources_extra.yaml").read_text(encoding="utf-8"))
    names = {u["id"]: u["name"] for u in unis} | {"_kcue": "대교협"}
    official = {(o["univ"], o["year"], o["kind"], o["doc"]): o for o in extra["official"]}
    targets: list[Target] = []
    for u in unis:
        for year in YEARS:
            for kind in KINDS:
                n = u["cdn_name"]
                cdn = CDN + urllib.parse.quote(f"{CDN_FOLDER[year]}/{n}/{n}_{year}학년도_{kind}모집요강.pdf")
                urls = [(cdn, "미러(CDN)")]
                o = official.pop((u["id"], year, kind, "요강"), None)
                if o:
                    urls.insert(0, (o["url"], "공식"))
                targets.append(Target(u["id"], u["name"], year, kind, "요강", urls, o["found_on"] if o else ""))
    for (uid, year, kind, doc), o in official.items():
        st = "대교협" if uid == "_kcue" else "공식"
        targets.append(Target(uid, names.get(uid, uid), year, kind, doc, [(o["url"], st)], o.get("found_on", "")))
    if only:
        targets = [t for t in targets if t.univ in only]
    return targets


class Robots:
    def __init__(self, client: httpx.Client):
        self.client, self.cache = client, {}

    def allowed(self, url: str) -> bool:
        p = urllib.parse.urlparse(url)
        root = f"{p.scheme}://{p.netloc}"
        if root not in self.cache:
            rp = urllib.robotparser.RobotFileParser()
            try:
                r = self.client.get(root + "/robots.txt", timeout=15)
                body = r.text if r.status_code == 200 and "<html" not in r.text[:500].lower() else ""
            except httpx.HTTPError:
                body = ""
            rp.parse(body.splitlines())   # 없거나 404면 전부 허용
            self.cache[root] = rp
            time.sleep(DELAY)
        return self.cache[root].can_fetch(UA, url)


def pdf_check(path: Path, t: Target) -> tuple[int, str]:
    try:
        import pdfplumber
        with pdfplumber.open(path) as pdf:
            n = len(pdf.pages)
            # 표지가 이미지인 요강이 많아 앞 10쪽까지 보고, "2 0 2 7"처럼 띄어 쓴 글자도 잡도록 공백 제거
            head = "".join("".join((pg.extract_text() or "") for pg in pdf.pages[:10]).split())
    except Exception as e:  # noqa: BLE001
        return 0, f"검증 필요 (파싱 실패: {type(e).__name__})"
    if len(head) < 100:
        return n, "검증 필요 (텍스트 레이어 없음 — 이미지 PDF, OCR 필요)"
    if t.doc == "기본사항":
        ok = "2027학년도" in head and "기본사항" in head
    elif t.doc.startswith("시행계획"):
        ok = "2027학년도" in head and "시행계획" in head
    elif t.doc == "요강":
        ok = f"{t.year}" in head and (t.kind in head or f"{t.kind}모집" in head)
    else:
        ok = f"{t.year}" in head
    return n, "확인" if ok else "검증 필요 (표지에서 학년도·전형 문구 미확인)"


def fetch(client: httpx.Client, robots: Robots, t: Target, force: bool) -> Result:
    now = datetime.now().isoformat(timespec="seconds")
    base = dict(collected_at=now, univ=t.univ, univ_name=t.univ_name, year=t.year, kind=t.kind, doc=t.doc)
    if t.path.exists() and not force:
        data = t.path.read_bytes()
        pages, check = pdf_check(t.path, t)
        return Result(**base, status="skipped_exists", bytes=len(data), pages=pages, check=check,
                      sha256=hashlib.sha256(data).hexdigest(), path=str(t.path.relative_to(ROOT)))
    notes = []
    for url, st in t.urls:
        if not robots.allowed(url):
            notes.append(f"{st}: robots.txt 차단")
            continue
        try:
            r = client.get(url, timeout=60, follow_redirects=True)
        except httpx.HTTPError as e:
            notes.append(f"{st}: {type(e).__name__}")
            time.sleep(DELAY)
            continue
        time.sleep(DELAY)
        if r.status_code != 200:
            notes.append(f"{st}: HTTP {r.status_code}")
            continue
        if not r.content.startswith(b"%PDF"):
            notes.append(f"{st}: PDF 아님({r.headers.get('content-type', '?')})")
            continue
        t.path.parent.mkdir(parents=True, exist_ok=True)
        t.path.write_bytes(r.content)
        pages, check = pdf_check(t.path, t)
        return Result(**base, status="ok", source_type=st, url=url, http=str(r.status_code), bytes=len(r.content),
                      pages=pages, sha256=hashlib.sha256(r.content).hexdigest(), check=check,
                      path=str(t.path.relative_to(ROOT)), note="; ".join(notes))
    status = "robots_blocked" if notes and all("robots" in n for n in notes) else "not_found"
    return Result(**base, status=status, url=t.urls[0][0], note="; ".join(notes))


def merge_log(results: list[Result]) -> list[dict]:
    """기존 로그와 합침: 같은 (univ, year, kind, doc)는 최신 결과로 교체, skipped면 원래 URL·출처 유지."""
    old = {}
    if LOG.exists():
        with LOG.open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                old[(row["univ"], row["year"], row["kind"], row["doc"])] = row
    for r in results:
        k = (r.univ, str(r.year), r.kind, r.doc)
        row = {kk: str(v) for kk, v in asdict(r).items()}
        if r.status == "skipped_exists" and k in old:
            prev = old[k]
            row.update({x: prev[x] for x in ("collected_at", "source_type", "url", "http", "note")})
            row["status"] = "ok" if prev["status"] in ("ok", "skipped_exists") else prev["status"]
        old[k] = row
    rows = sorted(old.values(), key=lambda r: (r["univ"], r["doc"], r["year"], r["kind"]))
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(asdict(results[0]).keys()) if results else list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    return rows


def write_report(rows: list[dict]) -> None:
    unis = yaml.safe_load((ROOT / "config" / "universities.yaml").read_text(encoding="utf-8"))["mvp"]
    by = {}
    for r in rows:
        by.setdefault(r["univ"], {})[(r["year"], r["kind"], r["doc"])] = r

    def cell(r):
        if not r:
            return "—"
        if r["status"] != "ok":
            return "❌"
        mark = "✅" if r["check"] == "확인" else "⚠️"
        src = "미러" if r["source_type"].startswith("미러") else r["source_type"]
        return f"{mark} {src} {r['pages']}p"

    lines = ["# Phase 1 다운로드 결과", "",
             f"> `python -m scrapers.download` 실행 결과 · 마지막 갱신 {datetime.now():%Y-%m-%d %H:%M}",
             "> ✅ 표지 문구 확인 · ⚠️ 받았지만 표지에서 학년도/전형 문구를 못 찾음(검증 필요) · ❌ 실패 · — 대상 아님",
             "> 미러 = cdn013.negagea.net (서울 진로진학정보 계열 자료 CDN으로 추정, 운영 주체 검증 필요). 공식본과 대조 전까지 '임시'.", "",
             "## 모집요강", "", "| 대학 | 2027 수시 | 2027 정시 | 2026 수시 | 2026 정시 |", "|---|---|---|---|---|"]
    for u in unis:
        d = by.get(u["id"], {})
        lines.append(f"| {u['name']} | " + " | ".join(cell(d.get((str(y), k, "요강"))) for y in YEARS for k in KINDS) + " |")
    lines += ["", "## 입결·기본사항 (공식 사이트에서 위치 확인된 것)", "", "| 대학 | 학년도 | 구분 | 문서 | 결과 | 쪽수 | URL |", "|---|---|---|---|---|---|---|"]
    for r in rows:
        if r["doc"] != "요강":
            lines.append(f"| {r['univ_name']} | {r['year']} | {r['kind']} | {r['doc']} | {cell(r)} | {r['pages']} | {r['url']} |")
    fails = [r for r in rows if r["status"] != "ok"]
    warn = [r for r in rows if r["status"] == "ok" and r["check"] != "확인"]
    lines += ["", "## 실패·검증 필요", ""]
    lines += [f"- ❌ {r['univ_name']} {r['year']} {r['kind']} {r['doc']}: {r['status']} — {r['note']}" for r in fails] or ["- 실패 없음"]
    lines += [f"- ⚠️ {r['univ_name']} {r['year']} {r['kind']} {r['doc']}: {r['check']}" for r in warn]
    ok = [r for r in rows if r["status"] == "ok"]
    lines += ["", f"합계: {len(ok)}/{len(rows)}개 확보, 총 {sum(int(r['bytes']) for r in ok) / 1e6:.1f} MB", ""]
    REPORT.write_text("\n".join(lines), encoding="utf-8")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default="")
    a = ap.parse_args(argv)
    targets = load_targets(set(a.only.split(",")) if a.only else None)
    results = []
    with httpx.Client(headers={"User-Agent": UA}) as client:
        robots = Robots(client)
        for i, t in enumerate(targets, 1):
            r = fetch(client, robots, t, a.force)
            results.append(r)
            print(f"[{i:>2}/{len(targets)}] {t.univ_name} {t.year} {t.kind} {t.doc}: {r.status} {r.source_type} "
                  f"{r.pages}p {r.check} {r.note}", flush=True)
    rows = merge_log(results)
    write_report(rows)
    print(f"log: {LOG}\nreport: {REPORT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
