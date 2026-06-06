import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { Tool } from '../Tool.js'
import { TOOL_SEARCH_TOOL_NAME } from '../tools/ToolSearchTool/constants.js'
import { countMcpToolTokens } from './analyzeContext.js'
import { createRequestSizeReport } from './requestSizeBreakdown.js'
import type { ContextData } from './analyzeContext.js'

const TOOL_SEARCH_ENV_KEYS = [
  'ENABLE_TOOL_SEARCH',
  'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS',
  'ANTHROPIC_BASE_URL',
  'USER_TYPE',
] as const

const originalToolSearchEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of TOOL_SEARCH_ENV_KEYS) {
    originalToolSearchEnv[key] = process.env[key]
  }
  process.env.ENABLE_TOOL_SEARCH = 'true'
  delete process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS
  delete process.env.ANTHROPIC_BASE_URL
  delete process.env.USER_TYPE
})

afterEach(() => {
  for (const key of TOOL_SEARCH_ENV_KEYS) {
    const value = originalToolSearchEnv[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
})

function makeMcpTool(name: string): Tool {
  return {
    name,
    isMcp: true,
    inputJSONSchema: { type: 'object', properties: {} },
    prompt: async () => `Prompt for ${name}`,
  } as unknown as Tool
}

function makeToolSearchTool(): Tool {
  return {
    name: TOOL_SEARCH_TOOL_NAME,
    isMcp: false,
    inputJSONSchema: { type: 'object', properties: {} },
    prompt: async () => 'Fetch deferred tools',
  } as unknown as Tool
}

const emptyPermissionContext = async () => ({ mode: 'default' }) as never
const countToolDefinitions = async () => 1_500

function makeContextData(overrides: Partial<ContextData> = {}): ContextData {
  return {
    categories: [],
    totalTokens: 0,
    maxTokens: 200_000,
    rawMaxTokens: 200_000,
    percentage: 0,
    gridRows: [],
    model: 'test-model',
    memoryFiles: [],
    mcpTools: [],
    agents: [],
    isAutoCompactEnabled: false,
    apiUsage: null,
    ...overrides,
  }
}

describe('countMcpToolTokens', () => {
  test('marks MCP tools loaded and request-size groups them by server when Tool Search is not deferred', async () => {
    const result = await countMcpToolTokens(
      [makeMcpTool('mcp__alpha__search'), makeMcpTool('mcp__beta__list')],
      emptyPermissionContext,
      { activeAgents: [] } as never,
      'test-model',
      [],
      countToolDefinitions,
    )

    expect(result.deferredToolTokens).toBe(0)
    expect(result.mcpToolDetails.every(tool => tool.isLoaded)).toBe(true)

    const report = createRequestSizeReport(
      makeContextData({
        categories: [
          {
            name: 'MCP tools',
            tokens: result.mcpToolTokens,
            color: 'permission',
          },
        ],
        mcpTools: result.mcpToolDetails,
      }),
    )
    const labels = report.contributors.map(contributor => contributor.label)

    expect(labels).toContain('MCP server alpha')
    expect(labels).toContain('MCP server beta')
    expect(labels).not.toContain('MCP tool schemas')
  })

  test('keeps deferred MCP schemas excluded from the outgoing request estimate when Tool Search is deferred', async () => {
    const result = await countMcpToolTokens(
      [
        makeToolSearchTool(),
        makeMcpTool('mcp__alpha__search'),
        makeMcpTool('mcp__beta__list'),
      ],
      emptyPermissionContext,
      { activeAgents: [] } as never,
      'test-model',
      [],
      countToolDefinitions,
    )

    expect(result.mcpToolTokens).toBe(0)
    expect(result.deferredToolTokens).toBeGreaterThan(0)
    expect(result.mcpToolDetails.every(tool => !tool.isLoaded)).toBe(true)

    const report = createRequestSizeReport(
      makeContextData({
        categories: [
          {
            name: 'MCP tools (deferred)',
            tokens: result.deferredToolTokens,
            color: 'inactive',
            isDeferred: true,
          },
        ],
        mcpTools: result.mcpToolDetails,
      }),
    )
    const labels = report.contributors.map(contributor => contributor.label)

    expect(report.estimatedTokens).toBe(0)
    expect(labels).not.toContain('MCP server alpha')
    expect(labels).not.toContain('MCP server beta')
  })
})
