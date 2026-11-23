'use client'

import type { DriveStep } from 'driver.js'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useProfile, useUpdateProfile } from '@/core/session'
import type { Workspace } from '@/core/types'

export type TourController = { start: () => void }

/** Starts the product tour from the account menu or after first setup (?tour=1). */
export function useTour(): TourController {
  const router = useRouter()
  const start = useCallback(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('tour', '1')
    router.replace(`${url.pathname}?${url.searchParams}`)
  }, [router])
  return useMemo(() => ({ start }), [start])
}

const STEPS: DriveStep[] = [
  {
    popover: {
      title: 'Welcome to your workspace',
      description: 'A quick look around. It takes under a minute, and you can leave any time with Esc.',
    },
  },
  {
    element: '[aria-haspopup="listbox"]',
    popover: {
      title: 'Switch workspaces',
      description: 'Each company, client or area of life gets its own workspace. Switch, search and pin them here, or open “All workspaces” to see everything together.',
    },
  },
  {
    element: '[data-tour="quick-add"]',
    popover: { title: 'Add tasks quickly', description: 'Press N anywhere to capture a task without leaving the page.' },
  },
  {
    element: '[data-tour="modules"]',
    popover: {
      title: 'Your modules',
      description: 'The sidebar shows the modules this workspace uses: tasks, board, notes, whiteboard, time, money and more. Turn them on or off in Settings → Modules.',
    },
  },
  {
    element: '[data-tour="search"]',
    popover: { title: 'Search everything', description: 'Press ⌘K (Ctrl+K) to search tasks, notes and projects, or jump to any page.' },
  },
  {
    element: 'a[href$="/settings"]',
    popover: { title: 'Make it yours', description: 'Rename the workspace, choose its icon and color, invite people, create teams and set your Kanban columns.' },
  },
  {
    element: 'a[href="/help"]',
    popover: { title: 'Help is always here', description: 'Guides for every module, written in plain language. You can restart this tour from your account menu.' },
  },
]

/** Runs the tour when `?tour=1` is in the URL, and records completion on the profile. */
export function TourHost({ workspace }: { controller: TourController; workspace: Workspace | null }) {
  const params = useSearchParams()
  const router = useRouter()
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  const running = useRef(false)
  const wanted = params.get('tour') === '1'

  useEffect(() => {
    if (!wanted || !workspace || !profile || running.current) return
    running.current = true
    const steps = STEPS.filter((step) => !step.element || document.querySelector(step.element as string))
    let finished = false
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    // The tour library loads only when a tour actually starts.
    void Promise.all([import('driver.js'), import('driver.js/dist/driver.css')]).then(([{ driver }]) => {
      if (cancelled) return
      const tour = driver({
      showProgress: true,
      allowClose: true,
      overlayOpacity: 0.45,
      stagePadding: 6,
      stageRadius: 10,
      popoverClass: 'kala-tour',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Done',
      steps,
      onNextClick: () => {
        if (!tour.hasNextStep()) finished = true
        tour.moveNext()
      },
      onDestroyed: () => {
        running.current = false
        const now = new Date().toISOString()
        updateProfile.mutate({
          onboarding: { ...profile.onboarding, tour: finished ? { completedAt: now } : { ...profile.onboarding.tour, dismissedAt: now } },
        })
        const url = new URL(window.location.href)
        url.searchParams.delete('tour')
        router.replace(url.searchParams.size ? `${url.pathname}?${url.searchParams}` : url.pathname)
      },
    })
      // Let the page settle before measuring elements.
      timer = setTimeout(() => tour.drive(), 350)
    })
    return () => {
      cancelled = true
      running.current = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, workspace?.id, profile?.id])

  return null
}
