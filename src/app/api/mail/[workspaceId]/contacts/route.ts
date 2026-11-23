import { listContacts, mailErrorMessage } from '@/server/mail'
import { allow, tooMany } from '@/server/rate-limit'
import { privateJson } from '@/server/request-guards'
import { workspaceAccess } from '@/server/workspace-access'

/** GET /api/mail/[workspaceId]/contacts → people from your recent mail, for recipient suggestions. */
export async function GET(_request: Request, context: RouteContext<'/api/mail/[workspaceId]/contacts'>) {
  const gate = await workspaceAccess((await context.params).workspaceId)
  if ('error' in gate) return gate.error
  const { userId, workspace } = gate.access
  if (!(await allow(`mail-contacts:${userId}`, 30, 10 * 60))) return tooMany(10 * 60)
  try {
    return privateJson({ contacts: await listContacts(userId, workspace.id) })
  } catch (error) {
    return privateJson({ contacts: [], error: mailErrorMessage(error, 'contacts') }, { status: 502 })
  }
}
