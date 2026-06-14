'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/hooks/useAuth'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { MemoCard } from '@/components/MemoCard'
import { AddMemoModal } from '@/components/AddMemoModal'
import { EditMemoModal } from '@/components/EditMemoModal'
import { EssentialBoard } from '@/components/EssentialBoard'
import { CategoryBoard } from '@/components/CategoryBoard'
import {
  LayoutGrid, ListFilter, Plus, Loader2, Star as StarIcon,
  ChevronLeft, ChevronRight, LogOut, Folder, User, Sparkles
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { CategoryManagerModal } from '@/components/CategoryManagerModal'
import IconRenderer from '@/components/IconRenderer'
import ImageCropModal from '@/components/ImageCropModal'

// ── 分頁號碼計算 ────────────────────────────────────────────
function getPageRange(current: number, total: number): (number | 'dot')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const c = current + 1
  if (c <= 4) return [1, 2, 3, 4, 5, 'dot', total]
  if (c >= total - 3) return [1, 'dot', total - 4, total - 3, total - 2, total - 1, total]
  return [1, 'dot', c - 1, c, c + 1, 'dot', total]
}

function HomeContent() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') || 'home'

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [clipboardUrl, setClipboardUrl] = useState('')
  const [editingMemo, setEditingMemo] = useState<any>(null)
  const [isCatModalOpen, setIsCatModalOpen] = useState(false)

  // ── 主頁資料 ──
  const [memos, setMemos] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState('all')
  const [onlyEssential, setOnlyEssential] = useState(false)
  const [onlyArchived, setOnlyArchived] = useState(false)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const PAGE_SIZE = 10

  // ── 防止競態條件 ──
  const fetchIdRef = useRef(0)

  // ── 分頁 Tab 用的全量資料 ──
  const [allMemos, setAllMemos] = useState<any[]>([])
  const [isViewLoading, setIsViewLoading] = useState(false)

  // ── App 圖示設定 ──
  const [appIcon, setAppIcon] = useState('Zap')
  const [customAppIcon, setCustomAppIcon] = useState<string | null>(null)
  const [isAppIconModalOpen, setIsAppIconModalOpen] = useState(false)
  const [imageToCrop, setImageToCrop] = useState<string | null>(null)
  const [isCropModalOpen, setIsCropModalOpen] = useState(false)

  // ── Scroll container ref ──
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // ── FAB scroll-hide ──
  const lastScrollY = useRef(0)
  const [fabVisible, setFabVisible] = useState(true)

  const fetchMemos = async (isInitialOrPageChange = false) => {
    if (!user) return
    
    const currentFetchId = ++fetchIdRef.current
    if (isInitialOrPageChange) setIsLoading(true)

    try {
      let query = supabase
        .from('memos')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

      if (selectedCategoryId !== 'all') query = query.eq('category_id', selectedCategoryId)
      if (onlyArchived) {
        query = query.eq('is_archived', true)
      } else {
        query = query.eq('is_archived', false)
        if (onlyEssential) query = query.eq('is_essential', true)
      }
      if (searchQuery) query = query.ilike('content_snippet', `%${searchQuery}%`)

      const { data, count, error } = await query

      if (currentFetchId !== fetchIdRef.current) return
      if (error) throw error

      setTotalCount(count || 0)
      
      if (data) {
        // ── 圖片預載邏輯 ──
        if (isInitialOrPageChange && data.length > 0) {
          const imageUrls = data
            .map(m => m.preview_image)
            .filter(Boolean)
            .map(url => {
              if (url.includes('supabase.co')) return url
              return `/api/image-proxy?url=${encodeURIComponent(url)}`
            })

          if (imageUrls.length > 0) {
            await Promise.race([
              Promise.all(imageUrls.map(src => new Promise<void>(resolve => {
                const img = new Image()
                img.onload = () => resolve()
                img.onerror = () => resolve()
                img.src = src
              }))),
              new Promise<void>(resolve => setTimeout(resolve, 3000)) // 最多等 3 秒，避免卡死
            ])
          }
        }
        
        setMemos(data)
      }
    } catch (err) {
      console.error('Fetch memos error:', err)
    } finally {
      if (currentFetchId === fetchIdRef.current) {
        setIsLoading(false)
      }
    }
  }

  const fetchAllMemos = async (essentialOnly: boolean) => {
    if (!user) return
    setIsViewLoading(true)
    let query = supabase.from('memos').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (essentialOnly) {
      query = query.eq('is_essential', true)
    } else {
      query = query.eq('is_archived', false)
    }
    const { data } = await query
    if (data) setAllMemos(data)
    setIsViewLoading(false)
  }

  const fetchCategories = async () => {
    if (!user) return
    const { data } = await supabase.from('categories').select('*').eq('user_id', user.id).order('name')
    if (data) setCategories(data)
  }

  // 分類變動：先樂觀更新父層 categories（分類牆、卡片標籤、篩選下拉皆即時反映），
  // 再向伺服器重抓校正排序與一致性，避免編輯後其他視圖顯示舊資料。
  const handleCategoriesChange = (optimistic?: any[]) => {
    if (optimistic) setCategories(optimistic)
    fetchCategories()
  }

  // ── Clipboard 預讀 ──
  const cachedClipboard = useRef('')
  useEffect(() => {
    const tryReadClipboard = async () => {
      try {
        const text = await navigator.clipboard.readText()
        cachedClipboard.current = text
      } catch {
        cachedClipboard.current = ''
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tryReadClipboard()
    }
    document.addEventListener('visibilitychange', onVisibility)
    tryReadClipboard()
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // 初始載入設定 (localStorage 為主)
  useEffect(() => {
    const savedIcon = localStorage.getItem('thorter_app_icon')
    const savedCustom = localStorage.getItem('thorter_custom_app_icon')
    if (savedIcon) setAppIcon(savedIcon)
    if (savedCustom) setCustomAppIcon(savedCustom)
  }, [])

  // ── 搜尋 Debounce ──
  useEffect(() => {
    const t = setTimeout(() => {
      setMemos([])
      setSearchQuery(searchInput)
      setPage(0)
    }, 400)
    return () => clearTimeout(t)
  }, [searchInput])

  // 篩選改變時重置頁碼並立即設為載入中
  useEffect(() => {
    setPage(0)
    setIsLoading(true) // 立即顯示載入狀態
    setMemos([])       // 清空舊列表，避免舊內容閃現
  }, [selectedCategoryId, onlyEssential, onlyArchived])

  // 切頁 / 切篩選時回到最上方
  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [page, onlyEssential, onlyArchived, selectedCategoryId])

  // Auth guard + 初始資料
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      const timer = setTimeout(() => { if (!user) router.push('/login') }, 500)
      return () => clearTimeout(timer)
    } else {
      fetchCategories()
    }
  }, [user, authLoading])

  // 統一處理首頁資料抓取 (包含初始與後續篩選變動)
  useEffect(() => {
    if (!authLoading && user && tab === 'home') {
      fetchMemos(true)
    }
  }, [user, authLoading, tab, page, selectedCategoryId, onlyEssential, onlyArchived, searchQuery])

  // 首頁載入完成後，背景預載其他 tab 的資料
  useEffect(() => {
    if (!authLoading && user && tab === 'home') {
      fetchAllMemos(false) // 分類 tab
      fetchAllMemos(true)  // 精華 tab
    }
  }, [user, authLoading])

  // 切換到其他 Tab 時的邏輯（allMemos 已有資料就不重新抓）
  useEffect(() => {
    if (!authLoading && user) {
      if (tab === 'categories' && allMemos.length === 0) fetchAllMemos(false)
      else if (tab === 'essentials' && allMemos.length === 0) fetchAllMemos(true)
    }
  }, [user, authLoading, tab])

  const handleDeleteMemo = async (id: string) => {
    const { error } = await supabase.from('memos').delete().eq('id', id)
    if (!error) {
      setMemos(prev => prev.filter(m => m.id !== id))
      setAllMemos(prev => prev.filter(m => m.id !== id))
      setTotalCount(prev => prev - 1)
    }
  }

  const handleUpdateMemo = (updatedMemo: any) => {
    setMemos(prev => prev.map(m => m.id === updatedMemo.id ? updatedMemo : m))
    setAllMemos(prev => prev.map(m => m.id === updatedMemo.id ? updatedMemo : m))
  }

  const handleToggleEssential = async (id: string, is_essential: boolean) => {
    if (onlyEssential && !is_essential) {
      setMemos(prev => prev.filter(m => m.id !== id))
      setTotalCount(prev => prev - 1)
    } else {
      setMemos(prev => prev.map(m => m.id === id ? { ...m, is_essential } : m))
    }
    if (tab === 'essentials' && !is_essential) {
      setAllMemos(prev => prev.filter(m => m.id !== id))
    } else {
      setAllMemos(prev => prev.map(m => m.id === id ? { ...m, is_essential } : m))
    }
    await supabase.from('memos').update({ is_essential }).eq('id', id)
  }

  const handleToggleArchive = async (id: string, is_archived: boolean) => {
    setMemos(prev => prev.filter(m => m.id !== id))
    setAllMemos(prev => prev.filter(m => m.id !== id))
    setTotalCount(prev => prev - 1)
    await supabase.from('memos').update({ is_archived }).eq('id', id)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleUpdateAppIcon = (name: string) => {
    setAppIcon(name)
    setCustomAppIcon(null)
    localStorage.setItem('thorter_app_icon', name)
    localStorage.removeItem('thorter_custom_app_icon')
    const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement
    if (link) link.href = `/api/app-icon?icon=${name}`
  }

  const handleUploadCustomIcon = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target?.result as string
      setImageToCrop(base64)
      setIsCropModalOpen(true)
      setIsAppIconModalOpen(false) // 自動關閉設定彈窗
    }
    reader.readAsDataURL(file)
    // 重設 input 以便再次上傳同一張圖片
    e.target.value = ''
  }

  const handleCropComplete = (croppedBase64: string) => {
    setCustomAppIcon(croppedBase64)
    localStorage.setItem('thorter_custom_app_icon', croppedBase64)
    const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement
    if (link) link.href = croppedBase64
    setImageToCrop(null)
  }

  // ── 共用 Modals ──
  const sharedModals = (
    <>
      <AddMemoModal isOpen={isAddModalOpen} onClose={() => { setIsAddModalOpen(false); setClipboardUrl('') }} onSuccess={fetchMemos} initialUrl={clipboardUrl} />
      <EditMemoModal isOpen={!!editingMemo} memo={editingMemo} onClose={() => setEditingMemo(null)} onUpdate={handleUpdateMemo} onDelete={handleDeleteMemo} />
      <CategoryManagerModal isOpen={isCatModalOpen} onClose={() => setIsCatModalOpen(false)} userId={user?.id || ''} categories={categories} onCategoriesChange={handleCategoriesChange} />
      
      {imageToCrop && (
        <ImageCropModal 
          isOpen={isCropModalOpen} 
          image={imageToCrop} 
          onClose={() => { setIsCropModalOpen(false); setImageToCrop(null) }} 
          onCropComplete={handleCropComplete} 
        />
      )}

      <AnimatePresence>
        {isAppIconModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAppIconModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div initial={{ y: "100%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "100%", opacity: 0 }} className="relative w-full max-w-sm bg-slate-900 border border-white/10 rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-black text-white tracking-tight">自定義圖示</h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">Personalize Thorter</p>
                  </div>
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary overflow-hidden">
                    {customAppIcon ? (
                      <img src={customAppIcon} alt="Custom" className="w-full h-full object-cover" />
                    ) : (
                      <IconRenderer name={appIcon} size={24} />
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <label className="w-full flex items-center justify-center gap-2 py-4 px-6 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-white hover:bg-white/[0.08] transition-all cursor-pointer group active:scale-[0.98]">
                    <Plus size={18} className="text-primary group-hover:rotate-90 transition-transform" />
                    <span className="text-sm font-bold">上傳自定義圖片</span>
                    <input type="file" accept="image/*" onChange={handleUploadCustomIcon} className="hidden" />
                  </label>

                  <div className="grid grid-cols-5 gap-3">
                    {['Zap', 'Star', 'Heart', 'Rocket', 'Moon', 'Sun', 'Flame', 'Ghost', 'Cat', 'Dog', 'Coffee', 'Music', 'Camera', 'Book', 'Code', 'Globe', 'Gamepad2', 'Briefcase'].map(iconName => (
                      <button key={iconName} onClick={() => handleUpdateAppIcon(iconName)} className={cn("w-full aspect-square rounded-2xl flex items-center justify-center transition-all active:scale-90", (!customAppIcon && appIcon === iconName) ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-110 z-10" : "bg-white/[0.03] border border-white/[0.06] text-slate-500 hover:text-white hover:bg-white/[0.08]")}>
                        <IconRenderer name={iconName} size={20} />
                      </button>
                    ))}
                  </div>
                </div>

                <Button className="w-full py-4 rounded-2xl font-black tracking-tight" onClick={() => setIsAppIconModalOpen(false)}>完成設定</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )

  if (tab === 'categories') {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden bg-background">
        <div className="shrink-0 pt-12 pb-4 px-5"><h1 className="text-2xl font-black text-white tracking-tighter">分類</h1></div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-24 no-scrollbar">
          {isViewLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-primary" size={32} /></div>
          ) : (
            <div className="animate-in fade-in duration-300">
              <CategoryBoard categories={categories} memos={allMemos} onDetail={setEditingMemo} onUpdateMemo={handleUpdateMemo} onDeleteMemo={handleDeleteMemo} onToggleEssential={handleToggleEssential} onManageCategories={() => setIsCatModalOpen(true)} />
            </div>
          )}
        </div>
        {sharedModals}
      </div>
    )
  }

  if (tab === 'essentials') {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden bg-background">
        <div className="shrink-0 pt-12 pb-4 px-5"><h1 className="text-2xl font-black text-white tracking-tighter">靈感牆</h1></div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-24 no-scrollbar">
          {isViewLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-primary" size={32} /></div>
          ) : (
            <div className="animate-in fade-in duration-300">
              <EssentialBoard memos={allMemos} categories={categories} onDetail={setEditingMemo} onUpdateMemo={handleUpdateMemo} onDeleteMemo={handleDeleteMemo} onToggleEssential={handleToggleEssential} />
            </div>
          )}
        </div>
        {sharedModals}
      </div>
    )
  }

  if (tab === 'profile') {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden bg-background">
        <div className="shrink-0 pt-12 px-5" />
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
          <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary overflow-hidden">
            {customAppIcon ? (
              <img src={customAppIcon} alt="Custom" className="w-full h-full object-cover" />
            ) : (
              <IconRenderer name={appIcon} size={48} />
            )}
          </div>
          <div className="text-center space-y-1">
            <p className="text-white font-bold">{user?.email}</p>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">{totalCount} 篇收藏 · {categories.length} 個分類</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-bold hover:bg-rose-500/20 transition-colors">
            <LogOut size={16} />登出
          </button>
        </div>
        {sharedModals}
      </div>
    )
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const hasPagination = totalCount > PAGE_SIZE

  return (
    <div className="flex flex-col h-full w-full overflow-hidden relative bg-background">
      <div className="shrink-0 pt-12 pb-3 px-5 space-y-3.5 z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary/10 overflow-hidden">
              {customAppIcon ? (
                <img src={customAppIcon} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <IconRenderer name={appIcon} size={24} />
              )}
            </div>
            <h1 className="text-2xl font-black text-white tracking-tighter">Thorter</h1>
          </div>
          <div className="flex items-center gap-1">
            <button className="p-2 text-slate-400 hover:text-primary transition-all active:scale-90" onClick={() => setIsAppIconModalOpen(true)} title="自定義圖示"><Sparkles size={20} /></button>
            <button className="p-2 text-slate-400 hover:text-white transition-colors" onClick={() => setIsCatModalOpen(true)} title="管理分類"><Folder size={20} /></button>
            <button className="p-2 text-slate-400 hover:text-rose-400 transition-colors" onClick={handleLogout} title="登出"><LogOut size={20} /></button>
          </div>
        </div>
        <div className="relative">
          <input type="text" placeholder="搜尋收藏..." className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus:border-primary/30 transition-colors placeholder:text-slate-600" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex gap-2 overflow-x-auto no-scrollbar flex-1">
            {[
              { id: 'all', label: '全部', action: () => { setOnlyEssential(false); setOnlyArchived(false) }, active: !onlyEssential && !onlyArchived },
              { id: 'essentials', label: '釘選', icon: <StarIcon size={11} fill="currentColor" />, action: () => { setOnlyEssential(true); setOnlyArchived(false) }, active: onlyEssential && !onlyArchived },
              { id: 'archived', label: '封存', icon: <Folder size={11} />, action: () => { setOnlyEssential(false); setOnlyArchived(true) }, active: onlyArchived },
            ].map((tabItem) => (
              <button key={tabItem.id} onClick={tabItem.action} className={cn("whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold transition-colors flex items-center gap-1.5 border shrink-0", tabItem.active ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20" : "bg-white/5 text-slate-500 border-white/5 hover:border-white/10 hover:text-slate-300")}>
                {tabItem.icon}{tabItem.label}
              </button>
            ))}
          </div>
          <div className="relative shrink-0">
            <select className="bg-white/5 border border-white/5 rounded-xl pl-3 pr-8 py-1.5 text-xs font-bold text-slate-400 appearance-none focus:outline-none focus:border-primary/30 transition-colors max-w-[7rem]" value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)}>
              <option value="all">所有分類</option>
              {categories.map(cat => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
            </select>
            <ListFilter size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative overflow-hidden">
        {isLoading && memos.length > 0 && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/75 backdrop-blur-[2px] pointer-events-none">
            <Loader2 className="animate-spin text-primary" size={28} strokeWidth={2.5} />
          </div>
        )}
        <div ref={scrollContainerRef} className="h-full overflow-y-auto overscroll-contain px-5 pt-1 pb-3 no-scrollbar" onScroll={(e) => {
          const curr = e.currentTarget.scrollTop
          if (curr > lastScrollY.current + 8) setFabVisible(false)
          else if (curr < lastScrollY.current - 8) setFabVisible(true)
          lastScrollY.current = curr
        }}>
          {isLoading && memos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4"><Loader2 className="animate-spin text-primary" size={36} strokeWidth={3} /><p className="text-xs font-black uppercase tracking-widest text-slate-600">載入中</p></div>
          ) : memos.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-white/5 rounded-[2rem] text-slate-500 space-y-3 bg-white/[0.02]">
              <div className="flex justify-center opacity-10"><LayoutGrid size={56} /></div>
              <p className="font-bold text-slate-500 text-sm">尚無內容</p>
              <Button variant="ghost" size="sm" onClick={() => setIsAddModalOpen(true)} className="rounded-xl border border-white/10 text-xs">立即新增</Button>
            </div>
          ) : (
            <div key={`${onlyEssential}-${onlyArchived}-${selectedCategoryId}-${page}`} className="grid gap-3 animate-in fade-in duration-200">
              {memos.map((memo) => {
                const cat = categories.find(c => c.id === memo.category_id)
                const suggestedCategories = !memo.category_id && memo.ai_tags
                  ? categories.filter(c => memo.ai_tags?.includes(`[CAT]${c.id}`)).map(c => ({ id: c.id, name: c.name, icon: c.icon }))
                  : undefined

                return (
                  <MemoCard 
                    key={memo.id} 
                    memo={memo} 
                    categoryName={cat?.name} 
                    categoryIcon={cat?.icon} 
                    suggestedCategories={suggestedCategories}
                    onSelectCategory={async (memoId, categoryId) => {
                      const { error } = await supabase.from('memos').update({ category_id: categoryId }).eq('id', memoId)
                      if (!error) {
                        handleUpdateMemo({ ...memo, category_id: categoryId })
                      }
                    }}
                    onEdit={setEditingMemo} 
                    onUpdate={handleUpdateMemo} 
                    onDelete={handleDeleteMemo} 
                    onToggleEssential={handleToggleEssential} 
                    onToggleArchive={handleToggleArchive} 
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      {hasPagination && (
        <div className="shrink-0 flex items-center justify-center gap-1 px-5 py-2 pb-3 border-t border-white/[0.04]">
          <button disabled={page === 0 || isLoading} onClick={() => { setPage(p => p - 1) }} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-white disabled:opacity-20 transition-colors"><ChevronLeft size={16} /></button>
          {getPageRange(page, totalPages).map((p, i) => p === 'dot' ? (<span key={`dot-${i}`} className="w-8 h-8 flex items-center justify-center text-slate-700 text-xs select-none">…</span>) : (
            <button key={p} disabled={isLoading} onClick={() => { setPage((p as number) - 1) }} className={cn("w-8 h-8 rounded-lg text-xs font-bold transition-colors", (p as number) - 1 === page ? "bg-primary text-primary-foreground shadow-md shadow-primary/30" : "text-slate-500 hover:text-white hover:bg-white/5")}>{p}</button>
          ))}
          <button disabled={(page + 1) * PAGE_SIZE >= totalCount || isLoading} onClick={() => { setPage(p => p + 1) }} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-white disabled:opacity-20 transition-colors"><ChevronRight size={16} /></button>
        </div>
      )}

      <button onClick={() => { setClipboardUrl(cachedClipboard.current); setIsAddModalOpen(true) }} aria-label="新增收藏" className={cn("fixed bottom-6 right-5 w-[3.25rem] h-[3.25rem] bg-primary text-primary-foreground rounded-full shadow-xl shadow-primary/25 z-[90] flex items-center justify-center group", "transition-all duration-300", fabVisible ? "translate-y-0 opacity-100 scale-100" : "translate-y-4 opacity-0 scale-90 pointer-events-none")}>
        <Plus size={26} strokeWidth={3} className="group-hover:rotate-90 transition-transform duration-300" />
      </button>
      {sharedModals}
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-background"><Loader2 className="animate-spin text-primary" /></div>}>
      <HomeContent />
    </Suspense>
  )
}
