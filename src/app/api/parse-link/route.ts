import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isSupportedSocialUrl } from '@/lib/preview-image'
import { createStorageUploader, parsePost } from '@/lib/parse-post'
import { InvalidPostError, isInvalidPostUrl } from '@/lib/social-metadata'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  try {
    // Auth gate：未登入禁止呼叫，避免 API 被任意 SSRF / 濫用
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { url } = await req.json()
    if (!url) return NextResponse.json({ error: '無效連結' }, { status: 400 })

    const invalidPostMessage = '這是 Threads 的錯誤頁，不是貼文連結。請回 Threads App 按「分享 → 複製連結」再貼上'
    if (isInvalidPostUrl(url)) return NextResponse.json({ error: invalidPostMessage }, { status: 400 })

    const cleanUrl = url.split('?')[0]
    const urlObj = new URL(cleanUrl)

    if (!isSupportedSocialUrl(urlObj)) {
      return NextResponse.json({ error: '僅支援 Threads 或 Instagram 連結' }, { status: 400 })
    }

    const { jina, ...parsed } = await parsePost(cleanUrl, createStorageUploader(getSupabaseAdmin))
    void jina // Raw reader content is only needed by parse-and-update.
    return NextResponse.json(parsed)

  } catch (error) {
    if (error instanceof InvalidPostError) {
      return NextResponse.json({ error: '這則貼文已刪除或不公開，抓不到內容' }, { status: 400 })
    }
    console.error('parse-link error:', error)
    return NextResponse.json({ error: '解析失敗' }, { status: 500 })
  }
}
