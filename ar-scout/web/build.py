#!/usr/bin/env python3
"""Bundle the AR Scout engine and UI into one self-contained HTML file.

The browser build must have zero dependencies and no network fetches, so the
engine modules are concatenated into the shell's placeholders.

Node and the browser need different plumbing for the same source files:

  * ``var AR = require('./armodel.js');`` lines are dropped.
  * ``module.exports = { ... };`` is rewritten to ``var AR = { ... };`` rather
    than deleted, so the cross-module namespaces the stripped ``require``
    lines used to provide still exist inside the single script scope.

Run with no arguments to write <repo>/ar-scout/ar-scout.html.
"""

import argparse
import base64
import pathlib
import re
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent

# source file -> namespace the other modules reference it by
ENGINE = [("armodel.js", "AR"), ("layout.js", "LY"), ("predict.js", "PR")]
APP = ("app.js", "APP")

# Pretendard is vendored and inlined as base64 rather than fetched: the
# bundle has to stay a single file with no outbound requests, and naming the
# font in a fallback stack is not enough when it is not installed locally.
FONT = ("assets/PretendardVariable.woff2", "/*__FONT__*/")

REQUIRE_LINE = re.compile(
    r"^[ \t]*(?:var|const|let)[ \t]+\w+[ \t]*=[ \t]*require\([^)]*\)[ \t]*;?[ \t]*\r?\n?",
    re.MULTILINE,
)
EXPORTS_HEAD = re.compile(r"^[ \t]*module\.exports[ \t]*=[ \t]*\{", re.MULTILINE)
MAIN_GUARD = re.compile(
    r"^[ \t]*if[ \t]*\([ \t]*require\.main[ \t]*===[ \t]*module[ \t]*\).*\r?\n?",
    re.MULTILINE,
)


def prepare(path: pathlib.Path, namespace: str) -> str:
    """Strip Node-only plumbing and expose the module under `namespace`."""
    src = path.read_text(encoding="utf-8")
    src = REQUIRE_LINE.sub("", src)
    src = MAIN_GUARD.sub("", src)
    src, n = EXPORTS_HEAD.subn("var %s = {" % namespace, src)
    if n != 1:
        raise SystemExit(
            "%s: expected exactly one 'module.exports = {' line, found %d"
            % (path.name, n)
        )
    banner = "/* ---- %s ---- */\n" % path.name
    return banner + src.strip() + "\n"


def build(out_path: pathlib.Path) -> int:
    shell_path = HERE / "shell.html"
    shell = shell_path.read_text(encoding="utf-8")
    for token in ("/*__ENGINE__*/", "/*__APP__*/"):
        if token not in shell:
            raise SystemExit("shell.html is missing the %s placeholder" % token)

    font_path = HERE / FONT[0]
    if FONT[1] in shell:
        if not font_path.exists():
            raise SystemExit("missing vendored font: %s" % font_path)
        font_b64 = base64.b64encode(font_path.read_bytes()).decode("ascii")
        shell = shell.replace(FONT[1], font_b64)
    else:
        font_b64 = ""

    engine_src = "\n".join(prepare(HERE / name, ns) for name, ns in ENGINE)
    app_src = prepare(HERE / APP[0], APP[1])

    # syntax-check the concatenated script before it is sealed into the page
    combined = engine_src + "\n" + app_src
    with tempfile.NamedTemporaryFile(
        "w", suffix=".js", delete=False, encoding="utf-8"
    ) as tmp:
        tmp.write(combined)
        tmp_name = tmp.name
    try:
        check = subprocess.run(
            ["node", "--check", tmp_name], capture_output=True, text=True
        )
    finally:
        pathlib.Path(tmp_name).unlink(missing_ok=True)
    if check.returncode != 0:
        sys.stderr.write(check.stderr)
        raise SystemExit("node --check failed on the bundled script")

    html = shell.replace("/*__ENGINE__*/", engine_src).replace("/*__APP__*/", app_src)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")

    size = out_path.stat().st_size
    print("wrote %s" % out_path)
    print("  %d bytes (%.1f KB), node --check passed" % (size, size / 1024.0))
    print("  engine %.1f KB, app %.1f KB, shell %.1f KB, font %.1f KB"
          % (len(engine_src) / 1024.0, len(app_src) / 1024.0,
             (len(shell) - len(font_b64)) / 1024.0, len(font_b64) / 1024.0))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--out",
        type=pathlib.Path,
        default=HERE.parent / "ar-scout.html",
        help="output HTML path (default: ../ar-scout.html)",
    )
    args = ap.parse_args()
    return build(args.out)


if __name__ == "__main__":
    raise SystemExit(main())
