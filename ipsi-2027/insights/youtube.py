"""유튜브 자막 → 추출식 요약 (사용자가 지정한 영상만). 자막 전문은 저장하지 않고 요약 1~3문장만 반환."""
from __future__ import annotations

import re
from collections import Counter

STOP = set("그리고 그래서 그런데 근데 이제 진짜 그냥 이거 저거 그거 이런 저런 그런 우리 여러분 제가 저는 이렇게 그렇게 정말 너무 약간 "
           "있는 없는 하는 되는 것은 것이 거예요 거죠 있어요 합니다 입니다 해서 하고".split())


def video_id(url: str) -> str | None:
    m = re.search(r"(?:v=|youtu\.be/|shorts/|embed/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else None


def fetch_transcript(url: str, langs=("ko", "en")) -> str:
    """자막 텍스트(메모리에만). 실패하면 예외."""
    from youtube_transcript_api import YouTubeTranscriptApi
    vid = video_id(url)
    if not vid:
        raise ValueError("유튜브 영상 URL이 아닙니다")
    api = YouTubeTranscriptApi()
    if hasattr(api, "fetch"):                       # 1.x
        parts = api.fetch(vid, languages=list(langs))
        return " ".join(getattr(p, "text", "") for p in parts)
    parts = YouTubeTranscriptApi.get_transcript(vid, languages=list(langs))   # 0.x
    return " ".join(p["text"] for p in parts)


def sentences(text: str) -> list[str]:
    text = re.sub(r"\s+", " ", text)
    parts = re.split(r"(?<=[.?!])\s+|(?<=(?:다|요|죠|까))\s+(?=[가-힣A-Z0-9])", text)
    return [p.strip() for p in parts if 15 <= len(p.strip()) <= 160]


def summarize(text: str, n: int = 3, keywords: list[str] | None = None) -> list[str]:
    """빈도 기반 추출 요약. 반환 문장은 원문 순서 유지. (직접 다듬어 저장하길 권장)"""
    sents = sentences(text)
    if not sents:
        return []
    words = [w for w in re.findall(r"[가-힣A-Za-z0-9]{2,}", text) if w not in STOP]
    freq = Counter(words)
    kw = set(keywords or [])
    def score(s: str) -> float:
        ws = [w for w in re.findall(r"[가-힣A-Za-z0-9]{2,}", s) if w not in STOP]
        if not ws:
            return 0
        return sum(freq[w] for w in ws) / len(ws) + 3 * sum(1 for w in ws if w in kw)
    top = sorted(range(len(sents)), key=lambda i: -score(sents[i]))[:n]
    return [sents[i] for i in sorted(top)]
