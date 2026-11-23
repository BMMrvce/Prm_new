'use client'

import { Inbox, MailX, PenSquare, RefreshCw, Settings } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ModuleGate } from '@/components/shell/module-gate'
import { workspaceHref } from '@/core/routes'
import { useCurrentWorkspace } from '@/core/workspaces'
import type { MailFolder } from '@/lib/mail/types'
import { mailDate } from '@/lib/format'
import { Button, ButtonLink, IconButton } from '@/ui/button'
import { cn } from '@/ui/cn'
import { EmptyState, ErrorNotice, PageHeader } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { Tabs } from '@/ui/tabs'
import { useMailList, useMarkRead, usePrefetchMessage, mailKeys } from './api'
import { ComposeDialog, type ComposeDraft } from './compose-dialog'
import { EMPTY_FILTERS, filtersActive, MailFilters, toMailQuery, type MailFilterState } from './mail-filters'
import { ReadingPane } from './reading-pane'
import { useQueryClient } from '@tanstack/react-query'

export function InboxPage() {
  return (
    <ModuleGate id="inbox">
      <InboxView />
    </ModuleGate>
  )
}

function InboxView() {
  const workspace = useCurrentWorkspace()
  const params = useSearchParams()
  const queryClient = useQueryClient()
  const [folder, setFolder] = useState<MailFolder>('inbox')
  const [filters, setFilters] = useState<MailFilterState>(() => ({ ...EMPTY_FILTERS, search: params.get('search') ?? '' }))
  const query = useMemo(() => toMailQuery(filters), [filters])
  const list = useMailList(workspace.id, folder, query)
  const prefetch = usePrefetchMessage(workspace.id, folder)
  const markRead = useMarkRead(workspace.id)
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ComposeDraft | null>(() => (params.get('compose') === '1' ? {} : null))
  const scroller = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)

  const pages = useMemo(() => list.data?.pages ?? [], [list.data])
  const status = pages[0]?.status
  const messages = useMemo(() => {
    const seen = new Set<string>()
    return pages.flatMap((page) => page.messages).filter((message) => !seen.has(message.id) && Boolean(seen.add(message.id)))
  }, [pages])
  const pageError = pages.at(-1)?.error
  const connected = status?.state === 'connected'
  const settingsHref = `${workspaceHref(workspace.slug, 'settings')}?tab=mail`

  // Infinite scroll: the next page loads as the end of the list comes into view.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list
  useEffect(() => {
    const target = sentinel.current
    if (!target || !hasNextPage) return
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage && void fetchNextPage(), {
      root: scroller.current,
      rootMargin: '240px',
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const open = (id: string, unread: boolean) => {
    setOpenId(id)
    if (unread) {
      markRead.mutate({ folder, id })
      queryClient.setQueriesData<typeof list.data>({ queryKey: [...mailKeys.all(workspace.id), 'list', folder] }, (data) =>
        data && { ...data, pages: data.pages.map((page) => ({ ...page, messages: page.messages.map((m) => (m.id === id ? { ...m, unread: false } : m)) })) },
      )
    }
  }

  return (
    <>
      <PageHeader
        title="Inbox"
        description={connected ? `${status.label} · ${status.account}` : 'Your own mailbox for this workspace. Only you can see it.'}
        actions={
          <>
            <IconButton variant="secondary" label="Refresh mailbox" onClick={() => list.refetch()} disabled={list.isFetching}>
              <RefreshCw size={15} className={cn(list.isFetching && 'animate-spin motion-reduce:animate-none')} />
            </IconButton>
            <Button variant="primary" icon={<PenSquare size={15} aria-hidden />} disabled={!connected} onClick={() => setDraft({})}>
              Compose
            </Button>
          </>
        }
      />
      {list.isPending ? (
        <div className="neo-card space-y-3 rounded-xl p-4" aria-busy="true" aria-label="Loading mail">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : list.error ? (
        <ErrorNotice title="Could not load mail" message={list.error.message} onRetry={() => list.refetch()} />
      ) : !connected ? (
        <div className="neo-card rounded-xl">
          <EmptyState
            icon={MailX}
            title="No mailbox connected"
            hint={status?.state === 'disconnected' && status.note ? status.note : 'Connect Gmail or any IMAP mailbox to read and send mail here.'}
            action={
              <ButtonLink href={settingsHref} variant="primary" icon={<Settings size={15} aria-hidden />}>
                Connect a mailbox
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
          <section aria-label="Messages" className={cn('neo-card min-w-0 flex-col overflow-hidden rounded-xl', openId ? 'hidden lg:flex' : 'flex')}>
            <div className="space-y-3 border-b border-line-soft p-3">
              <Tabs
                label="Folder"
                items={[
                  { value: 'inbox', label: 'Inbox' },
                  { value: 'sent', label: 'Sent' },
                ]}
                value={folder}
                onChange={(next) => {
                  setFolder(next)
                  setOpenId(null)
                  scroller.current?.scrollTo({ top: 0 })
                }}
              />
              <MailFilters value={filters} onChange={setFilters} />
            </div>
            {pageError && (
              <div className="p-3">
                <ErrorNotice title="Mail server problem" message={pageError} onRetry={() => list.refetch()} />
              </div>
            )}
            <div ref={scroller} className="max-h-[70vh] min-h-40 overflow-y-auto">
              {!messages.length && !pageError && (
                <EmptyState
                  icon={Inbox}
                  title={filtersActive(filters) ? 'No messages match these filters' : `No messages in ${folder}`}
                  action={filtersActive(filters) ? <Button size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</Button> : undefined}
                />
              )}
              <ul className="divide-y divide-line-soft">
                {messages.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => open(item.id, item.unread)}
                      onPointerEnter={() => prefetch(item.id)}
                      onFocus={() => prefetch(item.id)}
                      aria-current={openId === item.id ? 'true' : undefined}
                      className="flex w-full min-w-0 gap-3 px-4 py-3 text-left hover:bg-surface-2 aria-[current]:bg-primary-light"
                    >
                      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', item.unread ? 'bg-primary' : 'bg-transparent')} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className={cn('min-w-0 flex-1 truncate text-sm text-ink', item.unread ? 'font-semibold' : 'font-medium')}>
                            {folder === 'sent' ? `To ${item.to || '—'}` : item.from}
                          </span>
                          <span className="shrink-0 text-2xs text-ink-3">{mailDate(item.date)}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink-2">
                          {item.unread && <span className="sr-only">Unread: </span>}
                          {item.subject}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {messages.length > 0 && (
                <div ref={sentinel} className="px-4 py-3 text-center text-2xs text-ink-3">
                  {isFetchingNextPage ? 'Loading more…' : hasNextPage ? (
                    <Button variant="ghost" size="sm" onClick={() => fetchNextPage()}>
                      Load more
                    </Button>
                  ) : (
                    `All ${messages.length} loaded`
                  )}
                </div>
              )}
            </div>
          </section>
          <section aria-label="Reading pane" className={cn('neo-card min-h-[50vh] min-w-0 flex-col overflow-hidden rounded-xl', openId ? 'flex' : 'hidden lg:flex')}>
            {openId ? (
              <ReadingPane
                key={`${folder}:${openId}`}
                workspaceId={workspace.id}
                folder={folder}
                messageId={openId}
                onBack={() => setOpenId(null)}
                onReply={(message) => setDraft({ to: message.fromAddress, subject: /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}` })}
              />
            ) : (
              <p className="m-auto px-6 py-16 text-center text-sm text-ink-3">Select a message to read it.</p>
            )}
          </section>
        </div>
      )}
      {draft && <ComposeDialog workspaceId={workspace.id} from={connected ? status.account : undefined} draft={draft} onClose={() => setDraft(null)} />}
    </>
  )
}
