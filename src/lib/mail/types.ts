/** Mail shapes shared by the `/api/mail/[workspaceId]` route handlers and the Inbox UI. */
export type MailFolder = 'inbox' | 'sent'

export type MailProvider = 'gmail' | 'imap'

export type MailStatus =
  | { state: 'connected'; provider: MailProvider; label: string; account: string }
  | {
      state: 'disconnected'
      /** False when the server has no Google OAuth client configured. */
      gmailAvailable: boolean
      /** Set when a previous connection stopped working. */
      note?: string
    }

export type MailSummary = {
  id: string
  subject: string
  from: string
  fromAddress: string
  to: string
  date: string
  unread: boolean
}

/** A file attached to a received message; download it by `id`. */
export type MailAttachmentInfo = { id: string; filename: string; contentType: string; size: number }

export type MailMessage = MailSummary & {
  /** Remote HTML, unsanitized: render it only inside the sandboxed mail frame. */
  html: string | null
  text: string
  cc: string
  attachments: MailAttachmentInfo[]
}

/**
 * Filters for listing a folder. `after` / `before` are ISO instants the client computes
 * from local dates, so "Nov 7" means the viewer's Nov 7 whatever the server's time zone.
 */
export type MailQuery = { search?: string; after?: string; before?: string; cursor?: string; limit?: number }

export const MAIL_PAGE_SIZE = 30

export type MailListResponse = {
  status: MailStatus
  messages: MailSummary[]
  /** Pass back as `cursor` for the next page; null when the folder (or search) is done. */
  nextCursor: string | null
  error?: string
}

/** Someone you have exchanged mail with, for recipient suggestions. */
export type MailContact = { name: string; address: string }

/** Request bodies over ~4.5 MB are refused by most hosts. */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024
export const MAX_ATTACHMENTS = 10
/** To and Cc together. */
export const MAX_RECIPIENTS = 50
export const MAX_SUBJECT = 300
