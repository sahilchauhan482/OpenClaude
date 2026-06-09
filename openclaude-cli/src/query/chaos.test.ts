import { expect, test } from 'bun:test'
import {
  createToolFailureLoopGuardState,
  updateToolFailureLoopGuard,
} from './toolFailureLoopGuard.js'
// @ts-ignore
import { createUnauthorizedError, createTimeoutError } from '../../../test/fixtures/failures/apiErrors.js'

function toolUse(
  id: string,
  name: string,
  input: Record<string, unknown> = {},
  caller: 'assistant' | 'user' = 'assistant',
): any {
  return {
    type: 'tool_use',
    id,
    name,
    input,
    caller,
  }
}

function toolResult(
  toolUseId: string,
  content: string,
  isError = true,
) {
  return {
    type: 'user',
    message: {
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content,
          ...(isError ? { is_error: true } : {}),
        },
      ],
    },
  }
}

test('sequential unauthorized and timeout errors trip the guard', () => {
  const state = createToolFailureLoopGuardState()

  // 1. Unauthorized
  const decision1 = updateToolFailureLoopGuard({
    state,
    toolUseBlocks: [toolUse('a', 'Edit')],
    toolResults: [toolResult('a', createUnauthorizedError().message)],
    threshold: 3,
  })
  expect(decision1.tripped).toBe(false)

  // 2. Timeout
  const decision2 = updateToolFailureLoopGuard({
    state,
    toolUseBlocks: [toolUse('b', 'Edit')],
    toolResults: [toolResult('b', createTimeoutError().message)],
    threshold: 3,
  })
  expect(decision2.tripped).toBe(false)

  // 3. Unauthorized
  const decision3 = updateToolFailureLoopGuard({
    state,
    toolUseBlocks: [toolUse('c', 'Edit')],
    toolResults: [toolResult('c', createUnauthorizedError().message)],
    threshold: 3,
  })

  // Expect guard to trip after 3 sequential failures
  expect(decision3.tripped).toBe(true)
  expect((decision3 as any).message).toContain('failed 3 times')
})

test('sequential failure and recovery resets the guard', () => {
  const state = createToolFailureLoopGuardState()

  // 1. Timeout (Failure)
  const decision1 = updateToolFailureLoopGuard({
    state,
    toolUseBlocks: [toolUse('a', 'Edit')],
    toolResults: [toolResult('a', createTimeoutError().message, true)],
    threshold: 3,
  })
  expect(decision1.tripped).toBe(false)
  expect(state.signatureCounts.size).toBe(1)
  expect(state.categoryCounts.size).toBe(1)

  // 2. Retry (Success)
  const decision2 = updateToolFailureLoopGuard({
    state,
    toolUseBlocks: [toolUse('a', 'Edit')],
    toolResults: [toolResult('a', 'Success', false)],
    threshold: 3,
  })
  expect(decision2.tripped).toBe(false)
  expect(state.signatureCounts.size).toBe(0)
  expect(state.categoryCounts.size).toBe(0)

  // 3. Unauthorized (Failure)
  const decision3 = updateToolFailureLoopGuard({
    state,
    toolUseBlocks: [toolUse('b', 'Edit')],
    toolResults: [toolResult('b', createUnauthorizedError().message, true)],
    threshold: 3,
  })
  expect(decision3.tripped).toBe(false)
  expect(state.signatureCounts.size).toBe(1)
  expect(state.categoryCounts.size).toBe(1)

  // 4. Re-auth (Success)
  const decision4 = updateToolFailureLoopGuard({
    state,
    toolUseBlocks: [toolUse('b', 'Edit')],
    toolResults: [toolResult('b', 'Success', false)],
    threshold: 3,
  })
  expect(decision4.tripped).toBe(false)
  expect(state.signatureCounts.size).toBe(0)
  expect(state.categoryCounts.size).toBe(0)
})

test('sequential Timeout -> Retry (success) -> Unauthorized -> Re-auth (success) -> Success', () => {
  const state = createToolFailureLoopGuardState()
  const threshold = 3

  // 1. Timeout (Failure)
  const decision1 = updateToolFailureLoopGuard({
    state,
    toolUseBlocks: [toolUse('a', 'Edit')],
    toolResults: [toolResult('a', createTimeoutError().message, true)],
    threshold,
  })
  expect(decision1.tripped).toBe(false)
  expect(state.signatureCounts.size).toBeGreaterThan(0)
  expect(state.categoryCounts.size).toBeGreaterThan(0)

  // 2. Retry (Success)
  const decision2 = updateToolFailureLoopGuard({
    state,
    toolUseBlocks: [toolUse('a', 'Edit')],
    toolResults: [toolResult('a', 'Success', false)],
    threshold,
  })
  expect(decision2.tripped).toBe(false)
  expect(state.signatureCounts.size).toBe(0)
  expect(state.categoryCounts.size).toBe(0)

  // 3. Unauthorized (Failure)
  const decision3 = updateToolFailureLoopGuard({
    state,
    toolUseBlocks: [toolUse('b', 'Edit')],
    toolResults: [toolResult('b', createUnauthorizedError().message, true)],
    threshold,
  })
  expect(decision3.tripped).toBe(false)
  expect(state.signatureCounts.size).toBeGreaterThan(0)
  expect(state.categoryCounts.size).toBeGreaterThan(0)

  // 4. Re-auth (Success)
  const decision4 = updateToolFailureLoopGuard({
    state,
    toolUseBlocks: [toolUse('b', 'Edit')],
    toolResults: [toolResult('b', 'Success', false)],
    threshold,
  })
  expect(decision4.tripped).toBe(false)
  expect(state.signatureCounts.size).toBe(0)
  expect(state.categoryCounts.size).toBe(0)

  // 5. Success
  const decision5 = updateToolFailureLoopGuard({
    state,
    toolUseBlocks: [toolUse('c', 'Edit')],
    toolResults: [toolResult('c', 'Success', false)],
    threshold,
  })
  expect(decision5.tripped).toBe(false)
  expect(state.signatureCounts.size).toBe(0)
  expect(state.categoryCounts.size).toBe(0)
})
