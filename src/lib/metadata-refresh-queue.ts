const STORAGE_KEY_PREFIX = 'thorter:metadata-refresh:'
const AUTO_REFRESH_INTERVAL = 24 * 60 * 60 * 1000

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

function getBrowserStorage(): KeyValueStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Posts that cannot be parsed would otherwise be re-fetched on every page load. */
export function shouldAutoRefresh(memoId: string, now = Date.now(), storage = getBrowserStorage()): boolean {
  try {
    const saved = storage?.getItem(STORAGE_KEY_PREFIX + memoId)
    if (saved == null) return true
    const last = Number(saved)
    return !Number.isFinite(last) || now - last >= AUTO_REFRESH_INTERVAL
  } catch {
    return true
  }
}

export function markAutoRefreshed(memoId: string, now = Date.now(), storage = getBrowserStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY_PREFIX + memoId, String(now))
  } catch {
    // Storage is a convenience; refreshing again later is harmless.
  }
}

/** Limits how many slow metadata requests the page runs at once. */
export function createRefreshQueue(limit: number) {
  let running = 0
  const waiting: Array<() => void> = []

  const release = () => {
    running--
    waiting.shift()?.()
  }

  return {
    async run(task: () => Promise<void>, signal?: AbortSignal): Promise<void> {
      if (running >= limit) await new Promise<void>((resolve) => waiting.push(resolve))
      running++
      try {
        if (!signal?.aborted) await task()
      } finally {
        release()
      }
    },
  }
}

export const metadataRefreshQueue = createRefreshQueue(2)
