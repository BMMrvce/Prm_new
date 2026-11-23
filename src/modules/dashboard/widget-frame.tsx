import { Plus } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/ui/cn'

/** The card every widget renders into: title row, scrollable body. */
export function WidgetFrame({
  title,
  icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('neo-card flex h-full min-h-0 flex-col overflow-hidden rounded-xl', className)}>
      <header className="flex items-center gap-2 px-4 pt-3.5 pb-2">
        {icon && <span className="grid size-7 place-items-center rounded-lg bg-primary-light text-primary-ink">{icon}</span>}
        <h2 className="min-w-0 flex-1 truncate text-ui font-semibold text-ink">{title}</h2>
        {action}
      </header>
      <div className={cn('min-h-0 flex-1 overflow-y-auto px-4 pb-4', bodyClassName)}>{children}</div>
    </section>
  )
}

/** The small "+" in a widget's header: a link (href) or an action (onClick). */
export function WidgetAdd({ label, href, onClick, busy }: { label: string; href?: string; onClick?: () => void; busy?: boolean }) {
  const className = 'grid size-6 place-items-center rounded-md text-ink-2 hover:bg-primary-light hover:text-primary-ink disabled:opacity-50'
  return href ? (
    <Link href={href} aria-label={label} title={label} className={className}>
      <Plus size={14} />
    </Link>
  ) : (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={busy} className={className}>
      <Plus size={14} />
    </button>
  )
}
