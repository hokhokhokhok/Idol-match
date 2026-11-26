#!/usr/bin/env python3
"""Bundle ER Scout into one self-contained HTML file.

The output has no outbound requests: the font travels as base64, the data
tables as inline JSON, the modules as inline script. That is a requirement,
not a preference - the page is meant to be openable from a file, from an
artifact link, or from a phone with no network, and a structure typed into it
must not leave it.

Usage: python3 build.py [out.html] [--no-font]

--no-font leaves the typeface out and falls back to whatever Korean font the
reader's machine has. It costs nothing but the look and takes the bundle from
about 5 MB to under 2.5 MB, which is what an email attachment limit tends to
allow.
"""
import base64, json, pathlib, sys

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


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    no_font = "--no-font" in sys.argv
    out_path = pathlib.Path(args[0]) if args else HERE / "index.html"

    css = (WEB / "styles.css").read_text(encoding="utf8")
    if "__FONT_BASE64__" not in css:
        raise SystemExit("styles.css has no __FONT_BASE64__ placeholder")
    if no_font:
        font_b64 = ""
        start = css.index("@font-face")
        end = css.index("}", css.index("__FONT_BASE64__")) + 1
        css = (css[:start] +
               "/* The typeface is left out of this build; the page falls back to\n"
               "   the reader's own Korean system font. */\n" + css[end:])
    else:
        font_b64 = base64.b64encode((ASSETS / FONT).read_bytes()).decode()
        css = css.replace("__FONT_BASE64__", font_b64)
    body = (WEB / "body.html").read_text(encoding="utf8")

    parts = ['<!doctype html>', '<html lang="ko">', '<head>',
             '<meta charset="utf-8">',
             '<meta name="viewport" content="width=device-width, initial-scale=1, '
             'viewport-fit=cover">',
             '<title>ER Scout</title>',
             '<style>']
    parts.append(css)
    parts.append('</style>')
    parts.append('</head>')
    parts.append('<body>')
    parts.append(body)

    parts.append('<script>')
    for name in MODULES:
        parts.append('/* ---- %s ---- */' % name)
        parts.append((WEB / name).read_text(encoding="utf8"))
    parts.append('</script>')

    parts.append('<script>')
    for var, asset in DATA:
        data = json.loads((ASSETS / asset).read_text(encoding="utf8"))
        parts.append('/* ---- %s ---- */' % asset)
        parts.append('var %s = %s;' % (var, json.dumps(data, ensure_ascii=False,
                                                       separators=(",", ":"))))
    parts.append('/* ---- app.js ---- */')
    parts.append((WEB / "app.js").read_text(encoding="utf8"))
    parts.append('</script>')
    parts.append('</body>')
    parts.append('</html>')

    html = "\n".join(parts)
    out_path.write_text(html, encoding="utf8")
    size = out_path.stat().st_size
    print("%s — %.1f MB (font %.1f MB)" % (out_path, size / 1e6, len(font_b64) / 1e6))
    for var, asset in DATA:
        print("  %-7s %-22s %6.0f KB" % (var, asset, (ASSETS / asset).stat().st_size / 1024))
    if size > 16 * 1024 * 1024:
        print("WARNING: over the 16 MB artifact limit", file=sys.stderr)


if __name__ == "__main__":
    main()
