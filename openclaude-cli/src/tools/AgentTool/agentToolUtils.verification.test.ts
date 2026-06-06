import { describe, expect, test } from 'bun:test'

import { finalizeAgentTool } from './agentToolResult.js'
import { VERIFICATION_AGENT_TYPE } from './constants.js'

describe('finalizeAgentTool verification metadata', () => {
  test('extracts structured verification verdict for verification agent results', () => {
    const result = finalizeAgentTool(
      [
        {
          type: 'assistant',
          message: {
            id: 'msg-1',
            content: [
              {
                type: 'text',
                text: `### Check: smoke\n**Command run:**\n  bun test\n**Output observed:**\n  pass\n**Result: PASS**\n\nVERDICT: PASS`,
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
        prompt: 'verify changes',
        resolvedAgentModel: 'gpt-5',
        isBuiltInAgent: true,
        startTime: Date.now() - 100,
        agentType: VERIFICATION_AGENT_TYPE,
        isAsync: false,
      },
    )

    expect(result.verification).toEqual({
      verdict: 'PASS',
      checkCount: 1,
      commandBlockCount: 1,
      hasEvidence: true,
    })
  })
})
