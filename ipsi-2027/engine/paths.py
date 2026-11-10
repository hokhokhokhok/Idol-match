"""저장 위치. 사용자 입력(성적·지원 목록·직접 추가 인사이트·공지 반영·입결 가져오기)은 LOCAL 아래에 둔다.

- 기본(PC 실행): ipsi-2027/data/ 아래 (git 제외)
- 브라우저 실행판(stlite): 환경 변수 IPSI_LOCAL_DIR = IndexedDB에 연결된 폴더 → 내 브라우저에만 저장
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_env = os.environ.get("IPSI_LOCAL_DIR")
LOCAL = Path(_env) if _env else None


def local(*parts: str, default: Path) -> Path:
    """IPSI_LOCAL_DIR 가 있으면 그 아래, 없으면 default."""
    return LOCAL.joinpath(*parts) if LOCAL else default
