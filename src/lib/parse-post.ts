import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getPreviewImageCandidates, isAllowedImageUrl, persistPreviewImage } from './preview-image'
import { getAuthorHandle } from './post-metadata'
import { InvalidPostError, fetchAuthorProfile, fetchPostMetadata, resolvePostUrl } from './social-metadata'

const BOT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'

export interface JinaResult {
  title: string
  content: string
  description: string
  images: string[]
}

export interface ParsedPost {
  author_handle: string
  author_bio: string
  content_snippet: string
  preview_image: string | null
  url: string
  jina: JinaResult
}

const EMPTY_JINA: JinaResult = { title: '', content: '', description: '', images: [] }

/** Store remote images in Supabase Storage so expiring Meta CDN links are not saved. */
export function createStorageUploader(getClient: () => Promise<SupabaseClient> | SupabaseClient) {
  return async (imageUrl: string): Promise<string | null> => {
    try {
      if (!isAllowedImageUrl(imageUrl)) return null
      const response = await fetch(imageUrl, { headers: { 'User-Agent': BOT_UA }, redirect: 'error' })
      if (!response.ok) return null

      const buffer = await response.arrayBuffer()
      const contentType = response.headers.get('content-type') || 'image/jpeg'
      const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg'
      const fileName = `${crypto.createHash('md5').update(imageUrl).digest('hex')}.${ext}`

      const supabase = await getClient()
      const { error } = await supabase.storage.from('memos').upload(fileName, buffer, { contentType, upsert: true })
      if (error) throw error

      return supabase.storage.from('memos').getPublicUrl(fileName).data.publicUrl
    } catch (err) {
      console.error('uploadToSupabase error:', err instanceof Error ? err.message : err)
      return null
    }
  }
}

/** 用 Jina AI Reader 取得 Threads 貼文內文（突破 JS 渲染限制） */
async function fetchViaJina(url: string): Promise<JinaResult> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return EMPTY_JINA
    const json = await res.json()
    const content: string = json.data?.content || ''

    // 從 content 中找出貼文圖（-15 格式）與連結預覽縮圖，排除頭像（-19）
    const images = (content.match(/https:\/\/[^\s)"\]]+/g) || [])
      .filter((u) => !u.includes('rsrc.php') && (/t51\.\d+-15/.test(u) || u.includes('fbcdn.net/emg1')))
      .map((u) => u.replace(/&amp;/g, '&'))

    return { title: json.data?.title || '', description: json.data?.description || '', content, images }
  } catch {
    return EMPTY_JINA
  }
}

function getContentSnippet(jina: JinaResult): string {
  // 優先用 Jina description（最乾淨），再 fallback content 第一段
  let snippet = jina.description || ''
  if (!snippet && jina.content) {
    const firstLine = jina.content.split('\n').find((l) => l.replace(/[#\[\]()]/g, '').trim().length > 10) || ''
    snippet = firstLine.replace(/^#+\s*/, '').trim()
  }
  const chars = Array.from(snippet.replace(/\s+/g, ' ').trim())
  return chars.length > 150 ? chars.slice(0, 150).join('') + '...' : chars.join('')
}

/** Resolve author first, so the profile request targets the right account. */
export async function parsePost(inputUrl: string, upload: (url: string) => Promise<string | null>): Promise<ParsedPost> {
  let cleanUrl = inputUrl
  try {
    cleanUrl = await resolvePostUrl(inputUrl)
  } catch (err) {
    if (err instanceof InvalidPostError) throw err
    // Network hiccups fall back to parsing the original link.
  }
  const urlObj = new URL(cleanUrl)
  const [jinaResult, postResult] = await Promise.allSettled([fetchViaJina(cleanUrl), fetchPostMetadata(cleanUrl)])
  const jina = jinaResult.status === 'fulfilled' ? jinaResult.value : EMPTY_JINA
  const postMetadata = postResult.status === 'fulfilled' ? postResult.value : { image: '', title: '' }

  const authorHandle = getAuthorHandle(urlObj.pathname, [postMetadata.title, jina.title], jina.content)
  const profile = await fetchAuthorProfile(urlObj, authorHandle)

  const candidateUrls = getPreviewImageCandidates({ jinaImages: jina.images, postOgImage: postMetadata.image, profileAvatar: profile.avatar })
  const previewImage = await persistPreviewImage(candidateUrls, upload)

  return {
    author_handle: authorHandle,
    author_bio: profile.bio || '',
    content_snippet: getContentSnippet(jina),
    preview_image: previewImage,
    url: cleanUrl,
    jina,
  }
}
