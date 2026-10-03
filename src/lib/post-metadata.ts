const PLACEHOLDER_HANDLES = new Set(['未知作者', '解析失敗'])

/** When passing multiple titles, place the Jina content's own title last. */
export function getAuthorHandle(pathname: string, titles: string | string[], jinaContent = ''): string {
  let decodedPath = pathname
  try { decodedPath = decodeURIComponent(pathname) } catch { /* Keep malformed paths unmodified. */ }
  const urlHandle = decodedPath.split('/').find((part) => /^@[a-z0-9._-]+$/i.test(part))
  if (urlHandle) return urlHandle.slice(1)

  for (const title of typeof titles === 'string' ? [titles] : titles) {
    const normalizedTitle = title.replace(/&#0*64;|&#x40;/gi, '@')
    const titleMatch = normalizedTitle.match(/\(\s*@([a-z0-9._-]+)\s*\)\s+on\s+(?:threads|instagram)/i)
      || normalizedTitle.match(/^@?([a-z0-9._-]+)\s+on\s+instagram\b/i)
    if (titleMatch?.[1]) return titleMatch[1]
  }

  // Login pages contain suggested profiles unrelated to the requested post.
  const contentTitle = typeof titles === 'string' ? titles : titles[titles.length - 1] || ''
  if (/\blog[\s-]*in\b|\bsign[\s-]*(?:in|up)\b|\bjoin\s+(?:threads|instagram)\b|登入|登录|註冊|注册/i.test(contentTitle)) return '未知作者'

  const profileMatch = jinaContent.match(/https?:\/\/(?:www\.)?(?:threads\.(?:com|net)|instagram\.com)\/@([a-z0-9._-]+)/i)
  if (profileMatch?.[1]) return profileMatch[1]
  const instagramProfiles = jinaContent.matchAll(/https?:\/\/(?:www\.)?instagram\.com\/([a-z0-9._-]+)\/?(?=[\s)\]?#]|$)/gi)
  const reserved = new Set(['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct', 'about', 'legal'])
  for (const match of instagramProfiles) {
    if (!reserved.has(match[1].toLowerCase())) return match[1]
  }
  return '未知作者'
}

export function getAuthorProfileUrl(postUrl: URL, authorHandle: string): string | null {
  if (!/^[a-z0-9._-]+$/i.test(authorHandle)) return null
  const isInstagram = postUrl.hostname === 'instagram.com' || postUrl.hostname.endsWith('.instagram.com')
  return isInstagram ? `https://www.instagram.com/${authorHandle}/` : `https://www.threads.com/@${authorHandle}`
}

export function needsMetadataRefresh(authorHandle?: string | null): boolean {
  return !authorHandle?.trim() || PLACEHOLDER_HANDLES.has(authorHandle.trim())
}
