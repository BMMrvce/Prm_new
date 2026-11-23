'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isColorKey } from '@/core/colors'
import { keys } from '@/core/query'
import { slugify } from '@/core/routes'
import { useUser } from '@/core/session'
import type { ColorKey } from '@/core/types'
import { must, supabase } from '@/lib/supabase/client'

export type ProjectStatus = 'planned' | 'active' | 'paused' | 'completed' | 'archived'
export type ProjectVisibility = 'workspace' | 'team' | 'private'

export type Project = {
  id: string
  workspaceId: string
  teamId: string | null
  name: string
  slug: string
  description: string | null
  color: ColorKey
  icon: string | null
  status: ProjectStatus
  visibility: ProjectVisibility
  leadId: string | null
  startDate: string | null
  targetDate: string | null
  createdBy: string
  createdAt: string
  memberIds: string[]
}

type ProjectRow = {
  id: string
  workspace_id: string
  team_id: string | null
  name: string
  slug: string
  description: string | null
  color: string
  icon: string | null
  status: ProjectStatus
  visibility: ProjectVisibility
  lead_id: string | null
  start_date: string | null
  target_date: string | null
  created_by: string
  created_at: string
  project_members: { user_id: string }[]
}

export const PROJECT_SELECT =
  'id, workspace_id, team_id, name, slug, description, color, icon, status, visibility, lead_id, start_date, target_date, created_by, created_at, project_members(user_id)'

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    teamId: row.team_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    color: isColorKey(row.color) ? row.color : 'indigo',
    icon: row.icon,
    status: row.status,
    visibility: row.visibility,
    leadId: row.lead_id,
    startDate: row.start_date,
    targetDate: row.target_date,
    createdBy: row.created_by,
    createdAt: row.created_at,
    memberIds: (row.project_members ?? []).map((member) => member.user_id),
  }
}

/** Projects of one workspace that the user can see (RLS applies visibility rules). */
export function useProjects(workspaceId: string | undefined) {
  return useQuery({
    queryKey: keys.projects(workspaceId ?? 'none'),
    enabled: Boolean(workspaceId),
    queryFn: async () =>
      must(
        await supabase()
          .from('projects')
          .select(PROJECT_SELECT)
          .eq('workspace_id', workspaceId!)
          .order('name')
          .returns<ProjectRow[]>(),
      ).map(toProject),
  })
}

export type ProjectInput = {
  name: string
  description?: string | null
  color: ColorKey
  icon?: string | null
  status?: ProjectStatus
  visibility?: ProjectVisibility
  teamId?: string | null
  leadId?: string | null
  startDate?: string | null
  targetDate?: string | null
  memberIds?: string[]
}

export function useSaveProject(workspaceId: string) {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: ProjectInput & { id?: string }) => {
      const db = supabase()
      const row: Record<string, unknown> = {
        name: input.name.trim(),
        description: input.description?.trim() || null,
        color: input.color,
        icon: input.icon ?? null,
        status: input.status ?? 'active',
        visibility: input.visibility ?? 'workspace',
        team_id: input.teamId ?? null,
        lead_id: input.leadId ?? null,
        start_date: input.startDate || null,
        target_date: input.targetDate || null,
      }
      let projectId = id
      if (id) {
        must(await db.from('projects').update(row).eq('id', id))
      } else {
        // Unique slug within the workspace: "website", "website-2", …
        const base = slugify(input.name)
        const taken = new Set(
          must(await db.from('projects').select('slug').eq('workspace_id', workspaceId).like('slug', `${base}%`)).map((p) => p.slug as string),
        )
        let slug = base
        for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
        projectId = must(
          await db
            .from('projects')
            .insert({ ...row, workspace_id: workspaceId, slug, created_by: user.id })
            .select('id')
            .single(),
        ).id as string
      }
      if (input.memberIds && projectId) {
        const current = must(await db.from('project_members').select('user_id').eq('project_id', projectId)).map((r) => r.user_id as string)
        const add = input.memberIds.filter((member) => !current.includes(member))
        const remove = current.filter((member) => !input.memberIds!.includes(member))
        if (add.length) must(await db.from('project_members').insert(add.map((user_id) => ({ project_id: projectId, user_id }))))
        if (remove.length) must(await db.from('project_members').delete().eq('project_id', projectId).in('user_id', remove))
      }
      return projectId!
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.projects(workspaceId) }),
  })
}

export function useDeleteProject(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (projectId: string) => must(await supabase().from('projects').delete().eq('id', projectId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.projects(workspaceId) })
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
