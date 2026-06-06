import { describe, expect, test } from 'bun:test'

import { finalizeAgentTool } from './agentToolResult.js'
import { REVIEWER_AGENT_TYPE } from './constants.js'

describe('finalizeAgentTool reviewer metadata', () => {
  test('extracts structured reviewer findings for reviewer agent results', () => {
    const result = finalizeAgentTool(
      [
        {
          type: 'assistant',
          message: {
            id: 'msg-1',
            content: [
              {
                type: 'text',
                text: `## Findings
1. [medium] src/cache.ts:44
   Problem: stale cache entries survive failed refreshes
   Why it matters: users can see outdated results after an error
   Evidence: refresh path returns old state when fetch throws

## Open Questions
- Should we invalidate cache on every retry?

## Residual Risk
No end-to-end repro yet.`,
              },
            ],
            usage: {
              input_tokens: 10,
              output_tokens: 20,
              cache_creation_input_tokens: null,
              cache_read_input_tokens: null,
              server_tool_use: null,
              service_tier: null,
              cache_creation: null,
            },
          },
        },
      ] as any,
      'agent-1',
      {
        prompt: 'review changes',
        resolvedAgentModel: 'gpt-5',
        isBuiltInAgent: true,
        startTime: Date.now() - 100,
        agentType: REVIEWER_AGENT_TYPE,
        isAsync: false,
      },
    )

    expect(result.reviewer).toEqual({
      hasFindings: true,
      findings: [
        {
          severity: 'medium',
          location: 'src/cache.ts:44',
          problem: 'stale cache entries survive failed refreshes',
          whyItMatters: 'users can see outdated results after an error',
          evidence: 'refresh path returns old state when fetch throws',
        },
      ],
      openQuestions: ['Should we invalidate cache on every retry?'],
      residualRisks: ['No end-to-end repro yet.'],
    })
  })
})
