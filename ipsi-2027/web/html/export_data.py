"""HTML판용 데이터 JSON 생성 (출처 포함)."""
import csv, json, sys, yaml
from datetime import date
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]; sys.path.insert(0, str(ROOT))
from engine import susi_data, jeongsi_data, timeline

def ser(o):
    if isinstance(o, date): return o.isoformat()
    if hasattr(o, "__dataclass_fields__"):
        import dataclasses; return dataclasses.asdict(o)
    raise TypeError(o)

tracks, _ = susi_data.load()
susi = [{"univ": t.univ, "univ_name": t.univ_name, "name": t.name, "type": t.type, "grad_ok": t.grad_ok,
         "grad_year_min": t.grad_year_min, "grad_note": t.grad_note, "min_text": t.min_text, "min_page": t.min_page,
         "source_url": t.source_url, "groups": [{"units": g.units, "rule": g.rule} for g in t.groups],
         "events": t.events} for t in tracks]
groups, meta = jeongsi_data.load()
js = [{"key": g.key, "univ": g.univ, "univ_name": g.univ_name, "label": g.label, "page": g.page, "text": g.text,
       "formula": g.formula, "blocked": g.blocked, "ratios": g.ratios, "kind": g.kind, "notes": g.notes,
       "source_url": g.source_url} for g in groups]
res = list(csv.DictReader(open(ROOT / "data/parsed/results/dongguk.csv", encoding="utf-8")))
ev = [{"start": e.start, "end": e.end, "title": e.title, "tracks": list(e.tracks), "note": e.note} for e in timeline.EVENTS]
ins = yaml.safe_load(open(ROOT / "data/insights/seed.yaml", encoding="utf-8"))
out = {"susi": susi, "jeongsi": js, "results": res, "timeline": ev, "timeline_source": timeline.SOURCE,
       "rules": getattr(timeline, "RULES", []), "insights": ins}
Path(sys.argv[1]).write_text("window.DATA=" + json.dumps(out, ensure_ascii=False, default=ser) + ";", encoding="utf-8")
print(len(susi), len(js), len(res), len(ev), len(ins))
