import assert from 'node:assert/strict'
import test from 'node:test'
import * as metadata from './post-metadata'
const { getAuthorHandle, needsMetadataRefresh } = metadata

test('uses the author handle from a Threads URL', () => {
  assert.equal(getAuthorHandle('/@ryue_.z/post/DdVxo6Lgdml', ''), 'ryue_.z')
})

test('falls back to the post Open Graph title when the URL has no handle', () => {
  assert.equal(getAuthorHandle('/post/DdVxo6Lgdml', 'RuiYue (@ryue_.z) on Threads'), 'ryue_.z')
})

test('falls back to a profile URL in Jina content when the URL and title omit the handle', () => {
  const content = '[ryue_.z](https://www.threads.com/@ryue_.z)\n\n這個作者的貼文'
  assert.equal(getAuthorHandle('/post/DdVxo6Lgdml', 'Thread', content), 'ryue_.z')
})

test('marks placeholder author values as requiring a metadata refresh', () => {
  assert.equal(needsMetadataRefresh('未知作者'), true)
  assert.equal(needsMetadataRefresh('解析失敗'), true)
  assert.equal(needsMetadataRefresh('ryue_.z'), false)
})

test('tries Jina title after a generic Open Graph title', () => {
  assert.equal(getAuthorHandle('/post/abc', ['Threads', 'Alice (@alice) on Threads']), 'alice')
})

test('recognizes Instagram handle titles and profile links without an at sign', () => {
  assert.equal(getAuthorHandle('/p/abc', 'alice on Instagram: “A post”'), 'alice')
  assert.equal(getAuthorHandle('/p/abc', 'Instagram', '[Alice](https://www.instagram.com/alice/)'), 'alice')
  assert.equal(getAuthorHandle('/p/abc', 'Instagram', 'https://www.instagram.com/p/abc'), '未知作者')
})

test('decodes URL handles before using them', () => {
  assert.equal(getAuthorHandle('/%40alice/post/abc', ''), 'alice')
})

test('builds profile URLs from the resolved author and platform', () => {
  const author = getAuthorHandle('/post/abc', 'Alice (@alice) on Threads')
  assert.equal(metadata.getAuthorProfileUrl(new URL('https://www.threads.net/post/abc'), author), 'https://www.threads.com/@alice')
  assert.equal(metadata.getAuthorProfileUrl(new URL('https://www.instagram.com/p/abc'), 'alice'), 'https://www.instagram.com/alice/')
})

test('does not build profile requests for unknown or invalid authors', () => {
  for (const author of ['未知作者', '解析失敗', '', 'alice/other']) {
    assert.equal(metadata.getAuthorProfileUrl(new URL('https://www.threads.com/post/abc'), author), null)
  }
})

test('does not mistake login page suggestions for the post author', () => {
  const content = '[Unrelated](https://www.threads.com/@unrelated)'
  for (const title of ['Threads • Log in', 'Threads • Login', 'Instagram • Sign up', 'Threads • 登入', 'Threads • 註冊', 'Threads • 登录']) {
    assert.equal(getAuthorHandle('/post/x', title, content), '未知作者')
  }
})

test('keeps URL and post title authors when Jina returns a login page', () => {
  const content = '[Unrelated](https://www.threads.com/@unrelated)'
  assert.equal(getAuthorHandle('/@alice/post/x', 'Threads • Log in', content), 'alice')
  assert.equal(getAuthorHandle('/post/x', ['Alice (@alice) on Threads', 'Threads • Log in'], content), 'alice')
})

test('uses the Jina source title to gate content without rejecting a generic title', () => {
  const content = '[Alice](https://www.threads.com/@alice)'
  assert.equal(getAuthorHandle('/post/x', ['Thread', 'Threads • Log in'], content), '未知作者')
  assert.equal(getAuthorHandle('/post/x', ['Threads • Log in', 'Thread'], content), 'alice')
})
