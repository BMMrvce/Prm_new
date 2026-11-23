'use client'

import { BookOpen } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { Workspace } from '@/core/types'
import { isHttpsUrl, numberOrNull } from '@/modules/growth/logic'
import type { Book, BookStatus } from '@/modules/growth/types'
import { CategoryField, ScalePicker } from '@/modules/growth/ui'
import { Button } from '@/ui/button'
import { ConfirmDialog, Dialog } from '@/ui/dialog'
import { Field, Input, Select, Textarea } from '@/ui/field'
import { toast } from '@/ui/toast'
import { useDeleteBook, useSaveBook } from './queries'

const TAKEAWAYS = [
  { key: 'learned', label: 'What did I learn?' },
  { key: 'interesting', label: 'What was interesting?' },
  { key: 'apply', label: 'How can I apply it?' },
  { key: 'action', label: 'What will I do next?' },
] as const

type Takeaway = (typeof TAKEAWAYS)[number]['key']

/** Add or edit a book: details, reading goal, rating and takeaways. */
export function BookDialog({ workspace, book, onClose }: { workspace: Workspace; book: Book | null; onClose: () => void }) {
  const save = useSaveBook(workspace.id)
  const remove = useDeleteBook(workspace.id)
  const [title, setTitle] = useState(book?.title ?? '')
  const [author, setAuthor] = useState(book?.author ?? '')
  const [status, setStatus] = useState<BookStatus>(book?.status ?? 'planned')
  const [categoryId, setCategoryId] = useState(book?.categoryId ?? '')
  const [pages, setPages] = useState(book?.totalPages ? String(book.totalPages) : '')
  const [goal, setGoal] = useState(book?.pagesPerDayGoal ? String(book.pagesPerDayGoal) : '')
  const [cover, setCover] = useState(book?.coverUrl ?? '')
  const [rating, setRating] = useState<number | null>(book?.rating ?? null)
  const [notes, setNotes] = useState<Record<Takeaway, string>>({
    learned: book?.learned ?? '',
    interesting: book?.interesting ?? '',
    apply: book?.apply ?? '',
    action: book?.action ?? '',
  })
  const [confirming, setConfirming] = useState(false)
  const coverError = cover.trim() && !isHttpsUrl(cover.trim()) ? 'Use an https:// image link.' : null
  const pagesValue = numberOrNull(pages, 1)
  const goalValue = numberOrNull(goal, 0.1)
  const numberError = (pages && !pagesValue) || (goal && !goalValue) ? 'Pages must be a number above zero.' : null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim() || coverError || numberError) return
    await save.mutateAsync({
      book: book ?? undefined,
      input: {
        title,
        author,
        status,
        categoryId: categoryId || null,
        totalPages: pagesValue ? Math.round(pagesValue) : null,
        pagesPerDayGoal: goalValue,
        coverUrl: cover.trim() || null,
        rating,
        ...notes,
      },
    })
    toast.success(book ? 'Book saved' : 'Book added')
    onClose()
  }

  return (
    <Dialog title={book ? 'Edit book' : 'Add a book'} size="lg" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex gap-4">
          <div className="hidden h-32 w-22 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-surface-2 sm:grid" aria-hidden>
            {cover && !coverError ? <img src={cover} alt="" className="size-full object-cover" /> : <BookOpen size={20} className="text-ink-3" />}
          </div>
          <div className="min-w-0 flex-1 space-y-4">
            <Field label="Title">{(props) => <Input {...props} required autoFocus maxLength={300} value={title} onChange={(event) => setTitle(event.target.value)} />}</Field>
            <Field label="Author" optional>
              {(props) => <Input {...props} maxLength={200} value={author} onChange={(event) => setAuthor(event.target.value)} />}
            </Field>
          </div>
        </div>
        <Field label="Cover image link" optional error={coverError} hint="An https:// link to the cover picture.">
          {(props) => <Input {...props} type="url" inputMode="url" maxLength={1000} placeholder="https://" value={cover} onChange={(event) => setCover(event.target.value)} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Status">
            {(props) => (
              <Select {...props} value={status} onChange={(event) => setStatus(event.target.value as BookStatus)}>
                <option value="planned">Want to read</option>
                <option value="reading">Reading</option>
                <option value="completed">Finished</option>
              </Select>
            )}
          </Field>
          <Field label="Pages" optional error={numberError}>
            {(props) => <Input {...props} type="number" min={1} value={pages} onChange={(event) => setPages(event.target.value)} />}
          </Field>
          <Field label="Goal, pages a day" optional>
            {(props) => <Input {...props} type="number" min={0} step="any" value={goal} onChange={(event) => setGoal(event.target.value)} />}
          </Field>
        </div>
        <CategoryField workspace={workspace} scope="book" label="Genre" value={categoryId} onChange={setCategoryId} />
        <details className="group rounded-lg border border-line-soft" open={Boolean(book && (book.rating || book.learned || book.interesting || book.apply || book.action))}>
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-ink-2 select-none">Rating and takeaways</summary>
          <div className="space-y-4 border-t border-line-soft p-3">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-ink-2">Your rating</p>
              <ScalePicker stars allowClear label="Rating" value={rating} onChange={setRating} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {TAKEAWAYS.map((item) => (
                <Field key={item.key} label={item.label} optional>
                  {(props) => <Textarea {...props} rows={2} maxLength={4000} value={notes[item.key]} onChange={(event) => setNotes({ ...notes, [item.key]: event.target.value })} />}
                </Field>
              ))}
            </div>
          </div>
        </details>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-4">
          {book ? (
            <Button variant="ghost" className="text-error-ink" onClick={() => setConfirming(true)}>
              Delete book
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={save.isPending} disabled={!title.trim()}>
              {book ? 'Save book' : 'Add book'}
            </Button>
          </div>
        </div>
      </form>
      {confirming && book && (
        <ConfirmDialog
          title="Delete this book?"
          message={`“${book.title}” and its reading sessions will be deleted.`}
          busy={remove.isPending}
          onClose={() => setConfirming(false)}
          onConfirm={() =>
            remove.mutate(book.id, {
              onSuccess: () => {
                toast.success('Book deleted')
                onClose()
              },
            })
          }
        />
      )}
    </Dialog>
  )
}
