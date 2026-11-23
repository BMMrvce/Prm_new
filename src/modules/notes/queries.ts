'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUser } from '@/core/session'
import { maybe, must, supabase } from '@/lib/supabase/client'

export type NoteSummary = {
  id: string
  workspaceId: string
  ownerId: string
  projectId: string | null
  meetingId: string | null
  title: string
  pinned: boolean
  protected: boolean
  updatedAt: string
  createdAt: string
  memberIds: string[]
  meeting: { title: string; startsAt: string; categoryId: string | null } | null
}

export type Note = NoteSummary & { content: string }

type NoteRow = {
  id: string
  workspace_id: string
  user_id: string
  project_id: string | null
  meeting_id: string | null
  title: string
  pinned: boolean
  protected: boolean
  updated_at: string
  created_at: string
  content?: string
  note_members: { user_id: string }[]
  meetings: { title: string; starts_at: string; category_id: string | null } | null
}

// The list never loads note bodies (they can be large); the open note loads its own.
const LIST_COLUMNS =
  'id, workspace_id, user_id, project_id, meeting_id, title, pinned, protected, updated_at, created_at, note_members(user_id), meetings(title, starts_at, category_id)'

function toSummary(row: NoteRow): NoteSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    ownerId: row.user_id,
    projectId: row.project_id,
    meetingId: row.meeting_id,
    title: row.title,
    pinned: row.pinned,
    protected: row.protected,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    memberIds: (row.note_members ?? []).map((member) => member.user_id),
    meeting: row.meetings ? { title: row.meetings.title, startsAt: row.meetings.starts_at, categoryId: row.meetings.category_id } : null,
  }
}

export const noteKeys = {
  list: (workspaceId: string) => ['notes', workspaceId, 'list'] as const,
  one: (noteId: string) => ['notes', 'one', noteId] as const,
}

/** Notes you own or that were shared with you, in one workspace (RLS decides). */
export function useNotes(workspaceId: string) {
  return useQuery({
    queryKey: noteKeys.list(workspaceId),
    queryFn: async () =>
      must(
        await supabase().from('notes').select(LIST_COLUMNS).eq('workspace_id', workspaceId).order('updated_at', { ascending: false }).limit(1000).returns<NoteRow[]>(),
      ).map(toSummary),
  })
}

export function useNote(noteId: string | null) {
  return useQuery({
    queryKey: noteKeys.one(noteId ?? 'none'),
    enabled: Boolean(noteId),
    // The editor owns the content while open; don't refetch under the cursor.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const row = maybe(await supabase().from('notes').select(`${LIST_COLUMNS}, content`).eq('id', noteId!).maybeSingle<NoteRow>())
      return row ? ({ ...toSummary(row), content: row.content ?? '' } satisfies Note) : null
    },
  })
}

/** Note ids whose text matches (Postgres full-text search, prefix matching). */
export function useNoteSearch(workspaceId: string, term: string) {
  return useQuery({
    queryKey: ['notes', workspaceId, 'search', term],
    enabled: term.length >= 2,
    staleTime: 10_000,
    queryFn: async () => {
      const rows = must(await supabase().rpc('search_all', { term, target_workspace: workspaceId, max_results: 50 })) as { kind: string; id: string }[]
      return new Set(rows.filter((row) => row.kind === 'note').map((row) => row.id))
    },
  })
}

export function useCreateNote(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { projectId?: string | null; meetingId?: string | null; title?: string; content?: string }) =>
      must(
        await supabase()
          .from('notes')
          .insert({
            workspace_id: workspaceId,
            user_id: user.id,
            project_id: input.projectId ?? null,
            meeting_id: input.meetingId ?? null,
            title: input.title ?? '',
            content: input.content ?? '',
          })
          .select('id')
          .single(),
      ).id as string,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: noteKeys.list(workspaceId) }),
  })
}

export type NoteChanges = Partial<{ title: string; content: string; pinned: boolean; projectId: string | null }>

/** Saves a note; the list is patched locally so it stays in step without refetching. */
export function useUpdateNote(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: async ({ id, changes }: { id: string; changes: NoteChanges }) => {
      const row: Record<string, unknown> = {}
      if (changes.title !== undefined) row.title = changes.title.slice(0, 300)
      if (changes.content !== undefined) row.content = changes.content
      if (changes.pinned !== undefined) row.pinned = changes.pinned
      if (changes.projectId !== undefined) row.project_id = changes.projectId
      return must(await supabase().from('notes').update(row).eq('id', id).select('updated_at').single()).updated_at as string
    },
    onMutate: ({ id, changes }) => {
      queryClient.setQueryData<NoteSummary[]>(noteKeys.list(workspaceId), (list) =>
        list?.map((note) => (note.id === id ? { ...note, ...changes, updatedAt: new Date().toISOString() } : note)),
      )
      queryClient.setQueryData<Note | null>(noteKeys.one(id), (note) => (note ? { ...note, ...changes } : note))
    },
  })
}

export function useDeleteNote(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase().from('notes').delete().eq('id', id)),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<NoteSummary[]>(noteKeys.list(workspaceId), (list) => list?.filter((note) => note.id !== id))
      queryClient.removeQueries({ queryKey: noteKeys.one(id) })
    },
  })
}

export function useShareNote(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, add, remove }: { id: string; add: string[]; remove: string[] }) => {
      const db = supabase()
      if (add.length) must(await db.from('note_members').insert(add.map((user_id) => ({ note_id: id, user_id }))))
      if (remove.length) must(await db.from('note_members').delete().eq('note_id', id).in('user_id', remove))
    },
    onSettled: (_data, _error, { id }) => {
      queryClient.invalidateQueries({ queryKey: noteKeys.list(workspaceId) })
      queryClient.invalidateQueries({ queryKey: noteKeys.one(id) })
    },
  })
}
