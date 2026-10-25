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
