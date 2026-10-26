-- 막간 전체 스키마: supabase/migrations를 순서대로 이어 붙인 파일(직접 고치지 말고 npm run db:bundle)
-- 새 Supabase 프로젝트의 SQL Editor에 통째로 붙여 넣고 실행하세요. 화면 확인용 데이터는 seed.sql.

-- ===== 0001_init.sql =====
-- 막간 1단계: MVP 스키마 + RLS
-- Supabase(auth.users, auth.uid(), anon/authenticated 역할)를 전제로 한다.

-- ───────── 프로필 ─────────
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text unique check (char_length(nickname) between 1 and 20),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- 가입하면 닉네임 없는 프로필을 만든다. 닉네임은 첫 로그인 화면에서 입력(2부 A-3).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS 정책에서 쓰는 관리자 판별. security definer라 profiles RLS를 우회해 재귀하지 않는다.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- ───────── 콘텐츠(관리자 입력) ─────────
create table public.theaters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  seat_count int check (seat_count > 0),
  map_url text,
  created_at timestamptz not null default now()
);

create table public.shows (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  theater_id uuid references public.theaters on delete set null,
  starts_on date not null,
  ends_on date not null,
  poster_url text,
  synopsis text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.actors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_url text,
  bio text,
  created_at timestamptz not null default now()
);

-- perf_date가 null이면 시즌 캐스팅, 값이 있으면 그날 캐스팅(getCast).
create table public.casts (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows on delete cascade,
  actor_id uuid not null references public.actors on delete cascade,
  role_name text not null,
  perf_date date,
  created_at timestamptz not null default now()
);
create unique index casts_unique on public.casts
  (show_id, actor_id, role_name, coalesce(perf_date, '-infinity'::date));

create table public.benefits (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references public.shows on delete cascade,
  type text not null check (type in ('lottery','discount','ticket_open','event')),
  title text not null,
  source_name text,
  source_url text,
  starts_at timestamptz,          -- 티켓오픈은 오픈 시각
  ends_at timestamptz,            -- 마감 시각(오늘 마감·마감 지남 판정)
  note text,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create table public.glossary (
  id uuid primary key default gen_random_uuid(),
  term text not null unique,
  meaning text not null,
  example text,
  created_at timestamptz not null default now()
);

-- ───────── 사용자 기록 ─────────
create table public.wishlists (
  user_id uuid not null references public.profiles on delete cascade,
  show_id uuid not null references public.shows on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, show_id)
);

create table public.follows (
  user_id uuid not null references public.profiles on delete cascade,
  actor_id uuid not null references public.actors on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, actor_id)
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  show_id uuid not null references public.shows on delete cascade,
  watched_at date not null,
  rating int not null check (rating between 1 and 5),
  body text,
  cast_note text,                 -- 자유 입력 캐스트 메모(구조화 캐스트는 2부 review_casts)
  seat_text text,
  price int check (price >= 0),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seat_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  theater_id uuid not null references public.theaters on delete cascade,
  show_id uuid references public.shows on delete set null,
  review_id uuid references public.reviews on delete set null,
  floor text,                     -- 구역 관리 전에는 '1층/2층/3층' + 자유 입력(2부 B-1)
  zone_text text,
  view_score int not null check (view_score between 1 and 5),
  distance_score int not null check (distance_score between 1 and 5),
  sound_score int not null check (sound_score between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();

-- ───────── 인덱스 ─────────
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create index shows_title_trgm on public.shows using gin (title extensions.gin_trgm_ops);   -- ilike 검색(2부 A-4)
create index actors_name_trgm on public.actors using gin (name extensions.gin_trgm_ops);
create index theaters_name_trgm on public.theaters using gin (name extensions.gin_trgm_ops);
create index shows_period on public.shows (ends_on, starts_on);
create index shows_theater on public.shows (theater_id);
create index casts_show_date on public.casts (show_id, perf_date);
create index casts_actor on public.casts (actor_id);
create index benefits_ends_at on public.benefits (ends_at);
create index benefits_show on public.benefits (show_id);
create index reviews_show on public.reviews (show_id);
create index reviews_user on public.reviews (user_id, watched_at desc);
create index seat_reviews_theater on public.seat_reviews (theater_id);

-- ───────── 공연 상세 집계(getShow): 공개 후기만 ─────────
create view public.show_rating_stats with (security_invoker = true) as
select show_id, count(*)::int as review_count, round(avg(rating)::numeric, 1) as avg_rating
from public.reviews
where is_public
group by show_id;

-- ───────── RLS ─────────
alter table public.profiles enable row level security;
alter table public.theaters enable row level security;
alter table public.shows enable row level security;
alter table public.actors enable row level security;
alter table public.casts enable row level security;
alter table public.benefits enable row level security;
alter table public.glossary enable row level security;
alter table public.wishlists enable row level security;
alter table public.follows enable row level security;
alter table public.reviews enable row level security;
alter table public.seat_reviews enable row level security;

-- 프로필: 닉네임은 후기 작성자 표시에 쓰이므로 누구나 읽기. 수정은 본인 닉네임만.
create policy profiles_read on public.profiles for select using (true);
create policy profiles_update_own on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from anon, authenticated;
grant update (nickname) on public.profiles to authenticated;

-- 콘텐츠: 누구나 읽기, 관리자만 쓰기.
do $$
declare t text;
begin
  foreach t in array array['theaters','shows','actors','casts','benefits','glossary'] loop
    execute format('create policy %1$s_read on public.%1$s for select using (true)', t);
    execute format('create policy %1$s_admin_insert on public.%1$s for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy %1$s_admin_update on public.%1$s for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy %1$s_admin_delete on public.%1$s for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-- 찜·팔로우: 본인 행만.
create policy wishlists_own on public.wishlists for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy follows_own on public.follows for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 관극 후기: 공개 후기 또는 본인 후기만 읽기, 쓰기는 본인만.
create policy reviews_read on public.reviews for select
  using (is_public or user_id = auth.uid());
create policy reviews_insert_own on public.reviews for insert to authenticated
  with check (user_id = auth.uid());
create policy reviews_update_own on public.reviews for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reviews_delete_own on public.reviews for delete to authenticated
  using (user_id = auth.uid());

-- 좌석 후기: 누구나 읽기, 쓰기는 본인만.
create policy seat_reviews_read on public.seat_reviews for select using (true);
create policy seat_reviews_insert_own on public.seat_reviews for insert to authenticated
  with check (user_id = auth.uid());
create policy seat_reviews_update_own on public.seat_reviews for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy seat_reviews_delete_own on public.seat_reviews for delete to authenticated
  using (user_id = auth.uid());

-- ===== 0002_videos.sql =====
-- 막간 11단계: 영상(유튜브). 공연 또는 배우(또는 둘 다)에 연결한다.
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null check (char_length(title) between 1 and 200),
  show_id uuid references public.shows on delete cascade,
  actor_id uuid references public.actors on delete cascade,
  published_on date,
  created_at timestamptz not null default now(),
  check (show_id is not null or actor_id is not null)
);
create index videos_show on public.videos (show_id, published_on desc);
create index videos_actor on public.videos (actor_id, published_on desc);

alter table public.videos enable row level security;
create policy videos_read on public.videos for select using (true);
create policy videos_admin_insert on public.videos for insert to authenticated with check (public.is_admin());
create policy videos_admin_update on public.videos for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy videos_admin_delete on public.videos for delete to authenticated using (public.is_admin());

-- ===== 0003_seats.sql =====
-- 막간 12·13단계: 극장 구역 + 좌석 후기 확장(SPEC-2 B-1)
-- 원칙: 실제 좌석 배치를 임의로 만들지 않는다. 구역은 관리자가 입력하고, 입력 전에는 층 + 자유 입력 구역명만.

create table public.seat_zones (
  id uuid primary key default gen_random_uuid(),
  theater_id uuid not null references public.theaters on delete cascade,
  floor text not null check (char_length(floor) between 1 and 20),     -- '1층','2층','3층' 등
  name text not null check (char_length(name) between 1 and 50),       -- '중블', 'A구역' 등 관리자 입력
  sort_order int not null default 0,
  unique (theater_id, floor, name)
);
create index seat_zones_theater on public.seat_zones (theater_id, floor, sort_order);

alter table public.seat_reviews
  add column zone_id uuid references public.seat_zones on delete set null,
  add column seat_row text check (char_length(seat_row) <= 10),
  add column seat_number text check (char_length(seat_number) <= 10),
  add column is_obstructed boolean not null default false,   -- 시야 방해(기둥, 난간, 앞사람 등)
  add column obstruction_note text check (char_length(obstruction_note) <= 200),
  add column watched_at date,
  add column helpful_count int not null default 0;
create index seat_reviews_zone on public.seat_reviews (zone_id);

create table public.seat_review_helpful (
  user_id uuid not null references public.profiles on delete cascade,
  seat_review_id uuid not null references public.seat_reviews on delete cascade,
  primary key (user_id, seat_review_id)
);

-- 도움돼요 수는 트리거로만 바뀐다(사용자가 직접 못 바꾸게 컬럼 권한도 막음)
create function public.sync_helpful_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.seat_reviews
     set helpful_count = (select count(*) from public.seat_review_helpful h where h.seat_review_id = coalesce(new.seat_review_id, old.seat_review_id))
   where id = coalesce(new.seat_review_id, old.seat_review_id);
  return null;
end $$;
create trigger seat_review_helpful_sync after insert or delete on public.seat_review_helpful
  for each row execute function public.sync_helpful_count();

revoke update on public.seat_reviews from anon, authenticated;
grant update (floor, zone_text, zone_id, seat_row, seat_number, view_score, distance_score, sound_score,
  is_obstructed, obstruction_note, comment, show_id, watched_at) on public.seat_reviews to authenticated;

-- 구역별 평균
create view public.seat_zone_stats with (security_invoker = true) as
select zone_id, theater_id,
  count(*)::int as review_count,
  round(avg(view_score)::numeric, 1) as avg_view,
  round(avg(distance_score)::numeric, 1) as avg_distance,
  round(avg(sound_score)::numeric, 1) as avg_sound
from public.seat_reviews
where zone_id is not null
group by zone_id, theater_id;

alter table public.seat_zones enable row level security;
alter table public.seat_review_helpful enable row level security;
create policy seat_zones_read on public.seat_zones for select using (true);
create policy seat_zones_admin_insert on public.seat_zones for insert to authenticated with check (public.is_admin());
create policy seat_zones_admin_update on public.seat_zones for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy seat_zones_admin_delete on public.seat_zones for delete to authenticated using (public.is_admin());
create policy seat_review_helpful_read on public.seat_review_helpful for select using (true);
create policy seat_review_helpful_own_insert on public.seat_review_helpful for insert to authenticated
  with check (user_id = auth.uid() and not exists (select 1 from public.seat_reviews r where r.id = seat_review_id and r.user_id = auth.uid()));
create policy seat_review_helpful_own_delete on public.seat_review_helpful for delete to authenticated using (user_id = auth.uid());

-- ===== 0004_review_casts.sql =====
-- 막간 14단계: 후기의 "그날 캐스트"(구조화, SPEC-2 B-5). 통계의 배우 TOP3는 이 표로만 집계한다.
create table public.review_casts (
  review_id uuid not null references public.reviews on delete cascade,
  actor_id uuid not null references public.actors on delete cascade,
  role_name text not null check (char_length(role_name) between 1 and 100),
  primary key (review_id, actor_id, role_name)
);
create index review_casts_actor on public.review_casts (actor_id);

alter table public.review_casts enable row level security;
-- 후기를 볼 수 있으면 캐스트도 볼 수 있다(reviews RLS가 하위 질의에도 적용됨)
create policy review_casts_read on public.review_casts for select
  using (exists (select 1 from public.reviews r where r.id = review_id));
create policy review_casts_own_insert on public.review_casts for insert to authenticated
  with check (exists (select 1 from public.reviews r where r.id = review_id and r.user_id = auth.uid()));
create policy review_casts_own_delete on public.review_casts for delete to authenticated
  using (exists (select 1 from public.reviews r where r.id = review_id and r.user_id = auth.uid()));

-- ===== 0005_push.sql =====
-- 막간 15단계: 웹 푸시 알림(SPEC-2 B-2)

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https?://'),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- "알림 받기" 누른 혜택. 로터리·할인은 마감 60분 전, 티켓오픈은 오픈 10분 전
create table public.benefit_alerts (
  user_id uuid not null references public.profiles on delete cascade,
  benefit_id uuid not null references public.benefits on delete cascade,
  remind_minutes int not null default 60 check (remind_minutes between 1 and 1440),
  sent_at timestamptz,
  primary key (user_id, benefit_id)
);

-- 알림 종류별 on/off, 방해금지 시간(KST). 행이 없으면 기본값(모두 켜짐, 23:00~08:00)
create table public.notification_settings (
  user_id uuid primary key references public.profiles on delete cascade,
  benefit_deadline boolean not null default true,
  ticket_open boolean not null default true,
  cast_added boolean not null default true,
  wishlist_ending boolean not null default true,
  quiet_start time not null default '23:00',
  quiet_end time not null default '08:00'
);

-- 보낼 알림(중복 방지·방해금지 시간엔 쌓아 두었다가 아침에 묶어서 보냄). 서버(서비스 키)만 다룬다.
create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  kind text not null check (kind in ('benefit_deadline', 'ticket_open', 'cast_added', 'wishlist_ending', 'test')),
  ref_id uuid,
  title text not null,
  body text not null,
  url text not null default '/',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, kind, ref_id)   -- 같은 알림은 한 번만(ref_id가 null인 테스트 알림은 겹쳐도 됨)
);
create index notification_outbox_pending on public.notification_outbox (user_id) where sent_at is null;

alter table public.push_subscriptions enable row level security;
alter table public.benefit_alerts enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notification_outbox enable row level security;   -- 정책 없음: 사용자 접근 불가

create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy benefit_alerts_own_read on public.benefit_alerts for select to authenticated using (user_id = auth.uid());
create policy benefit_alerts_own_insert on public.benefit_alerts for insert to authenticated with check (user_id = auth.uid() and sent_at is null);
create policy benefit_alerts_own_delete on public.benefit_alerts for delete to authenticated using (user_id = auth.uid());
create policy notification_settings_own on public.notification_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 팔로우 배우 캐스팅 추가 → 팔로워에게 알림 대기열(새 casts 등록 시)
create function public.enqueue_cast_added() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notification_outbox (user_id, kind, ref_id, title, body, url)
  select f.user_id, 'cast_added', new.id,
         a.name || ' 캐스팅 소식',
         s.title || ' · ' || new.role_name || coalesce(' (' || to_char(new.perf_date, 'MM.DD') || ')', ''),
         '/shows/' || new.show_id
    from public.follows f
    join public.actors a on a.id = new.actor_id
    join public.shows s on s.id = new.show_id
    left join public.notification_settings ns on ns.user_id = f.user_id
   where f.actor_id = new.actor_id and coalesce(ns.cast_added, true)
  on conflict do nothing;
  return null;
end $$;
create trigger casts_enqueue_followers after insert on public.casts
  for each row execute function public.enqueue_cast_added();

-- ===== 0006_glossary.sql =====
-- 막간 16단계: 용어 사전(SPEC-2 B-3). 초안(draft)은 관리자만 보이고, 검수 후 published로 바꾸면 공개된다.
alter table public.glossary
  add column status text not null default 'draft' check (status in ('draft', 'published')),
  add column category text check (category in ('관극', '예매', '좌석', '기타'));

drop policy glossary_read on public.glossary;
create policy glossary_read on public.glossary for select using (status = 'published' or public.is_admin());

-- 뜻은 Claude가 쓴 초안 — 관리자가 검수한 뒤 공개해 주세요(모두 draft로 저장).
insert into public.glossary (term, category, meaning, example, status) values
  ('커튼콜', '관극', '공연이 끝난 뒤 배우들이 무대에 다시 나와 관객에게 인사하는 순서.', '오늘 커튼콜에서 배우들이 앙코르 곡을 불렀다.', 'draft'),
  ('막공', '관극', '''마지막 공연''의 줄임말. 시즌이나 특정 배우·회차 조합의 마지막 공연을 말한다.', '이번 시즌 막공은 일찍 매진됐다.', 'draft'),
  ('첫공', '관극', '''첫 공연''의 줄임말. 시즌의 첫 공연이나 특정 배우의 첫 출연 회차를 말한다.', '첫공이라 무대 인사가 있었다.', 'draft'),
  ('회전문', '관극', '같은 공연을 여러 번 반복해서 보는 것. 회전문을 돌듯 다시 극장에 들어간다는 뜻.', '이번 작품은 회전문 돌 만큼 좋았다.', 'draft'),
  ('로티', '관극', '''로터리 티켓''의 줄임말. 추첨으로 정해진 좌석을 싼 값에 살 수 있는 티켓.', '오늘 로티 당첨돼서 앞열에 앉았다.', 'draft'),
  ('선예매', '예매', '일반 예매보다 먼저 예매할 수 있는 기회. 유료 회원·카드사·팬클럽 등 조건이 정해져 있다.', '선예매로 원하는 회차를 먼저 잡았다.', 'draft'),
  ('오픈런', '예매', '공연 분야에서는 끝나는 날을 정하지 않고 계속 공연하는 방식을 말한다. 매장 문이 열리자마자 달려가는 것을 뜻하기도 해 문맥을 확인해야 한다(검수 필요).', '이 작품은 오픈런으로 공연 중이다.', 'draft'),
  ('취켓팅', '예매', '''취소표 티켓팅''의 줄임말. 다른 사람이 취소해서 다시 풀린 표를 잡는 것.', '새벽 취켓팅으로 겨우 표를 구했다.', 'draft'),
  ('블록', '좌석', '좌석을 통로 등을 기준으로 나눈 구역. 극장마다 이름 붙이는 방식이 다르다.', '1층 가운데 블록이 시야가 좋다.', 'draft'),
  ('시야방해석', '좌석', '기둥·난간·조명 장비 등 때문에 무대 일부가 가려 보이는 좌석. 보통 미리 안내하고 싸게 판다.', '시야방해석이지만 가격 대비 괜찮았다.', 'draft')
on conflict (term) do nothing;

-- ===== 0007_kopis_import.sql =====
-- 막간: 공연예술통합전산망(KOPIS) 공식 데이터 가져오기. external_id가 있는 행만 가져오기가 갱신한다(관리자가 직접 넣은 행은 건드리지 않음).
alter table public.shows
  add column external_id text unique,            -- 'kopis:PF123456'
  add column external_synced_at timestamptz,     -- 상세(소개·출연진)를 마지막으로 가져온 시각
  add column ticket_url text check (ticket_url ~ '^https?://'),
  add column ticket_name text;

alter table public.theaters
  add column external_id text unique,            -- 'kopis:FC000485'
  add column lat double precision,
  add column lng double precision;

-- ===== 0008_run_days.sql =====
-- 공연 기간(일). 목록에서 1~3일짜리 단기 공연(지방 순회·단발 공연)을 기본으로 숨기는 데 쓴다.
alter table public.shows add column run_days int generated always as ((ends_on - starts_on) + 1) stored;
create index shows_run_days on public.shows (run_days);

-- ===== 0009_record_tier.sql =====
-- 막간: 관람 회차(시간) 기록 + 배우 인기 등급(점수는 드러내지 않고 등급만) 재료.
alter table public.reviews
  add column watch_time text check (watch_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');   -- 'HH:MM' 회차 시각(선택)

-- 배우별 외부 언급량(예: 네이버 뉴스 검색 건수). 크론이 채우고 누구나 읽는다(공개 수치).
create table public.actor_signals (
  actor_id uuid primary key references public.actors on delete cascade,
  news_count int not null default 0 check (news_count >= 0),
  checked_at timestamptz not null default now()
);
alter table public.actor_signals enable row level security;
create policy actor_signals_read on public.actor_signals for select using (true);

-- 등급 계산 재료: 배우별 합계 수치만 돌려준다(개별 팔로우·후기는 드러나지 않음). 점수·등급은 앱 서버에서 계산.
create function public.actor_activity()
returns table (actor_id uuid, shows int, recent int, followers int, reviews int, news int)
language sql stable security definer set search_path = public as $$
  select a.id,
    coalesce(c.shows, 0)::int,
    coalesce(c.recent, 0)::int,
    coalesce(f.n, 0)::int,
    coalesce(r.n, 0)::int,
    coalesce(s.news_count, 0)::int
  from public.actors a
  left join (
    select ca.actor_id, count(distinct ca.show_id) as shows,
      count(distinct ca.show_id) filter (where sh.ends_on >= current_date - 365) as recent
    from public.casts ca join public.shows sh on sh.id = ca.show_id group by ca.actor_id
  ) c on c.actor_id = a.id
  left join (select actor_id, count(*) n from public.follows group by actor_id) f on f.actor_id = a.id
  left join (select actor_id, count(*) n from public.review_casts group by actor_id) r on r.actor_id = a.id
  left join public.actor_signals s on s.actor_id = a.id
  where coalesce(c.shows, 0) > 0
$$;
revoke all on function public.actor_activity() from public;
grant execute on function public.actor_activity() to anon, authenticated;
