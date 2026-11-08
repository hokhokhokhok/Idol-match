import pytest

from engine.combo import Cand, evaluate, recommend, P_DEFAULT, PRESETS

C = [Cand("A대", "경영", "가", "소신", 1), Cand("B대", "경영", "나", "적정", 2), Cand("C대", "경영", "다", "안정", 4),
     Cand("D대", "경제", "가", "안정", 5), Cand("E대", "경영", "나", "위험", 3), Cand("F대", "경영", "다", "소신", 6)]


def test_probabilities():
    c = evaluate((C[0], C[1], C[2]), PRESETS["균형"], P_DEFAULT, 6)
    assert c.p_all_fail == pytest.approx(0.7 * 0.4 * 0.15)
    # 기대 선호도: A(1위)부터 붙으면 그쪽
    exp = 0.3 * 1 + 0.7 * 0.6 * (5 / 6) + 0.7 * 0.4 * 0.85 * (3 / 6)
    assert c.expected_pref == pytest.approx(exp)
    assert c.mismatch == 0 and not any("전부" in w for w in c.warnings)


def test_presets():
    bal = recommend(C, "균형")[0]
    assert sorted(x.grade for x in bal.cards) == ["소신", "안정", "적정"]
    safe = recommend(C, "안정 우선")[0]
    assert [x.grade for x in safe.cards].count("안정") == 2
    up = recommend(C, "상향 허용")[0]
    assert any("2028" in w for w in up.warnings)


def test_halfsu_filter_and_risk():
    r = recommend(C, "균형", current_pref=3)          # 현 소속(3위)보다 나은 A(1)·B(2)만
    assert all(x.pref < 3 for combo in r for x in combo.cards)
    risky = evaluate((C[0], C[4]), PRESETS["균형"], P_DEFAULT, 6)
    assert any("전부 불합격" in w for w in risky.warnings) and any("안정" in w for w in risky.warnings)


def test_retake_trend_neutral():
    from engine.retake import Exam, reality_lines, trend
    ex = [Exam("2025 6월 모평", 80, 70, 75, False), Exam("2025 수능", 82, 72, 78, True),
          Exam("2026 9월 모평", 88, 80, 84, False), Exam("2026 수능", 85, 79, 83, True)]
    t = trend(ex)
    assert t["csat_deltas"][0][1] == round((85 + 79 + 83) / 3 - (82 + 72 + 78) / 3, 1)
    assert len(t["mock_to_csat"]) == 2
    text = " ".join(reality_lines(t))
    for w in ("무조건", "반드시", "실패", "포기해"):
        assert w not in text
