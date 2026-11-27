#!/usr/bin/env python3
"""Cut the typeface down to the characters this page actually shows.

The full Pretendard Variable file is 2.0 MB, which is most of the bundle and
too much for an email attachment. Dropping it instead was worse: the page
then depends on the reader's machine having a Korean font, and on a machine
without one every Korean character renders as a box or a question mark -
which is what happened when the fontless build was mailed out.

So the font travels, but only the glyphs the page uses. The characters are
collected from the built HTML itself, with the base64 payload and the inline
JSON data skipped, plus the Korean syllables the data tables can produce.

Usage: python3 subset_font.py <built.html> <out.woff2>
"""
import pathlib, re, subprocess, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE.parent / "web/assets/Pretendard-Variable.woff2"

# Latin, digits, punctuation the page draws, plus the arrows and symbols the
# interface uses in labels and tables
ALWAYS = (
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    " .,:;!?'\"()[]{}<>/\\|-_=+*&^%$#@~`\n\t"
    "±×÷≈≤≥→←↑↓·•…–—°Å³²µμαβγδεΔ✓✗□■※"
)


def main():
    html_path = pathlib.Path(sys.argv[1])
    out_path = pathlib.Path(sys.argv[2])
    html = html_path.read_text(encoding="utf8")

    # the font payload and the data tables are not text the page renders
    html = re.sub(r"base64,[A-Za-z0-9+/=]+", "", html)
    html = re.sub(r"var (EXTLIB|SCENE|TOX21|PANEL_[A-Z0-9]+|SCENE_PPARG|ADIPO)"
                  r" = .*?;\n", "", html, flags=re.S)

    chars = set(html) | set(ALWAYS)
    # the data files carry Korean names the tables print
    for name in ("er_names.json", "er_reference.json", "adipo_pheno.json",
                 "pocket_scene.json", "pocket_scene_pparg.json"):
        path = HERE.parent / "web/assets" / name
        if path.exists():
            chars |= set(path.read_text(encoding="utf8"))
    chars = {c for c in chars if ord(c) > 31}

    hangul = sum(1 for c in chars if 0xAC00 <= ord(c) <= 0xD7A3)
    print("characters kept: %d (Hangul syllables %d)" % (len(chars), hangul),
          file=sys.stderr)

    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False,
                                     encoding="utf8") as fh:
        fh.write("".join(sorted(chars)))
        charfile = fh.name

    subprocess.run([
        sys.executable, "-m", "fontTools.subset", str(SRC),
        "--text-file=" + charfile,
        "--output-file=" + str(out_path),
        "--flavor=woff2",
        "--layout-features=*",
        "--no-hinting",
        "--desubroutinize",
    ], check=True)
    print("%s — %.0f KB (from %.0f KB)"
          % (out_path, out_path.stat().st_size / 1024, SRC.stat().st_size / 1024),
          file=sys.stderr)


if __name__ == "__main__":
    main()
