import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { color } from '@/core/colors'
import { cn } from './cn'
import { Icon } from './icon'

/** Initials avatar (or picture) for a person. */
export function Avatar({
  name,
  src,
  size = 28,
  className,
}: {
  name: string | null | undefined
  src?: string | null
  size?: number
  className?: string
}) {
  const initials =
    (name ?? '?')
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  return (
    <span
      className={cn('inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary-light font-semibold text-primary-ink', className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
      title={name ?? undefined}
    >
      {src ? <img src={src} alt="" className="size-full object-cover" /> : initials}
    </span>
  )
}

/** Workspace / project icon in its color tile. */
export function IconTile({ icon, colorKey, size = 28, className }: { icon: string; colorKey: string; size?: number; className?: string }) {
  const tone = color(colorKey)
  return (
    <span
      className={cn('inline-grid shrink-0 place-items-center rounded-lg', tone.soft, tone.ink, className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Icon name={icon} size={Math.round(size * 0.55)} />
    </span>
  )
}

export function Dot({ colorKey, className }: { colorKey: string; className?: string }) {
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', color(colorKey).dot, className)} aria-hidden />
}

export function Badge({
  children,
  colorKey,
  className,
}: {
  children: ReactNode
  colorKey?: string
  className?: string
}) {
  const tone = colorKey ? color(colorKey) : null
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-2xs font-medium whitespace-nowrap',
        tone ? `${tone.soft} ${tone.ink}` : 'bg-surface-2 text-ink-2',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Quiet placeholder for an empty list: an icon, one line, an optional hint and action. */
export function EmptyState({
  icon: IconComponent,
  title,
  hint,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  hint?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-4 py-10 text-center', className)}>
      <span className="grid size-11 place-items-center rounded-full bg-surface-2 text-ink-3">
        <IconComponent size={19} aria-hidden />
      </span>
      <p className="mt-3 text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-ink-2">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Page heading with an optional description and actions on the right. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-medium tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-ui text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** A card section with a heading. */
export function Card({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('neo-card rounded-xl', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-line-soft px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-card font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-ink-2">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

export function ErrorNotice({ title = 'Could not load this', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-error/30 bg-error-light px-4 py-3 text-ui text-error-ink" role="alert">
      <p className="font-medium">{title}</p>
      {message && <p className="mt-0.5 text-xs opacity-90">{message}</p>}
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-2 text-xs font-medium underline underline-offset-2">
          Try again
        </button>
      )}
    </div>
  )
}
