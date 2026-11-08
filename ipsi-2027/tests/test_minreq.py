from engine.minreq import Scores, check_rule, describe, judge

KOREA_SCHOOL = {"pool": ["국", "수", "영", "탐"], "pick": 3, "sum_max": 7, "extra": {"한국사": 4}}
YONSEI_HUM = {"pool": ["국", "수", "탐1", "탐2"], "pick": 2, "sum_max": 4, "must_any": ["국", "수"],
              "extra": {"영": 3, "한국사": 4}}
YONSEI_NAT = {"pool": ["국", "수", "탐1", "탐2"], "pick": 2, "sum_max": 5, "must_all": ["수"],
              "extra": {"영": 3, "한국사": 4}, "inq_type": "과탐", "math": ["미적분", "기하"]}
SNU_BAL = {"pool": ["국", "수", "영", "탐"], "pick": 3, "each_max": 3, "inq": "avg2"}


def S(**g):
    return Scores(g)


def test_sum_rule_picks_best_three():
    c = check_rule(KOREA_SCHOOL, S(국=3, 수=2, 영=2, 탐1=3, 탐2=5, 한국사=4))
    assert c.ok and c.margin == 0          # 수2+영2+탐3 = 7
    assert not check_rule(KOREA_SCHOOL, S(국=3, 수=2, 영=3, 탐1=3, 탐2=5, 한국사=4)).ok
    assert not check_rule(KOREA_SCHOOL, S(국=1, 수=1, 영=1, 탐1=1, 탐2=1, 한국사=5)).ok   # 한국사


def test_individual_inquiry_and_must_any():
    # 탐1·탐2 둘 다 1등급이어도 국·수 중 하나는 꼭 포함
    assert not check_rule(YONSEI_HUM, S(국=4, 수=4, 영=1, 탐1=1, 탐2=1, 한국사=1)).ok
    assert check_rule(YONSEI_HUM, S(국=3, 수=4, 영=2, 탐1=1, 탐2=2, 한국사=1)).ok        # 국3+탐1


def test_inq_type_and_math_elective():
    s = Scores({"국": 3, "수": 2, "영": 2, "탐1": 3, "탐2": 2, "한국사": 2}, {"탐1": "과탐", "탐2": "사탐"}, "미적분")
    assert check_rule(YONSEI_NAT, s).ok                     # 수2+탐1(과탐)3 = 5
    s.math_elective = "확률과 통계"
    assert not check_rule(YONSEI_NAT, s).ok


def test_each_max_and_avg2():
    assert check_rule(SNU_BAL, S(국=3, 수=2, 영=4, 탐1=2, 탐2=4)).ok    # 탐 평균 3
    assert not check_rule(SNU_BAL, S(국=4, 수=2, 영=4, 탐1=2, 탐2=5)).ok  # 탐 평균 3.5


def test_any_of():
    rule = {"any_of": [YONSEI_HUM, {"pool": ["국", "수", "탐1", "탐2"], "pick": 2, "sum_max": 5, "must_all": ["수"],
                                    "extra": {"영": 3, "한국사": 4}}]}
    assert check_rule(rule, S(국=4, 수=2, 영=3, 탐1=3, 탐2=4, 한국사=4)).ok


def test_judge_boundary_identifies_swing():
    v = judge(KOREA_SCHOOL, {"국": (3, 3), "수": (2, 3), "영": (2, 2), "탐1": (3, 3), "탐2": (4, 4), "한국사": (3, 3)})
    assert v.status == "경계" and v.swing == ["수"]
    assert judge(KOREA_SCHOOL, {"국": (1, 1), "수": (1, 2), "영": (2, 2), "탐1": (2, 2), "한국사": (1, 1)}).status == "충족"
    assert judge(None, {}).status == "기준 없음"


def test_describe():
    assert "국·수 중 1개 이상 포함" in describe(YONSEI_HUM)
    assert "탐구 과목별 개별" in describe(YONSEI_HUM)


def test_avg2_or_sci1():
    rule = {"pool": ["국", "수", "영", "탐"], "pick": 3, "sum_max": 6, "inq": "avg2_or_sci1"}
    g = {"국": 3, "수": 2, "영": 2, "탐1": 2, "탐2": 5}
    assert not check_rule(rule, Scores(g, {"탐1": "사탐", "탐2": "사탐"})).ok   # 평균 3.5 → 2+2+3=7
    assert check_rule(rule, Scores(g, {"탐1": "과탐", "탐2": "사탐"})).ok       # 과탐 2 → 2+2+2=6


def test_eng_12_merge():
    rule = {"pool": ["국", "수", "영", "탐"], "pick": 3, "sum_max": 6, "eng_12": True}
    assert check_rule(rule, S(국=3, 수=2, 영=2, 탐1=4)).ok        # 영2→1: 1+2+3
    assert not check_rule({**rule, "eng_12": False}, S(국=3, 수=2, 영=2, 탐1=4)).ok
