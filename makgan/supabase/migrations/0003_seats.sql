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
