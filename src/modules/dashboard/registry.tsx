'use client'

import type { ComponentType } from 'react'
import { isModuleEnabled } from '@/core/modules'
import type { Workspace } from '@/core/types'
import type { DashboardLayout, WidgetInstance } from './queries'
import { GoalsWidget } from '@/modules/goals/goals-widget'
import { HabitsWidget } from '@/modules/habits/habits-widget'
import { MeetingsWidget } from '@/modules/calendar/meetings-widget'
import { TimerWidget } from '@/modules/time/timer-widget'
import { MailWidget } from '@/modules/inbox/mail-widget'
import { WatchLaterWidget } from '@/modules/integrations/watch-later-widget'
import { MoneyWidget } from '@/modules/money/money-widget'
import { WorkLogWidget } from '@/modules/worklog/widget'
import { RecentBoardsWidget, RecentNotesWidget } from './widgets/content-widgets'
import { ActivityWidget, DayNoteWidget, GreetingWidget, PlanWidget, ShortcutsWidget } from './widgets/day-widgets'
import { MyTasksWidget, OverdueWidget, ProjectsWidget, TaskStatsWidget } from './widgets/task-widgets'

export type WidgetProps = { workspace: Workspace | null; scope: string | 'all'; config: Record<string, unknown> }

export type WidgetDefinition = {
  type: string
  title: string
  description: string
  component: ComponentType<WidgetProps>
  /** Grid size in 12 columns × 40px rows. */
  size: { w: number; h: number; minW?: number; minH?: number }
  /** Only offered when this module is on (workspace dashboards). */
  module?: string
  /** Where it can be placed. */
  scopes: ('workspace' | 'all')[]
}

/**
 * Every widget a dashboard can show. Modules register theirs here, so the add-widget
 * gallery, templates and the default layout all pick them up automatically.
 */
const WIDGETS: WidgetDefinition[] = [
  { type: 'greeting', title: 'Greeting', description: 'Good morning, the date and where you are.', component: GreetingWidget, size: { w: 12, h: 2, minW: 4, minH: 2 }, scopes: ['workspace', 'all'] },
  { type: 'my-tasks', title: 'My tasks', description: 'Your open tasks, soonest first.', component: MyTasksWidget, size: { w: 8, h: 8, minW: 3, minH: 4 }, module: 'tasks', scopes: ['workspace', 'all'] },
  { type: 'overdue', title: 'Due today & overdue', description: 'What needs attention now.', component: OverdueWidget, size: { w: 4, h: 8, minW: 3, minH: 4 }, module: 'tasks', scopes: ['workspace', 'all'] },
  { type: 'task-stats', title: 'Work by stage', description: 'How many tasks sit in each stage.', component: TaskStatsWidget, size: { w: 4, h: 6, minW: 3, minH: 5 }, module: 'tasks', scopes: ['workspace', 'all'] },
  { type: 'projects', title: 'Projects', description: 'Active projects and their progress.', component: ProjectsWidget, size: { w: 4, h: 7, minW: 3, minH: 4 }, module: 'projects', scopes: ['workspace'] },
  { type: 'work-log', title: 'Work log', description: 'What you worked on today, with a quick add box.', component: WorkLogWidget, size: { w: 8, h: 7, minW: 4, minH: 4 }, module: 'worklog', scopes: ['workspace'] },
  { type: 'plan', title: "Today's plan", description: 'A short list of priorities for today.', component: PlanWidget, size: { w: 4, h: 8, minW: 3, minH: 4 }, scopes: ['workspace'] },
  { type: 'day-note', title: 'Day note', description: 'A scratch pad for today, saved as you type.', component: DayNoteWidget, size: { w: 4, h: 6, minW: 3, minH: 4 }, scopes: ['workspace'] },
  { type: 'activity', title: 'Activity', description: 'Recent changes by everyone.', component: ActivityWidget, size: { w: 4, h: 8, minW: 3, minH: 4 }, module: 'tasks', scopes: ['workspace', 'all'] },
  { type: 'notes', title: 'Notes', description: 'Pinned and recently edited notes.', component: RecentNotesWidget, size: { w: 4, h: 6, minW: 3, minH: 4 }, module: 'notes', scopes: ['workspace'] },
  { type: 'boards', title: 'Whiteboards', description: 'Recently edited boards.', component: RecentBoardsWidget, size: { w: 4, h: 6, minW: 3, minH: 4 }, module: 'whiteboard', scopes: ['workspace'] },
  { type: 'money', title: 'Money', description: 'This month’s spending against your budget, and claims waiting on someone.', component: MoneyWidget, size: { w: 4, h: 6, minW: 3, minH: 4 }, module: 'money', scopes: ['workspace'] },
  { type: 'habits', title: "Today's habits", description: 'Check off today’s habits in one click.', component: HabitsWidget, size: { w: 4, h: 7, minW: 3, minH: 4 }, module: 'habits', scopes: ['workspace'] },
  { type: 'goals', title: 'Goals', description: 'Progress of your active goals.', component: GoalsWidget, size: { w: 4, h: 7, minW: 3, minH: 4 }, module: 'goals', scopes: ['workspace'] },
  { type: 'meetings', title: 'Meetings', description: 'Today’s and the next week’s meetings, with join links.', component: MeetingsWidget, size: { w: 4, h: 7, minW: 3, minH: 4 }, module: 'calendar', scopes: ['workspace', 'all'] },
  { type: 'timer', title: 'Time tracker', description: 'Your running timer and today’s tracked time.', component: TimerWidget, size: { w: 4, h: 6, minW: 3, minH: 5 }, module: 'time', scopes: ['workspace', 'all'] },
  { type: 'mail', title: 'Mail', description: 'Latest messages in your mailbox.', component: MailWidget, size: { w: 4, h: 7, minW: 3, minH: 4 }, module: 'inbox', scopes: ['workspace'] },
  { type: 'watch-later', title: 'Watch later', description: 'Videos from your chosen YouTube playlist.', component: WatchLaterWidget, size: { w: 4, h: 7, minW: 3, minH: 4 }, scopes: ['workspace', 'all'] },
  { type: 'shortcuts', title: 'Jump to', description: 'Quick links to this workspace’s modules.', component: ShortcutsWidget, size: { w: 4, h: 5, minW: 3, minH: 3 }, scopes: ['workspace'] },
]

const BY_TYPE = new Map(WIDGETS.map((widget) => [widget.type, widget]))

export function registerWidget(widget: WidgetDefinition) {
  if (!BY_TYPE.has(widget.type)) {
    WIDGETS.push(widget)
    BY_TYPE.set(widget.type, widget)
  }
}

export function widgetDefinition(type: string) {
  return BY_TYPE.get(type)
}

/** Widgets that make sense here (scope and modules switched on). */
export function availableWidgets(workspace: Workspace | null) {
  return WIDGETS.filter(
    (widget) => widget.scopes.includes(workspace ? 'workspace' : 'all') && (!workspace || !widget.module || isModuleEnabled(workspace, widget.module)),
  )
}

/**
 * Packs widgets left to right, top to bottom, into 12 columns. The last widget in each
 * row stretches to the edge so rows never end in a gap.
 */
export function pack(types: string[]): WidgetInstance[] {
  const result: WidgetInstance[] = []
  let x = 0
  let y = 0
  let rowHeight = 0
  const closeRow = () => {
    const last = result.at(-1)
    if (last && last.y === y) last.w = 12 - last.x
  }
  for (const type of types) {
    const definition = BY_TYPE.get(type)
    if (!definition) continue
    const { w, h } = definition.size
    if (x + w > 12) {
      closeRow()
      x = 0
      y += rowHeight
      rowHeight = 0
    }
    result.push({ id: `${type}-${result.length}`, type, x, y, w, h })
    x += w
    rowHeight = Math.max(rowHeight, h)
  }
  closeRow()
  return result
}

export type DashboardTemplate = { id: string; label: string; description: string; widgets: string[] }

export const TEMPLATES: DashboardTemplate[] = [
  { id: 'focus', label: 'Focus', description: 'Your tasks, today’s plan and your work log.', widgets: ['greeting', 'my-tasks', 'plan', 'work-log', 'meetings'] },
  { id: 'overview', label: 'Team overview', description: 'Stages, projects and activity.', widgets: ['greeting', 'task-stats', 'projects', 'activity', 'overdue', 'my-tasks'] },
  { id: 'minimal', label: 'Minimal', description: 'Just what is due.', widgets: ['greeting', 'overdue', 'shortcuts'] },
]

/**
 * A calm starting layout: the few widgets used every day. Everything else is one click
 * away under Customize → Add widget.
 */
export function defaultLayout(workspace: Workspace | null): DashboardLayout {
  const available = new Set(availableWidgets(workspace).map((widget) => widget.type))
  const wanted = workspace
    ? ['greeting', 'my-tasks', 'plan', 'work-log', 'meetings']
    : ['greeting', 'my-tasks', 'overdue', 'task-stats', 'activity']
  return { version: 1, widgets: pack(wanted.filter((type) => available.has(type))) }
}
