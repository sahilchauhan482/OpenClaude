import { describe, expect, test } from 'bun:test'

import { getVerificationFollowupInstruction } from './verificationFollowup.js'

describe('getVerificationFollowupInstruction', () => {
  test('blocks completion on FAIL verdict', () => {
    expect(
      getVerificationFollowupInstruction({
        verdict: 'FAIL',
        checkCount: 2,
        commandBlockCount: 2,
        hasEvidence: true,
      }),
    ).toContain('Do NOT tell the user the task is complete')
  })

  test('requires caution on PARTIAL verdict', () => {
    expect(
      getVerificationFollowupInstruction({
        verdict: 'PARTIAL',
        checkCount: 1,
        commandBlockCount: 1,
        hasEvidence: true,
      }),
    ).toContain('Do NOT claim full completion')
  })

  test('requires rerun when PASS lacks enough evidence', () => {
    expect(
      getVerificationFollowupInstruction({
        verdict: 'PASS',
        checkCount: 2,
        commandBlockCount: 1,
        hasEvidence: false,
      }),
    ).toContain('Treat it as incomplete verification')
  })
})
