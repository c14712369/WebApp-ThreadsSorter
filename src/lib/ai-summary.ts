import { GoogleGenerativeAI } from '@google/generative-ai'

export const GEMINI_MODEL = 'gemini-3.5-flash-lite'

export type CategoryOption = { id: string; name: string }
export type SummaryInput = { url?: string; snippet?: string; title?: string }
export type SummaryResult = { summary: string | null; tags: string[]; categoryId: string | null }

/** 組 prompt；有分類時要求 AI 同一次呼叫順便從使用者的分類挑一個（不多花 API 次數） */
export function buildSummaryPrompt({ url, snippet, title }: SummaryInput, categories: CategoryOption[]) {
  const hasContent = !!snippet && snippet.trim().length > 5
  const hasCats = categories.length > 0
  const catBlock = hasCats
    ? `
另外，請從使用者的分類清單中挑出**最適合的一個**，只能原樣回傳清單裡的名稱；沒有明顯適合的就回 null，不要硬塞：
${categories.map(c => `- ${c.name}`).join('\n')}
`
    : ''
  const catField = hasCats ? `, "category": "分類名稱或 null"` : ''

  return hasContent
    ? `
你是一個專門替社群貼文（Threads / Instagram）整理摘要的 AI 助手。
使用者提供了一篇貼文的片段，請你：
1. 用「繁體中文」**一句話**總結這篇貼文的核心重點 (50字以內)。
2. 從內容中提取出 1~3 個最適合的分類標籤 (Tags)，每個標籤不超過 5 個字。
${catBlock}
作者：${title || '未知'}
貼文片段：${snippet}
貼文網址：${url || '無'}

請嚴格使用以下 JSON 格式回傳，不要加上 \`\`\`json 等任何 Markdown 標記語法：
{"summary": "一句話重點摘要", "tags": ["標籤1", "標籤2"]${catField}}
`
    : `
你是一個社群貼文書籤助手。
使用者儲存了一篇 Threads 貼文，但系統無法取得貼文內文（Threads 封鎖了伺服器端爬取）。

請根據以下資訊，為這篇書籤產生一個簡短的**預設標題**（20字以內，繁體中文），以及 1~2 個分類 tags。
${catBlock}
- 作者：${title || '未知帳號'}
- 貼文網址：${url || '無'}

回傳格式（嚴格 JSON，不加 markdown）：
{"summary": "預設標題", "tags": ["標籤1"]${catField}}
`
}

/** 解析 AI 回應；找不到 JSON 回 null。分類名稱不在清單內一律視為未分類 */
export function parseAiResponse(text: string, categories: CategoryOption[]): SummaryResult | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  let data: any
  try {
    data = JSON.parse(jsonMatch[0])
  } catch {
    return null
  }

  const picked = typeof data.category === 'string' ? data.category.trim().toLowerCase() : ''
  const matched = picked ? categories.find(c => c.name.trim().toLowerCase() === picked) : undefined

  return {
    summary: typeof data.summary === 'string' ? data.summary : null,
    tags: Array.isArray(data.tags) ? data.tags.filter((t: unknown): t is string => typeof t === 'string') : [],
    categoryId: matched?.id ?? null,
  }
}

/** 呼叫 Gemini 產生摘要、標籤與分類；失敗會丟錯，由呼叫端決定如何降級 */
export async function generateSummary(input: SummaryInput, categories: CategoryOption[]): Promise<SummaryResult> {
  if (!process.env.GEMINI_API_KEY) throw new Error('尚未設定 GEMINI_API_KEY 環境變數，無法使用 AI 功能')
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: GEMINI_MODEL })
  const result = await model.generateContent(buildSummaryPrompt(input, categories))
  const parsed = parseAiResponse(result.response.text(), categories)
  if (!parsed) throw new Error('AI 回傳格式錯誤：找不到 JSON 結構')
  return parsed
}
