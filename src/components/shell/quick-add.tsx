'use client'

import { useCallback, useMemo, useState } from 'react'
import type { Workspace } from '@/core/types'
import { canWrite } from '@/core/workspaces'
import { isModuleEnabled } from '@/core/modules'
import { NewTaskDialog } from '@/modules/tasks/new-task-dialog'

export type QuickAddController = { available: boolean; isOpen: boolean; open: () => void; close: () => void; workspace: Workspace | null }

/** "New task" from the sidebar button, the N key or the command palette. */
export function useQuickAdd(workspace: Workspace | null): QuickAddController {
  const [isOpen, setOpen] = useState(false)
  const available = Boolean(workspace && canWrite(workspace) && isModuleEnabled(workspace, 'tasks'))
  const open = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])
  return useMemo(() => ({ available, isOpen, open, close, workspace }), [available, isOpen, open, close, workspace])
}

export function QuickAddHost({ controller }: { controller: QuickAddController }) {
  if (!controller.isOpen || !controller.workspace) return null
  return <NewTaskDialog workspace={controller.workspace} onClose={controller.close} />
}
