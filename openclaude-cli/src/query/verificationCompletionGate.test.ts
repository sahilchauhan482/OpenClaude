import { describe, expect, test } from 'bun:test'

import { createUserMessage } from '../utils/messages.js'
import {
  getVerificationCompletionGateDecision,
  MAX_VERIFICATION_COMPLETION_REMINDERS,
  VERIFICATION_COMPLETION_REMINDER_PREFIX,
} from './verificationCompletionGate.js'

describe('verification completion gate', () => {
  test('requires continuation when latest structured verification failed', () => {
    const messages = [
      createUserMessage({
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-1',
            is_error: false,
            content: [{ type: 'text', text: 'VERDICT: FAIL' }],
          },
        ],
        toolUseResult: {
          verification: {
            verdict: 'FAIL',
            checkCount: 2,
            commandBlockCount: 2,
            hasEvidence: true,
          },
        },
      }),
    ]

    const decision = getVerificationCompletionGateDecision({
      messages: messages as never,
      assistantText: 'All done, the task is complete.',
    })

    expect(decision.shouldContinue).toBe(true)
    if (decision.shouldContinue) {
      expect(decision.instruction).toContain(VERIFICATION_COMPLETION_REMINDER_PREFIX)
      expect(decision.instruction).toContain('verdict was FAIL')
    }
  })

  test('requires continuation when latest verification pass lacks evidence', () => {
    const messages = [
      createUserMessage({
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-2',
            is_error: false,
            content: [{ type: 'text', text: 'VERDICT: PASS' }],
          },
        ],
        toolUseResult: {
          verification: {
            verdict: 'PASS',
            checkCount: 1,
            commandBlockCount: 0,
            hasEvidence: false,
          },
        },
      }),
    ]

    const decision = getVerificationCompletionGateDecision({
      messages: messages as never,
      assistantText: 'Here is my final summary.',
    })

    expect(decision.shouldContinue).toBe(true)
    if (decision.shouldContinue) {
      expect(decision.instruction).toContain('PASS without enough command evidence')
    }
  })

  test('treats final-summary style text as a completion attempt', () => {
    const messages = [
      createUserMessage({
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-2b',
            is_error: false,
            content: [{ type: 'text', text: 'VERDICT: PARTIAL' }],
          },
        ],
        toolUseResult: {
          verification: {
            verdict: 'PARTIAL',
            checkCount: 1,
            commandBlockCount: 1,
            hasEvidence: true,
          },
        },
      }),
    ]

    const decision = getVerificationCompletionGateDecision({
      messages: messages as never,
      assistantText: 'Final summary: implemented the fix and updated tests.',
    })

    expect(decision.shouldContinue).toBe(true)
    if (decision.shouldContinue) {
      expect(decision.instruction).toContain('Do not finalize this task yet.')
    }
  })

  test('does not gate clean verification pass', () => {
    const messages = [
      createUserMessage({
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-3',
            is_error: false,
            content: [{ type: 'text', text: 'VERDICT: PASS' }],
          },
        ],
        toolUseResult: {
          verification: {
            verdict: 'PASS',
            checkCount: 2,
            commandBlockCount: 2,
            hasEvidence: true,
          },
        },
      }),
    ]

    const decision = getVerificationCompletionGateDecision({
      messages: messages as never,
      assistantText: 'All done.',
    })

    expect(decision).toEqual({ shouldContinue: false })
  })

  test('falls back to parsed tool_result text when structured metadata is absent', () => {
    const messages = [
      createUserMessage({
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-4',
            is_error: false,
            content: [
              { type: 'text', text: '### Check: smoke' },
              { type: 'text', text: '**Command run:**' },
              { type: 'text', text: 'VERDICT: PARTIAL' },
            ],
          },
        ],
      }),
    ]

    const decision = getVerificationCompletionGateDecision({
      messages: messages as never,
      assistantText: 'Stopping here.',
    })

    expect(decision.shouldContinue).toBe(true)
    if (decision.shouldContinue) {
      expect(decision.instruction).toContain('verdict was PARTIAL')
    }
  })

  test('returns exhausted warning after repeated reminders', () => {
    const messages = [
      createUserMessage({
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tool-5',
            is_error: false,
            content: [{ type: 'text', text: 'VERDICT: FAIL' }],
          },
        ],
        toolUseResult: {
          verification: {
            verdict: 'FAIL',
            checkCount: 1,
            commandBlockCount: 1,
            hasEvidence: true,
          },
        },
      }),
      ...Array.from({ length: MAX_VERIFICATION_COMPLETION_REMINDERS }, () =>
        createUserMessage({
          content: `${VERIFICATION_COMPLETION_REMINDER_PREFIX} continue`,
          isMeta: true,
        }),
      ),
    ]

    const decision = getVerificationCompletionGateDecision({
      messages: messages as never,
      assistantText: 'Task complete.',
    })

    expect(decision.shouldContinue).toBe(false)
    if ('exhaustedMessage' in decision) {
      expect(decision.exhaustedMessage).toContain(
        'stopped after repeated completion-gate reminders',
      )
    } else {
      throw new Error('expected exhausted warning')
    }
  })
})
