-- 막간 16단계: 용어 사전(SPEC-2 B-3). 초안(draft)은 관리자만 보이고, 검수 후 published로 바꾸면 공개된다.
alter table public.glossary
  add column status text not null default 'draft' check (status in ('draft', 'published')),
  add column category text check (category in ('관극', '예매', '좌석', '기타'));

drop policy glossary_read on public.glossary;
create policy glossary_read on public.glossary for select using (status = 'published' or public.is_admin());

-- 뜻은 Claude가 쓴 초안 — 관리자가 검수한 뒤 공개해 주세요(모두 draft로 저장).
insert into public.glossary (term, category, meaning, example, status) values
  ('커튼콜', '관극', '공연이 끝난 뒤 배우들이 무대에 다시 나와 관객에게 인사하는 순서.', '오늘 커튼콜에서 배우들이 앙코르 곡을 불렀다.', 'draft'),
  ('막공', '관극', '''마지막 공연''의 줄임말. 시즌이나 특정 배우·회차 조합의 마지막 공연을 말한다.', '이번 시즌 막공은 일찍 매진됐다.', 'draft'),
  ('첫공', '관극', '''첫 공연''의 줄임말. 시즌의 첫 공연이나 특정 배우의 첫 출연 회차를 말한다.', '첫공이라 무대 인사가 있었다.', 'draft'),
  ('회전문', '관극', '같은 공연을 여러 번 반복해서 보는 것. 회전문을 돌듯 다시 극장에 들어간다는 뜻.', '이번 작품은 회전문 돌 만큼 좋았다.', 'draft'),
  ('로티', '관극', '''로터리 티켓''의 줄임말. 추첨으로 정해진 좌석을 싼 값에 살 수 있는 티켓.', '오늘 로티 당첨돼서 앞열에 앉았다.', 'draft'),
  ('선예매', '예매', '일반 예매보다 먼저 예매할 수 있는 기회. 유료 회원·카드사·팬클럽 등 조건이 정해져 있다.', '선예매로 원하는 회차를 먼저 잡았다.', 'draft'),
  ('오픈런', '예매', '공연 분야에서는 끝나는 날을 정하지 않고 계속 공연하는 방식을 말한다. 매장 문이 열리자마자 달려가는 것을 뜻하기도 해 문맥을 확인해야 한다(검수 필요).', '이 작품은 오픈런으로 공연 중이다.', 'draft'),
  ('취켓팅', '예매', '''취소표 티켓팅''의 줄임말. 다른 사람이 취소해서 다시 풀린 표를 잡는 것.', '새벽 취켓팅으로 겨우 표를 구했다.', 'draft'),
  ('블록', '좌석', '좌석을 통로 등을 기준으로 나눈 구역. 극장마다 이름 붙이는 방식이 다르다.', '1층 가운데 블록이 시야가 좋다.', 'draft'),
  ('시야방해석', '좌석', '기둥·난간·조명 장비 등 때문에 무대 일부가 가려 보이는 좌석. 보통 미리 안내하고 싸게 판다.', '시야방해석이지만 가격 대비 괜찮았다.', 'draft')
on conflict (term) do nothing;
