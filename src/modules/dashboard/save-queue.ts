/**
 * Runs writes one at a time and, while one is in flight, keeps only the newest value.
 * Autosave needs both: overlapping writes can land out of order (an older layout
 * overwriting a newer one), and the first save must finish creating the row before the
 * next one can update it.
 */
export function createLatestQueue<T>(write: (value: T) => Promise<void>, onError: (error: unknown) => void) {
  let pending: { value: T } | null = null
  let running: Promise<void> | null = null

  async function drain() {
    while (pending) {
      const { value } = pending
      pending = null
      try {
        await write(value)
      } catch (error) {
        onError(error)
      }
    }
    running = null
  }

  return {
    /** Queues `value`, replacing anything not yet started; resolves once the queue is empty. */
    push(value: T): Promise<void> {
      pending = { value }
      running ??= drain()
      return running
    },
    /** True while a write is queued or in flight. */
    get busy() {
      return running !== null
    },
  }
}
