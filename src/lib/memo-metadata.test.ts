import assert from 'node:assert/strict'
import test from 'node:test'
import { getMemoAuthor, getMetadataPatch, needsMemoMetadataRefresh } from './memo-metadata'

test('shows the URL author while saved metadata is missing', () => {
  assert.equal(getMemoAuthor({ url: 'https://www.threads.com/@alice/post/123', author_handle: null }), 'alice')
  assert.equal(getMemoAuthor({ url: 'https://www.threads.com/@alice/post/123', author_handle: '未知作者' }), 'alice')
  assert.equal(getMemoAuthor({ url: 'not a url', author_handle: null }), '')
})

test('repairs a missing cover even when the author is already saved', () => {
  assert.equal(needsMemoMetadataRefresh({ author_handle: 'alice', preview_image: null }), true)
  assert.equal(needsMemoMetadataRefresh({ author_handle: 'alice', preview_image: 'https://cdninstagram.com/photo.jpg' }), false)
})

test('metadata repair preserves edited content and ignores unavailable values', () => {
  const memo = { author_handle: 'alice', author_bio: 'Existing bio', content_snippet: 'My edited content', preview_image: 'https://cdninstagram.com/photo.jpg' }
  assert.deepEqual(getMetadataPatch(memo, { author_handle: '未知作者', author_bio: '', content_snippet: 'Remote content', preview_image: null }), {})
  assert.deepEqual(getMetadataPatch(memo, { author_handle: 'alice', preview_image: 'https://cdninstagram.com/new.jpg' }, { replaceImage: true }), { preview_image: 'https://cdninstagram.com/new.jpg' })
})

test('background author repair keeps an existing original cover', () => {
  const memo = { author_handle: null, preview_image: 'https://cdninstagram.com/original.jpg' }
  assert.deepEqual(getMetadataPatch(memo, { author_handle: 'alice', preview_image: 'https://cdninstagram.com/avatar.jpg' }), { author_handle: 'alice' })
})

test('repairs author and avatar together without touching notes or categories', () => {
  assert.deepEqual(getMetadataPatch({ author_handle: null, content_snippet: '' }, {
    author_handle: 'alice', author_bio: 'Author bio', content_snippet: 'Original text', preview_image: 'https://cdninstagram.com/avatar.jpg', personal_note: 'Do not copy', category_id: 'Do not copy',
  }), { author_handle: 'alice', author_bio: 'Author bio', content_snippet: 'Original text', preview_image: 'https://cdninstagram.com/avatar.jpg' })
})
