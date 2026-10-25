# 마곡 뮤지컬 학원 찾기

서울 강서구 마곡·화곡·발산·가양·등촌·방화 초·중등 대상 예체능 학원(보컬·댄스·발레·탭댄스·아크로바틱·체조·연기·뮤지컬 종합)을 비교하고, 원장·강사의 경력을 **출처와 수집일**과 함께 확인하는 모바일 우선 웹앱.

**배포 URL:** https://hokhokhokhok.github.io/Idol-match/magok-academy/ (main에 머지되면 GitHub Pages로 배포)

> `data/`에는 1차 조사로 찾은 실제 학원(전부 `미확인`)이 들어 있습니다. 조사 기록은 [docs/candidates.md](docs/candidates.md).
> 테스트와 화면 점검용 가상 예시는 `data/sample/`에 따로 있습니다(`DATA_DIR=data/sample`).

## 화면
| 화면 | 경로 | 내용 |
|---|---|---|
| 찾기 | `/` | 분야 칩(보컬·댄스·발레·탭댄스·아크로바틱·체조·연기·뮤지컬 종합) + 필터(동네·학년·월 수강료·요일·시간대·즐겨찾기만), 목록/지도 토글. 필터는 URL에 남아 링크로 공유 가능 |
| 학원 상세 | `/academy/A001/` | 요약 → 원장·강사 카드(경력 유형별, 출처·수집일·공연 DB 확인 배지) → 수업·공연 이력 → 출처·정정 요청 |
| 비교 | `/compare/` | 담은 학원 2~3곳을 항목별로 나란히 (원장·강사 경력 요약 포함) |
| 데이터 안내 | `/about/` | 수집 기준, 배지 읽는 법, 정정·삭제 요청 방법 |

즐겨찾기·비교 목록은 이 기기 localStorage에만 저장합니다(로그인 없음).
수강료·시간 필터를 켜면 그 정보가 없는 학원은 빠지고, "수강료 미확인 n곳 제외"처럼 따로 알려 줍니다(추측해서 넣지 않음).

## 개발

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # CSV 파서·스키마 검증·데이터셋 단위 테스트
npm run check:data   # data/*.csv 검사 (오류 있으면 종료 코드 1)
KOPIS_API_KEY=<키> npm run kopis:check   # 뮤지컬 경력을 KOPIS 공연 DB 출연진·제작진과 대조 (프록시 환경이면 NODE_USE_ENV_PROXY=1)
npm run typecheck
npm run build        # 정적 HTML → out/
npm run test:e2e     # 가상 예시로 빌드한 out/를 띄워 필터·지도·즐겨찾기·비교·상세 흐름 검사, 360·390px 스크린샷 → screenshots/
```

환경 변수는 `.env.example` 참고 (`.env.local`에 넣기):
- `NEXT_PUBLIC_CORRECTION_URL` — 정정·삭제 요청 창구(구글폼, `mailto:` 등). 없으면 이 저장소의 GitHub 이슈(학원 이름이 제목에 미리 채워짐)

## 데이터 넣기 (CSV 임포트)

구글시트나 엑셀에서 세 시트를 `academies.csv`, `people.csv`, `career_items.csv`로 내보내 한 폴더에 둔 뒤:

```bash
npm run import -- ~/Downloads/magok          # 검사만 (dry run)
npm run import -- ~/Downloads/magok --write  # 오류 0건이면 data/*.csv를 교체 (정규화된 형식으로)
npm run import -- ~/Downloads/magok --json out.json   # Supabase 적재용 JSON도 저장
```

오류가 한 건이라도 있으면 아무것도 쓰지 않습니다. 반영 후 `git diff data/`로 확인하고 커밋하면 main 머지 시 배포됩니다.

## 구조

```
app/                   Next.js App Router 화면 (찾기·상세·비교·안내)
components/            UI (HomeView, AcademyMap, AcademyCard, PersonCard, CompareView …)
lib/filters.ts         필터 로직·URL 쿼리 변환
lib/compare.ts         비교용 경력 요약
lib/format.ts          금액·연도 표기, 6개월 재확인 판정
lib/useStoredIds.ts    즐겨찾기·비교 (localStorage)
lib/serialize.ts       레코드 → 정규화 CSV (임포트용)
lib/types.ts           데이터 모델 (Academy · Person · CareerItem) + 허용값·라벨
lib/csv.ts             RFC 4180 CSV 파서, 세미콜론 배열
lib/schema.ts          CSV 행 → 레코드, 데이터 원칙 검증 (error=행 제외 / warning=점검)
lib/dataset.ts         세 파일 묶기 + 참조 무결성·중복·6개월 재확인 검사
lib/repository.ts      화면이 쓰는 AcademyRepository 인터페이스 (지금 CSV, 이후 Supabase)
data/*.csv             실제 데이터 (academies → people → career_items)
data/sample/*.csv      가상 예시 (테스트·e2e용)
scripts/check-data.ts  CSV 검사 CLI
scripts/import-csv.ts  CSV 임포트 CLI
scripts/e2e.mjs        Playwright 흐름 검사
docs/                  조사 체크리스트, 후보 목록
```

## 데이터 흐름

`data/*.csv` → 빌드 시 `lib/dataset.ts`가 읽고 검증 → `AcademyRepository` → 정적 HTML(`output: "export"`).
DB 없이 CSV가 원본이라 정적 배포로 충분하고(GitHub Pages, Vercel 어디든), Supabase로 옮길 때는 `AcademyRepository` 구현만 바꿉니다(테이블 컬럼은 `lib/types.ts`와 동일).

### 검증 규칙 (요약)
| 규칙 | 수준 |
|---|---|
| 분야·학년·역할·경력 유형·출처 유형이 허용값 밖 | 오류 |
| 경력에 `source_url`·`collected_at` 없음 | 오류 |
| 인물에 `disclosure_basis`(공개 근거) 없음 | 오류 |
| `verified=TRUE`인데 `musical_performance`가 아님 | 오류 |
| `verified=TRUE`인데 출처가 KOPIS가 아님 | 경고 |
| `verification_status=확인됨`인데 `last_verified_at` 없음 | 오류 |
| 없는 학원·인물 id 참조, 중복 id | 오류 |
| 이름+주소 중복, 서울 범위 밖 좌표, 확인일 6개월 경과 | 경고 |

### CSV 형식
템플릿 그대로 읽습니다(세미콜론 배열, 빈 값 허용). `academies.csv` 끝에 **선택 컬럼** 4개를 추가했으며, 없거나 비어 있으면 해당 필터에서 "정보 없음"으로 처리됩니다.

| 컬럼 | 예 | 용도 |
|---|---|---|
| `tuition_monthly_min` / `tuition_monthly_max` | `120000` / `160000` | 수강료 구간 필터 (원, 확인된 금액만) |
| `schedule_slots` | `화 16:00-18:00;토 10:00-12:00` | 요일·시간대 필터 |
| `source_urls` | `https://…;https://…` | 학원 정보를 확인한 출처 (상세 화면 맨 아래에 표시) |

`tuition_note`·`schedule_note`는 사람이 읽는 원문으로 그대로 둡니다.

## 배포

`.github/workflows/pages.yml`이 main 푸시 때 `BASE_PATH=/Idol-match/magok-academy`로 빌드해 기존 Pages 사이트 하위 경로에 올립니다.
- 정정 요청 창구(선택): 저장소 Settings → Secrets and variables → Actions → **Variables**에 `MAGOK_CORRECTION_URL`
- 루트 `sw.js`(아이돌 매칭 앱 서비스워커)는 `/magok-academy/` 경로를 건드리지 않습니다.

Vercel로 옮기려면 Root Directory를 `magok-academy`로 지정하고 `BASE_PATH` 없이 빌드하면 됩니다.

## 작업 순서
1. ✅ 프로젝트 초기화, 스키마, 샘플 시드 5건(가상)
2. ✅ 목록 + 필터 화면
3. ✅ 지도 연동 (OpenStreetMap + Leaflet, API 키 불필요)
4. ✅ 학원 상세 + 강사 카드
5. ✅ 비교·즐겨찾기
6. ✅ CSV 임포트 스크립트
7. ✅ 배포 (GitHub Pages, main 머지 시)

## 남은 결정
- 정정 요청 창구: 지금은 GitHub 이슈(계정 필요) — 학부모·학원용으로는 구글폼이나 이메일이 나음
- 인접 지역(가양·발산·등촌·방화) 확장 — [docs/candidates.md](docs/candidates.md)

## 지도
OpenStreetMap 타일을 Leaflet으로 띄웁니다. **API 키나 가입이 필요 없습니다.** 화면 오른쪽 아래에 OSM 출처 표기가 붙습니다(이용 조건).
방문자가 많아져 OSM 공용 타일 이용 정책에 걸릴 정도가 되면 `components/AcademyMap.tsx`의 타일 주소만 다른 제공자로 바꾸면 됩니다.
