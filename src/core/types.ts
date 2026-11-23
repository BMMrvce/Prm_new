/**
 * Domain types shared across the app. Database rows are mapped to these in each
 * feature's `queries.ts`; components never see raw snake_case rows.
 */

export type Role = 'owner' | 'admin' | 'member' | 'guest'

export type ColorKey =
  | 'indigo'
  | 'blue'
  | 'teal'
  | 'green'
  | 'amber'
  | 'orange'
  | 'red'
  | 'pink'
  | 'violet'
  | 'slate'

export type WorkspaceSettings = {
  /** ISO 4217 currency for money in this workspace, e.g. "USD", "INR". */
  currency?: string
  /** 0 = Sunday, 1 = Monday. */
  weekStart?: 0 | 1
}

export type WorkspaceModule = {
  moduleId: string
  enabled: boolean
  position: number
  config: Record<string, unknown>
}

export type Workspace = {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string
  color: ColorKey
  template: string
  taskPrefix: string
  settings: WorkspaceSettings
  protected: boolean
  archivedAt: string | null
  createdAt: string
  /** The signed-in user's role here. */
  role: Role
  modules: WorkspaceModule[]
  prefs: { pinned: boolean; position: number; hiddenModules: string[]; lastOpenedAt: string | null }
}

export type Profile = {
  id: string
  fullName: string | null
  avatarUrl: string | null
  timezone: string
  locale: string
  preferences: ProfilePreferences
  onboarding: { completedAt?: string; tour?: { completedAt?: string; dismissedAt?: string } }
}

export type ProfilePreferences = {
  reminders?: {
    /** HH:MM local time for the daily digest, or null to switch it off. */
    digestTime?: string | null
    meetingLeadMinutes?: number
    dueLeadMinutes?: number
  }
}

export type Person = {
  id: string
  fullName: string | null
  email?: string
  avatarUrl: string | null
}

export type Member = Person & { role: Role; joinedAt: string }

export type Team = {
  id: string
  workspaceId: string
  name: string
  description: string | null
  color: ColorKey
  memberIds: string[]
}

export type Invitation = {
  id: string
  workspaceId: string
  email: string
  role: Role
  expiresAt: string
  acceptedAt: string | null
  createdAt: string
}

export type Notification = {
  id: string
  workspaceId: string | null
  kind: string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}
