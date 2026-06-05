import { describe, expect, test } from 'bun:test'

import { parseVerificationResult } from './verificationResult.js'

describe('parseVerificationResult', () => {
  test('parses PASS verdict with evidence counts', () => {
    const parsed = parseVerificationResult(`
### Check: build
**Command run:**
  bun test
**Output observed:**
  ok
**Result: PASS**

VERDICT: PASS
`)

    expect(parsed).toEqual({
      verdict: 'PASS',
      checkCount: 1,
      commandBlockCount: 1,
      hasEvidence: true,
    })
  })

  test('returns null when verifier verdict is missing', () => {
    expect(parseVerificationResult('No final verdict here')).toBeNull()
  })
})
