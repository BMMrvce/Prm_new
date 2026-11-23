# ಸKala²

A workspace and project manager for people who work across several companies, teams and
projects. Each company, client or area of life is its own **workspace**, with the
**modules** you choose: Tasks, Board (Kanban), Projects, Inbox, Calendar, Notes,
Whiteboard, Time, Money, Habits, Reading, Learning and Goals.

Built with Next.js 16, React 19, Tailwind CSS v4 and Supabase.

## Highlights

- Workspaces you create, rename, brand, archive; members, roles, invitations and teams
- Modules switched on per workspace; everything (columns, categories, currency) is yours to define
- Customisable dashboard per workspace and across all workspaces
- Kanban with custom columns, subtasks, labels, dependencies, recurring tasks, comments
- Live collaboration in notes and whiteboards
- Privacy vault: protect workspaces and notes with a PIN; hidden by the database while locked
- Searchable help centre and a guided first-run setup with an optional tour

## Getting started

Requires Node.js 20.9+ and pnpm.

```bash
pnpm install
cp .env.example .env.local   # fill in the values
pnpm dev                     # http://localhost:3000
```

1. **Database:** follow [`supabase/README.md`](supabase/README.md) to create your Supabase
   project and run the migrations.
2. **Hosting:** see [`docs/HOSTING.md`](docs/HOSTING.md) for free hosting options.
3. **Contributing / architecture:** see [`AGENTS.md`](AGENTS.md).

| Script | What it does |
| ------ | ------------ |
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm typecheck` | Route types + TypeScript |
| `pnpm lint` | oxlint |
| `pnpm test` | Unit tests and database access-rule tests (PGlite) |
| `pnpm test:db` | Only the database tests |
