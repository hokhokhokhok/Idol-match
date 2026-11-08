from datetime import date

import yaml

from engine import segments, timeline
from engine.db import connect, load_profile, save_profile, seed
from scrapers.download import ROOT, load_targets


def test_mvp_20_universities():
    d = yaml.safe_load((ROOT / "config" / "universities.yaml").read_text(encoding="utf-8"))
    assert len(d["mvp"]) == 20
    assert len({u["id"] for u in d["mvp"]}) == 20


def test_targets_prefer_official():
    t = {(x.univ, x.year, x.kind, x.doc): x for x in load_targets(None)}
    assert len([x for x in t.values() if x.doc == "요강"]) == 80
    snu = t[("snu", 2027, "정시", "요강")]
    assert snu.urls[0][1] == "공식" and snu.urls[1][1].startswith("미러")
    assert t[("korea", 2027, "수시", "요강")].urls[0][1].startswith("미러")
    assert ("_kcue", 2027, "공통", "기본사항") in t


def test_dashboard_matches_plan():
    titles = lambda tr, hi: [c.key for c in segments.dashboard(tr, hi)]  # noqa: E731
    assert titles("수시", "현역") == ["min_check", "exam_cal", "kidnap", "jeongsi_backup"]
    assert titles("수시", "재수")[:3] == ["min_check", "grad_ok", "jeongsi_compare"]
    assert titles("정시", "현역") == ["conversion", "nsu_adjust", "combo"]
    assert titles("정시", "N수") == ["conversion", "record_policy", "combo", "retake"]
    assert titles("병행", "현역")[0] == "scenario_tree"
    assert "current_univ" in titles("정시", "반수")
    assert "ged_policy" in titles("정시", "검정고시")
    for tr in segments.TRACKS:          # 재도전 판단은 N수·반수 계열에만
        for hi in ("현역", "검정고시"):
            assert "retake" not in titles(tr, hi)


def test_notes_no_pressure_words():
    for tr in segments.TRACKS:
        for hi in segments.HISTORIES:
            text = " ".join(segments.notes(tr, hi))
            for w in ("무조건", "반드시 재수", "실패자", "포기하"):
                assert w not in text


def test_timeline_official_dates():
    ev = {e.title: e for e in timeline.EVENTS}
    assert ev["수능 성적 통지"].start == date(2026, 12, 11)
    assert ev["정시 합격자 발표 마감"].start == date(2027, 2, 5)
    up = timeline.upcoming(date(2026, 11, 8), "정시", 2)
    assert up[0][0].title == "수능 시행" and up[0][1] == 11
    assert all("수시" not in e.title for e, _ in timeline.upcoming(date(2026, 12, 12), "정시", 10))


def test_db_schema_and_profile(tmp_path):
    con = connect(tmp_path / "t.db")
    assert seed(con)["universities"] == 20
    save_profile(con, "정시", "반수", 2, "OO대")
    p = load_profile(con)
    assert p["track_type"] == "정시" and p["current_univ"] == "OO대"
