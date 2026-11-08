"""환산 엔진 검증 — 대학 모집요강에 실린 계산 예시를 그대로 재현한다."""
import pytest

from engine.conversion import compute
from engine.jeongsi_data import load

GROUPS, META = load()
G = {g.key: g for g in GROUPS}


def S(kor, math, t1, t2, eng, hist, t1type="사탐", t2type="사탐", conv=None, math_el=None, pct=None):
    d = {"국": {"std": kor}, "수": {"std": math}, "영": {"grade": eng}, "한국사": {"grade": hist},
         "탐1": {"std": t1, "type": t1type}, "탐2": {"std": t2, "type": t2type}}
    if conv:
        d["탐1"]["conv"], d["탐2"]["conv"] = conv
    if math_el:
        d["_math"] = math_el
    return d


def test_all_formulas_load_and_cover_20():
    assert len({g.univ for g in GROUPS}) == 20
    for g in GROUPS:
        assert g.formula or g.blocked, g.key
        assert g.source_url, g.key


def test_sogang_example_p35():
    # 국128 수135 탐 변환 64.3/67.4 영2 한3 → A형 504.82
    r = G["sogang|all"].compute(S(128, 135, 62, 68, 2, 3, conv=(64.3, 67.4)))
    assert r.score == pytest.approx(504.82, abs=0.01)
    assert "A형" in r.parts[-1][0]


def test_cau_examples_p56():
    # 예시1 가군 기계공학부(자연, 과탐 2과목 5% 가산) 수능 90%: 711.194
    r = G["cau|nat"].compute(S(134, 136, 64, 67, 2, 5, "과탐", "과탐", conv=(65.34, 67.24)))
    assert r.score == pytest.approx(711.194, abs=0.01)
    # 예시3 다군 경영학부(국30 수40 탐30): 701.523
    r = G["cau|soc"].compute(S(134, 136, 64, 67, 2, 5, "사탐", "과탐", conv=(65.34, 67.24)))
    assert r.score == pytest.approx(701.523, abs=0.01)


def test_dongguk_examples_p40_41():
    # 인문: 국129 수142 사탐 변환 68.11/66.23 영1 한1 → 721.175, 다군 900점 → 649.058
    s = S(129, 142, 60, 60, 1, 1, conv=(68.11, 66.23))
    assert G["dongguk|hum"].compute(s).score == pytest.approx(721.175, abs=0.001)
    assert G["dongguk|hum_da"].compute(s).score == pytest.approx(649.058, abs=0.01)
    # 자연 유형①: 국128 수131(미적분 3%) 과탐 67.11/65.71 영2 한5 → 709.403
    s = S(128, 131, 60, 60, 2, 5, "과탐", "과탐", conv=(67.11, 65.71), math_el="미적분")
    assert G["dongguk|nat1"].compute(s).score == pytest.approx(709.403, abs=0.001)


def test_hongik_example_p85():
    # 인문: 국133 수128 탐 64+64(표준점수) 영1 한4 → 135.2
    assert G["hongik|hum"].compute(S(133, 128, 64, 64, 1, 4)).score == pytest.approx(135.2, abs=0.001)


def test_korea_hand_calc():
    # (131+128+(65+63)×0.8)/560×1000 − 영2(3) − 한3(0)
    r = G["korea|hum"].compute(S(131, 128, 65, 63, 2, 3, conv=(65, 63)))
    assert r.score == pytest.approx((131 + 128 + 128 * 0.8) / 560 * 1000 - 3, abs=0.001)
    assert r.max_score == 1000 and not r.provisional


def test_provisional_and_missing():
    r = G["yonsei|hum"].compute(S(131, 128, 65, 63, 2, 3))     # conv 미입력
    assert any("임시" in p for p in r.provisional)
    r = G["hufs|humB"].compute(S(131, 128, 65, 63, 2, 3))      # 최고점 미입력
    assert r.score is None and any("최고" in m for m in r.missing)
    r = G["hufs|humB"].compute(S(131, 128, 65, 63, 2, 3), {"국": 140, "수": 140, "탐": 70})
    assert r.score is not None and 0 < r.ratio < 1
    assert G["hanyang|biz"].kind == "근사식" and G["skku|na_biz"].kind == "비율만"


def test_weights_sum_and_order():
    w = G["korea|nat"].weights()
    assert abs(sum(w.values()) - 100) < 0.5 and w["수"] > w["국"]
    w = G["yonsei|hum"].weights()
    assert w["국"] > w["수"]


def test_snu_raw_sum():
    r = G["snu|all"].compute(S(131, 128, 65, 63, 2, 4))
    assert r.score == pytest.approx(131 + 128 * 1.2 + 128 * 0.8 - 0.5 - 0.4, abs=0.001)
    assert r.max_score == 600
