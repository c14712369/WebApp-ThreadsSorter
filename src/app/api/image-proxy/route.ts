export const runtime = 'edge'

// 僅允許 Threads / Instagram 相關 CDN，避免 SSRF
const ALLOWED_HOSTS = [
  'instagram.com',
  'cdninstagram.com',
  'threads.net',
  'threads.com',
  'cdn-cgi.net',
  'fbcdn.net',
]

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const imageUrl = searchParams.get('url')

  if (!imageUrl) {
    return new Response('Missing url parameter', { status: 400 })
  }

  // SSRF 防護：協議 + hostname 白名單
  let parsed: URL
  try {
    parsed = new URL(imageUrl)
  } catch {
    return new Response('Invalid url', { status: 400 })
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return new Response('Disallowed protocol', { status: 400 })
  }
  const isAllowed = ALLOWED_HOSTS.some(
    (h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h)
  )
  if (!isAllowed) {
    return new Response('Disallowed host', { status: 400 })
  }

  try {
    const isIG = imageUrl.includes('cdninstagram') || imageUrl.includes('fbcdn')
    const referer = isIG ? 'https://www.instagram.com/' : 'https://www.threads.net/'
    const origin = isIG ? 'https://www.instagram.com' : 'https://www.threads.net'

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        'Referer': referer,
        'Origin': origin,
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
      }
    })

    if (!response.ok) {
      return new Response('Failed to fetch image', { status: response.status })
    }

    const contentType = response.headers.get('Content-Type') || 'image/jpeg'

    // 直接串流，不 buffer 進記憶體 → 更快、更省記憶體
    return new Response(response.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    })
  } catch (error: any) {
    return new Response('Error fetching image', { status: 500 })
  }
}
