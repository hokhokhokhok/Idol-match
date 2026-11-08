"""샘플 '연세대 경영학과 정시 총정리'를 samples/ 에 저장 (python -m blog.build_sample)."""
from pathlib import Path

from . import render
from .dummy_data import UNIVERSITIES
from .generator import generate
from .models import PostInput

SAMPLE_MEMO = ("재수할 때 반영비율을 늦게 확인해서 수학 강세를 못 살린 경험이 있어요. "
               "입결 숫자보다 내 점수 구조와 반영비율이 맞는지부터 보시길 권합니다.")

if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "samples" / "yonsei_business_jeongsi"
    (out / "images").mkdir(parents=True, exist_ok=True)
    post = generate(PostInput(["yonsei"], "경영", "jeongsi_overview", ["수험생", "정시파이터"], "정보형", SAMPLE_MEMO),
                    UNIVERSITIES["yonsei"])
    (out / "preview.html").write_text(render.phone_preview(post, post.titles[0][1]), encoding="utf-8")
    (out / "post_smarteditor.html").write_text(render.to_html(post, embed_images=False), encoding="utf-8")
    (out / "post.txt").write_text(render.to_text(post), encoding="utf-8")
    for im in post.images:
        (out / "images" / im.filename).write_bytes(im.png)
    print("errors:", post.report.errors)
    print("warnings:", post.report.warnings)
    print(f"wrote {out}")
