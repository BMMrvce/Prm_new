/**
 * Help centre content, written for people who are not technical. Each article is plain
 * data (no HTML), rendered by help-centre.tsx and searched in the browser.
 * Module manifests point at these by slug (`help` in core/modules.ts).
 */

export type Block =
  | { p: string }
  | { h: string }
  | { list: string[] }
  | { steps: string[] }
  | { tip: string }
  | { warn: string }
  | { qa: [string, string][] }

export type Article = { slug: string; title: string; summary: string; category: string; keywords?: string; body: Block[] }

export const CATEGORIES = ['Getting started', 'Everyday work', 'Personal modules', 'Working with others', 'Privacy & security', 'Make it yours', 'FAQ & troubleshooting']

export const ARTICLES: Article[] = [
  {
    slug: 'welcome',
    title: 'Welcome: how ಸKala² is organised',
    summary: 'Workspaces, modules and projects in two minutes.',
    category: 'Getting started',
    keywords: 'overview introduction basics concepts start',
    body: [
      { p: 'ಸKala² keeps each part of your working life separate but close at hand. Three ideas explain almost everything:' },
      {
        list: [
          'A workspace is one company, client or area of life, for example “Acme Corp”, “Freelance” or “Home”. What happens in one workspace stays in it.',
          'Modules are the tools a workspace uses: Tasks, Board, Notes, Whiteboard, Calendar, Time, Money, Habits and more. Each workspace switches on only what it needs.',
          'Projects group related tasks, notes and boards inside a workspace, and can be visible to everyone, one team, or only their members.',
        ],
      },
      { p: 'The sidebar always shows the workspace you are in. Switch with the selector at its top, or open “All workspaces” to see tasks, boards and calendars from every workspace together.' },
      { tip: 'Press ⌘K (Ctrl+K on Windows) anywhere to search everything or jump to any page.' },
    ],
  },
  {
    slug: 'first-workspace',
    title: 'Create and set up a workspace',
    summary: 'Start from a template, then rename, recolor and choose modules.',
    category: 'Getting started',
    keywords: 'new workspace create template company client personal',
    body: [
      { steps: ['Open the workspace selector at the top of the sidebar and choose “New workspace”.', 'Pick a starting template: Company, Client or freelance, Personal or Start empty.', 'Give it a name, a color and an icon so you can recognise it at a glance.', 'Tick the modules you want. You can change them at any time.', 'Optionally add a few sample items to explore, then select “Create workspace”.'] },
      { p: 'Everything about a workspace can be changed later in Settings → General: its name, description, icon, color, task ID prefix (for example ACME-12), currency and the first day of the week.' },
      { tip: 'Templates are only a starting point. Nothing is fixed: a “Company” workspace can track habits, and a “Personal” one can have a board.' },
    ],
  },
  {
    slug: 'modules',
    title: 'Choose the modules a workspace uses',
    summary: 'Switch modules on or off, reorder them, or hide them only for yourself.',
    category: 'Getting started',
    keywords: 'modules enable disable sidebar order plugins features',
    body: [
      { p: 'Open Settings → Modules. Owners and admins can switch modules on or off for everyone and change their order in the sidebar. Turning a module off only hides it; nothing is deleted, and switching it back on brings everything back.' },
      { p: 'Anyone can tick “Hide from my sidebar only” to tidy their own view without affecting other people.' },
      { p: 'Some modules have options. Money, for example, lets each workspace choose what it tracks: expenses, income, reimbursement claims, budgets, savings goals or recurring payments.' },
    ],
  },
  {
    slug: 'navigation',
    title: 'Find your way around',
    summary: 'Sidebar, workspace selector, search and keyboard shortcuts.',
    category: 'Getting started',
    keywords: 'shortcuts keyboard search command palette navigate sidebar',
    body: [
      { h: 'Keyboard shortcuts' },
      { list: ['⌘K or Ctrl+K, or / : search and jump anywhere', 'N : add a task in the current workspace', 'Esc : close a dialog or menu', 'On a board: Space picks up a card, the arrow keys move it, Space drops it'] },
      { h: 'Search' },
      { p: 'Search looks through task titles and descriptions, note text, project names and whiteboard titles. Use the switch in the search box to look in this workspace only or in all of them. Only things you are allowed to see ever appear.' },
      { h: 'On a phone' },
      { p: 'Tap the menu button at the top left to open the sidebar. You can install ಸKala² on your home screen from the browser’s share or menu button.' },
    ],
  },
  {
    slug: 'all-workspaces',
    title: 'See everything across workspaces',
    summary: 'One view of every task, board and calendar.',
    category: 'Getting started',
    keywords: 'all workspaces overview combined cross',
    body: [
      { p: '“All workspaces” (in the selector and the sidebar) shows each workspace with its open, assigned and overdue counts, plus combined pages for tasks, boards and calendars.' },
      { p: 'On the combined board, columns are the common stages (Backlog, To do, In progress, Done). Dragging a card moves it to the matching column in its own workspace.' },
      { tip: 'Filter the combined lists by workspace, person, project, label or priority.' },
    ],
  },
  {
    slug: 'tasks',
    title: 'Tasks',
    summary: 'Add, organise and complete tasks, with subtasks, labels, comments and repeats.',
    category: 'Everyday work',
    keywords: 'task todo subtask label priority due repeat recurring comment assign estimate blocked dependency',
    body: [
      { p: 'Add a task with the “New task” button or by pressing N. Only a title is required; you can add a project, status, priority, due date, estimate and people.' },
      { p: 'The Tasks page groups open tasks by when they are due: Overdue, Today, Next 7 days, Later and No due date. Tick the circle to complete a task; an Undo button appears for a few seconds.' },
      { h: 'Inside a task' },
      { list: ['Description with formatting, links and lists', 'Subtasks, each a full task of its own', 'Labels you create on the spot', '“Repeats”: completing a repeating task schedules the next one automatically', '“Blocked by”: link tasks that must be finished first', 'Comments and a history of every change'] },
      { tip: 'Every task has a link. Use “Copy link” to send it to a colleague; they will only see it if they have access.' },
    ],
  },
  {
    slug: 'board',
    title: 'Board (Kanban)',
    summary: 'Move tasks through your own columns by dragging.',
    category: 'Everyday work',
    keywords: 'kanban board columns drag drop status workflow',
    body: [
      { p: 'The board shows the same tasks as the Tasks page, arranged in columns. Drag a card to another column to change its status, or within a column to change its order.' },
      { p: 'Columns are yours to define in Settings → Board & labels: rename them, change colors, reorder, add or delete. Each column has a kind (Backlog, To do, In progress, Done or Cancelled), which is how completion and the combined board work.' },
      { tip: 'Keyboard users: focus a card, press Space, use the arrow keys, then press Space again.' },
    ],
  },
  {
    slug: 'projects',
    title: 'Projects',
    summary: 'Group work and decide who can see it.',
    category: 'Everyday work',
    keywords: 'project private team visibility members progress',
    body: [
      { p: 'Create a project from the Projects page. Each project has its own board and task list, and shows progress based on finished tasks.' },
      { h: 'Who can see a project' },
      { list: ['Whole workspace: every member (guests only if added to the project).', 'One team: members of that team, plus project members and admins.', 'Only project members: private; also visible to workspace owners and admins.'] },
      { warn: 'Deleting a project deletes its tasks. Notes and whiteboards filed under it are kept.' },
    ],
  },
  {
    slug: 'calendar',
    title: 'Calendar and meetings',
    summary: 'Meetings and due dates by day, week or month.',
    category: 'Everyday work',
    keywords: 'calendar meeting schedule event day week month',
    body: [
      { p: 'The calendar shows meetings and task due dates. Switch between day, week and month, and click any item to open it.' },
      { p: 'Meeting types (for example Client call or Internal) are your own: create them in Settings → Categories, each with its own color.' },
      { tip: 'Each meeting can open its own linked note for minutes.' },
    ],
  },
  {
    slug: 'notes',
    title: 'Notes',
    summary: 'Pages with a slash-command editor, sharing and protection.',
    category: 'Everyday work',
    keywords: 'notes editor slash commands share collaborate protect private documents',
    body: [
      { p: 'Type / in a note for headings, lists, to-dos, quotes, code, callouts and colors. Markdown shortcuts such as “# ”, “- ” and “[] ” work too.' },
      { p: 'Notes are private until you share them with workspace members, who can then edit with you live; you see where they are typing.' },
      { p: 'Protected notes are hidden until you unlock with your PIN, and cannot be shared. See “Protect sensitive work”.' },
    ],
  },
  {
    slug: 'whiteboard',
    title: 'Whiteboard',
    summary: 'Sketch and diagram together on an endless canvas.',
    category: 'Everyday work',
    keywords: 'whiteboard draw sketch diagram shapes arrows sticky collaborate export',
    body: [
      { p: 'Create a board from the Whiteboard page. Draw freehand, add shapes, arrows, text, sticky notes and images; move, resize and edit anything; zoom and pan freely.' },
      { p: 'Boards save automatically. Everyone with access who opens the same board edits it live with you, and you can see their cursors.' },
      { p: 'Use the menu to export a board as PNG or SVG, or file it under a project.' },
    ],
  },
  {
    slug: 'time',
    title: 'Time tracking',
    summary: 'Timers, logged hours and estimates against actual time.',
    category: 'Everyday work',
    keywords: 'time tracking timer hours log estimate report',
    body: [
      { p: 'Start a timer from a task, or log time by hand. Only one timer runs at a time across all your workspaces.' },
      { p: 'The Time page shows where your hours went by day, project and task, and compares them with estimates.' },
    ],
  },
  {
    slug: 'project-documents',
    title: 'Project documents and OneDrive',
    summary: 'Link a project’s OneDrive folder and pin its key files.',
    category: 'Everyday work',
    keywords: 'onedrive sharepoint google drive dropbox documents files folder link project',
    body: [
      { p: 'Each project has a Documents tab. Link the cloud folder where the project’s files live, and pin the documents you open most.' },
      { steps: ['In OneDrive, create a folder for the project.', 'Select the folder, choose Share, decide who can open it, then Copy link.', 'In the project, open Documents and paste the link under Project folder.', 'Use “Pin a document” for individual files, such as the brief or contract.'] },
      { tip: 'Files stay in OneDrive with OneDrive’s own sharing settings. The app only keeps the link, so people still need access in OneDrive to open them.' },
      { p: 'SharePoint, Google Drive and Dropbox links work the same way. Only https links are accepted.' },
    ],
  },
  {
    slug: 'work-log',
    title: 'Work log',
    summary: 'A day-by-day diary of what you worked on.',
    category: 'Everyday work',
    keywords: 'work log diary journal daily done timesheet standup calendar',
    body: [
      { p: 'Open Work log, pick a day on the calendar and write what you did. Add the time it took and a project if you like. Days with entries are highlighted, so you can look back at any day.' },
      { p: 'Under “Also on this day” you see what you did in the app that day (tasks created, moved and commented on), so your log fills in even when you forget to write.' },
      { tip: 'Add the Work log widget to your dashboard to note things down without leaving Home. Press Ctrl+Enter (⌘+Enter on Mac) to save an entry.' },
      { p: 'Your log is private: other members of the workspace cannot see it.' },
    ],
  },
  {
    slug: 'money',
    title: 'Money: expenses, income and claims',
    summary: 'Track spending, submit reimbursement claims, set budgets and savings goals.',
    category: 'Everyday work',
    keywords: 'money expense income reimbursement claim budget savings recurring finance currency',
    body: [
      { p: 'What Money shows depends on the options chosen for the workspace in Settings → Modules.' },
      { list: ['Expenses and income: your own records, visible only to you.', 'Reimbursement claims: submit costs to be paid back; workspace admins approve, reject or mark them paid. You cannot approve your own claim.', 'Budgets, savings goals and recurring payments: for planning personal finances.'] },
      { p: 'The currency is set per workspace in Settings → General. Categories are your own, in Settings → Categories.' },
    ],
  },
  { slug: 'habits', title: 'Habits', summary: 'Build routines and keep streaks.', category: 'Personal modules', keywords: 'habit streak routine daily', body: [{ p: 'Add habits that are daily, on chosen weekdays, or a number of times a week. Tick them off each day; skipped days can be marked as skipped rather than missed.' }] },
  { slug: 'reading', title: 'Reading', summary: 'Your library, reading sessions and takeaways.', category: 'Personal modules', keywords: 'books reading library pages', body: [{ p: 'Keep a list of books you plan to read, are reading and have finished. Log sessions with pages and minutes, and capture what you learned.' }] },
  { slug: 'learning', title: 'Learning', summary: 'Topics you are learning and how far you are.', category: 'Personal modules', keywords: 'learning study topics skills', body: [{ p: 'List topics with resources and notes, and move them from Not started to Learning, Practised and Mastered.' }] },
  { slug: 'goals', title: 'Goals', summary: 'Goals with milestones.', category: 'Personal modules', keywords: 'goals milestones okr targets', body: [{ p: 'Break each goal into milestones. Progress is the share of milestones completed.' }] },
  {
    slug: 'inbox',
    title: 'Inbox',
    summary: 'Connect a mailbox to a workspace.',
    category: 'Everyday work',
    keywords: 'mail email inbox gmail imap connect',
    body: [
      { p: 'Each workspace can have its own mailbox: connect Gmail with Google sign-in, or any mailbox that supports IMAP and SMTP with its address and password.' },
      { p: 'Mailbox passwords and sign-in tokens are encrypted on the server and never sent to the browser.' },
    ],
  },
  {
    slug: 'members',
    title: 'Invite people and choose their role',
    summary: 'Owners, admins, members and guests.',
    category: 'Working with others',
    keywords: 'invite member role admin guest owner permissions share',
    body: [
      { steps: ['Open Settings → Members.', 'Enter their email address and choose a role.', 'Send them the invitation link that appears. If they already have an account, they also see the invitation in the app.'] },
      { p: 'They must sign in with that exact email address, and confirm it, to join. Invitations expire after 14 days.' },
      { h: 'Roles' },
      { list: ['Owner: everything, including deleting the workspace.', 'Admin: settings, members, every project and reviewing claims.', 'Member: creates and edits work; sees projects that are not private.', 'Guest: sees only projects they are added to, and can comment.'] },
    ],
  },
  { slug: 'teams', title: 'Teams', summary: 'Group people and share projects with a team.', category: 'Working with others', keywords: 'team group department', body: [{ p: 'In Settings → Teams, create groups such as Design or Finance. A project can then be visible to one team only.' }] },
  {
    slug: 'notifications',
    title: 'Notifications and reminders',
    summary: 'The bell, push reminders and the daily digest.',
    category: 'Working with others',
    keywords: 'notifications bell reminders push digest',
    body: [
      { p: 'The bell shows when you are assigned a task, someone comments on your task, a note is shared with you, or you are invited to a workspace.' },
      { p: 'Choose reminder timing and the daily digest in Account → Preferences.' },
    ],
  },
  {
    slug: 'vault',
    title: 'Protect sensitive work with a PIN',
    summary: 'Lock workspaces and notes behind a PIN, with automatic locking.',
    category: 'Privacy & security',
    keywords: 'pin lock unlock protect private vault security passphrase auto lock',
    body: [
      { p: 'Some work should stay hidden even if someone uses your unlocked computer. The privacy vault protects whole workspaces and individual notes with a PIN or passphrase that is separate from your password.' },
      { steps: ['Go to Account → Security & privacy and choose “Set up a PIN”. You confirm with your account password.', 'Protect a workspace in its Settings → Privacy & danger, or a note from the note’s menu.', 'Unlock with the lock button in the header when you need them.'] },
      { h: 'How it keeps things private' },
      { list: ['While locked, the server itself refuses to send protected items to your browser, so they cannot be read from the page.', 'Unlocking works for one browser only, and locks again after the inactivity time you choose.', 'Five wrong PINs lock the vault for 15 minutes, longer after repeated attempts. Every unlock and failed attempt is listed in your security activity.'] },
      { warn: 'Every member of a protected workspace needs their own PIN to open it.' },
    ],
  },
  {
    slug: 'account-security',
    title: 'Keep your account safe',
    summary: 'Password, signing out everywhere and your security activity.',
    category: 'Privacy & security',
    keywords: 'password sign out security account email',
    body: [
      { list: ['Use a long, unique password (at least 10 characters).', 'Change it in Account → Security & privacy.', '“Sign out on every device” ends all other sessions immediately.', 'Recent security activity shows vault unlocks and failed PIN attempts with the network address they came from.'] },
    ],
  },
  {
    slug: 'dashboard',
    title: 'Customize your home dashboard',
    summary: 'Add, remove, move and resize widgets.',
    category: 'Make it yours',
    keywords: 'dashboard widgets customize layout home template reset',
    body: [
      { steps: ['On a workspace’s Home, select “Customize”.', 'Drag widgets by their top edge and resize them from the bottom-right corner.', 'Use “Add widget” for more widgets or a ready-made template.', 'Select “Done”. Your layout is saved for you only, separately in each workspace.'] },
      { p: '“Reset” returns to the default layout. On phones, widgets are stacked in the same order.' },
    ],
  },
  { slug: 'categories', title: 'Your own categories', summary: 'Meeting types, expense categories and more.', category: 'Make it yours', keywords: 'categories types custom lists', body: [{ p: 'Every list of categories is yours to edit in Settings → Categories, per workspace: meeting types, expense and income categories, habit, learning, goal and book categories. Use “Use suggestions” to start quickly.' }] },
  { slug: 'appearance', title: 'Light and dark mode', summary: 'Choose a theme.', category: 'Make it yours', keywords: 'theme dark light appearance', body: [{ p: 'Switch between light and dark with the button in the header, or choose “System” in Account → Preferences to follow your device.' }] },
  {
    slug: 'faq',
    title: 'Frequently asked questions',
    summary: 'Short answers to common questions.',
    category: 'FAQ & troubleshooting',
    keywords: 'faq questions',
    body: [
      {
        qa: [
          ['Can other workspace members see my notes?', 'No. Notes are private unless you share them.'],
          ['Can admins see my personal expenses?', 'No. Expenses, income, budgets and habits are visible only to you. Admins only see reimbursement claims, so they can review them.'],
          ['What happens when I turn a module off?', 'It disappears from the sidebar for everyone. Its data is kept and returns when the module is switched back on.'],
          ['Can I move a task to another workspace?', 'Not yet. Create it again in the other workspace and delete the original.'],
          ['Is my data backed up?', 'Your data lives in your own Supabase project. Turn on backups in its dashboard (included in paid plans) or export regularly.'],
        ],
      },
    ],
  },
  {
    slug: 'troubleshooting',
    title: 'Troubleshooting',
    summary: 'When something does not look right.',
    category: 'FAQ & troubleshooting',
    keywords: 'problem error not working missing help fix',
    body: [
      {
        qa: [
          ['I cannot see a project or task someone mentioned.', 'It may be private or limited to a team. Ask a workspace admin to add you to the project or the team.'],
          ['My invitation link says it is invalid.', 'Sign in with the exact email address the invitation was sent to and confirm that address first. Links expire after 14 days; ask for a new one.'],
          ['I never received the confirmation email.', 'Check spam. The person running this installation may need to set up their own email sender (see the setup guide).'],
          ['A protected workspace shows a lock even though I unlocked it.', 'Unlocking applies to one browser and expires after inactivity. Unlock again; to change the timing go to Account → Security & privacy.'],
          ['It says “too many wrong PINs”.', 'Wait until the time shown. If you forgot your PIN, sign in normally and set a new one in Account → Security & privacy using your password.'],
          ['Changes from colleagues do not appear.', 'They normally appear within a second. If your connection dropped, reload the page.'],
          ['Reminders do not arrive.', 'Turn them on from the bell on each device. On iPhone and iPad, add ಸKala² to the Home Screen first.'],
        ],
      },
    ],
  },
]

export function articleBySlug(slug: string) {
  return ARTICLES.find((article) => article.slug === slug)
}

function blockText(block: Block): string {
  if ('p' in block) return block.p
  if ('h' in block) return block.h
  if ('tip' in block) return block.tip
  if ('warn' in block) return block.warn
  if ('list' in block) return block.list.join(' ')
  if ('steps' in block) return block.steps.join(' ')
  return block.qa.flat().join(' ')
}

/** Ranks articles for a query: title matches first, then summary/keywords, then body. */
export function searchArticles(query: string) {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word.length > 1)
  if (!words.length) return []
  return ARTICLES.map((article) => {
    const title = article.title.toLowerCase()
    const meta = `${article.summary} ${article.keywords ?? ''}`.toLowerCase()
    const body = article.body.map(blockText).join(' ').toLowerCase()
    let score = 0
    for (const word of words) {
      if (title.includes(word)) score += 6
      if (meta.includes(word)) score += 3
      if (body.includes(word)) score += 1
    }
    return { article, score }
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.article)
}
