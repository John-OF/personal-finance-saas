-- One-time database bootstrap, run as `postgres` (SQL editor or psql). Idempotent.
--
-- Production data lives in schema `app`, local development data in `app_dev` (same Supabase project).
-- Each schema has its own API role whose default search_path points at it, so the connection string
-- alone decides the schema and development credentials cannot reach production data.
--
-- The roles are created without a password (they cannot log in yet); `pnpm --filter @pf/api db:credentials`
-- assigns random ones. Tables are created by `postgres` through migrations; the API roles only get DML.

create schema if not exists app;
create schema if not exists app_dev;

do $$
begin
  if not exists (select from pg_roles where rolname = 'pf_api') then
    create role pf_api login noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'pf_api_dev') then
    create role pf_api_dev login noinherit;
  end if;
end
$$;

alter role pf_api set search_path = app;
alter role pf_api_dev set search_path = app_dev;

grant usage on schema app to pf_api;
grant usage on schema app_dev to pf_api_dev;

alter default privileges for role postgres in schema app
  grant select, insert, update, delete on tables to pf_api;
alter default privileges for role postgres in schema app
  grant usage, select on sequences to pf_api;

alter default privileges for role postgres in schema app_dev
  grant select, insert, update, delete on tables to pf_api_dev;
alter default privileges for role postgres in schema app_dev
  grant usage, select on sequences to pf_api_dev;
