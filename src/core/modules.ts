import type { Workspace } from './types'

/**
 * The module registry: every feature a workspace can switch on. The sidebar, settings,
 * command palette, dashboard widget list and help centre all read from here, so adding a
 * module means adding an entry below plus its pages under
 * `src/app/(app)/w/[workspace]/<segment>/`. Nothing else in the core changes.
 *
 * Which modules a workspace uses is stored in `workspace_modules`; templates are only
 * starting presets the user can change at any time.
 */

export type ModuleGroup = 'work' | 'plan' | 'growth' | 'money'

export type ModuleManifest = {
  id: string
  label: string
  /** One line for settings and onboarding. */
  description: string
  /** Lucide icon name (see src/ui/icon.tsx). */
  icon: string
  /** URL segment under /w/<workspace>/. */
  segment: string
  group: ModuleGroup
  /** Help centre article slug. */
  help: string
  /** Settings that can be changed per workspace (Settings → Modules). */
  options?: ModuleOption[]
}

export type ModuleOption = {
  key: string
  label: string
  description?: string
  type: 'toggle' | 'multi'
  choices?: { value: string; label: string }[]
  default: boolean | string[]
}

export const MODULE_GROUPS: Record<ModuleGroup, string> = {
  work: 'Work',
  plan: 'Plan',
  growth: 'Growth',
  money: 'Money',
}

export const MODULES: ModuleManifest[] = [
  {
    id: 'tasks',
    label: 'Tasks',
    description: 'Your to-dos grouped by due date, with subtasks, labels and comments.',
    icon: 'check-square',
    segment: 'tasks',
    group: 'work',
    help: 'tasks',
  },
  {
    id: 'board',
    label: 'Board',
    description: 'Drag tasks across your own Kanban columns.',
    icon: 'kanban',
    segment: 'board',
    group: 'work',
    help: 'board',
  },
  {
    id: 'projects',
    label: 'Projects',
    description: 'Group tasks, notes and boards into projects with members and teams.',
    icon: 'folder-kanban',
    segment: 'projects',
    group: 'work',
    help: 'projects',
  },
  {
    id: 'inbox',
    label: 'Inbox',
    description: 'Read and send mail from the mailbox you connect to this workspace.',
    icon: 'inbox',
    segment: 'inbox',
    group: 'work',
    help: 'inbox',
  },
  {
    id: 'worklog',
    label: 'Work log',
    description: 'A diary of what you worked on each day, on a calendar.',
    icon: 'clipboard-list',
    segment: 'work-log',
    group: 'work',
    help: 'work-log',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    description: 'Meetings and due dates by day, week or month.',
    icon: 'calendar',
    segment: 'calendar',
    group: 'plan',
    help: 'calendar',
  },
  {
    id: 'notes',
    label: 'Notes',
    description: 'Pages with a slash-command editor, shared editing and protected notes.',
    icon: 'notebook-pen',
    segment: 'notes',
    group: 'plan',
    help: 'notes',
  },
  {
    id: 'whiteboard',
    label: 'Whiteboard',
    description: 'Sketch, diagram and plan together on an infinite canvas.',
    icon: 'pen-tool',
    segment: 'whiteboard',
    group: 'plan',
    help: 'whiteboard',
  },
  {
    id: 'time',
    label: 'Time',
    description: 'Timers, logged hours and estimates against actuals.',
    icon: 'timer',
    segment: 'time',
    group: 'plan',
    help: 'time',
  },
  {
    id: 'money',
    label: 'Money',
    description: 'Expenses, income, reimbursement claims, budgets and savings.',
    icon: 'wallet',
    segment: 'money',
    group: 'money',
    help: 'money',
    options: [
      {
        key: 'features',
        label: 'Show',
        description: 'Pick what this workspace tracks.',
        type: 'multi',
        choices: [
          { value: 'expenses', label: 'Expenses' },
          { value: 'income', label: 'Income' },
          { value: 'claims', label: 'Reimbursement claims' },
          { value: 'budgets', label: 'Budgets' },
          { value: 'savings', label: 'Savings goals' },
          { value: 'recurring', label: 'Recurring payments' },
        ],
        default: ['expenses', 'income'],
      },
    ],
  },
  {
    id: 'habits',
    label: 'Habits',
    description: 'Daily routines, streaks and consistency.',
    icon: 'repeat',
    segment: 'habits',
    group: 'growth',
    help: 'habits',
  },
  {
    id: 'reading',
    label: 'Reading',
    description: 'Your library, reading sessions and takeaways.',
    icon: 'book-open',
    segment: 'reading',
    group: 'growth',
    help: 'reading',
  },
  {
    id: 'learning',
    label: 'Learning',
    description: 'Topics you are learning, with resources and progress.',
    icon: 'graduation-cap',
    segment: 'learning',
    group: 'growth',
    help: 'learning',
  },
  {
    id: 'goals',
    label: 'Goals',
    description: 'Goals with milestones and progress.',
    icon: 'target',
    segment: 'goals',
    group: 'growth',
    help: 'goals',
  },
]

const BY_ID = new Map(MODULES.map((manifest) => [manifest.id, manifest]))
const BY_SEGMENT = new Map(MODULES.map((manifest) => [manifest.segment, manifest]))

export function moduleById(id: string) {
  return BY_ID.get(id)
}

export function moduleBySegment(segment: string) {
  return BY_SEGMENT.get(segment)
}

/** Modules switched on for a workspace, in the workspace's order. */
export function enabledModules(workspace: Pick<Workspace, 'modules'>) {
  return workspace.modules
    .filter((entry) => entry.enabled && BY_ID.has(entry.moduleId))
    .sort((a, b) => a.position - b.position)
    .map((entry) => BY_ID.get(entry.moduleId)!)
}

/** Enabled modules minus the ones this person hid from their own sidebar. */
export function visibleModules(workspace: Pick<Workspace, 'modules' | 'prefs'>) {
  const hidden = new Set(workspace.prefs.hiddenModules)
  return enabledModules(workspace).filter((manifest) => !hidden.has(manifest.id))
}

export function isModuleEnabled(workspace: Pick<Workspace, 'modules'>, id: string) {
  return workspace.modules.some((entry) => entry.moduleId === id && entry.enabled)
}

/** A module's option value for a workspace, falling back to the option's default. */
export function moduleOption<T extends boolean | string[]>(
  workspace: Pick<Workspace, 'modules'>,
  moduleId: string,
  key: string,
): T {
  const option = BY_ID.get(moduleId)?.options?.find((entry) => entry.key === key)
  const stored = workspace.modules.find((entry) => entry.moduleId === moduleId)?.config[key]
  return (stored ?? option?.default) as T
}

// ── Templates: starting presets for a new workspace ─────────────────────────────────

export type WorkspaceTemplate = {
  id: string
  label: string
  description: string
  icon: string
  color: string
  modules: string[]
  moduleConfig?: Record<string, Record<string, unknown>>
}

export const TEMPLATES: WorkspaceTemplate[] = [
  {
    id: 'company',
    label: 'Company',
    description: 'A company or employer: projects, board, meetings, mail, time and claims.',
    icon: 'building-2',
    color: 'indigo',
    modules: ['tasks', 'board', 'projects', 'worklog', 'calendar', 'notes', 'whiteboard', 'inbox', 'time', 'money'],
    moduleConfig: { money: { features: ['claims'] } },
  },
  {
    id: 'client',
    label: 'Client or freelance',
    description: 'Work for a client: projects, time tracking, income and expenses.',
    icon: 'briefcase',
    color: 'teal',
    modules: ['tasks', 'board', 'projects', 'worklog', 'calendar', 'notes', 'inbox', 'time', 'money'],
    moduleConfig: { money: { features: ['income', 'expenses'] } },
  },
  {
    id: 'personal',
    label: 'Personal',
    description: 'Your own life: tasks, habits, reading, learning, goals and finances.',
    icon: 'home',
    color: 'violet',
    modules: ['tasks', 'calendar', 'notes', 'habits', 'reading', 'learning', 'goals', 'money'],
    moduleConfig: { money: { features: ['expenses', 'income', 'budgets', 'savings', 'recurring'] } },
  },
  {
    id: 'blank',
    label: 'Start empty',
    description: 'Just tasks and notes. Add more modules whenever you need them.',
    icon: 'sparkles',
    color: 'slate',
    modules: ['tasks', 'notes'],
  },
]

export function templateById(id: string) {
  return TEMPLATES.find((template) => template.id === id)
}
