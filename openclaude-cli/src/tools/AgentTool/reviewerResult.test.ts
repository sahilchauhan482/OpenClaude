import { describe, expect, test } from 'bun:test'

import { parseReviewerResult } from './reviewerResult.js'

describe('parseReviewerResult', () => {
  test('parses severity-ranked findings with structured fields', () => {
    const parsed = parseReviewerResult(`
## Findings
1. [high] src/query.ts:120
   Problem: completion gate skips failed verification
   Why it matters: the agent can falsely claim success
   Evidence: reproduced with failing verifier output

## Open Questions
`)

    expect(parsed).toEqual({
      hasFindings: true,
      findings: [
        {
          severity: 'high',
          location: 'src/query.ts:120',
          problem: 'completion gate skips failed verification',
          whyItMatters: 'the agent can falsely claim success',
          evidence: 'reproduced with failing verifier output',
        },
      ],
      openQuestions: undefined,
      residualRisks: undefined,
    })
  })

  test('parses explicit clean reviews', () => {
    expect(
      parseReviewerResult(`
## Findings
No actionable findings.

## Open Questions
- Did we exercise the retry path?

## Residual Risk
Limited manual verification.
`),
    ).toEqual({
      findings: [],
      hasFindings: false,
      openQuestions: ['Did we exercise the retry path?'],
      residualRisks: ['Limited manual verification.'],
    })
  })

  test('returns null when findings section is missing', () => {
    expect(parseReviewerResult('No findings heading here')).toBeNull()
  })
})
