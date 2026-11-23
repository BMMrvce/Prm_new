'use client'

import { Inbox } from 'lucide-react'
import Link from 'next/link'
import { workspaceHref } from '@/core/routes'
import { mailDate } from '@/lib/format'
import type { WidgetProps } from '@/modules/dashboard/registry'
import { WidgetFrame } from '@/modules/dashboard/widget-frame'
import { cn } from '@/ui/cn'
import { ErrorNotice } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { useMailList } from './api'

/** Latest messages in this workspace's mailbox. */
export function MailWidget({ workspace }: WidgetProps) {
  if (!workspace) return <WidgetFrame title="Mail" icon={<Inbox size={15} />}><p className="py-6 text-center text-xs text-ink-3">Add this widget to a workspace dashboard.</p></WidgetFrame>
  return <MailLines workspaceId={workspace.id} slug={workspace.slug} />
}

function MailLines({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const { data, isPending, error, refetch } = useMailList(workspaceId, 'inbox', {}, 8)
  const page = data?.pages[0]
  const inbox = workspaceHref(slug, 'inbox')
  return (
    <WidgetFrame
      title="Mail"
      icon={<Inbox size={15} />}
      action={
        <Link href={inbox} className="text-xs font-medium text-primary-ink hover:underline">
          Open inbox
        </Link>
      }
    >
      {isPending ? (
        <Skeleton className="h-24" />
      ) : error ? (
        <ErrorNotice message={error.message} onRetry={() => refetch()} />
      ) : page?.status.state !== 'connected' ? (
        <p className="py-6 text-center text-xs text-ink-3">
          No mailbox connected.{' '}
          <Link href={`${workspaceHref(slug, 'settings')}?tab=mail`} className="font-medium text-primary-ink hover:underline">
            Connect one
          </Link>
        </p>
      ) : page.error ? (
        <ErrorNotice message={page.error} onRetry={() => refetch()} />
      ) : !page.messages.length ? (
        <p className="py-6 text-center text-xs text-ink-3">Your inbox is empty.</p>
      ) : (
        <ul className="-mx-2">
          {page.messages.map((message) => (
            <li key={message.id}>
              <Link href={inbox} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                <span className={cn('size-2 shrink-0 rounded-full', message.unread ? 'bg-primary' : 'bg-transparent')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate text-ui text-ink', message.unread && 'font-semibold')}>{message.from}</span>
                  <span className="block truncate text-xs text-ink-2">
                    {message.unread && <span className="sr-only">Unread: </span>}
                    {message.subject}
                  </span>
                </span>
                <span className="shrink-0 text-2xs text-ink-3">{mailDate(message.date)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetFrame>
  )
}
