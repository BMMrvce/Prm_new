'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { cn } from '@/ui/cn'
import { PageHeader } from '@/ui/misc'

const LINKS = [
  { href: '/account', label: 'Profile' },
  { href: '/account/security', label: 'Security & privacy' },
  { href: '/account/preferences', label: 'Preferences' },
]

export default function AccountLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="max-w-4xl">
      <PageHeader title="Your account" description="These settings are yours alone and apply in every workspace." />
      <nav aria-label="Account sections" className="mb-6 flex gap-1 border-b border-line">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname === link.href ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-ui',
              pathname === link.href ? 'border-primary font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink',
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}
