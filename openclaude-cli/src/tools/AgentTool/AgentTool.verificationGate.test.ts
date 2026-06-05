import { describe, expect, test } from 'bun:test'

import { AgentTool } from './AgentTool.js'
import { REVIEWER_AGENT_TYPE, VERIFICATION_AGENT_TYPE } from './constants.js'

describe('AgentTool verification gate messaging', () => {
  test('appends fail gate instructions to verification agent results', () => {
    const result = AgentTool.mapToolResultToToolResultBlockParam(
      {
        status: 'completed',
        prompt: 'verify this',
        agentId: 'agent-1',
        agentType: VERIFICATION_AGENT_TYPE,
        content: [{ type: 'text', text: 'VERDICT: FAIL' }],
        totalToolUseCount: 2,
        totalDurationMs: 500,
        totalTokens: 100,
        verification: {
          verdict: 'FAIL',
          checkCount: 1,
          commandBlockCount: 1,
          hasEvidence: true,
        },
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
          server_tool_use: null,
          service_tier: null,
          cache_creation: null,
        },
      } as any,
      'tool-use-1',
    )

    expect(result.type).toBe('tool_result')
    expect(result.content).toEqual([
      { type: 'text', text: 'VERDICT: FAIL' },
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining(
          'Do NOT tell the user the task is complete',
        ),
      }),
    ])
    expect(result).toMatchObject({
      _meta: {
        agentType: VERIFICATION_AGENT_TYPE,
        verification: {
          verdict: 'FAIL',
          checkCount: 1,
          commandBlockCount: 1,
          hasEvidence: true,
        },
      },
    })
  })

  test('attaches reviewer metadata for reviewer one-shot results', () => {
    const result = AgentTool.mapToolResultToToolResultBlockParam(
      {
        status: 'completed',
        prompt: 'review this',
        agentId: 'agent-2',
        agentType: REVIEWER_AGENT_TYPE,
        content: [{ type: 'text', text: '## Findings\nNo actionable findings.' }],
        totalToolUseCount: 1,
        totalDurationMs: 200,
        totalTokens: 50,
        reviewer: {
          hasFindings: false,
          findings: [],
        },
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
          server_tool_use: null,
          service_tier: null,
          cache_creation: null,
        },
      } as any,
      'tool-use-2',
    )

    expect(result).toMatchObject({
      type: 'tool_result',
      _meta: {
        agentType: REVIEWER_AGENT_TYPE,
        reviewer: {
          hasFindings: false,
          findings: [],
        },
      },
      content: [{ type: 'text', text: '## Findings\nNo actionable findings.' }],
    })
  })
})
