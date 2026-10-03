import { useEffect, useState } from 'react'
import { Wrench, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { getRepairTargets, repairMemos, type RepairTarget } from '@/lib/memo-repair'

/** Returns null on read failure so it is never mistaken for "nothing to repair". */
async function fetchRepairTargets(): Promise<RepairTarget[] | null> {
  const { data, error } = await supabase
    .from('memos')
    .select('id, url, author_handle, author_bio, content_snippet, preview_image')
  return error || !data ? null : getRepairTargets(data)
}

interface RepairMetadataButtonProps {
  onPatched: (id: string, patch: Record<string, unknown>) => void
}

/** One tap re-fetches every bookmark with a missing author or a cover that is not stored yet. */
export function RepairMetadataButton({ onPatched }: RepairMetadataButtonProps) {
  const [targets, setTargets] = useState<RepairTarget[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState('')

  useEffect(() => {
    let active = true
    void fetchRepairTargets().then((next) => { if (active && next) setTargets(next) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!result) return
    const timer = setTimeout(() => setResult(''), 5000)
    return () => clearTimeout(timer)
  }, [result])

  const handleRepair = async () => {
    if (progress || targets.length === 0) return
    setResult('')
    setProgress({ done: 0, total: targets.length })
    const { fixed, failed } = await repairMemos(targets, {
      parse: async (url) => {
        const res = await fetch('/api/parse-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        })
        if (!res.ok) throw new Error(`parse failed: ${res.status}`)
        return res.json()
      },
      save: async (id, patch) => {
        const { error } = await supabase.from('memos').update(patch).eq('id', id)
        if (error) throw error
        onPatched(id, patch)
      },
      onProgress: (done) => setProgress((p) => p && { ...p, done }),
    })
    setProgress(null)
    setResult(failed ? `修好 ${fixed}・失敗 ${failed}` : `修好 ${fixed} 筆`)
    const next = await fetchRepairTargets()
    if (next) setTargets(next)
  }

  if (targets.length === 0 && !progress && !result) return null

  const label = progress
    ? `修復中 ${progress.done}/${progress.total}`
    : result || `重抓 ${targets.length} 筆資訊不完整的收藏`

  return (
    <button
      onClick={handleRepair}
      disabled={!!progress || targets.length === 0}
      title={label}
      aria-label={label}
      className={cn(
        'relative flex items-center gap-1.5 p-2 text-slate-400 transition-all active:scale-90',
        targets.length > 0 && !progress && 'hover:text-primary',
        progress && 'text-primary',
      )}
    >
      {progress ? <Loader2 size={20} className="animate-spin" /> : <Wrench size={20} />}
      {progress ? (
        <span className="text-[11px] font-bold tabular-nums">{progress.done}/{progress.total}</span>
      ) : result ? (
        <span className="text-[11px] font-bold text-primary whitespace-nowrap">{result}</span>
      ) : targets.length > 0 ? (
        <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-[10px] font-black leading-4 text-slate-950 tabular-nums">
          {targets.length > 99 ? '99+' : targets.length}
        </span>
      ) : null}
    </button>
  )
}
