import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { currentSession } from '@/lib/supabase/user'
import type { Role } from '@/core/types'
import { sessionUnlocked } from './vault'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)

export type WorkspaceAccess = {
  userId: string
  email: string
  sessionId: string
  workspace: { id: string; slug: string; name: string; protected: boolean; role: Role }
}

/**
 * The gate every workspace-scoped server route passes first: a verified session, then the
 * user's membership read with their own RLS-bound client (so the database decides), then,
 * for a protected workspace, an unlocked vault on this browser session. Unknown and
 * not-a-member both answer 404 so workspace ids cannot be probed.
 */
export async function workspaceAccess(workspaceId: string): Promise<{ access: WorkspaceAccess } | { error: Response }> {
  if (!isUuid(workspaceId)) return { error: Response.json({ error: 'Not found' }, { status: 404 }) }
  const session = await currentSession()
  if (!session) return { error: Response.json({ error: 'Sign in required' }, { status: 401 }) }
  const { user, sessionId } = session

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role, workspaces!inner(id, slug, name, protected)')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle<{ role: Role; workspaces: { id: string; slug: string; name: string; protected: boolean } }>()
  if (error) {
    console.error('[workspace-access]', error.message)
    return { error: Response.json({ error: 'Something went wrong. Try again.' }, { status: 500 }) }
  }
  if (!data?.workspaces) return { error: Response.json({ error: 'Not found' }, { status: 404 }) }

  if (data.workspaces.protected && !(await sessionUnlocked(user.id, sessionId))) {
    return { error: Response.json({ error: 'Unlock this workspace first.', locked: true }, { status: 423 }) }
  }
  return {
    access: {
      userId: user.id,
      email: user.email ?? '',
      sessionId,
      workspace: { ...data.workspaces, role: data.role },
    },
  }
}
