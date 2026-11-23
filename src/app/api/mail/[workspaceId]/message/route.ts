import type { NextRequest } from 'next/server'
import { mailErrorMessage, markMailRead, readMail } from '@/server/mail'
import { markReadBody, messageQuery } from '@/server/mail/schemas'
import { allow, tooMany } from '@/server/rate-limit'
import { crossSite, privateJson } from '@/server/request-guards'
import { jsonBody } from '@/server/vault'
import { workspaceAccess } from '@/server/workspace-access'

/**
 * GET /api/mail/[workspaceId]/message?folder=inbox|sent&id=…[&peek=1] → one message with its
 * body. `peek=1` leaves it unread (prefetching); opening marks it read with POST. The HTML is
 * the sender's, unsanitized: the client renders it only in a sandboxed frame.
 */
export async function GET(request: NextRequest, context: RouteContext<'/api/mail/[workspaceId]/message'>) {
  const gate = await workspaceAccess((await context.params).workspaceId)
  if ('error' in gate) return gate.error
  const { userId, workspace } = gate.access
  if (!(await allow(`mail-read:${userId}`, 240, 60))) return tooMany()

  const parsed = messageQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return privateJson({ error: 'Invalid message.' }, { status: 400 })
  const { folder, id, peek } = parsed.data
  try {
    const message = await readMail(userId, workspace.id, folder, id, peek !== '1')
    if (!message) return privateJson({ error: 'Message not found.' }, { status: 404 })
    return privateJson(message)
  } catch (error) {
    return privateJson({ error: mailErrorMessage(error, 'read') }, { status: 502 })
  }
}

/** POST /api/mail/[workspaceId]/message { folder, id } → marks that message read. */
export async function POST(request: NextRequest, context: RouteContext<'/api/mail/[workspaceId]/message'>) {
  const refused = crossSite(request)
  if (refused) return refused
  const gate = await workspaceAccess((await context.params).workspaceId)
  if ('error' in gate) return gate.error
  const { userId, workspace } = gate.access
  if (!(await allow(`mail-read:${userId}`, 240, 60))) return tooMany()

  const parsed = markReadBody.safeParse(await jsonBody(request))
  if (!parsed.success) return privateJson({ error: 'Invalid message.' }, { status: 400 })
  try {
    await markMailRead(userId, workspace.id, parsed.data.folder, parsed.data.id)
    return privateJson({ ok: true })
  } catch (error) {
    return privateJson({ error: mailErrorMessage(error, 'mark read') }, { status: 502 })
  }
}
