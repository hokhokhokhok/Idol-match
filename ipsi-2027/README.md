# 인서울 입시 전략 분석 앱 (2027학년도)

수시·정시 성향 × 현역/재수/삼수/N수/반수 맞춤형 개인 분석 도구 (Python + Streamlit).
기획: v2(F1~F9) + v3(F10 블로그 포스팅 탭). 합격을 보장하지 않으며, 모든 수치는 출처와 함께 저장한다.

## 현재 구현 범위

| 항목 | 상태 |
|---|---|
| F10 포스트 템플릿 6종 구조 정의 | ✅ `blog/templates.py` → [docs/blog_templates.md](docs/blog_templates.md) |
| ① 학과 정시 총정리 생성기 | ✅ 실데이터(연세대 경영) + 더미 샘플 |
| 차트 3장 + 썸네일 PNG, 대체 텍스트 | ✅ `blog/charts.py` |
| 내보내기: 스마트에디터 HTML / 텍스트 / 이미지 ZIP | ✅ `blog/render.py` |
| 가드레일: 출처 없는 값 차단, 더미·검증 필요 경고, 필자 메모 필수, 과장 표현 차단, 일 생성 한도, 유사도 검사, 광고 표기 | ✅ `blog/guardrails.py` |
| blog_posts / blog_metrics 스키마 (로컬 SQLite) | ✅ `blog/store.py` |
| ③~⑥ 생성기, 발행 캘린더, 성과 추적 | ⏳ Phase 5~6 |
| **Phase 1** MVP 20개교 목록·입학처 URL | ✅ `config/universities.yaml` (+ 확장 대상 23개교) |
| **Phase 1** 2027·2026 수시/정시 모집요강 80개 + 입결 4개 + 대교협 3개 다운로드 | ✅ `scrapers/download.py` → [docs/download_report.md](docs/download_report.md) |
| **Phase 1** 출처·robots·접속 상태 정리 | ✅ [docs/sources.md](docs/sources.md) |
| **Phase 1** 2027 환경 가정 + 출처 검증 | ✅ [docs/context.md](docs/context.md) |
| **Phase 1** DB 스키마(v2), 세그먼트 온보딩·맞춤 대시보드, 타임라인, 데이터 상태 화면 | ✅ `engine/` · `app/` |
| **Phase 2** 수능 최저 판정 엔진 (낙관/비관 등급 → 충족·경계·미충족, 결과를 가르는 영역) | ✅ `engine/minreq.py` |
| **Phase 2** 20개교 2027 수시 60개 전형: 최저·졸업생 자격·수능 후 고사·발표일 (검증 필요) | ✅ `data/parsed/susi_2027/` → [검토표](docs/susi_2027_review.md) |
| **Phase 2** 수시 대응 화면: 가채점 입력, 내 수시 6장 판정, 고사 캘린더·겹침 경고, 졸업생 자격 필터 | ✅ `app/susi_tab.py` |
| **Phase 3** 환산점수 엔진 (가중합·상수 환산·최고점 대비·등급표·가감점·과탐/수학 가산·A/B 택상) | ✅ `engine/conversion.py` |
| **Phase 3** 20개교 정시 반영식 50개 그룹 (요강식 / 근사식 / 비율만 구분, 검증 필요) | ✅ `data/parsed/jeongsi_2027/` → [검토표](docs/jeongsi_2027_review.md) |
| **Phase 3** 요강 계산 예시 재현 테스트 (서강·중앙·동국·홍익) | ✅ `tests/test_conversion.py` |
| **Phase 3** 정시 환산 화면 + 유리한 반영 구조(구조 적합도) | ✅ `app/jeongsi_tab.py` |
| **F10** 유형 ① 총정리·② 라이벌 비교 실데이터 생성 (경영: 연세·서강·성균관·한양) | ✅ `blog/real_data.py` · `samples/` |

## 실행

```bash
cd ipsi-2027
pip install -r requirements.txt
streamlit run app/streamlit_app.py      # 블로그 포스팅 탭 + 템플릿 구조 탭
python -m pytest -q tests                 # 테스트
python -m blog.build_sample               # samples/ 샘플 재생성
python -m blog.build_docs                 # docs/blog_templates.md 재생성
python -m scrapers.download               # 모집요강·입결 다운로드 (data/raw/, 약 270MB, git 제외)
python -m engine.db                       # data/app.db 생성·대학/출처 시드
python -m engine.susi_report              # docs/susi_2027_review.md (수시 데이터 검토표) 재생성
python -m engine.jeongsi_report           # docs/jeongsi_2027_review.md (정시 반영식 검토표) 재생성
```

## 샘플

- `samples/yonsei_business_jeongsi/` — 실데이터(2027 정시요강) "연세대 경영학과 정시 총정리"
- `samples/sogang_skku_hanyang_business_compare/` — 실데이터 "서강·성균관·한양 경영 비교"
- `samples/yonsei_business_jeongsi_dummy/` — 더미 데이터 샘플(발행 금지 표시)

각 폴더: `preview.html`(모바일 미리보기), `post_smarteditor.html`(붙여넣기용), `post.txt`, `images/`.
실데이터 샘플도 값 상태는 '검증 필요'이고, 전년도 입결은 출처 있는 자료가 없어 넣지 않았다.

## 폴더

```
blog/      models(출처 붙은 값) · templates · generator · render · charts · guardrails · store · dummy_data
engine/    schema.sql · db · segments(세그먼트→대시보드) · timeline(대교협 일정)
scrapers/  download (robots 확인·지연·sha256 로그)
config/    universities.yaml · sources_extra.yaml (공식 URL)
data/      download_log.csv (커밋) · raw/ · app.db (git 제외)
app/       Streamlit 앱 (온보딩·타임라인·데이터 상태·템플릿·블로그)
docs/      context.md · sources.md · download_report.md · blog_templates.md
tests/     pytest
samples/   생성 결과 예시
```

한글 폰트: NanumGothic → Noto Sans KR → 맑은 고딕 → AppleGothic → WenQuanYi Zen Hei 순으로 설치된 것을 사용.
