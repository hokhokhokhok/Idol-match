# 인서울 입시 전략 분석 앱 (2027학년도)

수시·정시 성향 × 현역/재수/삼수/N수/반수 맞춤형 개인 분석 도구 (Python + Streamlit).
기획: v2(F1~F9) + v3(F10 블로그 포스팅 탭). 합격을 보장하지 않으며, 모든 수치는 출처와 함께 저장한다.

## 현재 구현 범위

| 항목 | 상태 |
|---|---|
| F10 포스트 템플릿 6종 구조 정의 | ✅ `blog/templates.py` → [docs/blog_templates.md](docs/blog_templates.md) |
| ① 학과 정시 총정리 생성기 | ✅ (현재 **더미 데이터**: 연세대 경영) |
| 차트 3장 + 썸네일 PNG, 대체 텍스트 | ✅ `blog/charts.py` |
| 내보내기: 스마트에디터 HTML / 텍스트 / 이미지 ZIP | ✅ `blog/render.py` |
| 가드레일: 출처 없는 값 차단, 더미·검증 필요 경고, 필자 메모 필수, 과장 표현 차단, 일 생성 한도, 유사도 검사, 광고 표기 | ✅ `blog/guardrails.py` |
| blog_posts / blog_metrics 스키마 (로컬 SQLite) | ✅ `blog/store.py` |
| ②~⑥ 생성기, 발행 캘린더, 성과 추적 | ⏳ Phase 3~6 |
| Phase 1 (대학 목록·모집요강 수집, context.md) | ⏳ 다음 작업 |

## 실행

```bash
cd ipsi-2027
pip install -r requirements.txt
streamlit run app/streamlit_app.py      # 블로그 포스팅 탭 + 템플릿 구조 탭
python -m pytest -q tests                 # 테스트
python -m blog.build_sample               # samples/ 샘플 재생성
python -m blog.build_docs                 # docs/blog_templates.md 재생성
```

## 샘플

`samples/yonsei_business_jeongsi/` — **더미 데이터**로 만든 "연세대 경영학과 정시 총정리".
`preview.html`(모바일 미리보기), `post_smarteditor.html`(붙여넣기용), `post.txt`, `images/`, `screenshots/`.
실제 모집요강·입결이 아니므로 발행하면 안 된다 (본문 상단과 썸네일에 '샘플' 표시가 붙음).

## 폴더

```
blog/      models(출처 붙은 값) · templates · generator · render · charts · guardrails · store · dummy_data
app/       Streamlit 앱
docs/      blog_templates.md (자동 생성)
tests/     pytest
samples/   생성 결과 예시
```

한글 폰트: NanumGothic → Noto Sans KR → 맑은 고딕 → AppleGothic → WenQuanYi Zen Hei 순으로 설치된 것을 사용.
