-- 로컬 테스트 전용: Supabase가 제공하는 auth 스키마·역할을 흉내 낸다. 실제 Supabase에는 넣지 않는다.
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;
-- Supabase 기본값처럼 public 새 테이블에 anon/authenticated 권한을 준다(실제 제한은 RLS).
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

-- PostgREST가 접속하는 역할(로컬 개발·E2E용 scripts/local-supabase.mjs)
do $$ begin
  if not exists (select from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end $$;
grant anon, authenticated to authenticator;
