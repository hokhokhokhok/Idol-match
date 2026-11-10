"""브라우저 실행판(stlite) 빌드 — GitHub Pages 배포용.

python ipsi-2027/web/build_web.py <출력 폴더>   (예: www/ipsi)
  → index.html + ipsi-app.zip (앱 코드·출처 있는 파싱 데이터·한글 폰트)

브라우저 안에서 Pyodide로 Python을 실행하므로 서버가 없고, 사용자 입력은 IndexedDB(내 브라우저)에만 저장된다.
"""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STLITE = "1.11.0"
INCLUDE = [
    ("app", "*.py"), ("blog", "*.py"), ("engine", "*.py"), ("engine", "*.sql"), ("insights", "*.py"),
    ("config", "*.yaml"), ("data", "download_log.csv"), ("data/insights", "seed.yaml"),
    ("data/parsed/susi_2027", "*.yaml"), ("data/parsed/jeongsi_2027", "*.yaml"), ("data/parsed/results", "dongguk.csv"),
    ("assets/fonts", "NanumGothic.ttf"), ("assets/fonts", "README.md"),
]
STREAMLIT_PY = ROOT / "app" / "streamlit_app.py"

HTML = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>2027 인서울 입시 전략</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@stlite/browser@{ver}/build/stlite.css">
<style>
  body {{ margin: 0; font-family: -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif; }}
  #boot {{ max-width: 640px; margin: 18vh auto 0; padding: 0 16px; color: #333; line-height: 1.7; }}
  #boot b {{ font-size: 20px; }} #boot small {{ color: #777; }}
</style>
</head>
<body>
<div id="boot"><b>2027 인서울 입시 전략 앱을 불러오는 중…</b><br>
처음 열 때는 브라우저가 Python 실행 환경을 내려받느라 30초~1분 걸릴 수 있습니다.<br>
<small>입력한 성적·지원 목록은 이 브라우저(IndexedDB)에만 저장되고 서버로 전송되지 않습니다.
합격을 보장하지 않으며, 최종 지원 전 각 대학 모집요강 원문을 확인하세요.</small></div>
<div id="root"></div>
<script type="module">
import {{ mount }} from "https://cdn.jsdelivr.net/npm/@stlite/browser@{ver}/build/stlite.js";
const app = mount({{
  entrypoint: "ipsi-2027/app/streamlit_app.py",
  requirements: ["matplotlib", "pyyaml", "numpy", "sqlite3"],
  archives: [{{ url: "./ipsi-app.zip", format: "zip" }}],
  env: {{ IPSI_LOCAL_DIR: "/home/pyodide/ipsi_local", MPLBACKEND: "Agg" }},
  idbfsMountpoints: ["/home/pyodide/ipsi_local"],
  streamlitConfig: {{ "client.toolbarMode": "viewer", "theme.primaryColor": "#c4334f", "theme.base": "light", "theme.textColor": "#1f1a1c", "theme.secondaryBackgroundColor": "#fbf6f7" }},
}}, document.getElementById("root"));
document.getElementById("boot").remove();
</script>
</body>
</html>
"""


def build(out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    n = 0
    with zipfile.ZipFile(out / "ipsi-app.zip", "w", zipfile.ZIP_DEFLATED) as z:
        for d, pat in INCLUDE:
            for f in sorted((ROOT / d).glob(pat)):
                z.write(f, f"ipsi-2027/{f.relative_to(ROOT)}")
                n += 1
    (out / "index.html").write_text(HTML.format(ver=STLITE), encoding="utf-8")
    print(f"{n} files → {out / 'ipsi-app.zip'} ({(out / 'ipsi-app.zip').stat().st_size / 1e6:.1f} MB), index.html")


if __name__ == "__main__":
    build(Path(sys.argv[1] if len(sys.argv) > 1 else "web_dist"))
