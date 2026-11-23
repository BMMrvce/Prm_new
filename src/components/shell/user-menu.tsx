'use client'

import { CircleHelp, LockKeyhole, LogOut, Settings, ShieldCheck, Sparkles, UserRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { HELP_HREF } from '@/core/routes'
import { signOut, useProfile, useUser } from '@/core/session'
import { useVault } from '@/components/security/vault'
import { Menu } from '@/ui/menu'
import { Avatar } from '@/ui/misc'

export function UserMenu({ onStartTour }: { onStartTour?: () => void }) {
  const router = useRouter()
  const user = useUser()
  const { data: profile } = useProfile()
  const vault = useVault()
  const name = profile?.fullName || user.email

  return (
    <Menu
      label="Account"
      items={[
        {
          heading: (
            <span className="block min-w-0">
              <span className="block truncate text-ui font-medium tracking-normal text-ink normal-case">{profile?.fullName || 'Your account'}</span>
              <span className="block truncate text-2xs font-normal tracking-normal text-ink-3 normal-case">{user.email}</span>
            </span>
          ),
        },
        { label: 'Profile', icon: <UserRound size={15} />, onSelect: () => router.push('/account') },
        { label: 'Security & privacy', icon: <ShieldCheck size={15} />, onSelect: () => router.push('/account/security') },
        { label: 'Preferences', icon: <Settings size={15} />, onSelect: () => router.push('/account/preferences') },
        ...(vault.unlocked ? [{ label: 'Lock protected items', icon: <LockKeyhole size={15} />, onSelect: () => void vault.lock() }] : []),
        'separator',
        { label: 'Help centre', icon: <CircleHelp size={15} />, onSelect: () => router.push(HELP_HREF) },
        ...(onStartTour ? [{ label: 'Take the tour', icon: <Sparkles size={15} />, onSelect: onStartTour }] : []),
        'separator',
        { label: 'Sign out', icon: <LogOut size={15} />, danger: true, onSelect: () => void signOut() },
      ]}
      trigger={(props) => (
        <button {...props} type="button" aria-label="Account menu" className="rounded-full focus-visible:outline-offset-2">
          <Avatar name={name} src={profile?.avatarUrl} size={34} />
        </button>
      )}
    />
  )
}
