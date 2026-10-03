import { getMetadataPatch, needsMemoMetadataRefresh } from './memo-metadata'
import { createRefreshQueue } from './metadata-refresh-queue'

export interface RepairableMemo {
  id: string
  url: string
  author_handle?: string | null
  author_bio?: string | null
  content_snippet?: string | null
  preview_image?: string | null
}

export interface RepairTarget {
  memo: RepairableMemo
  /** Expiring CDN covers may be swapped for a stored copy. */
  replaceImage: boolean
}

type MetadataPatch = ReturnType<typeof getMetadataPatch>

const isStoredImage = (url?: string | null) => !!url && url.includes('.supabase.co/storage/')

export function getRepairTargets(memos: RepairableMemo[]): RepairTarget[] {
  return memos.flatMap<RepairTarget>((memo) => {
    if (needsMemoMetadataRefresh(memo)) return [{ memo, replaceImage: false }]
    if (!isStoredImage(memo.preview_image)) return [{ memo, replaceImage: true }]
    return []
  })
}

export async function repairMemos(
  targets: RepairTarget[],
  {
    parse,
    save,
    onProgress,
    limit = 2,
  }: {
    parse: (url: string) => Promise<Record<string, unknown>>
    save: (id: string, patch: MetadataPatch) => Promise<void>
    onProgress?: (done: number) => void
    limit?: number
  },
): Promise<{ fixed: number; failed: number }> {
  const queue = createRefreshQueue(limit)
  let done = 0
  let fixed = 0

  await Promise.all(targets.map(({ memo, replaceImage }) => queue.run(async () => {
    try {
      const patch = getMetadataPatch(memo, await parse(memo.url), { replaceImage })
      // A CDN cover only counts as fixed once it is replaced by a stored copy.
      const useful = replaceImage && !needsMemoMetadataRefresh(memo) ? isStoredImage(patch.preview_image) : Object.keys(patch).length > 0
      if (useful) {
        await save(memo.id, patch)
        fixed++
      }
    } catch {
      // Counted as failed below; the card keeps its current data.
    } finally {
      onProgress?.(++done)
    }
  })))

  return { fixed, failed: targets.length - fixed }
}
