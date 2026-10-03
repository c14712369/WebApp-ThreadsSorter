import assert from 'node:assert/strict'
import test from 'node:test'
import { InvalidPostError, fetchAuthorProfile, fetchPostMetadata, isInvalidPostUrl, resolvePostUrl } from './social-metadata'

test('fetches the resolved author avatar for a post URL without a handle', async () => {
  const profile = await fetchAuthorProfile(new URL('https://www.threads.com/post/abc'), 'alice', async (input, init) => {
    assert.equal(String(input), 'https://www.threads.com/@alice')
    assert.ok(init?.signal)
    return new Response('<meta property="og:image" content="https://cdninstagram.com/avatar.jpg"><meta property="og:description" content="Alice bio">')
  })
  assert.deepEqual(profile, { bio: 'Alice bio', avatar: 'https://cdninstagram.com/avatar.jpg' })
})

test('unknown authors cause no profile request', async () => {
  const profile = await fetchAuthorProfile(new URL('https://www.threads.com/post/abc'), '未知作者', async () => {
    assert.fail('Unknown author must not be requested')
  })
  assert.deepEqual(profile, { bio: '', avatar: '' })
})

test('follows a Threads domain migration and parses the destination metadata', async () => {
  const result = await fetchPostMetadata('https://www.threads.net/post/abc', async (input) => {
    if (String(input) === 'https://www.threads.net/post/abc') {
      return new Response(null, { status: 301, headers: { location: 'https://www.threads.com/post/abc' } })
    }
    assert.equal(String(input), 'https://www.threads.com/post/abc')
    return new Response('<meta property="og:title" content="Alice (@alice) on Threads">')
  })
  assert.deepEqual(result, { image: '', title: 'Alice (@alice) on Threads' })
})

test('rejects redirects outside supported social hosts', async () => {
  let requests = 0
  const result = await fetchPostMetadata('https://www.threads.net/post/abc', async () => {
    requests++
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } })
  })
  assert.equal(requests, 1)
  assert.deepEqual(result, { image: '', title: '' })
})

test('share links resolve to the canonical post URL that names the author', async () => {
  const resolved = await resolvePostUrl('https://www.threads.com/share/BAYwkQPyU9/', async (input, init) => {
    assert.equal(init?.redirect, 'manual')
    if (String(input) === 'https://www.threads.com/share/BAYwkQPyU9/') {
      return new Response(null, { status: 302, headers: { location: 'https://www.threads.com/@shelby.5/post/DdV5?xmt=abc&slof=1' } })
    }
    return new Response('<html></html>')
  })
  assert.equal(resolved, 'https://www.threads.com/@shelby.5/post/DdV5')
})

test('canonical post URLs resolve without any request', async () => {
  const resolved = await resolvePostUrl('https://www.threads.com/@alice/post/abc', async () => assert.fail('No request needed'))
  assert.equal(resolved, 'https://www.threads.com/@alice/post/abc')
})

test('share links that land on the Threads error page are reported as invalid posts', async () => {
  await assert.rejects(
    resolvePostUrl('https://www.threads.com/share/dead/', async () =>
      new Response(null, { status: 302, headers: { location: 'https://www.threads.com/?error=invalid_post' } })),
    InvalidPostError,
  )
})

test('recognizes pasted Threads error pages', () => {
  assert.equal(isInvalidPostUrl('https://www.threads.com/?error=invalid_post'), true)
  assert.equal(isInvalidPostUrl('https://www.threads.com/'), true)
  assert.equal(isInvalidPostUrl('https://www.threads.com/@alice/post/abc'), false)
  assert.equal(isInvalidPostUrl('https://www.threads.com/share/abc/'), false)
  assert.equal(isInvalidPostUrl('https://www.instagram.com/p/abc/'), false)
})
