import 'server-only'
import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { ImapFlow, type FetchMessageObject } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'
import type { MailContact, MailFolder, MailMessage, MailQuery, MailSummary } from '@/lib/mail/types'
import { MAIL_PAGE_SIZE } from '@/lib/mail/types'
import { composeRaw, pickAttachment, toMailMessage, type AttachmentFile, type OutgoingMail } from './attachments'
import { resolveMailServer, type LookupAll } from './hosts'

/**
 * Any IMAP/SMTP mailbox (Hostinger, Zoho, Fastmail, …): IMAP to read, SMTP to send, signed
 * in with the user's own address and (app) password. Every connection goes to an address
 * checked by hosts.ts, over TLS (implicit or required STARTTLS) with certificate checks.
 */
export type ImapAccount = {
  /** The mailbox address (From), which is also the login unless `user` differs. */
  address: string
  user: string
  pass: string
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  /** The provider files sent mail itself (no copy appended to Sent). */
  savesSent: boolean
}

const lookupAll: LookupAll = (hostname) => lookup(hostname, { all: true, verbatim: true })

const TIMEOUTS = { connectionTimeout: 15_000, greetingTimeout: 10_000, socketTimeout: 90_000 }
/** Bounds memory against a hostile server announcing huge literals. */
const MAX_LITERAL = 40 * 1024 * 1024
const MAX_MESSAGE = 30 * 1024 * 1024

/**
 * Open IMAP sessions, reused across requests so periodic refreshes do not trip provider
 * connection limits. A session closes a few minutes after its last use. Keyed by a hash of
 * server and login, so changed details never reuse a session.
 */
const IDLE_MS = 4 * 60_000
const MAX_POOL = 100
const COOLDOWN_MS = 2_000
const RETRY_DELAYS = [600, 1800]
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type PooledSession = { client: ImapFlow; ready: Promise<void>; users: number; idle?: NodeJS.Timeout }
const pool = new Map<string, PooledSession>()
const cooldowns = new Map<string, number>()

const GONE_CODES = new Set(['NoConnection', 'EConnectionClosed', 'StateLogout', 'ClosedAfterConnectTLS', 'ClosedAfterConnectText', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE'])

/** True for dropped or refused connections, worth retrying on a fresh session. */
export function isConnectionGone(error: unknown) {
  const details = (error && typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  return GONE_CODES.has(details.code ?? '') || /unexpected close|connection closed|socket (hang up|closed)/i.test(details.message ?? '')
}

export const isAuthFailure = (error: unknown) => Boolean(error && typeof error === 'object' && 'authenticationFailed' in error)

const poolKey = (account: ImapAccount) => createHash('sha256').update([account.imapHost, account.imapPort, account.user, account.pass].join('\0')).digest('hex')

function drop(key: string, session: PooledSession) {
  if (pool.get(key) === session) pool.delete(key)
  clearTimeout(session.idle)
  session.client.logout().catch(() => undefined)
}

async function createClient(account: ImapAccount) {
  const server = await resolveMailServer('imap', account.imapHost, account.imapPort, lookupAll)
  const client = new ImapFlow({
    host: server.address,
    servername: server.servername,
    port: server.port,
    secure: server.tls === 'implicit',
    ...(server.tls === 'starttls' ? { doSTARTTLS: true } : {}),
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    auth: { user: account.user, pass: account.pass },
    logger: false,
    maxLiteralSize: MAX_LITERAL,
    ...TIMEOUTS,
  })
  // Socket errors surface through the pending command; an unhandled 'error' event would crash.
  client.on('error', () => undefined)
  return client
}

async function acquire(account: ImapAccount) {
  const key = poolKey(account)
  let session = pool.get(key)
  if (session && !session.client.usable) {
    if (session.users === 0) drop(key, session)
    else if (pool.get(key) === session) pool.delete(key)
    session = undefined
  }
  const wait = (cooldowns.get(key) ?? 0) - Date.now()
  if (!session && wait > 0) await sleep(wait)
  session ??= pool.get(key)
  if (!session) {
    // Evict the oldest idle session rather than grow without bound.
    if (pool.size >= MAX_POOL) {
      const idle = [...pool.entries()].find(([, entry]) => entry.users === 0)
      if (idle) drop(idle[0], idle[1])
    }
    const client = await createClient(account)
    const created: PooledSession = { client, ready: client.connect(), users: 0 }
    client.on('close', () => {
      if (pool.get(key) === created) pool.delete(key)
    })
    pool.set(key, created)
    session = created
  }
  const current = session
  try {
    await current.ready
  } catch (error) {
    drop(key, current)
    if (isConnectionGone(error)) cooldowns.set(key, Date.now() + COOLDOWN_MS)
    throw error
  }
  cooldowns.delete(key)
  clearTimeout(current.idle)
  current.users++
  return {
    client: current.client,
    release: (broken: boolean) => {
      current.users--
      if (broken) return drop(key, current)
      if (current.users === 0) {
        current.idle = setTimeout(() => drop(key, current), IDLE_MS)
        current.idle.unref?.()
      }
    },
  }
}

/** Runs `run` on a pooled session, retrying twice on a dropped connection (never on a bad password). */
async function withImap<T>(account: ImapAccount, run: (client: ImapFlow) => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    let lease: Awaited<ReturnType<typeof acquire>> | undefined
    try {
      lease = await acquire(account)
      const result = await run(lease.client)
      lease.release(false)
      return result
    } catch (error) {
      const gone = Boolean(lease) && (!lease!.client.usable || isConnectionGone(error))
      lease?.release(gone)
      if (!gone || isAuthFailure(error) || attempt >= RETRY_DELAYS.length) throw error
      await sleep(RETRY_DELAYS[attempt])
    }
  }
}

const sentPaths = new WeakMap<ImapFlow, string>()

async function mailboxPath(client: ImapFlow, folder: MailFolder) {
  if (folder === 'inbox') return 'INBOX'
  const known = sentPaths.get(client)
  if (known) return known
  const boxes = await client.list()
  const path =
    boxes.find((box) => box.specialUse === '\\Sent')?.path ??
    boxes.find((box) => /^(INBOX[./])?sent( (items|messages|mail))?$/i.test(box.path))?.path ??
    'Sent'
  sentPaths.set(client, path)
  return path
}

const addressList = (list?: { name?: string; address?: string }[]) => (list ?? []).map((item) => item.name || item.address || '').join(', ')

function toSummary(message: FetchMessageObject): MailSummary {
  const envelope = message.envelope
  const sender = envelope?.from?.[0]
  const date = envelope?.date ?? message.internalDate
  return {
    id: String(message.uid),
    subject: envelope?.subject || '(no subject)',
    from: sender?.name || sender?.address || 'Unknown sender',
    fromAddress: sender?.address ?? '',
    to: addressList(envelope?.to),
    date: date ? new Date(date).toISOString() : '',
    unread: !message.flags?.has('\\Seen'),
  }
}

/** Signs in once (IMAP) and checks the SMTP server answers over TLS, before details are saved. */
export async function verifyImap(account: ImapAccount) {
  await withImap(account, async () => undefined)
  const transport = await smtpTransport(account)
  try {
    await transport.verify()
  } finally {
    transport.close()
  }
}

const DAY_MS = 86_400_000

/**
 * One page of a folder, newest first. Without filters it reads the newest messages by
 * position; with filters IMAP searches by whole days (padded a day each side for time
 * zones, then trimmed to the exact instants). The cursor is how many matches to skip.
 */
export async function listImap(account: ImapAccount, folder: MailFolder, query: MailQuery) {
  const limit = query.limit ?? MAIL_PAGE_SIZE
  const after = query.after ? new Date(query.after) : null
  const before = query.before ? new Date(query.before) : null
  const search = query.search?.trim()
  const offset = Math.max(0, Number.parseInt(query.cursor ?? '0', 10) || 0)
  return withImap(account, async (client) => {
    const lock = await client.getMailboxLock(await mailboxPath(client, folder), { readOnly: true })
    try {
      const exists = client.mailbox ? client.mailbox.exists : 0
      if (!exists) return { messages: [] as MailSummary[], nextCursor: null }
      const fields = { uid: true, envelope: true, flags: true, internalDate: true } as const
      if (!after && !before && !search) {
        const end = exists - offset
        if (end < 1) return { messages: [], nextCursor: null }
        const start = Math.max(1, end - limit + 1)
        const fetched = await client.fetchAll(`${start}:${end}`, fields)
        return { messages: fetched.map(toSummary).sort((a, b) => b.date.localeCompare(a.date)), nextCursor: start > 1 ? String(offset + limit) : null }
      }
      const criteria = {
        ...(after ? { since: new Date(after.getTime() - DAY_MS) } : {}),
        ...(before ? { before: new Date(before.getTime() + DAY_MS) } : {}),
        ...(search ? { text: search } : {}),
      }
      const uids = (await client.search(criteria, { uid: true })) || []
      const page = [...uids].sort((a, b) => b - a).slice(offset, offset + limit)
      if (!page.length) return { messages: [], nextCursor: null }
      const fetched = await client.fetchAll(page.join(','), fields, { uid: true })
      const messages = fetched
        .map(toSummary)
        .filter((message) => (!after || message.date >= after.toISOString()) && (!before || message.date < before.toISOString()))
        .sort((a, b) => b.date.localeCompare(a.date))
      const next = offset + limit
      return { messages, nextCursor: next < uids.length ? String(next) : null }
    } finally {
      lock.release()
    }
  })
}

export async function markReadImap(account: ImapAccount, folder: MailFolder, id: string) {
  await withImap(account, async (client) => {
    const lock = await client.getMailboxLock(await mailboxPath(client, folder))
    try {
      await client.messageFlagsAdd(id, ['\\Seen'], { uid: true })
    } finally {
      lock.release()
    }
  })
}

/** The raw source of one message (by UID), refusing very large ones. */
async function source(client: ImapFlow, id: string) {
  const head = await client.fetchOne(id, { uid: true, size: true, flags: true, envelope: true, internalDate: true }, { uid: true })
  if (!head) return null
  if ((head.size ?? 0) > MAX_MESSAGE) throw new Error('Message too large.')
  const body = await client.fetchOne(id, { uid: true, source: true }, { uid: true })
  return body && body.source ? { head, source: body.source } : null
}

export async function readImap(account: ImapAccount, folder: MailFolder, id: string, markRead: boolean): Promise<MailMessage | null> {
  return withImap(account, async (client) => {
    const lock = await client.getMailboxLock(await mailboxPath(client, folder), { readOnly: !markRead })
    try {
      const found = await source(client, id)
      if (!found) return null
      if (markRead && !found.head.flags?.has('\\Seen')) await client.messageFlagsAdd(id, ['\\Seen'], { uid: true })
      const summary = toSummary(found.head)
      return toMailMessage(await simpleParser(found.source), { id: summary.id, date: summary.date })
    } finally {
      lock.release()
    }
  })
}

export async function attachmentImap(account: ImapAccount, folder: MailFolder, id: string, attachmentId: string): Promise<AttachmentFile | null> {
  return withImap(account, async (client) => {
    const lock = await client.getMailboxLock(await mailboxPath(client, folder), { readOnly: true })
    try {
      const found = await source(client, id)
      return found ? pickAttachment(await simpleParser(found.source), attachmentId) : null
    } finally {
      lock.release()
    }
  })
}

async function smtpTransport(account: ImapAccount) {
  const server = await resolveMailServer('smtp', account.smtpHost, account.smtpPort, lookupAll)
  return nodemailer.createTransport({
    host: server.address,
    servername: server.servername,
    port: server.port,
    secure: server.tls === 'implicit',
    requireTLS: server.tls === 'starttls',
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: server.servername },
    auth: { user: account.user, pass: account.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 60_000,
    logger: false,
  })
}

export async function sendImap(account: ImapAccount, mail: OutgoingMail) {
  const raw = await composeRaw(mail)
  const transport = await smtpTransport(account)
  try {
    await transport.sendMail({ envelope: { from: account.address, to: [...mail.to, ...mail.cc] }, raw })
  } finally {
    transport.close()
  }
  if (account.savesSent) return
  // Most SMTP servers do not file outgoing mail; keep a copy in Sent like a desktop client.
  await withImap(account, async (client) => {
    await client.append(await mailboxPath(client, 'sent'), raw, ['\\Seen'])
  }).catch((error) => console.warn('[imap] could not file sent copy', (error as { code?: string }).code ?? 'error'))
}

/** Senders and recipients of the latest messages in Inbox and Sent. */
export async function contactsImap(account: ImapAccount, perFolder = 150) {
  return withImap(account, async (client) => {
    const found: MailContact[] = []
    for (const folder of ['inbox', 'sent'] as const) {
      const lock = await client.getMailboxLock(await mailboxPath(client, folder), { readOnly: true })
      try {
        const exists = client.mailbox ? client.mailbox.exists : 0
        if (!exists) continue
        const messages = await client.fetchAll(`${Math.max(1, exists - perFolder + 1)}:*`, { envelope: true })
        for (const message of messages) {
          const envelope = message.envelope
          for (const person of [...(envelope?.from ?? []), ...(envelope?.to ?? []), ...(envelope?.cc ?? [])]) {
            if (person.address) found.push({ name: person.name ?? '', address: person.address })
          }
        }
      } finally {
        lock.release()
      }
    }
    return found
  })
}
