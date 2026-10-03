import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { isSupportedSocialUrl } from '@/lib/preview-image'
import { createStorageUploader, parsePost } from '@/lib/parse-post'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { GoogleGenerativeAI } from '@google/generative-ai'

// 初始化 Gemini API (需要環境變數 GEMINI_API_KEY)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

async function generateSummary(url: string, snippet: string, title: string) {
  if (!process.env.GEMINI_API_KEY) return { summary: null, tags: [] }
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })
    const hasContent = snippet && snippet.trim().length > 5
    const prompt = hasContent
      ? `
你是一個專門替社群貼文（Threads / Instagram）整理摘要的 AI 助手。
使用者提供了一篇貼文的片段，請你：
1. 用「繁體中文」**一句話**總結這篇貼文的核心重點 (50字以內)。
2. 從內容中提取出 1~3 個最適合的分類標籤 (Tags)，每個標籤不超過 5 個字。

作者：${title || '未知'}
貼文片段：${snippet}
貼文網址：${url || '無'}

請嚴格使用以下 JSON 格式回傳，不要加上 \`\`\`json 等任何 Markdown 標記語法：
{"summary": "一句話重點摘要", "tags": ["標籤1", "標籤2"]}
`
      : `
你是一個社群貼文書籤助手。
使用者儲存了一篇 Threads 貼文，但系統無法取得貼文內文。

請根據以下資訊，為這篇書籤產生一個簡短的**預設標題**（20字以內，繁體中文），以及 1~2 個分類 tags。
- 作者：${title || '未知帳號'}
- 貼文網址：${url || '無'}

回傳格式（嚴格 JSON，不加 markdown）：
{"summary": "預設標題", "tags": ["標籤1"]}
`
    const result = await model.generateContent(prompt)
    let cleanedText = result.response.text().trim()
    if (cleanedText.startsWith('\`\`\`json')) cleanedText = cleanedText.replace(/^\`\`\`json/, '').replace(/\`\`\`$/, '').trim()
    else if (cleanedText.startsWith('\`\`\`')) cleanedText = cleanedText.replace(/^\`\`\`/, '').replace(/\`\`\`$/, '').trim()
    
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { summary: null, tags: [] }
    return JSON.parse(jsonMatch[0])
  } catch (err) {
    console.error('generateSummary err:', err)
    return { summary: null, tags: [] }
  }
}

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

    // AI summary
    const aiResult = await generateSummary(cleanUrl, contentSnippet, authorHandle)

    // Keywords matching user categories
    const supabase = await createClient()
    let finalCategoryId = null

    if (id) {
      const { data: memo } = await supabase.from('memos').select('user_id, category_id').eq('id', id).single()
      if (memo && memo.user_id) {
        const { data: categories } = await supabase.from('categories').select('*').eq('user_id', memo.user_id)
        if (categories && categories.length > 0) {
          const fullText = `${jina.content || ''} ${jina.description || ''} ${aiResult.summary || ''} ${(aiResult.tags || []).join(' ')}`.toLowerCase()
          const matched = categories.filter(cat => fullText.includes(cat.name.toLowerCase()))
          
          if (!memo.category_id) {
            if (matched.length === 1) {
              finalCategoryId = matched[0].id
            } else if (matched.length > 1) {
              // Store matched category IDs in ai_tags with a prefix so UI can pick them up
              const matchedPrefixes = matched.map(m => `[CAT]${m.id}`)
              aiResult.tags = Array.from(new Set([...(aiResult.tags || []), ...matchedPrefixes]))
            }
          }
        }
      }
    }

    // Update the DB record
    const updateData: any = {
      author_handle: authorHandle,
      author_bio: authorBio,
      content_snippet: contentSnippet || aiResult.summary || '',
      preview_image: previewImage,
      ai_summary: aiResult.summary,
      ai_tags: aiResult.tags || []
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
