from datetime import date

from insights import store, youtube


def test_seed_loads_and_order():
    items = store.load()
    assert len(items) >= 10
    assert items[0].kind == "공식"                     # 신뢰도 순: 공식 먼저
    assert all(i.url.startswith("http") and len(i.summary) <= store.MAX_SUMMARY for i in items)
    assert any(i.status == "미확인" for i in items)


def test_filter_and_topic():
    items = store.load()
    seg = store.filter_items(items, segment="수시")
    assert all(not i.segments or "수시" in i.segments for i in seg)
    groups = store.by_topic(items)
    assert len(groups["N수생 증가"]) >= 2               # 기관별 나란히 보여줄 주제


def test_validate_rejects_long_or_unsourced():
    i = store.Insight("x", "기관", "학원", "제목", "없음", date.today(), "주제", "가" * 500, "의견", "검증 필요")
    errs = store.validate(i)
    assert any("URL" in e for e in errs) and any("너무" in e for e in errs)


def test_youtube_helpers():
    assert youtube.video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1") == "dQw4w9WgXcQ"
    assert youtube.video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    text = ("오늘은 재수생이 정시 원서를 쓸 때 꼭 봐야 할 것을 이야기하겠습니다. 먼저 모집인원 변화를 확인해야 합니다. "
            "그다음 반영비율이 내 점수 구조와 맞는지 봐야 합니다. 그리고 수시 이월 인원도 꼭 확인해야 합니다. "
            "마지막으로 너무 불안해하지 말고 데이터를 차분하게 보세요.")
    s = youtube.summarize(text, 3, ["모집인원", "반영비율"])
    assert 1 <= len(s) <= 3 and any("모집인원" in x or "반영비율" in x for x in s)
