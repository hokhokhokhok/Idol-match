-- 인서울 입시 전략 분석 앱 (2027) — v2/v3 스키마. 로컬 SQLite 전용(data/app.db).
-- 규칙: 입시 수치 컬럼에는 반드시 source_id(sources 테이블)와 status(확정/임시/검증 필요)를 같이 둔다.
PRAGMA foreign_keys = ON;

-- 출처: 문서명·페이지·URL·수집일·해시. 수치는 모두 여기를 가리킨다.
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('공식','미러','대교협','학원','유튜브','사용자입력','더미')),
  doc TEXT NOT NULL,                 -- 문서명 (예: 연세대 2027 정시모집요강)
  url TEXT NOT NULL,
  page TEXT,                         -- 페이지·표 번호
  collected_at TEXT NOT NULL,        -- YYYY-MM-DD
  sha256 TEXT,
  local_path TEXT                    -- data/raw/...
);

CREATE TABLE IF NOT EXISTS universities (
  id TEXT PRIMARY KEY,               -- snu, yonsei ...
  name TEXT NOT NULL,                -- 연세대
  full_name TEXT NOT NULL,
  admission_url TEXT,
  is_mvp INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS programs (          -- 모집단위
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  univ_id TEXT NOT NULL REFERENCES universities(id),
  year INTEGER NOT NULL,             -- 학년도
  name TEXT NOT NULL,                -- 경영학과
  college TEXT,
  track TEXT,                        -- 인문/자연/예체능/무전공
  UNIQUE (univ_id, year, name)
);

CREATE TABLE IF NOT EXISTS jeongsi_rules (
  program_id INTEGER PRIMARY KEY REFERENCES programs(id),
  grp TEXT CHECK (grp IN ('가','나','다')),
  quota INTEGER, quota_prev INTEGER,
  ratio_json TEXT,                   -- {"국어":30,"수학":35,"영어":10,"탐구":25}
  score_index TEXT,                  -- 표준점수/백분위/변환표준점수
  inquiry_count INTEGER,
  elective_rule TEXT,                -- 선택과목 지정·가산점
  eng_table_json TEXT, hist_table_json TEXT,
  total_points REAL,
  record_reflect TEXT,               -- 학생부 반영 여부·방식
  grad_record_policy TEXT,           -- 졸업연도별 학생부 처리
  ged_policy TEXT,                   -- 검정고시 처리
  tie_break TEXT,
  status TEXT NOT NULL DEFAULT '검증 필요' CHECK (status IN ('확정','임시','검증 필요')),
  source_id INTEGER REFERENCES sources(id)
);

CREATE TABLE IF NOT EXISTS susi_live (         -- 수능 이후 진행되는 수시 전형
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL REFERENCES programs(id),
  track_name TEXT NOT NULL,          -- 전형명
  quota INTEGER,
  min_req TEXT,                      -- 수능 최저 (원문)
  min_req_json TEXT,                 -- 구조화: {"areas":["국","수","영","탐1"],"pick":3,"sum":7,...}
  exam_date TEXT, announce_date TEXT,
  eligibility_grad_ok INTEGER,       -- 졸업생 지원 가능 1/0/NULL(미확인)
  grad_year_limit TEXT,
  status TEXT NOT NULL DEFAULT '검증 필요',
  source_id INTEGER REFERENCES sources(id)
);

CREATE TABLE IF NOT EXISTS past_results (
  program_id INTEGER NOT NULL REFERENCES programs(id),
  year INTEGER NOT NULL,
  cut50 REAL, cut70 REAL, competition REAL, fill_rate REAL,
  basis TEXT,                        -- 환산점수/백분위 등 기준
  status TEXT NOT NULL DEFAULT '검증 필요',
  source_id INTEGER REFERENCES sources(id),
  PRIMARY KEY (program_id, year)
);

CREATE TABLE IF NOT EXISTS carryover (         -- 수시 이월 인원
  program_id INTEGER NOT NULL REFERENCES programs(id),
  added_quota INTEGER NOT NULL,
  announced_at TEXT NOT NULL,
  source_id INTEGER REFERENCES sources(id),
  PRIMARY KEY (program_id, announced_at)
);

CREATE TABLE IF NOT EXISTS insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, date TEXT,
  segments_json TEXT, tags_json TEXT,
  summary TEXT NOT NULL,             -- 1~3문장 요약 (원문 복제 금지)
  evidence_type TEXT CHECK (evidence_type IN ('데이터','경험','의견')),
  status TEXT NOT NULL DEFAULT '검증 필요'
);

-- 사용자 데이터 (로컬 전용)
CREATE TABLE IF NOT EXISTS user_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  track_type TEXT CHECK (track_type IN ('수시','정시','병행')),
  history_type TEXT CHECK (history_type IN ('현역','재수','삼수','N수','반수','검정고시')),
  attempt_count INTEGER,
  current_univ TEXT,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS user_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT CHECK (mode IN ('가채점','실채점')),
  subject TEXT NOT NULL, elective TEXT,
  raw REAL, std REAL, pct REAL, grade INTEGER,
  entered_at TEXT
);
CREATE TABLE IF NOT EXISTS user_susi_apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  susi_id INTEGER REFERENCES susi_live(id),
  free_text TEXT,                    -- DB에 없는 전형 직접 입력
  result TEXT CHECK (result IN ('대기','합격','충원대기','불합격','미응시'))
);
CREATE TABLE IF NOT EXISTS user_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario TEXT NOT NULL,            -- 수시 전부 불합격 / A 합격 ...
  ga INTEGER REFERENCES programs(id), na INTEGER REFERENCES programs(id), da INTEGER REFERENCES programs(id),
  note TEXT
);
CREATE TABLE IF NOT EXISTS retake_inputs (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  best TEXT, expected TEXT, worst TEXT, target TEXT,
  trend_json TEXT,                   -- 모평·수능 영역별 추이
  record_note TEXT
);
CREATE TABLE IF NOT EXISTS app_state (     -- 화면 입력값 저장 (가채점 등급, 선택한 수시 지원 등)
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT
);
-- blog_posts / blog_metrics 는 blog/store.py 에서 생성
