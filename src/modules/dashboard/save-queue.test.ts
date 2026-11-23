import { describe, expect, it } from 'vitest'
import { createLatestQueue } from './save-queue'

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => ((resolve = res), (reject = rej)))
  return { promise, resolve, reject }
}

describe('createLatestQueue', () => {
  it('runs one write at a time and skips values replaced while waiting', async () => {
    const started: number[] = []
    const gates: ReturnType<typeof deferred>[] = []
    const queue = createLatestQueue<number>((value) => {
      started.push(value)
      const gate = deferred()
      gates.push(gate)
      return gate.promise
    }, () => undefined)

    const done = queue.push(1)
    queue.push(2)
    queue.push(3)
    expect(started).toEqual([1])
    expect(queue.busy).toBe(true)

    gates[0].resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(started).toEqual([1, 3])

    gates[1].resolve()
    await done
    expect(started).toEqual([1, 3])
    expect(queue.busy).toBe(false)
  })

  it('reports a failed write and still writes the newer value', async () => {
    const errors: unknown[] = []
    const written: number[] = []
    const first = deferred()
    const queue = createLatestQueue<number>(
      (value) => (value === 1 ? first.promise : (written.push(value), Promise.resolve())),
      (error) => errors.push(error),
    )
    const done = queue.push(1)
    queue.push(2)
    first.reject(new Error('offline'))
    await done
    expect(errors).toHaveLength(1)
    expect(written).toEqual([2])
    expect(queue.busy).toBe(false)
  })
})
