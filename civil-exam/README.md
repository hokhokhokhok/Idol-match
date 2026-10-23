# 민법 모의고사 (감정평가사 1차) — 오프라인 PWA

아이패드에서 매일 민법 모의고사를 실제 시험지 조판(바탕/명조, ①~⑤, <보 기> 박스)으로 풀고
해설·오답노트·약점 통계를 보는 앱. 계정·서버 없이 기기(IndexedDB)에만 저장한다.

> 같은 저장소 루트의 '아이돌 매칭 맵'과는 별개 앱이다. 이 폴더(`civil-exam/`)만으로 빌드된다.

## 실행

```bash
cd civil-exam
npm install
npm run dev        # 개발 서버
npm test           # 단위 테스트(vitest)
npm run build      # 타입검사 + 프로덕션 빌드(dist/, 서비스워커 포함)
npm run preview    # 빌드 결과 확인 (아이패드에서는 같은 Wi-Fi로 접속: npm run preview -- --host)
```

하위 경로에 배포할 때는 `BASE=/저장소명/경로/ npm run build`.

## 구현 단계

- [x] **1단계** — Vite+React+TS+PWA, 폰트 번들, 시험지 컴포넌트 `QuestionView`, 시드 5문항 미리보기
- [ ] 2단계 — 시험 모드(타이머, OMR 패널, 스와이프, 별표, 제출 모달)
- [ ] 3단계 — 채점·해설(보기별 해설, 오답 필터), IndexedDB(Dexie) 저장
- [ ] 4단계 — 오답노트 + 간격 반복(1·3·7일), 통계
- [ ] 5단계 — 설정(글자 크기·시간·연습 모드), JSON 백업/복원
- [ ] 6단계 — `validate-questions` 스크립트, 아이패드 Safari 테스트 체크리스트
- [ ] 7단계 — 세트별 40문항 콘텐츠 작성·검수

## 폴더 구조

```
config/exam.json          시험 포맷 가정치 (Q-Net 공고로 확인 후 수정, scopeVerified)
config/blueprint.json     40문항 단원·쟁점 배분
src/data/sets/*.json      문항 세트 (Question[]; 빌드에 포함되어 오프라인 동작)
src/types.ts              Question 스키마
src/components/QuestionView.tsx  시험지 조판 컴포넌트
src/lib/inline.ts         **굵게**, <u>밑줄</u> 파서 (HTML 직접 주입 없음)
src/styles/               fonts / tokens / question(시험지) / app
public/fonts/LICENSE      번들 폰트 라이선스(OFL)
local-only/               (gitignore) 개인 보유 기출 PDF — 쟁점 추출 참고용, 앱에 포함 금지
```

## 시험지 조판

- 본문: KoPubWorld바탕(기기에 설치돼 있으면 사용) → **나눔명조(번들)** → Noto Serif KR
- UI·해설: **Pretendard(번들)** → Noto Sans KR
- 본문 15/17/19px(기본 17), 줄간격 1.75, 자간 -0.01em, `justify` + `keep-all`, 지면 #FFFEFA / 글자 #111
- 보기 왼쪽 여백의 작은 버튼을 탭하면 **밑줄 → X(제외) → 없음** 순으로 표시가 바뀐다 (Apple Pencil 탭으로도 동작)
- `reviewed: false` 문항은 우측 상단에 '미검수' 표시

## 문항 정책

기출·학원·공단 문항을 옮기지 않고 출제 경향만 반영한 창작 문항(`source: "original"`)을 쓴다.
판례는 `verified: false`로 시작해 대법원 종합법률정보에서 확인한 뒤 `true`로 바꾼다.
시드 5문항은 AI 작성분이므로 조문·판례·복수정답 여부를 직접 검수해야 한다.
