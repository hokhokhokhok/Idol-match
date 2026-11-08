"""2027 정시 반영식 로더 — data/parsed/jeongsi_2027/*.yaml (상태: 검증 필요)."""
from __future__ import annotations

import csv
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

import yaml

from .conversion import Result, compute, weights

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "data" / "parsed" / "jeongsi_2027"


@dataclass
class Group:
    univ: str
    univ_name: str
    id: str
    label: str
    page: int | None
    text: str
    formula: dict | None
    blocked: str = ""
    ratios: dict = field(default_factory=dict)
    track: str = ""
    notes: list[str] = field(default_factory=list)
    source_url: str = ""
    collected_at: str = ""
    pdf: str = ""

    @property
    def key(self) -> str:
        return f"{self.univ}|{self.id}"

    @property
    def kind(self) -> str:
        if self.formula is None:
            return "비율만"
        f = self.formula["best_of"][0] if "best_of" in self.formula else self.formula
        return "근사식" if f.get("approx") else "요강식"

    def compute(self, scores: dict, maxes: dict | None = None) -> Result | None:
        return compute(self.formula, scores, maxes) if self.formula else None

    def weights(self) -> dict[str, float]:
        if self.formula:
            return weights(self.formula)
        return {k: float(v) for k, v in self.ratios.items()}


def _sources() -> dict[str, tuple[str, str]]:
    out = {}
    log = ROOT / "data" / "download_log.csv"
    if log.exists():
        with log.open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r["year"] == "2027" and r["kind"] == "정시" and r["doc"] == "요강":
                    out[r["univ"]] = (r["url"], r["collected_at"][:10])
    return out


@lru_cache(maxsize=1)
def load() -> tuple[list[Group], dict[str, dict]]:
    """(그룹 목록, 대학별 {dept_map, notes, track})"""
    names = {u["id"]: u["name"] for u in
             yaml.safe_load((ROOT / "config" / "universities.yaml").read_text(encoding="utf-8"))["mvp"]}
    src = _sources()
    groups, meta = [], {}
    for f in sorted(DIR.glob("*.yaml")):
        if f.name.startswith("quota"):
            continue
        d = yaml.safe_load(f.read_text(encoding="utf-8"))
        u = d["univ"]
        url, col = src.get(u, ("", ""))
        meta[u] = {"dept_map": d.get("dept_map", {}), "notes": d.get("notes", []), "track": d.get("track", ""),
                   "name": names.get(u, u), "source_url": url, "pdf": d.get("pdf", "")}
        for g in d["groups"]:
            groups.append(Group(u, names.get(u, u), g["id"], g["label"], g.get("page"), g.get("text", ""),
                                g.get("formula"), g.get("blocked", ""), g.get("ratios", {}), d.get("track", ""),
                                d.get("notes", []), url, col, d.get("pdf", "")))
    return groups, meta


def group_for(univ: str, dept: str) -> Group | None:
    groups, meta = load()
    gid = (meta.get(univ) or {}).get("dept_map", {}).get(dept)
    return next((g for g in groups if g.univ == univ and g.id == gid), None)
