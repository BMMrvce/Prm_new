-- Table privileges for the API roles, granted explicitly.
--
-- Older Supabase projects granted every table in `public` to anon, authenticated and
-- service_role by default, and the earlier migrations were written assuming that. New
-- projects no longer do, so without this file every request fails with
-- "permission denied for table …" (42501), even for the service role.
--
-- Row level security still decides which rows each user sees; these grants only let the
-- API roles reach the tables at all. Safe to run more than once.

grant usage on schema public to anon, authenticated, service_role;

-- The server (service role) may use every table; it bypasses RLS by design.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Signed-in users: plain reads and writes, filtered by the RLS policies.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Every policy targets `authenticated`; visitors who are not signed in get no tables.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Server-only tables stay closed to the browser (as in 01_foundation and 05_system).
revoke all on public.unlock_grants, public.user_connections, public.push_subscriptions,
  public.reminder_deliveries, public.user_security, public.security_events,
  public.rate_limits
  from anon, authenticated;
grant select on public.security_events to authenticated;

-- Tables created by later migrations get the same treatment. Server-only tables must
-- still `revoke all … from anon, authenticated` themselves, as the ones above do.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
