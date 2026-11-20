"""posts.py → 01.md~30.md + email/NN.txt (메일 본문). 가드레일(과장 표현·출처·필자 메모 칸) 검사."""
import sys
from pathlib import Path
H = Path(__file__).resolve().parent
sys.path.insert(0, str(H)); sys.path.insert(0, str(H.parents[1]))
from posts import POSTS, SRC
from blog.guardrails import BANNED

APP = "https://hokhokhokhok.github.io/Idol-match/ipsi/"
NOTE = ("※ 가채점·예상 등급컷은 입시기관 추정치이며 확정 성적(12월 11일)과 다를 수 있습니다. "
        "대학별 기준은 2027 모집요강을 옮긴 값이니, 지원 전 반드시 대학 모집요강 원문을 다시 확인하세요.")
MEMO = "[필자 메모 — 발행 전 직접 작성] 이 주제에 대한 내 경험·의견 2~3문장 (작성하지 않으면 발행하지 마세요)"
AD = "광고·협찬: 없음 (본문 계산기는 필자가 만든 무료 도구)"

def render(i, p):
    srcs = [SRC[k] for k in p["src"]]
    for w in BANNED:
        assert w not in p["title"] + p["body"], (i, w)
    assert srcs, i
    md = (f"# {p['title']}\n\n> 메인 키워드: {p['kw']} · 서브: {', '.join(p['sub'])}\n> 메타 설명: {p['meta']}\n\n"
          f"{p['body']}\n\n## 직접 계산해 보기\n내 성적으로 수시 최저·정시 환산을 바로 계산할 수 있는 무료 계산기: {APP}\n\n"
          f"{NOTE}\n\n**{MEMO}**\n\n## 출처\n" + "\n".join(f"- [{t}]({u})" for t, u in srcs) + f"\n\n{AD}\n")
    txt = md.replace("**", "").replace("> ", "")
    import re
    txt = re.sub(r"^# (.*)$", r"[제목] \1", txt, flags=re.M)
    txt = re.sub(r"^## (.*)$", r"■ \1", txt, flags=re.M)
    txt = re.sub(r"\[([^\]]+)\]\((http[^)]+)\)", r"\1 — \2", txt)
    head = (f"[SEO 포스팅 초안 {i:02d}/30] 발행 전 확인: ① 필자 메모 작성 ② 수치·날짜 원문 대조 ③ 하루 3편 이내로 나눠 발행\n"
            + "=" * 40 + "\n\n")
    return md, head + txt

(H / "email").mkdir(exist_ok=True)
for i, p in enumerate(POSTS, 1):
    md, txt = render(i, p)
    (H / f"{i:02d}.md").write_text(md, encoding="utf-8")
    (H / "email" / f"{i:02d}.txt").write_text(txt, encoding="utf-8")
print(len(POSTS), "posts ok")
