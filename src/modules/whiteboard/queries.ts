'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUser } from '@/core/session'
import { maybe, must, supabase } from '@/lib/supabase/client'

export type BoardSummary = {
  id: string
  workspaceId: string
  projectId: string | null
  title: string
  createdBy: string
  updatedBy: string | null
  updatedAt: string
}

export type BoardScene = { elements: unknown[]; appState?: { viewBackgroundColor?: string; gridSize?: number | null } }

export type Board = BoardSummary & { scene: BoardScene; version: number }

type Row = {
  id: string
  workspace_id: string
  project_id: string | null
  title: string
  created_by: string
  updated_by: string | null
  updated_at: string
  scene?: BoardScene
  version?: number
}

const LIST = 'id, workspace_id, project_id, title, created_by, updated_by, updated_at'

const toSummary = (row: Row): BoardSummary => ({
  id: row.id,
  workspaceId: row.workspace_id,
  projectId: row.project_id,
  title: row.title,
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  updatedAt: row.updated_at,
})

export const boardKeys = {
  list: (workspaceId: string) => ['whiteboards', workspaceId, 'list'] as const,
  one: (id: string) => ['whiteboards', 'one', id] as const,
}

/** Board names only: scenes can be megabytes and load when a board opens. */
export function useBoards(workspaceId: string) {
  return useQuery({
    queryKey: boardKeys.list(workspaceId),
    queryFn: async () =>
      must(await supabase().from('whiteboards').select(LIST).eq('workspace_id', workspaceId).order('updated_at', { ascending: false }).limit(500).returns<Row[]>()).map(toSummary),
  })
}

export function useBoard(id: string) {
  return useQuery({
    queryKey: boardKeys.one(id),
    // The canvas owns the scene while open; it syncs live and saves on its own.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const row = maybe(await supabase().from('whiteboards').select(`${LIST}, scene, version`).eq('id', id).maybeSingle<Row>())
      return row ? ({ ...toSummary(row), scene: row.scene ?? { elements: [] }, version: row.version ?? 1 } satisfies Board) : null
    },
  })
}

export function useCreateBoard(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ title, projectId }: { title: string; projectId?: string | null }) =>
      must(
        await supabase()
          .from('whiteboards')
          .insert({ workspace_id: workspaceId, title: title.trim() || 'Untitled board', project_id: projectId ?? null, created_by: user.id })
          .select('id')
          .single(),
      ).id as string,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boardKeys.list(workspaceId) }),
  })
}

export function useUpdateBoard(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, title, projectId }: { id: string; title?: string; projectId?: string | null }) => {
      const row: Record<string, unknown> = {}
      if (title !== undefined) row.title = title.trim() || 'Untitled board'
      if (projectId !== undefined) row.project_id = projectId
      must(await supabase().from('whiteboards').update(row).eq('id', id))
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: boardKeys.list(workspaceId) })
      queryClient.setQueryData<Board | null>(boardKeys.one(id), (board) => board)
    },
  })
}

export function useDeleteBoard(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const db = supabase()
      // Remove the board's images, then the board.
      const prefix = `${workspaceId}/${id}`
      const files = must(await db.storage.from('whiteboards').list(prefix, { limit: 1000 }))
      if (files.length) await db.storage.from('whiteboards').remove(files.map((file) => `${prefix}/${file.name}`))
      must(await db.from('whiteboards').delete().eq('id', id))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boardKeys.list(workspaceId) }),
  })
}

/**
 * Saves the scene only if nobody saved a newer version meanwhile (optimistic
 * concurrency on `version`). Returns the new version, or null on conflict so the caller
 * can merge with the server copy and try again.
 */
export async function saveScene(id: string, scene: BoardScene, knownVersion: number) {
  const rows = must(await supabase().from('whiteboards').update({ scene }).eq('id', id).eq('version', knownVersion).select('version'))
  return rows.length ? (rows[0].version as number) : null
}

export async function fetchScene(id: string) {
  const row = maybe(await supabase().from('whiteboards').select('scene, version').eq('id', id).maybeSingle<{ scene: BoardScene; version: number }>())
  return row
}
