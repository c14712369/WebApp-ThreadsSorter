import { useState, useEffect, useRef, useCallback } from 'react'
import { Card } from './ui/Card'
import { Star, MessageCircle, Trash2, Archive, Tag, RefreshCw, Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion'
import IconRenderer from './IconRenderer'
import { supabase } from '@/lib/supabase'
import { getMemoAuthor, getMetadataPatch, needsMemoMetadataRefresh } from '@/lib/memo-metadata'

interface MemoCardProps {
  memo: {
    id: string
    author_handle: string
    author_bio?: string
    content_snippet: string
    preview_image?: string
    post_timestamp?: string
    is_essential: boolean
    is_archived?: boolean
    url: string
    personal_note?: string
    category_id?: string
    created_at?: string | Date
    ai_summary?: string
    ai_tags?: string[]
  }
  categoryName?: string
  categoryIcon?: string
  suggestedCategories?: { id: string, name: string, icon?: string }[]
  onSelectCategory?: (memoId: string, categoryId: string) => void
  onEdit?: (memo: any) => void
  onUpdate?: (memo: any) => void
  onToggleEssential?: (id: string, essential: boolean) => void
  onToggleArchive?: (id: string, archived: boolean) => void
  onDelete?: (id: string) => void
  isHighlightMode?: boolean
}

export function MemoCard({ memo, categoryName, categoryIcon, suggestedCategories, onSelectCategory, onEdit, onUpdate, onToggleEssential, onToggleArchive, onDelete, isHighlightMode }: MemoCardProps) {
  const [imgError, setImgError] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const lastRefreshRef = useRef<number>(0)
  const latestRef = useRef({ memo, onUpdate })
  const x = useMotionValue(0)
  
  const actionOpacity = useTransform(x, [-160, -40], [1, 0])
  const actionScale = useTransform(x, [-160, -40], [1, 0.8])

  const authorHandle = getMemoAuthor(memo)
  const authorLabel = authorHandle ? `@${authorHandle}` : '作者未取得'
  const isParsing = isRefreshing && !authorHandle
  const needsMetadataUpdate = needsMemoMetadataRefresh(memo)

  useEffect(() => {
    latestRef.current = { memo, onUpdate }
  }, [memo, onUpdate])

  const refreshMetadata = useCallback(async (signal?: AbortSignal, replaceImage = false) => {
    const { id, url } = latestRef.current.memo
    setIsRefreshing(true)
    try {
      const res = await fetch('/api/parse-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal,
      })
      if (!res.ok) throw new Error(`Metadata refresh failed: ${res.status}`)
      const data = await res.json()
      if (signal?.aborted || latestRef.current.memo.id !== id) return
      const patch = getMetadataPatch(latestRef.current.memo, data, { replaceImage })
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase.from('memos').update(patch).eq('id', id)
        if (error) throw error
        if (signal?.aborted || latestRef.current.memo.id !== id) return
        // Use current props: another card or an edit may have changed them while awaiting the API.
        setIsRefreshing(false)
        latestRef.current.onUpdate?.({ ...latestRef.current.memo, ...patch })
        if (patch.preview_image) setImgError(false)
      }
    } catch (error) {
      if (!signal?.aborted) console.error('Metadata refresh failed', error)
    } finally {
      if (!signal?.aborted) setIsRefreshing(false)
    }
  }, [])

  // Callback identity changes must not cancel pending repairs. StrictMode can safely restart this request.
  useEffect(() => {
    if (!needsMetadataUpdate) {
      setIsRefreshing(false)
      return
    }
    const controller = new AbortController()
    void refreshMetadata(controller.signal)
    return () => controller.abort()
  }, [needsMetadataUpdate, memo.id, memo.url, refreshMetadata])

  // Reset imgError when memo.preview_image changes
  useEffect(() => {
    setImgError(false)
  }, [memo.preview_image])

  const getImageUrl = (url?: string) => {
    if (!url) return null
    // 如果已經是 Supabase 的網址，就不需要經過 proxy
    if (url.includes('supabase.co')) return url
    return `/api/image-proxy?url=${encodeURIComponent(url)}`
  }

  const handleRefreshImage = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (isRefreshing) return
    
    // 限制頻率，避免無限循環 (10秒冷卻)
    const now = Date.now()
    if (now - lastRefreshRef.current < 10000) {
      console.log('Refresh cooled down, skipping...')
      return
    }
    lastRefreshRef.current = now

    await refreshMetadata(undefined, true)
  }

  // Highlight / Masonry Mode (Inspiration Wall)
  if (isHighlightMode) {
    return (
      <Card 
        className="group relative overflow-hidden cursor-pointer border-slate-800 bg-slate-900/40 hover:bg-slate-800 transition-colors hover:shadow-2xl hover:shadow-primary/10"
        onClick={() => onEdit?.(memo)}
      >
        {memo.preview_image && !imgError && (
          <div className="absolute inset-0 opacity-[0.07] grayscale pointer-events-none group-hover:scale-110 transition-transform duration-1000">
            <img 
              src={getImageUrl(memo.preview_image)!}
              alt="" 
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-6 relative z-10 space-y-4">
          <div className="flex items-center justify-between opacity-60 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                {authorLabel}
              </span>
              {categoryName && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 text-[8px] font-bold text-slate-400">
                  <IconRenderer name={categoryIcon || 'Tag'} size={8} />
                  <span>{categoryName}</span>
                </div>
              )}
            </div>
            <Star size={12} className={cn("transition-colors", memo.is_essential ? "text-amber-500 fill-amber-500" : "text-slate-700")} />
          </div>

          <p className="text-lg font-medium text-slate-100 leading-relaxed line-clamp-3">
            {memo.content_snippet || memo.ai_summary || memo.personal_note}
          </p>

          <div className="flex items-center justify-between pt-2">
            <div className="flex gap-2 flex-wrap">
              {memo.ai_tags && memo.ai_tags.filter(tag => !tag.startsWith('[CAT]')).slice(0, 2).map(tag => (
                <span key={tag} className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">#{tag}</span>
              ))}
            </div>
            
            <div className="flex items-center gap-2">
              {(imgError || needsMetadataUpdate) && (
                <button 
                  onClick={handleRefreshImage}
                  disabled={isRefreshing}
                  aria-label="重新擷取作者與封面"
                  className={cn("p-1.5 text-slate-500 hover:text-primary transition-colors", isRefreshing && "animate-spin")}
                  title="重新整理圖片"
                >
                  <RefreshCw size={14} />
                </button>
              )}
              <button 
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm('確定要刪除這篇珍藏嗎？')) onDelete?.(memo.id)
                }}
                aria-label="刪除"
                className="p-1.5 text-slate-600 hover:text-rose-400 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-950">
      {/* Background Swipe Actions */}
      <div className="absolute inset-0 flex justify-end items-center">
        <div className="flex h-full">
          <motion.button
            style={{ opacity: actionOpacity, scale: actionScale }}
            onClick={(e) => {
              e.stopPropagation()
              onToggleArchive?.(memo.id, !memo.is_archived)
              x.set(0)
            }}
            aria-label={memo.is_archived ? '移回' : '封存'}
            className="h-full w-20 flex flex-col items-center justify-center bg-emerald-600 text-white gap-1"
          >
            <Archive size={20} />
            <span className="text-[10px] font-bold">{memo.is_archived ? '移回' : '封存'}</span>
          </motion.button>

          <motion.button
            style={{ opacity: actionOpacity, scale: actionScale }}
            onClick={(e) => {
              e.stopPropagation()
              if (confirm('確定要刪除這篇珍藏嗎？')) onDelete?.(memo.id)
            }}
            aria-label="刪除"
            className="h-full w-20 flex flex-col items-center justify-center bg-rose-500 text-white gap-1"
          >
            <Trash2 size={20} />
            <span className="text-[10px] font-bold">刪除</span>
          </motion.button>
        </div>
      </div>

      <motion.div
        drag="x"
        dragConstraints={{ left: -160, right: 0 }}
        dragElastic={0.05}
        onDragEnd={(_, info) => {
          if (info.offset.x > -80) x.set(0)
        }}
        style={{ x }}
        className="relative z-10"
      >
        <Card 
          className="flex h-32 overflow-hidden group cursor-pointer border-slate-800 bg-slate-900 hover:bg-slate-800 transition-colors"
          onClick={() => {
            if (Math.abs(x.get()) < 10) onEdit?.(memo)
          }}
        >
          {/* Left side: Thumbnail */}
          <div className="w-32 h-32 shrink-0 bg-slate-950/50 relative overflow-hidden border-r border-slate-800 flex items-center justify-center">
            {isParsing ? (
              <div className="relative w-full h-full flex flex-col items-center justify-center bg-slate-900 overflow-hidden">
                 <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent animate-[shimmer_2s_infinite]" />
                 <Sparkles className="animate-pulse text-primary/60" size={28} />
              </div>
            ) : memo.preview_image && !imgError ? (
              <img
                src={getImageUrl(memo.preview_image)!}
                alt={`${authorHandle || '收藏文章'}的封面`}
                onError={() => {
                  setImgError(true)
                  // Auto-refresh once on error if not already refreshing
                  handleRefreshImage()
                }}
                className="w-full h-full object-cover grayscale-[30%] group-hover:grayscale-0 transition-[filter,transform] duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="relative w-full h-full flex flex-col items-center justify-center opacity-20 group-hover:opacity-40 transition-opacity">
                <MessageCircle size={32} />
                {isRefreshing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <RefreshCw size={24} className="animate-spin text-primary" />
                  </div>
                )}
              </div>
            )}
            
            {(imgError || needsMetadataUpdate) && !isRefreshing && (
              <button 
                onClick={handleRefreshImage}
                className="absolute bottom-2 right-2 p-1 text-slate-400 hover:text-white transition-colors"
                title="重新擷取作者與封面"
                aria-label="重新擷取作者與封面"
              >
                <div className="p-2 bg-slate-800 rounded-full text-white shadow-lg border border-white/10">
                  <RefreshCw size={16} />
                </div>
              </button>
            )}

            {memo.is_essential && (
              <div className="absolute top-2 left-2 p-1 bg-amber-500 rounded-full shadow-lg z-10">
                <Star size={10} fill="white" className="text-white" />
              </div>
            )}
          </div>

          {/* 右側 */}
          <div className="flex-1 flex flex-col justify-center px-3.5 py-3 gap-1.5 min-w-0 overflow-hidden relative">
            {isParsing ? (
              <AnimatePresence>
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-4 bg-slate-800 rounded animate-pulse" />
                    {categoryName && (
                      <div className="w-12 h-4 bg-slate-800 rounded-full animate-pulse" />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="w-full h-3 bg-slate-800/80 rounded animate-pulse" />
                    <div className="w-3/4 h-3 bg-slate-800/60 rounded animate-pulse" />
                  </div>
                </motion.div>
                {/* 若有註解，即使解析中也能疊加上去 */}
                {memo.personal_note && (
                   <p className="text-sm font-medium text-slate-400 leading-snug line-clamp-1 mt-1">
                     {memo.personal_note}
                   </p>
                )}
              </AnimatePresence>
            ) : (
              <>
                {/* 作者 + bio + category */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[11px] font-black text-primary shrink-0 max-w-[40%] truncate">
                    {authorLabel}
                  </span>
                  {categoryName && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-800 text-[9px] font-bold text-slate-400 shrink-0">
                      <IconRenderer name={categoryIcon || 'Tag'} size={8} />
                      <span className="truncate max-w-[60px]">{categoryName}</span>
                    </div>
                  )}
                  {memo.author_bio && (
                    <span className="text-[10px] text-slate-600 truncate min-w-0">{memo.author_bio}</span>
                  )}
                </div>

                {/* 內文（2 行）*/}
                <p className="text-sm font-medium text-slate-200 leading-snug line-clamp-2">
                  {memo.content_snippet || memo.ai_summary || memo.personal_note}
                </p>

                {/* 推薦分類 */}
                {!memo.category_id && suggestedCategories && suggestedCategories.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 bg-primary/10 rounded-lg px-2 py-1.5 border border-primary/20" onClick={e => e.stopPropagation()}>
                    <span className="text-[10px] text-primary/80 font-bold flex items-center gap-1"><Sparkles size={10} /> 推薦分類</span>
                    {suggestedCategories.map(cat => (
                      <button
                        key={cat.id}
                        onClick={(e) => { e.stopPropagation(); onSelectCategory?.(memo.id, cat.id) }}
                        className="px-2 py-0.5 rounded-full bg-primary/20 text-primary-foreground text-[10px] font-bold hover:bg-primary/40 active:scale-95 transition-all flex items-center gap-1"
                      >
                        <IconRenderer name={cat.icon || 'Tag'} size={8} />
                        {cat.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
      </motion.div>
    </div>
  )
}
