'use client'

import { ArrowLeft, Download, Paperclip, Reply } from 'lucide-react'
import type { MailFolder, MailMessage } from '@/lib/mail/types'
import { Button } from '@/ui/button'
import { ErrorNotice } from '@/ui/misc'
import { Skeleton } from '@/ui/spinner'
import { attachmentUrl, useMessage } from './api'
import { fileSize } from './compose-dialog'
import { MailFrame } from './mail-frame'

function Attachments({ workspaceId, folder, message }: { workspaceId: string; folder: MailFolder; message: MailMessage }) {
  if (!message.attachments.length) return null
  return (
    <div className="border-b border-line-soft px-4 py-3 sm:px-5">
      <p className="mb-2 flex items-center gap-1.5 text-2xs font-semibold tracking-wide text-ink-2 uppercase">
        <Paperclip size={12} aria-hidden /> {message.attachments.length} attachment{message.attachments.length === 1 ? '' : 's'}
      </p>
      <ul className="flex flex-wrap gap-2">
        {message.attachments.map((attachment) => (
          <li key={attachment.id} className="max-w-full min-w-0">
            <a
              href={attachmentUrl(workspaceId, folder, message.id, attachment.id)}
              download={attachment.filename}
              className="flex max-w-[280px] min-w-0 items-center gap-2.5 rounded-lg border border-line bg-surface-2 py-2 pr-3 pl-2.5 hover:border-primary"
            >
              <Download size={15} className="shrink-0 text-primary-ink" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-ink">{attachment.filename}</span>
                <span className="block text-2xs text-ink-3">{attachment.size ? fileSize(attachment.size) : 'File'}</span>
              </span>
              <span className="sr-only">Download</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The open message: headers, attachments and the body (HTML only in the sandboxed frame). */
export function ReadingPane({
  workspaceId,
  folder,
  messageId,
  onBack,
  onReply,
}: {
  workspaceId: string
  folder: MailFolder
  messageId: string
  onBack: () => void
  onReply: (message: MailMessage) => void
}) {
  const { data: message, isPending, error, refetch } = useMessage(workspaceId, folder, messageId)
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="border-b border-line-soft px-3 py-2 lg:hidden">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} aria-hidden />} onClick={onBack}>
          Back to {folder}
        </Button>
      </div>
      {isPending && (
        <div className="space-y-3 p-5" aria-busy="true" aria-label="Opening message">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}
      {error && (
        <div className="p-5">
          <ErrorNotice title="Could not open this message" message={error.message} onRetry={() => refetch()} />
        </div>
      )}
      {message && (
        <article className="flex min-h-0 flex-1 flex-col" aria-label={message.subject}>
          <header className="flex flex-wrap items-start gap-3 border-b border-line-soft px-4 py-4 sm:px-5">
            <div className="min-w-0 flex-1 basis-60">
              <h2 className="text-lg leading-snug font-semibold break-words text-ink">{message.subject}</h2>
              <p className="mt-2 text-ui font-medium text-ink">{message.from}</p>
              {message.fromAddress && message.fromAddress !== message.from && <p className="text-xs break-all text-ink-2">{message.fromAddress}</p>}
              <p className="mt-1.5 text-xs break-words text-ink-2">
                <span className="text-ink-3">To </span>
                {message.to || '—'}
                {message.cc && (
                  <>
                    <span className="text-ink-3"> · Cc </span>
                    {message.cc}
                  </>
                )}
              </p>
              {message.date && <p className="mt-0.5 text-xs text-ink-3">{new Date(message.date).toLocaleString()}</p>}
            </div>
            {message.fromAddress && folder === 'inbox' && (
              <Button size="sm" icon={<Reply size={14} aria-hidden />} onClick={() => onReply(message)}>
                Reply
              </Button>
            )}
          </header>
          <Attachments workspaceId={workspaceId} folder={folder} message={message} />
          {message.html ? (
            <MailFrame title={message.subject} html={message.html} />
          ) : (
            <pre className="flex-1 p-4 font-sans text-sm leading-6 whitespace-pre-wrap text-ink [overflow-wrap:anywhere] sm:p-5">{message.text || '(empty message)'}</pre>
          )}
        </article>
      )}
    </div>
  )
}
