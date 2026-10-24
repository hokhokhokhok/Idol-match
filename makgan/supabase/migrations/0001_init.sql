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
