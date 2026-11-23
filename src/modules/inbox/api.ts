'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MailContact, MailFolder, MailListResponse, MailMessage, MailQuery, MailStatus } from '@/lib/mail/types'

/**
 * Inbox data through the server's /api/mail/[workspaceId] routes (mail never touches
 * Supabase from the browser). Keys live under ['ws', workspaceId, 'mail', …] so workspace
 * invalidation and the vault's cache reset cover them.
 */
export const mailKeys = {
  all: (workspaceId: string) => ['ws', workspaceId, 'mail'] as const,
  status: (workspaceId: string) => ['ws', workspaceId, 'mail', 'status'] as const,
  list: (workspaceId: string, folder: MailFolder, query: MailQuery) => ['ws', workspaceId, 'mail', 'list', folder, query] as const,
  message: (workspaceId: string, folder: MailFolder, id: string) => ['ws', workspaceId, 'mail', 'message', folder, id] as const,
  contacts: (workspaceId: string) => ['ws', workspaceId, 'mail', 'contacts'] as const,
}

export async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) throw new Error(data.error || (response.status === 429 ? 'Too many requests. Wait a moment.' : 'Something went wrong. Try again.'))
  return data
}

const base = (workspaceId: string) => `/api/mail/${encodeURIComponent(workspaceId)}`

function send(method: string, url: string, body?: unknown) {
  return fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
}

export function useMailStatus(workspaceId: string) {
  return useQuery({
    queryKey: mailKeys.status(workspaceId),
    queryFn: async () => (await readJson<{ status: MailStatus }>(await fetch(`${base(workspaceId)}/connection`, { cache: 'no-store' }))).status,
    staleTime: 5 * 60_000,
  })
}

/** A folder a page at a time; `fetchNextPage` continues while `nextCursor` is set. */
export function useMailList(workspaceId: string, folder: MailFolder, query: MailQuery = {}, limit?: number) {
  const queryClient = useQueryClient()
  return useInfiniteQuery({
    queryKey: mailKeys.list(workspaceId, folder, { ...query, limit }),
    initialPageParam: '',
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ folder })
      for (const [key, value] of Object.entries({ ...query, limit, cursor: pageParam || undefined })) if (value) params.set(key, String(value))
      const page = await readJson<MailListResponse>(await fetch(`${base(workspaceId)}?${params}`, { cache: 'no-store' }))
      queryClient.setQueryData(mailKeys.status(workspaceId), page.status)
      return page
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  })
}

export function fetchMessage(workspaceId: string, folder: MailFolder, id: string) {
  const params = new URLSearchParams({ folder, id, peek: '1' })
  return fetch(`${base(workspaceId)}/message?${params}`).then((response) => readJson<MailMessage>(response))
}

/** One message body (always a peek; opening marks it read separately). */
export function useMessage(workspaceId: string, folder: MailFolder, id: string | null) {
  return useQuery({
    queryKey: mailKeys.message(workspaceId, folder, id ?? ''),
    enabled: Boolean(id),
    queryFn: () => fetchMessage(workspaceId, folder, id!),
    staleTime: 10 * 60_000,
    retry: 1,
  })
}

export function usePrefetchMessage(workspaceId: string, folder: MailFolder) {
  const queryClient = useQueryClient()
  return (id: string) =>
    void queryClient.prefetchQuery({ queryKey: mailKeys.message(workspaceId, folder, id), queryFn: () => fetchMessage(workspaceId, folder, id), staleTime: 10 * 60_000 })
}

export function useMarkRead(workspaceId: string) {
  return useMutation({
    meta: { silent: true },
    mutationFn: async ({ folder, id }: { folder: MailFolder; id: string }) => readJson(await send('POST', `${base(workspaceId)}/message`, { folder, id })),
  })
}

export function attachmentUrl(workspaceId: string, folder: MailFolder, messageId: string, attachmentId: string) {
  return `${base(workspaceId)}/attachment?${new URLSearchParams({ folder, id: messageId, att: attachmentId })}`
}

export type Draft = { to: string; cc: string; subject: string; body: string; html?: string; files: File[] }

export function useSendMail(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: async (draft: Draft) => {
      const form = new FormData()
      form.set('to', draft.to)
      if (draft.cc) form.set('cc', draft.cc)
      form.set('subject', draft.subject)
      form.set('body', draft.body)
      if (draft.html) form.set('html', draft.html)
      draft.files.forEach((file) => form.append('attachments', file, file.name))
      return readJson<{ ok: true; recipients: number }>(await fetch(base(workspaceId), { method: 'POST', body: form }))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...mailKeys.all(workspaceId), 'list', 'sent'] }),
  })
}

export function useContacts(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: mailKeys.contacts(workspaceId),
    enabled,
    queryFn: async () => (await readJson<{ contacts: MailContact[] }>(await fetch(`${base(workspaceId)}/contacts`))).contacts,
    staleTime: 10 * 60_000,
    retry: false,
  })
}

export type ImapForm = {
  preset: string
  email: string
  username?: string
  password: string
  imapHost?: string
  imapPort?: number
  smtpHost?: string
  smtpPort?: number
}

export function useConnectImap(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: async (form: ImapForm) => (await readJson<{ status: MailStatus }>(await send('POST', `${base(workspaceId)}/connection`, form))).status,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mailKeys.all(workspaceId) }),
  })
}

export function useDisconnectMail(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => readJson(await send('DELETE', `${base(workspaceId)}/connection`)),
    onSuccess: () => queryClient.removeQueries({ queryKey: mailKeys.all(workspaceId) }),
  })
}

export const gmailConnectUrl = (workspaceId: string, next: string) =>
  `/api/oauth/google/connect?${new URLSearchParams({ purpose: `mail:${workspaceId}`, next })}`

/** Messages for the `reason` codes the OAuth callback sends back. */
export const OAUTH_REASONS: Record<string, string> = {
  denied: 'Google sign-in was cancelled.',
  scopes: 'Allow every requested permission to connect.',
  expired: 'The sign-in expired. Please try again.',
  access: 'You no longer have access to that workspace, or it is locked.',
  config: 'Google sign-in is not set up on this server.',
  failed: 'Could not finish Google sign-in. Try again.',
}
