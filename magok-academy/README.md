# 마곡 뮤지컬 학원 찾기

서울 강서구 마곡동 주변 초·중등 대상 뮤지컬 관련 학원(보컬·댄스·연기·뮤지컬 종합)을 비교하고, 원장·강사의 경력을 **출처와 수집일**과 함께 확인하는 모바일 우선 웹앱.

> 현재 데이터는 전부 **가상의 예시**입니다. 실제 학원 후보는 [docs/candidates.md](docs/candidates.md)에 미확인 상태로만 있습니다.

## 개발

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # CSV 파서·스키마 검증·데이터셋 단위 테스트
npm run check:data   # data/*.csv 검사 (오류 있으면 종료 코드 1)
npm run typecheck
npm run build
```

## 구조

```
app/                   Next.js App Router 화면 (현재: 홈 단순 목록)
components/            공용 UI
lib/types.ts           데이터 모델 (Academy · Person · CareerItem) + 허용값·라벨
lib/csv.ts             RFC 4180 CSV 파서, 세미콜론 배열
lib/schema.ts          CSV 행 → 레코드, 데이터 원칙 검증 (error=행 제외 / warning=점검)
lib/dataset.ts         세 파일 묶기 + 참조 무결성·중복·6개월 재확인 검사
lib/repository.ts      화면이 쓰는 AcademyRepository 인터페이스 (지금 CSV, 이후 Supabase)
data/*.csv             원본 데이터 (academies → people → career_items)
scripts/check-data.ts  CSV 검사 CLI
docs/                  조사 체크리스트, 후보 목록
```

## 데이터 흐름

`data/*.csv` → 빌드/서버 렌더 시 `lib/dataset.ts`가 읽고 검증 → `AcademyRepository` → 화면.
DB 없이 CSV가 원본이라 Vercel 정적 생성으로 충분하고, Supabase로 옮길 때는 `AcademyRepository` 구현만 바꿉니다(테이블 컬럼은 `lib/types.ts`와 동일).

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
템플릿 그대로 읽습니다(세미콜론 배열, 빈 값 허용). `academies.csv` 끝에 **필터용 선택 컬럼** 3개를 추가했으며, 없거나 비어 있으면 해당 필터에서 "정보 없음"으로 처리됩니다.

| 컬럼 | 예 | 용도 |
|---|---|---|
| `tuition_monthly_min` / `tuition_monthly_max` | `120000` / `160000` | 수강료 구간 필터 (원, 확인된 금액만) |
| `schedule_slots` | `화 16:00-18:00;토 10:00-12:00` | 요일·시간대 필터 |

`tuition_note`·`schedule_note`는 사람이 읽는 원문으로 그대로 둡니다.

## 작업 순서
1. ✅ 프로젝트 초기화, 스키마, 샘플 시드 5건(가상)
2. 목록 + 필터 화면
3. 지도 연동
4. 학원 상세 + 강사 카드
5. 비교·즐겨찾기
6. CSV 임포트 스크립트
7. 배포
