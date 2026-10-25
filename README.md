# 아이돌 매칭 맵

내 MBTI(4축 토글)를 고르면 K팝 100그룹 멤버와의 궁합 점수를 계산해 **방사형 지도 · 찰떡 TOP 10 · 그룹 궁합 순위**로 보여 주는 재미용 PWA입니다. 홈 화면에 추가하면 앱처럼 전체화면으로 열리고, 오프라인에서도 실행됩니다.

**배포 URL:** https://hokhokhokhok.github.io/Idol-match/  (GitHub Pages, 저장소 hokhokhokhok/Idol-match)

> 같은 저장소의 별도 앱: [`civil-exam/`](civil-exam/README.md) 감정평가사 1차 모의고사 — 민법·경제학원론·부동산학원론·감정평가관계법규 (`/Idol-match/civil-exam/`), [`jomun/`](jomun/README.md) 감정평가 및 보상법규 조문 암기 트레이너 (`/Idol-match/jomun/`), [`makgan/`](makgan/README.md) 막간 — 뮤지컬·연극 공연·혜택·관극 기록 앱 (Next.js + Supabase, Pages 미배포), [`magok-academy/`](magok-academy/README.md) 마곡 뮤지컬 학원 찾기 — 초·중등 학원·강사 경력 비교 (Next.js 정적 내보내기, `/Idol-match/magok-academy/`)

## 아이패드 설치법

1. **사파리**로 배포 URL 열기 (크롬 등 다른 브라우저에서는 홈 화면 앱으로 설치되지 않음)
2. 주소창 옆 **공유** 버튼(□↑) 누르기
3. **홈 화면에 추가** → 추가
4. 홈 화면의 '매칭맵' 아이콘으로 열면 전체화면 앱으로 실행됩니다. 한 번 열어 둔 뒤에는 비행기 모드에서도 열립니다.

아이폰도 같은 방법입니다. 안드로이드 크롬에서는 메뉴 → '홈 화면에 추가' 또는 '앱 설치'.

## 기능

- MBTI 4축 토글 → 지도 · TOP 10 · 그룹 순위가 즉시 갱신 (선택값은 기기에 저장)
- 보이그룹/걸그룹/그룹별 필터, 팬 집계 MBTI 포함 여부 토글
- **결과 카드 저장**: 내 MBTI + TOP 3를 1080×1920 PNG(인스타 스토리 크기)로 저장. iPad/iPhone에서는 공유 시트가 열리므로 '이미지 저장'을 고르면 됩니다.
- **한국어 / English** 전환 (영어 모드에서는 그룹 영문명 사용. 멤버 이름은 데이터에 영문 표기가 없어 한글 그대로)
- 미공개 멤버를 눌러 직접 MBTI 입력 → 이 기기에서만 지도에 추가, 새로고침 후에도 유지 (`localStorage` 키 `im_custom`)
- 직접 넣은 MBTI를 **JSON으로 내보내기/가져오기** (다른 기기로 옮길 때)

## 폴더 구조

```
index.html             UI·로직 (데이터는 fetch로 불러옴)
js/score.js            궁합 계산(score, why, 유형 별명) — 브라우저·Node 테스트 공용
data/idols.json        100그룹 멤버 데이터
manifest.webmanifest   PWA 매니페스트
sw.js                  서비스 워커 (앱 셸 cache-first, 데이터 stale-while-revalidate, 폰트 런타임 캐시)
icons/                 icon-192, icon-512, apple-touch-icon(180)
scripts/make-icons.mjs 아이콘 생성 (SVG → sharp)
scripts/screenshots.mjs Playwright E2E + 스크린샷
scripts/build-www.mjs  배포·Capacitor용 www/ 복사
test/score.test.js     score() 단위 테스트
```

## 데이터 규칙

- 멤버 MBTI 출처 `s`: `v` = 본인 공개(기사로 확인), `f` = 팬 집계, 공란 = 미공개. **근거 없이 값을 채우지 않습니다.**
- 아이돌 사진·로고는 넣지 않습니다(초상권·상표권).
- 데이터를 고친 뒤 배포할 때는 `sw.js`의 `VERSION`을 올리면 설치된 앱도 새 파일을 받습니다. (`idols.json`은 stale-while-revalidate라 VERSION을 안 올려도 다음 실행부터 반영됨)

## 개발

```bash
npm install
npm run serve        # http://localhost:4173/
npm test             # score() 단위 테스트
npm run test:e2e     # 아이패드(1024×1366)·아이폰(390×844) 스크린샷 → screenshots/, 콘솔 에러·오프라인 등 검사
npm run icons        # 아이콘 다시 만들기
```

## 배포 (GitHub Pages)

1. GitHub에 `idol-match` 저장소를 만들고 이 폴더를 `main` 브랜치로 푸시
2. 저장소 **Settings → Pages → Source: GitHub Actions** 선택
3. `.github/workflows/pages.yml`이 테스트 후 `www/`를 배포합니다. 완료되면 Actions 화면에 URL이 나옵니다 → 위 '배포 URL'에 기록

모든 경로가 상대 경로라 `/idol-match/` 같은 하위 경로에서도 그대로 동작합니다. Vercel을 쓰려면 Output Directory를 `www`, Build Command를 `node scripts/build-www.mjs`로 설정하세요.

## 앱스토어용 빌드 (선택, Capacitor)

`capacitor.config.json`은 준비돼 있습니다(appId `com.youknow.idolmatch`). node_modules가 앱에 들어가지 않도록 `--web-dir .` 대신 `www/`를 씁니다.

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npm run build            # www/ 생성
npx cap add android      # Android Studio로 열어 Build > Build APK(s) / AAB
npx cap add ios          # 맥 + Xcode + Apple 개발자 계정 필요 → Xcode에서 Archive
npm run cap:sync         # 웹 파일을 고친 뒤 네이티브 프로젝트에 반영
```

APK는 안드로이드 전용이며 아이패드에서는 실행되지 않습니다. 아이패드에는 위의 '홈 화면에 추가'(PWA) 또는 App Store 배포를 쓰세요.

## 궁합 점수

S/N 일치 26점(불일치 6) · E/I 보완 18점(같으면 10) · T/F 일치 16점(불일치 10) · J/P 보완 15점(같으면 10) · 국내 '찰떡' 조합 +14 · 같은 유형 +3. 범위 36~89점. 재미용 지표이며 실제 성격이나 관계를 판단하는 근거가 아닙니다.
