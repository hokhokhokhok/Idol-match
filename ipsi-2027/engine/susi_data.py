"""2027 수시(수능 이후 진행분) 데이터 로더 — data/parsed/susi_2027/*.yaml.

모든 값은 '검증 필요' 상태다: 요강 PDF를 사람이 읽고 옮긴 것이므로, 화면에 원문 발췌와 쪽수를 같이 보여준다.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
from pathlib import Path

import yaml

from .minreq import describe

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "data" / "parsed" / "susi_2027"
RULE_KEYS = {"pool", "inq", "inq_round", "pick", "sum_max", "each_max", "must_any", "must_all", "extra",
             "inq_type", "math", "any_of", "eng_12"}
EVENT_KINDS = {"1단계발표", "고사장발표", "면접", "논술", "실기", "최초합격발표"}
GRAD_YEAR_DEFAULT = 2027      # 현역(2027년 2월 졸업예정)


@dataclass
class UnitGroup:
    units: str
    rule: dict | None
    note: str = ""

    @property
    def text(self) -> str:
        return describe(self.rule)


@dataclass
class Event:
    kind: str
    date: date
    units: str = ""
    note: str = ""


@dataclass
class Track:
    univ: str
    univ_name: str
    name: str
    type: str
    grad_ok: bool | None
    grad_year_min: int | None
    grad_note: str
    min_text: str
    min_page: int | None
    groups: list[UnitGroup]
    events: list[Event]
    pdf: str
    source_url: str
    collected_at: str
    pages: dict = field(default_factory=dict)
    univ_notes: list[str] = field(default_factory=list)
    status: str = "검증 필요"

    @property
    def key(self) -> str:
        return f"{self.univ}|{self.name}"

    @property
    def has_min(self) -> bool:
        return any(g.rule for g in self.groups)

    def eligibility(self, grad_year: int, ged: bool = False) -> str:
        """가능 | 불가 | 확인 필요"""
        if self.grad_ok is None:
            return "확인 필요"
        if ged and self.type == "교과":
            return "불가"           # 교과(학교장 추천) 전형은 학생부 필요
        if self.grad_ok is False:
            return "가능" if grad_year >= GRAD_YEAR_DEFAULT and not ged else "불가"
        if self.grad_year_min and grad_year < self.grad_year_min:
            return "불가"
        return "가능"


def _sources() -> dict[str, tuple[str, str]]:
    out = {}
    log = ROOT / "data" / "download_log.csv"
    if log.exists():
        with log.open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r["year"] == "2027" and r["kind"] == "수시" and r["doc"] == "요강":
                    out[r["univ"]] = (r["url"], r["collected_at"][:10])
    return out


def validate_rule(rule: dict | None, where: str) -> list[str]:
    if rule is None:
        return []
    errs = [f"{where}: 알 수 없는 키 {k}" for k in rule if k not in RULE_KEYS]
    if "any_of" in rule:
        for i, r in enumerate(rule["any_of"]):
            errs += validate_rule(r, f"{where}.any_of[{i}]")
        return errs
    if rule.get("pool") and not isinstance(rule.get("pick"), int):
        errs.append(f"{where}: pool 이 있는데 pick 없음")
    if rule.get("pool") and rule.get("sum_max") is None and rule.get("each_max") is None:
        errs.append(f"{where}: sum_max·each_max 둘 다 없음")
    return errs


@lru_cache(maxsize=1)
def load() -> tuple[list[Track], list[str]]:
    unis = {u["id"]: u["name"] for u in
            yaml.safe_load((ROOT / "config" / "universities.yaml").read_text(encoding="utf-8"))["mvp"]}
    src = _sources()
    tracks, errors = [], []
    for f in sorted(DIR.glob("*.yaml")):
        d = yaml.safe_load(f.read_text(encoding="utf-8"))
        uid = d["univ"]
        url, col = src.get(uid, ("", ""))
        for t in d["tracks"]:
            where = f"{f.name}:{t['name']}"
            groups = []
            for g in t["min_req"]:
                errors += validate_rule(g.get("rule"), where)
                groups.append(UnitGroup(g["units"], g.get("rule"), g.get("note", "")))
            events = []
            for e in t.get("events", []):
                if e["kind"] not in EVENT_KINDS:
                    errors.append(f"{where}: 알 수 없는 일정 종류 {e['kind']}")
                events.append(Event(e["kind"], e["date"], e.get("units", ""), e.get("note", "")))
            tracks.append(Track(
                univ=uid, univ_name=unis.get(uid, uid), name=t["name"], type=t["type"],
                grad_ok=t.get("grad_ok"), grad_year_min=t.get("grad_year_min"), grad_note=t.get("grad_note", ""),
                min_text=t.get("min_text", ""), min_page=t.get("min_page"), groups=groups, events=events,
                pdf=d.get("pdf", ""), source_url=url, collected_at=col,
                pages={"자격": t.get("grad_page"), "최저": t.get("min_page"), "일정": t.get("events_page")},
                univ_notes=d.get("notes", [])))
    return tracks, errors


EXAM_KINDS = {"면접", "논술", "실기"}


def calendar(selected: list[Track], since: date | None = None) -> list[dict]:
    """선택한 전형들의 일정을 날짜순으로. 같은 날 고사가 2개 이상이면 conflict=True."""
    rows = []
    for t in selected:
        for e in t.events:
            if since and e.date < since:
                continue
            rows.append({"date": e.date, "kind": e.kind, "univ": t.univ_name, "track": t.name,
                         "units": e.units, "note": e.note, "key": t.key})
    rows.sort(key=lambda r: (r["date"], r["univ"]))
    exam_days: dict[date, set[str]] = {}
    for r in rows:
        if r["kind"] in EXAM_KINDS:
            exam_days.setdefault(r["date"], set()).add(r["key"])
    for r in rows:
        r["conflict"] = r["kind"] in EXAM_KINDS and len(exam_days.get(r["date"], ())) > 1
    return rows
