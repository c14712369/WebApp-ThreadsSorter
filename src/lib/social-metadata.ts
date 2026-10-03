import * as cheerio from 'cheerio'
import { getAuthorProfileUrl } from './post-metadata'
import { isSupportedSocialUrl } from './preview-image'

async function fetchSocialHtml(url: string, request: typeof fetch): Promise<string> {
  let current = new URL(url)
  const signal = AbortSignal.timeout(10_000)
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!isSupportedSocialUrl(current)) throw new Error('Unsupported social URL')
    const response = await request(current.href, {
      headers: { 'User-Agent': 'facebookexternalhit/1.1' },
      redirect: 'manual',
      signal,
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new Error('Missing redirect destination')
      current = new URL(location, current)
      continue
    }
    if (!response.ok) throw new Error(`Social request failed: ${response.status}`)
    return response.text()
  }
  throw new Error('Too many social redirects')
}

export async function fetchAuthorProfile(postUrl: URL, authorHandle: string, request: typeof fetch = fetch) {
  const profileUrl = getAuthorProfileUrl(postUrl, authorHandle)
  if (!profileUrl) return { bio: '', avatar: '' }
  try {
    const $ = cheerio.load(await fetchSocialHtml(profileUrl, request))
    const raw = $('meta[property="og:description"]').attr('content') || ''
    const isLoginPrompt = /join threads|log in|sign up/i.test(raw)
    let bio = ''
    if (!isLoginPrompt && raw) {
      const parts = raw.split('•')
      bio = parts.length >= 3
        ? parts.slice(2).join('•').replace(/\s*See the latest\b.*/i, '').trim() || `${parts[0].trim()} · ${parts[1].trim()}`
        : raw.replace(/\s*See the latest\b.*/i, '').trim()
    }
    const ogImage = $('meta[property="og:image"]').attr('content')?.replace(/&amp;/g, '&') || ''
    return { bio, avatar: ogImage && !ogImage.includes('rsrc.php') ? ogImage : '' }
  } catch {
    return { bio: '', avatar: '' }
  }
}

export async function fetchPostMetadata(url: string, request: typeof fetch = fetch) {
  try {
    const $ = cheerio.load(await fetchSocialHtml(url, request))
    return {
      image: $('meta[property="og:image"]').attr('content')?.replace(/&amp;/g, '&') || '',
      title: $('meta[property="og:title"]').attr('content') || '',
    }
  } catch {
    return { image: '', title: '' }
  }
}
