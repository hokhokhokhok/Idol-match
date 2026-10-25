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
