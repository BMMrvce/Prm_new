# ಸKala²

Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + Supabase, run with Node.js and pnpm.
See `README.md` for the feature tour and `supabase/README.md` for the database.

## Architecture in one screen

- **Workspaces are data.** Users create workspaces (a company, a client, home…); URLs are
  `/w/<slug>/…`. Nothing in the code may branch on a workspace's name or template.
- **Modules are registered, not hardcoded.** `src/core/modules.ts` lists every feature
  module (id, label, icon, URL segment, group, help slug, options). The sidebar, settings,
  command palette, onboarding and help read from it. `workspace_modules` stores which
  modules a workspace uses. To add a module:
  1. add its manifest to `MODULES` (and to a template if it should be on by default),
  2. create `src/modules/<id>/` (queries + components) and
     `src/app/(app)/w/[workspace]/<segment>/page.tsx` wrapped in `<ModuleGate id>`,
  3. register dashboard widgets in `src/modules/dashboard/registry.tsx`,
  4. add a help article in `src/modules/help/articles.ts` (a test checks every module has one).
- **Data layer:** the browser talks to Supabase under RLS through React Query hooks in each
  module's `queries.ts`. Map rows to domain types there; use `must()` / `maybe()` from
  `src/lib/supabase/client.ts`; put query keys in `src/core/query.tsx` or under
  `['ws', workspaceId, …]`. Realtime invalidation lives in `src/core/realtime.ts`.
- **Server code** (`src/server/*`, `src/app/api/*`) is the only place that uses the
  service-role key (`src/lib/supabase/admin.ts`), always after `currentUser()` /
  `currentSession()` and an explicit permission check. Rate-limit with `allow()`.
- **Categories and lists are user-defined** (`categories` table, `src/modules/categories`).
  Never hardcode categories, currencies, reminder times or workspace names.

## Rules

- Colors only from design tokens (`bg-primary`, `text-ink-2`, `border-line`, or
  `color(key)` from `src/core/colors.ts`). No hex values in components; dark mode depends on it.
- Use the UI kit in `src/ui/*` (Button, Field, Dialog, Menu, Tabs, toast, Skeleton…).
  Every control needs a label; every list needs loading, empty and error states.
- Security: RLS is the real access control. New tables need RLS with policies that use the
  `private.*_workspaces()` helpers (`supabase/migrations`), plus tests in
  `supabase/tests/database.test.ts`. Server-only tables get RLS with no policies.
- `src/proxy.ts` requires a session for every route except `PUBLIC_PATHS`; it also sets
  the CSP (per-request nonce). New public routes must be added there deliberately.
- Server-only secrets (see `.env.example`) must never use the `NEXT_PUBLIC_` prefix.
- Before finishing a change, run `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build`.

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.
