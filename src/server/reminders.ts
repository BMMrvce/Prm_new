import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { taskHref, workspaceHref } from '@/core/routes'
import { pushToUsers, type PushPayload } from './push'
import {
  clip,
  digestDay,
  localParts,
  MAX_DUE_LEAD,
  MAX_MEETING_LEAD,
  minutesUntil,
  pushText,
  reminderKey,
  reminderSettings,
  taskRecipients,
  withinLead,
  type ReminderSettings,
} from './reminder-logic'

/**
 * The every-minute reminder job (pg_cron → /api/cron/reminders):
 * - meetings starting within each member's meeting lead,
 * - open tasks due within each recipient's due lead (assignees, else the creator),
 * - the daily digest at each user's digest time in their time zone.
 * Each reminder is claimed in `reminder_deliveries` first, so it goes out once per user
 * however often the job runs. Every reminder also lands in the in-app bell. Protected
 * workspaces never put titles in a push notification.
 */
type Admin = ReturnType<typeof createAdminClient>
type WorkspaceInfo = { id: string; slug: string; name: string; protected: boolean }

const ROW_LIMIT = 2000
const PROFILE_PAGE = 1000

type Notice = { workspaceId: string; kind: string; title: string; body: string | null; link: string }

/** Claims `key` for each user, then notifies only the users it was newly claimed for. */
async function deliver(admin: Admin, userIds: string[], key: string, push: PushPayload, notice: Notice) {
  const unique = [...new Set(userIds)]
  if (!unique.length) return 0
  const { data, error } = await admin
    .from('reminder_deliveries')
    .upsert(
      unique.map((user_id) => ({ user_id, key })),
      { onConflict: 'user_id,key', ignoreDuplicates: true },
    )
    .select('user_id')
  if (error) throw new Error(`reminder_deliveries claim failed: ${error.message}`)
  const claimed = (data ?? []).map((row) => row.user_id as string)
  if (!claimed.length) return 0
  const inserted = await admin.from('notifications').insert(
    claimed.map((user_id) => ({
      user_id,
      workspace_id: notice.workspaceId,
      kind: notice.kind,
      title: clip(notice.title, 200),
      body: notice.body ? clip(notice.body, 500) : null,
      link: notice.link,
    })),
  )
  if (inserted.error) console.error('[reminders] notification insert failed', inserted.error.message)
  await pushToUsers(claimed, push).catch((failure) => console.error('[reminders] push failed', (failure as Error).message))
  return claimed.length
}

async function workspacesById(admin: Admin, ids: string[]) {
  const map = new Map<string, WorkspaceInfo>()
  if (!ids.length) return map
  const { data, error } = await admin.from('workspaces').select('id, slug, name, protected').in('id', [...new Set(ids)]).is('archived_at', null)
  if (error) throw new Error(`workspaces read failed: ${error.message}`)
  for (const row of (data ?? []) as WorkspaceInfo[]) map.set(row.id, row)
  return map
}

async function membersByWorkspace(admin: Admin, ids: string[]) {
  const map = new Map<string, Set<string>>()
  if (!ids.length) return map
  const { data, error } = await admin.from('workspace_members').select('workspace_id, user_id').in('workspace_id', [...new Set(ids)])
  if (error) throw new Error(`workspace_members read failed: ${error.message}`)
  for (const row of data ?? []) {
    const set = map.get(row.workspace_id) ?? new Set<string>()
    set.add(row.user_id)
    map.set(row.workspace_id, set)
  }
  return map
}

async function settingsFor(admin: Admin, userIds: string[]) {
  const map = new Map<string, ReminderSettings>()
  const ids = [...new Set(userIds)]
  for (let index = 0; index < ids.length; index += 500) {
    const { data, error } = await admin.from('profiles').select('id, preferences').in('id', ids.slice(index, index + 500))
    if (error) throw new Error(`profiles read failed: ${error.message}`)
    for (const row of data ?? []) map.set(row.id, reminderSettings(row.preferences))
  }
  return map
}

async function meetingReminders(admin: Admin, now: Date) {
  const { data, error } = await admin
    .from('meetings')
    .select('id, title, starts_at, meeting_url, workspace_id')
    .gt('starts_at', now.toISOString())
    .lte('starts_at', new Date(now.getTime() + MAX_MEETING_LEAD * 60_000).toISOString())
    .eq('all_day', false)
    .order('starts_at')
    .limit(ROW_LIMIT)
  if (error) throw new Error(`meetings read failed: ${error.message}`)
  const meetings = data ?? []
  const ids = meetings.map((meeting) => meeting.workspace_id)
  const [workspaces, members] = await Promise.all([workspacesById(admin, ids), membersByWorkspace(admin, ids)])
  const settings = await settingsFor(admin, [...members.values()].flatMap((set) => [...set]))
  let sent = 0
  for (const meeting of meetings) {
    const workspace = workspaces.get(meeting.workspace_id)
    if (!workspace) continue
    const recipients = [...(members.get(meeting.workspace_id) ?? [])].filter((id) => withinLead(meeting.starts_at, now, settings.get(id)?.meetingLead ?? 10))
    const minutes = minutesUntil(meeting.starts_at, now)
    const link = `${workspaceHref(workspace.slug, 'calendar')}?meeting=${meeting.id}`
    const detailed = { title: `${meeting.title} starts in ${minutes} min`, body: meeting.meeting_url ? 'Tap to join the meeting.' : workspace.name }
    const text = pushText(workspace, detailed)
    sent += await deliver(
      admin,
      recipients,
      reminderKey.meeting(meeting.id, meeting.starts_at),
      { ...text, url: !workspace.protected && meeting.meeting_url ? meeting.meeting_url : link, tag: `meeting-${meeting.id}` },
      { workspaceId: workspace.id, kind: 'reminder.meeting', title: detailed.title, body: workspace.name, link },
    )
  }
  return sent
}

type TaskRow = { id: string; title: string; due_at: string; workspace_id: string; creator_id: string; task_assignees: { user_id: string }[] }

async function dueReminders(admin: Admin, now: Date) {
  const { data, error } = await admin
    .from('tasks')
    .select('id, title, due_at, workspace_id, creator_id, task_assignees(user_id)')
    .is('completed_at', null)
    .not('status_category', 'in', '(done,cancelled)')
    .gt('due_at', now.toISOString())
    .lte('due_at', new Date(now.getTime() + MAX_DUE_LEAD * 60_000).toISOString())
    .order('due_at')
    .limit(ROW_LIMIT)
  if (error) throw new Error(`tasks read failed: ${error.message}`)
  const tasks = (data ?? []) as TaskRow[]
  const ids = tasks.map((task) => task.workspace_id)
  const [workspaces, members] = await Promise.all([workspacesById(admin, ids), membersByWorkspace(admin, ids)])
  const people = tasks.map((task) => ({ task, ids: taskRecipients({ creatorId: task.creator_id, assigneeIds: task.task_assignees.map((a) => a.user_id) }, members.get(task.workspace_id) ?? new Set()) }))
  const settings = await settingsFor(admin, people.flatMap((entry) => entry.ids))
  let sent = 0
  for (const { task, ids: recipients } of people) {
    const workspace = workspaces.get(task.workspace_id)
    if (!workspace) continue
    const due = recipients.filter((id) => withinLead(task.due_at, now, settings.get(id)?.dueLead ?? 60))
    const minutes = minutesUntil(task.due_at, now)
    const when = minutes >= 90 ? `${Math.round(minutes / 60)} h` : `${minutes} min`
    const detailed = { title: `Due in ${when}: ${task.title}`, body: workspace.name }
    const link = taskHref(workspace.slug, task.id)
    sent += await deliver(
      admin,
      due,
      reminderKey.due(task.id, task.due_at),
      { ...pushText(workspace, detailed), url: link, tag: `due-${task.id}` },
      { workspaceId: workspace.id, kind: 'reminder.due', title: detailed.title, body: workspace.name, link },
    )
  }
  return sent
}

type DigestTask = { id: string; title: string; due_at: string; workspace_id: string; completed_at: string | null; status_category: string }

/** Open tasks for one user due on their local `day`: assigned to them, or theirs and unassigned. */
async function tasksDueToday(admin: Admin, userId: string, day: string, timeZone: string, now: Date) {
  const from = new Date(now.getTime() - 36 * 3600_000).toISOString()
  const to = new Date(now.getTime() + 36 * 3600_000).toISOString()
  const columns = 'id, title, due_at, workspace_id, completed_at, status_category'
  const [assigned, created, memberships] = await Promise.all([
    admin
      .from('task_assignees')
      .select(`tasks!inner(${columns})`)
      .eq('user_id', userId)
      .is('tasks.completed_at', null)
      .gte('tasks.due_at', from)
      .lte('tasks.due_at', to)
      .limit(500),
    admin.from('tasks').select(`${columns}, task_assignees(user_id)`).eq('creator_id', userId).is('completed_at', null).gte('due_at', from).lte('due_at', to).limit(500),
    admin.from('workspace_members').select('workspace_id').eq('user_id', userId),
  ])
  if (assigned.error || created.error || memberships.error) throw new Error('digest read failed')
  const member = new Set((memberships.data ?? []).map((row) => row.workspace_id as string))
  const all = [
    ...((assigned.data ?? []) as unknown as { tasks: DigestTask }[]).map((row) => row.tasks),
    ...((created.data ?? []) as unknown as (DigestTask & { task_assignees: unknown[] })[]).filter((task) => !task.task_assignees.length),
  ]
  const seen = new Set<string>()
  return all.filter((task) => {
    if (seen.has(task.id) || !member.has(task.workspace_id) || ['done', 'cancelled'].includes(task.status_category)) return false
    seen.add(task.id)
    return localParts(new Date(task.due_at), timeZone).day === day
  })
}

async function digests(admin: Admin, now: Date) {
  let sent = 0
  for (let page = 0; ; page++) {
    const { data, error } = await admin
      .from('profiles')
      .select('id, timezone, preferences')
      .order('id')
      .range(page * PROFILE_PAGE, (page + 1) * PROFILE_PAGE - 1)
    if (error) throw new Error(`profiles read failed: ${error.message}`)
    for (const profile of data ?? []) {
      const timeZone = profile.timezone || 'UTC'
      const day = digestDay(now, timeZone, reminderSettings(profile.preferences).digestTime)
      if (!day) continue
      const today = await tasksDueToday(admin, profile.id, day, timeZone, now)
      if (!today.length) continue
      const workspaces = await workspacesById(admin, today.map((task) => task.workspace_id))
      const visible = today.filter((task) => workspaces.has(task.workspace_id))
      if (!visible.length) continue
      const open = visible.filter((task) => !workspaces.get(task.workspace_id)!.protected)
      const hidden = visible.length - open.length
      const titles = open.slice(0, 4).map((task) => task.title)
      const extra = visible.length - titles.length
      const groups = new Map<string, DigestTask[]>()
      for (const task of visible) groups.set(task.workspace_id, [...(groups.get(task.workspace_id) ?? []), task])
      const only = groups.size === 1 ? workspaces.get(visible[0].workspace_id)! : null
      const title = `Today: ${visible.length} ${visible.length === 1 ? 'task' : 'tasks'} due`
      const body = titles.length ? titles.join(' · ') + (extra ? ` · +${extra} more` : '') : `${hidden} in protected workspaces`
      const first = workspaces.get(visible[0].workspace_id)!
      const delivered = await deliver(
        admin,
        [profile.id],
        reminderKey.digest(day),
        { title, body: clip(body, 300), url: only ? workspaceHref(only.slug, 'tasks') : '/all/tasks', tag: `digest-${day}` },
        { workspaceId: first.id, kind: 'reminder.digest', title: `${title} in ${first.name}`, body: groups.get(first.id)!.map((task) => task.title).join(' · '), link: workspaceHref(first.slug, 'tasks') },
      )
      sent += delivered
      if (!delivered) continue
      // Bell entries for the other workspaces; each row is hidden by RLS while its workspace is locked.
      const rest = [...groups].filter(([id]) => id !== first.id)
      if (rest.length) {
        const { error: restError } = await admin.from('notifications').insert(
          rest.map(([id, list]) => {
            const workspace = workspaces.get(id)!
            return {
              user_id: profile.id,
              workspace_id: id,
              kind: 'reminder.digest',
              title: clip(`Today: ${list.length} due in ${workspace.name}`, 200),
              body: clip(list.map((task) => task.title).join(' · '), 500),
              link: workspaceHref(workspace.slug, 'tasks'),
            }
          }),
        )
        if (restError) console.error('[reminders] digest notifications failed', restError.message)
      }
    }
    if (!data || data.length < PROFILE_PAGE) break
  }
  return sent
}

export async function runReminders(now = new Date()) {
  const admin = createAdminClient()
  const results = await Promise.allSettled([meetingReminders(admin, now), dueReminders(admin, now), digests(admin, now)])
  const [meetings, deadlines, digest] = results.map((result) => {
    if (result.status === 'fulfilled') return result.value
    console.error('[reminders] part failed', (result.reason as Error)?.message)
    return -1
  })
  const { error } = await admin.rpc('housekeeping')
  if (error) console.error('[reminders] housekeeping failed', error.message)
  return { meetings, deadlines, digests: digest, ok: results.every((result) => result.status === 'fulfilled') }
}
