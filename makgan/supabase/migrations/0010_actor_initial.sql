-- 막간: 배우 이름 묶음(ㄱㄴㄷ…). 한글 첫소리(쌍자음은 합침) / 알파벳 'A' / 그 밖 '#'.
-- 코드포인트 순서(collate "C")로 비교해 서버의 정렬 규칙과 상관없이 같은 결과를 낸다. lib/initials.ts와 같은 규칙.
create function public.actor_initial(name text) returns text
language sql immutable parallel safe as $$
  select case
    when name collate "C" >= '가' and name collate "C" < '나' then 'ㄱ'
    when name collate "C" >= '나' and name collate "C" < '다' then 'ㄴ'
    when name collate "C" >= '다' and name collate "C" < '라' then 'ㄷ'
    when name collate "C" >= '라' and name collate "C" < '마' then 'ㄹ'
    when name collate "C" >= '마' and name collate "C" < '바' then 'ㅁ'
    when name collate "C" >= '바' and name collate "C" < '사' then 'ㅂ'
    when name collate "C" >= '사' and name collate "C" < '아' then 'ㅅ'
    when name collate "C" >= '아' and name collate "C" < '자' then 'ㅇ'
    when name collate "C" >= '자' and name collate "C" < '차' then 'ㅈ'
    when name collate "C" >= '차' and name collate "C" < '카' then 'ㅊ'
    when name collate "C" >= '카' and name collate "C" < '타' then 'ㅋ'
    when name collate "C" >= '타' and name collate "C" < '파' then 'ㅌ'
    when name collate "C" >= '파' and name collate "C" < '하' then 'ㅍ'
    when name collate "C" >= '하' and name collate "C" <= '힣' then 'ㅎ'
    when name ~ '^[A-Za-z]' then 'A'
    else '#'
  end
$$;

alter table public.actors add column initial text generated always as (public.actor_initial(name)) stored;
create index actors_initial_name on public.actors (initial, name);

-- 묶음별 인원(목록 맨 위 숫자)
create function public.actor_initial_counts() returns table (initial text, n int)
language sql stable as $$ select initial, count(*)::int from public.actors group by initial $$;
grant execute on function public.actor_initial_counts() to anon, authenticated;
