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
- [x] **2단계** — 시험 모드(타이머, OMR 답안지, 스와이프, 별표, 제출 확인), 채점 요약, 이어 풀기
- [x] **3단계** — 해설 모드(보기별 해설·조문·판례 확인 배지, 틀린 문항만 필터), IndexedDB(Dexie) 저장, 최근 기록
- [x] **4단계** — 오답노트(별표·메모, 1·3·7일 간격 반복), 통계, 홈 요약(연속 학습일·오늘 복습·약점 단원 Top3)
- [x] **5단계** — 설정(글자 크기·시험시간·해설 즉시 보기=연습 모드), JSON 백업/복원
- [ ] 6단계 — `validate-questions` 스크립트, 아이패드 Safari 테스트 체크리스트
- [ ] 7단계 — 세트별 40문항 콘텐츠 작성·검수

## 시험 모드 사용법

- 홈 → **실전 시작**. 제한시간은 `config/exam.json`의 40분을 40문항 기준으로 두고 세트 문항 수에 비례해 정한다(시드 5문항 = 5분).
- 타이머를 탭하면 숨김/표시. 남은 시간이 5분(짧은 세트는 제한시간의 10%) 이하면 빨간색. 0이 되면 자동 제출.
- 문제 이동: 시험지를 **좌우로 스와이프**, 아래 이전/다음 버튼, 답안지 번호 탭, 키보드 ←/→.
- 보기를 탭하면 마킹, 같은 보기를 다시 탭하면 해제(키보드 1~5).
- **답안지**: 가로 화면은 오른쪽에 고정, 세로 화면은 상단 '답안지' 버튼으로 연다. 마킹한 칸은 칠해지고 고른 번호가 보이며 별표 문항엔 ★.
- **제출** → 미응답·별표 문항 목록 확인(번호를 탭하면 그 문항으로 이동) → 채점 결과(점수, 단원별 정답률, 문항별 O/X).
- 결과 화면에서 **전체 해설** / **틀린 문항 해설**, 또는 문항별 O/X 칸을 탭해 해설로 간다. 해설은 핵심 요약 → 보기별 해설(정답·내 답 표시) → 근거 조문 → 판례(`verified: false`면 '판례 확인 필요').
- 해설 화면에서도 스와이프·←/→로 이동, 상단 **틀린 문항만** 토글, 세로 화면은 '문항 목록'으로 채점표를 연다.
- 제출 기록은 기기의 IndexedDB에 저장되고 홈 **최근 기록**에서 다시 열 수 있다. 문항별 풀이시간도 함께 저장된다(4단계 통계용).
- 풀던 내용은 기기에 바로 저장된다. 앱을 닫거나 '나가기' 후에도 홈에서 **이어 풀기**. 시간은 실제 시각 기준으로 계속 흐른다.

## 오답노트 · 통계

- 실전에서 틀리거나 비운 문항은 자동으로 **오답노트**에 들어가고 **다음 날** 복습 대상이 된다.
- 복습에서 맞히면 3일 뒤 → 다시 맞히면 7일 뒤 → 또 맞히면 **졸업**. 중간에 틀리면 다시 1일 뒤부터. 실전에서 또 틀려도 1일 뒤로 돌아간다.
- 복습일 전에 '풀기'로 미리 풀어 맞혀도 일정은 그대로(틀리면 1일 뒤로 리셋).
- 복습은 한 문항씩: 보기를 고르면 바로 채점·해설.
- 각 문항에 **별표**와 **메모**. 필터: 오늘 복습 / 진행 중 / 별표 / 졸업.
- **통계**(실전 제출 기록 기준): 연속 학습일, 평균 점수, 문항당 풀이시간, 오답노트 현황·복습 정답률, 점수 추이, 단원별·유형별 누적 정답률(+평균 풀이시간), 회차별 기록.
- 홈: 연속 학습일(실전 제출 또는 복습한 날), 오늘 복습 문항 수, 약점 단원 Top3(단원별 3문항 이상 풀었을 때).

## 설정 · 백업

- 홈 우측 상단 **설정**.
- **시험지 글자 크기**: 작게 15 / 보통 17 / 크게 19px.
- **시험시간**: 40문항 기준 10~150분(5분 단위, 기본은 `config/exam.json`). 다른 문항 수 세트는 비례. 진행 중인 시험에는 적용 안 됨.
- **해설 즉시 보기(연습 모드)**: 켜면 세트를 연습 모드로 시작 — 시간 제한 없이 경과 시간만 표시, 보기를 고르면 바로 정답/오답과 보기별 해설(답 변경 불가). 끝나면 제출해 결과 저장. 연습 결과도 오답노트·연속 학습일에는 반영되지만 **통계(점수·정답률)·약점 단원은 실전만** 집계.
- **백업 파일 만들기**: 모든 기록(시험 기록, 문항 결과, 오답노트·메모, 복습 기록, 진행 중 시험, 설정)을 `civil-exam-backup-YYYYMMDD-HHMM.json`으로. 아이패드에서는 공유 시트 → '파일에 저장'.
- **백업에서 복원**: 파일을 고르면 내용 요약과 함께 확인 → 현재 기기 기록을 **전부 백업 내용으로 교체**(한 트랜잭션이라 실패하면 기존 기록 유지). 다른 앱 파일·손상된 파일은 거부.
- 앱 시작 시 저장공간 보호(`navigator.storage.persist`)를 요청한다. 설정 화면에서 상태 확인.

## 폴더 구조

```
config/exam.json          시험 포맷 가정치 (Q-Net 공고로 확인 후 수정, scopeVerified)
config/blueprint.json     40문항 단원·쟁점 배분
src/data/sets/*.json      문항 세트 (Question[]; 빌드에 포함되어 오프라인 동작)
src/types.ts              Question 스키마
src/components/QuestionView.tsx  시험지 조판 컴포넌트
src/components/OmrPanel.tsx      답안지(번호 격자)
src/components/SubmitDialog.tsx  제출 확인 모달
src/screens/                     Home / Exam / Result 화면
src/lib/attempt.ts        응시 상태·채점·문항별 시간 누적
src/lib/db.ts             IndexedDB(Dexie) v3: attempts / results(응시×문항) / drafts / notes(오답노트) / reviews(복습 기록) / settings
src/lib/srs.ts            간격 반복(1·3·7일) 규칙
src/lib/settings.ts       설정(글자 크기·시험시간·연습 모드) — DB v3 settings 테이블
src/lib/backup.ts         JSON 백업 내보내기·검증·복원
src/lib/stats.ts          단원·유형별 정답률, 약점 단원, 연속 학습일
src/lib/records.ts        제출 → 저장용 기록 변환
src/components/ExplanationView.tsx  보기별 해설
src/screens/ReviewScreen.tsx        해설 모드
src/screens/NotesScreen.tsx         오답노트
src/screens/PracticeScreen.tsx      오답 다시 풀기
src/screens/StatsScreen.tsx         통계
src/screens/SettingsScreen.tsx      설정·백업/복원
src/components/Charts.tsx           정답률 막대, 점수 추이
src/hooks/                useCountdown(절대 시각 기준 타이머), useSwipe
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
