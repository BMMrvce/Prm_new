'use client'

import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import { isColorKey } from '@/core/colors'
import { keys } from '@/core/query'
import type { Member, Workspace } from '@/core/types'
import { useWorkspaces } from '@/core/workspaces'
import { must, supabase } from '@/lib/supabase/client'
import { PROJECT_SELECT, toProject, type Project } from '@/modules/projects/queries'
import type { Label } from './queries'
import { useStatusesFor } from './task-bits'

/**
 * Lookups task views need, for one workspace or for every workspace ('all'): statuses,
 * members, labels, projects and the workspaces themselves. Each list is cached per
 * workspace, so switching views reuses what is already loaded.
 */
export function useTaskContext(scope: string | 'all') {
  const { data: workspaces = [] } = useWorkspaces()
  const statuses = useStatusesFor(scope)
  const ids = useMemo(
    () => (scope === 'all' ? workspaces.filter((ws) => !ws.archivedAt).map((ws) => ws.id) : [scope]),
    [scope, workspaces],
  )

  const people = useQueries({
    queries: ids.map((id) => ({
      queryKey: keys.people(id),
      staleTime: 5 * 60_000,
      queryFn: async () =>
        (must(await supabase().rpc('workspace_people', { target_workspace: id })) as 
            { user_id: string; full_name: string | null; email: string; avatar_url: string | null; role: Member['role']; joined_at: string }[]
          ).map((row): Member => ({ id: row.user_id, fullName: row.full_name, email: row.email, avatarUrl: row.avatar_url, role: row.role, joinedAt: row.joined_at })),
    })),
  })

  const labels = useQueries({
    queries: ids.map((id) => ({
      queryKey: keys.labels(id),
      staleTime: 5 * 60_000,
      queryFn: async () =>
        must(await supabase().from('labels').select('id, workspace_id, name, color').eq('workspace_id', id).order('name')).map(
          (row): Label => ({ id: row.id, workspaceId: row.workspace_id, name: row.name, color: isColorKey(row.color) ? row.color : 'slate' }),
        ),
    })),
  })

  const projects = useQueries({
    queries: ids.map((id) => ({
      queryKey: keys.projects(id),
      queryFn: async () => must(await supabase().from('projects').select(PROJECT_SELECT).eq('workspace_id', id).order('name')).map((row) => toProject(row as never)),
    })),
  })

  const peopleData = people.map((query) => query.data)
  const labelData = labels.map((query) => query.data)
  const projectData = projects.map((query) => query.data)
  // Stable change markers (the arrays above are new on every render).
  const version = [people, labels, projects].map((group) => group.map((query) => query.dataUpdatedAt).join(',')).join('|')

  return useMemo(() => {
    const membersByWorkspace = new Map<string, Member[]>()
    const peopleById = new Map<string, Member>()
    ids.forEach((id, index) => {
      const list = peopleData[index] ?? []
      membersByWorkspace.set(id, list)
      list.forEach((member) => peopleById.set(member.id, member))
    })
    const labelsById = new Map<string, Label>()
    labelData.forEach((list) => list?.forEach((label) => labelsById.set(label.id, label)))
    const projectsById = new Map<string, Project>()
    projectData.forEach((list) => list?.forEach((project) => projectsById.set(project.id, project)))
    const workspacesById = new Map<string, Workspace>(workspaces.map((ws) => [ws.id, ws]))
    return {
      statuses,
      membersByWorkspace,
      people: peopleById,
      labels: labelsById,
      labelsFor: (workspaceId: string) => [...labelsById.values()].filter((label) => label.workspaceId === workspaceId),
      projects: projectsById,
      workspaces: workspacesById,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, statuses, workspaces, version])
}

export type TaskContext = ReturnType<typeof useTaskContext>
