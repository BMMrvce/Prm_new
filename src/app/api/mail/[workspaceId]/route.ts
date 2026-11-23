import type { NextRequest } from 'next/server'
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from '@/lib/mail/types'
import type { AttachmentFile } from '@/server/mail/attachments'
import { listMail, mailErrorMessage, sendMail } from '@/server/mail'
import { firstIssue, listQuery, sendFields, stripControl } from '@/server/mail/schemas'
import { allow, tooMany } from '@/server/rate-limit'
import { crossSite, privateJson } from '@/server/request-guards'
import { workspaceAccess } from '@/server/workspace-access'

/** Whole request: attachments plus the text and HTML parts and multipart overhead. */
const MAX_REQUEST_BYTES = MAX_ATTACHMENT_BYTES + 1_500_000

/**
 * GET /api/mail/[workspaceId]?folder=inbox|sent&search=…&after=…&before=…&cursor=…&limit=…
 * → one page of your own mailbox for that workspace, with `nextCursor` for the next page.
 */
export async function GET(request: NextRequest, context: RouteContext<'/api/mail/[workspaceId]'>) {
  const gate = await workspaceAccess((await context.params).workspaceId)
  if ('error' in gate) return gate.error
  const { userId, workspace } = gate.access
  if (!(await allow(`mail-read:${userId}`, 240, 60))) return tooMany()

  const parsed = listQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return privateJson({ error: 'Invalid filters.' }, { status: 400 })
  const { folder, ...query } = parsed.data
  try {
    return privateJson(await listMail(userId, workspace.id, folder, query))
  } catch (error) {
    return privateJson({ error: mailErrorMessage(error, 'list') }, { status: 502 })
  }
}

const safeFilename = (name: string) =>
  stripControl(name)
    .replace(/[/\\]/g, '_')
    .trim()
    .slice(0, 200) || 'attachment'

const safeType = (type: string) => (/^[\w.+-]{1,60}\/[\w.+-]{1,80}$/.test(type) ? type : 'application/octet-stream')

/**
 * POST /api/mail/[workspaceId] (multipart: to, cc?, subject, body, html?, attachments*)
 * → sends from your mailbox for that workspace. Limits: 50 recipients, 10 files, 4 MB.
 */
export async function POST(request: NextRequest, context: RouteContext<'/api/mail/[workspaceId]'>) {
  const refused = crossSite(request)
  if (refused) return refused
  const gate = await workspaceAccess((await context.params).workspaceId)
  if ('error' in gate) return gate.error
  const { userId, workspace } = gate.access
  if (!(await allow(`mail-send:${userId}`, 20, 10 * 60)) || !(await allow(`mail-send-day:${userId}`, 300, 24 * 60 * 60))) {
    return tooMany(10 * 60)
  }

  const length = Number(request.headers.get('content-length'))
  if (!length || length > MAX_REQUEST_BYTES) return privateJson({ error: 'The message is too large. Attachments can total up to 4 MB.' }, { status: 413 })
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) return privateJson({ error: 'Invalid request.' }, { status: 415 })

  const form = await request.formData().catch(() => null)
  if (!form) return privateJson({ error: 'Invalid request.' }, { status: 400 })
  const text = (name: string) => {
    const value = form.get(name)
    return typeof value === 'string' ? value : undefined
  }
  const fields = sendFields.safeParse({ to: text('to') ?? '', cc: text('cc') || undefined, subject: text('subject'), body: text('body'), html: text('html') || undefined })
  if (!fields.success) return privateJson({ error: firstIssue(fields.error, 'Check the recipients and try again.') }, { status: 400 })

  const files = form.getAll('attachments').filter((item): item is File => item instanceof File)
  if (files.length > MAX_ATTACHMENTS) return privateJson({ error: `Attach at most ${MAX_ATTACHMENTS} files.` }, { status: 400 })
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_ATTACHMENT_BYTES) {
    return privateJson({ error: 'Attachments can total up to 4 MB.' }, { status: 413 })
  }
  const attachments: AttachmentFile[] = await Promise.all(
    files.map(async (file) => ({ filename: safeFilename(file.name), contentType: safeType(file.type), content: Buffer.from(await file.arrayBuffer()) })),
  )

  const { to, cc, subject, body, html } = fields.data
  if (!body.trim() && !subject && !attachments.length) return privateJson({ error: 'Write a message or add a subject first.' }, { status: 400 })
  try {
    await sendMail(userId, workspace.id, { to, cc, subject, text: body, html, attachments })
    return privateJson({ ok: true, recipients: to.length + cc.length })
  } catch (error) {
    return privateJson({ error: mailErrorMessage(error, 'send') }, { status: 502 })
  }
}
