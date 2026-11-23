'use client'

import { useState, type FormEvent } from 'react'
import { localDate } from '@/lib/format'
import { numberOrNull } from '@/modules/growth/logic'
import type { Book } from '@/modules/growth/types'
import { Button } from '@/ui/button'
import { Dialog } from '@/ui/dialog'
import { Field, Input, Textarea } from '@/ui/field'
import { toast } from '@/ui/toast'
import { useLogReading } from './queries'

/** Logs pages, minutes, the chapter and a takeaway for one book on one day. */
export function SessionDialog({ workspaceId, book, onClose }: { workspaceId: string; book: Book; onClose: () => void }) {
  const log = useLogReading(workspaceId)
  const [date, setDate] = useState(() => localDate())
  const [pages, setPages] = useState('')
  const [minutes, setMinutes] = useState('')
  const [chapter, setChapter] = useState('')
  const [takeaway, setTakeaway] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const pagesValue = numberOrNull(pages)
    const minutesValue = numberOrNull(minutes)
    if ((pages && pagesValue === null) || (minutes && minutesValue === null)) return setError('Pages and minutes must be whole numbers.')
    if (!pagesValue && !minutesValue && !takeaway.trim()) return setError('Add pages, minutes or a takeaway.')
    setError(null)
    await log.mutateAsync({
      book,
      input: {
        bookId: book.id,
        date,
        pages: pagesValue === null ? null : Math.round(pagesValue),
        minutes: minutesValue === null ? null : Math.round(minutesValue),
        chapter,
        takeaway,
      },
    })
    toast.success('Session logged')
    onClose()
  }

  return (
    <Dialog title="Log reading" description={book.title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date">{(props) => <Input {...props} type="date" required max={localDate()} value={date} onChange={(event) => setDate(event.target.value)} />}</Field>
          <Field label="Pages read" optional>
            {(props) => <Input {...props} type="number" min={0} step={1} autoFocus value={pages} onChange={(event) => setPages(event.target.value)} />}
          </Field>
          <Field label="Minutes" optional>
            {(props) => <Input {...props} type="number" min={0} step={1} value={minutes} onChange={(event) => setMinutes(event.target.value)} />}
          </Field>
        </div>
        <Field label="Chapter" optional>
          {(props) => <Input {...props} maxLength={120} value={chapter} onChange={(event) => setChapter(event.target.value)} placeholder="e.g. Chapter 3" />}
        </Field>
        <Field label="Takeaway" optional>
          {(props) => <Textarea {...props} maxLength={4000} value={takeaway} onChange={(event) => setTakeaway(event.target.value)} placeholder="What stood out?" />}
        </Field>
        {error && (
          <p role="alert" className="text-xs text-error-ink">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-line-soft pt-4">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={log.isPending}>
            Save session
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
