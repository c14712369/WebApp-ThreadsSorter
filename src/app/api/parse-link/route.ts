import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getPreviewImageCandidates, isAllowedImageUrl, isSupportedSocialUrl, persistPreviewImage } from '@/lib/preview-image'
import { getAuthorHandle } from '@/lib/post-metadata'
import { fetchAuthorProfile, fetchPostMetadata } from '@/lib/social-metadata'
import crypto from 'crypto'

const BOT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'

async function uploadToSupabase(imageUrl: string): Promise<string | null> {
  try {
    if (!isAllowedImageUrl(imageUrl)) return null
    const response = await fetch(imageUrl, { headers: { 'User-Agent': BOT_UA }, redirect: 'error' })
    if (!response.ok) return null

    const buffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg'
    const hash = crypto.createHash('md5').update(imageUrl).digest('hex')
    const fileName = `${hash}.${ext}`

    const supabase = await createClient()
    const { error } = await supabase.storage
      .from('memos')
      .upload(fileName, buffer, { contentType, upsert: true })
    if (error) throw error

    const { data: { publicUrl } } = supabase.storage.from('memos').getPublicUrl(fileName)
    return publicUrl
  } catch (err: any) {
    console.error('uploadToSupabase error:', err?.message || err)
    return null
  }
}

/** 用 Jina AI Reader 取得 Threads 貼文內文（突破 JS 渲染限制） */
async function fetchViaJina(url: string): Promise<{ title: string; content: string; description: string; images: string[] }> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return { title: '', content: '', description: '', images: [] }
    const json = await res.json()

    const title: string = json.data?.title || ''
    const description: string = json.data?.description || ''
    const content: string = json.data?.content || ''

    // 從 content 中找出所有 CDN 圖片（貼文圖，排除頭像 -19）
    const allUrls = content.match(/https:\/\/[^\s)"\]]+/g) || []
    const imgMatches: string[] = allUrls
      .filter((u: string) => {
        if (u.includes('rsrc.php')) return false
        // 貼文圖（-15 格式）
        if (/t51\.\d+-15/.test(u)) return true
        // 連結預覽縮圖（fbcdn emg1）
        if (u.includes('fbcdn.net/emg1')) return true
        return false
      })
      .map((u: string) => u.replace(/&amp;/g, '&'))

    return { title, content, description, images: imgMatches }
  } catch {
    return { title: '', content: '', description: '', images: [] }
  }
}

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

    const cleanUrl = url.split('?')[0]
    const urlObj = new URL(cleanUrl)

    if (!isSupportedSocialUrl(urlObj)) {
      return NextResponse.json({ error: '僅支援 Threads 或 Instagram 連結' }, { status: 400 })
    }

    // 先解析作者，才能以正確帳號抓取個人頁與頭像。
    const [jinaResult, postOgImageResult] = await Promise.allSettled([
      fetchViaJina(cleanUrl),
      fetchPostMetadata(cleanUrl),
    ])

    const jina = jinaResult.status === 'fulfilled' ? jinaResult.value : { title: '', content: '', description: '', images: [] }
    const postMetadata = postOgImageResult.status === 'fulfilled' ? postOgImageResult.value : { image: '', title: '' }
    const authorHandle = getAuthorHandle(urlObj.pathname, [postMetadata.title, jina.title], jina.content)
    const profile = await fetchAuthorProfile(urlObj, authorHandle)

    const authorBio = profile.bio || ''

    // 貼文內文：優先用 Jina description（最乾淨），再 fallback content 開頭
    let contentSnippet = jina.description || ''
    if (!contentSnippet && jina.content) {
      // 取第一段（去掉 markdown 格式）
      const firstLine = jina.content.split('\n').find(l => l.replace(/[#\[\]()]/g, '').trim().length > 10) || ''
      contentSnippet = firstLine.replace(/^#+\s*/, '').trim()
    }
    contentSnippet = contentSnippet.replace(/\s+/g, ' ').trim()
    const chars = Array.from(contentSnippet)
    if (chars.length > 150) contentSnippet = chars.slice(0, 150).join('') + '...'

    // 僅保存已持久化圖片，避免 Meta CDN 簽名網址到期後失效。
    const candidateUrls = getPreviewImageCandidates({ jinaImages: jina.images, postOgImage: postMetadata.image, profileAvatar: profile.avatar })
    const previewImage = await persistPreviewImage(candidateUrls, uploadToSupabase)

    return NextResponse.json({
      author_handle: authorHandle,
      author_bio: authorBio,
      content_snippet: contentSnippet,
      preview_image: previewImage,
      url: cleanUrl
    })

  } catch (error: any) {
    console.error('parse-link error:', error)
    return NextResponse.json({ error: '解析失敗' }, { status: 500 })
  }
}
