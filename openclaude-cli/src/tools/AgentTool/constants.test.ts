import { describe, expect, test } from 'bun:test'

import {
  ONE_SHOT_BUILTIN_AGENT_TYPES,
  REVIEWER_AGENT_TYPE,
  VERIFICATION_AGENT_TYPE,
} from './constants.js'

describe('AgentTool constants', () => {
  test('keeps verification and reviewer specialists in one-shot built-ins', () => {
    expect(ONE_SHOT_BUILTIN_AGENT_TYPES.has(VERIFICATION_AGENT_TYPE)).toBe(true)
    expect(ONE_SHOT_BUILTIN_AGENT_TYPES.has(REVIEWER_AGENT_TYPE)).toBe(true)
  })
})
