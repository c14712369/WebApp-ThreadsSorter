import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { generateSummary } from '@/lib/ai-summary'

export async function POST(request: NextRequest) {
  try {
    // Auth gate：未登入禁止呼叫，避免 Gemini 額度被任意濫用
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { url, snippet, title } = await request.json()

    // 分類清單讀取失敗就不讓 AI 挑分類，摘要照常產生
    const { data: categories } = await supabase.from('categories').select('id, name').eq('user_id', user.id)

    const result = await generateSummary({ url, snippet, title }, categories || [])

    return NextResponse.json({
      summary: result.summary,
      tags: result.tags,
      category_id: result.categoryId
    })

  } catch (error: any) {
    console.error('Gemini API Error:', error)
    return NextResponse.json(
      { error: error.message || 'AI 摘要產生失敗' },
      { status: 500 }
    )
  }
}
