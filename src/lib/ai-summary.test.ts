import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSummaryPrompt, parseAiResponse } from './ai-summary'

const categories = [
  { id: 'c-tokyo', name: '東京' },
  { id: 'c-ai', name: 'AI' },
]

test('parses fenced JSON and maps the chosen category name to its id', () => {
  const text = '```json\n{"summary":"上野炸豬排","tags":["東京","美食"],"category":"東京"}\n```'
  assert.deepEqual(parseAiResponse(text, categories), {
    summary: '上野炸豬排',
    tags: ['東京', '美食'],
    categoryId: 'c-tokyo',
  })
})

test('category matching ignores case and surrounding spaces', () => {
  const text = '{"summary":"s","tags":[],"category":" ai "}'
  assert.equal(parseAiResponse(text, categories)?.categoryId, 'c-ai')
})

test('returns null category when AI picks null or a name that does not exist', () => {
  assert.equal(parseAiResponse('{"summary":"s","tags":[],"category":null}', categories)?.categoryId, null)
  assert.equal(parseAiResponse('{"summary":"s","tags":[],"category":"韓國"}', categories)?.categoryId, null)
  assert.equal(parseAiResponse('{"summary":"s","tags":[]}', categories)?.categoryId, null)
})

test('returns null when the response has no JSON', () => {
  assert.equal(parseAiResponse('抱歉，我無法處理', categories), null)
})

test('drops non-string tags', () => {
  assert.deepEqual(parseAiResponse('{"summary":"s","tags":["a",1,null]}', [])?.tags, ['a'])
})

test('prompt lists category names only when categories exist', () => {
  const withCats = buildSummaryPrompt({ url: 'u', snippet: '真的好喜歡京都 下次一定要多待幾天', title: 'a' }, categories)
  assert.match(withCats, /東京/)
  assert.match(withCats, /"category"/)
  const noCats = buildSummaryPrompt({ url: 'u', snippet: '真的好喜歡京都 下次一定要多待幾天', title: 'a' }, [])
  assert.doesNotMatch(noCats, /"category"/)
})
