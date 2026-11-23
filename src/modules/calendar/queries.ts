'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { isColorKey } from '@/core/colors'
import { keys } from '@/core/query'
import { noteHref } from '@/core/routes'
import { useUser } from '@/core/session'
import { maybe, must, supabase } from '@/lib/supabase/client'
import { useCategories, type Category } from '@/modules/categories/queries'
import { addDays, startOfDay } from './logic'

export type Meeting = {
  id: string
  workspaceId: string
  projectId: string | null
  categoryId: string | null
  title: string
  description: string | null
  startsAt: string
  endsAt: string
  allDay: boolean
  location: string | null
  meetingUrl: string | null
  createdBy: string
}

type MeetingRow = {
  id: string
  workspace_id: string
  project_id: string | null
  category_id: string | null
  title: string
  description: string | null
  starts_at: string
  ends_at: string
  all_day: boolean
  location: string | null
  meeting_url: string | null
  created_by: string
}

const MEETING_COLUMNS = 'id, workspace_id, project_id, category_id, title, description, starts_at, ends_at, all_day, location, meeting_url, created_by'

/**
 * Meetings are found by start time (the indexed column); a meeting that started up to
 * this many days before the range and is still going is included too.
 */
const LOOKBACK_DAYS = 14

function toMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    categoryId: row.category_id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    location: row.location,
    meetingUrl: row.meeting_url,
    createdBy: row.created_by,
  }
}

/** Every key starts with 'meetings', so realtime changes refresh all of them. */
export const meetingKeys = {
  range: (scope: string, start: Date, end: Date) => ['meetings', scope, start.toISOString(), end.toISOString()] as const,
  upcoming: (scope: string, day: string) => ['meetings', scope, 'upcoming', day] as const,
}

async function fetchMeetings(scope: string | 'all', start: Date, end: Date, limit = 1000) {
  let query = supabase()
    .from('meetings')
    .select(MEETING_COLUMNS)
    .gte('starts_at', addDays(start, -LOOKBACK_DAYS).toISOString())
    .lt('starts_at', end.toISOString())
    .gt('ends_at', start.toISOString())
  if (scope !== 'all') query = query.eq('workspace_id', scope)
  return must(await query.order('starts_at').limit(limit).returns<MeetingRow[]>()).map(toMeeting)
}

/** Meetings overlapping [start, end) in one workspace or in every workspace ('all'). */
export function useMeetings(scope: string | 'all' | undefined, start: Date, end: Date) {
  return useQuery({
    queryKey: meetingKeys.range(scope ?? 'none', start, end),
    enabled: Boolean(scope),
    placeholderData: (previous) => previous,
    queryFn: () => fetchMeetings(scope!, start, end),
  })
}

/** Today's and the next week's meetings (for the dashboard). */
export function useUpcomingMeetings(scope: string | 'all', days = 7) {
  const today = startOfDay(new Date())
  return useQuery({
    queryKey: meetingKeys.upcoming(scope, today.toISOString()),
    queryFn: () => fetchMeetings(scope, today, addDays(today, days), 30),
  })
}

/**
 * Meeting types (categories with scope 'meeting') for one workspace, or for every
 * workspace on cross-workspace pages.
 */
export function useMeetingTypes(scope: string | 'all') {
  const one = useCategories(scope === 'all' ? undefined : scope, 'meeting')
  const all = useQuery({
    queryKey: keys.categories('all', 'meeting'),
    enabled: scope === 'all',
    staleTime: 5 * 60_000,
    queryFn: async () =>
      must(
        await supabase().from('categories').select('id, workspace_id, scope, name, color, position, archived_at').eq('scope', 'meeting').order('position'),
      ).map(
        (row): Category => ({
          id: row.id,
          workspaceId: row.workspace_id,
          scope: 'meeting',
          name: row.name,
          color: isColorKey(row.color) ? row.color : 'slate',
          position: row.position,
          archivedAt: row.archived_at,
        }),
      ),
  })
  return (scope === 'all' ? all.data : one.data) ?? []
}

export type MeetingInput = {
  workspaceId: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string
  allDay: boolean
  categoryId: string | null
  projectId: string | null
  location: string | null
  meetingUrl: string | null
}

const toRow = (input: MeetingInput) => ({
  workspace_id: input.workspaceId,
  title: input.title.trim(),
  description: input.description?.trim() || null,
  starts_at: input.startsAt,
  ends_at: input.endsAt,
  all_day: input.allDay,
  category_id: input.categoryId,
  project_id: input.projectId,
  location: input.location?.trim() || null,
  meeting_url: input.meetingUrl,
})

export function useSaveMeeting() {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: MeetingInput }) => {
      if (id) {
        const { workspace_id: _workspace, ...changes } = toRow(input)
        return toMeeting(must(await supabase().from('meetings').update(changes).eq('id', id).select(MEETING_COLUMNS).single<MeetingRow>()))
      }
      return toMeeting(
        must(await supabase().from('meetings').insert({ ...toRow(input), created_by: user.id }).select(MEETING_COLUMNS).single<MeetingRow>()),
      )
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['meetings'] }),
  })
}

export function useDeleteMeeting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => must(await supabase().from('meetings').delete().eq('id', id)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['meetings'] }),
  })
}

/** The signed-in user's note for a meeting, if they have taken one. */
export function useMeetingNote(meetingId: string | undefined) {
  const user = useUser()
  return useQuery({
    queryKey: ['meetings', 'note', meetingId ?? 'none'],
    enabled: Boolean(meetingId),
    queryFn: async () =>
      maybe(
        await supabase().from('notes').select('id').eq('meeting_id', meetingId!).eq('user_id', user.id).maybeSingle<{ id: string }>(),
      )?.id ?? null,
  })
}

/**
 * Opens the user's note for a meeting, creating it first (one note per person per
 * meeting, enforced by a unique index; a lost race just reads the winner's row).
 */
export function useOpenMeetingNote() {
  const user = useUser()
  const router = useRouter()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ meeting, workspaceSlug }: { meeting: Meeting; workspaceSlug: string }) => {
      const db = supabase()
      const find = async () =>
        maybe(await db.from('notes').select('id').eq('meeting_id', meeting.id).eq('user_id', user.id).maybeSingle<{ id: string }>())?.id
      let noteId = await find()
      if (!noteId) {
        const when = new Date(meeting.startsAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
        const created = await db
          .from('notes')
          .insert({ workspace_id: meeting.workspaceId, user_id: user.id, meeting_id: meeting.id, project_id: meeting.projectId, title: `${meeting.title} · ${when}`.slice(0, 300) })
          .select('id')
          .single<{ id: string }>()
        noteId = created.error?.code === '23505' ? await find() : must(created).id
      }
      if (!noteId) throw new Error('Could not open the meeting note.')
      return { noteId, href: noteHref(workspaceSlug, noteId) }
    },
    onSuccess: ({ href }, { meeting }) => {
      queryClient.invalidateQueries({ queryKey: ['meetings', 'note', meeting.id] })
      queryClient.invalidateQueries({ queryKey: ['notes'] })
      router.push(href)
    },
  })
}
