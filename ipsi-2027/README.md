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
| 성과 추적·제목 추천 고도화 | ⏳ Phase 6 이후 |
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
| **Phase 4** 동국대 공식 입결 파서(2024·2026, 107행, 계열 가중 평균 재현 검증) | ✅ `scrapers/parse_dongguk_results.py` |
| **Phase 4** 합격 가능성 엔진: 환경 보정(조절 가능)·안정/적정/소신/위험·영어 경고·조합 위험 | ✅ `engine/admission.py` → [방법](docs/admission_method.md) |
| **Phase 4** 합격 가능성 탭(입결 CSV 가져오기·모의지원 교차검증 칸), 대시보드 카드 실시간 요약 | ✅ `app/admission_tab.py` · `app/dashboard.py` |
| **Phase 5** 인사이트 모듈: 시드 10건(출처·근거 수준), 신뢰도 순 피드, 주제별 기관 나란히 보기, 직접 추가, 유튜브 자막 추출 요약 | ✅ `insights/` · `app/insights_tab.py` |
| **Phase 5** 수시 납치 판단(선호 순위 × 정시 예상) · 수시 결과별 정시 시나리오 | ✅ `engine/kidnap.py` (수시 대응 탭) |
| **Phase 5** 블로그 유형 ③ 수시vs정시 · ④ 시점형 속보 · ⑤ 세그먼트형 · ⑥ 2027 변화 해설, 발행 캘린더 | ✅ `blog/generator.py` · `blog/calendar.py` |
| **Phase 6** 공지 반영: 수시 이월 인원·대학별 탐구 변환표준점수표·수능 최고점(출처 필수) → 환산·판정·블로그 자동 반영 | ✅ `engine/updates.py` · `app/updates_tab.py` |
| **Phase 6** 가/나/다 조합 추천: 세그먼트 프리셋, 전부 불합격 확률·기대 선호도, 반수생 필터, 2028 경고 | ✅ `engine/combo.py` · `app/combo_tab.py` |
| **Phase 6** 재도전 판단(N수·반수 전용): 결과 범위·목표, 본인 점수 추이, 2028 변화, 선택지별 체크리스트 | ✅ `engine/retake.py` · `app/retake_tab.py` |
| **F10** 유형 ① 총정리·② 라이벌 비교 실데이터 생성 (경영: 연세·서강·성균관·한양) | ✅ `blog/real_data.py` · `samples/` |

## 바로 쓰기 (설치 없음)

**https://hokhokhokhok.github.io/Idol-match/ipsi/** — 계산기(HTML판): 수시 최저·정시 환산·합격 가능성·조합·수시 납치·일정·인사이트. 바로 열림
**https://hokhokhokhok.github.io/Idol-match/ipsi/full/** — 전체 앱(아래 stlite판, 블로그 생성·공지 반영 포함)

- HTML판: `python web/html/build_html.py <출력.html>` (계산 로직 `web/html/logic.js`는 `engine/`을 JS로 옮긴 것, 요강 계산 예시로 검증)

- 브라우저 안에서 Python이 돌아가는 stlite(Streamlit WebAssembly판)로 배포 — 서버 없음
- 처음 열 때 실행 환경을 내려받느라 30초~1분 걸림 (이후 캐시)
- 입력한 성적·지원 목록·직접 추가 인사이트는 **이 브라우저의 IndexedDB에만 저장**되고 서버로 전송되지 않음 (다른 기기·브라우저와 공유 안 됨, 브라우저 데이터 삭제 시 사라짐)
- 빌드: `python web/build_web.py <출력폴더>` → `index.html` + `ipsi-app.zip`. `main`에 머지되면 `.github/workflows/pages.yml`이 테스트 후 자동 배포
- 브라우저판에서 안 되는 것: 모집요강 다운로드(`scrapers/`), 유튜브 자막 자동 요약(직접 요약 입력은 됨)

## 실행 (PC)

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
python -m scrapers.parse_dongguk_results  # 동국대 입결 PDF → data/parsed/results/dongguk.csv
```

## 샘플

- `samples/yonsei_business_jeongsi/` — 실데이터(2027 정시요강) "연세대 경영학과 정시 총정리"
- `samples/sogang_skku_hanyang_business_compare/` — 실데이터 "서강·성균관·한양 경영 비교"
- `samples/yonsei_business_susi_vs_jeongsi/` · `..._timely_csat/` · `..._segment_nsu/` · `..._change_nsu/` — 유형 ③~⑥
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
