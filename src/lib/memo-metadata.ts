import { getAuthorHandle, needsMetadataRefresh } from './post-metadata'

interface MemoMetadata {
  url?: string
  author_handle?: string | null
  author_bio?: string | null
  content_snippet?: string | null
  preview_image?: string | null
}

/** Show a known author immediately, including older bookmarks awaiting repair. */
export function getMemoAuthor(memo: MemoMetadata): string {
  if (!needsMetadataRefresh(memo.author_handle)) return memo.author_handle!.trim()
  try {
    const handle = getAuthorHandle(new URL(memo.url || '').pathname, '')
    return needsMetadataRefresh(handle) ? '' : handle
  } catch {
    return ''
  }
}

export function needsMemoMetadataRefresh(memo: MemoMetadata): boolean {
  return needsMetadataRefresh(memo.author_handle) || !memo.preview_image?.trim()
}

/** Only repair metadata; unavailable remote values must never erase saved data. */
export function getMetadataPatch(
  memo: MemoMetadata,
  parsed: Record<string, unknown>,
  { replaceImage = false }: { replaceImage?: boolean } = {},
): Partial<MemoMetadata> {
  const patch: Partial<MemoMetadata> = {}
  for (const field of ['author_handle', 'author_bio', 'content_snippet', 'preview_image'] as const) {
    const value = parsed[field]
    if (typeof value !== 'string' || !value.trim() || value === memo[field]) continue
    if (field === 'author_handle' && needsMetadataRefresh(value)) continue
    if (field === 'content_snippet' && memo.content_snippet?.trim()) continue
    // A saved cover is only replaced when the user asks or the current image is broken.
    if (field === 'preview_image' && memo.preview_image?.trim() && !replaceImage) continue
    patch[field] = value
  }
  return patch
}
