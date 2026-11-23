'use client'

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { isColorKey } from '@/core/colors'
import { keys } from '@/core/query'
import { useUser } from '@/core/session'
import type { ColorKey } from '@/core/types'
import type { Priority } from '@/lib/format'
import { maybe, must, supabase } from '@/lib/supabase/client'

export type StatusCategory = 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled'
export type Recurrence = { freq: 'daily' | 'weekly' | 'monthly' | 'yearly'; interval: number } | null

export const CATEGORIES: { key: StatusCategory; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'todo', label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
  { key: 'cancelled', label: 'Cancelled' },
]

export type Status = { id: string; workspaceId: string; name: string; category: StatusCategory; color: ColorKey; position: number }
export type Label = { id: string; workspaceId: string; name: string; color: ColorKey }

export type Task = {
  id: string
  workspaceId: string
  projectId: string | null
  statusId: string | null
  statusCategory: StatusCategory
  parentId: string | null
  number: number
  title: string
  priority: Priority
  creatorId: string
  startAt: string | null
  dueAt: string | null
  estimateMinutes: number | null
  position: number
  recurrence: Recurrence
  completedAt: string | null
  createdAt: string
  updatedAt: string
  assigneeIds: string[]
  labelIds: string[]
}

export type TaskDetail = Task & { description: string; dependsOn: string[] }

export const isOpen = (task: Pick<Task, 'statusCategory'>) => task.statusCategory !== 'done' && task.statusCategory !== 'cancelled'

// The list never loads descriptions or search vectors: they are fetched per task.
const TASK_COLUMNS =
  'id, workspace_id, project_id, status_id, status_category, parent_id, task_number, title, priority, creator_id, start_at, due_at, estimate_minutes, position, recurrence, completed_at, created_at, updated_at, task_assignees(user_id), task_labels(label_id)'

type TaskRow = {
  id: string
  workspace_id: string
  project_id: string | null
  status_id: string | null
  status_category: StatusCategory
  parent_id: string | null
  task_number: number
  title: string
  priority: Priority
  creator_id: string
  start_at: string | null
  due_at: string | null
  estimate_minutes: number | null
  position: number
  recurrence: Recurrence
  completed_at: string | null
  created_at: string
  updated_at: string
  task_assignees: { user_id: string }[]
  task_labels: { label_id: string }[]
  description?: string
  task_dependencies?: { depends_on_id: string }[]
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    statusId: row.status_id,
    statusCategory: row.status_category,
    parentId: row.parent_id,
    number: row.task_number,
    title: row.title,
    priority: row.priority,
    creatorId: row.creator_id,
    startAt: row.start_at,
    dueAt: row.due_at,
    estimateMinutes: row.estimate_minutes,
    position: row.position,
    recurrence: row.recurrence,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    assigneeIds: (row.task_assignees ?? []).map((a) => a.user_id),
    labelIds: (row.task_labels ?? []).map((l) => l.label_id),
  }
}

/** How far back finished tasks are loaded with the list (older ones on demand). */
const DONE_WINDOW_DAYS = 30

/**
 * Tasks of one workspace, or of every workspace when `workspaceId` is 'all'. Loads all
 * open tasks plus those finished in the last 30 days, in two indexed queries.
 */
export function useTasks(workspaceId: string | 'all' | undefined) {
  return useQuery({
    queryKey: keys.tasks(workspaceId ?? 'none'),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const since = new Date(Date.now() - DONE_WINDOW_DAYS * 86_400_000).toISOString()
      let open = supabase().from('tasks').select(TASK_COLUMNS).in('status_category', ['backlog', 'todo', 'in_progress'])
      let done = supabase().from('tasks').select(TASK_COLUMNS).in('status_category', ['done', 'cancelled']).gte('updated_at', since)
      if (workspaceId !== 'all') {
        open = open.eq('workspace_id', workspaceId!)
        done = done.eq('workspace_id', workspaceId!)
      }
      const [openResult, doneResult] = await Promise.all([
        open.order('position').limit(2000).returns<TaskRow[]>(),
        done.order('updated_at', { ascending: false }).limit(500).returns<TaskRow[]>(),
      ])
      return [...must(openResult), ...must(doneResult)].map(toTask)
    },
  })
}

export function useTask(taskId: string | null) {
  return useQuery({
    queryKey: keys.task(taskId ?? 'none'),
    enabled: Boolean(taskId),
    queryFn: async () => {
      const row = maybe(
        await supabase()
          .from('tasks')
          .select(`${TASK_COLUMNS}, description, task_dependencies!task_dependencies_task_id_fkey(depends_on_id)`)
          .eq('id', taskId!)
          .maybeSingle<TaskRow>(),
      )
      if (!row) return null
      return {
        ...toTask(row),
        description: row.description ?? '',
        dependsOn: (row.task_dependencies ?? []).map((d) => d.depends_on_id),
      } satisfies TaskDetail
    },
  })
}

export function useStatuses(workspaceId: string | undefined) {
  return useQuery({
    queryKey: keys.statuses(workspaceId ?? 'none'),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000,
    queryFn: async () =>
      must(
        await supabase()
          .from('task_statuses')
          .select('id, workspace_id, name, category, color, position')
          .eq('workspace_id', workspaceId!)
          .order('position'),
      ).map(
        (row): Status => ({
          id: row.id,
          workspaceId: row.workspace_id,
          name: row.name,
          category: row.category,
          color: isColorKey(row.color) ? row.color : 'slate',
          position: Number(row.position),
        }),
      ),
  })
}

/** Statuses of every workspace (for cross-workspace boards). */
export function useAllStatuses() {
  return useQuery({
    queryKey: ['statuses', 'all'],
    staleTime: 5 * 60_000,
    queryFn: async () =>
      must(await supabase().from('task_statuses').select('id, workspace_id, name, category, color, position').order('position')).map(
        (row): Status => ({
          id: row.id,
          workspaceId: row.workspace_id,
          name: row.name,
          category: row.category,
          color: isColorKey(row.color) ? row.color : 'slate',
          position: Number(row.position),
        }),
      ),
  })
}

export function useLabels(workspaceId: string | undefined) {
  return useQuery({
    queryKey: keys.labels(workspaceId ?? 'none'),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60_000,
    queryFn: async () =>
      must(await supabase().from('labels').select('id, workspace_id, name, color').eq('workspace_id', workspaceId!).order('name')).map(
        (row): Label => ({ id: row.id, workspaceId: row.workspace_id, name: row.name, color: isColorKey(row.color) ? row.color : 'slate' }),
      ),
  })
}

// ── Mutations ───────────────────────────────────────────────────────────────────────

/** Applies `fn` to the task in every cached task list (workspace and "all"). */
function patchCaches(queryClient: QueryClient, fn: (tasks: Task[]) => Task[]) {
  const snapshots = queryClient.getQueriesData<Task[]>({ queryKey: ['tasks'] })
  for (const [key, data] of snapshots) if (data) queryClient.setQueryData(key, fn(data))
  return snapshots
}

function restore(queryClient: QueryClient, snapshots: [readonly unknown[], Task[] | undefined][] | undefined) {
  snapshots?.forEach(([key, data]) => queryClient.setQueryData(key, data))
}

export type NewTask = {
  workspaceId: string
  title: string
  projectId?: string | null
  statusId?: string | null
  parentId?: string | null
  priority?: Priority
  dueAt?: string | null
  estimateMinutes?: number | null
  assigneeIds?: string[]
  labelIds?: string[]
  description?: string
  recurrence?: Recurrence
}

export function useCreateTask() {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewTask) => {
      const db = supabase()
      const row = must(
        await db
          .from('tasks')
          .insert({
            workspace_id: input.workspaceId,
            title: input.title.trim(),
            project_id: input.projectId ?? null,
            status_id: input.statusId ?? null,
            parent_id: input.parentId ?? null,
            priority: input.priority ?? 'none',
            due_at: input.dueAt ?? null,
            estimate_minutes: input.estimateMinutes ?? null,
            description: input.description ?? '',
            recurrence: input.recurrence ?? null,
            creator_id: user.id,
          })
          .select('id')
          .single(),
      )
      if (input.assigneeIds?.length) must(await db.from('task_assignees').insert(input.assigneeIds.map((user_id) => ({ task_id: row.id, user_id }))))
      if (input.labelIds?.length) must(await db.from('task_labels').insert(input.labelIds.map((label_id) => ({ task_id: row.id, label_id }))))
      return row.id as string
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export type TaskChanges = Partial<
  Pick<TaskDetail, 'title' | 'description' | 'projectId' | 'statusId' | 'priority' | 'dueAt' | 'startAt' | 'estimateMinutes' | 'position' | 'recurrence' | 'parentId'>
> & { statusCategory?: StatusCategory }

const COLUMN: Record<string, string> = {
  title: 'title',
  description: 'description',
  projectId: 'project_id',
  statusId: 'status_id',
  priority: 'priority',
  dueAt: 'due_at',
  startAt: 'start_at',
  estimateMinutes: 'estimate_minutes',
  position: 'position',
  recurrence: 'recurrence',
  parentId: 'parent_id',
}

/** Updates a task with an optimistic change to every cached list; rolls back on error. */
export function useUpdateTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, changes }: { id: string; changes: TaskChanges }) => {
      const row: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(changes)) if (COLUMN[key]) row[COLUMN[key]] = value
      must(await supabase().from('tasks').update(row).eq('id', id))
    },
    onMutate: async ({ id, changes }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const snapshots = patchCaches(queryClient, (tasks) =>
        tasks.map((task) =>
          task.id === id
            ? {
                ...task,
                ...changes,
                completedAt: changes.statusCategory ? (changes.statusCategory === 'done' ? new Date().toISOString() : null) : task.completedAt,
              }
            : task,
        ),
      )
      const detail = queryClient.getQueryData<TaskDetail>(keys.task(id))
      if (detail) queryClient.setQueryData(keys.task(id), { ...detail, ...changes })
      return { snapshots, detail }
    },
    onError: (_error, { id }, context) => {
      restore(queryClient, context?.snapshots)
      if (context?.detail) queryClient.setQueryData(keys.task(id), context.detail)
    },
    onSettled: (_data, _error, { id, changes }) => {
      // Status changes can create a recurring copy on the server.
      if (changes.statusId || changes.statusCategory) queryClient.invalidateQueries({ queryKey: ['tasks'] })
      queryClient.invalidateQueries({ queryKey: keys.task(id) })
    },
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase().from('tasks').delete().eq('id', id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      return { snapshots: patchCaches(queryClient, (tasks) => tasks.filter((task) => task.id !== id && task.parentId !== id)) }
    },
    onError: (_error, _id, context) => restore(queryClient, context?.snapshots),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

/** Replaces a task's assignees or labels with the given set. */
export function useSetTaskLinks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, kind, ids, previous }: { id: string; kind: 'assignees' | 'labels'; ids: string[]; previous: string[] }) => {
      const db = supabase()
      const table = kind === 'assignees' ? 'task_assignees' : 'task_labels'
      const column = kind === 'assignees' ? 'user_id' : 'label_id'
      const add = ids.filter((value) => !previous.includes(value))
      const remove = previous.filter((value) => !ids.includes(value))
      if (add.length) must(await db.from(table).insert(add.map((value) => ({ task_id: id, [column]: value }))))
      if (remove.length) must(await db.from(table).delete().eq('task_id', id).in(column, remove))
    },
    onMutate: async ({ id, kind, ids }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const field = kind === 'assignees' ? 'assigneeIds' : 'labelIds'
      const snapshots = patchCaches(queryClient, (tasks) => tasks.map((task) => (task.id === id ? { ...task, [field]: ids } : task)))
      const detail = queryClient.getQueryData<TaskDetail>(keys.task(id))
      if (detail) queryClient.setQueryData(keys.task(id), { ...detail, [field]: ids })
      return { snapshots }
    },
    onError: (_error, _vars, context) => restore(queryClient, context?.snapshots),
    onSettled: (_data, _error, { id }) => queryClient.invalidateQueries({ queryKey: keys.task(id) }),
  })
}

export function useSetDependencies() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ids, previous }: { id: string; ids: string[]; previous: string[] }) => {
      const db = supabase()
      const add = ids.filter((value) => !previous.includes(value))
      const remove = previous.filter((value) => !ids.includes(value))
      if (add.length) must(await db.from('task_dependencies').insert(add.map((depends_on_id) => ({ task_id: id, depends_on_id }))))
      if (remove.length) must(await db.from('task_dependencies').delete().eq('task_id', id).in('depends_on_id', remove))
    },
    onSettled: (_data, _error, { id }) => queryClient.invalidateQueries({ queryKey: keys.task(id) }),
  })
}

export function useCreateLabel(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color: ColorKey }) =>
      must(await supabase().from('labels').insert({ workspace_id: workspaceId, name: name.trim(), color }).select('id').single()).id as string,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.labels(workspaceId) }),
  })
}

export function useDeleteLabel(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (labelId: string) => must(await supabase().from('labels').delete().eq('id', labelId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.labels(workspaceId) })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useSaveStatuses(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ statuses, removed }: { statuses: Omit<Status, 'workspaceId'>[]; removed: { id: string; moveTo: string }[] }) => {
      const db = supabase()
      for (const entry of removed) {
        must(await db.from('tasks').update({ status_id: entry.moveTo }).eq('status_id', entry.id))
        must(await db.from('task_statuses').delete().eq('id', entry.id))
      }
      const rows = statuses.map((status, index) => ({
        ...(status.id.startsWith('new-') ? {} : { id: status.id }),
        workspace_id: workspaceId,
        name: status.name.trim(),
        category: status.category,
        color: status.color,
        position: index + 1,
      }))
      const existing = rows.filter((row) => 'id' in row)
      const added = rows.filter((row) => !('id' in row))
      if (existing.length) must(await db.from('task_statuses').upsert(existing))
      if (added.length) must(await db.from('task_statuses').insert(added))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.statuses(workspaceId) })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

// ── Comments and activity ───────────────────────────────────────────────────────────

export type Comment = { id: string; taskId: string; authorId: string; body: string; createdAt: string; editedAt: string | null }
export type Activity = { id: number; actorId: string | null; action: string; data: Record<string, unknown>; createdAt: string }

export function useTaskTimeline(taskId: string | null) {
  return useQuery({
    queryKey: [...keys.task(taskId ?? 'none'), 'timeline'],
    enabled: Boolean(taskId),
    queryFn: async () => {
      const [comments, activity] = await Promise.all([
        supabase().from('comments').select('id, task_id, author_id, body, created_at, edited_at').eq('task_id', taskId!).order('created_at'),
        supabase().from('activity_events').select('id, actor_id, action, data, created_at').eq('task_id', taskId!).order('created_at').limit(100),
      ])
      return {
        comments: must(comments).map(
          (row): Comment => ({ id: row.id, taskId: row.task_id, authorId: row.author_id, body: row.body, createdAt: row.created_at, editedAt: row.edited_at }),
        ),
        activity: must(activity).map((row): Activity => ({ id: row.id, actorId: row.actor_id, action: row.action, data: row.data ?? {}, createdAt: row.created_at })),
      }
    },
  })
}

export function useAddComment(taskId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: string) => must(await supabase().from('comments').insert({ task_id: taskId, author_id: user.id, body: body.trim() })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...keys.task(taskId), 'timeline'] }),
  })
}

export function useDeleteComment(taskId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (commentId: string) => must(await supabase().from('comments').delete().eq('id', commentId)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...keys.task(taskId), 'timeline'] }),
  })
}
