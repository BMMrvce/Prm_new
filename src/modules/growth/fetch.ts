import { must } from '@/lib/supabase/client'

type Page<Row> = { data: Row[] | null; error: { message: string; code?: string } | null }

/**
 * Reads a query in pages of 1000 rows (the API's row cap) until it runs out, up to
 * `maxRows`. The query must be ordered deterministically so pages never overlap.
 */
export async function fetchPaged<Row>(page: (from: number, to: number) => PromiseLike<Page<Row>>, maxRows = 20_000) {
  const size = 1000
  const rows: Row[] = []
  for (let from = 0; from < maxRows; from += size) {
    const batch = must(await page(from, from + size - 1)) as Row[]
    rows.push(...batch)
    if (batch.length < size) break
  }
  return rows
}
