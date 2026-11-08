from engine.kidnap import judge_app, scenarios

PREFS = ["연세대", "고려대", "성균관대", "동국대"]


def test_kidnap_rules():
    pos = {"연세대": "소신", "고려대": "적정", "성균관대": "안정", "동국대": "안정"}
    assert judge_app("성균관대", "논술", "충족", PREFS, pos).verdict == "재고 필요"      # 고려대 정시 적정
    assert judge_app("연세대", "활동우수형", "경계", PREFS, pos).verdict == "수시 응시 강력 권장"
    assert judge_app("고려대", "논술", "충족", PREFS, pos).verdict == "응시 유지"
    assert judge_app("동국대", "논술", "미충족", PREFS, pos).verdict == "최저 미충족"
    assert judge_app("서강대", "논술", "충족", PREFS, pos).verdict == "판단 재료 부족"


def test_scenarios():
    s = scenarios({"고려대 논술": "합격", "서강대 논술": "대기"}, ["동국대 경영대학 안정"])
    assert len(s) == 1 and "지원 불가" in s[0][1]
    s = scenarios({"고려대 논술": "충원대기", "서강대 논술": "불합격"}, ["동국대 경영대학 안정"])
    assert len(s) == 2 and "동국대" in s[1][1]
    s = scenarios({"고려대 논술": "불합격"}, [])
    assert s[0][0] == "수시 전부 불합격"
