"""렌더러: 모바일 미리보기 HTML / 네이버 스마트에디터 붙여넣기용 HTML / 일반 텍스트 / 이미지 ZIP."""
from __future__ import annotations

import base64
import io
import zipfile
from html import escape

from .generator import Post

# 스마트에디터는 class·<style>을 버리므로 붙여넣기용은 인라인 스타일만 쓴다.
S = {
    "h": "font-size:19px;font-weight:bold;color:#111;margin:32px 0 12px;padding-left:10px;border-left:4px solid #2a78d6;",
    "p": "font-size:16px;line-height:1.8;color:#333;margin:0 0 14px;",
    "lead": "font-size:17px;line-height:1.7;color:#111;margin:0 0 6px;font-weight:bold;",
    "table": "border-collapse:collapse;width:100%;font-size:14px;margin:8px 0 4px;",
    "th": "border:1px solid #d9d9d9;background:#f2f6fc;padding:8px 6px;text-align:center;color:#111;",
    "td": "border:1px solid #d9d9d9;padding:8px 6px;text-align:center;color:#333;",
    "caption": "font-size:12px;color:#888;margin:0 0 16px;",
    "box": "background:#fff8e6;border:1px solid #f1d58a;border-radius:8px;padding:14px 16px;margin:24px 0;",
    "insight": "background:#f6f6f4;border-radius:8px;padding:10px 12px;margin:0 0 10px;font-size:15px;line-height:1.7;color:#333;",
    "badge": "display:inline-block;font-size:12px;background:#52514e;color:#fff;border-radius:4px;padding:1px 6px;margin-right:6px;",
    "warn": "display:inline-block;font-size:12px;background:#fde3d5;color:#9a3a10;border-radius:4px;padding:1px 6px;margin-left:6px;",
    "memo": "font-size:16px;line-height:1.8;color:#111;border-left:3px solid #ccc;padding:4px 0 4px 12px;margin:0 0 14px;white-space:pre-line;",
    "question": "font-size:16px;line-height:1.7;color:#2a78d6;font-weight:bold;margin:28px 0;",
    "notice": "font-size:13px;line-height:1.6;color:#777;margin:6px 0;",
    "banner": "background:#fde3d5;color:#9a3a10;font-size:14px;font-weight:bold;padding:10px 12px;border-radius:6px;margin:0 0 18px;",
    "src": "font-size:13px;line-height:1.6;color:#666;margin:0;padding-left:18px;",
}


def _table(b) -> str:
    h = "".join(f'<th style="{S["th"]}">{escape(str(c))}</th>' for c in b.header)
    rows = "".join("<tr>" + "".join(f'<td style="{S["td"]}">{escape(str(c))}</td>' for c in r) + "</tr>" for r in b.rows)
    cap = f'<p style="{S["caption"]}">{escape(b.meta["caption"])}</p>' if b.meta.get("caption") else '<p style="margin:0 0 16px;"></p>'
    return f'<table style="{S["table"]}"><thead><tr>{h}</tr></thead><tbody>{rows}</tbody></table>{cap}'


def to_html(post: Post, embed_images: bool) -> str:
    """embed_images=True: 미리보기(base64). False: 스마트에디터용(이미지 자리 표시 → 직접 업로드)."""
    out = []
    for b in post.blocks:
        k = b.kind
        if k == "h":
            out.append(f'<p style="{S["h"]}">{escape(b.text)}</p>')
        elif k == "p":
            out.append(f'<p style="{S["p"]}">{escape(b.text)}</p>')
        elif k == "lead":
            out.append("".join(f'<p style="{S["lead"]}">{escape(t)}</p>' for t in b.items) + '<p style="margin:0 0 18px;"></p>')
        elif k == "table":
            out.append(_table(b))
        elif k == "img":
            im = b.image
            if embed_images:
                src = "data:image/png;base64," + base64.b64encode(im.png).decode()
                out.append(f'<img src="{src}" alt="{escape(im.alt)}" style="width:100%;border-radius:6px;margin:8px 0 2px;">')
            else:
                out.append(f'<p style="{S["notice"]}background:#eef3fb;padding:16px;text-align:center;">'
                           f'[이미지 삽입: {escape(im.filename)}]<br>대체 텍스트: {escape(im.alt)}</p>')
            out.append(f'<p style="{S["caption"]}">▲ {escape(im.caption)}</p>')
        elif k == "box":
            lis = "".join(f'<p style="{S["p"]}margin:4px 0;">✔ {escape(t)}</p>' for t in b.items)
            out.append(f'<div style="{S["box"]}"><p style="{S["p"]}font-weight:bold;margin:0 0 6px;">{escape(b.text)}</p>{lis}</div>')
        elif k == "insight":
            warn = f'<span style="{S["warn"]}">{escape(b.meta["status"])}</span>' if b.meta.get("status") != "확정" else ""
            out.append(f'<p style="{S["insight"]}"><span style="{S["badge"]}">학원 관점 · {escape(b.meta["org"])}</span>'
                       f'{escape(b.text)}{warn}</p>')
        elif k == "memo":
            out.append(f'<p style="{S["memo"]}">{escape(b.text)}</p>')
        elif k == "question":
            out.append(f'<p style="{S["question"]}">💬 {escape(b.text)}</p>')
        elif k == "sources":
            lis = "".join(f'<li style="margin:0 0 4px;">{escape(t)}</li>' for t in b.items)
            out.append(f'<p style="{S["h"]}font-size:16px;">출처</p><ul style="{S["src"]}">{lis}</ul>')
        elif k == "notice":
            out.append(f'<p style="{S["notice"]}">※ {escape(b.text)}</p>')
        elif k == "banner":
            out.append(f'<p style="{S["banner"]}">{escape(b.text)}</p>')
    return "\n".join(out)


def to_text(post: Post) -> str:
    out = [f"[제목 후보]"] + [f"- ({s}) {t}" for s, t in post.titles] + [""]
    for b in post.blocks:
        k = b.kind
        if k == "h":
            out += ["", f"■ {b.text}"]
        elif k in ("p", "memo", "banner"):
            out.append(b.text)
        elif k == "lead":
            out += b.items + [""]
        elif k == "table":
            out.append(" | ".join(b.header))
            out += [" | ".join(map(str, r)) for r in b.rows]
            if b.meta.get("caption"):
                out.append(f"({b.meta['caption']})")
        elif k == "img":
            out.append(f"[이미지: {b.image.filename}] {b.image.alt}")
        elif k == "box":
            out += ["", b.text] + [f"✔ {t}" for t in b.items]
        elif k == "insight":
            out.append(f"[학원 관점·{b.meta['org']}] {b.text}")
        elif k == "question":
            out += ["", f"💬 {b.text}"]
        elif k == "sources":
            out += ["", "출처"] + [f"- {t}" for t in b.items]
        elif k == "notice":
            out.append(f"※ {b.text}")
    out += ["", "[태그] " + " ".join(f"#{t}" for t in post.tags)]
    return "\n".join(out)


def to_zip(post: Post) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for im in post.images:
            z.writestr(im.filename, im.png)
        z.writestr("alt_text.txt", "\n".join(f"{im.filename}\t{im.alt}" for im in post.images))
    return buf.getvalue()


def phone_preview(post: Post, title: str) -> str:
    """모바일 폭(390px) 네이버 블로그풍 미리보기."""
    thumb = next(im for im in post.images if im.filename == "thumbnail.png")
    tsrc = "data:image/png;base64," + base64.b64encode(thumb.png).decode()
    tags = " ".join(f'<span style="color:#2a78d6;margin-right:6px;">#{escape(t)}</span>' for t in post.tags)
    return f"""<!doctype html><html><head><meta charset="utf-8">
<style>body{{margin:0;background:#e9e9e6;font-family:-apple-system,'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif;}}
.phone{{width:390px;margin:16px auto;background:#fff;border-radius:28px;box-shadow:0 6px 24px rgba(0,0,0,.18);overflow:hidden;border:10px solid #1d1d1f;}}
.bar{{height:44px;display:flex;align-items:center;padding:0 16px;font-size:14px;color:#03c75a;font-weight:bold;border-bottom:1px solid #eee;}}
.inner{{padding:18px 18px 40px;}} .t{{font-size:22px;font-weight:bold;line-height:1.4;color:#111;margin:4px 0 8px;}}
.by{{font-size:13px;color:#999;margin-bottom:16px;}}</style></head><body>
<div class="phone"><div class="bar">blog</div><div class="inner">
<div class="t">{escape(title)}</div><div class="by">필자 · {escape(post.data_snapshot_date)} 기준</div>
<img src="{tsrc}" alt="{escape(thumb.alt)}" style="width:100%;border-radius:8px;margin-bottom:18px;">
{to_html(post, embed_images=True)}
<p style="margin-top:24px;font-size:14px;line-height:1.9;">{tags}</p>
</div></div></body></html>"""
