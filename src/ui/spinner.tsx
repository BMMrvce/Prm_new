import { LoaderCircle } from 'lucide-react'
import { cn } from './cn'

export function Spinner({ size = 16, className, label }: { size?: number; className?: string; label?: string }) {
  return (
    <LoaderCircle
      size={size}
      className={cn('animate-spin text-current motion-reduce:animate-none', className)}
      aria-hidden={!label}
      aria-label={label}
      role={label ? 'status' : undefined}
    />
  )
}

/** Shimmering placeholder block while content loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} aria-hidden />
}

/** A page-level placeholder: a heading bar and a few rows. */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="neo-card mt-6 space-y-3 rounded-xl p-4">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    </div>
  )
}
