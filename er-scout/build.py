#!/usr/bin/env python3
"""Bundle ER Scout into one self-contained HTML file.

The output has no outbound requests: the font travels as base64, the data
tables as inline JSON, the modules as inline script. That is a requirement,
not a preference - the page is meant to be openable from a file, from an
artifact link, or from a phone with no network, and a structure typed into it
must not leave it.

Usage: python3 build.py [out.html] [--subset-font | --no-font]

--subset-font keeps the typeface but only the glyphs this page draws - about
500 Hangul syllables, 130 KB instead of 2 MB. Use it for any copy that has to
travel: the page then depends on nothing the reader's machine has.

--no-font leaves the typeface out entirely and falls back to whatever Korean
font the reader's machine has. That is a real dependency, not a cosmetic one:
on a machine or a mail client without one, every Korean character comes out
as a box or a question mark. That is what happened to the first copy mailed
out of here. Prefer --subset-font.
"""
import base64, json, pathlib, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE / "web"
ASSETS = WEB / "assets"

MODULES = ["molmodel.js", "ermotifs.js", "layout.js", "layout3d.js",
           "predict.js", "panel.js"]
# name in the bundle -> asset file. The engine reads these as globals.
DATA = [
    ("EXTLIB", "er_reference.json"),
    ("SCENE", "pocket_scene.json"),
    # one merged Tox21 table for all five receptors; each panel takes its
    # own column at load time
    ("TOX21", "tox21.json"),
    # the adipocyte-signalling panel
    ("PANEL_PPARG", "panel_pparg.json"),
    ("SCENE_PPARG", "pocket_scene_pparg.json"),
    ("PANEL_GR", "panel_gr.json"),
    ("PANEL_AR", "panel_ar.json"),
    ("PANEL_HSD1", "panel_hsd1.json"),
    ("PANEL_AROM", "panel_arom.json"),
    ("ADIPO", "adipo_pheno.json"),
]
FONT = "Pretendard-Variable.woff2"

# symbols the interface composes at run time, so they never appear in the
# page source the subsetter reads
EXTRA_GLYPHS = "±×÷≈≤≥→←↑↓·•…–—°Å³²µμαβγδεΔ✓✗□■※"


def read_parts():
    body = (WEB / "body.html").read_text(encoding="utf8")
    modules = []
    for name in MODULES:
        modules.append("/* ---- %s ---- */" % name)
        modules.append((WEB / name).read_text(encoding="utf8"))
    data = []
    for var, asset in DATA:
        payload = json.loads((ASSETS / asset).read_text(encoding="utf8"))
        data.append("/* ---- %s ---- */" % asset)
        data.append("var %s = %s;" % (var, json.dumps(payload, ensure_ascii=False,
                                                      separators=(",", ":"))))
    data.append("/* ---- app.js ---- */")
    data.append((WEB / "app.js").read_text(encoding="utf8"))
    return body, modules, data


def assemble(css, body, modules, data):
    parts = ["<!doctype html>", '<html lang="ko">', "<head>",
             '<meta charset="utf-8">',
             '<meta name="viewport" content="width=device-width, initial-scale=1, '
             'viewport-fit=cover">',
             "<title>ER Scout</title>",
             "<style>", css, "</style>", "</head>", "<body>", body,
             "<script>"]
    parts.extend(modules)
    parts.append("</script>")
    parts.append("<script>")
    parts.extend(data)
    parts.append("</script>")
    parts.append("</body>")
    parts.append("</html>")
    return "\n".join(parts)


def subset_font(html, tmpdir):
    """Cut the typeface down to the characters this page draws."""
    import re
    text = re.sub(r"base64,[A-Za-z0-9+/=]+", "", html)
    chars = {c for c in text if ord(c) > 31} | set(EXTRA_GLYPHS)
    charfile = pathlib.Path(tmpdir) / "chars.txt"
    charfile.write_text("".join(sorted(chars)), encoding="utf8")
    out = pathlib.Path(tmpdir) / "subset.woff2"
    subprocess.run([sys.executable, "-m", "fontTools.subset", str(ASSETS / FONT),
                    "--text-file=" + str(charfile), "--output-file=" + str(out),
                    "--flavor=woff2", "--layout-features=*", "--no-hinting",
                    "--desubroutinize"], check=True)
    hangul = sum(1 for c in chars if 0xAC00 <= ord(c) <= 0xD7A3)
    print("  subset: %d characters (%d Hangul) -> %.0f KB"
          % (len(chars), hangul, out.stat().st_size / 1024))
    return out.read_bytes()


def strip_font_face(css):
    start = css.index("@font-face")
    end = css.index("}", css.index("__FONT_BASE64__")) + 1
    return (css[:start] +
            "/* The typeface is left out of this build; the page falls back to\n"
            "   the reader's own Korean system font. */\n" + css[end:])


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    no_font = "--no-font" in sys.argv
    subset = "--subset-font" in sys.argv
    out_path = pathlib.Path(args[0]) if args else HERE / "index.html"

    base_css = (WEB / "styles.css").read_text(encoding="utf8")
    if "__FONT_BASE64__" not in base_css:
        raise SystemExit("styles.css has no __FONT_BASE64__ placeholder")
    body, modules, data = read_parts()

    font_b64 = ""
    if no_font:
        css = strip_font_face(base_css)
        html = assemble(css, body, modules, data)
    elif subset:
        # build once with no font to see which characters the page contains,
        # then again with just those
        html = assemble(strip_font_face(base_css), body, modules, data)
        with tempfile.TemporaryDirectory() as tmp:
            font_b64 = base64.b64encode(subset_font(html, tmp)).decode()
        html = assemble(base_css.replace("__FONT_BASE64__", font_b64),
                        body, modules, data)
    else:
        font_b64 = base64.b64encode((ASSETS / FONT).read_bytes()).decode()
        html = assemble(base_css.replace("__FONT_BASE64__", font_b64),
                        body, modules, data)

    out_path.write_text(html, encoding="utf8")
    size = out_path.stat().st_size
    print("%s — %.1f MB (font %.1f MB)" % (out_path, size / 1e6, len(font_b64) / 1e6))
    for var, asset in DATA:
        print("  %-11s %-24s %6.0f KB"
              % (var, asset, (ASSETS / asset).stat().st_size / 1024))
    if size > 16 * 1024 * 1024:
        print("WARNING: over the 16 MB artifact limit", file=sys.stderr)


if __name__ == "__main__":
    main()
