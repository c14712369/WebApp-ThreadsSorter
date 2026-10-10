import assert from 'node:assert/strict'
import test from 'node:test'
import { hasNewerVersion } from './app-version'

test('flags an update when the deployed version differs from the running one', () => {
  assert.equal(hasNewerVersion('a5c6a7a', 'a9e6f9e'), true)
})

test('same version is up to date', () => {
  assert.equal(hasNewerVersion('a9e6f9e', 'a9e6f9e'), false)
})

test('never flags when either side is unknown', () => {
  assert.equal(hasNewerVersion('a9e6f9e', ''), false)
  assert.equal(hasNewerVersion('a9e6f9e', null), false)
  assert.equal(hasNewerVersion('', 'a9e6f9e'), false)
})

test('local dev builds never nag about updates', () => {
  assert.equal(hasNewerVersion('dev', 'a9e6f9e'), false)
})
