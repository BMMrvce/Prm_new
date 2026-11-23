-- Minimal stand-ins for the parts of a Supabase database the migrations rely on, so the
-- migrations and their row level security can be tested in PGlite (real Postgres in
-- WebAssembly) without Docker. Never run this against a real Supabase project.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create schema extensions;
create extension pgcrypto with schema extensions;
create extension citext with schema extensions;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner_id text
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

create schema realtime;
create table realtime.messages (id bigserial primary key, topic text);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$
  select current_setting('realtime.topic', true)
$$;

create publication supabase_realtime;

grant usage on schema public, auth, extensions, storage, realtime to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets, realtime.messages to authenticated, service_role;

-- Current Supabase projects grant the API roles nothing on new public tables; the
-- migrations must grant what they need (see 20261120000009_api_grants.sql).
