'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContext, use } from 'react'
import { must, supabase } from '@/lib/supabase/client'
import { isColorKey } from './colors'
import { keys } from './query'
import { useUser } from './session'
import type { Invitation, Member, Role, Team, Workspace, WorkspaceModule } from './types'

type WorkspaceRow = {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string
  color: string
  template: string
  task_prefix: string
  settings: Workspace['settings'] | null
  protected: boolean
  archived_at: string | null
  created_at: string
  workspace_members: { role: Role }[]
  workspace_modules: { module_id: string; enabled: boolean; position: number; config: Record<string, unknown> }[]
  user_workspace_prefs: { pinned: boolean; position: number; hidden_modules: string[]; last_opened_at: string | null }[]
}

const WORKSPACE_SELECT =
  'id, name, slug, description, icon, color, template, task_prefix, settings, protected, archived_at, created_at, workspace_members(role), workspace_modules(module_id, enabled, position, config), user_workspace_prefs(pinned, position, hidden_modules, last_opened_at)'

function toWorkspace(row: WorkspaceRow): Workspace {
  const prefs = row.user_workspace_prefs[0]
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    color: isColorKey(row.color) ? row.color : 'indigo',
    template: row.template,
    taskPrefix: row.task_prefix,
    settings: row.settings ?? {},
    protected: row.protected,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    role: row.workspace_members[0]?.role ?? 'guest',
    modules: row.workspace_modules.map(
      (module): WorkspaceModule => ({
        moduleId: module.module_id,
        enabled: module.enabled,
        position: module.position,
        config: module.config ?? {},
      }),
    ),
    prefs: {
      pinned: prefs?.pinned ?? false,
      position: prefs?.position ?? 0,
      hiddenModules: prefs?.hidden_modules ?? [],
      lastOpenedAt: prefs?.last_opened_at ?? null,
    },
  }
}

/** Every workspace the user belongs to, pinned first, then in their chosen order. */
export function useWorkspaces() {
  const user = useUser()
  return useQuery({
    queryKey: keys.workspaces,
    queryFn: async () => {
      const rows = must(
        await supabase()
          .from('workspaces')
          .select(WORKSPACE_SELECT)
          .eq('workspace_members.user_id', user.id)
          .eq('user_workspace_prefs.user_id', user.id)
          .order('name')
          .returns<WorkspaceRow[]>(),
      )
      return rows
        .map(toWorkspace)
        .sort((a, b) => Number(b.prefs.pinned) - Number(a.prefs.pinned) || a.prefs.position - b.prefs.position || a.name.localeCompare(b.name))
    },
  })
}

// ── The workspace in the URL, provided by /w/[workspace]/layout ─────────────────────

export const CurrentWorkspaceContext = createContext<Workspace | null>(null)

export function useCurrentWorkspace() {
  const workspace = use(CurrentWorkspaceContext)
  if (!workspace) throw new Error('useCurrentWorkspace() must be used inside a workspace page')
  return workspace
}

/** The current workspace when inside one, or null on cross-workspace pages. */
export function useMaybeWorkspace() {
  return use(CurrentWorkspaceContext)
}

export const canAdmin = (workspace: Pick<Workspace, 'role'>) => workspace.role === 'owner' || workspace.role === 'admin'
export const canWrite = (workspace: Pick<Workspace, 'role' | 'archivedAt'>) => workspace.role !== 'guest' && !workspace.archivedAt

// ── Mutations ───────────────────────────────────────────────────────────────────────

export type NewWorkspace = {
  name: string
  modules: string[]
  template: string
  icon: string
  color: string
  prefix?: string
  description?: string
  moduleConfig?: Record<string, Record<string, unknown>>
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewWorkspace) => {
      const row = must(
        await supabase()
          .rpc('create_workspace', {
            workspace_name: input.name,
            modules: input.modules,
            template: input.template,
            icon: input.icon,
            color: input.color,
            prefix: input.prefix ?? null,
            description: input.description ?? null,
            module_config: input.moduleConfig ?? {},
          })
          .single<{ id: string; slug: string }>(),
      )
      return row
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.workspaces }),
  })
}

export type WorkspaceChanges = Partial<Pick<Workspace, 'name' | 'description' | 'icon' | 'color' | 'taskPrefix' | 'settings'>> & {
  archived?: boolean
}

export function useUpdateWorkspace(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (changes: WorkspaceChanges) => {
      const row: Record<string, unknown> = {}
      if (changes.name !== undefined) row.name = changes.name.trim()
      if (changes.description !== undefined) row.description = changes.description?.trim() || null
      if (changes.icon !== undefined) row.icon = changes.icon
      if (changes.color !== undefined) row.color = changes.color
      if (changes.taskPrefix !== undefined) row.task_prefix = changes.taskPrefix.toUpperCase()
      if (changes.settings !== undefined) row.settings = changes.settings
      if (changes.archived !== undefined) row.archived_at = changes.archived ? new Date().toISOString() : null
      must(await supabase().from('workspaces').update(row).eq('id', workspaceId))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.workspaces }),
  })
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (workspaceId: string) => must(await supabase().from('workspaces').delete().eq('id', workspaceId)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.workspaces }),
  })
}

export function useLeaveWorkspace() {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (workspaceId: string) =>
      must(await supabase().from('workspace_members').delete().eq('workspace_id', workspaceId).eq('user_id', user.id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.workspaces }),
  })
}

/** Saves the full module list (enabled flags, order, options) in one upsert. */
export function useSaveModules(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (modules: WorkspaceModule[]) =>
      must(
        await supabase()
          .from('workspace_modules')
          .upsert(
            modules.map((module, index) => ({
              workspace_id: workspaceId,
              module_id: module.moduleId,
              enabled: module.enabled,
              position: index + 1,
              config: module.config,
            })),
          ),
      ),
    onMutate: async (modules) => {
      await queryClient.cancelQueries({ queryKey: keys.workspaces })
      const previous = queryClient.getQueryData<Workspace[]>(keys.workspaces)
      queryClient.setQueryData<Workspace[]>(keys.workspaces, (list) =>
        list?.map((ws) => (ws.id === workspaceId ? { ...ws, modules: modules.map((m, i) => ({ ...m, position: i + 1 })) } : ws)),
      )
      return { previous }
    },
    onError: (_error, _modules, context) => queryClient.setQueryData(keys.workspaces, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.workspaces }),
  })
}

/** Personal per-workspace preferences: pin, order, hidden modules, last opened. */
export function useSavePrefs() {
  const user = useUser()
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: async ({ workspaceId, ...prefs }: { workspaceId: string } & Partial<Workspace['prefs']>) => {
      const row: Record<string, unknown> = { user_id: user.id, workspace_id: workspaceId }
      if (prefs.pinned !== undefined) row.pinned = prefs.pinned
      if (prefs.position !== undefined) row.position = prefs.position
      if (prefs.hiddenModules !== undefined) row.hidden_modules = prefs.hiddenModules
      if (prefs.lastOpenedAt !== undefined) row.last_opened_at = prefs.lastOpenedAt
      must(await supabase().from('user_workspace_prefs').upsert(row))
    },
    onMutate: ({ workspaceId, ...prefs }) => {
      queryClient.setQueryData<Workspace[]>(keys.workspaces, (list) =>
        list?.map((ws) => (ws.id === workspaceId ? { ...ws, prefs: { ...ws.prefs, ...prefs } } : ws)),
      )
    },
  })
}

// ── Members, invitations, teams ─────────────────────────────────────────────────────

export function useMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: keys.people(workspaceId ?? 'none'),
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      const rows = (must(await supabase().rpc('workspace_people', { target_workspace: workspaceId })) as 
          { user_id: string; full_name: string | null; email: string; avatar_url: string | null; role: Role; joined_at: string }[]
        )
      return rows.map(
        (row): Member => ({
          id: row.user_id,
          fullName: row.full_name,
          email: row.email,
          avatarUrl: row.avatar_url,
          role: row.role,
          joinedAt: row.joined_at,
        }),
      )
    },
    staleTime: 5 * 60_000,
  })
}

export function useSetMemberRole(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) =>
      must(await supabase().from('workspace_members').update({ role }).eq('workspace_id', workspaceId).eq('user_id', userId)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.people(workspaceId) }),
  })
}

export function useRemoveMember(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) =>
      must(await supabase().from('workspace_members').delete().eq('workspace_id', workspaceId).eq('user_id', userId)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.people(workspaceId) }),
  })
}

export function useWorkspaceInvitations(workspaceId: string, enabled = true) {
  return useQuery({
    queryKey: keys.wsInvites(workspaceId),
    enabled,
    queryFn: async () =>
      must(
        await supabase()
          .from('workspace_invitations')
          .select('id, workspace_id, email, role, expires_at, accepted_at, created_at')
          .eq('workspace_id', workspaceId)
          .is('accepted_at', null)
          .order('created_at', { ascending: false }),
      ).map(
        (row): Invitation => ({
          id: row.id,
          workspaceId: row.workspace_id,
          email: row.email,
          role: row.role,
          expiresAt: row.expires_at,
          acceptedAt: row.accepted_at,
          createdAt: row.created_at,
        }),
      ),
  })
}

/** Creates (or renews) an invitation and returns the one-time link to share. */
export function useInvite(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: Role }) => {
      const token = must(await supabase().rpc('invite_member', { target_workspace: workspaceId, invitee_email: email, invitee_role: role })) as string
      return `${window.location.origin}/invitations?token=${token}`
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.wsInvites(workspaceId) }),
  })
}

export function useRevokeInvitation(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (invitationId: string) => must(await supabase().from('workspace_invitations').delete().eq('id', invitationId)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.wsInvites(workspaceId) }),
  })
}

export function useMyInvitations() {
  return useQuery({
    queryKey: keys.invitations,
    queryFn: async () =>
      (must(await supabase().rpc('my_invitations')) as 
          { id: string; workspace_id: string; workspace_name: string; role: Role; invited_by_name: string | null; expires_at: string }[]
        ),
  })
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id?: string; token?: string }) =>
      must(await supabase().rpc('accept_invitation', { invitation_id: input.id ?? null, token: input.token ?? null })) as string,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.workspaces })
      queryClient.invalidateQueries({ queryKey: keys.invitations })
    },
  })
}

export function useTeams(workspaceId: string) {
  return useQuery({
    queryKey: keys.teams(workspaceId),
    queryFn: async () =>
      must(
        await supabase()
          .from('teams')
          .select('id, workspace_id, name, description, color, team_members(user_id)')
          .eq('workspace_id', workspaceId)
          .order('name'),
      ).map(
        (row): Team => ({
          id: row.id,
          workspaceId: row.workspace_id,
          name: row.name,
          description: row.description,
          color: isColorKey(row.color) ? row.color : 'teal',
          memberIds: (row.team_members as { user_id: string }[]).map((member) => member.user_id),
        }),
      ),
  })
}

export function useSaveTeam(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (team: { id?: string; name: string; description?: string | null; color: string; memberIds: string[] }) => {
      const db = supabase()
      const saved = must(
        await db
          .from('teams')
          .upsert({ ...(team.id ? { id: team.id } : {}), workspace_id: workspaceId, name: team.name.trim(), description: team.description || null, color: team.color })
          .select('id')
          .single(),
      )
      const current = must(await db.from('team_members').select('user_id').eq('team_id', saved.id)).map((row) => row.user_id as string)
      const toAdd = team.memberIds.filter((id) => !current.includes(id))
      const toRemove = current.filter((id) => !team.memberIds.includes(id))
      if (toAdd.length) must(await db.from('team_members').insert(toAdd.map((user_id) => ({ team_id: saved.id, workspace_id: workspaceId, user_id }))))
      if (toRemove.length) must(await db.from('team_members').delete().eq('team_id', saved.id).in('user_id', toRemove))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.teams(workspaceId) }),
  })
}

export function useDeleteTeam(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (teamId: string) => must(await supabase().from('teams').delete().eq('id', teamId)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.teams(workspaceId) }),
  })
}
