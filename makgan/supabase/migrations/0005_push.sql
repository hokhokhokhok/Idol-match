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
