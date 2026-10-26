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
