'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { keys } from '@/core/query'
import { useNotificationRealtime } from '@/core/realtime'
import { useUser } from '@/core/session'
import type { Notification } from '@/core/types'
import { mailDate } from '@/lib/format'
import { must, supabase } from '@/lib/supabase/client'
import { cn } from '@/ui/cn'
import { EmptyState } from '@/ui/misc'
import { PushToggle } from '@/modules/notifications/push-toggle'

function useNotifications() {
  const user = useUser()
  useNotificationRealtime(user.id)
  return useQuery({
    queryKey: keys.notifications,
    queryFn: async () =>
      must(
        await supabase()
          .from('notifications')
          .select('id, workspace_id, kind, title, body, link, read_at, created_at')
          .order('created_at', { ascending: false })
          .limit(30),
      ).map(
        (row): Notification => ({
          id: row.id,
          workspaceId: row.workspace_id,
          kind: row.kind,
          title: row.title,
          body: row.body,
          link: row.link,
          readAt: row.read_at,
          createdAt: row.created_at,
        }),
      ),
  })
}

/** The bell: unread count, latest 30 notifications, mark one or all as read. */
export function NotificationCenter() {
  const queryClient = useQueryClient()
  const { data: items = [] } = useNotifications()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const unread = items.filter((item) => !item.readAt)

  const markRead = useMutation({
    meta: { silent: true },
    mutationFn: async (ids: string[]) =>
      must(await supabase().from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)),
    onMutate: (ids) =>
      queryClient.setQueryData<Notification[]>(keys.notifications, (list) =>
        list?.map((item) => (ids.includes(item.id) ? { ...item, readAt: new Date().toISOString() } : item)),
      ),
  })

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={unread.length ? `Notifications, ${unread.length} unread` : 'Notifications'}
        className="neo-control relative grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:text-ink"
      >
        <Bell size={17} aria-hidden />
        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[10px] font-semibold text-on-primary tabular-nums">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>
      {open && (
        <div className="neo-popover animate-pop absolute right-0 z-50 mt-2 w-[min(380px,calc(100vw-2rem))] rounded-xl">
          <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
            <p className="text-ui font-semibold">Notifications</p>
            {unread.length > 0 && (
              <button
                type="button"
                onClick={() => markRead.mutate(unread.map((item) => item.id))}
                className="flex items-center gap-1 text-xs font-medium text-primary-ink"
              >
                <CheckCheck size={14} aria-hidden /> Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-[420px] overflow-y-auto p-1.5">
            {items.map((item) => {
              const body = (
                <>
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', item.readAt ? 'bg-transparent' : 'bg-primary')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-ui text-ink">{item.title}</span>
                    {item.body && <span className="block truncate text-xs text-ink-2">{item.body}</span>}
                    <span className="mt-0.5 block text-2xs text-ink-3">{mailDate(item.createdAt)}</span>
                  </span>
                </>
              )
              const className = 'flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-surface-2'
              const onClick = () => {
                if (!item.readAt) markRead.mutate([item.id])
                setOpen(false)
              }
              return (
                <li key={item.id} className="animate-row">
                  {item.link ? (
                    <Link href={item.link} onClick={onClick} className={className}>
                      {body}
                    </Link>
                  ) : (
                    <button type="button" onClick={onClick} className={className}>
                      {body}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          {!items.length && <EmptyState icon={Bell} title="You're all caught up" hint="Assignments, comments and invitations show up here." />}
          <div className="border-t border-line-soft">
            <PushToggle />
          </div>
        </div>
      )}
    </div>
  )
}
