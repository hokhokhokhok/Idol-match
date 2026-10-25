-- 막간 [샘플] 시드. 실제 극장·공연·배우가 아니다. 이름마다 [샘플]을 붙인다.
-- 날짜는 now() 기준 상대값이라 언제 넣어도 "오늘 마감"·"곧 열리는 티켓"이 보인다.

insert into public.theaters (id, name, address, seat_count) values
  ('00000000-0000-4000-8000-000000000101', '[샘플] 막간아트홀', '[샘플] 서울시 어딘가 1', 1000),
  ('00000000-0000-4000-8000-000000000102', '[샘플] 커튼콜극장', '[샘플] 서울시 어딘가 2', 400);

insert into public.shows (id, title, theater_id, starts_on, ends_on) values
  ('00000000-0000-4000-8000-000000000201', '[샘플] 뮤지컬 첫공', '00000000-0000-4000-8000-000000000101',
    (now() at time zone 'Asia/Seoul')::date - 30, (now() at time zone 'Asia/Seoul')::date + 60),
  ('00000000-0000-4000-8000-000000000202', '[샘플] 연극 막공', '00000000-0000-4000-8000-000000000102',
    (now() at time zone 'Asia/Seoul')::date - 60, (now() at time zone 'Asia/Seoul')::date + 5),
  ('00000000-0000-4000-8000-000000000203', '[샘플] 뮤지컬 회전문', '00000000-0000-4000-8000-000000000101',
    (now() at time zone 'Asia/Seoul')::date + 20, (now() at time zone 'Asia/Seoul')::date + 120),
  ('00000000-0000-4000-8000-000000000204', '[샘플] 연극 지난 시즌', '00000000-0000-4000-8000-000000000102',
    (now() at time zone 'Asia/Seoul')::date - 120, (now() at time zone 'Asia/Seoul')::date - 10);

update public.shows set synopsis = '[샘플] 화면 확인용 공연 소개입니다.
실제 공연이 아닙니다.' where id = '00000000-0000-4000-8000-000000000201';

insert into public.actors (id, name) values
  ('00000000-0000-4000-8000-000000000301', '[샘플] 배우 가'),
  ('00000000-0000-4000-8000-000000000302', '[샘플] 배우 나'),
  ('00000000-0000-4000-8000-000000000303', '[샘플] 배우 다');

insert into public.casts (show_id, actor_id, role_name, perf_date) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000301', '[샘플] 주인공', null),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000302', '[샘플] 주인공', null),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000303', '[샘플] 조연', null),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000301', '[샘플] 주인공',
    (now() at time zone 'Asia/Seoul')::date),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000302', '[샘플] 화자', null);

insert into public.benefits (show_id, type, title, source_name, starts_at, ends_at) values
  ('00000000-0000-4000-8000-000000000201', 'lottery', '[샘플] 오늘 마감 로터리', '[샘플] 공식 SNS',
    now() - interval '2 days',
    date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' + interval '23 hours 59 minutes'),
  ('00000000-0000-4000-8000-000000000202', 'discount', '[샘플] 막공 주간 할인', '[샘플] 예매처',
    now() - interval '1 day', now() + interval '2 days'),
  ('00000000-0000-4000-8000-000000000203', 'ticket_open', '[샘플] 1차 티켓오픈', '[샘플] 예매처',
    now() + interval '3 days', now() + interval '3 days 1 hour'),
  ('00000000-0000-4000-8000-000000000201', 'event', '[샘플] 지난 이벤트(마감 지남)', '[샘플] 공식 SNS',
    now() - interval '10 days', now() - interval '1 day');

insert into public.glossary (term, meaning, example) values
  ('[샘플] 용어', '[샘플] 용어 사전 화면 확인용 항목입니다. 실제 뜻은 16단계에서 검수 후 등록합니다.', null);

-- [샘플] 구역: 화면 확인용. 실제 극장 배치가 아니다.
insert into public.seat_zones (theater_id, floor, name, sort_order) values
  ('00000000-0000-4000-8000-000000000101', '1층', '[샘플] 가운데', 1),
  ('00000000-0000-4000-8000-000000000101', '1층', '[샘플] 왼쪽', 2),
  ('00000000-0000-4000-8000-000000000101', '2층', '[샘플] 앞쪽', 1);
