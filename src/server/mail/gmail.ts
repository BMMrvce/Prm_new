import 'server-only'
import { simpleParser } from 'mailparser'
import type { MailContact, MailFolder, MailMessage, MailQuery, MailSummary } from '@/lib/mail/types'
import { MAIL_PAGE_SIZE } from '@/lib/mail/types'
import { ReconnectRequired } from '../connections'
import { googleFetch } from '../google'
import { composeRaw, pickAttachment, toMailMessage, type AttachmentFile, type OutgoingMail } from './attachments'

/** Gmail mailboxes via the Gmail API, signed in with the shared Google OAuth client. */
const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

type GmailHeader = { name: string; value: string }
type GmailMessage = { id: string; labelIds?: string[]; internalDate?: string; sizeEstimate?: number; payload?: { headers?: GmailHeader[] }; raw?: string }

/** Messages larger than this are not downloaded for reading (attachments still work by id). */
const MAX_RAW_BYTES = 30 * 1024 * 1024

async function gmail<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await googleFetch(`${API}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
  })
  if (response.status === 401) throw new ReconnectRequired()
  const data = (await response.json().catch(() => null)) as (T & { error?: { status?: string } }) | null
  if (!response.ok || !data) {
    console.error('[gmail] request failed', response.status, data?.error?.status)
    throw new Error('Gmail request failed.')
  }
  return data
}

/** The address of the Gmail account a fresh token belongs to. */
export async function gmailAddress(token: string) {
  const profile = await gmail<{ emailAddress?: string }>(token, 'profile')
  return profile.emailAddress || 'Gmail account'
}

/** `"Ada Lovelace" <ada@example.com>` → name and address. */
function parseAddress(value: string) {
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  return match ? { name: match[1].trim(), address: match[2].trim() } : { name: '', address: value.trim() }
}

function toSummary(message: GmailMessage): MailSummary {
  const header = (name: string) => message.payload?.headers?.find((item) => item.name.toLowerCase() === name)?.value ?? ''
  const sender = parseAddress(header('from'))
  return {
    id: message.id,
    subject: header('subject') || '(no subject)',
    from: sender.name || sender.address || 'Unknown sender',
    fromAddress: sender.address,
    to: header('to')
      .split(',')
      .map((item) => {
        const address = parseAddress(item)
        return address.name || address.address
      })
      .filter(Boolean)
      .join(', '),
    date: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : '',
    unread: Boolean(message.labelIds?.includes('UNREAD')),
  }
}

/** Gmail search text: the words plus exact time bounds (`after:`/`before:` take epoch seconds). */
function gmailQuery({ search, after, before }: MailQuery) {
  const epoch = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)
  return [search?.trim(), after ? `after:${epoch(after)}` : '', before ? `before:${epoch(before)}` : ''].filter(Boolean).join(' ')
}

const encodeId = (id: string) => encodeURIComponent(id)

export async function listGmail(token: string, folder: MailFolder, query: MailQuery) {
  const params = new URLSearchParams({
    labelIds: folder === 'inbox' ? 'INBOX' : 'SENT',
    fields: 'messages/id,nextPageToken',
    maxResults: String(query.limit ?? MAIL_PAGE_SIZE),
  })
  const q = gmailQuery(query)
  if (q) params.set('q', q)
  if (query.cursor) params.set('pageToken', query.cursor)
  const list = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(token, `messages?${params}`)
  // Only the headers the list shows, to keep these parallel requests small.
  const headers = ['From', 'To', 'Subject'].map((name) => `metadataHeaders=${name}`).join('&')
  const messages = await Promise.all(
    (list.messages ?? []).map((item) => gmail<GmailMessage>(token, `messages/${encodeId(item.id)}?format=metadata&${headers}&fields=id,labelIds,internalDate,payload/headers`)),
  )
  return { messages: messages.map(toSummary).sort((a, b) => b.date.localeCompare(a.date)), nextCursor: list.nextPageToken ?? null }
}

export async function markReadGmail(token: string, id: string) {
  await gmail(token, `messages/${encodeId(id)}/modify`, { method: 'POST', body: JSON.stringify({ removeLabelIds: ['UNREAD'] }) })
}

async function rawMessage(token: string, id: string) {
  const meta = await gmail<GmailMessage>(token, `messages/${encodeId(id)}?format=minimal&fields=id,sizeEstimate,labelIds,internalDate`)
  if ((meta.sizeEstimate ?? 0) > MAX_RAW_BYTES) throw new Error('Message too large.')
  const message = await gmail<GmailMessage>(token, `messages/${encodeId(id)}?format=raw`)
  return message.raw ? { meta, source: Buffer.from(message.raw, 'base64url') } : null
}

export async function readGmail(token: string, id: string, markRead: boolean): Promise<MailMessage | null> {
  const found = await rawMessage(token, id)
  if (!found) return null
  if (markRead && found.meta.labelIds?.includes('UNREAD')) await markReadGmail(token, id).catch(() => undefined)
  const parsed = await simpleParser(found.source)
  return toMailMessage(parsed, { id: found.meta.id, date: new Date(Number(found.meta.internalDate ?? 0)).toISOString() })
}

export async function attachmentGmail(token: string, id: string, attachmentId: string): Promise<AttachmentFile | null> {
  const found = await rawMessage(token, id)
  return found ? pickAttachment(await simpleParser(found.source), attachmentId) : null
}

export async function sendGmail(token: string, mail: OutgoingMail) {
  const raw = await composeRaw(mail)
  // The upload endpoint takes the raw message; Gmail files it in Sent itself.
  const response = await googleFetch('https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'message/rfc822' },
    body: new Uint8Array(raw),
  })
  if (response.status === 401) throw new ReconnectRequired()
  if (!response.ok) {
    console.error('[gmail] send failed', response.status)
    throw new Error('Gmail send failed.')
  }
}

/** Senders and recipients of the latest messages in Inbox and Sent. */
export async function contactsGmail(token: string, perFolder = 50): Promise<MailContact[]> {
  const headers = ['From', 'To', 'Cc'].map((name) => `metadataHeaders=${name}`).join('&')
  const lists = await Promise.all(
    ['INBOX', 'SENT'].map((label) => gmail<{ messages?: { id: string }[] }>(token, `messages?labelIds=${label}&maxResults=${perFolder}&fields=messages/id`)),
  )
  const messages = await Promise.all(
    lists.flatMap((list) => list.messages ?? []).map((item) => gmail<GmailMessage>(token, `messages/${encodeId(item.id)}?format=metadata&${headers}&fields=payload/headers`)),
  )
  return messages.flatMap((message) =>
    (message.payload?.headers ?? [])
      .flatMap((header) => header.value.split(','))
      .map(parseAddress)
      .filter((person) => person.address.includes('@')),
  )
}
