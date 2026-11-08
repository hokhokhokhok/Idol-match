import pytest

from engine.admission import FACTORS, assess, combo_risk, grade_of, history, load_results


def test_dongguk_results_parsed_and_verified():
    recs = load_results()
    assert {r.year for r in recs if r.univ == "dongguk"} == {2024, 2026}
    biz = next(r for r in recs if r.year == 2026 and r.unit == "경영대학")
    assert (biz.group, biz.quota, biz.avg, biz.conv) == ("다", 102, 88.27, 689.55)
    # 계열 가중 평균이 입결표 '평균'을 재현 (인문 35/25/25)
    assert (35 * biz.kor + 25 * biz.math + 25 * biz.inq) / 85 == pytest.approx(biz.avg, abs=0.01)
    assert next(r for r in recs if r.year == 2026 and r.unit == "약학과").track == "자연"


def test_assess_grades_and_factors():
    biz = next(r for r in load_results() if r.year == 2026 and r.unit == "경영대학")
    no_f = {k: {**v, "weight": 0} for k, v in FACTORS.items()}
    a = assess(biz, {"kor": 96, "math": 85, "inq": 93}, 2, no_f)
    assert a.grade == "안정" and a.adj_ref == pytest.approx(88.27)
    a2 = assess(biz, {"kor": 93.87, "math": 77.39, "inq": 91.3}, 2, no_f)   # 평균과 같은 성적
    assert a2.grade == "적정" and abs(a2.z) < 0.01
    a3 = assess(biz, {"kor": 93.87, "math": 77.39, "inq": 91.3}, 2)          # 기본 보정(N수 +0.2)
    assert a3.adj_ref == pytest.approx(88.47) and a3.z < 0
    a4 = assess(biz, {"kor": 93.87, "math": 77.39, "inq": 91.3}, 2, no_f, quota_2027=102, carryover=20)
    assert a4.adj_ref < 88.27 and any("모집인원" in s for s, _ in a4.shifts)
    a5 = assess(biz, {"kor": 93, "math": 77, "inq": 91}, 4, no_f)
    assert any("영어" in w for w in a5.warnings)


def test_grade_thresholds_and_combo():
    assert [grade_of(z) for z in (1, 0, -1, -2)] == ["안정", "적정", "소신", "위험"]
    assert "전부 불합격" in combo_risk(["소신", "위험", "위험"])
    assert combo_risk(["안정", "적정", "소신"]) == ""


def test_history_trend():
    h = history("dongguk", "약학과")
    assert [r.year for r in h] == [2024, 2026]
