/**
 * Well-known IMAP/SMTP settings, offered when connecting a mailbox. Pure data: adding a
 * provider is one entry here, never a code branch. `custom` lets the user type their own
 * servers (still checked by the server's host and port rules).
 */
export type MailPreset = {
  id: string
  label: string
  imap: { host: string; port: number }
  smtp: { host: string; port: number }
  /** True when the provider files sent mail itself, so the app must not append a copy. */
  savesSent?: boolean
  /** Shown under the password field. */
  hint?: string
}

export const MAIL_PRESETS: MailPreset[] = [
  {
    id: 'hostinger',
    label: 'Hostinger',
    imap: { host: 'imap.hostinger.com', port: 993 },
    smtp: { host: 'smtp.hostinger.com', port: 465 },
    hint: 'Use the mailbox’s own password (the one for webmail), not your Hostinger account login.',
  },
  {
    id: 'zoho',
    label: 'Zoho Mail',
    imap: { host: 'imap.zoho.com', port: 993 },
    smtp: { host: 'smtp.zoho.com', port: 465 },
    hint: 'Turn on IMAP access in Zoho settings. With two-factor sign-in, create an app-specific password. EU and India accounts use imap.zoho.eu / imap.zoho.in (choose Other).',
  },
  {
    id: 'fastmail',
    label: 'Fastmail',
    imap: { host: 'imap.fastmail.com', port: 993 },
    smtp: { host: 'smtp.fastmail.com', port: 465 },
    hint: 'Create an app password in Fastmail → Settings → Privacy & Security.',
  },
  {
    id: 'outlook',
    label: 'Outlook.com (IMAP)',
    imap: { host: 'outlook.office365.com', port: 993 },
    smtp: { host: 'smtp-mail.outlook.com', port: 587 },
    savesSent: true,
    hint: 'Needs an app password; some Microsoft accounts no longer allow password sign-in for IMAP.',
  },
  {
    id: 'yahoo',
    label: 'Yahoo Mail',
    imap: { host: 'imap.mail.yahoo.com', port: 993 },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465 },
    hint: 'Generate an app password in Yahoo Account Security.',
  },
  {
    id: 'icloud',
    label: 'iCloud Mail',
    imap: { host: 'imap.mail.me.com', port: 993 },
    smtp: { host: 'smtp.mail.me.com', port: 587 },
    savesSent: true,
    hint: 'Create an app-specific password at account.apple.com. Use your full iCloud address.',
  },
]

export const CUSTOM_PRESET = 'custom'

export function mailPreset(id: string | null | undefined) {
  return MAIL_PRESETS.find((preset) => preset.id === id) ?? null
}

/** Ports the server accepts (see src/server/mail/hosts.ts), for the custom form. */
export const IMAP_PORTS = [993, 143] as const
export const SMTP_PORTS = [465, 587] as const
