import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from './cn'
import { Spinner } from './spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary shadow-sm hover:bg-primary-hover active:bg-primary-active',
  secondary: 'neo-control text-ink hover:bg-surface-2',
  subtle: 'bg-primary-light text-primary-ink hover:bg-primary-subtle',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-error text-on-primary hover:opacity-90',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-md px-2.5 text-xs',
  md: 'h-9 gap-2 rounded-lg px-3.5 text-ui',
  lg: 'h-11 gap-2 rounded-lg px-5 text-sm',
}

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-55',
    VARIANTS[variant],
    SIZES[size],
    className,
  )
}

type Common = { variant?: ButtonVariant; size?: ButtonSize; icon?: ReactNode; loading?: boolean }

/** The app's one button. `loading` keeps its width and shows a spinner. */
export function Button({
  variant,
  size,
  icon,
  loading,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}: Common & ComponentProps<'button'>) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size={size === 'sm' ? 13 : 15} /> : icon}
      {children}
    </button>
  )
}

export function ButtonLink({
  variant,
  size,
  icon,
  className,
  children,
  ...props
}: Common & ComponentProps<typeof Link>) {
  return (
    <Link className={buttonClass(variant, size, className)} {...props}>
      {icon}
      {children}
    </Link>
  )
}

/** Square icon-only button. `label` is required: it is the accessible name and tooltip. */
export function IconButton({
  label,
  children,
  className,
  size = 'md',
  variant = 'ghost',
  type = 'button',
  ...props
}: { label: string; size?: 'sm' | 'md'; variant?: 'ghost' | 'secondary' } & ComponentProps<'button'>) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'grid shrink-0 place-items-center rounded-lg disabled:opacity-50',
        size === 'sm' ? 'size-7' : 'size-9',
        variant === 'secondary' ? 'neo-control text-ink-2 hover:text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
