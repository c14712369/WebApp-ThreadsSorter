import assert from 'node:assert/strict'
import test from 'node:test'
import { getRepairTargets, repairMemos } from './memo-repair'

const STORED = 'https://abc.supabase.co/storage/v1/object/public/memos/a.jpg'
const CDN = 'https://scontent.cdninstagram.com/v/a.jpg?oe=1'

test('targets missing authors, missing covers and expiring CDN covers only', () => {
  const targets = getRepairTargets([
    { id: 'ok', url: 'u', author_handle: 'alice', preview_image: STORED },
    { id: 'author', url: 'u', author_handle: '未知作者', preview_image: STORED },
    { id: 'nocover', url: 'u', author_handle: 'alice', preview_image: null },
    { id: 'cdn', url: 'u', author_handle: 'alice', preview_image: CDN },
  ])
  assert.deepEqual(targets.map((t) => [t.memo.id, t.replaceImage]), [['author', false], ['nocover', false], ['cdn', true]])
})

test('repair saves only useful patches and reports progress and results', async () => {
  const targets = getRepairTargets([
    { id: 'a', url: 'https://www.threads.com/share/a/', author_handle: null, preview_image: STORED },
    { id: 'b', url: 'https://www.threads.com/share/b/', author_handle: null, preview_image: STORED },
    { id: 'c', url: 'https://www.threads.com/share/c/', author_handle: null, preview_image: STORED },
  ])
  const saved: Array<[string, object]> = []
  const progress: number[] = []
  const result = await repairMemos(targets, {
    parse: async (url) => {
      if (url.endsWith('/c/')) throw new Error('offline')
      return url.endsWith('/a/') ? { author_handle: 'alice' } : { author_handle: '未知作者' }
    },
    save: async (id, patch) => { saved.push([id, patch]) },
    onProgress: (done) => progress.push(done),
  })
  assert.deepEqual(saved, [['a', { author_handle: 'alice' }]])
  assert.deepEqual(result, { fixed: 1, failed: 2 })
  assert.deepEqual(progress.sort(), [1, 2, 3])
})

test('expiring CDN covers are replaced by a stored copy', async () => {
  const saved: Array<[string, object]> = []
  await repairMemos(getRepairTargets([{ id: 'cdn', url: 'u', author_handle: 'alice', preview_image: CDN }]), {
    parse: async () => ({ author_handle: 'alice', preview_image: STORED }),
    save: async (id, patch) => { saved.push([id, patch]) },
  })
  assert.deepEqual(saved, [['cdn', { preview_image: STORED }]])
})
