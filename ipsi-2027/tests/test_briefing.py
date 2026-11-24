from engine import briefing


def test_briefing_sources_and_status():
    d = briefing.load()
    assert len(d["facts"]) >= 8 and d["traps"]
    for f in d["facts"]:
        assert f["url"].startswith("http") and f["status"] in ("추정", "보도", "공식")
    # 가채점 기반 등급컷은 반드시 '추정'
    assert all(f["status"] == "추정" for f in d["facts"] if f["group"] == "등급컷")


def test_cuts_monotonic_and_marked():
    c = briefing.cuts()
    assert c["status"] == "검증 필요" and c["url"].startswith("http")
    for area in ("kor", "math"):
        for name, cut in c[area].items():
            assert all(a > b for a, b in zip(cut, cut[1:])), name
    assert c["eng"][0] == 90 and c["hist"][0] == 40
    assert len(c["pct_band"]) == 9


def test_expect_lines():
    d = briefing.lines()
    assert set(d["sources"]) == {"종로", "대성"}
    names = {(x["univ"], x["dept"]) for x in d["lines"]}
    assert ("서울대", "의예") in names and len(d["lines"]) >= 50
    snu = next(x for x in d["lines"] if x["univ"] == "서울대" and x["dept"] == "의예")
    assert snu["종로"] == 298 and snu["대성"] == 296          # 기사 원문 수치
