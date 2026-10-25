-- 공연 기간(일). 목록에서 1~3일짜리 단기 공연(지방 순회·단발 공연)을 기본으로 숨기는 데 쓴다.
alter table public.shows add column run_days int generated always as ((ends_on - starts_on) + 1) stored;
create index shows_run_days on public.shows (run_days);
