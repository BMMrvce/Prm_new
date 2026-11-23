'use client'

import '@excalidraw/excalidraw/index.css'
import { CaptureUpdateAction, Excalidraw, reconcileElements, restoreElements } from '@excalidraw/excalidraw'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, BinaryFileData, BinaryFiles, Collaborator, ExcalidrawImperativeAPI, SocketId } from '@excalidraw/excalidraw/types'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { peerColor } from '@/modules/notes/use-note-live'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/lib/theme'
import type { ColorKey } from '@/core/types'
import { fetchScene, saveScene, type Board, type BoardScene } from './queries'

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[]
  }
}

type Peer = { id: string; name: string; color: ColorKey }
type Elements = readonly OrderedExcalidrawElement[]

const SAVE_DELAY = 1200
const BROADCAST_EVERY = 60
const POINTER_EVERY = 40

/** Canvas colors must be real values: read them from the theme's CSS variables. */
function tokenColor(key: ColorKey) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--cat-${key === 'indigo' ? 'violet' : key}`).trim()
  return value || 'currentColor'
}

/** Only these appState fields are stored; the rest is per-viewer (zoom, selection…). */
function storedAppState(appState: AppState): BoardScene['appState'] {
  return { viewBackgroundColor: appState.viewBackgroundColor, gridSize: appState.gridSize }
}

/** Sum of element versions: changes whenever anything on the board changes. */
function sceneVersion(elements: Elements) {
  let total = 0
  for (const element of elements) total += element.version
  return total
}

/**
 * The Excalidraw canvas for one board, with:
 * - saving (debounced, with a version check so concurrent saves merge instead of
 *   overwriting each other),
 * - live collaboration over a private Realtime channel `board:<id>` (only people who can
 *   see the board may join): element changes are broadcast and merged with Excalidraw's
 *   own reconciliation; pointers and presence show who is here,
 * - images stored privately in the `whiteboards` bucket.
 */
export function BoardCanvas({
  board,
  me,
  readOnly,
  onPeers,
  onSaveState,
}: {
  board: Board
  me: { id: string; name: string }
  readOnly: boolean
  onPeers: (peers: Peer[]) => void
  onSaveState: (state: 'saved' | 'saving' | 'pending' | 'error') => void
}) {
  const theme = useTheme()
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)
  const version = useRef(board.version)
  const lastSavedVersion = useRef(sceneVersion(board.scene.elements as Elements))
  const lastBroadcast = useRef(new Map<string, number>())
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const broadcastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastPointer = useRef(0)
  const channel = useRef<RealtimeChannel | null>(null)
  const collaborators = useRef(new Map<SocketId, Collaborator>())
  const uploaded = useRef(new Set<string>())
  const fetching = useRef(new Set<string>())
  const filesPrefix = `${board.workspaceId}/${board.id}`

  if (typeof window !== 'undefined') window.EXCALIDRAW_ASSET_PATH = '/excalidraw/'

  // ── Images ──────────────────────────────────────────────────────────────────────
  const loadMissingFiles = useCallback(
    async (excalidraw: ExcalidrawImperativeAPI, elements: Elements) => {
      const have = excalidraw.getFiles()
      const missing = elements.flatMap((element) =>
        element.type === 'image' && element.fileId && !have[element.fileId] && !fetching.current.has(element.fileId) ? [element.fileId] : [],
      )
      if (!missing.length) return
      missing.forEach((id) => fetching.current.add(id))
      const loaded: BinaryFileData[] = []
      for (const fileId of missing) {
        const { data } = await supabase().storage.from('whiteboards').download(`${filesPrefix}/${fileId}`)
        fetching.current.delete(fileId)
        if (!data) continue
        uploaded.current.add(fileId)
        const dataURL = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.readAsDataURL(data)
        })
        loaded.push({ id: fileId as BinaryFileData['id'], dataURL: dataURL as BinaryFileData['dataURL'], mimeType: (data.type || 'image/png') as BinaryFileData['mimeType'], created: Date.now() })
      }
      if (loaded.length) excalidraw.addFiles(loaded)
    },
    [filesPrefix],
  )

  const uploadNewFiles = useCallback(
    async (files: BinaryFiles) => {
      for (const file of Object.values(files)) {
        if (uploaded.current.has(file.id)) continue
        uploaded.current.add(file.id)
        const blob = await (await fetch(file.dataURL)).blob()
        if (blob.size > 10 * 1024 * 1024) continue
        const { error } = await supabase().storage.from('whiteboards').upload(`${filesPrefix}/${file.id}`, blob, { contentType: file.mimeType, upsert: true })
        if (error) uploaded.current.delete(file.id)
      }
    },
    [filesPrefix],
  )

  // ── Saving ──────────────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!api || readOnly) return
    clearTimeout(saveTimer.current)
    const elements = api.getSceneElementsIncludingDeleted()
    const current = sceneVersion(elements)
    if (current === lastSavedVersion.current) return onSaveState('saved')
    onSaveState('saving')
    try {
      const scene: BoardScene = { elements: [...elements], appState: storedAppState(api.getAppState()) }
      let next = await saveScene(board.id, scene, version.current)
      if (next === null) {
        // Someone saved first: merge their version into ours, then save the result.
        const remote = await fetchScene(board.id)
        if (remote) {
          const merged = reconcileElements(api.getSceneElementsIncludingDeleted(), restoreElements(remote.scene.elements as never, null) as never, api.getAppState())
          api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER })
          version.current = remote.version
          next = await saveScene(board.id, { elements: [...merged], appState: scene.appState }, remote.version)
        }
      }
      if (next !== null) {
        version.current = next
        lastSavedVersion.current = current
        onSaveState('saved')
      } else {
        onSaveState('pending')
        saveTimer.current = setTimeout(() => void save(), SAVE_DELAY)
      }
    } catch {
      onSaveState('error')
      saveTimer.current = setTimeout(() => void save(), SAVE_DELAY * 4)
    }
  }, [api, board.id, readOnly, onSaveState])

  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && void saveRef.current()
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      clearTimeout(saveTimer.current)
      void saveRef.current()
    }
  }, [])

  // ── Live collaboration ──────────────────────────────────────────────────────────
  const broadcastChanges = useCallback(
    (elements: Elements, full = false) => {
      const live = channel.current
      if (!live) return
      const changed = full ? elements : elements.filter((element) => lastBroadcast.current.get(element.id) !== element.version)
      if (!changed.length) return
      changed.forEach((element) => lastBroadcast.current.set(element.id, element.version))
      void live.send({ type: 'broadcast', event: 'elements', payload: { from: me.id, elements: changed } })
    },
    [me.id],
  )

  useEffect(() => {
    if (!api) return
    let cancelled = false
    let live: RealtimeChannel | null = null
    const color = peerColor(me.id)

    const updatePeers = () => {
      if (!live) return
      const state = live.presenceState<{ name: string; color: ColorKey }>()
      const peers = Object.entries(state)
        .filter(([key]) => key !== me.id)
        .map(([key, metas]) => ({ id: key, name: metas[0]?.name ?? 'Someone', color: metas[0]?.color ?? peerColor(key) }))
      onPeers(peers)
      // Drop cursors of people who left.
      for (const key of collaborators.current.keys()) if (!state[key]) collaborators.current.delete(key)
      api.updateScene({ collaborators: new Map(collaborators.current) })
    }

    void (async () => {
      const db = supabase()
      await db.realtime.setAuth()
      if (cancelled) return
      live = db
        .channel(`board:${board.id}`, { config: { private: true, broadcast: { self: false }, presence: { key: me.id } } })
        .on('broadcast', { event: 'elements' }, ({ payload }) => {
          const remote = restoreElements(payload.elements, null)
          const merged = reconcileElements(api.getSceneElementsIncludingDeleted(), remote as never, api.getAppState())
          remote.forEach((element) => lastBroadcast.current.set(element.id, element.version))
          api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER })
          void loadMissingFiles(api, merged)
        })
        .on('broadcast', { event: 'pointer' }, ({ payload }) => {
          const peerColorKey = (payload.color as ColorKey) ?? 'blue'
          const tone = tokenColor(peerColorKey)
          collaborators.current.set(payload.from as SocketId, {
            id: payload.from,
            username: payload.name,
            pointer: payload.pointer,
            button: payload.button,
            color: { background: tone, stroke: tone },
          })
          api.updateScene({ collaborators: new Map(collaborators.current) })
        })
        .on('broadcast', { event: 'hello' }, ({ payload }) => {
          // Someone joined: send them the whole board so they start in sync.
          if (payload.from !== me.id) broadcastChanges(api.getSceneElementsIncludingDeleted(), true)
        })
        .on('presence', { event: 'sync' }, updatePeers)
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED' || !live) return
          void live.track({ name: me.name, color })
          void live.send({ type: 'broadcast', event: 'hello', payload: { from: me.id } })
        })
      channel.current = live
    })()

    return () => {
      cancelled = true
      channel.current = null
      if (live) void supabase().removeChannel(live)
    }
  }, [api, board.id, me.id, me.name, onPeers, broadcastChanges, loadMissingFiles])

  // Load images referenced by the saved scene.
  useEffect(() => {
    if (api) void loadMissingFiles(api, api.getSceneElementsIncludingDeleted())
  }, [api, loadMissingFiles])

  const onChange = (elements: Elements, _appState: AppState, files: BinaryFiles) => {
    if (readOnly) return
    const current = sceneVersion(elements)
    if (current === lastSavedVersion.current) return
    void uploadNewFiles(files)
    clearTimeout(broadcastTimer.current)
    broadcastTimer.current = setTimeout(() => broadcastChanges(elements), BROADCAST_EVERY)
    onSaveState('pending')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void save(), SAVE_DELAY)
  }

  return (
    <div className="kala-whiteboard h-full w-full">
      <Excalidraw
        excalidrawAPI={setApi}
        initialData={{
          elements: restoreElements(board.scene.elements as never, null),
          appState: { viewBackgroundColor: board.scene.appState?.viewBackgroundColor, gridSize: board.scene.appState?.gridSize ?? undefined },
          scrollToContent: true,
        }}
        theme={theme.resolved}
        viewModeEnabled={readOnly}
        isCollaborating
        name={board.title}
        onChange={onChange}
        onPointerUpdate={({ pointer, button }) => {
          if (!channel.current || Date.now() - lastPointer.current < POINTER_EVERY) return
          lastPointer.current = Date.now()
          void channel.current.send({ type: 'broadcast', event: 'pointer', payload: { from: me.id, name: me.name, color: peerColor(me.id), pointer, button } })
        }}
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: { saveFileToDisk: true }, toggleTheme: false } }}
        // Embedded web pages are off: the Content Security Policy only allows our own frames.
        validateEmbeddable={false}
      />
    </div>
  )
}
