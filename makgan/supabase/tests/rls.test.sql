-- RLS 테스트. psql -v ON_ERROR_STOP=1 로 실행하면 실패 시 즉시 멈춘다.
-- 사용자: alice·bob(일반), admin(관리자)
\o /dev/null

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'alice@example.com'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bob@example.com'),
  ('adadadad-0000-4000-8000-000000000003', 'admin@example.com');
update public.profiles set is_admin = true where id = 'adadadad-0000-4000-8000-000000000003';

create function pg_temp.expect_denied(sql text, label text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL: % — 거부돼야 하는데 성공함', label;
exception
  when insufficient_privilege or check_violation then raise notice 'ok: %', label;
  when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    if sqlerrm like '%row-level security%' then raise notice 'ok: %', label; else raise; end if;
end $$;

create function pg_temp.expect(cond boolean, label text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FAIL: %', label; end if;
  raise notice 'ok: %', label;
end $$;

grant execute on all functions in schema pg_temp to anon, authenticated;

-- ── 가입 트리거: 프로필 자동 생성, 닉네임 비어 있음 ──
select pg_temp.expect((select count(*) from public.profiles where nickname is null) = 3, '가입 시 닉네임 없는 프로필 생성');

-- ── 비로그인(anon) ──
set role anon;
set request.jwt.claims = '{}';
select pg_temp.expect((select count(*) from public.shows) > 0, '비로그인: 공연 열람');
select pg_temp.expect((select count(*) from public.actors) > 0, '비로그인: 배우 열람');
select pg_temp.expect((select count(*) from public.benefits) > 0, '비로그인: 혜택 열람');
select pg_temp.expect((select count(*) from public.videos) >= 0, '비로그인: 영상 열람 가능');
select pg_temp.expect((select count(*) from public.glossary) = 0, '비로그인: 초안 용어는 안 보임');
select pg_temp.expect_denied($$insert into public.wishlists (user_id, show_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201')$$, '비로그인: 찜 저장 거부');
select pg_temp.expect_denied($$insert into public.benefits (type, title) values ('event', 'x')$$, '비로그인: 혜택 등록 거부');
reset role;

-- ── alice ──
set role authenticated;
set request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001"}';
update public.profiles set nickname = '앨리스' where id = auth.uid();
select pg_temp.expect((select nickname from public.profiles where id = auth.uid()) = '앨리스', '본인 닉네임 수정');
select pg_temp.expect_denied($$update public.profiles set is_admin = true where id = auth.uid()$$, '스스로 관리자 권한 부여 거부');
insert into public.wishlists (user_id, show_id) values (auth.uid(), '00000000-0000-4000-8000-000000000201');
select pg_temp.expect_denied($$insert into public.wishlists (user_id, show_id) values
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000202')$$, '남의 찜 저장 거부');
insert into public.follows (user_id, actor_id) values (auth.uid(), '00000000-0000-4000-8000-000000000301');
select pg_temp.expect_denied($$insert into public.follows (user_id, actor_id) values
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000301')$$, '남의 팔로우 저장 거부');
insert into public.reviews (id, show_id, watched_at, rating, body, is_public) values
  ('11111111-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000201', current_date, 5, '비공개 후기', false),
  ('11111111-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000201', current_date, 3, '공개 후기', true);
select pg_temp.expect((select count(*) from public.reviews) = 2, 'alice: 내 후기 2개 조회');
insert into public.review_casts (review_id, actor_id, role_name) values
  ('11111111-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000301', '[샘플] 주인공'),
  ('11111111-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000302', '[샘플] 주인공');
select pg_temp.expect_denied($$insert into public.reviews (user_id, show_id, watched_at, rating) values
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000201', current_date, 1)$$, '남의 이름으로 후기 작성 거부');
select pg_temp.expect_denied($$insert into public.benefits (type, title) values ('event', 'x')$$, '관리자 아님: 혜택 등록 거부');
select pg_temp.expect_denied($$insert into public.shows (title, starts_on, ends_on) values ('x', current_date, current_date)$$, '관리자 아님: 공연 등록 거부');
select pg_temp.expect_denied($$insert into public.videos (youtube_id, title, actor_id) values ('AAAAAAAAAAA', 'x', '00000000-0000-4000-8000-000000000301')$$, '관리자 아님: 영상 등록 거부');
select pg_temp.expect_denied($$insert into public.seat_zones (theater_id, floor, name) values ('00000000-0000-4000-8000-000000000101', '1층', 'x')$$, '관리자 아님: 구역 등록 거부');
update public.shows set title = '해킹' where id = '00000000-0000-4000-8000-000000000201';
select pg_temp.expect((select title from public.shows where id = '00000000-0000-4000-8000-000000000201') <> '해킹', '관리자 아님: 공연 수정 무시');
insert into public.seat_reviews (theater_id, floor, zone_text, view_score, distance_score, sound_score)
  values ('00000000-0000-4000-8000-000000000101', '1층', '[샘플] 중앙', 4, 3, 5);
reset role;

-- ── bob ──
set role authenticated;
set request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002"}';
select pg_temp.expect((select count(*) from public.reviews) = 1, 'bob: 타인 비공개 후기 안 보임(공개 1개만)');
select pg_temp.expect((select count(*) from public.wishlists) = 0, 'bob: 타인 찜 안 보임');
select pg_temp.expect((select count(*) from public.follows) = 0, 'bob: 타인 팔로우 안 보임');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), 'https://push.example/bob', 'k', 'a');
select pg_temp.expect((select count(*) from public.review_casts) = 1, 'bob: 공개 후기의 캐스트만 보임(비공개 후기 캐스트 숨김)');
select pg_temp.expect_denied($$insert into public.review_casts (review_id, actor_id, role_name) values
  ('11111111-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000303', 'x')$$, '남의 후기에 캐스트 추가 거부');
update public.reviews set body = '수정됨' where id = '11111111-0000-4000-8000-000000000002';
delete from public.reviews where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
delete from public.seat_reviews;
reset role;
select pg_temp.expect((select body from public.reviews where id = '11111111-0000-4000-8000-000000000002') = '공개 후기', 'bob: 타인 후기 수정 무시');
select pg_temp.expect((select count(*) from public.reviews) = 2, 'bob: 타인 후기 삭제 무시');
select pg_temp.expect((select count(*) from public.seat_reviews) = 1, 'bob: 타인 좌석 후기 삭제 무시');

-- 도움돼요: 남의 후기엔 가능, 내 후기엔 불가, 수는 트리거로만
set role authenticated;
set request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002"}';
insert into public.seat_review_helpful (user_id, seat_review_id) select auth.uid(), id from public.seat_reviews limit 1;
select pg_temp.expect_denied($$update public.seat_reviews set helpful_count = 999$$, '도움돼요 수 직접 수정 거부');
reset role;
select pg_temp.expect((select helpful_count from public.seat_reviews limit 1) = 1, '도움돼요 수는 트리거로 1');
set role authenticated;
set request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000001"}';
select pg_temp.expect_denied($$insert into public.seat_review_helpful (user_id, seat_review_id) select auth.uid(), id from public.seat_reviews limit 1$$, '내 좌석 후기에 도움돼요 거부');
select pg_temp.expect_denied($$insert into public.seat_review_helpful (user_id, seat_review_id) select 'bbbbbbbb-0000-4000-8000-000000000002', id from public.seat_reviews limit 1$$, '남의 이름으로 도움돼요 거부');
update public.seat_reviews set comment = '본인 수정' where user_id = auth.uid();
reset role;
select pg_temp.expect((select comment from public.seat_reviews limit 1) = '본인 수정', '좌석 후기 본인 수정 가능(허용 컬럼)');
set role authenticated;
set request.jwt.claims = '{"sub":"bbbbbbbb-0000-4000-8000-000000000002"}';
delete from public.seat_review_helpful where user_id = auth.uid();
reset role;
select pg_temp.expect((select helpful_count from public.seat_reviews limit 1) = 0, '도움돼요 취소하면 0');

-- ── 비로그인 집계: 공개 후기만 ──
set role anon;
set request.jwt.claims = '{}';
select pg_temp.expect((select count(*) from public.reviews) = 1, '비로그인: 공개 후기만 보임');
select pg_temp.expect((select review_count = 1 and avg_rating = 3.0 from public.show_rating_stats
  where show_id = '00000000-0000-4000-8000-000000000201'), '평균 별점은 공개 후기만 집계');
reset role;

-- ── admin ──
set role authenticated;
set request.jwt.claims = '{"sub":"adadadad-0000-4000-8000-000000000003"}';
insert into public.benefits (type, title, created_by) values ('event', '[샘플] 관리자 등록', auth.uid());
select pg_temp.expect((select count(*) from public.benefits where title = '[샘플] 관리자 등록') = 1, '관리자: 혜택 등록');
insert into public.videos (youtube_id, title, actor_id) values ('AAAAAAAAAAA', '[샘플] 영상', '00000000-0000-4000-8000-000000000301');
select pg_temp.expect_denied($$insert into public.videos (youtube_id, title) values ('AAAAAAAAAAA', 'x')$$, '영상은 공연이나 배우에 연결돼야 함');
select pg_temp.expect_denied($$insert into public.videos (youtube_id, title, actor_id) values ('bad id', 'x', '00000000-0000-4000-8000-000000000301')$$, '영상 id 형식 검사');
select pg_temp.expect((select count(*) from public.reviews where not is_public) = 0, '관리자도 타인 비공개 후기는 안 보임');
select pg_temp.expect((select count(*) from public.push_subscriptions) = 0, '남의 푸시 구독 안 보임');
select pg_temp.expect_denied($$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('bbbbbbbb-0000-4000-8000-000000000002', 'https://push.example/x', 'k', 'a')$$, '남의 이름으로 구독 저장 거부');
select pg_temp.expect_denied($$insert into public.benefit_alerts (user_id, benefit_id, sent_at) select auth.uid(), id, now() from public.benefits limit 1$$, '알림을 보낸 것처럼 꾸며 등록 거부');
select pg_temp.expect((select count(*) from public.notification_outbox) = 0, '알림 대기열은 사용자에게 안 보임');
select pg_temp.expect((select count(*) from public.glossary where status = 'draft') > 0, '관리자: 초안 용어 보임');
select pg_temp.expect_denied($$insert into public.notification_outbox (user_id, kind, title, body) values (auth.uid(), 'test', 'x', 'y')$$, '알림 대기열에 직접 쓰기 거부');
reset role;

-- ── 시드 날짜(KST) ──
select pg_temp.expect((select count(*) from public.benefits
  where ends_at >= date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul'
    and ends_at <  date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' + interval '1 day') >= 1,
  '시드: 오늘(KST) 마감 혜택 존재');
select pg_temp.expect((select count(*) from public.benefits where ends_at < now()) = 1, '시드: 마감 지난 혜택 1개');
select pg_temp.expect((select count(*) from public.shows where title not like '[샘플]%') = 0, '시드: 모든 공연에 [샘플] 표시');
select pg_temp.expect((select count(*) from public.actors where name not like '[샘플]%') = 0, '시드: 모든 배우에 [샘플] 표시');
select pg_temp.expect((select count(*) from public.theaters where name not like '[샘플]%') = 0, '시드: 모든 극장에 [샘플] 표시');

\echo 'RLS 테스트 통과'
