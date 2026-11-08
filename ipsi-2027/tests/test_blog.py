import dataclasses

import pytest

from blog import render
from blog.dummy_data import UNIVERSITIES, YONSEI_BUSINESS
from blog.generator import generate
from blog.guardrails import Report, check_banned, check_daily_limit, similarity
from blog.models import SV, PostInput
from blog.templates import TEMPLATES

MEMO = "재수할 때 반영비율을 늦게 확인했던 경험이 있어서, 숫자보다 점수 구조를 먼저 보라고 권하고 싶습니다."


def _inp(**kw):
    base = dict(univ_ids=["yonsei"], dept="경영", post_type="jeongsi_overview", audience=["수험생"], tone="정보형",
                author_memo=MEMO)
    base.update(kw)
    return PostInput(**base)


def test_six_templates_share_head_and_tail():
    assert len(TEMPLATES) == 6
    for t in TEMPLATES.values():
        keys = [s.key for s in t.sections]
        assert keys[0] == "summary3"
        assert keys[-5:] == ["checkbox", "author", "question", "sources", "disclaimer"]
        assert 4 <= len(keys) - 6 <= 6, t.id  # 본문 소제목 4~6개


def test_sample_post_structure():
    post = generate(_inp(), UNIVERSITIES["yonsei"])
    assert len(post.titles) == 5
    assert {s for s, _ in post.titles} == {"홈피드형", "검색형"}
    assert 8 <= len(post.tags) <= 12
    assert sum(b.kind == "table" for b in post.blocks) >= 2
    assert len(post.images) == 4 and all(im.alt for im in post.images)
    assert post.is_sample and post.report.export_allowed
    assert any("더미" in w for w in post.report.warnings)
    assert any("검증 필요" in w for w in post.report.warnings)
    html = render.to_html(post, embed_images=False)
    assert "샘플 미리보기" in html and "모집요강 원문을 확인" in html and "참고치" in html
    assert "98명" in html and "-5" in html


def test_empty_memo_blocks_export():
    post = generate(_inp(author_memo="  "), UNIVERSITIES["yonsei"])
    assert not post.report.export_allowed


def test_value_without_source_blocks():
    data = dict(YONSEI_BUSINESS, jeongsi=dict(YONSEI_BUSINESS["jeongsi"], quota_2027=SV(98, None)))
    post = generate(_inp(), data)
    assert any("출처 없는 값" in e for e in post.report.errors)


def test_ad_link_inserts_notice():
    post = generate(_inp(ad_links=["https://example.com"]), UNIVERSITIES["yonsei"])
    assert "광고 링크" in render.to_text(post)


def test_banned_words_and_limits():
    r = Report()
    check_banned("이 점수면 무조건 합격", r)
    check_daily_limit(3, r)
    assert len(r.errors) == 2


def test_duplicate_warning():
    first = generate(_inp(), UNIVERSITIES["yonsei"])
    from blog.generator import body_text
    prev = [{"key": (("yonsei",), "경영", "jeongsi_overview"), "body": body_text(first), "created_at": "2026-11-08"}]
    second = generate(_inp(), UNIVERSITIES["yonsei"], previous=prev)
    assert any("유사도" in w for w in second.report.warnings)
    assert similarity("가나다라마바", "가나다라마바") == 1.0


def test_all_six_types_generate_with_real_data():
    from blog.real_data import build_change, build_compare, build_overview, build_segment, build_susi_vs, build_timely
    cases = {
        "jeongsi_overview": build_overview("yonsei", "경영"),
        "rival_compare": build_compare(["sogang", "skku", "hanyang"], "경영"),
        "susi_vs_jeongsi": build_susi_vs("yonsei", "경영"),
        "timely_news": build_timely("yonsei", "경영", "수능 직후"),
        "segment_guide": build_segment("yonsei", "경영", "N수생"),
        "change_2027": build_change("yonsei", "경영", "N수생 증가"),
    }
    for pt, data in cases.items():
        post = generate(_inp(post_type=pt), data)
        text = render.to_text(post)
        assert post.report.export_allowed, (pt, post.report.errors)
        assert len(post.titles) == 5 and 8 <= len(post.tags) <= 12, pt
        assert "모집요강 원문을 확인" in text and "이(가)" not in text and "앱은" not in text, pt
        assert all(s.url for s in post.sources), pt
    p = generate(_inp(post_type="change_2027"), build_change("yonsei", "경영", "없는 주제"))
    assert not p.report.export_allowed       # 출처 있는 인사이트가 없으면 생성 차단


def test_real_overview_and_compare():
    from blog.real_data import build_compare, build_overview
    d = build_overview("yonsei", "경영")
    post = generate(_inp(), d)
    html = render.to_html(post, embed_images=False)
    assert not post.is_sample and post.report.export_allowed
    assert "가군 113명" in html and "국어가 37.5%" in html
    assert any("입결 데이터 없음" in w for w in post.report.warnings)
    assert all(s.url for s in post.sources) and any("p.12" in s.label() for s in post.sources)
    c = build_compare(["sogang", "skku", "hanyang"], "경영")
    p2 = generate(_inp(univ_ids=["sogang", "skku", "hanyang"], post_type="rival_compare"), c)
    t = render.to_text(p2)
    assert "모두 나군" in t and "서강대 90명(+6)" in t and "한양대 71명(전년과 동일)" in t
    assert "성균관대는 국어·수학 중 잘한 영역" in t


def test_calendar():
    from datetime import date as d
    from blog.calendar import WINDOWS, recommend, window_for
    assert window_for(d(2026, 11, 20)).title == "수능 당일·직후"
    assert window_for(d(2026, 12, 11)).title == "수능 성적 발표"
    r = recommend(d(2026, 11, 20))
    assert r[0]["type"] == "timely_news" and r[0]["params"]["event"] == "수능 직후"
    prev = [{"key": (("yonsei",), "경영", "timely_news"), "body": "", "created_at": "2026-11-20"}]
    assert recommend(d(2026, 11, 20), prev)[0]["type"] == "susi_vs_jeongsi"
    assert all(w.start <= w.end for w in WINDOWS)
