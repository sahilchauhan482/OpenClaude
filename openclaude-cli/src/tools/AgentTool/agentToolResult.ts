import { z } from 'zod/v4'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { lazySchema } from '../../utils/lazySchema.js'
import type { Message as MessageType } from '../../types/message.js'
import {
  REVIEWER_AGENT_TYPE,
  VERIFICATION_AGENT_TYPE,
} from './constants.js'
import { parseReviewerResult } from './reviewerResult.js'
import { parseVerificationResult } from './verificationResult.js'

export const agentToolResultSchema = lazySchema(() =>
  z.object({
    agentId: z.string(),
    // Optional: older persisted sessions won't have this (resume replays
    // results verbatim without re-validation). Used to gate the sync
    // result trailer - one-shot built-ins skip the SendMessage hint.
    agentType: z.string().optional(),
    content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
    totalToolUseCount: z.number(),
    totalDurationMs: z.number(),
    totalTokens: z.number(),
    verification: z
      .object({
        verdict: z.enum(['PASS', 'FAIL', 'PARTIAL']),
        checkCount: z.number(),
        commandBlockCount: z.number(),
        hasEvidence: z.boolean(),
      })
      .optional(),
    reviewer: z
      .object({
        findings: z.array(
          z.object({
            severity: z.enum(['critical', 'high', 'medium', 'low']),
            location: z.string().optional(),
            problem: z.string(),
            whyItMatters: z.string().optional(),
            evidence: z.string().optional(),
          }),
        ),
        hasFindings: z.boolean(),
        openQuestions: z.array(z.string()).optional(),
        residualRisks: z.array(z.string()).optional(),
      })
      .optional(),
    usage: z.object({
      input_tokens: z.number(),
      output_tokens: z.number(),
      cache_creation_input_tokens: z.number().nullable(),
      cache_read_input_tokens: z.number().nullable(),
      server_tool_use: z
        .object({
          web_search_requests: z.number(),
          web_fetch_requests: z.number(),
        })
        .nullable(),
      service_tier: z.enum(['standard', 'priority', 'batch']).nullable(),
      cache_creation: z
        .object({
          ephemeral_1h_input_tokens: z.number(),
          ephemeral_5m_input_tokens: z.number(),
        })
        .nullable(),
    }),
  }),
)

export type AgentToolResult = z.input<ReturnType<typeof agentToolResultSchema>>

export type FinalizeAgentToolMetadata = {
  prompt: string
  resolvedAgentModel: string
  isBuiltInAgent: boolean
  startTime: number
  agentType: string
  isAsync: boolean
}

export function countToolUses(messages: MessageType[]): number {
  let count = 0
  for (const m of messages) {
    if (m.type === 'assistant') {
      for (const block of m.message.content) {
        if (block.type === 'tool_use') {
          count++
        }
      }
    }
  }
  return count
}

export function finalizeAgentTool(
  agentMessages: MessageType[],
  agentId: string,
  metadata: FinalizeAgentToolMetadata,
): AgentToolResult {
  const {
    prompt,
    resolvedAgentModel,
    isBuiltInAgent,
    startTime,
    agentType,
    isAsync,
  } = metadata

  const lastAssistantMessage = getLastAssistantMessageLocal(agentMessages)
  if (lastAssistantMessage === undefined) {
    throw new Error('No assistant messages found')
  }

  // Extract text content from the agent's response. If the final assistant
  // message is a pure tool_use block (loop exited mid-turn), fall back to
  // the most recent assistant message that has text content.
  let content = lastAssistantMessage.message.content.filter(
    _ => _.type === 'text',
  )
  if (content.length === 0) {
    for (let i = agentMessages.length - 1; i >= 0; i--) {
      const m = agentMessages[i]!
      if (m.type !== 'assistant') continue
      const textBlocks = m.message.content.filter(_ => _.type === 'text')
      if (textBlocks.length > 0) {
        content = textBlocks
        break
      }
    }
  }

  const totalTokens = getTokenCountFromUsageLocal(
    lastAssistantMessage.message.usage,
  )
  const totalToolUseCount = countToolUses(agentMessages)
  const resultText = content.map(block => block.text).join('\n')
  const verification =
    agentType === VERIFICATION_AGENT_TYPE
      ? parseVerificationResult(resultText)
      : null
  const reviewer =
    agentType === REVIEWER_AGENT_TYPE
      ? parseReviewerResult(resultText)
      : null

  logEvent('tengu_agent_tool_completed', {
    agent_type:
      agentType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    model:
      resolvedAgentModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    prompt_char_count: prompt.length,
    response_char_count: content.length,
    assistant_message_count: agentMessages.length,
    total_tool_uses: totalToolUseCount,
    duration_ms: Date.now() - startTime,
    total_tokens: totalTokens,
    is_built_in_agent: isBuiltInAgent,
    is_async: isAsync,
  })

  // Signal to inference that this subagent's cache chain can be evicted.
  const lastRequestId = lastAssistantMessage.requestId
  if (lastRequestId) {
    logEvent('tengu_cache_eviction_hint', {
      scope:
        'subagent_end' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      last_request_id:
        lastRequestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
  }

  return {
    agentId,
    agentType,
    content,
    totalDurationMs: Date.now() - startTime,
    totalTokens,
    totalToolUseCount,
    verification: verification ?? undefined,
    reviewer: reviewer ?? undefined,
    usage: lastAssistantMessage.message.usage,
  }
}

/**
 * Extract a partial result string from an agent's accumulated messages.
 * Used when an async agent is killed to preserve what it accomplished.
 * Returns undefined if no text content is found.
 */
export function extractPartialResult(
  messages: MessageType[],
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.type !== 'assistant') continue
      const text = extractTextContentLocal(m.message.content, '\n')
      if (text) {
        return text
      }
  }
  return undefined
}

function getLastAssistantMessageLocal(
  messages: MessageType[],
): MessageType | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.type === 'assistant') {
      return message
    }
  }
  return undefined
}

function extractTextContentLocal(
  content: unknown,
  separator: string,
): string | undefined {
  if (!Array.isArray(content)) {
    return undefined
  }

  const parts = content.flatMap(block => {
    if (
      typeof block === 'object' &&
      block !== null &&
      (block as { type?: unknown }).type === 'text' &&
      typeof (block as { text?: unknown }).text === 'string'
    ) {
      return [(block as { text: string }).text]
    }
    return []
  })

  return parts.length > 0 ? parts.join(separator) : undefined
}

function getTokenCountFromUsageLocal(usage: {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}): number {
  return (
    usage.input_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    usage.output_tokens
  )
}
