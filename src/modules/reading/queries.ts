'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUser } from '@/core/session'
import { localDate } from '@/lib/format'
import { must, supabase } from '@/lib/supabase/client'
import { fetchPaged } from '@/modules/growth/fetch'
import { addDays } from '@/modules/growth/logic'
import type { Book, BookStatus, ReadingSession } from '@/modules/growth/types'

export const readingKeys = {
  books: (workspaceId: string) => ['ws', workspaceId, 'reading', 'books'] as const,
  sessions: (workspaceId: string) => ['ws', workspaceId, 'reading', 'sessions'] as const,
}

/** Sessions older than this are not loaded; progress of long-finished books does not need them. */
const SESSION_WINDOW_DAYS = 730

const BOOK_COLUMNS =
  'id, workspace_id, title, author, status, category_id, total_pages, cover_url, rating, learned, interesting, apply, action, pages_per_day_goal, started_at, completed_at, position, created_at'
const SESSION_COLUMNS = 'id, book_id, session_date, pages_read, duration_minutes, chapter, takeaway, created_at'

type BookRow = {
  id: string
  workspace_id: string
  title: string
  author: string
  status: BookStatus
  category_id: string | null
  total_pages: number | null
  cover_url: string | null
  rating: number | null
  learned: string | null
  interesting: string | null
  apply: string | null
  action: string | null
  pages_per_day_goal: number | string | null
  started_at: string | null
  completed_at: string | null
  position: number
  created_at: string
}
type SessionRow = {
  id: string
  book_id: string
  session_date: string
  pages_read: number | null
  duration_minutes: number | null
  chapter: string | null
  takeaway: string | null
  created_at: string
}

const toBook = (row: BookRow): Book => ({
  id: row.id,
  workspaceId: row.workspace_id,
  title: row.title,
  author: row.author,
  status: row.status,
  categoryId: row.category_id,
  totalPages: row.total_pages,
  coverUrl: row.cover_url,
  rating: row.rating,
  learned: row.learned,
  interesting: row.interesting,
  apply: row.apply,
  action: row.action,
  pagesPerDayGoal: row.pages_per_day_goal === null ? null : Number(row.pages_per_day_goal),
  startedAt: row.started_at,
  completedAt: row.completed_at,
  position: Number(row.position),
  createdAt: row.created_at,
})

const toSession = (row: SessionRow): ReadingSession => ({
  id: row.id,
  bookId: row.book_id,
  date: row.session_date,
  pages: row.pages_read,
  minutes: row.duration_minutes,
  chapter: row.chapter,
  takeaway: row.takeaway,
  createdAt: row.created_at,
})

export function useBooks(workspaceId: string | undefined) {
  const user = useUser()
  return useQuery({
    queryKey: readingKeys.books(workspaceId ?? 'none'),
    enabled: Boolean(workspaceId),
    queryFn: async () =>
      must(
        await supabase()
          .from('books')
          .select(BOOK_COLUMNS)
          .eq('workspace_id', workspaceId!)
          .eq('user_id', user.id)
          .order('position')
          .order('created_at')
          .returns<BookRow[]>(),
      ).map(toBook),
  })
}

/** Reading sessions of the last two years, newest first. */
export function useReadingSessions(workspaceId: string | undefined) {
  const user = useUser()
  return useQuery({
    queryKey: readingKeys.sessions(workspaceId ?? 'none'),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const since = addDays(localDate(), -SESSION_WINDOW_DAYS)
      const rows = await fetchPaged<SessionRow>((from, to) =>
        supabase()
          .from('reading_sessions')
          .select(SESSION_COLUMNS)
          .eq('workspace_id', workspaceId!)
          .eq('user_id', user.id)
          .gte('session_date', since)
          .order('session_date', { ascending: false })
          .order('id')
          .range(from, to)
          .returns<SessionRow[]>(),
      )
      return rows.map(toSession)
    },
  })
}

export type BookInput = Pick<
  Book,
  'title' | 'author' | 'status' | 'categoryId' | 'totalPages' | 'coverUrl' | 'rating' | 'learned' | 'interesting' | 'apply' | 'action' | 'pagesPerDayGoal'
>

/** Start and finish dates follow the status: set when first reached, kept afterwards. */
function statusDates(status: BookStatus, previous?: Pick<Book, 'startedAt' | 'completedAt'>) {
  const today = localDate()
  return {
    started_at: status === 'planned' ? (previous?.startedAt ?? null) : (previous?.startedAt ?? today),
    completed_at: status === 'completed' ? (previous?.completedAt ?? today) : null,
  }
}

const text = (value: string | null) => value?.trim() || null

export function useSaveBook(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ book, input }: { book?: Book; input: BookInput }) => {
      const row = {
        title: input.title.trim(),
        author: input.author.trim(),
        status: input.status,
        category_id: input.categoryId,
        total_pages: input.totalPages,
        cover_url: text(input.coverUrl),
        rating: input.rating,
        learned: text(input.learned),
        interesting: text(input.interesting),
        apply: text(input.apply),
        action: text(input.action),
        pages_per_day_goal: input.pagesPerDayGoal,
        ...statusDates(input.status, book),
      }
      if (book) return must(await supabase().from('books').update(row).eq('id', book.id))
      return must(await supabase().from('books').insert({ ...row, workspace_id: workspaceId, user_id: user.id, position: Date.now() / 1000 }))
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: readingKeys.books(workspaceId) }),
  })
}

/** Moves a book between planned, reading and completed, optimistically. */
export function useSetBookStatus(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = readingKeys.books(workspaceId)
  return useMutation({
    mutationFn: async ({ book, status }: { book: Book; status: BookStatus }) => must(await supabase().from('books').update({ status, ...statusDates(status, book) }).eq('id', book.id)),
    onMutate: async ({ book, status }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<Book[]>(key)
      const dates = statusDates(status, book)
      queryClient.setQueryData<Book[]>(key, (list) => list?.map((item) => (item.id === book.id ? { ...item, status, startedAt: dates.started_at, completedAt: dates.completed_at } : item)))
      return { previous }
    },
    onError: (_error, _input, context) => queryClient.setQueryData(key, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

export function useDeleteBook(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase().from('books').delete().eq('id', id)),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<Book[]>(readingKeys.books(workspaceId), (list) => list?.filter((book) => book.id !== id))
      queryClient.setQueryData<ReadingSession[]>(readingKeys.sessions(workspaceId), (list) => list?.filter((session) => session.bookId !== id))
    },
  })
}

export type SessionInput = Omit<ReadingSession, 'id' | 'createdAt'>

/** Logs a session; a planned book moves to "reading" with its first session. */
export function useLogReading(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ book, input }: { book: Book; input: SessionInput }) => {
      must(
        await supabase()
          .from('reading_sessions')
          .insert({
            workspace_id: workspaceId,
            user_id: user.id,
            book_id: book.id,
            session_date: input.date,
            pages_read: input.pages,
            duration_minutes: input.minutes,
            chapter: text(input.chapter),
            takeaway: text(input.takeaway),
          }),
      )
      if (book.status === 'planned') must(await supabase().from('books').update({ status: 'reading', ...statusDates('reading', book) }).eq('id', book.id))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: readingKeys.sessions(workspaceId) })
      queryClient.invalidateQueries({ queryKey: readingKeys.books(workspaceId) })
    },
  })
}

export function useDeleteReadingSession(workspaceId: string) {
  const queryClient = useQueryClient()
  const key = readingKeys.sessions(workspaceId)
  return useMutation({
    mutationFn: async (id: string) => must(await supabase().from('reading_sessions').delete().eq('id', id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<ReadingSession[]>(key)
      queryClient.setQueryData<ReadingSession[]>(key, (list) => list?.filter((session) => session.id !== id))
      return { previous }
    },
    onError: (_error, _id, context) => queryClient.setQueryData(key, context?.previous),
  })
}
