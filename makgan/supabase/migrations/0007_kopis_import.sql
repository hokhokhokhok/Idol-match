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
