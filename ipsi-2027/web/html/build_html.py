"""단일 HTML판 빌드: python web/html/build_html.py <출력.html>"""
import subprocess, sys, tempfile
from pathlib import Path
H = Path(__file__).resolve().parent
with tempfile.TemporaryDirectory() as d:
    data = Path(d) / "data.js"
    subprocess.run([sys.executable, str(H / "export_data.py"), str(data)], check=True)
    html = (H / "template.html").read_text(encoding="utf-8")
    html = html.replace("/*LOGIC*/", (H / "logic.js").read_text(encoding="utf-8")).replace("/*DATA*/", data.read_text(encoding="utf-8").replace("</", "<\\/"))
Path(sys.argv[1]).write_text(html, encoding="utf-8")
print(sys.argv[1], len(html.encode()) // 1024, "KB")
