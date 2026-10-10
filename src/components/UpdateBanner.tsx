'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { RefreshCw, X } from 'lucide-react'
import { useVersionCheck } from '@/hooks/useVersionCheck'

/** 線上有新版本時，從頂端（避開 iOS 狀態列模糊帶）浮出的更新提示 */
export function UpdateBanner() {
  const { status, latest } = useVersionCheck()
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [reloading, setReloading] = useState(false)

  // 關掉後只對同一版本有效；再出更新的新版本會重新提示
  useEffect(() => { if (status !== 'outdated') setDismissed(null) }, [status])

  const visible = status === 'outdated' && dismissed !== latest

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ x: '-50%', y: -24, opacity: 0, scale: 0.96 }}
          animate={{ x: '-50%', y: 0, opacity: 1, scale: 1 }}
          exit={{ x: '-50%', y: -16, opacity: 0, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="fixed left-1/2 z-[200] w-[calc(100%-2.5rem)] max-w-sm"
          style={{ top: 'calc(env(safe-area-inset-top) + 16px)' }}
          role="status"
        >
          <div className="flex items-center gap-3 pl-4 pr-1.5 py-1.5 rounded-full bg-slate-900/95 border border-primary/25 shadow-2xl shadow-black/50 backdrop-blur-xl">
            <span className="relative flex w-2 h-2 shrink-0">
              <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-60" />
              <span className="relative w-2 h-2 rounded-full bg-primary" />
            </span>
            <span className="flex-1 text-sm font-bold text-white truncate">有新版本可用</span>
            <button
              onClick={() => { setReloading(true); window.location.reload() }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-black active:scale-95 transition-transform"
            >
              <RefreshCw size={13} strokeWidth={2.75} className={reloading ? 'animate-spin' : ''} />
              更新
            </button>
            <button
              onClick={() => setDismissed(latest)}
              aria-label="稍後再說"
              className="p-2 text-slate-500 hover:text-white transition-colors rounded-full active:scale-90"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** 設定面板裡的版本列：顯示目前版本、狀態與手動檢查 */
export function VersionRow() {
  const { current, status, check } = useVersionCheck()
  const label = {
    idle: '檢查中…',
    checking: '檢查中…',
    latest: '已是最新版本',
    outdated: '有新版本可用',
    error: '無法檢查，請稍後再試',
  }[status]

  return (
    <div className="flex items-center justify-between gap-3 pt-5 border-t border-white/[0.06]">
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-400">
          版本 <span className="font-mono text-slate-300">{current}</span>
        </p>
        <p className={status === 'outdated' ? 'text-[11px] font-bold text-primary mt-0.5' : 'text-[11px] font-medium text-slate-500 mt-0.5'}>{label}</p>
      </div>
      {status === 'outdated' ? (
        <button onClick={() => window.location.reload()} className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-primary-foreground text-xs font-black active:scale-95 transition-transform">
          <RefreshCw size={13} strokeWidth={2.75} />立即更新
        </button>
      ) : (
        <button onClick={check} disabled={status === 'checking'} className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs font-bold hover:bg-white/[0.08] disabled:opacity-50 active:scale-95 transition-all">
          <RefreshCw size={13} className={status === 'checking' ? 'animate-spin' : ''} />檢查更新
        </button>
      )}
    </div>
  )
}
