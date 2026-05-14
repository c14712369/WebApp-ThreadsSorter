'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Link2, Loader2, Sparkles, Star, Folder, MessageCircle, X, Plus, Check, ChevronRight, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import IconRenderer, { AVAILABLE_ICONS } from './IconRenderer'
import { motion, AnimatePresence } from 'framer-motion'

interface AddMemoModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  initialUrl?: string
}

export function AddMemoModal({ isOpen, onClose, onSuccess, initialUrl }: AddMemoModalProps) {
  const { user } = useAuth()
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<any>(null)
  const [imgError, setImgError] = useState(false)

  const [categoryId, setCategoryId] = useState('')
  const [personalNote, setPersonalNote] = useState('')
  const [isEssential, setIsEssential] = useState(false)
  const [categories, setCategories] = useState<any[]>([])

  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [aiSummary, setAiSummary] = useState('')
  const [aiTags, setAiTags] = useState<string[]>([])

  const [isCatSheetOpen, setIsCatSheetOpen] = useState(false)
  const [isAddCatOpen, setIsAddCatOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('Tag')
  const [showNewIconPicker, setShowNewIconPicker] = useState(false)
  const [isSavingCat, setIsSavingCat] = useState(false)

  const handleAddCategory = async () => {
    const name = newCatName.trim()
    if (!name || !user) return
    setIsSavingCat(true)
    const { data, error } = await supabase
      .from('categories')
      .insert([{ name, user_id: user.id, icon: newCatIcon }])
      .select()
      .single()
    if (!error && data) {
      try {
        const usageData = JSON.parse(localStorage.getItem('categoryUsage') || '{}')
        usageData[data.id] = Date.now()
        localStorage.setItem('categoryUsage', JSON.stringify(usageData))
      } catch {}

      setCategories(prev => {
        const newCats = [...prev, data]
        try {
          const usageData = JSON.parse(localStorage.getItem('categoryUsage') || '{}')
          return newCats.sort((a, b) => {
            const aTime = usageData[a.id] || 0
            const bTime = usageData[b.id] || 0
            if (aTime !== bTime) return bTime - aTime
            return a.name.localeCompare(b.name)
          })
        } catch {
          return newCats.sort((a, b) => a.name.localeCompare(b.name))
        }
      })
      setCategoryId(data.id)
    }
    setNewCatName('')
    setNewCatIcon('Tag')
    setIsAddCatOpen(false)
    setIsSavingCat(false)
  }

  const getImageUrl = (u?: string) => {
    if (!u) return null
    return `/api/image-proxy?url=${encodeURIComponent(u)}`
  }

  const isSupportedUrl = (u: string) =>
    u.includes('threads.net') || u.includes('instagram.com') || u.includes('threads.com')

  useEffect(() => {
    if (isOpen) {
      fetchCategories()
      if (initialUrl && isSupportedUrl(initialUrl)) {
        setUrl(initialUrl)
        fetchMetadata(initialUrl)
      } else {
        // FAB 的剪貼簿讀取在手機上可能失敗，modal 開啟時再試一次
        navigator.clipboard.readText().then((text) => {
          if (text && isSupportedUrl(text)) {
            setUrl(text)
            fetchMetadata(text)
          }
        }).catch(() => {})
      }
    } else {
      setUrl('')
      setPreview(null)
      setError('')
      setImgError(false)
      setPersonalNote('')
      setIsEssential(false)
      setCategoryId('')
      setAiSummary('')
      setAiTags([])
      setIsLoading(false)
      setIsGeneratingAI(false)
      setIsCatSheetOpen(false)
      setIsAddCatOpen(false)
      setNewCatName('')
      setNewCatIcon('Tag')
      setShowNewIconPicker(false)
    }
  }, [isOpen])

  const fetchCategories = async () => {
    const { data } = await supabase.from('categories').select('*').order('name')
    if (data) {
      try {
        const usageData = JSON.parse(localStorage.getItem('categoryUsage') || '{}')
        const sorted = [...data].sort((a, b) => {
          const aTime = usageData[a.id] || 0
          const bTime = usageData[b.id] || 0
          if (aTime !== bTime) return bTime - aTime
          return a.name.localeCompare(b.name)
        })
        setCategories(sorted)
      } catch {
        setCategories(data)
      }
    }
  }

  const fetchMetadata = async (targetUrl: string) => {
    if (!targetUrl) return
    setIsLoading(true)
    setError('')
    setImgError(false)
    setPreview(null)
    setAiSummary('')
    setAiTags([])
    try {
      const isThreads = targetUrl.includes('threads.net') || targetUrl.includes('threads.com')
      const isIG = targetUrl.includes('instagram.com')
      if (!isThreads && !isIG) throw new Error('僅支援 Threads 或 Instagram 連結')

      const res = await fetch('/api/parse-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setPreview(data)
      // 解析完自動觸發 AI 生成摘要
      generateAI(data)
    } catch (err: any) {
      setError(err.message || '解析失敗')
    } finally {
      setIsLoading(false)
    }
  }

  const generateAI = async (parsedData: any) => {
    if (!parsedData) return
    setIsGeneratingAI(true)
    try {
      const res = await fetch('/api/generate-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: parsedData.url,
          snippet: parsedData.content_snippet,
          title: parsedData.author_handle
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const { data: cats } = await supabase.from('categories').select('*')
      const allCats = cats || []
      
      // 比對 AI 標籤與內文片段，尋找所有匹配的分類
      const fullContentForMatching = `${parsedData.content_snippet || ''} ${data.summary || ''} ${(data.tags || []).join(' ')}`.toLowerCase()
      const matchedCats = allCats.filter((c: any) => {
        const catName = c.name.toLowerCase()
        // 內文包含分類名，或 AI 標籤包含/被包含於分類名
        return fullContentForMatching.includes(catName) || 
               data.tags?.some((t: string) => t.toLowerCase().includes(catName) || catName.includes(t.toLowerCase()))
      })
      
      setAiSummary(data.summary)
      
      if (matchedCats.length === 1) {
        setCategoryId(matchedCats[0].id)
        setAiTags(data.tags || [])
      } else if (matchedCats.length > 1) {
        setCategoryId('') // 有多個匹配，不預設，讓使用者在卡片選
        const catTags = matchedCats.map(c => `[CAT]${c.id}`)
        setAiTags(Array.from(new Set([...(data.tags || []), ...catTags])))
      } else {
        setAiTags(data.tags || [])
      }

      // 如果原始內容太短或為空，且 AI 摘要有內容，則自動把 AI 摘要填入標題欄位
      if ((!parsedData.content_snippet || parsedData.content_snippet.length < 5) && data.summary) {
        setPreview((prev: any) => ({ ...prev, content_snippet: data.summary }))
      }
    } catch {
      // Silent fail
    } finally {
      setIsGeneratingAI(false)
    }
  }

  const handleSave = async () => {
    const targetUrl = url || (preview?.url)
    if (!user || !targetUrl || !isSupportedUrl(targetUrl)) return
    setIsSaving(true)
    setError('')

    const payload: any = {
      user_id: user.id,
      url: targetUrl,
      category_id: categoryId || null,
      personal_note: personalNote || null,
      is_essential: isEssential,
      ai_tags: aiTags
    }

    if (preview) {
      Object.assign(payload, preview)
    }
    if (aiSummary) {
      payload.ai_summary = aiSummary
    }

    const { error: insertError } = await supabase.from('memos').insert([payload])

    if (insertError) {
      console.error('insert error:', JSON.stringify(insertError))
      setError(insertError.message)
      setIsSaving(false)
      return
    }

    if (categoryId) {
      try {
        const usageData = JSON.parse(localStorage.getItem('categoryUsage') || '{}')
        usageData[categoryId] = Date.now()
        localStorage.setItem('categoryUsage', JSON.stringify(usageData))
      } catch {}
    }

    onSuccess()
    onClose()
    setIsSaving(false)
  }

  const isThreadsSrc = url.includes('threads.net') || url.includes('threads.com')

  if (!isOpen) return null

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
        <h1 className="text-lg font-black text-white tracking-tight">快速新增</h1>
        <button
          onClick={handleSave}
          disabled={!url || !isSupportedUrl(url) || isSaving}
          className="px-5 py-2 bg-primary text-[#0B1120] rounded-full text-sm font-black disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          {isSaving ? <Loader2 size={14} className="animate-spin" /> : '儲存'}
        </button>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' } as any}>
        <div
          className="px-5 pt-5 space-y-6"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 32px)' }}
        >

          {/* 連結 */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Link2 size={14} className="text-primary" strokeWidth={2.5} />
              <span className="text-sm font-black tracking-wider text-primary">連結</span>
            </div>
            <div className="flex items-center gap-3 bg-slate-800/60 border border-white/[0.06] rounded-2xl px-4 py-3.5">
              <Link2 size={15} className="text-slate-600 shrink-0" />
              <input
                type="url"
                placeholder="https://www.threads.net/..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none min-w-0"
                value={url}
                onChange={(e) => {
                  const v = e.target.value
                  setUrl(v)
                  if (v.includes('threads.net') || v.includes('threads.com') || v.includes('instagram.com')) {
                    fetchMetadata(v)
                  }
                }}
              />
            </div>
          </section>

          {/* Loading skeleton */}
          {isLoading && (
            <div className="rounded-2xl bg-slate-800/40 border border-white/[0.06] overflow-hidden animate-pulse">
              <div className="h-52 bg-slate-800/80" />
              <div className="p-4 space-y-3">
                <div className="h-3 w-16 bg-slate-700 rounded-full" />
                <div className="h-4 w-2/3 bg-slate-700 rounded-full" />
                <div className="h-3 w-full bg-slate-700/50 rounded-full" />
                <div className="h-3 w-4/5 bg-slate-700/40 rounded-full" />
              </div>
            </div>
          )}

          {/* Preview Card */}
          {!isLoading && preview && (
            <section className="rounded-2xl bg-slate-800/40 border border-white/[0.06] overflow-hidden">
              {preview.preview_image && !imgError ? (
                <div className="w-full h-56 bg-slate-800">
                  <img
                    src={getImageUrl(preview.preview_image)!}
                    alt="Preview"
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
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black bg-primary/10 text-primary border border-primary/20 tracking-wider">
                  {isThreadsSrc ? 'Threads' : 'Instagram'}
                </span>
                <p className="text-white text-sm font-semibold leading-snug">
                  {preview.author_handle}
                  {preview.author_bio && (
                    <span className="text-slate-400 font-normal"> · {preview.author_bio}</span>
                  )}
                </p>
                {preview.content_snippet && (
                  <p className="text-slate-400 text-sm leading-relaxed line-clamp-3">{preview.content_snippet}</p>
                )}
              </div>
            </section>
          )}

          {/* AI 摘要 */}
          {!isLoading && preview && (isGeneratingAI || aiSummary) && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-primary" strokeWidth={2.5} />
                <span className="text-sm font-black tracking-wider text-primary">AI 摘要</span>
              </div>
              {isGeneratingAI ? (
                <div className="rounded-2xl bg-slate-800/40 border border-white/[0.06] p-4 flex items-center gap-3">
                  <Loader2 size={16} className="animate-spin text-primary shrink-0" />
                  <span className="text-sm text-slate-500">正在生成…</span>
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-800/40 border border-primary/10 px-4 py-3 space-y-2.5">
                  <p className="text-slate-200 text-sm italic leading-relaxed">{aiSummary}</p>
                  {aiTags.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {aiTags.map(tag => (
                        <span key={tag} className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ─── Form fields (shown after parse) ─── */}
          {!isLoading && preview && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-primary" strokeWidth={2.5} />
                <span className="text-sm font-black tracking-wider text-primary">標題</span>
              </div>
              <textarea
                className="w-full bg-slate-800/60 border border-white/[0.06] rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 resize-none leading-relaxed min-h-[80px] transition-colors"
                value={preview.content_snippet}
                onChange={(e) => setPreview({ ...preview, content_snippet: e.target.value })}
              />
            </section>
          )}

          {url && isSupportedUrl(url) && (
            <>

              {/* 註解 */}
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black tracking-wider text-primary">📝</span>
                  <span className="text-sm font-black tracking-wider text-primary">註解</span>
                  <span className="text-[10px] text-slate-600 font-bold px-1.5 py-0.5 bg-slate-800 rounded-md tracking-wider">選填</span>
                </div>
                <textarea
                  className="w-full bg-slate-800/60 border border-white/[0.06] rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 resize-none leading-relaxed min-h-[80px] transition-colors"
                  placeholder="加入你的想法或備註…"
                  value={personalNote}
                  onChange={(e) => setPersonalNote(e.target.value)}
                />
              </section>

              {/* 分類 */}
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <Folder size={14} className="text-primary" strokeWidth={2.5} />
                  <span className="text-sm font-black tracking-wider text-primary">分類</span>
                </div>
                <button
                  onClick={() => setIsCatSheetOpen(true)}
                  className="w-full flex items-center justify-between bg-slate-800/60 border border-white/[0.06] rounded-2xl px-4 py-3 transition-colors hover:border-white/20 active:scale-[0.98]"
                >
                  <div className="flex items-center gap-2.5">
                    <Folder size={15} className={categoryId ? 'text-primary' : 'text-slate-600'} />
                    <span className={`text-sm font-medium ${categoryId ? 'text-white' : 'text-slate-500'}`}>
                      {categoryId ? categories.find(c => c.id === categoryId)?.name ?? '選擇分類' : '選擇分類'}
                    </span>
                  </div>
                  <ChevronRight size={15} className="text-slate-600" />
                </button>
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
            </>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl text-sm">
              {error}
            </div>
          )}

        </div>
      </div>

      {/* ── 分類選擇 Bottom Sheet ── */}
      {isCatSheetOpen && (
        <div
          className="absolute inset-0 z-[110] flex flex-col justify-end"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setIsCatSheetOpen(false)}
        >
          <div
            className="bg-[#0D1525] rounded-t-3xl pb-safe overflow-hidden"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 24px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 拖把 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-base font-black text-white">選擇分類</span>
              <button
                onClick={() => { setIsCatSheetOpen(false); setIsAddCatOpen(true) }}
                className="flex items-center gap-1 text-primary text-sm font-bold active:opacity-70 transition-opacity"
              >
                <Plus size={15} />
                新增
              </button>
            </div>

            {/* 列表 */}
            <div className="overflow-y-auto max-h-72">
              {/* 無分類 */}
              <button
                onClick={() => { setCategoryId(''); setIsCatSheetOpen(false) }}
                className="w-full flex items-center gap-4 px-5 py-4 active:bg-white/5 transition-colors border-t border-white/[0.06]"
              >
                <X size={18} className={!categoryId ? 'text-primary' : 'text-slate-500'} strokeWidth={2.5} />
                <span className={`flex-1 text-left text-base font-medium ${!categoryId ? 'text-primary' : 'text-white'}`}>無分類</span>
                {!categoryId && (
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                    <Check size={13} className="text-[#0B1120]" strokeWidth={3} />
                  </div>
                )}
              </button>

              {/* 各分類 */}
              {categories.map(cat => {
                const selected = categoryId === cat.id
                return (
                  <button
                    key={cat.id}
                    onClick={() => { setCategoryId(cat.id); setIsCatSheetOpen(false) }}
                    className="w-full flex items-center gap-4 px-5 py-4 active:bg-white/5 transition-colors border-t border-white/[0.06]"
                  >
                    <IconRenderer name={cat.icon || 'Folder'} size={18} className={selected ? 'text-primary' : 'text-slate-500'} />
                    <span className={`flex-1 text-left text-base font-medium ${selected ? 'text-primary' : 'text-white'}`}>{cat.name}</span>
                    {selected && (
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Check size={13} className="text-[#0B1120]" strokeWidth={3} />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── 新增分類彈出視窗 ── */}
      {isAddCatOpen && (
        <div
          className="absolute inset-0 z-[120] flex items-center justify-center px-6"
          style={{ background: 'rgba(11,17,32,0.7)', backdropFilter: 'blur(6px)' }}
          onClick={() => { setIsAddCatOpen(false); setNewCatName('') }}
        >
          <div
            className="w-full max-w-sm bg-slate-900 border border-white/10 rounded-2xl p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-base font-black text-white tracking-tight">新增分類</span>
              <button
                onClick={() => { setIsAddCatOpen(false); setNewCatName(''); setShowNewIconPicker(false) }}
                className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-all"
              >
                <X size={15} />
              </button>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setShowNewIconPicker(!showNewIconPicker)}
                className="flex items-center gap-1 bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-primary hover:bg-primary/10 transition-colors shrink-0"
              >
                <IconRenderer name={newCatIcon} size={16} />
                <ChevronDown size={12} />
              </button>
              <input
                autoFocus
                type="text"
                placeholder="分類名稱"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory() }}
                className="w-full bg-slate-800/60 border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-colors"
              />
            </div>

            <AnimatePresence>
              {showNewIconPicker && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="grid grid-cols-7 gap-1 p-2 bg-slate-800 rounded-xl border border-white/10 overflow-y-auto max-h-40 no-scrollbar"
                >
                  {AVAILABLE_ICONS.map(iconName => (
                    <button
                      key={iconName}
                      onClick={() => { setNewCatIcon(iconName); setShowNewIconPicker(false) }}
                      className={`p-2 rounded hover:bg-slate-700 transition-colors ${newCatIcon === iconName ? 'bg-primary/20 text-primary' : 'text-slate-500'}`}
                    >
                      <IconRenderer name={iconName} size={18} />
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <button
              onClick={handleAddCategory}
              disabled={!newCatName.trim() || isSavingCat}
              className="w-full py-2.5 bg-primary text-[#0B1120] rounded-xl text-sm font-black disabled:opacity-30 flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              {isSavingCat ? <Loader2 size={14} className="animate-spin" /> : '新增分類'}
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
  )
}
