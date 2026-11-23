import 'server-only'
import { z } from 'zod'
import { MAX_RECIPIENTS, MAX_SUBJECT } from '@/lib/mail/types'
import { CUSTOM_PRESET, mailPreset } from '@/lib/mail/presets'

/** Input validation shared by the /api/mail/[workspaceId] route handlers. */

/** Replaces ASCII control characters with spaces. */
export const stripControl = (value: string) => [...value].map((char) => (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char)).join('')

export const folderSchema = z.enum(['inbox', 'sent']).catch('inbox')

/** Gmail ids are hex, IMAP ids are UIDs: both fit this. */
export const messageId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
export const attachmentId = z.string().regex(/^\d{1,4}$/)

const isoInstant = z
  .string()
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)))
  .optional()

/** Strips control characters (IMAP and Gmail search take plain words). */
const searchText = z
  .string()
  .max(200)
  .transform((value) => stripControl(value).trim())
  .optional()

export const listQuery = z.object({
  folder: folderSchema,
  search: searchText,
  after: isoInstant,
  before: isoInstant,
  cursor: z.string().max(200).regex(/^[A-Za-z0-9_-]*$/).optional(),
  limit: z.coerce.number().int().min(5).max(50).optional(),
})

export const messageQuery = z.object({ folder: folderSchema, id: messageId, peek: z.enum(['0', '1']).optional() })
export const attachmentQuery = z.object({ folder: folderSchema, id: messageId, att: attachmentId })
export const markReadBody = z.object({ folder: folderSchema, id: messageId })

const address = z.email().max(254)

/** "a@x.com, b@y.com" → validated, de-duplicated addresses. */
export const addressList = z
  .string()
  .max(MAX_RECIPIENTS * 260)
  .transform((value) => [...new Set(value.split(/[,;]/).map((item) => item.trim()).filter(Boolean))])
  .pipe(z.array(address).max(MAX_RECIPIENTS))

export const sendFields = z
  .object({
    to: addressList.refine((list) => list.length > 0, 'Add at least one recipient.'),
    cc: addressList.optional().default([]),
    // Header injection is impossible through the composer, but line breaks never belong here.
    subject: z
      .string()
      .max(MAX_SUBJECT)
      .transform((value) => value.replace(/[\r\n]+/g, ' ').trim())
      .default(''),
    body: z.string().max(200_000).default(''),
    html: z.string().max(500_000).optional(),
  })
  .refine((value) => value.to.length + value.cc.length <= MAX_RECIPIENTS, `Send to at most ${MAX_RECIPIENTS} people at once.`)

const host = z.string().trim().min(3).max(253)

/** IMAP connect: a preset fills the servers; `custom` takes them from the form. */
export const imapConnectBody = z
  .object({
    preset: z.string().max(40),
    email: address,
    /** Login name when it differs from the address. */
    username: z.string().trim().max(254).optional(),
    password: z.string().min(1).max(512),
    imapHost: host.optional(),
    imapPort: z.coerce.number().int().optional(),
    smtpHost: host.optional(),
    smtpPort: z.coerce.number().int().optional(),
  })
  .transform((value, context) => {
    const preset = mailPreset(value.preset)
    if (!preset && value.preset !== CUSTOM_PRESET) {
      context.addIssue({ code: 'custom', message: 'Choose a mail provider.' })
      return z.NEVER
    }
    const servers = preset
      ? { imapHost: preset.imap.host, imapPort: preset.imap.port, smtpHost: preset.smtp.host, smtpPort: preset.smtp.port }
      : { imapHost: value.imapHost ?? '', imapPort: value.imapPort ?? 993, smtpHost: value.smtpHost ?? '', smtpPort: value.smtpPort ?? 465 }
    return {
      preset: preset?.id ?? null,
      address: value.email,
      user: value.username || value.email,
      pass: value.password,
      savesSent: preset?.savesSent ?? false,
      ...servers,
    }
  })

/** First issue as a sentence for the client. */
export function firstIssue(error: z.ZodError, fallback = 'Check the form and try again.') {
  const issue = error.issues[0]
  return issue && issue.code === 'custom' ? issue.message : fallback
}
