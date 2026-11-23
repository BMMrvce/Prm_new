'use client'

import { Paperclip, Send, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, MAX_SUBJECT } from '@/lib/mail/types'
import { Button, IconButton } from '@/ui/button'
import { Dialog } from '@/ui/dialog'
import { Field, Input } from '@/ui/field'
import { RichEditor, type RichEditorHandle } from '@/ui/rich-editor'
import { errorMessage, toast } from '@/ui/toast'
import { useSendMail } from './api'
import { RecipientInput } from './recipient-input'

export type ComposeDraft = { to?: string; subject?: string }

export function fileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** New message from this workspace's mailbox: To, Cc, subject, formatted body, files up to 4 MB. */
export function ComposeDialog({ workspaceId, from, draft, onClose }: { workspaceId: string; from?: string; draft: ComposeDraft; onClose: () => void }) {
  const sendMail = useSendMail(workspaceId)
  const [to, setTo] = useState(draft.to ? `${draft.to}, ` : '')
  const [cc, setCc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [subject, setSubject] = useState(draft.subject ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const editor = useRef<RichEditorHandle>(null)
  const picker = useRef<HTMLInputElement>(null)
  const total = files.reduce((sum, file) => sum + file.size, 0)

  const addFiles = (incoming: FileList) => {
    const next = [...files]
    for (const file of incoming) {
      if (next.length >= MAX_ATTACHMENTS) {
        setError(`Attach at most ${MAX_ATTACHMENTS} files.`)
        break
      }
      if (next.reduce((sum, item) => sum + item.size, 0) + file.size > MAX_ATTACHMENT_BYTES) {
        setError(`“${file.name}” would take attachments over 4 MB.`)
        continue
      }
      next.push(file)
    }
    setFiles(next)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const body = editor.current?.text() ?? ''
    if (!body && !subject.trim() && !files.length) return setError('Write a message or add a subject first.')
    setError(null)
    try {
      const result = await sendMail.mutateAsync({
        to: to.trim().replace(/,$/, ''),
        cc: cc.trim().replace(/,$/, ''),
        subject,
        body,
        html: editor.current?.isEmpty() ? undefined : editor.current?.html(),
        files,
      })
      toast.success(result.recipients > 1 ? `Email sent to ${result.recipients} people.` : 'Email sent.')
      onClose()
    } catch (caught) {
      setError(errorMessage(caught, 'Could not send the email.'))
    }
  }

  return (
    <Dialog
      title="New message"
      description={from ? `From ${from}` : undefined}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" icon={<Paperclip size={14} aria-hidden />} onClick={() => picker.current?.click()} className="mr-auto">
            Attach
          </Button>
          <span className="text-2xs text-ink-3">{files.length ? `${fileSize(total)} of 4 MB` : 'Up to 4 MB'}</span>
          <Button type="submit" form="compose-form" variant="primary" icon={<Send size={14} aria-hidden />} loading={sendMail.isPending}>
            Send
          </Button>
        </>
      }
    >
      <form id="compose-form" onSubmit={submit} className="flex flex-col gap-3">
        <Field label="To">
          {(props) => (
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <RecipientInput workspaceId={workspaceId} id={props.id} describedBy={props['aria-describedby']} label="To" value={to} onChange={setTo} required />
              </div>
              {!showCc && (
                <Button variant="ghost" size="sm" className="h-9" onClick={() => setShowCc(true)}>
                  Cc
                </Button>
              )}
            </div>
          )}
        </Field>
        {showCc && <Field label="Cc">{(props) => <RecipientInput workspaceId={workspaceId} id={props.id} label="Cc" value={cc} onChange={setCc} />}</Field>}
        <Field label="Subject">{(props) => <Input {...props} value={subject} maxLength={MAX_SUBJECT} onChange={(event) => setSubject(event.target.value)} />}</Field>
        <RichEditor ref={editor} minHeight={200} label="Message" />
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          aria-label="Attach files"
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files)
            event.target.value = ''
          }}
        />
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Attachments">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-surface-2 py-1 pr-1 pl-2 text-xs">
                <Paperclip size={12} className="shrink-0 text-ink-3" aria-hidden />
                <span className="min-w-0 truncate text-ink">{file.name}</span>
                <span className="shrink-0 text-ink-3">{fileSize(file.size)}</span>
                <IconButton size="sm" label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, at) => at !== index))}>
                  <X size={12} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className="text-xs text-error-ink" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  )
}
