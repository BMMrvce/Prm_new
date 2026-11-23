'use client'

import { Switch } from '@/ui/field'
import { errorMessage, toast } from '@/ui/toast'
import { usePush } from './use-push'

const HINTS: Record<string, string> = {
  checking: 'Checking this device…',
  unsupported: 'This browser does not support push notifications.',
  'needs-install': 'On iPhone and iPad, add the app to your Home Screen first.',
  blocked: 'Notifications are blocked. Allow them in your browser’s site settings.',
  off: 'Meetings, deadlines and your daily digest, on this device.',
  on: 'Meetings, deadlines and your daily digest, on this device.',
}

/** Compact on/off row for push reminders on this device, with a test button when on. */
export function PushToggle() {
  const push = usePush()
  const available = push.state === 'on' || push.state === 'off'
  return (
    <div className="space-y-1.5 px-4 py-3">
      <Switch
        checked={push.state === 'on'}
        disabled={!available || push.busy}
        label="Push reminders"
        description={HINTS[push.state]}
        onChange={async (checked) => {
          try {
            await (checked ? push.enable() : push.disable())
            toast.success(checked ? 'Reminders are on for this device.' : 'Reminders are off for this device.')
          } catch (error) {
            toast.error(errorMessage(error))
          }
        }}
      />
      {push.state === 'on' && (
        <button
          type="button"
          className="text-xs font-medium text-primary-ink hover:underline"
          onClick={async () => {
            try {
              const sent = await push.test()
              toast.info(sent ? 'Test notification sent.' : 'No devices received it. Try turning reminders off and on.')
            } catch (error) {
              toast.error(errorMessage(error))
            }
          }}
        >
          Send a test notification
        </button>
      )}
    </div>
  )
}
