"""단일 HTML판 빌드: python web/html/build_html.py <출력.html> [--artifact]  (--artifact: claude.ai 아티팩트용, 문서 머리 생략)"""
import subprocess, sys, tempfile
from pathlib import Path
H = Path(__file__).resolve().parent
with tempfile.TemporaryDirectory() as d:
    data = Path(d) / "data.js"
    subprocess.run([sys.executable, str(H / "export_data.py"), str(data)], check=True)
    html = (H / "template.html").read_text(encoding="utf-8")
    html = html.replace("/*LOGIC*/", (H / "logic.js").read_text(encoding="utf-8")).replace("/*DATA*/", data.read_text(encoding="utf-8").replace("</", "<\\/"))
i = html.index("</style>") + len("</style>")
head, body = html[:i], html[i:]
if "--artifact" not in sys.argv:   # 일반 웹 배포용: 문서 머리(문자셋·모바일 화면 크기) 추가
    html = ('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<meta name="theme-color" content="#f2f4f6">\n' + head + '\n</head>\n<body>\n' + body + '\n</body>\n</html>\n')
Path(sys.argv[1]).write_text(html, encoding="utf-8")
print(sys.argv[1], len(html.encode()) // 1024, "KB")
