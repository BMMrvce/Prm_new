# Hosting ಸKala² for free

ಸKala² has two parts:

1. **The database and sign-in**: your Supabase project (free plan). Set it up first with
   [`supabase/README.md`](../supabase/README.md).
2. **The web app**: this Next.js app, which needs a host that runs **Node.js** (the
   Inbox talks to mail servers over IMAP/SMTP and the reminders send push messages).

Free plans change often. Check each provider's current limits and terms before you rely
on them.

## Which host?

| Host | Free plan suits | Notes |
| ---- | --------------- | ----- |
| **Vercel (Hobby)** | Personal, non-commercial use | Easiest: made by the Next.js team, deploys on every push, HTTPS included. Its terms limit Hobby to non-commercial use, so use the Pro plan (or another host) for paid client work. |
| **Render (free web service)** | Trying it out, light use | Runs the app as a normal Node server. Free services sleep after a period without traffic, so the first visit afterwards takes a while to wake up. |
| **Your own small server** (for example an always-free cloud VM) | Full control, always on | Use the Dockerfile in this repository. You maintain updates, HTTPS and backups yourself. |
| Cloudflare Workers or Netlify | Advanced | Possible with their Next.js adapters, but the Inbox's IMAP/SMTP connections may not work in those runtimes. Test before relying on them. |

**Recommendation:** start on **Vercel Hobby** for personal use. If you use it for paid
work, move to Vercel Pro or self-host with Docker.

## Option A: Vercel (recommended for personal use)

1. Push this repository to your own GitHub account (see "Publishing your fork" below).
2. Sign in at [vercel.com](https://vercel.com) with GitHub, select **Add New → Project**
   and import the repository. Vercel detects Next.js and uses `vercel.json`.
3. Under **Environment Variables**, add every variable from `.env.example` that you use:
   - required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`, `OAUTH_TOKEN_ENCRYPTION_KEY`, `VAULT_PEPPER`,
     `CRON_SECRET`, `SITE_URL` (your Vercel URL, e.g. `https://kala.vercel.app`)
   - optional: Google sign-in for Gmail/YouTube and the VAPID keys for push reminders
4. Select **Deploy**. When it finishes, open the URL.
5. In Supabase, **Authentication → URL Configuration**: set **Site URL** to your Vercel
   URL and add `https://<your-domain>/auth/callback` to **Redirect URLs**.
6. Optional reminders: run `supabase/cron.sql` (with your domain and `CRON_SECRET`) in the
   Supabase SQL editor. Supabase calls the app every minute; Vercel's free cron can't.
7. Optional Google sign-in: add `https://<your-domain>/api/oauth/google/callback` to your
   Google OAuth client's redirect URIs.

## Option B: Render

1. At [render.com](https://render.com) choose **New → Web Service** and connect the
   repository.
2. Runtime **Node**, build command `pnpm install --frozen-lockfile && pnpm build`, start
   command `pnpm start`.
3. Add the same environment variables as for Vercel (with `SITE_URL` set to the Render URL).
4. Health check path: `/api/health`.
5. Then follow steps 5–7 of Option A with the Render URL.

## Option C: Docker on your own server

```bash
docker build -t kala .
docker run -d --name kala -p 3000:3000 --env-file .env.production --restart unless-stopped kala
```

Put a reverse proxy with HTTPS in front of it (Caddy does this automatically), point your
domain at the server, and follow steps 5–7 of Option A with your domain. The app sends
`Strict-Transport-Security` when served over HTTPS.

## Before you share it with anyone

- [ ] Email confirmation is on in Supabase, with your own SMTP sender configured.
- [ ] CAPTCHA and leaked-password protection are on (Supabase → Authentication → Attack Protection).
- [ ] If only you should sign up, switch off new sign-ups in Supabase after creating your account.
- [ ] All secrets are set in the host, not committed. `.env*` files are git-ignored.
- [ ] Supabase backups: the free plan has none. Export your data regularly
      (Supabase → Database → Backups, or `npx supabase db dump`).
- [ ] Free Supabase projects pause after a period of inactivity; open the dashboard to
      resume one if that happens.

## Publishing your fork

To publish to your own GitHub:

```bash
# create an empty private repository on GitHub first (no README), then:
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

CI (`.github/workflows/ci.yml`) then runs typecheck, lint, tests and a build on every push.
