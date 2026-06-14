'use client'

import { ArrowLeft } from 'lucide-react'
import { CategoryManager } from './CategoryManager'

export function CategoryManagerModal({
  isOpen,
  onClose,
  userId,
  categories,
  onCategoriesChange
}: {
  isOpen: boolean
  onClose: () => void
  userId: string
  categories: any[]
  onCategoriesChange: (optimistic?: any[]) => void
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[110] bg-[#0B1120] flex flex-col">

      {/* Header */}
      <div
        className="shrink-0 flex items-center gap-3 px-5 border-b border-white/[0.06]"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)', paddingBottom: '16px' }}
      >
        <button
          onClick={onClose}
          aria-label="返回"
          className="p-2 -ml-2 text-slate-400 hover:text-white transition-colors rounded-xl active:scale-95"
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-black text-white tracking-tight">管理分類</h1>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
        <div
          className="px-5 pt-5"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 32px)' }}
        >
          <CategoryManager
            userId={userId}
            categories={categories}
            onCategoriesChange={onCategoriesChange}
          />
        </div>
      </div>

    </div>
  )
}
