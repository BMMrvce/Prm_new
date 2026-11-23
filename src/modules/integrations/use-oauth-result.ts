'use client'

import { useEffect } from 'react'
import { OAUTH_REASONS } from '@/modules/inbox/api'
import { toast } from '@/ui/toast'

/**
 * Shows the result of a Google sign-in redirect (`?<param>=connected|error&reason=<code>`)
 * once, then removes it from the URL. Only fixed messages are shown, never URL text.
 */
export function useOAuthResult(param: 'mail' | 'youtube', onConnected: string, after?: () => void) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get(param)
    if (!result) return
    if (result === 'connected') {
      toast.success(onConnected)
      after?.()
    } else {
      toast.error(OAUTH_REASONS[params.get('reason') ?? ''] ?? OAUTH_REASONS.failed)
    }
    params.delete(param)
    params.delete('reason')
    const query = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`)
    // Only when arriving from the redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
