'use client'

import { BookOpen, ChevronDown, MoreHorizontal, NotebookPen, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { Category } from '@/modules/categories/queries'
import { bookProgress, formatDay, formatMinutes, pagesRead, readingPace } from '@/modules/growth/logic'
import type { Book, BookStatus, ReadingSession } from '@/modules/growth/types'
import { CategoryChip, ProgressBar, Stars } from '@/modules/growth/ui'
import { Button, IconButton } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Select } from '@/ui/field'
import { Menu } from '@/ui/menu'
import { useDeleteReadingSession, useSetBookStatus } from './queries'

const TAKEAWAY_LABELS = { learned: 'Learned', interesting: 'Interesting', apply: 'Apply', action: 'Next action' } as const

/** One book: cover, progress from logged sessions, status, and its recent sessions. */
export function BookRow({
  workspaceId,
  book,
  sessions,
  category,
  today,
  writable,
  onEdit,
  onLog,
}: {
  workspaceId: string
  book: Book
  sessions: ReadingSession[]
  category: Category | undefined
  today: string
  writable: boolean
  onEdit: () => void
  onLog: () => void
}) {
  const setStatus = useSetBookStatus(workspaceId)
  const removeSession = useDeleteReadingSession(workspaceId)
  const [open, setOpen] = useState(false)
  const pages = pagesRead(sessions)
  const progress = bookProgress(book, pages)
  const pace = readingPace(sessions, today)
  const takeaways = (Object.keys(TAKEAWAY_LABELS) as (keyof typeof TAKEAWAY_LABELS)[]).filter((key) => book[key])
  const hasDetail = sessions.length > 0 || takeaways.length > 0

  return (
    <li className="animate-row py-3">
      <div className="flex gap-3">
        <div className="grid h-16 w-11 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface-2">
          {book.coverUrl ? <img src={book.coverUrl} alt="" loading="lazy" className="size-full object-cover" /> : <BookOpen size={16} className="text-ink-3" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-ui font-medium text-ink">{book.title}</p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-ink-3">
                {book.author && <span>{book.author}</span>}
                <CategoryChip category={category} />
                {book.rating && <Stars rating={book.rating} />}
              </p>
            </div>
            {writable && (
              <Menu
                label={`${book.title} actions`}
                trigger={(props) => (
                  <IconButton {...props} size="sm" label={`More for ${book.title}`}>
                    <MoreHorizontal size={15} />
                  </IconButton>
                )}
                items={[
                  { label: 'Edit and takeaways', icon: <Pencil size={14} />, onSelect: onEdit },
                  { label: 'Log reading', icon: <NotebookPen size={14} />, onSelect: onLog },
                ]}
              />
            )}
          </div>
          {book.status !== 'planned' && (
            <div className="mt-2 flex items-center gap-3">
              <ProgressBar value={progress ?? 0} label={`${book.title} progress`} className="max-w-64 flex-1" tone={book.status === 'completed' ? 'bg-success' : 'bg-primary'} />
              <span className="text-2xs text-ink-2 tabular-nums">
                {book.totalPages ? `${Math.min(pages, book.totalPages)}/${book.totalPages} pages` : pages ? `${pages} pages` : 'No pages logged'}
                {progress !== null && book.status === 'reading' ? ` · ${progress}%` : ''}
              </span>
            </div>
          )}
          {book.status === 'reading' && book.pagesPerDayGoal && (
            <p className={cn('mt-1 text-2xs', pace >= book.pagesPerDayGoal ? 'text-success-ink' : 'text-ink-3')}>
              {pace} pages a day this week · goal {book.pagesPerDayGoal}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {writable && (
              <>
                <Select
                  aria-label={`Status of ${book.title}`}
                  value={book.status}
                  onChange={(event) => setStatus.mutate({ book, status: event.target.value as BookStatus })}
                  className="h-8 w-auto text-xs"
                >
                  <option value="planned">Want to read</option>
                  <option value="reading">Reading</option>
                  <option value="completed">Finished</option>
                </Select>
                {book.status !== 'completed' && (
                  <Button size="sm" onClick={onLog}>
                    Log reading
                  </Button>
                )}
              </>
            )}
            {hasDetail && (
              <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen((value) => !value)} icon={<ChevronDown size={14} aria-hidden className={cn('transition-transform', !open && '-rotate-90')} />}>
                {sessions.length ? `${sessions.length} session${sessions.length === 1 ? '' : 's'}` : 'Takeaways'}
              </Button>
            )}
          </div>
          {open && (
            <div className="animate-reveal mt-3 space-y-3">
              {takeaways.length > 0 && (
                <dl className="grid gap-2 sm:grid-cols-2">
                  {takeaways.map((key) => (
                    <div key={key} className="rounded-lg bg-surface-2 px-3 py-2">
                      <dt className="text-2xs font-medium text-ink-3">{TAKEAWAY_LABELS[key]}</dt>
                      <dd className="text-xs whitespace-pre-line text-ink-2">{book[key]}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {sessions.length > 0 && (
                <ul className="space-y-1">
                  {sessions.slice(0, 8).map((session) => (
                    <li key={session.id} className="group flex items-start gap-2 text-xs">
                      <span className="w-16 shrink-0 text-ink-3">{formatDay(session.date)}</span>
                      <span className="min-w-0 flex-1 text-ink-2">
                        {[session.chapter, session.pages ? `${session.pages} pages` : null, session.minutes ? formatMinutes(session.minutes) : null].filter(Boolean).join(' · ') || 'Session'}
                        {session.takeaway && <span className="block text-ink-3">“{session.takeaway}”</span>}
                      </span>
                      {writable && (
                        <IconButton size="sm" label={`Delete session on ${formatDay(session.date)}`} onClick={() => removeSession.mutate(session.id)} className="opacity-60 hover:opacity-100">
                          <Trash2 size={12} />
                        </IconButton>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
