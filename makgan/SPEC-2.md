# 막간 — 상세 기획서 2부 (MVP 보강 + 2차 기능)

> `SPEC.md`(1부)와 함께 프로젝트 루트에 `SPEC-2.md`로 저장하세요. 1부와 충돌하면 이 문서가 우선합니다.

---

## A. MVP 보강: 화면 상태·문구·컴포넌트

### A-1. 공통 컴포넌트 (`components/`)
| 컴포넌트 | 용도 | 비고 |
|---|---|---|
| `TabBar` | 하단 5탭 | 활성 탭 버건디, 라벨 11px |
| `PageHeader` | 상단 제목+우측 액션 | 스크롤 시 하단 그림자 |
| `ShowCard` | 포스터+제목+극장+기간+♡ | 가로형(목록), 세로형(가로스크롤) 2종 |
| `ActorChip` | 원형 사진+이름 | 팔로우 상태 표시 |
| `BenefitCard` | 혜택 카드 | 마감 배지 3단계(오늘/3일 이내/일반) |
| `RatingStars` | 별점 입력/표시 | 반쪽 별 없음, 1~5 |
| `BottomSheet` | 필터, 선택기 | 드래그로 닫기 |
| `EmptyState` | 빈 화면 | 일러스트 없이 아이콘+문구+버튼 1개 |
| `Skeleton` | 로딩 | 카드 모양 회색 블록 |
| `Toast` | 저장/삭제 알림 | 하단 탭 위 3초 |
| `YouTubeEmbed` | 영상 | 썸네일 먼저, 탭하면 재생(lazy) |

### A-2. 빈 화면·오류 문구
| 상황 | 문구 | 버튼 |
|---|---|---|
| 찜 공연 없음 | 아직 찜한 공연이 없어요 | 공연 둘러보기 |
| 오늘 마감 없음 | 오늘 마감되는 혜택은 없어요 | 전체 혜택 보기 |
| 후기 없음 | 첫 후기를 남겨볼까요? | 후기 쓰기 |
| 검색 결과 없음 | 찾는 공연이 없어요. 다른 단어로 검색해 보세요 | - |
| 네트워크 오류 | 불러오지 못했어요 | 다시 시도 |
| 로그인 필요 | 로그인하면 기록을 저장할 수 있어요 | 로그인 |

### A-3. 로그인 정책
- 이메일 매직링크 1종(비밀번호 없음). 로그인 없이도 공연·배우·혜택은 볼 수 있고, 찜/팔로우/후기/내 기록에서만 로그인 요구.
- 첫 로그인 시 닉네임 입력 1화면. 관리자 권한은 DB에서 `profiles.is_admin`을 직접 true로 바꿔 부여(README에 방법 기재).

### A-4. 검색
- 상단 🔍 → 전체 검색 화면: 최근 검색어 5개(로컬 저장), 입력하면 공연/배우/극장이 섹션별로 최대 3개씩 표시.
- Postgres `ilike` + 제목 인덱스로 시작. 한글 초성 검색은 3차.

### A-5. 날짜·시간 규칙
- 모든 표시는 KST. DB는 `timestamptz`.
- 마감 표기: 오늘이면 "오늘 18:00 마감", 내일이면 "내일 마감", 그 외 "11.05(수) 마감".
- "오늘 마감"은 `ends_at`이 오늘 00:00~23:59(KST)인 항목.

### A-6. API/서버 액션 목록 (Next.js)
| 이름 | 설명 |
|---|---|
| `getHome()` | 오늘 마감 3 + 곧 열리는 티켓 3 + 내 찜 공연 |
| `listShows({status, theaterId, actorId, from, to, sort, cursor})` | 공연 목록 |
| `getShow(id)` | 상세 + 평균 별점 + 후기 수 |
| `getCast(showId, date)` | 날짜별 캐스팅(없으면 시즌 캐스팅) |
| `listBenefits({type, includeExpired})` | 혜택 |
| `toggleWishlist(showId)`, `toggleFollow(actorId)` | 토글 |
| `createReview / updateReview / deleteReview` | 후기 CRUD (본인만) |
| `adminCreateBenefit` 등 | 관리자 전용 서버 액션(서버에서 `is_admin` 재검증) |

---

## B. 2차 기능 상세

### B-1. 극장 좌석 후기

**목적:** "이 자리 어때요?"를 열·구역 단위로 빠르게 파악.

**원칙:** 실제 극장의 좌석 배치를 임의로 만들지 않는다. 극장별 구역 목록은 관리자가 직접 입력하거나, 입력 전에는 "1층/2층/3층 + 자유 입력 구역명"만 제공한다.

**추가 테이블**
```sql
create table seat_zones (
  id uuid primary key default gen_random_uuid(),
  theater_id uuid not null references theaters on delete cascade,
  floor text not null,              -- '1층','2층','3층' 등
  name text not null,               -- '중블', 'A구역' 등 관리자 입력
  sort_order int not null default 0,
  unique (theater_id, floor, name)
);

alter table seat_reviews
  add column zone_id uuid references seat_zones,
  add column seat_row text,
  add column seat_number text,
  add column is_obstructed boolean default false,  -- 시야 방해(기둥, 난간, 앞사람 등)
  add column obstruction_note text,
  add column watched_at date,
  add column helpful_count int not null default 0;

create table seat_review_helpful (
  user_id uuid references profiles on delete cascade,
  seat_review_id uuid references seat_reviews on delete cascade,
  primary key (user_id, seat_review_id)
);

-- 구역별 평균 뷰
create view seat_zone_stats as
select zone_id, theater_id,
  count(*) as review_count,
  round(avg(view_score)::numeric,1) as avg_view,
  round(avg(distance_score)::numeric,1) as avg_distance,
  round(avg(sound_score)::numeric,1) as avg_sound
from seat_reviews
where zone_id is not null
group by zone_id, theater_id;
```

**화면 `/theaters/[id]`**
```
┌──────────────────────┐
│ ← 샤롯데씨어터         │
│ 주소 · 좌석수 · 지도 링크 │
├──────────────────────┤
│ [1층][2층][3층]        │ ← 층 탭
│ ┌────────┬────────┐  │
│ │ 중블    │ 좌블    │  │ ← 구역 카드 2열
│ │ ★4.3   │ ★3.9   │  │   (평균 시야, 후기 수)
│ │ 후기 12 │ 후기 7  │  │
│ └────────┴────────┘  │
│ [+ 좌석 후기 쓰기]     │
└──────────────────────┘
```
- 구역 카드 탭 → 구역 상세: 시야/거리/음향 평균 3개 막대, 후기 목록(열·번호, 별점, 코멘트, 관람 공연, 도움돼요 수).
- 필터: 열 범위(앞열/중간/뒷열), 시야 방해 있음/없음.
- 후기가 3개 미만인 구역은 "후기가 적어 참고용이에요" 안내.
- 좌석 후기 작성: 극장 → 층 → 구역 → 열/번호 → 시야·거리·음향(1~5) → 시야 방해 여부 → 코멘트 → 관람 공연(선택).
- 내 관극 후기 작성 시 좌석을 입력하면 "이 좌석 후기도 극장 정보에 올릴까요?" 체크박스로 연동.

### B-2. 알림

**종류**
| 알림 | 시점 | 대상 |
|---|---|---|
| 로터리/할인 마감 임박 | 마감 1시간 전 | "알림 받기" 누른 혜택 |
| 티켓오픈 | 오픈 10분 전 | 위와 동일 |
| 팔로우 배우 캐스팅 추가 | 새 `casts` 등록 시 | 해당 배우 팔로워 |
| 찜 공연 종료 임박 | 종료 7일 전 | 찜한 사용자 |

**구현**
- Web Push(VAPID) + Service Worker. iOS는 홈 화면에 추가한 PWA에서만 푸시가 동작하므로, 설정 화면에 "홈 화면에 추가하면 알림을 받을 수 있어요" 안내를 넣는다.
- 테이블:
```sql
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table benefit_alerts (
  user_id uuid references profiles on delete cascade,
  benefit_id uuid references benefits on delete cascade,
  remind_minutes int not null default 60,
  sent_at timestamptz,
  primary key (user_id, benefit_id)
);
```
- 발송: 5분마다 도는 스케줄 작업(`/api/cron/send-alerts`)이 `ends_at - remind_minutes <= now()` 이고 `sent_at is null`인 건을 찾아 발송 후 `sent_at` 기록. Cron 엔드포인트는 `CRON_SECRET` 헤더로 보호.
- 설정 화면(`/me/settings`): 알림 종류별 on/off, 방해금지 시간(기본 23:00~08:00, 해당 시간 알림은 아침에 묶어서 발송).
- 알림 권한은 사용자가 "알림 받기"를 처음 누를 때 요청한다(첫 접속 즉시 요청 금지).

### B-3. 업계 용어 사전 `/glossary`
- 검색창 + 가나다 목록, 용어 탭하면 뜻+예시 바텀시트.
- 시드는 관리자가 직접 입력. 예시로 넣을 수 있는 분류: 관극 용어(커튼콜, 막공, 첫공, 회전문, 로티), 예매 용어(선예매, 오픈런, 취켓팅), 좌석 용어(블록, 시야방해석). **뜻은 Claude가 초안을 쓰되, 사용자가 검수 후 등록하도록 `draft` 상태로 먼저 저장**한다.
```sql
alter table glossary add column status text not null default 'draft'
  check (status in ('draft','published')),
  add column category text;
```

### B-4. 링크 붙여넣기 자동 채우기 (관리자)
- 관리자 혜택 폼 상단에 "링크로 채우기" 입력칸. URL을 붙이면 서버에서 해당 페이지의 `<title>`, `og:title`, `og:image`만 읽어 제목 후보와 출처 이름을 채운다.
- 로그인이 필요하거나 접근이 막힌 페이지는 조용히 실패하고 수동 입력으로 전환. 일정(날짜)은 자동 추출하지 않고 항상 사람이 입력한다.
- SSRF 방지: http/https만 허용, 사설 IP·localhost 차단, 타임아웃 5초, 응답 크기 1MB 제한.

### B-5. 시즌 통계 `/me` 통계 탭 확장
- 올해 관극 횟수 / 총 지출 / 평균 별점
- 월별 관극 막대 차트
- 많이 본 공연 TOP3, 많이 본 배우 TOP3 (후기의 `cast_note`가 아닌 구조화된 캐스트 입력이 있을 때만 집계)
- 후기 작성 폼에 "그날 캐스트" 선택 필드(배우 자동완성, 배역별) 추가 → 별도 테이블:
```sql
create table review_casts (
  review_id uuid references reviews on delete cascade,
  actor_id uuid references actors,
  role_name text not null,
  primary key (review_id, actor_id, role_name)
);
```
- 연말 "올해의 관극 리포트" 카드(공유용 이미지 저장)는 3차.

---

## C. 구현 순서 (1부 9단계 이후)
| 단계 | 내용 | 완료 기준 |
|---|---|---|
| 10 | 공통 컴포넌트 정리, 빈 화면/오류 문구 적용 | 모든 목록에 EmptyState·Skeleton |
| 11 | 영상 탭 + 관리자 영상 등록 | 공연/배우 상세에서 임베드 재생 |
| 12 | 극장 목록/상세 + 구역 관리(관리자) | 극장별 층·구역 입력 가능 |
| 13 | 좌석 후기 작성/조회/도움돼요 | 구역별 평균 표시 |
| 14 | 통계 탭 + 후기 캐스트 입력 | 월별 차트·TOP3 표시 |
| 15 | 푸시 알림(구독, 설정, Cron 발송) | 테스트 알림 수신 |
| 16 | 용어 사전, 링크 자동 채우기 | 관리자 폼에서 제목 자동 입력 |

## D. 테스트 체크리스트 (단계마다 Claude Code가 직접 확인)
- 비로그인: 공연·배우·혜택 열람 가능, 찜 누르면 로그인 안내
- 일반 사용자: 타인의 비공개 후기 조회 불가, 타인 후기 수정/삭제 불가
- 관리자 아님: `/admin` 접근 시 홈으로 이동, 서버 액션 호출도 거부
- 마감 지난 혜택은 기본 목록에서 숨김, 오늘 마감은 주황 배지
- 모바일 폭(360px)에서 가로 스크롤·글자 잘림 없음
- 이미지 없는 공연/배우도 깨지지 않는 기본 이미지 표시

## E. Claude Code에 붙여넣을 프롬프트 (2부 시작용)
```
SPEC.md와 SPEC-2.md를 둘 다 읽어줘. 충돌하면 SPEC-2.md가 우선이야.
1부(단계 1~9)가 끝났다면 SPEC-2.md의 C번 표 10단계부터, 아직이면 1부부터 이어서 진행해줘.
- 시작 전 현재 코드 상태를 한 줄로 요약하고, 이번에 할 단계를 알려줘.
- 한 단계가 끝나면 SPEC-2.md D번 체크리스트 중 해당되는 항목을 직접 테스트하고 결과를 알려줘.
- 실제 극장 좌석 배치, 실제 배우/공연 정보는 임의로 만들지 말고 샘플은 [샘플] 표시를 붙여줘.
- 스펙에 없는 기능은 먼저 제안해줘.
```
