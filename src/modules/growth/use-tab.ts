'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/** A page's tab kept in `?tab=` so it survives reloads and can be linked to. */
export function useTabParam<T extends string>(tabs: readonly T[], fallback: T) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const current = params.get('tab') as T | null
  const tab = current && tabs.includes(current) ? current : fallback
  const select = (value: T) => {
    const next = new URLSearchParams(params.toString())
    if (value === fallback) next.delete('tab')
    else next.set('tab', value)
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }
  return [tab, select] as const
}
