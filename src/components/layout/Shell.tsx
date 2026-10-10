'use client'

import { ReactNode, Suspense } from 'react'
import { Plus, Home, Folder, Star, User, LogOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { UpdateBanner } from '@/components/UpdateBanner'

function ShellContent({ children }: { children: ReactNode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab') || 'home'

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="h-[100dvh] w-full bg-[#030712] text-foreground flex flex-col md:flex-row overflow-hidden relative">
      {/* Main Content Container - Centered and limited width on desktop */}
      <div className="flex-1 flex justify-center h-full">
        <main className="w-full max-w-xl bg-background flex flex-col h-full overflow-hidden relative md:border-x md:border-white/5 md:shadow-2xl">
          <section className="flex-1 flex flex-col overflow-hidden relative">
            {children}
          </section>
        </main>
      </div>
      <UpdateBanner />
    </div>
  )
}

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>}>
      <ShellContent>{children}</ShellContent>
    </Suspense>
  )
}function NavItem({ icon, label, href, active, vertical }: { icon: React.ReactNode, label?: string, href: string, active?: boolean, vertical?: boolean }) {
  return (
    <Link 
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors",
        active ? "text-primary bg-primary/10" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50",
        vertical && "flex-col gap-1 px-1 py-1"
      )}
    >
      {icon}
      {label && <span className="font-medium">{label}</span>}
    </Link>
  )
}
