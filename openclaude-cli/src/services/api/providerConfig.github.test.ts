import { afterEach, beforeEach, expect, test } from 'bun:test'
import { acquireSharedMutationLock, releaseSharedMutationLock } from '../../test/sharedMutationLock.js'

import {
  DEFAULT_GITHUB_MODELS_API_MODEL,
  GITHUB_COPILOT_BASE_URL,
  GITHUB_MODELS_BASE_URL,
  normalizeGithubModelsApiModel,
  resolveProviderRequest,
} from './providerConfig.js'

const ENV_KEYS = [
  'CLAUDE_CODE_USE_GITHUB',
  'CLAUDE_CODE_USE_OPENAI',
  'OPENAI_MODEL',
  'OPENAI_BASE_URL',
  'OPENAI_API_BASE',
  'OPENAI_API_FORMAT',
] as const

const originalEnv: Record<string, string | undefined> = {}

beforeEach(async () => {
  await acquireSharedMutationLock('providerConfig.github.test.ts')
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  try {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = originalEnv[key]
      }
    }
  } finally {
    releaseSharedMutationLock()
  }
})

test.each([
  ['copilot', DEFAULT_GITHUB_MODELS_API_MODEL],
  ['github:copilot', DEFAULT_GITHUB_MODELS_API_MODEL],
  ['', DEFAULT_GITHUB_MODELS_API_MODEL],
  ['github:gpt-4o', 'gpt-4o'],
  ['gpt-4o', 'gpt-4o'],
  ['github:copilot?reasoning=high', DEFAULT_GITHUB_MODELS_API_MODEL],
  // normalizeGithubModelsApiModel preserves provider prefix for models.github.ai compatibility
  ['github:openai/gpt-4.1', 'openai/gpt-4.1'],
  ['openai/gpt-4.1', 'openai/gpt-4.1'],
] as const)('normalizeGithubModelsApiModel(%s) -> %s', (input, expected) => {
  expect(normalizeGithubModelsApiModel(input)).toBe(expected)
})

test('resolveProviderRequest applies GitHub normalization when CLAUDE_CODE_USE_GITHUB=1', () => {
  process.env.CLAUDE_CODE_USE_GITHUB = '1'
  const r = resolveProviderRequest({ model: 'github:gpt-4o' })
  expect(r.resolvedModel).toBe('gpt-4o')
  expect(r.transport).toBe('chat_completions')
})

test('resolveProviderRequest defaults GitHub mode to the GitHub Models endpoint', () => {
  process.env.CLAUDE_CODE_USE_GITHUB = '1'
  const r = resolveProviderRequest({ model: 'github:copilot' })
  expect(r.baseUrl).toBe(GITHUB_MODELS_BASE_URL)
})

test('resolveProviderRequest preserves an explicit GitHub Copilot endpoint override', () => {
  process.env.CLAUDE_CODE_USE_GITHUB = '1'
  const r = resolveProviderRequest({
    model: 'github:copilot',
    baseUrl: GITHUB_COPILOT_BASE_URL,
  })
  expect(r.baseUrl).toBe(GITHUB_COPILOT_BASE_URL)
})

test('resolveProviderRequest routes GitHub GPT-5 codex models to responses transport', () => {
  process.env.CLAUDE_CODE_USE_GITHUB = '1'
  const r = resolveProviderRequest({ model: 'gpt-5.3-codex' })
  expect(r.resolvedModel).toBe('gpt-5.3-codex')
  expect(r.transport).toBe('codex_responses')
})

test('resolveProviderRequest keeps gpt-5-mini on chat_completions for GitHub', () => {
  process.env.CLAUDE_CODE_USE_GITHUB = '1'
  const r = resolveProviderRequest({ model: 'gpt-5-mini' })
  expect(r.resolvedModel).toBe('gpt-5-mini')
  expect(r.transport).toBe('chat_completions')
})

test('resolveProviderRequest leaves model unchanged without GitHub flag', () => {
  delete process.env.CLAUDE_CODE_USE_GITHUB
  const r = resolveProviderRequest({ model: 'github:gpt-4o' })
  expect(r.resolvedModel).toBe('github:gpt-4o')
})
