/**
 * Applies every migration to a throwaway PGlite database and checks the access rules:
 * isolation between users and workspaces, roles, private projects, the privacy vault,
 * claims review and the server-only tables. Run with `pnpm test:db`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { citext } from '@electric-sql/pglite/contrib/citext'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { beforeAll, describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const ids = {
  alice: '00000000-0000-4000-8000-00000000000a',
  bob: '00000000-0000-4000-8000-00000000000b',
  carol: '00000000-0000-4000-8000-00000000000c',
  mallory: '00000000-0000-4000-8000-00000000000d',
}
const sessions = {
  alice: '10000000-0000-4000-8000-00000000000a',
  aliceOtherDevice: '20000000-0000-4000-8000-00000000000a',
}

let db: PGlite

type Who = keyof typeof ids

/** Runs `fn` as a signed-in user, the way PostgREST does: role + JWT claims, per transaction. */
async function as<T>(who: Who, fn: (tx: Transaction) => Promise<T>, session?: string): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: ids[who], role: 'authenticated', session_id: session ?? ids[who] }),
    ])
    await tx.exec('set local role authenticated')
    return fn(tx)
  })
}

async function asService<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec('set local role service_role')
    return fn(tx)
  })
}

async function rows<T = Record<string, unknown>>(tx: Transaction, sql: string, params: unknown[] = []) {
  return (await tx.query<T>(sql, params)).rows
}

async function fails(promise: Promise<unknown>) {
  let failed = false
  try {
    await promise
  } catch {
    failed = true
  }
  return failed
}

let acme: { id: string; slug: string }
let publicProject: string
let privateProject: string

beforeAll(async () => {
  db = new PGlite({ extensions: { citext, pgcrypto } })
  await db.exec(readFileSync(path.join(root, 'tests/supabase-stubs.sql'), 'utf8'))
  const dir = path.join(root, 'migrations')
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(path.join(dir, file), 'utf8'))
    } catch (error) {
      throw new Error(`${file}: ${(error as Error).message}`)
    }
  }
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
      ('${ids.alice}', 'alice@acme.test', now(), '{"full_name":"Alice"}'),
      ('${ids.bob}', 'bob@acme.test', now(), '{"full_name":"Bob"}'),
      ('${ids.carol}', 'carol@acme.test', now(), '{"full_name":"Carol"}'),
      ('${ids.mallory}', 'mallory@evil.test', null, '{"full_name":"Mallory"}');
  `)

  acme = await as('alice', async (tx) => {
    const [ws] = await rows<{ id: string; slug: string }>(
      tx,
      `select id, slug from public.create_workspace('Acme Corp', array['tasks','board','notes'], 'company')`,
    )
    return ws
  })
  ;[publicProject, privateProject] = await as('alice', async (tx) => {
    const a = await rows<{ id: string }>(
      tx,
      `insert into public.projects (workspace_id, name, slug, created_by) values ($1, 'Website', 'website', $2) returning id`,
      [acme.id, ids.alice],
    )
    const b = await rows<{ id: string }>(
      tx,
      `insert into public.projects (workspace_id, name, slug, visibility, created_by) values ($1, 'Board pack', 'board-pack', 'private', $2) returning id`,
      [acme.id, ids.alice],
    )
    return [a[0].id, b[0].id]
  })
}, 120_000)

describe('workspaces', () => {
  it('creates a workspace with a unique slug, owner, statuses and modules', async () => {
    expect(acme.slug).toBe('acme-corp')
    const result = await as('alice', async (tx) => ({
      statuses: await rows(tx, `select category from public.task_statuses where workspace_id = $1`, [acme.id]),
      modules: await rows(tx, `select module_id from public.workspace_modules where workspace_id = $1 order by position`, [acme.id]),
      role: await rows(tx, `select role from public.workspace_members where workspace_id = $1`, [acme.id]),
    }))
    expect(result.statuses).toHaveLength(5)
    expect(result.modules.map((m) => m.module_id)).toEqual(['tasks', 'board', 'notes'])
    expect(result.role).toEqual([{ role: 'owner' }])

    const second = await as('alice', (tx) => rows<{ slug: string }>(tx, `select slug from public.create_workspace('Acme Corp')`))
    expect(second[0].slug).toBe('acme-corp-2')
  })

  it('hides other people’s workspaces, profiles and data', async () => {
    const seen = await as('bob', async (tx) => ({
      workspaces: await rows(tx, `select id from public.workspaces where id = $1`, [acme.id]),
      projects: await rows(tx, `select id from public.projects where workspace_id = $1`, [acme.id]),
      profiles: await rows(tx, `select id from public.profiles where id = $1`, [ids.alice]),
      people: await rows(tx, `select id from public.search_people('ali')`),
    }))
    expect(seen.workspaces).toHaveLength(0)
    expect(seen.projects).toHaveLength(0)
    expect(seen.profiles).toHaveLength(0)
    expect(seen.people).toHaveLength(0)
  })

  it('refuses writes into a workspace you do not belong to', async () => {
    expect(
      await fails(
        as('bob', (tx) =>
          tx.query(`insert into public.tasks (workspace_id, title, creator_id) values ($1, 'x', $2)`, [acme.id, ids.bob]),
        ),
      ),
    ).toBe(true)
  })
})

describe('invitations and roles', () => {
  it('requires a confirmed email that matches the invitation', async () => {
    const token = await as('alice', async (tx) => {
      const [row] = await rows<{ token: string }>(tx, `select public.invite_member($1, 'mallory@evil.test', 'member') as token`, [acme.id])
      return row.token
    })
    expect(await fails(as('mallory', (tx) => tx.query(`select public.accept_invitation(null, $1)`, [token])))).toBe(true)
    // Bob holds Mallory's link but it is not his address.
    expect(await fails(as('bob', (tx) => tx.query(`select public.accept_invitation(null, $1)`, [token])))).toBe(true)
  })

  it('lets an invited member see workspace projects but not private ones', async () => {
    await as('alice', (tx) => tx.query(`select public.invite_member($1, 'bob@acme.test', 'member')`, [acme.id]))
    const invites = await as('bob', (tx) => rows<{ id: string }>(tx, `select id from public.my_invitations()`))
    expect(invites).toHaveLength(1)
    await as('bob', (tx) => tx.query(`select public.accept_invitation($1)`, [invites[0].id]))

    await as('alice', async (tx) => {
      await tx.query(`insert into public.tasks (workspace_id, project_id, title, creator_id) values ($1, $2, 'Launch site', $3)`, [acme.id, publicProject, ids.alice])
      await tx.query(`insert into public.tasks (workspace_id, project_id, title, creator_id) values ($1, $2, 'Secret deck', $3)`, [acme.id, privateProject, ids.alice])
      const [secret] = await rows<{ id: string }>(tx, `select id from public.tasks where title = 'Secret deck'`)
      await tx.query(`insert into public.comments (task_id, author_id, body) values ($1, $2, 'confidential')`, [secret.id, ids.alice])
    })

    const seen = await as('bob', async (tx) => ({
      projects: await rows<{ name: string }>(tx, `select name from public.projects order by name`),
      tasks: await rows<{ title: string }>(tx, `select title from public.tasks order by title`),
      comments: await rows(tx, `select body from public.comments`),
      alice: await rows(tx, `select full_name from public.profiles where id = $1`, [ids.alice]),
    }))
    expect(seen.projects.map((p) => p.name)).toEqual(['Website'])
    expect(seen.tasks.map((t) => t.title)).toEqual(['Launch site'])
    expect(seen.comments).toHaveLength(0)
    expect(seen.alice).toEqual([{ full_name: 'Alice' }])
  })

  it('stops members from promoting themselves or removing the last owner', async () => {
    expect(
      await fails(as('bob', (tx) => tx.query(`update public.workspace_members set role = 'owner' where user_id = $1`, [ids.bob]))),
    ).toBe(false) // no error, but RLS matches no rows for a non-admin…
    const role = await as('bob', (tx) => rows(tx, `select role from public.workspace_members where user_id = $1 and workspace_id = $2`, [ids.bob, acme.id]))
    expect(role).toEqual([{ role: 'member' }])
    expect(
      await fails(as('alice', (tx) => tx.query(`delete from public.workspace_members where user_id = $1 and workspace_id = $2`, [ids.alice, acme.id]))),
    ).toBe(true)
  })

  it('shows guests only the projects they are on', async () => {
    await as('alice', (tx) => tx.query(`select public.invite_member($1, 'carol@acme.test', 'guest')`, [acme.id]))
    const [invite] = await as('carol', (tx) => rows<{ id: string }>(tx, `select id from public.my_invitations()`))
    await as('carol', (tx) => tx.query(`select public.accept_invitation($1)`, [invite.id]))
    expect(await as('carol', (tx) => rows(tx, `select id from public.projects`))).toHaveLength(0)
    await as('alice', (tx) =>
      tx.query(`insert into public.project_members (project_id, user_id) values ($1, $2)`, [publicProject, ids.carol]),
    )
    expect(await as('carol', (tx) => rows(tx, `select id from public.projects`))).toHaveLength(1)
    expect(
      await fails(as('carol', (tx) => tx.query(`insert into public.tasks (workspace_id, title, creator_id) values ($1, 'guest task', $2)`, [acme.id, ids.carol]))),
    ).toBe(true)
  })
})

describe('tasks', () => {
  it('numbers tasks, tracks completion and repeats recurring tasks', async () => {
    const result = await as('alice', async (tx) => {
      const [task] = await rows<{ id: string; task_number: number }>(
        tx,
        `insert into public.tasks (workspace_id, title, creator_id, due_at, recurrence)
         values ($1, 'Weekly report', $2, now(), '{"freq":"weekly","interval":1}') returning id, task_number`,
        [acme.id, ids.alice],
      )
      await tx.query(
        `update public.tasks set status_id = (select id from public.task_statuses where workspace_id = $1 and category = 'done') where id = $2`,
        [acme.id, task.id],
      )
      const done = await rows<{ completed_at: string | null; status_category: string }>(tx, `select completed_at, status_category from public.tasks where id = $1`, [task.id])
      const copies = await rows(tx, `select id from public.tasks where title = 'Weekly report' and status_category = 'todo'`)
      const activity = await rows(tx, `select action from public.activity_events where task_id = $1 order by id`, [task.id])
      return { task, done: done[0], copies, activity }
    })
    expect(result.task.task_number).toBeGreaterThan(0)
    expect(result.done.status_category).toBe('done')
    expect(result.done.completed_at).not.toBeNull()
    expect(result.copies).toHaveLength(1)
    expect(result.activity.map((a) => a.action)).toEqual(['task.created', 'task.status'])
  })

  it('finds tasks by word prefix, within what you may see', async () => {
    const alice = await as('alice', (tx) => rows<{ title: string }>(tx, `select title from public.search_all('secr')`))
    const bob = await as('bob', (tx) => rows<{ title: string }>(tx, `select title from public.search_all('secr')`))
    expect(alice.map((r) => r.title)).toContain('Secret deck')
    expect(bob).toHaveLength(0)
  })
})

describe('collaboration', () => {
  it('lets collaborators edit a shared note but not move or protect it', async () => {
    const note = await as('alice', async (tx) => {
      const [row] = await rows<{ id: string }>(
        tx,
        `insert into public.notes (workspace_id, user_id, title, content) values ($1, $2, 'Plan', '<p>v1</p>') returning id`,
        [acme.id, ids.alice],
      )
      await tx.query(`insert into public.note_members (note_id, user_id) values ($1, $2)`, [row.id, ids.bob])
      return row.id
    })
    await as('bob', (tx) =>
      tx.query(`update public.notes set content = '<p>v2</p>', protected = true, project_id = $2 where id = $1`, [note, publicProject]),
    )
    const [after] = await as('alice', (tx) =>
      rows<{ content: string; protected: boolean; project_id: string | null }>(tx, `select content, protected, project_id from public.notes where id = $1`, [note]),
    )
    expect(after).toEqual({ content: '<p>v2</p>', protected: false, project_id: null })
    expect(await as('carol', (tx) => rows(tx, `select id from public.notes where id = $1`, [note]))).toHaveLength(0)
  })

  it('notifies people when they are assigned or a task gets a comment', async () => {
    await as('alice', async (tx) => {
      const [task] = await rows<{ id: string }>(
        tx,
        `insert into public.tasks (workspace_id, project_id, title, creator_id) values ($1, $2, 'Review copy', $3) returning id`,
        [acme.id, publicProject, ids.alice],
      )
      await tx.query(`insert into public.task_assignees (task_id, user_id) values ($1, $2)`, [task.id, ids.bob])
      await tx.query(`insert into public.comments (task_id, author_id, body) values ($1, $2, 'Please check')`, [task.id, ids.alice])
    })
    const mine = await as('bob', (tx) => rows<{ kind: string; link: string }>(tx, `select kind, link from public.notifications order by created_at`))
    expect(mine.map((n) => n.kind)).toEqual(expect.arrayContaining(['task.assigned', 'comment.created']))
    expect(mine.find((n) => n.kind === 'task.assigned')?.link).toMatch(/^\/w\/acme-corp\/tasks\?task=/)
    expect(await as('carol', (tx) => rows(tx, `select id from public.notifications where kind = 'task.assigned'`))).toHaveLength(0)
  })
})

describe('privacy vault', () => {
  it('hides a protected workspace until this session is unlocked', async () => {
    await asService((tx) => tx.query(`update public.workspaces set protected = true where id = $1`, [acme.id]))
    const count = (session: string) =>
      as('alice', (tx) => rows(tx, `select id from public.tasks where workspace_id = $1`, [acme.id]), session)

    expect(await count(sessions.alice)).toHaveLength(0)
    // The workspace itself stays listed (name only) so the switcher can show a lock.
    expect(await as('alice', (tx) => rows(tx, `select id from public.workspaces where id = $1`, [acme.id]), sessions.alice)).toHaveLength(1)

    await asService((tx) =>
      tx.query(`insert into public.unlock_grants (user_id, session_id, expires_at) values ($1, $2, now() + interval '15 minutes')`, [ids.alice, sessions.alice]),
    )
    expect((await count(sessions.alice)).length).toBeGreaterThan(0)
    expect(await count(sessions.aliceOtherDevice)).toHaveLength(0)

    await asService((tx) => tx.query(`update public.workspaces set protected = false where id = $1`, [acme.id]))
  })

  it('does not let the browser switch protection off or forge grants', async () => {
    await asService((tx) => tx.query(`update public.workspaces set protected = true where id = $1`, [acme.id]))
    await as('alice', (tx) => tx.query(`update public.workspaces set protected = false where id = $1`, [acme.id]), sessions.alice)
    const [ws] = await asService((tx) => rows<{ protected: boolean }>(tx, `select protected from public.workspaces where id = $1`, [acme.id]))
    expect(ws.protected).toBe(true)
    expect(
      await fails(as('alice', (tx) => tx.query(`insert into public.unlock_grants (user_id, session_id, expires_at) values ($1, $1, now() + interval '1 day')`, [ids.alice]))),
    ).toBe(true)
    await asService((tx) => tx.query(`update public.workspaces set protected = false where id = $1`, [acme.id]))
  })

  it('hides protected notes and refuses to share them', async () => {
    const note = await as('alice', async (tx) => {
      const [row] = await rows<{ id: string }>(
        tx,
        `insert into public.notes (workspace_id, user_id, title) values ($1, $2, 'Salary review') returning id`,
        [acme.id, ids.alice],
      )
      await tx.query(`update public.notes set protected = true where id = $1`, [row.id])
      return row.id
    }, sessions.alice)
    expect(await as('alice', (tx) => rows(tx, `select id from public.notes where id = $1`, [note]), sessions.aliceOtherDevice)).toHaveLength(0)
    expect(await as('alice', (tx) => rows(tx, `select id from public.notes where id = $1`, [note]), sessions.alice)).toHaveLength(1)
    expect(
      await fails(as('alice', (tx) => tx.query(`insert into public.note_members (note_id, user_id) values ($1, $2)`, [note, ids.bob]), sessions.alice)),
    ).toBe(true)
  })
})

describe('money', () => {
  it('routes claims through review and never lets owners approve themselves', async () => {
    const claim = await as('bob', async (tx) => {
      const [row] = await rows<{ id: string; status: string }>(
        tx,
        `insert into public.transactions (workspace_id, user_id, kind, description, amount, currency, status)
         values ($1, $2, 'reimbursement', 'Taxi', 25, 'USD', 'approved') returning id, status`,
        [acme.id, ids.bob],
      )
      await tx.query(`update public.transactions set status = 'paid' where id = $1`, [row.id])
      return row
    })
    expect(claim.status).toBe('pending')
    expect(await fails(as('bob', (tx) => tx.query(`select public.review_claim($1, 'approved')`, [claim.id])))).toBe(true)
    await as('alice', (tx) => tx.query(`select public.review_claim($1, 'approved')`, [claim.id]))
    const [after] = await as('bob', (tx) => rows<{ status: string }>(tx, `select status from public.transactions where id = $1`, [claim.id]))
    expect(after.status).toBe('approved')
    expect(await fails(as('bob', (tx) => tx.query(`update public.transactions set amount = 999 where id = $1`, [claim.id])))).toBe(true)
  })

  it('shows receipts only to their uploader and workspace admins', async () => {
    const path = `${acme.id}/receipts/r1-taxi.pdf`
    await asService((tx) =>
      tx.query(`insert into storage.objects (bucket_id, name, owner_id) values ('attachments', $1, $2), ('attachments', $3, $2)`, [path, ids.bob, `${acme.id}/files/plan.pdf`]),
    )
    const sees = (who: Who) => as(who, (tx) => rows<{ name: string }>(tx, `select name from storage.objects where bucket_id = 'attachments' order by name`))
    expect((await sees('bob')).map((r) => r.name)).toContain(path)
    expect((await sees('alice')).map((r) => r.name)).toContain(path)
    const carol = (await sees('carol')).map((r) => r.name)
    expect(carol).not.toContain(path)
    expect(carol).toContain(`${acme.id}/files/plan.pdf`)
  })

  it('keeps personal finance private from admins', async () => {
    await as('bob', (tx) =>
      tx.query(`insert into public.transactions (workspace_id, user_id, kind, description, amount, currency) values ($1, $2, 'expense', 'Lunch', 10, 'USD')`, [acme.id, ids.bob]),
    )
    const seen = await as('alice', (tx) => rows<{ description: string }>(tx, `select description from public.transactions`))
    expect(seen.map((r) => r.description)).not.toContain('Lunch')
  })
})

describe('server-only tables', () => {
  it('are closed to the browser', async () => {
    for (const table of ['user_connections', 'user_security', 'unlock_grants', 'push_subscriptions', 'rate_limits']) {
      expect(await fails(as('alice', (tx) => tx.query(`select * from public.${table}`))), table).toBe(true)
    }
    expect(await fails(as('alice', (tx) => tx.query(`select public.rate_limit_hit('x', 1, 60)`)))).toBe(true)
    expect(await asService((tx) => rows(tx, `select public.rate_limit_hit('x', 1, 60) as ok`))).toEqual([{ ok: true }])
    expect(await asService((tx) => rows(tx, `select public.rate_limit_hit('x', 1, 60) as ok`))).toEqual([{ ok: false }])
  })

  it('grant table access explicitly: service role yes, signed-out visitors no', async () => {
    for (const table of ['profiles', 'workspaces', 'tasks', 'user_security', 'rate_limits']) {
      expect(await asService((tx) => rows(tx, `select 1 from public.${table} limit 1`)), table).toBeDefined()
    }
    for (const table of ['profiles', 'workspaces', 'tasks']) {
      const anon = db.transaction(async (tx) => {
        await tx.exec('set local role anon')
        await tx.query(`select 1 from public.${table}`)
      })
      expect(await fails(anon), table).toBe(true)
    }
    expect(await as('alice', (tx) => rows(tx, `update public.profiles set timezone = 'UTC' where id = $1 returning id`, [ids.alice]))).toHaveLength(1)
  })

  it('authorizes realtime channels per note, board and workspace', async () => {
    const check = (who: Who, topic: string) =>
      as(who, async (tx) => {
        const [row] = await rows<{ ok: boolean }>(tx, `select private.can_join_topic($1) as ok`, [topic])
        return row.ok
      })
    expect(await check('alice', `workspace:${acme.id}`)).toBe(true)
    expect(await check('mallory', `workspace:${acme.id}`)).toBe(false)
    expect(await check('alice', 'workspace:not-a-uuid')).toBe(false)
  })
})

describe('work log', () => {
  it('is private to its author, even from workspace admins', async () => {
    await as('alice', (tx) => tx.query(`insert into public.work_log_entries (workspace_id, user_id, log_date, body) values ($1, $2, current_date, 'Reviewed the Q3 plan')`, [acme.id, ids.alice]))
    expect(await as('alice', (tx) => rows(tx, `select body from public.work_log_entries where workspace_id = $1`, [acme.id]))).toEqual([{ body: 'Reviewed the Q3 plan' }])
    for (const who of ['bob', 'mallory'] as Who[]) {
      expect(await as(who, (tx) => rows(tx, `select id from public.work_log_entries`)), who).toHaveLength(0)
    }
    expect(await fails(as('mallory', (tx) => tx.query(`insert into public.work_log_entries (workspace_id, user_id, log_date, body) values ($1, $2, current_date, 'x')`, [acme.id, ids.mallory])))).toBe(true)
    expect(await fails(as('bob', (tx) => tx.query(`insert into public.work_log_entries (workspace_id, user_id, log_date, body) values ($1, $2, current_date, 'x')`, [acme.id, ids.alice])))).toBe(true)
  })
})

describe('project documents', () => {
  it('follow project visibility and only accept https links', async () => {
    await as('alice', async (tx) => {
      await tx.query(`insert into public.project_links (workspace_id, project_id, kind, title, url) values ($1, $2, 'folder', 'Site docs', 'https://1drv.ms/f/s!abc')`, [acme.id, publicProject])
      await tx.query(`insert into public.project_links (workspace_id, project_id, kind, title, url) values ($1, $2, 'folder', 'Board papers', 'https://contoso.sharepoint.com/x')`, [acme.id, privateProject])
    })
    expect(await as('bob', (tx) => rows(tx, `select title from public.project_links order by title`))).toEqual([{ title: 'Site docs' }])
    expect(await as('mallory', (tx) => rows(tx, `select title from public.project_links`))).toHaveLength(0)
    expect(await fails(as('alice', (tx) => tx.query(`insert into public.project_links (workspace_id, project_id, title, url) values ($1, $2, 'x', 'javascript:alert(1)')`, [acme.id, publicProject])))).toBe(true)
    expect(await fails(as('mallory', (tx) => tx.query(`insert into public.project_links (workspace_id, project_id, title, url) values ($1, $2, 'x', 'https://evil.test')`, [acme.id, publicProject])))).toBe(true)
  })
})
