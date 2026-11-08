"""blog_posts / blog_metrics 로컬 SQLite 저장 (성적·개인정보와 마찬가지로 로컬 전용)."""
from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "app.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS blog_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  univ_ids TEXT NOT NULL,          -- JSON array
  dept TEXT NOT NULL,
  post_type TEXT NOT NULL,
  audience TEXT NOT NULL,          -- JSON array
  tone TEXT NOT NULL,
  author_memo TEXT NOT NULL,
  titles_json TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,         -- 유사도 검사용
  images TEXT NOT NULL,            -- JSON array of {filename, alt}
  tags TEXT NOT NULL,              -- JSON array
  sources TEXT NOT NULL,           -- JSON array
  data_snapshot_date TEXT NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0,
  published_url TEXT,
  published_at TEXT
);
CREATE TABLE IF NOT EXISTS blog_metrics (
  post_id INTEGER NOT NULL REFERENCES blog_posts(id),
  date TEXT NOT NULL,
  views INTEGER,
  home_feed_exposed INTEGER,
  comments INTEGER,
  PRIMARY KEY (post_id, date)
);
"""


def connect(path: Path = DB_PATH) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    return con


def save_post(con, post, body_html: str, body_text: str) -> int:
    i = post.input
    cur = con.execute(
        "INSERT INTO blog_posts (created_at, univ_ids, dept, post_type, audience, tone, author_memo, titles_json,"
        " body_html, body_text, images, tags, sources, data_snapshot_date, is_sample) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (datetime.now().isoformat(timespec="seconds"), json.dumps(i.univ_ids), i.dept, i.post_type,
         json.dumps(i.audience, ensure_ascii=False), i.tone, i.author_memo,
         json.dumps(post.titles, ensure_ascii=False), body_html, body_text,
         json.dumps([{"filename": im.filename, "alt": im.alt} for im in post.images], ensure_ascii=False),
         json.dumps(post.tags, ensure_ascii=False), json.dumps([s.label() for s in post.sources], ensure_ascii=False),
         post.data_snapshot_date, int(post.is_sample)))
    con.commit()
    return cur.lastrowid


def count_today(con, include_samples: bool = False) -> int:
    q = "SELECT COUNT(*) FROM blog_posts WHERE substr(created_at,1,10)=?"
    if not include_samples:
        q += " AND is_sample=0"
    return con.execute(q, (date.today().isoformat(),)).fetchone()[0]


def previous_posts(con) -> list[dict]:
    rows = con.execute("SELECT univ_ids, dept, post_type, body_text, created_at FROM blog_posts ORDER BY id DESC LIMIT 50")
    return [{"key": (tuple(json.loads(r["univ_ids"])), r["dept"], r["post_type"]), "body": r["body_text"],
             "created_at": r["created_at"]} for r in rows]
