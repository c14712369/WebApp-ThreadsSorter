import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isSupportedSocialUrl } from '@/lib/preview-image'
import { createStorageUploader, parsePost } from '@/lib/parse-post'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { generateSummary, type SummaryResult } from '@/lib/ai-summary'

export async function POST(req: Request) {
  let requestData: { id?: string, url?: string } = {}
  try {
    // Auth gate：未登入禁止呼叫，避免 API 被任意 SSRF / 濫用
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    requestData = await req.json()
    const { id, url } = requestData
    if (!id || !url) return NextResponse.json({ error: '無效參數' }, { status: 400 })

    const cleanUrl = url.split('?')[0]
    const urlObj = new URL(cleanUrl)

    if (!isSupportedSocialUrl(urlObj)) {
      // 標註為解析失敗
      const supabase = await createClient()
      await supabase.from('memos').update({ author_handle: '解析失敗' }).eq('id', id)
      return NextResponse.json({ error: '不支援的連結' }, { status: 400 })
    }

    const parsed = await parsePost(cleanUrl, createStorageUploader(getSupabaseAdmin))
    const { jina, author_handle: authorHandle, author_bio: authorBio, content_snippet: contentSnippet, preview_image: previewImage } = parsed

    const supabase = await createClient()
    const { data: memo } = await supabase.from('memos').select('user_id, category_id').eq('id', id).single()
    const { data: categories } = memo?.user_id
      ? await supabase.from('categories').select('id, name').eq('user_id', memo.user_id)
      : { data: null }

    // AI summary + 分類（同一次呼叫）；失敗時為 null，不覆蓋既有摘要
    let aiResult: SummaryResult | null = null
    try {
      aiResult = await generateSummary({ url: cleanUrl, snippet: contentSnippet, title: authorHandle }, categories || [])
    } catch (err) {
      console.error('generateSummary err:', err)
    }

    let finalCategoryId: string | null = null
    let aiTags = aiResult?.tags || []

    // 只替尚未分類的收藏補分類：AI 有挑就用，否則退回關鍵字比對
    if (memo && !memo.category_id && categories && categories.length > 0) {
      if (aiResult?.categoryId) {
        finalCategoryId = aiResult.categoryId
      } else {
        const fullText = `${jina.content || ''} ${jina.description || ''} ${aiResult?.summary || ''} ${aiTags.join(' ')}`.toLowerCase()
        const matched = categories.filter(cat => fullText.includes(cat.name.toLowerCase()))
        if (matched.length === 1) {
          finalCategoryId = matched[0].id
        } else if (matched.length > 1) {
          // Store matched category IDs in ai_tags with a prefix so UI can pick them up
          aiTags = Array.from(new Set([...aiTags, ...matched.map(m => `[CAT]${m.id}`)]))
        }
      }
    }

    // Update the DB record
    const updateData: any = {
      author_handle: authorHandle,
      author_bio: authorBio,
      content_snippet: contentSnippet || aiResult?.summary || '',
      preview_image: previewImage,
    }

    if (aiResult) {
      updateData.ai_summary = aiResult.summary
      updateData.ai_tags = aiTags
    }

    if (finalCategoryId) {
      updateData.category_id = finalCategoryId
    }

    const { error: updateError } = await supabase.from('memos').update(updateData).eq('id', id)

    if (updateError) throw updateError

    return NextResponse.json({ success: true, memo: { ...updateData, id } })

  } catch (error: any) {
    console.error('parse-and-update error:', error)
    // 如果發生嚴重錯誤，我們也給 author_handle 一個假值，免得卡在 loading 狀態
    try {
        if (requestData.id) {
            const supabase = await createClient()
            await supabase.from('memos').update({ author_handle: '解析失敗' }).eq('id', requestData.id)
        }
    } catch(e) {}
    return NextResponse.json({ error: '解析與更新失敗' }, { status: 500 })
  }
}
