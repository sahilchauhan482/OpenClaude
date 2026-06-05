import { expect, mock, test } from 'bun:test'

import type { AppState } from '../../state/AppState.js'
import { getHookPolicyPackMatchers, resolveEnabledHookPolicyPacks } from './hookPolicyPacks.js'

const baseState = {} as AppState

test('resolves enabled hook policy packs uniquely and in order', () => {
  const enabled = resolveEnabledHookPolicyPacks({
    hookPolicyPacks: [
      'safe-default',
      'codebase-strict',
      'safe-default',
      'enterprise-audit',
    ],
  } as never)

  expect(enabled).toEqual([
    'safe-default',
    'codebase-strict',
    'enterprise-audit',
  ])
})

test('materializes hook matchers from enabled policy packs', () => {
  const matchers = getHookPolicyPackMatchers({
    hookPolicyPacks: ['safe-default', 'auto-format-and-test'],
  } as never)

  expect(matchers.some(m => m.packId === 'safe-default' && m.event === 'PreToolUse')).toBe(true)
  expect(matchers.some(m => m.packId === 'safe-default' && m.event === 'PostToolUseFailure')).toBe(true)
  expect(matchers.some(m => m.packId === 'auto-format-and-test' && m.event === 'PostToolUse')).toBe(true)
})

test('disabled policy packs produce no matchers', () => {
  const matchers = getHookPolicyPackMatchers(undefined)
  expect(matchers).toEqual([])
})
