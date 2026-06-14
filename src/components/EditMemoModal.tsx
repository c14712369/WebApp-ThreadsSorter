import { useState, useEffect } from 'react'
import { ArrowLeft, Trash2, Loader2, Link2, MessageCircle, ExternalLink, Folder, Star, Sparkles, Tag } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface EditMemoModalProps {
  isOpen: boolean
  memo: any
  categories: any[]
  onClose: () => void
  onUpdate: (memo: any) => void
  onDelete: (id: string) => void
}

export function EditMemoModal({ isOpen, memo, categories, onClose, onUpdate, onDelete }: EditMemoModalProps) {
  const [content, setContent] = useState('')
  const [personalNote, setPersonalNote] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [isEssential, setIsEssential] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (memo) {
      setContent(memo.content_snippet || '')
      setPersonalNote(memo.personal_note || '')
      setCategoryId(memo.category_id || '')
      setIsEssential(memo.is_essential || false)
      setImgError(false)
    }
  }, [memo])

  const getImageUrl = (url?: string) => {
    if (!url) return null
    if (url.includes('supabase.co')) return url
    return `/api/image-proxy?url=${encodeURIComponent(url)}`
  }

  const handleSave = async () => {
    setIsSaving(true)
    const { error } = await supabase
      .from('memos')
      .update({
        content_snippet: content,
        personal_note: personalNote,
        category_id: categoryId || null,
        is_essential: isEssential
      })
      .eq('id', memo.id)

    if (!error) {
      onUpdate({
        ...memo,
        content_snippet: content,
        personal_note: personalNote,
        category_id: categoryId || null,
        is_essential: isEssential
      })
      onClose()
    }
    setIsSaving(false)
  }

  const handleDelete = async () => {
    if (!confirm('確定要刪除這篇收藏嗎？')) return
    const { error } = await supabase.from('memos').delete().eq('id', memo.id)
    if (!error) { onDelete(memo.id); onClose() }
  }

  const isThreadsSrc = memo?.url?.includes('threads.net') || memo?.url?.includes('threads.com')

  if (!isOpen || !memo) return null

  return (
    <div className="fixed inset-0 z-[100] flex justify-center items-center md:p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-xl h-full md:h-[90dvh] bg-background flex flex-col md:rounded-[2.5rem] md:border md:border-white/10 md:shadow-2xl overflow-hidden relative animate-in slide-in-from-bottom duration-300">

      {/* ── Header ── */}
      <div
        className="shrink-0 flex items-center justify-between px-5 border-b border-white/[0.06]"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)', paddingBottom: '16px' }}
      >
        <button
          onClick={onClose}
          aria-label="返回"
          className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors rounded-xl active:scale-95"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-black text-white tracking-tight">編輯收藏</h1>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDelete}
            aria-label="刪除"
            className="p-2 text-slate-600 hover:text-rose-400 transition-colors rounded-xl active:scale-95"
          >
            <Trash2 size={19} />
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 bg-primary text-[#0B1120] rounded-full text-sm font-black disabled:opacity-50 flex items-center gap-1.5 active:scale-95 transition-transform ml-1"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : '儲存'}
          </button>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' } as any}>
        <div
          className="px-5 pt-5 space-y-6"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 32px)' }}
        >
          {/* Preview (read-only) */}
          <section className="rounded-2xl bg-slate-800/40 border border-white/[0.06] overflow-hidden relative">
            {!memo.author_handle ? (
              <div className="w-full h-56 flex flex-col items-center justify-center gap-4 bg-slate-900/80 animate-pulse">
                <Loader2 size={36} className="text-primary/70 animate-spin" />
                <span className="text-primary/70 text-xs font-bold tracking-widest uppercase">正在提取原文資訊...</span>
              </div>
            ) : (
              <>
                {memo.preview_image && !imgError ? (
                  <div className="w-full h-56 bg-slate-800">
                    <img
                      src={getImageUrl(memo.preview_image)!}
                      referrerPolicy="no-referrer"
                      onError={() => setImgError(true)}
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-full h-32 bg-slate-800/80 flex items-center justify-center text-slate-700">
                    <MessageCircle size={40} />
                  </div>
                )}
                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black bg-primary/10 text-primary border border-primary/20 tracking-wider">
                      {isThreadsSrc ? 'Threads' : 'Instagram'}
                    </span>
                    <button
                      onClick={() => window.open(memo.url, '_blank', 'noopener,noreferrer')}
                      className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-primary transition-colors"
                    >
                      <ExternalLink size={11} /> 查看原文
                    </button>
                  </div>
                  <p className="text-white text-sm font-semibold leading-snug">
                    @{memo.author_handle}
                    {memo.author_bio && <span className="text-slate-500 font-normal ml-1.5 opacity-60">· {memo.author_bio}</span>}
                  </p>
                </div>
              </>
            )}
          </section>

          {/* AI 摘要 (Read-only reference) */}
          {(memo.ai_summary || (memo.ai_tags && memo.ai_tags.length > 0)) && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-primary" strokeWidth={2.5} />
                <span className="text-sm font-black tracking-wider text-primary">AI 摘要記錄</span>
              </div>
              <div className="rounded-2xl bg-primary/5 border border-primary/10 px-4 py-3 space-y-2.5">
                {memo.ai_summary && <p className="text-slate-200 text-sm italic leading-relaxed">{memo.ai_summary}</p>}
                {memo.ai_tags && memo.ai_tags.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {memo.ai_tags.map((tag: string) => (
                      <span key={tag} className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 內容編輯 */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-primary" strokeWidth={2.5} />
              <span className="text-sm font-black tracking-wider text-primary">標題</span>
            </div>
            <textarea
              placeholder="內容..."
              rows={3}
              className="w-full bg-slate-800/60 border border-white/[0.06] rounded-2xl px-4 py-3.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors resize-none"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </section>

          {/* 個人筆記 */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Tag size={14} className="text-primary" strokeWidth={2.5} />
              <span className="text-sm font-black tracking-wider text-primary">個人筆記</span>
            </div>
            <textarea
              placeholder="寫下你的想法..."
              rows={2}
              className="w-full bg-slate-800/60 border border-white/[0.06] rounded-2xl px-4 py-3.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors resize-none"
              value={personalNote}
              onChange={(e) => setPersonalNote(e.target.value)}
            />
          </section>

          {/* 分類選擇 */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Folder size={14} className="text-primary" strokeWidth={2.5} />
              <span className="text-sm font-black tracking-wider text-primary">所屬分類</span>
            </div>
            <div className="relative">
              <select
                className="w-full bg-slate-800/60 border border-white/[0.06] rounded-2xl px-4 py-3.5 text-sm text-white appearance-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">未分類</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <Folder size={12} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </section>

          {/* 精華 */}
          <section>
            <label className="flex items-center gap-3 cursor-pointer">
              <div className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${isEssential ? 'bg-primary' : 'bg-slate-700'}`}>
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${isEssential ? 'translate-x-5' : ''}`} />
              </div>
              <input type="checkbox" className="hidden" checked={isEssential} onChange={(e) => setIsEssential(e.target.checked)} />
              <span className={`text-sm font-medium flex items-center gap-1.5 transition-colors ${isEssential ? 'text-amber-400' : 'text-slate-400'}`}>
                <Star size={14} className={isEssential ? 'text-amber-400' : ''} fill={isEssential ? 'currentColor' : 'none'} />
                標記精華
              </span>
            </label>
          </section>

        </div>
      </div>
    </div>
  </div>
  )
}
