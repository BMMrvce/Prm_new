import 'server-only'
import type { AddressObject, ParsedMail } from 'mailparser'
import MailComposer from 'nodemailer/lib/mail-composer'
import type { MailAttachmentInfo, MailMessage } from '@/lib/mail/types'

/** Images shown inside the body are embedded as data: URIs up to these sizes. */
const MAX_INLINE_IMAGE = 2 * 1024 * 1024
const MAX_INLINE_TOTAL = 6 * 1024 * 1024

export type AttachmentFile = { filename: string; contentType: string; content: Buffer }

export type OutgoingMail = {
  from: string
  to: string[]
  cc: string[]
  subject: string
  text: string
  html?: string
  attachments: AttachmentFile[]
}

const cleanCid = (value?: string) => (value ?? '').replace(/^<|>$/g, '').trim()
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * From a parsed message: the HTML with `cid:` images embedded so they display, and the
 * remaining files as downloadable attachments. Attachment ids are the index in
 * `parsed.attachments`, so the download endpoint can find them again.
 */
function attachmentsOf(parsed: ParsedMail): { html: string | null; attachments: MailAttachmentInfo[] } {
  let html = parsed.html || null
  let embedded = 0
  const shownInline = new Set<number>()
  parsed.attachments.forEach((file, index) => {
    const cid = cleanCid(file.cid || file.contentId)
    if (!html || !cid || !/^image\/(png|jpe?g|gif|webp|bmp)$/i.test(file.contentType)) return
    const reference = new RegExp(`cid:${escapeRegExp(cid)}`, 'gi')
    if (!reference.test(html)) return
    if (file.size > MAX_INLINE_IMAGE || embedded + file.size > MAX_INLINE_TOTAL) return
    embedded += file.size
    html = html.replace(reference, `data:${file.contentType};base64,${file.content.toString('base64')}`)
    shownInline.add(index)
  })
  return {
    html,
    attachments: parsed.attachments
      .map((file, index) => ({ file, index }))
      .filter(({ index }) => !shownInline.has(index))
      .map(({ file, index }) => ({
        id: String(index),
        filename: (file.filename || `attachment-${index + 1}`).slice(0, 200),
        contentType: (file.contentType || 'application/octet-stream').slice(0, 100),
        size: file.size ?? file.content.length,
      })),
  }
}

/** The bytes of attachment `id` (its index) in a parsed message. */
export function pickAttachment(parsed: ParsedMail, id: string): AttachmentFile | null {
  if (!/^\d{1,4}$/.test(id)) return null
  const file = parsed.attachments[Number(id)]
  if (!file) return null
  return { filename: file.filename || `attachment-${Number(id) + 1}`, contentType: file.contentType || 'application/octet-stream', content: file.content }
}

function addresses(value?: AddressObject | AddressObject[]) {
  return (Array.isArray(value) ? value : value ? [value] : []).flatMap((item) => item.value)
}

const names = (value?: AddressObject | AddressObject[]) =>
  addresses(value)
    .map((item) => item.name || item.address || '')
    .filter(Boolean)
    .join(', ')

/** A parsed message as the client sees it (`id` and dates come from the provider). */
export function toMailMessage(parsed: ParsedMail, base: { id: string; date: string }): MailMessage {
  const sender = addresses(parsed.from)[0]
  const { html, attachments } = attachmentsOf(parsed)
  return {
    id: base.id,
    subject: parsed.subject || '(no subject)',
    from: sender?.name || sender?.address || 'Unknown sender',
    fromAddress: sender?.address ?? '',
    to: names(parsed.to),
    cc: names(parsed.cc),
    date: parsed.date ? parsed.date.toISOString() : base.date,
    unread: false,
    html,
    text: parsed.text ?? '',
    attachments,
  }
}

/**
 * Builds the raw RFC 822 message. File and URL access are off, so nothing in the input can
 * make the composer read a server file or fetch a URL; attachments are in-memory only.
 */
export async function composeRaw(mail: OutgoingMail) {
  return new MailComposer({
    from: mail.from,
    to: mail.to,
    cc: mail.cc.length ? mail.cc : undefined,
    subject: mail.subject,
    text: mail.text,
    html: mail.html || undefined,
    attachments: mail.attachments.map(({ filename, contentType, content }) => ({ filename, contentType, content })),
    disableFileAccess: true,
    disableUrlAccess: true,
  })
    .compile()
    .build()
}
