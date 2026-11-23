import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { logSecurityEvent } from '@/server/security-log'
import { jsonBody, requireSession, sessionUnlocked, vaultRecord } from '@/server/vault'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST { kind: 'workspace' | 'note', id, protected } turns protection on or off.
 * Requires a PIN and an unlocked session. Workspaces need an owner or admin; notes their
 * owner. Permission is checked with the user's own (RLS-bound) client before the
 * service-role client flips the flag the browser itself cannot change.
 */
export async function POST(request: Request) {
  const auth = await requireSession()
  if ('error' in auth) return auth.error
  const { user, sessionId } = auth.session

  const body = await jsonBody(request)
  const kind = body?.kind
  const id = String(body?.id ?? '')
  const value = body?.protected === true
  if ((kind !== 'workspace' && kind !== 'note') || !UUID.test(id)) {
    return Response.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const record = await vaultRecord(user.id)
  if (!record?.pin_hash) return Response.json({ error: 'Set a PIN in Account → Security first.' }, { status: 409 })
  if (!(await sessionUnlocked(user.id, sessionId))) return Response.json({ error: 'Unlock first.', locked: true }, { status: 423 })

  const userClient = await createClient()
  const admin = createAdminClient()

  if (kind === 'workspace') {
    const { data: membership } = await userClient
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return Response.json({ error: 'Only owners and admins can change this.' }, { status: 403 })
    }
    const { error } = await admin.from('workspaces').update({ protected: value }).eq('id', id)
    if (error) return Response.json({ error: 'Could not update the workspace.' }, { status: 500 })
  } else {
    const { data: note } = await userClient.from('notes').select('user_id').eq('id', id).maybeSingle()
    if (!note || note.user_id !== user.id) return Response.json({ error: 'Only the note’s owner can change this.' }, { status: 403 })
    if (value) {
      const { count } = await admin.from('note_members').select('note_id', { count: 'exact', head: true }).eq('note_id', id)
      if (count) return Response.json({ error: 'Stop sharing the note before protecting it.' }, { status: 409 })
    }
    const { error } = await admin.from('notes').update({ protected: value }).eq('id', id)
    if (error) return Response.json({ error: 'Could not update the note.' }, { status: 500 })
  }

  await logSecurityEvent(request, user.id, value ? `${kind}.protected` : `${kind}.unprotected`, { id })
  return Response.json({ ok: true })
}
