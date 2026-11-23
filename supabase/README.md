# Supabase setup

ಸKala² keeps all of its data in one Supabase project: Postgres, Auth, Realtime and
Storage. The free plan is enough for personal use. This guide sets up a **new** project
from scratch.

## 1. Create the project

1. Sign in at [supabase.com](https://supabase.com) and click **New project**.
2. Pick an organization, a name (for example `kala`), a strong database password (save it
   in your password manager) and the region closest to you.
3. Wait until the dashboard says the project is ready (1–2 minutes).

## 2. Create the database

Run the nine files in `supabase/migrations/` **in order** (their names start with the
date, so alphabetical order is correct):

| File | Creates |
| ---- | ------- |
| `…01_foundation.sql` | profiles, workspaces, members, invitations, teams, modules, access helpers |
| `…02_work.sql` | projects, statuses, tasks, labels, comments, activity, time, meetings |
| `…03_content.sql` | categories, notes, whiteboards, dashboards, attachments, Storage buckets |
| `…04_personal.sql` | money (transactions, claims, budgets, savings, recurring), habits, reading, learning, goals |
| `…05_system.sql` | notifications, connected accounts, push, privacy vault, rate limits, search, realtime |
| `…06_fixes.sql` | private receipts, recurring-payment anchor day, reminder indexes, live money updates |
| `…07_work_log.sql` | the Work log (private daily diary) and switches it on in existing workspaces |
| `…08_project_documents.sql` | project document links (OneDrive / SharePoint folder and pinned files) |
| `…09_api_grants.sql` | table privileges for the API roles (new Supabase projects no longer grant them by default) |

**Option A: SQL editor (no tools needed).** Open **SQL Editor → New query**, paste the
whole first file, click **Run**, and repeat for each file. Every file must finish with
"Success. No rows returned" before you run the next one.

**Option B: Supabase CLI.**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>   # from Project Settings → General
npx supabase db push
```

## 3. Copy the keys into the app

In **Project Settings → API** (or **Data API** and **API Keys**):

| Supabase value | `.env.local` variable |
| -------------- | --------------------- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` / publishable key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` / secret key | `SUPABASE_SERVICE_ROLE_KEY` (**server only, never share it**) |

Then generate the app's own secrets:

```bash
cp .env.example .env.local
# 32-byte keys, base64:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # OAUTH_TOKEN_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # VAULT_PEPPER
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # CRON_SECRET
```

## 4. Configure Auth

**Authentication → URL Configuration**

- **Site URL**: `http://localhost:3000` while developing; your real URL once deployed.
- **Redirect URLs**: add `http://localhost:3000/auth/callback` and, later,
  `https://<your-domain>/auth/callback`.

**Authentication → Sign In / Providers → Email**

- Keep **Confirm email** switched **on**. Invitations only work for confirmed addresses,
  so nobody can join a workspace by registering an email they do not own.
- Supabase's built-in mailer only sends a few emails per hour. For anything beyond
  trying the app, add your own SMTP server under **Authentication → Emails → SMTP
  Settings** (Resend, Brevo and others have free tiers).

**Recommended hardening**

- **Authentication → Attack Protection**: enable CAPTCHA (Cloudflare Turnstile is free)
  and leaked-password protection, and set a minimum password length of 10.
- If you are the only person who will ever sign up, switch off **Allow new users to sign
  up** after creating your account; invited teammates can still be added later by turning
  it back on briefly.
- **Authentication → Multi-Factor**: enable TOTP so you can add an authenticator app.

## 5. Realtime

The migrations add the needed tables to the `supabase_realtime` publication and protect
the live channels (notes, whiteboards, presence) with Realtime Authorization. In
**Project Settings → Realtime**, make sure **Allow public access** is **off** so only
signed-in members can join channels.

## 6. Reminders (optional)

Push reminders and housekeeping run from a job that calls the app every minute. Once the
app is deployed:

1. Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`
   (`npx web-push generate-vapid-keys`) and `CRON_SECRET` in the app's environment.
2. Open `supabase/cron.sql`, replace `YOUR_DOMAIN` and `YOUR_CRON_SECRET`, and run it
   in the SQL editor.

## 7. Check it works

1. `pnpm dev`, open `http://localhost:3000` and create an account.
2. Confirm your email, sign in, and follow the setup steps to create your first
   workspace.
3. In the Supabase dashboard, **Table Editor → workspaces** should show one row.

## Testing the database locally

`pnpm test:db` applies every migration to an in-memory Postgres (PGlite) and checks the
access rules: isolation between users, roles, private projects, the privacy vault,
claims review and the server-only tables. It needs no Supabase project or Docker.

## Security model in one paragraph

Browsers talk to Supabase directly with the public key, so **row level security is the
real access control**. Every table has RLS on. Policies use set-returning helpers in the
non-exposed `private` schema (`member_workspaces()`, `visible_projects()` …) that Postgres
evaluates once per query. Tables with secrets (`user_connections`, `user_security`,
`unlock_grants`, `push_subscriptions`, `rate_limits`) have RLS with no policies and are
only reached by the server with the service-role key after it has checked who is signed in.
A protected workspace or note is invisible to RLS until the current browser session holds
an unexpired unlock grant, which only the server creates after verifying the user's PIN.
