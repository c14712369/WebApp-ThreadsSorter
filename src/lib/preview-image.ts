const SOCIAL_HOSTS = ['threads.net', 'threads.com', 'instagram.com']
const IMAGE_HOSTS = [...SOCIAL_HOSTS, 'cdninstagram.com', 'cdn-cgi.net', 'fbcdn.net']

function hasAllowedHost(hostname: string, allowedHosts: string[]): boolean {
  const normalizedHost = hostname.toLowerCase()
  return allowedHosts.some((host) => normalizedHost === host || normalizedHost.endsWith(`.${host}`))
}

export function isSupportedSocialUrl(url: URL): boolean {
  return url.protocol === 'https:' && hasAllowedHost(url.hostname, SOCIAL_HOSTS)
}

export function isAllowedImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && hasAllowedHost(url.hostname, IMAGE_HOSTS)
  } catch {
    return false
  }
}

export function getPreviewImageCandidates({
  jinaImages,
  postOgImage,
  profileAvatar,
}: {
  jinaImages: string[]
  postOgImage: string
  profileAvatar: string
}): string[] {
  return [...new Set([...jinaImages, postOgImage, profileAvatar]
    .filter((url) => isAllowedImageUrl(url) && !url.includes('rsrc.php')))]
}

/** Prefer a persistent URL, but keep a proxyable CDN fallback when storage is unavailable. */
export async function persistPreviewImage(
  imageUrls: string[],
  upload: (url: string) => Promise<string | null>,
): Promise<string | null> {
  for (const imageUrl of imageUrls) {
    const storedUrl = await upload(imageUrl)
    if (storedUrl) return storedUrl
  }
  return imageUrls[0] || null
}
