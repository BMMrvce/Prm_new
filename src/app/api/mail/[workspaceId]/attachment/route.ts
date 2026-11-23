import type { NextRequest } from 'next/server'
import { mailAttachment, mailErrorMessage } from '@/server/mail'
import { attachmentQuery } from '@/server/mail/schemas'
import { allow, tooMany } from '@/server/rate-limit'
import { privateJson } from '@/server/request-guards'
import { workspaceAccess } from '@/server/workspace-access'

/** Chunks large files so the response streams instead of going out in one piece. */
const CHUNK = 256 * 1024

/** RFC 6266 filename: an ASCII fallback plus the UTF-8 original. */
function disposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\;]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

/**
 * GET /api/mail/[workspaceId]/attachment?folder=inbox|sent&id=<message>&att=<index> → the file.
 * Always a download as opaque bytes under a sandbox CSP, never rendered on this origin, so
 * an HTML or SVG attachment cannot run as the app.
 */
export async function GET(request: NextRequest, context: RouteContext<'/api/mail/[workspaceId]/attachment'>) {
  const gate = await workspaceAccess((await context.params).workspaceId)
  if ('error' in gate) return gate.error
  const { userId, workspace } = gate.access
  if (!(await allow(`mail-read:${userId}`, 240, 60))) return tooMany()

  const parsed = attachmentQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return privateJson({ error: 'Invalid attachment.' }, { status: 400 })
  const { folder, id, att } = parsed.data
  try {
    const file = await mailAttachment(userId, workspace.id, folder, id, att)
    if (!file) return privateJson({ error: 'Attachment not found.' }, { status: 404 })
    const bytes = file.content
    let offset = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) return controller.close()
        controller.enqueue(new Uint8Array(bytes.subarray(offset, offset + CHUNK)))
        offset += CHUNK
      },
    })
    return new Response(body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(bytes.length),
        'Content-Disposition': disposition(file.filename),
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "sandbox; default-src 'none'",
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    return privateJson({ error: mailErrorMessage(error, 'attachment') }, { status: 502 })
  }
}
