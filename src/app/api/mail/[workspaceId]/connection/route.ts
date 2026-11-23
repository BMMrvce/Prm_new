import { connectImap, disconnectMail, mailErrorMessage, mailStatus } from '@/server/mail'
import { firstIssue, imapConnectBody } from '@/server/mail/schemas'
import { allow, clientIp, tooMany } from '@/server/rate-limit'
import { crossSite, privateJson } from '@/server/request-guards'
import { logSecurityEvent } from '@/server/security-log'
import { jsonBody } from '@/server/vault'
import { workspaceAccess } from '@/server/workspace-access'

type Context = RouteContext<'/api/mail/[workspaceId]/connection'>

/** GET → your mailbox status for this workspace (never secrets). */
export async function GET(_request: Request, context: Context) {
  const gate = await workspaceAccess((await context.params).workspaceId)
  if ('error' in gate) return gate.error
  try {
    return privateJson({ status: await mailStatus(gate.access.userId, gate.access.workspace.id) })
  } catch (error) {
    return privateJson({ error: mailErrorMessage(error, 'status') }, { status: 502 })
  }
}

/**
 * POST { preset, email, username?, password, imapHost?, imapPort?, smtpHost?, smtpPort? } →
 * signs in to check the details (hosts pass the SSRF guard first), then saves them sealed.
 * Gmail connects through /api/oauth/google/connect instead.
 */
export async function POST(request: Request, context: Context) {
  const refused = crossSite(request)
  if (refused) return refused
  const gate = await workspaceAccess((await context.params).workspaceId)
  if ('error' in gate) return gate.error
  const { userId, workspace } = gate.access
  if (!(await allow(`mail-connect:${userId}`, 10, 15 * 60)) || !(await allow(`mail-connect-ip:${clientIp(request)}`, 30, 15 * 60))) {
    return tooMany(15 * 60)
  }
  const parsed = imapConnectBody.safeParse(await jsonBody(request))
  if (!parsed.success) return privateJson({ error: firstIssue(parsed.error, 'Enter the mailbox address, password and servers.') }, { status: 400 })
  try {
    await connectImap(userId, workspace.id, parsed.data)
  } catch (error) {
    await logSecurityEvent(request, userId, 'mail.connect_failed', { workspace: workspace.id })
    return privateJson({ error: mailErrorMessage(error, 'connect') }, { status: 400 })
  }
  await logSecurityEvent(request, userId, 'mail.connected', { workspace: workspace.id, provider: 'imap' })
  return privateJson({ status: await mailStatus(userId, workspace.id) })
}

/** DELETE → forgets your mailbox for this workspace. */
export async function DELETE(request: Request, context: Context) {
  const refused = crossSite(request)
  if (refused) return refused
  const gate = await workspaceAccess((await context.params).workspaceId)
  if ('error' in gate) return gate.error
  const { userId, workspace } = gate.access
  try {
    await disconnectMail(userId, workspace.id)
  } catch (error) {
    return privateJson({ error: mailErrorMessage(error, 'disconnect') }, { status: 500 })
  }
  await logSecurityEvent(request, userId, 'mail.disconnected', { workspace: workspace.id })
  return privateJson({ ok: true })
}
