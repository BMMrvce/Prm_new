'use client'

import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './button'
import { cn } from './cn'

const WIDTHS = {
  sm: 'w-[min(420px,calc(100vw-2rem))]',
  md: 'w-[min(560px,calc(100vw-2rem))]',
  lg: 'w-[min(760px,calc(100vw-2rem))]',
  xl: 'w-[min(1080px,calc(100vw-2rem))]',
}

/**
 * Modal dialog built on the native <dialog>: the browser traps focus, makes the page
 * behind inert and closes on Escape. Clicking the backdrop or the × also closes it.
 * Mount it to open it; unmount it to close it.
 */
export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
  className,
}: {
  title: ReactNode
  description?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: keyof typeof WIDTHS
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      aria-labelledby="dialog-title"
      className={cn(
        'modal-dialog m-auto flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-xl border border-line bg-surface p-0 text-ink shadow-[var(--popover-shadow)] backdrop:bg-scrim',
        WIDTHS[size],
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-line-soft px-5 py-3.5">
        <div className="min-w-0">
          <h2 id="dialog-title" className="truncate text-card font-semibold">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-xs text-ink-2">{description}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 grid size-8 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-surface-2"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      {footer && (
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft bg-surface-2/50 px-5 py-3">
          {footer}
        </footer>
      )}
    </dialog>
  )
}

/** "Are you sure?" with a clear consequence line and a destructive confirm button. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  tone = 'danger',
  busy,
  onConfirm,
  onClose,
}: {
  title: string
  message: ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog
      title={title}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={tone} loading={busy} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-ui text-ink-2">{message}</div>
    </Dialog>
  )
}
