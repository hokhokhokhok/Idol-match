import pytest

from engine import updates


@pytest.fixture
def tmp_updates(tmp_path, monkeypatch):
    monkeypatch.setattr(updates, "DIR", tmp_path)
    monkeypatch.setattr(updates, "CARRY", tmp_path / "carryover.csv")
    monkeypatch.setattr(updates, "CMAX", tmp_path / "csat_max.yaml")
    return tmp_path


def test_carryover_requires_source_and_replaces(tmp_updates):
    with pytest.raises(updates.UpdateError):
        updates.save_carryover([{"univ": "dongguk", "unit": "경영대학", "added_quota": 5, "announced_at": "2026-12-30",
                                 "source_url": ""}])
    row = {"univ": "dongguk", "unit": "경영대학", "added_quota": 5, "announced_at": "2026-12-30",
           "source_url": "https://ipsi.dongguk.edu/x", "page": "1"}
    updates.save_carryover([row])
    updates.save_carryover([{**row, "added_quota": 7}])
    assert updates.carryover_for("dongguk", "경영대학").added == 7 and len(updates.load_carryover()) == 1


def test_conv_table_applies_per_university(tmp_updates):
    with pytest.raises(updates.UpdateError):
        updates.save_conv("korea", [{"pct": 95, "사탐": 66.1, "source_url": ""}])
    updates.save_conv("korea", [{"pct": 95, "사탐": 66.1, "과탐": 67.0, "source_url": "https://oku.korea.ac.kr/x"},
                                {"pct": 93, "사탐": 65.2, "과탐": 66.0}])
    scores = {"탐1": {"std": 64, "pct": 95, "type": "사탐"}, "탐2": {"std": 62, "pct": 90, "type": "사탐"}}
    out, notes = updates.apply_conv("korea", scores)
    assert out["탐1"]["conv"] == 66.1 and "conv" not in out["탐2"]          # 표에 없는 백분위는 보간하지 않음
    assert any("90" in n for n in notes)
    assert updates.apply_conv("yonsei", scores) == (scores, [])            # 표 없는 대학은 그대로


def test_group_compute_uses_conv_table(tmp_updates):
    from engine.jeongsi_data import load
    g = next(x for x in load()[0] if x.key == "korea|hum")
    s = {"국": {"std": 131}, "수": {"std": 128}, "영": {"grade": 2}, "한국사": {"grade": 3},
         "탐1": {"std": 64, "pct": 95, "type": "사탐"}, "탐2": {"std": 62, "pct": 93, "type": "사탐"}}
    before = g.compute(s)
    updates.save_conv("korea", [{"pct": 95, "사탐": 66.1, "source_url": "https://oku.korea.ac.kr/x"}, {"pct": 93, "사탐": 65.2}])
    after = g.compute(s)
    assert any("임시" in p for p in before.provisional) and not any("미발표" in p for p in after.provisional)
    assert after.score == pytest.approx((131 + 128 + (66.1 + 65.2) * 0.8) / 560 * 1000 - 3, abs=0.001)


def test_csat_max(tmp_updates):
    with pytest.raises(updates.UpdateError):
        updates.save_csat_max(147, 140, "")
    updates.save_csat_max(147, 140, "https://www.kice.re.kr/x")
    assert updates.load_csat_max() == {"국": 147, "수": 140}


def test_timely_carryover_auto(tmp_updates):
    from blog.generator import generate
    from blog.models import PostInput
    from blog.real_data import build_timely
    updates.save_carryover([{"univ": "yonsei", "unit": "경영학과", "added_quota": 9, "announced_at": "2026-12-30",
                             "source_url": "https://admission.yonsei.ac.kr/x", "page": "공지"}])
    d = build_timely("yonsei", "경영", "수시 이월")
    assert d["live"].value == 9 and d["live"].source.url.startswith("https://admission.yonsei")
    memo = "재수할 때 반영비율을 늦게 확인했던 경험이 있어서, 숫자보다 점수 구조를 먼저 보라고 권하고 싶습니다."
    post = generate(PostInput(["yonsei"], "경영", "timely_news", ["수험생"], "정보형", memo), d)
    assert any("9" in i for b in post.blocks if b.kind == "lead" for i in b.items)
