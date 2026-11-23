import { useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from './cn'

/** Field styles without a width, for controls that set their own. */
export const inputBase =
  'h-9 min-w-0 rounded-lg border border-line-strong bg-field px-3 text-ui text-ink outline-none placeholder:text-ink-3 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-surface-2 disabled:text-ink-3 aria-invalid:border-error'

export const inputClass = `${inputBase} w-full`

/**
 * Field classes, full width unless `className` sets a width (w-36, w-auto…). `cn` only
 * joins classes, so without this the built-in w-full could silently win over it.
 */
export function fieldClass(className?: string) {
  return /(^|\s)(sm:|md:|lg:)?w-/.test(className ?? '') ? cn(inputBase, className) : cn(inputClass, className)
}

/**
 * Label, control, hint and error in one block. The control is rendered by `children`
 * as a function so it receives the ids it must carry for the label and messages.
 */
export function Field({
  label,
  hint,
  error,
  className,
  optional,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  className?: string
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode
}) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-xs font-medium text-ink-2">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-3">(optional)</span>}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className="text-2xs text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-2xs text-error-ink" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={fieldClass(className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={fieldClass(cn('h-auto min-h-20 py-2 leading-5', className))} {...props} />
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select className={fieldClass(cn('cursor-pointer pr-8', className))} {...props}>
      {children}
    </select>
  )
}

/** Accessible on/off switch (a checkbox with role="switch"). */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-ui font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-2">{description}</span>}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus-ring)] peer-disabled:opacity-50',
          checked ? 'bg-primary' : 'bg-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-surface shadow-sm transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </span>
    </div>
  )
}
