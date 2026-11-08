from pathlib import Path

from .templates import templates_markdown

if __name__ == "__main__":
    out = Path(__file__).resolve().parent.parent / "docs" / "blog_templates.md"
    out.write_text(templates_markdown() + "\n", encoding="utf-8")
    print(f"wrote {out}")
