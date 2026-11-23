'use client'

import { must, supabase } from '@/lib/supabase/client'

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString()

/**
 * A small, realistic starter set so a new workspace is not empty: one project with a
 * handful of tasks across the board's columns, a subtask and a welcome note. Everything
 * is ordinary data the user can edit or delete.
 */
export async function seedSampleData(workspaceId: string, userId: string, modules: string[]) {
  const db = supabase()
  const statuses = must(await db.from('task_statuses').select('id, category').eq('workspace_id', workspaceId))
  const status = (category: string) => statuses.find((entry) => entry.category === category)?.id ?? null

  let projectId: string | null = null
  if (modules.includes('projects')) {
    projectId = must(
      await db
        .from('projects')
        .insert({
          workspace_id: workspaceId,
          name: 'Getting started',
          slug: 'getting-started',
          description: 'A sample project to explore. Rename it or delete it whenever you like.',
          color: 'teal',
          created_by: userId,
        })
        .select('id')
        .single(),
    ).id as string
  }

  if (modules.includes('tasks') || modules.includes('board')) {
    const tasks = [
      { title: 'Explore the board: drag this card to “In progress”', status: 'todo', priority: 'medium', due: 1 },
      { title: 'Invite a teammate from Settings → Members', status: 'backlog', priority: 'low', due: null },
      { title: 'Turn on the modules you need in Settings → Modules', status: 'in_progress', priority: 'high', due: 0 },
      { title: 'Set up a PIN to protect private work', status: 'todo', priority: 'none', due: 3 },
      { title: 'Create your first workspace', status: 'done', priority: 'none', due: null },
    ]
    const rows = must(
      await db
        .from('tasks')
        .insert(
          tasks.map((task, index) => ({
            workspace_id: workspaceId,
            project_id: projectId,
            title: task.title,
            status_id: status(task.status),
            priority: task.priority,
            due_at: task.due === null ? null : day(task.due),
            creator_id: userId,
            position: (index + 1) * 1024,
          })),
        )
        .select('id, title'),
    )
    const parent = rows.find((row) => row.title.startsWith('Explore'))
    if (parent) {
      must(
        await db.from('tasks').insert([
          { workspace_id: workspaceId, project_id: projectId, parent_id: parent.id, title: 'Open a task to see subtasks and comments', creator_id: userId, status_id: status('todo') },
        ]),
      )
    }
  }

  if (modules.includes('notes')) {
    must(
      await db.from('notes').insert({
        workspace_id: workspaceId,
        user_id: userId,
        project_id: projectId,
        title: 'Welcome 👋',
        content:
          '<h2>Welcome to your workspace</h2><p>Notes support headings, lists, to-dos and more: type <code>/</code> for commands.</p><ul data-type="todo"><li data-checked="false">Write your first note</li><li data-checked="false">Share a note with a teammate</li></ul><p>Sensitive notes can be protected with your PIN.</p>',
        pinned: true,
      }),
    )
  }
}
