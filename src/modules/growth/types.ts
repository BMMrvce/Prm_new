import type { ColorKey } from '@/core/types'

/**
 * Domain types for the personal growth modules (habits, focus, reading, learning, goals).
 * Rows are mapped to these in each module's `queries.ts`. Dates without a time
 * (`entry_date`, `session_date`, `target_date`) stay `YYYY-MM-DD` strings in local time.
 */

export type HabitFrequency = 'daily' | 'weekly' | 'weekdays'
export type HabitTargetKind = 'boolean' | 'duration' | 'quantity'
export type HabitEntryStatus = 'completed' | 'skipped'

export type Habit = {
  id: string
  workspaceId: string
  title: string
  categoryId: string | null
  frequency: HabitFrequency
  /** frequency = 'weekdays': 0 = Sunday … 6 = Saturday. */
  weekdays: number[]
  /** frequency = 'weekly': times per week. */
  targetPerWeek: number | null
  targetKind: HabitTargetKind
  targetValue: number | null
  targetUnit: string | null
  color: ColorKey
  position: number
  archivedAt: string | null
  createdAt: string
}

export type HabitEntry = {
  id: string
  habitId: string
  date: string
  status: HabitEntryStatus
  quantity: number | null
  note: string | null
}

export type FocusSession = {
  id: string
  date: string
  durationMinutes: number
  distractions: number
  tasksCompleted: number
  /** Self-rated, 1–5. */
  concentration: number
  note: string | null
  createdAt: string
}

export type BookStatus = 'planned' | 'reading' | 'completed'

export type Book = {
  id: string
  workspaceId: string
  title: string
  author: string
  status: BookStatus
  categoryId: string | null
  totalPages: number | null
  coverUrl: string | null
  rating: number | null
  learned: string | null
  interesting: string | null
  apply: string | null
  action: string | null
  pagesPerDayGoal: number | null
  startedAt: string | null
  completedAt: string | null
  position: number
  createdAt: string
}

export type ReadingSession = {
  id: string
  bookId: string
  date: string
  pages: number | null
  minutes: number | null
  chapter: string | null
  takeaway: string | null
  createdAt: string
}

export type LearningStatus = 'not_started' | 'learning' | 'practised' | 'mastered'

export type LearningTopic = {
  id: string
  workspaceId: string
  title: string
  categoryId: string | null
  status: LearningStatus
  resources: string | null
  notes: string | null
  position: number
  archivedAt: string | null
  updatedAt: string
}

export type GoalStatus = 'active' | 'completed' | 'abandoned'

export type Milestone = {
  id: string
  goalId: string
  title: string
  targetDate: string | null
  completedAt: string | null
  position: number
}

export type Goal = {
  id: string
  workspaceId: string
  title: string
  categoryId: string | null
  status: GoalStatus
  targetDate: string | null
  notes: string | null
  position: number
  completedAt: string | null
  createdAt: string
  milestones: Milestone[]
}
