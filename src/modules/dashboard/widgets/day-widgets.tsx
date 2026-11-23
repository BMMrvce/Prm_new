'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, NotebookText, Plus, Sparkles, Target, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { visibleModules } from '@/core/modules'
import { workspaceHref } from '@/core/routes'
import { useProfile, useUser } from '@/core/session'
import { greetingName, greetingParts, localDate, mailDate } from '@/lib/format'
import { maybe, must, supabase } from '@/lib/supabase/client'
import { useTaskContext } from '@/modules/tasks/use-task-context'
import { useTaskPanel } from '@/modules/tasks/task-bits'
import { cn } from '@/ui/cn'
import { Icon } from '@/ui/icon'
import { Avatar } from '@/ui/misc'
import { WidgetFrame } from '../widget-frame'
import type { WidgetProps } from '../registry'

export function GreetingWidget({ workspace }: WidgetProps) {
  const { data: profile } = useProfile()
  const [now] = useState(() => new Date())
  const { salutation, date } = greetingParts(now)
  const name = greetingName(profile?.fullName)
  return (
    <section className="flex h-full flex-wrap items-center justify-between gap-x-6 gap-y-1 overflow-hidden greeting-panel rounded-xl px-6 py-3">
      <div className="min-w-0">
        <h2 className="truncate text-xl font-medium tracking-tight">
          {salutation}
          {name ? `, ${name}` : ''}
        </h2>
        <p className="truncate text-ui text-[var(--greeting-muted)]">{workspace ? workspace.name : 'All workspaces'}</p>
      </div>
      <p className="text-xs font-medium tracking-wide text-[var(--greeting-accent)] uppercase">{date}</p>
    </section>
  )
}

export function ShortcutsWidget({ workspace }: WidgetProps) {
  if (!workspace) return null
  return (
    <WidgetFrame title="Jump to" icon={<Sparkles size={15} />}>
      <div className="grid grid-cols-3 gap-2 pt-1 sm:grid-cols-4">
        {visibleModules(workspace).map((manifest) => (
          <Link
            key={manifest.id}
            href={workspaceHref(workspace.slug, manifest.segment)}
            className="flex flex-col items-center gap-1.5 rounded-xl border border-line px-2 py-3 text-center text-2xs font-medium text-ink-2 hover:border-primary/40 hover:bg-primary-subtle hover:text-primary-ink"
          >
            <Icon name={manifest.icon} size={18} />
            {manifest.label}
          </Link>
        ))}
      </div>
    </WidgetFrame>
  )
}

/** A quick scratch pad for the day, saved as you type (debounced). */
export function DayNoteWidget({ workspace }: WidgetProps) {
  const user = useUser()
  const [today] = useState(() => localDate())
  const key = ['day-note', workspace?.id, today]
  const { data } = useQuery({
    queryKey: key,
    enabled: Boolean(workspace),
    queryFn: async () =>
      maybe(await supabase().from('daily_notes').select('id, content').eq('workspace_id', workspace!.id).eq('user_id', user.id).eq('note_date', today).maybeSingle<{ id: string; content: string }>()),
  })
  const [text, setText] = useState<string | null>(null)
  const [saved, setSaved] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const save = useMutation({
    meta: { silent: true },
    mutationFn: async (content: string) =>
      must(
        await supabase()
          .from('daily_notes')
          .upsert({ workspace_id: workspace!.id, user_id: user.id, note_date: today, content }, { onConflict: 'workspace_id,user_id,note_date' }),
      ),
    onSuccess: () => setSaved(true),
  })

  useEffect(() => () => clearTimeout(timer.current), [])
  if (!workspace) return null
  const value = text ?? data?.content ?? ''

  return (
    <WidgetFrame title="Day note" icon={<NotebookText size={15} />} action={<span className="text-2xs text-ink-3">{saved ? 'Saved' : 'Saving…'}</span>} bodyClassName="flex">
      <textarea
        value={value}
        onChange={(event) => {
          setText(event.target.value)
          setSaved(false)
          clearTimeout(timer.current)
          const content = event.target.value
          timer.current = setTimeout(() => save.mutate(content), 700)
        }}
        placeholder="Thoughts, reminders, links for today…"
        aria-label="Day note"
        maxLength={50000}
        className="min-h-24 w-full flex-1 resize-none rounded-lg bg-surface-2 p-3 font-handwritten text-sm leading-6 text-ink outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-primary/20"
      />
    </WidgetFrame>
  )
}

type PlanItem = { id: string; title: string; completed_at: string | null; position: number }

/** Today's short plan: a few priorities, checked off through the day. */
export function PlanWidget({ workspace }: WidgetProps) {
  const user = useUser()
  const queryClient = useQueryClient()
  const [today] = useState(() => localDate())
  const key = ['plan', workspace?.id, today]
  const [title, setTitle] = useState('')
  const { data: items = [] } = useQuery({
    queryKey: key,
    enabled: Boolean(workspace),
    queryFn: async () =>
      must(
        await supabase()
          .from('plan_items')
          .select('id, title, completed_at, position')
          .eq('workspace_id', workspace!.id)
          .eq('user_id', user.id)
          .eq('plan_date', today)
          .order('position'),
      ) as PlanItem[],
  })
  const mutate = useMutation({
    mutationFn: async (action: { kind: 'add'; title: string } | { kind: 'toggle'; item: PlanItem } | { kind: 'remove'; id: string }) => {
      const db = supabase().from('plan_items')
      if (action.kind === 'add')
        must(await db.insert({ workspace_id: workspace!.id, user_id: user.id, plan_date: today, title: action.title, position: Date.now() }))
      else if (action.kind === 'toggle') must(await db.update({ completed_at: action.item.completed_at ? null : new Date().toISOString() }).eq('id', action.item.id))
      else must(await db.delete().eq('id', action.id))
    },
    onMutate: (action) => {
      queryClient.setQueryData<PlanItem[]>(key, (list = []) =>
        action.kind === 'add'
          ? [...list, { id: `temp-${Date.now()}`, title: action.title, completed_at: null, position: Date.now() }]
          : action.kind === 'toggle'
            ? list.map((item) => (item.id === action.item.id ? { ...item, completed_at: item.completed_at ? null : new Date().toISOString() } : item))
            : list.filter((item) => item.id !== action.id),
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
  if (!workspace) return null

  const add = (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return
    mutate.mutate({ kind: 'add', title: title.trim() })
    setTitle('')
  }

  return (
    <WidgetFrame title="Today's plan" icon={<Target size={15} />} action={<span className="text-2xs text-ink-3">{items.filter((item) => item.completed_at).length}/{items.length}</span>}>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="group animate-row flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(item.completed_at)}
              onChange={() => mutate.mutate({ kind: 'toggle', item })}
              aria-label={item.title}
              className="size-4 accent-[var(--brand-primary)]"
            />
            <span className={cn('min-w-0 flex-1 truncate font-handwritten text-sm', item.completed_at && 'text-ink-3 line-through')}>{item.title}</span>
            <button type="button" aria-label={`Remove ${item.title}`} onClick={() => mutate.mutate({ kind: 'remove', id: item.id })} className="text-ink-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="mt-2 flex items-center gap-2 border-t border-line-soft pt-2">
        <Plus size={14} className="text-ink-3" aria-hidden />
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add a priority for today" aria-label="New plan item" maxLength={300} className="min-w-0 flex-1 bg-transparent text-ui outline-none placeholder:text-ink-3" />
      </form>
    </WidgetFrame>
  )
}

const ACTION_TEXT: Record<string, string> = {
  'task.created': 'created',
  'task.status': 'moved',
  'task.due': 'rescheduled',
  'task.priority': 'reprioritised',
  'task.renamed': 'renamed',
  'comment.created': 'commented on',
}

/** Recent changes by everyone in the workspace (or all workspaces). */
export function ActivityWidget({ scope }: WidgetProps) {
  const context = useTaskContext(scope)
  const panel = useTaskPanel()
  const { data = [] } = useQuery({
    queryKey: ['activity', scope],
    queryFn: async () => {
      let query = supabase().from('activity_events').select('id, workspace_id, task_id, actor_id, action, data, created_at, tasks(title)').order('created_at', { ascending: false }).limit(25)
      if (scope !== 'all') query = query.eq('workspace_id', scope)
      return must(await query) as unknown as { id: number; task_id: string | null; actor_id: string | null; action: string; data: Record<string, unknown>; created_at: string; tasks: { title: string } | null }[]
    },
    refetchInterval: 60_000,
  })
  return (
    <WidgetFrame title="Activity" icon={<Activity size={15} />}>
      {data.length ? (
        <ol className="space-y-2.5">
          {data.map((event) => {
            const actor = event.actor_id ? context.people.get(event.actor_id) : undefined
            return (
              <li key={event.id} className="flex gap-2.5 text-xs">
                <Avatar name={actor?.fullName ?? actor?.email ?? '?'} src={actor?.avatarUrl} size={22} />
                <p className="min-w-0 flex-1 text-ink-2">
                  <strong className="font-medium text-ink">{actor?.fullName ?? 'Someone'}</strong> {ACTION_TEXT[event.action] ?? event.action}{' '}
                  {event.task_id ? (
                    <button type="button" onClick={() => panel.open(event.task_id!)} className="font-medium text-ink hover:text-primary-ink hover:underline">
                      {event.tasks?.title ?? 'a task'}
                    </button>
                  ) : null}
                  <span className="block text-2xs text-ink-3">{mailDate(event.created_at)}</span>
                </p>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="py-6 text-center text-xs text-ink-3">No activity yet.</p>
      )}
    </WidgetFrame>
  )
}
