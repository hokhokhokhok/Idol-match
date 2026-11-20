from engine import briefing


def test_briefing_sources_and_status():
    d = briefing.load()
    assert len(d["facts"]) >= 8 and d["traps"]
    for f in d["facts"]:
        assert f["url"].startswith("http") and f["status"] in ("추정", "보도", "공식")
    # 가채점 기반 등급컷은 반드시 '추정'
    assert all(f["status"] == "추정" for f in d["facts"] if f["group"] == "등급컷")
