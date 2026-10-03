import assert from 'node:assert/strict'
import test from 'node:test'
import { createRefreshQueue, markAutoRefreshed, shouldAutoRefresh } from './metadata-refresh-queue'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
  }
}

const DAY = 24 * 60 * 60 * 1000

test('auto refresh runs at most once per memo per day', () => {
  const storage = memoryStorage()
  assert.equal(shouldAutoRefresh('a', 0, storage), true)
  markAutoRefreshed('a', 0, storage)
  assert.equal(shouldAutoRefresh('a', DAY - 1, storage), false)
  assert.equal(shouldAutoRefresh('b', DAY - 1, storage), true)
  assert.equal(shouldAutoRefresh('a', DAY, storage), true)
})

test('blocked storage still allows refresh instead of crashing', () => {
  const broken = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') },
  }
  assert.equal(shouldAutoRefresh('a', 0, broken), true)
  assert.doesNotThrow(() => markAutoRefreshed('a', 0, broken))
})

test('queue never runs more tasks than its limit at once', async () => {
  const queue = createRefreshQueue(2)
  let running = 0
  let peak = 0
  const task = async () => {
    running++
    peak = Math.max(peak, running)
    await new Promise((resolve) => setTimeout(resolve, 5))
    running--
  }
  await Promise.all(Array.from({ length: 6 }, () => queue.run(task)))
  assert.equal(peak, 2)
})

test('aborted tasks waiting in the queue never start', async () => {
  const queue = createRefreshQueue(1)
  const started: string[] = []
  const controller = new AbortController()
  const first = queue.run(async () => { started.push('first'); await new Promise((r) => setTimeout(r, 5)) })
  const second = queue.run(async () => { started.push('second') }, controller.signal)
  controller.abort()
  await Promise.all([first, second])
  assert.deepEqual(started, ['first'])
})
