"""SQLite 초기화·시드 (로컬 전용).

python -m engine.db   → data/app.db 생성, 대학 목록·다운로드 로그를 universities/sources 에 반영
"""
from __future__ import annotations

import csv
import sqlite3
from datetime import datetime
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
from .paths import local

DB_PATH = local("app.db", default=ROOT / "data" / "app.db")


def connect(path: Path = DB_PATH) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript((ROOT / "engine" / "schema.sql").read_text(encoding="utf-8"))
    return con


def seed(con: sqlite3.Connection) -> dict:
    unis = yaml.safe_load((ROOT / "config" / "universities.yaml").read_text(encoding="utf-8"))
    for u in unis["mvp"]:
        con.execute("INSERT OR REPLACE INTO universities (id, name, full_name, admission_url, is_mvp) VALUES (?,?,?,?,1)",
                    (u["id"], u["name"], u["full_name"], u["admission_url"]))
    n_src = 0
    log = ROOT / "data" / "download_log.csv"
    if log.exists():
        with log.open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r["status"] != "ok":
                    continue
                kind = "미러" if r["source_type"].startswith("미러") else r["source_type"]
                doc = f"{r['univ_name']} {r['year']}학년도 {r['kind']} {r['doc']}"
                if con.execute("SELECT 1 FROM sources WHERE url=? AND sha256=?", (r["url"], r["sha256"])).fetchone():
                    continue
                con.execute("INSERT INTO sources (kind, doc, url, collected_at, sha256, local_path) VALUES (?,?,?,?,?,?)",
                            (kind, doc, r["url"], r["collected_at"][:10], r["sha256"], r["path"]))
                n_src += 1
    con.commit()
    return {"universities": len(unis["mvp"]), "sources_added": n_src}


def save_profile(con, track_type: str, history_type: str, attempt_count: int | None, current_univ: str | None) -> None:
    con.execute("INSERT OR REPLACE INTO user_profile (id, track_type, history_type, attempt_count, current_univ, updated_at)"
                " VALUES (1,?,?,?,?,?)",
                (track_type, history_type, attempt_count, current_univ, datetime.now().isoformat(timespec="seconds")))
    con.commit()


def load_profile(con) -> dict | None:
    r = con.execute("SELECT * FROM user_profile WHERE id=1").fetchone()
    return dict(r) if r else None


def get_state(con, key: str, default=None):
    import json
    r = con.execute("SELECT value FROM app_state WHERE key=?", (key,)).fetchone()
    return json.loads(r["value"]) if r else default


def set_state(con, key: str, value) -> None:
    import json
    con.execute("INSERT OR REPLACE INTO app_state (key, value, updated_at) VALUES (?,?,?)",
                (key, json.dumps(value, ensure_ascii=False), datetime.now().isoformat(timespec="seconds")))
    con.commit()


if __name__ == "__main__":
    c = connect()
    print(seed(c))
