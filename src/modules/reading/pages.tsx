'use client'

import { BookOpen, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ModuleGate } from '@/components/shell/module-gate'
import { canWrite, useCurrentWorkspace } from '@/core/workspaces'
import { localDate } from '@/lib/format'
import { addDays, formatDay, pagesByDay, pagesRead, readingDays, startOfWeek } from '@/modules/growth/logic'
import type { Book, BookStatus, ReadingSession } from '@/modules/growth/types'
import { StatTile, useCategoryMap } from '@/modules/growth/ui'
import { useTabParam } from '@/modules/growth/use-tab'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Card, EmptyState, ErrorNotice, PageHeader } from '@/ui/misc'
import { PageSkeleton } from '@/ui/spinner'
import { TabPanel, Tabs } from '@/ui/tabs'
import { errorMessage } from '@/ui/toast'
import { BookDialog } from './book-dialog'
import { BookRow } from './book-row'
import { useBooks, useReadingSessions } from './queries'
import { SessionDialog } from './session-dialog'

const SHELVES = ['reading', 'planned', 'completed'] as const
const SHELF_LABELS: Record<BookStatus, string> = { reading: 'Reading', planned: 'Want to read', completed: 'Finished' }

export function ReadingPage() {
  return (
    <ModuleGate id="reading">
      <Reading />
    </ModuleGate>
  )
}

function Reading() {
  const workspace = useCurrentWorkspace()
  const writable = canWrite(workspace)
  const [today] = useState(() => localDate())
  const [shelf, setShelf] = useTabParam(SHELVES, 'reading')
  const [editing, setEditing] = useState<Book | null | undefined>(undefined)
  const [logging, setLogging] = useState<Book | null>(null)
  const books = useBooks(workspace.id)
  const sessions = useReadingSessions(workspace.id)
  const categories = useCategoryMap(workspace.id, 'book')

  const byBook = useMemo(() => {
    const map = new Map<string, ReadingSession[]>()
    for (const session of sessions.data ?? []) map.set(session.bookId, [...(map.get(session.bookId) ?? []), session])
    return map
  }, [sessions.data])

  const list = books.data ?? []
  const shown = list.filter((book) => book.status === shelf)
  const all = sessions.data ?? []
  const weekStart = startOfWeek(today, workspace.settings.weekStart ?? 1)
  const yearStart = `${today.slice(0, 4)}-01-01`
  const failed = books.error ?? sessions.error

  return (
    <>
      <PageHeader
        title="Reading"
        description="Your library, what you read each day, and what you took from it."
        actions={
          writable && (
            <Button variant="primary" icon={<Plus size={15} aria-hidden />} onClick={() => setEditing(null)}>
              Add book
            </Button>
          )
        }
      />
      {failed ? (
        <ErrorNotice message={errorMessage(failed)} onRetry={() => (books.refetch(), sessions.refetch())} />
      ) : books.isPending || sessions.isPending ? (
        <PageSkeleton rows={4} />
      ) : !list.length ? (
        <div className="neo-card rounded-xl">
          <EmptyState
            icon={BookOpen}
            title="Your library is empty"
            hint="Add books you want to read or are reading now. Log sessions to see your progress and pace."
            action={
              writable && (
                <Button variant="primary" onClick={() => setEditing(null)}>
                  Add a book
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Reading now" value={list.filter((book) => book.status === 'reading').length} note={`${list.filter((book) => book.status === 'planned').length} on the list`} />
            <StatTile label="This week" value={pagesRead(all.filter((session) => session.date >= weekStart))} note={`pages over ${readingDays(all, weekStart, today)} days`} />
            <StatTile label="Finished" value={list.filter((book) => book.status === 'completed' && (book.completedAt ?? '') >= yearStart).length} note={`books in ${today.slice(0, 4)}`} />
            <StatTile label="Last 30 days" value={pagesRead(all.filter((session) => session.date >= addDays(today, -29)))} note="pages read" />
          </div>
          <PagesChart sessions={all} today={today} />
          <div>
            <Tabs
              label="Shelves"
              idBase="reading"
              className="mb-3"
              value={shelf}
              onChange={setShelf}
              items={SHELVES.map((value) => ({ value, label: SHELF_LABELS[value], count: list.filter((book) => book.status === value).length }))}
            />
            <TabPanel idBase="reading" value={shelf} className="neo-card rounded-xl px-4">
              {shown.length ? (
                <ul className="divide-y divide-line-soft">
                  {shown.map((book) => (
                    <BookRow
                      key={book.id}
                      workspaceId={workspace.id}
                      book={book}
                      sessions={byBook.get(book.id) ?? []}
                      category={book.categoryId ? categories.byId.get(book.categoryId) : undefined}
                      today={today}
                      writable={writable}
                      onEdit={() => setEditing(book)}
                      onLog={() => setLogging(book)}
                    />
                  ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-xs text-ink-3">No books on this shelf.</p>
              )}
            </TabPanel>
          </div>
        </div>
      )}
      {editing !== undefined && <BookDialog key={editing?.id ?? 'new'} workspace={workspace} book={editing} onClose={() => setEditing(undefined)} />}
      {logging && <SessionDialog workspaceId={workspace.id} book={logging} onClose={() => setLogging(null)} />}
    </>
  )
}

/** Pages read per day over the last 30 days. */
function PagesChart({ sessions, today }: { sessions: ReadingSession[]; today: string }) {
  const days = pagesByDay(sessions, addDays(today, -29), today)
  const max = Math.max(...days.map((day) => day.pages))
  if (!max) return null
  const total = days.reduce((sum, day) => sum + day.pages, 0)
  return (
    <Card title="Pages per day" description="Last 30 days">
      <div className="flex h-28 items-end gap-0.5" role="img" aria-label={`Pages read per day over the last 30 days: ${total} pages, most in one day ${max}.`}>
        {days.map((day) => (
          <div key={day.date} className="group relative flex h-full flex-1 items-end" title={`${formatDay(day.date, { weekday: 'short', day: 'numeric', month: 'short' })}: ${day.pages} pages`}>
            <div className={cn('w-full rounded-t-[4px] group-hover:bg-primary-hover', day.pages ? 'bg-primary' : 'h-0.5 bg-line')} style={day.pages ? { height: `${Math.max(4, (day.pages / max) * 100)}%` } : undefined} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-2xs text-ink-3" aria-hidden>
        <span>{formatDay(days[0].date)}</span>
        <span>Today</span>
      </div>
    </Card>
  )
}
