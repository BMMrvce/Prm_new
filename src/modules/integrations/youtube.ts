'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { readJson } from '@/modules/inbox/api'

/** Client view of /api/youtube (types mirror src/server/youtube.ts; no server import). */
export type YouTubeStatus =
  | { state: 'not_configured' }
  | { state: 'needs_auth' }
  | { state: 'needs_playlist'; account: string }
  | { state: 'connected'; account: string; playlist: { id: string; title: string } }
export type YouTubeVideo = { id: string; title: string; channel: string; thumbnail: string | null; addedAt: string; url: string }
export type YouTubePlaylist = { id: string; title: string; count: number }

const keys = { feed: ['youtube'] as const, playlists: ['youtube', 'playlists'] as const }

export function useYouTube() {
  return useQuery({
    queryKey: keys.feed,
    queryFn: async () => readJson<{ status: YouTubeStatus; videos: YouTubeVideo[]; error?: string }>(await fetch('/api/youtube', { cache: 'no-store' })),
    staleTime: 5 * 60_000,
  })
}

export function usePlaylists(enabled: boolean) {
  return useQuery({
    queryKey: keys.playlists,
    enabled,
    queryFn: async () => (await readJson<{ playlists: YouTubePlaylist[] }>(await fetch('/api/youtube/playlists', { cache: 'no-store' }))).playlists,
  })
}

export function useChoosePlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (playlistId: string) =>
      readJson(await fetch('/api/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playlistId }) })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.feed }),
  })
}

export function useDisconnectYouTube() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => readJson(await fetch('/api/youtube', { method: 'DELETE' })),
    onSuccess: () => queryClient.removeQueries({ queryKey: keys.feed }),
  })
}

export const connectYouTubeUrl = (next: string) => `/api/oauth/google/connect?${new URLSearchParams({ purpose: 'youtube', next })}`
