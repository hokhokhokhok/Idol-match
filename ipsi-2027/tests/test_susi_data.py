from datetime import date

from engine.minreq import judge
from engine.susi_data import load

TRACKS, ERRORS = load()
BY = {t.key: t for t in TRACKS}


def test_loads_20_universities_without_schema_errors():
    assert ERRORS == []
    assert len({t.univ for t in TRACKS}) == 20
    assert all(t.source_url for t in TRACKS), "다운로드 로그에서 출처 URL 연결"


def test_every_rule_evaluates():
    g = {"국": (2, 3), "수": (2, 2), "영": (2, 2), "탐1": (2, 3), "탐2": (3, 3), "한국사": (3, 3)}
    for t in TRACKS:
        for grp in t.groups:
            v = judge(grp.rule, g, {"탐1": "과탐", "탐2": "사탐"}, "미적분")
            assert v.status in ("충족", "미충족", "경계", "기준 없음"), (t.key, grp.units)


def test_events_are_in_susi_window():
    for t in TRACKS:
        for e in t.events:
            assert date(2026, 9, 1) <= e.date <= date(2026, 12, 31), (t.key, e)
        assert any(e.kind == "최초합격발표" for e in t.events), t.key


def test_spot_checks_against_pdf():
    # 고려대 학교추천: 3개 합 7 + 한국사 4 (요강 6쪽)
    k = BY["korea|학생부교과(학교추천전형)"].groups[0].rule
    assert k["pick"] == 3 and k["sum_max"] == 7 and k["extra"] == {"한국사": 4}
    # 연세대 2027 논술은 최저 미적용 (49쪽)
    assert not BY["yonsei|논술전형"].has_min
    # 서울대 지역균형은 졸업예정자만
    assert BY["snu|학생부종합전형(지역균형전형)"].grad_ok is False
    # 중앙대 영어 1·2등급 통합
    assert BY["cau|논술(일반형)"].groups[0].rule["eng_12"] is True


def test_eligibility_filter():
    snu = BY["snu|학생부종합전형(지역균형전형)"]
    hy = BY["hanyang|학생부교과(추천형)"]
    assert snu.eligibility(2027) == "가능" and snu.eligibility(2026) == "불가"
    assert hy.eligibility(2026) == "가능" and hy.eligibility(2025) == "불가"
    assert BY["korea|논술(논술전형)"].eligibility(2020) == "가능"
    assert hy.eligibility(2027, ged=True) == "불가"


def test_calendar_conflicts():
    from engine.susi_data import calendar
    sel = [BY["korea|논술(논술전형)"], BY["sogang|논술(일반)"], BY["yonsei|논술전형"]]
    rows = calendar(sel, since=date(2026, 11, 19))
    assert all(r["date"] >= date(2026, 11, 19) for r in rows)        # 연세대 10/10 논술 제외
    c = [r for r in rows if r["conflict"]]
    assert {r["date"] for r in c} == {date(2026, 11, 21), date(2026, 11, 22)}   # 고려·서강 논술 같은 날


def test_app_state(tmp_path):
    from engine.db import connect, get_state, set_state
    con = connect(tmp_path / "s.db")
    set_state(con, "grades", {"국": [2, 3]})
    assert get_state(con, "grades") == {"국": [2, 3]}
    assert get_state(con, "nope", 1) == 1
