'use client'

import { useState, useEffect } from 'react'
import { Plus, Tag, Loader2, Edit2, Check, Trash2, ChevronDown } from 'lucide-react'
import { Button } from './ui/Button'
import { supabase } from '@/lib/supabase'
import { motion, useMotionValue, useTransform, AnimatePresence } from 'framer-motion'
import IconRenderer, { AVAILABLE_ICONS } from './IconRenderer'

// 每個分類列表項目
function CategoryItem({
  cat,
  onEdit,
  onDelete,
}: {
  cat: any
  onEdit: (id: string, name: string, icon: string) => void
  onDelete: (id: string, name: string) => void
}) {
  const [editingName, setEditingName] = useState(cat.name)
  const [editingIcon, setEditingIcon] = useState(cat.icon || 'Tag')
  const [isEditing, setIsEditing] = useState(false)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const x = useMotionValue(0)
  const actionOpacity = useTransform(x, [-90, -20], [1, 0])

  const handleStartEdit = () => {
    setEditingName(cat.name)
    setEditingIcon(cat.icon || 'Tag')
    setIsEditing(true)
    x.set(0) // 收回滑動
  }

  const handleSave = () => {
    onEdit(cat.id, editingName, editingIcon)
    setIsEditing(false)
    setShowIconPicker(false)
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* 刪除背景 */}
      <motion.button
        style={{ opacity: actionOpacity }}
        onClick={() => onDelete(cat.id, cat.name)}
        className="absolute inset-y-0 right-0 w-20 bg-rose-500 flex flex-col items-center justify-center text-white gap-1 z-0"
      >
        <Trash2 size={18} />
        <span className="text-[10px] font-bold">刪除</span>
      </motion.button>

      {/* 可滑動的分類列 */}
      <motion.div
        drag={isEditing ? false : "x"}
        dragConstraints={{ left: -90, right: 0 }}
        dragElastic={0.05}
        onDragEnd={(_, info) => { if (info.offset.x > -45) x.set(0) }}
        style={{ x }}
        className="relative z-10 flex flex-col bg-slate-900/80 border border-slate-800/80 text-xs text-slate-300 hover:border-slate-700 transition-colors"
      >
        <div className="flex items-center gap-3 px-4 py-3">
          {isEditing ? (
            <div className="flex-1 flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setShowIconPicker(!showIconPicker)}
                  className="flex items-center gap-1 bg-slate-950 border border-primary/30 rounded px-2 py-1 text-primary hover:bg-primary/10 transition-colors shrink-0"
                >
                  <IconRenderer name={editingIcon} size={14} />
                  <ChevronDown size={10} />
                </button>
                <input
                  autoFocus
                  className="bg-slate-950 border border-primary/30 rounded px-2 py-1 text-white w-full outline-none text-sm"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave()
                    if (e.key === 'Escape') setIsEditing(false)
                  }}
                />
                <button
                  onClick={handleSave}
                  className="text-primary hover:text-primary/80 shrink-0"
                >
                  <Check size={18} />
                </button>
              </div>

              <AnimatePresence>
                {showIconPicker && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="grid grid-cols-7 gap-1 p-2 bg-slate-950 rounded border border-slate-800 overflow-hidden"
                  >
                    {AVAILABLE_ICONS.map(iconName => (
                      <button
                        key={iconName}
                        onClick={() => { setEditingIcon(iconName); setShowIconPicker(false) }}
                        className={`p-2 rounded hover:bg-slate-800 transition-colors ${editingIcon === iconName ? 'bg-primary/20 text-primary' : 'text-slate-500'}`}
                      >
                        <IconRenderer name={iconName} size={16} />
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <>
              <IconRenderer name={cat.icon || 'Tag'} size={14} className="text-primary/50 shrink-0" />
              <span className="flex-1 font-medium truncate">{cat.name}</span>
              <button
                onClick={handleStartEdit}
                className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-600 hover:text-white transition-colors shrink-0"
              >
                <Edit2 size={13} />
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export function CategoryManager({
  userId,
  categories,
  onCategoriesChange,
}: {
  userId: string
  categories: any[]
  onCategoriesChange: (optimistic?: any[]) => void
}) {
  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('Tag')
  const [showNewIconPicker, setShowNewIconPicker] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [localCats, setLocalCats] = useState<any[]>(categories)

  useEffect(() => { setLocalCats(categories) }, [categories])

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return
    setIsAdding(true)
    const { error } = await supabase
      .from('categories')
      .insert([{ user_id: userId, name: newCatName.trim(), icon: newCatIcon }])
    if (!error) { 
      onCategoriesChange()
      setNewCatName('')
      setNewCatIcon('Tag')
      setShowNewIconPicker(false)
    }
    setIsAdding(false)
  }

  const handleUpdateCategory = async (id: string, name: string, icon: string) => {
    if (!name.trim()) return
    const next = localCats.map(c => c.id === id ? { ...c, name: name.trim(), icon } : c)
    setLocalCats(next)
    const { error } = await supabase
      .from('categories')
      .update({ name: name.trim(), icon })
      .eq('id', id)
    if (error) setLocalCats(categories)
    else onCategoriesChange(next) // 將編輯後的分類即時提升到父層，其他視圖立刻同步
  }

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!confirm(`確定要刪除「${name}」？文章不會被刪除，但會變為未分類。`)) return
    const next = localCats.filter(c => c.id !== id)
    setLocalCats(next)
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) setLocalCats(categories)
    else onCategoriesChange(next) // 同步刪除到父層，避免分類牆殘留已刪分類
  }

  return (
    <div className="space-y-4">
      {/* 新增欄 */}
      <div className="flex flex-col gap-2 p-1.5 bg-slate-950/50 rounded-xl border border-slate-800">
        <div className="flex gap-2">
          <button
            onClick={() => setShowNewIconPicker(!showNewIconPicker)}
            className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-primary hover:bg-primary/10 transition-colors shrink-0"
          >
            <IconRenderer name={newCatIcon} size={16} />
            <ChevronDown size={12} />
          </button>
          <input
            type="text"
            placeholder="輸入新分類名稱..."
            className="flex-1 min-w-0 bg-transparent border-none rounded-lg px-3 py-2 text-sm text-white focus:outline-none placeholder:text-slate-600"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
          />
          <button
            onClick={handleAddCategory}
            disabled={isAdding || !newCatName.trim()}
            aria-label="新增分類"
            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-violet-500 text-white font-medium transition-all hover:bg-violet-400 active:scale-95 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed"
          >
            {isAdding ? <Loader2 className="animate-spin" size={18} /> : <Plus size={20} strokeWidth={2.5} />}
          </button>
        </div>

        <AnimatePresence>
          {showNewIconPicker && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="grid grid-cols-7 gap-1 p-2 bg-slate-900 rounded-lg border border-slate-800 overflow-hidden"
            >
              {AVAILABLE_ICONS.map(iconName => (
                <button
                  key={iconName}
                  onClick={() => { setNewCatIcon(iconName); setShowNewIconPicker(false) }}
                  className={`p-2 rounded hover:bg-slate-800 transition-colors ${newCatIcon === iconName ? 'bg-primary/20 text-primary' : 'text-slate-500'}`}
                >
                  <IconRenderer name={iconName} size={18} />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 提示文字 */}
      {categories.length > 0 && (localCats.length > 0) && (
        <p className="text-[10px] text-slate-700 text-center font-medium tracking-wider uppercase">
          向左滑動可刪除
        </p>
      )}

      {/* 分類列表 */}
      <div className="flex flex-col gap-1.5">
        {localCats.map(cat => (
          <CategoryItem
            key={cat.id}
            cat={cat}
            onEdit={handleUpdateCategory}
            onDelete={handleDeleteCategory}
          />
        ))}
        {localCats.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-slate-800/50 rounded-2xl text-slate-500 gap-2">
            <Tag size={24} className="opacity-20" />
            <p className="text-[11px] font-bold uppercase tracking-widest opacity-40">尚未建立任何分類</p>
          </div>
        )}
      </div>
    </div>
  )
}
