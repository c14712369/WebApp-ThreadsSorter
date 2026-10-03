import assert from 'node:assert/strict'
import test from 'node:test'
import { getPreviewImageCandidates, isAllowedImageUrl, isSupportedSocialUrl, persistPreviewImage } from './preview-image'

test('uses the author photo when a text-only post exposes only a platform logo', () => {
  assert.deepEqual(getPreviewImageCandidates({
    jinaImages: [],
    postOgImage: 'https://static.cdninstagram.com/rsrc.php/logo.png',
    profileAvatar: 'https://cdninstagram.com/avatar.jpg',
  }), ['https://cdninstagram.com/avatar.jpg'])
})

test('keeps post photos ahead of the avatar and drops unusable candidates', () => {
  assert.deepEqual(getPreviewImageCandidates({
    jinaImages: ['https://untrusted.example/preview.jpg', 'https://cdninstagram.com/post.jpg'],
    postOgImage: 'https://cdninstagram.com/post.jpg',
    profileAvatar: 'https://cdninstagram.com/avatar.jpg',
  }), ['https://cdninstagram.com/post.jpg', 'https://cdninstagram.com/avatar.jpg'])
})

test('uses the post Open Graph image when Jina has no image', () => {
  const ogImage = 'https://scontent.ftpe9-1.fna.fbcdn.net/post.jpg'

  assert.deepEqual(
    getPreviewImageCandidates({ jinaImages: [], postOgImage: ogImage, profileAvatar: 'https://cdninstagram.com/avatar.jpg' }),
    [ogImage, 'https://cdninstagram.com/avatar.jpg'],
  )
})

test('uses the next persisted candidate when the first CDN URL fails', async () => {
  const ogImage = 'https://scontent.ftpe9-1.fna.fbcdn.net/post.jpg'
  assert.equal(
    await persistPreviewImage(['https://scontent.ftpe9-1.fna.fbcdn.net/expired.jpg', ogImage], async (url) => url === ogImage ? 'https://project.supabase.co/storage/v1/object/public/memos/post.jpg' : null),
    'https://project.supabase.co/storage/v1/object/public/memos/post.jpg',
  )
})

test('falls back to a proxied CDN URL when every persistence attempt fails', async () => {
  const imageUrl = 'https://scontent.ftpe9-1.fna.fbcdn.net/post.jpg'

  assert.equal(
    await persistPreviewImage([imageUrl], async () => null),
    imageUrl,
  )
})

test('rejects lookalike social domains and non-HTTPS image URLs', () => {
  assert.equal(isSupportedSocialUrl(new URL('https://threads.com.attacker.example/@a/post/1')), false)
  assert.equal(isSupportedSocialUrl(new URL('https://www.threads.com/@a/post/1')), true)
  assert.equal(isAllowedImageUrl('http://scontent.ftpe9-1.fna.fbcdn.net/post.jpg'), false)
  assert.equal(isAllowedImageUrl('https://cdninstagram.com/post.jpg'), true)
})
