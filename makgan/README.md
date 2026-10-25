# 막간

뮤지컬·연극 공연, 배우, 혜택(로터리·할인·티켓오픈)을 한곳에서 보고 찜·팔로우·관극 후기로 내 관극을 기록하는 모바일 웹앱.

- 기획: [`SPEC.md`](SPEC.md)(1부, 재구성본) · [`SPEC-2.md`](SPEC-2.md)(2부, 충돌 시 우선)
- 스택: Next.js(App Router) + Supabase(Postgres·Auth·RLS)
- 이 폴더는 같은 저장소의 다른 앱과 달리 **GitHub Pages로 배포되지 않습니다**(서버 필요). Vercel 등에 배포합니다.

## 진행 상황
| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | 뼈대: Next.js·Supabase 연결, 스키마·RLS, [샘플] 시드, 5탭, KST 날짜 유틸 | ✅ |
| 2 | 매직링크 로그인, 첫 로그인 닉네임, 로그인 필요 안내, 로그아웃 | ✅ |
| 3 | 공연 목록(상태·정렬·극장·배우·기간 필터, 더 보기)·상세(날짜별/시즌 캐스팅, 평균 별점) | ✅ |
| 4 | 배우 목록·상세(출연작·배역), 팔로우(비로그인 → 로그인 후 복귀), 팔로잉 탭 | ✅ |
| 5 | 혜택 목록(종류·오늘 마감 필터, 마감 지난 혜택 숨김/보기), 마감 배지 3단계, 티켓오픈 시각, 공연 상세에 혜택 | ✅ |
| 6 | 찜(toggleWishlist): 목록·상세·출연작 카드 ♡, 비로그인 → 로그인 후 복귀, MY 찜 목록 | ✅ |
| 7 | 홈(getHome): 오늘 마감 3 + 곧 열리는 티켓 3 + 내 찜 공연(가로 스크롤), 빈 화면·비로그인 안내 | ✅ |
| 8 | 관극 후기 CRUD(공개/비공개, 본인만 수정·삭제), 공연 상세 후기, MY 탭(관극 기록·찜·팔로잉) | ✅ |
| 9 | 관리자(/admin: 공연·배우·극장·혜택·캐스팅, 서버에서 is_admin 재검증), 전체 검색(최근 검색어 5개) | ✅ |
| 10 | 공통 컴포넌트: BottomSheet(끌어서 닫기)·Toast(3초)·전역 오류/404, 모든 목록·상세에 Skeleton·EmptyState | ✅ |
| 11 | 영상(유튜브, 썸네일 먼저·누르면 재생), 공연·배우 상세 영상, 관리자 영상 등록 | ✅ |
| 12 | 극장 목록·상세(층 탭, 구역 카드 2열), 관리자 구역 관리, 좌석 후기 확장 스키마(0003) | ✅ |
| 13 | 좌석 후기 작성·조회·도움돼요, 구역 평균 막대, 열·시야 방해 필터, 관극 후기 연동 | ✅ |
| 14 | 통계 탭(연도별 횟수·지출·평균 별점·월별 차트·공연/배우 TOP3), 후기 그날 캐스트(구조화) | ✅ |
| 15 | 푸시 알림(혜택 마감 1시간 전·티켓오픈 10분 전·팔로우 배우 캐스팅·찜 종료 7일 전), 알림 설정·방해금지 묶음 발송, 크론 | ✅ |
| 16 | 용어 사전(초안→검수→공개, 가나다·검색·바텀시트), 관리자 혜택 폼 링크로 채우기(SSRF 방지) | ✅ |

## 폴더
```
app/                     화면(5탭: / · /shows · /benefits · /actors · /me, 검색 /search)
app/login, app/onboarding, app/auth/confirm   매직링크 로그인 · 닉네임 · 링크 도착 지점
components/              TabBar, PageHeader, ShowCard(가로)·ShowCardVertical(세로), BenefitCard, WishButton·FollowButton, ActorChip, Poster·Avatar(기본 이미지), EmptyState, ErrorState, Skeleton, LoginRequired, BottomSheet, Toast
lib/auth.ts              getUser · getProfile · requireProfile · safeNext
lib/admin.ts             requireAdmin(페이지) · adminClient(서버 액션)
lib/admin-entities.ts    관리자 폼 정의·검증(KST 시각 입력 → ISO)
lib/data/                조회 함수(listShows · getShow · getCast · listActors · getActor · listBenefits · getHome · 후기)
lib/actions/             서버 액션
lib/review-input.ts      후기 입력 검증(서버 액션·단위 테스트 공용)
lib/seat.ts              좌석 후기 검증·열 구간(앞열 1–5·A–E / 중간 6–12·F–L / 뒷열)
lib/stats.ts             시즌 통계 계산
lib/review-casts.ts      그날 캐스트 입력 검증
lib/link-fetch.ts · lib/link-meta.ts · lib/ssrf.ts   링크로 채우기(내부 주소 차단·5초·1MB·리다이렉트 3번)
lib/hangul.ts            가나다 묶음
lib/date.ts              KST 날짜·마감 표기("오늘 18:00 마감" 등)
lib/supabase/            브라우저/서버 클라이언트, proxy 세션 갱신, 환경 변수 확인
lib/push/                푸시 발송·크론(runAlerts)·방해금지 시간·브라우저 구독
public/sw.js             서비스 워커(푸시 표시, 알림 누르면 화면 열기)
proxy.ts                 요청마다 로그인 세션 쿠키 갱신(Next 16의 middleware)
supabase/migrations/     스키마 + RLS
supabase/seed.sql        [샘플] 데이터(실제 극장·공연·배우 아님)
supabase/tests/          로컬 auth 흉내(auth_stub.sql), RLS 테스트
scripts/test-db.sh       빈 Postgres에 마이그레이션·시드·RLS 테스트 적용
scripts/local-supabase.mjs  로컬 Supabase 대역(Postgres + PostgREST + 매직링크 가짜 Auth)
e2e/                     E2E(harness.mjs가 로컬 Supabase 대역 + next start로 실행) + 스크린샷
```

## 개발
```bash
cd makgan
npm install
cp .env.example .env.local   # Supabase 값 입력 (없어도 뼈대 화면은 뜸)
npm run dev                  # http://localhost:3000

npm test                     # 단위 테스트
npm run typecheck
npm run test:db              # 로컬 Postgres(또는 DATABASE_URL)에 스키마·RLS 테스트
npm run test:e2e             # 로컬 Supabase 대역으로 빌드 후 브라우저 테스트 (-- auth 처럼 일부만)
```

### Supabase 계정 없이 전체 기능 띄우기
PostgreSQL(16+)이 설치된 Linux/macOS에서:
```bash
npm run local:supabase       # 터미널 1: 빈 DB + [샘플] 시드. 출력된 두 줄을 .env.local에 붙여 넣기
npm run dev                  # 터미널 2
```
로그인 메일은 실제로 가지 않고 터미널 1에 `📧 매직링크 …`로 찍힙니다. 끌 때마다 DB는 사라집니다.

## 배포하기 (체크리스트)
약 20분. 계정 두 개(Supabase, Vercel)만 있으면 됩니다.

1. **Supabase**: [supabase.com](https://supabase.com)에서 새 프로젝트 → SQL Editor에 `supabase/setup.sql`을 통째로 붙여 넣고 실행
   (화면 확인용 [샘플] 데이터가 필요하면 `supabase/seed.sql`도 실행 — 실제 서비스 전엔 지우세요)
2. **로그인 메일**(선택): 무료 플랜의 기본 메일 발송은 템플릿을 바꿀 수 없어 기본 템플릿 그대로 써도 됩니다(링크는 로그인을 요청한 같은 브라우저에서 열어야 함). 직접 SMTP를 연결했거나 유료 플랜이면 Authentication → Emails의 **Magic Link**·**Confirm signup** 본문을 `supabase/templates/magic-link.html`로 바꾸면 다른 브라우저(메일 앱)에서 열어도 로그인돼요
3. **비밀값 만들기**: `cd makgan && npm install && npm run setup:env` → 출력된 줄을 메모
4. **Vercel**: [vercel.com/new](https://vercel.com/new)에서 이 저장소 가져오기 → **Root Directory를 `makgan`** 으로 → 3번의 환경 변수 입력
   (Supabase 값은 Project Settings → API의 URL·anon key·service_role key, `NEXT_PUBLIC_SITE_URL`은 배포 주소) → Deploy
5. **주소 맞추기**: Supabase Authentication → URL Configuration의 Site URL을 Vercel 배포 주소로
6. **관리자 지정**: 배포 주소에서 한 번 로그인한 뒤, 아래 "관리자 권한 주기"의 SQL 실행
7. **알림 크론**: Vercel Pro면 자동. Hobby면 GitHub 저장소 Settings → Secrets → Actions에 `MAKGAN_CRON_URL`(`https://배포주소/api/cron/send-alerts`)과 `MAKGAN_CRON_SECRET`(3번의 `CRON_SECRET`) 추가
8. **용어 사전 검수**: `/admin/glossary`에서 초안 10개를 확인하고 공개로 바꾸기

> `supabase/tests/auth_stub.sql`은 로컬 테스트 전용입니다. 실제 Supabase에는 실행하지 마세요.
> 마이그레이션을 고치면 `npm run db:bundle`로 `setup.sql`을 다시 만드세요(CI가 검사합니다).
> 아이콘(`public/icons`)은 `npm run icons`로 `app/icon.svg`에서 다시 만듭니다.

## 푸시 알림 켜기(15단계)
1. VAPID 키 만들기: `npx web-push generate-vapid-keys` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`(mailto:주소)
2. `SUPABASE_SERVICE_ROLE_KEY`(Supabase → Project Settings → API → service_role, **서버 환경 변수로만**)와 `CRON_SECRET`(임의의 긴 문자열)
3. 5분마다 `GET /api/cron/send-alerts`를 `Authorization: Bearer <CRON_SECRET>`로 호출
   - Vercel Pro: `vercel.json`의 Cron이 그대로 동작
   - Vercel Hobby(하루 1번 제한): 저장소 Secrets에 `MAKGAN_CRON_URL`·`MAKGAN_CRON_SECRET`을 넣으면 `.github/workflows/makgan-cron.yml`이 5분마다 호출
4. 아이폰·아이패드는 **홈 화면에 추가한 앱**에서만 알림이 와요(설정 화면에 안내가 나옵니다)

알림 권한은 사용자가 "알림 받기"를 처음 누를 때만 요청합니다. 방해금지 시간(기본 23:00~08:00)에 생긴 알림은 끝나는 시각 뒤 첫 발송 때 한 번에 묶어서 보냅니다.

## 용어 사전 검수(16단계)
`0006_glossary.sql`에 Claude가 쓴 용어 10개(커튼콜·막공·첫공·회전문·로티·선예매·오픈런·취켓팅·블록·시야방해석)의 뜻 **초안**이 들어 있습니다. 초안은 관리자에게만 보입니다. `/admin/glossary`에서 뜻을 고친 뒤 상태를 '공개'로 바꾸면 `/glossary`에 나타납니다. 특히 '오픈런'은 뜻이 둘이라 꼭 확인해 주세요.

## 관리자 권한 주기
관리자는 화면에서 만들 수 없고 DB에서 직접 지정합니다(사용자는 `is_admin`을 바꿀 수 없게 막혀 있음).
SQL Editor에서:
```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = '관리자@이메일');
```

## 데이터 원칙
- 실제 극장 좌석 배치, 실제 배우·공연 정보를 임의로 만들지 않습니다. 시드·예시 데이터에는 **[샘플]** 을 붙입니다.
