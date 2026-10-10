'use client'

import { useCallback, useEffect, useState } from 'react'
import { APP_VERSION, hasNewerVersion } from '@/lib/app-version'

export type VersionStatus = 'idle' | 'checking' | 'latest' | 'outdated' | 'error'

const CHECK_INTERVAL_MS = 15 * 60 * 1000

/** 比對執行中版本與線上版本；回到前景、啟動時、每 15 分鐘各檢查一次 */
export function useVersionCheck() {
  const [status, setStatus] = useState<VersionStatus>('idle')
  const [latest, setLatest] = useState<string | null>(null)

  const check = useCallback(async () => {
    setStatus(s => (s === 'outdated' ? s : 'checking'))
    try {
      const res = await fetch(`/api/version?t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(String(res.status))
      const { version } = await res.json()
      setLatest(version)
      setStatus(hasNewerVersion(APP_VERSION, version) ? 'outdated' : 'latest')
    } catch {
      setStatus(s => (s === 'outdated' ? s : 'error'))
    }
  }, [])

  useEffect(() => {
    check()
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(check, CHECK_INTERVAL_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [check])

  return { current: APP_VERSION, latest, status, check }
}
