"""샘플 '연세대 경영학과 정시 총정리'를 samples/ 에 저장 (python -m blog.build_sample)."""
from pathlib import Path

from . import render
from .dummy_data import UNIVERSITIES
from .real_data import build_change, build_compare, build_overview, build_segment, build_susi_vs, build_timely
from .generator import generate
from .models import PostInput

SAMPLE_MEMO = ("재수할 때 반영비율을 늦게 확인해서 수학 강세를 못 살린 경험이 있어요. "
               "입결 숫자보다 내 점수 구조와 반영비율이 맞는지부터 보시길 권합니다.")

def write(post, name: str) -> None:
    out = Path(__file__).resolve().parent.parent / "samples" / name
    (out / "images").mkdir(parents=True, exist_ok=True)
    (out / "preview.html").write_text(render.phone_preview(post, post.titles[0][1]), encoding="utf-8")
    (out / "post_smarteditor.html").write_text(render.to_html(post, embed_images=False), encoding="utf-8")
    (out / "post.txt").write_text(render.to_text(post), encoding="utf-8")
    for im in post.images:
        (out / "images" / im.filename).write_bytes(im.png)
    print(name, "errors:", post.report.errors, "warnings:", post.report.warnings)


if __name__ == "__main__":
    write(generate(PostInput(["yonsei"], "경영", "jeongsi_overview", ["수험생", "정시파이터"], "정보형", SAMPLE_MEMO),
                   UNIVERSITIES["yonsei"]), "yonsei_business_jeongsi_dummy")
    write(generate(PostInput(["yonsei"], "경영", "jeongsi_overview", ["수험생", "정시파이터"], "정보형", SAMPLE_MEMO),
                   build_overview("yonsei", "경영")), "yonsei_business_jeongsi")
    write(generate(PostInput(["sogang", "skku", "hanyang"], "경영", "rival_compare", ["수험생", "정시파이터"], "선배 조언형",
                             SAMPLE_MEMO), build_compare(["sogang", "skku", "hanyang"], "경영")), "sogang_skku_hanyang_business_compare")

    for pt, data, name in [
        ("susi_vs_jeongsi", build_susi_vs("yonsei", "경영"), "yonsei_business_susi_vs_jeongsi"),
        ("timely_news", build_timely("yonsei", "경영", "수능 직후"), "yonsei_business_timely_csat"),
        ("segment_guide", build_segment("yonsei", "경영", "N수생"), "yonsei_business_segment_nsu"),
        ("change_2027", build_change("yonsei", "경영", "N수생 증가"), "yonsei_business_change_nsu"),
    ]:
        write(generate(PostInput(["yonsei"], "경영", pt, ["수험생"], "정보형", SAMPLE_MEMO), data), name)
