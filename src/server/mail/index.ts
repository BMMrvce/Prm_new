import 'server-only'
import type { MailContact, MailFolder, MailListResponse, MailMessage, MailProvider, MailQuery, MailStatus, MailSummary } from '@/lib/mail/types'
import { mailPreset } from '@/lib/mail/presets'
import { deleteConnection, getConnection, NotConfigured, oauthSession, ReconnectRequired, saveConnection, type Connection, type OAuthSecret, type TokenGrant } from '../connections'
import { googleConfigured, refreshGoogleToken } from '../google'
import type { AttachmentFile, OutgoingMail } from './attachments'
import { attachmentGmail, contactsGmail, gmailAddress, listGmail, markReadGmail, readGmail, sendGmail } from './gmail'
import { MailHostError } from './hosts'
import { attachmentImap, contactsImap, isAuthFailure, isConnectionGone, listImap, markReadImap, readImap, sendImap, verifyImap, type ImapAccount } from './imap'

/**
 * Server-only mail entry point. Each user connects their own mailbox per workspace: Gmail
 * (Google OAuth) or any IMAP/SMTP server. Route handlers call these after workspaceAccess().
 */
type Mailbox = {
  list: (folder: MailFolder, query: MailQuery) => Promise<{ messages: MailSummary[]; nextCursor: string | null }>
  read: (folder: MailFolder, id: string, markRead: boolean) => Promise<MailMessage | null>
  markRead: (folder: MailFolder, id: string) => Promise<void>
  attachment: (folder: MailFolder, id: string, attachmentId: string) => Promise<AttachmentFile | null>
  send: (mail: Omit<OutgoingMail, 'from'>) => Promise<void>
  contacts: () => Promise<MailContact[]>
}

type ImapSecret = { user: string; pass: string }
type ImapSettings = { preset?: string; imapHost: string; imapPort: number; smtpHost: string; smtpPort: number; savesSent?: boolean }

const scope = (workspaceId: string) => ({ workspaceId, kind: 'mail' as const })

const LABELS: Record<MailProvider, string> = { gmail: 'Gmail', imap: 'Mail' }

function label(connection: Pick<Connection<unknown>, 'provider' | 'settings'>) {
  if (connection.provider === 'gmail') return LABELS.gmail
  return mailPreset(connection.settings.preset as string)?.label ?? 'IMAP mail'
}

const disconnected = (note?: string): MailStatus => ({ state: 'disconnected', gmailAvailable: googleConfigured(), note })

async function connection(userId: string, workspaceId: string) {
  const row = await getConnection<OAuthSecret | ImapSecret>(userId, scope(workspaceId))
  return row && (row.provider === 'gmail' || row.provider === 'imap') ? row : null
}

function statusOf(row: NonNullable<Awaited<ReturnType<typeof connection>>>): MailStatus {
  return { state: 'connected', provider: row.provider as MailProvider, label: label(row), account: row.account }
}

export async function mailStatus(userId: string, workspaceId: string): Promise<MailStatus> {
  const row = await connection(userId, workspaceId)
  return row ? statusOf(row) : disconnected()
}

function imapAccount(row: Connection<unknown>): ImapAccount {
  const secret = row.secret as ImapSecret
  const settings = row.settings as Partial<ImapSettings>
  return {
    address: row.account,
    user: secret.user,
    pass: secret.pass,
    imapHost: String(settings.imapHost ?? ''),
    imapPort: Number(settings.imapPort),
    smtpHost: String(settings.smtpHost ?? ''),
    smtpPort: Number(settings.smtpPort),
    savesSent: settings.savesSent === true,
  }
}

async function openMailbox(userId: string, workspaceId: string, known?: Connection<unknown> | null): Promise<Mailbox> {
  const row = known ?? (await connection(userId, workspaceId))
  if (!row) throw new ReconnectRequired()
  if (row.provider === 'imap') {
    const account = imapAccount(row)
    return {
      list: (folder, query) => listImap(account, folder, query),
      read: (folder, id, markRead) => readImap(account, folder, id, markRead),
      markRead: (folder, id) => markReadImap(account, folder, id),
      attachment: (folder, id, attachmentId) => attachmentImap(account, folder, id, attachmentId),
      send: (mail) => sendImap(account, { ...mail, from: account.address }),
      contacts: () => contactsImap(account),
    }
  }
  const { token } = await oauthSession<OAuthSecret>(userId, scope(workspaceId), refreshGoogleToken)
  return {
    list: (folder, query) => listGmail(token, folder, query),
    read: (_folder, id, markRead) => readGmail(token, id, markRead),
    markRead: (_folder, id) => markReadGmail(token, id),
    attachment: (_folder, id, attachmentId) => attachmentGmail(token, id, attachmentId),
    send: (mail) => sendGmail(token, { ...mail, from: row.account }),
    contacts: () => contactsGmail(token),
  }
}

const EXPIRED = 'The mailbox sign-in expired or was revoked. Connect it again in Settings.'

/** One page of a folder, folding provider failures into the response instead of throwing. */
export async function listMail(userId: string, workspaceId: string, folder: MailFolder, query: MailQuery): Promise<MailListResponse> {
  const row = await connection(userId, workspaceId)
  if (!row) return { status: disconnected(), messages: [], nextCursor: null }
  const status = statusOf(row)
  try {
    const page = await (await openMailbox(userId, workspaceId, row)).list(folder, query)
    return { status, messages: page.messages, nextCursor: page.nextCursor }
  } catch (error) {
    if (error instanceof ReconnectRequired) return { status: disconnected(EXPIRED), messages: [], nextCursor: null }
    return { status, messages: [], nextCursor: null, error: mailErrorMessage(error, 'list') }
  }
}

export const readMail = async (userId: string, workspaceId: string, folder: MailFolder, id: string, markRead: boolean) =>
  (await openMailbox(userId, workspaceId)).read(folder, id, markRead)

export const markMailRead = async (userId: string, workspaceId: string, folder: MailFolder, id: string) =>
  (await openMailbox(userId, workspaceId)).markRead(folder, id)

export const mailAttachment = async (userId: string, workspaceId: string, folder: MailFolder, id: string, attachmentId: string) =>
  (await openMailbox(userId, workspaceId)).attachment(folder, id, attachmentId)

export const sendMail = async (userId: string, workspaceId: string, mail: Omit<OutgoingMail, 'from'>) =>
  (await openMailbox(userId, workspaceId)).send(mail)

const CONTACTS_TTL_MS = 10 * 60_000
const MAX_CACHED = 500
const contactsCache = new Map<string, { at: number; contacts: MailContact[] }>()

/** Unique people from recent mail, most frequent first. Cached per user and workspace. */
export async function listContacts(userId: string, workspaceId: string): Promise<MailContact[]> {
  const cacheKey = `${userId}:${workspaceId}`
  const cached = contactsCache.get(cacheKey)
  if (cached && Date.now() - cached.at < CONTACTS_TTL_MS) return cached.contacts
  const row = await connection(userId, workspaceId)
  if (!row) return []
  const found = await (await openMailbox(userId, workspaceId, row)).contacts()
  const own = row.account.toLowerCase()
  const byAddress = new Map<string, MailContact & { count: number }>()
  for (const person of found) {
    const address = person.address.trim().toLowerCase()
    if (!address || address === own || address.length > 254) continue
    const current = byAddress.get(address)
    byAddress.set(address, { name: (current?.name || person.name.trim()).slice(0, 120), address, count: (current?.count ?? 0) + 1 })
  }
  const contacts = [...byAddress.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 500)
    .map(({ name, address }) => ({ name, address }))
  if (contactsCache.size >= MAX_CACHED) contactsCache.delete(contactsCache.keys().next().value!)
  contactsCache.set(cacheKey, { at: Date.now(), contacts })
  return contacts
}

/** Checks IMAP/SMTP details by signing in, then saves them for this workspace. */
export async function connectImap(userId: string, workspaceId: string, account: ImapAccount & { preset: string | null }) {
  await verifyImap(account)
  const settings: ImapSettings = {
    preset: account.preset ?? undefined,
    imapHost: account.imapHost,
    imapPort: account.imapPort,
    smtpHost: account.smtpHost,
    smtpPort: account.smtpPort,
    savesSent: account.savesSent,
  }
  await saveConnection<ImapSecret>(userId, scope(workspaceId), { provider: 'imap', account: account.address, secret: { user: account.user, pass: account.pass }, settings })
  contactsCache.delete(`${userId}:${workspaceId}`)
}

/** Saves the Gmail account signed in through the Google callback as this workspace's mailbox. */
export async function connectGmail(userId: string, workspaceId: string, grant: TokenGrant) {
  await saveConnection<OAuthSecret>(userId, scope(workspaceId), {
    provider: 'gmail',
    account: await gmailAddress(grant.access_token),
    secret: { accessToken: grant.access_token, refreshToken: grant.refresh_token ?? '', expiresAt: Date.now() + grant.expires_in * 1000 },
  })
  contactsCache.delete(`${userId}:${workspaceId}`)
}

export async function disconnectMail(userId: string, workspaceId: string) {
  await deleteConnection(userId, scope(workspaceId))
  contactsCache.delete(`${userId}:${workspaceId}`)
}

/**
 * A safe, fixed sentence for the client. Provider and server texts are never passed
 * through (they can echo addresses or internals); details go to the server log.
 */
export function mailErrorMessage(error: unknown, action: string) {
  if (error instanceof ReconnectRequired) return EXPIRED
  if (error instanceof MailHostError) return error.message
  if (error instanceof NotConfigured) return 'Mail is not set up on this server yet.'
  const details = (error && typeof error === 'object' ? error : {}) as { code?: string; message?: string; responseText?: string; reason?: string; responseCode?: number }
  console.error(`[mail] ${action} failed`, details.code ?? '', details.responseCode ?? '', (details.message ?? '').slice(0, 200))
  if (isAuthFailure(error) || details.code === 'EAUTH') return 'The mail server rejected the address or password.'
  if (details.message === 'Message too large.') return 'This message is too large to open here.'
  const text = `${details.responseText ?? ''} ${details.reason ?? ''} ${details.message ?? ''}`
  if (/too many|limit|try again later|throttl/i.test(text)) return 'The mail server is limiting connections right now. Try again in a minute.'
  if (isConnectionGone(error) || ['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ENOTFOUND', 'NoConnection'].includes(details.code ?? '')) {
    return 'Could not reach the mail server. Try again in a moment.'
  }
  if (/certificate|self.signed|CERT_|TLS/i.test(`${details.code ?? ''} ${details.message ?? ''}`)) return 'The mail server’s security certificate could not be verified.'
  return 'Something went wrong talking to the mail server.'
}
