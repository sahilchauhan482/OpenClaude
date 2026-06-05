import type { Message } from '../types/message.js'
import {
  parseVerificationResult,
  type ParsedVerificationResult,
} from '../tools/AgentTool/verificationResult.js'

export const MAX_VERIFICATION_COMPLETION_REMINDERS = 2
export const VERIFICATION_COMPLETION_REMINDER_PREFIX =
  'Verification gate:'

const COMPLETION_CLAIM_PATTERN =
  /\b(done|finished|completed|complete|all set|ready to ship|fully implemented|verified and done|task is complete)\b/i
const FINAL_SUMMARY_PATTERN =
  /\b(final summary|summary:|in summary|overall|what i changed|what was done|implemented|fixed|resolved)\b/i

type VerificationStatus = ParsedVerificationResult & {
  state: 'pass' | 'fail' | 'partial' | 'weak_pass'
}

export type VerificationCompletionGateDecision =
  | { shouldContinue: false }
  | {
      shouldContinue: true
      instruction: string
      verification: VerificationStatus
    }
  | {
      shouldContinue: false
      exhaustedMessage: string
      verification: VerificationStatus
    }

export function getVerificationCompletionGateDecision({
  messages,
  assistantText,
}: {
  messages: Message[]
  assistantText: string
}): VerificationCompletionGateDecision {
  const verification = getLatestVerificationStatus(messages)
  if (!verification) {
    return { shouldContinue: false }
  }

  if (verification.state === 'pass') {
    return { shouldContinue: false }
  }

  const reminderCount = countVerificationCompletionReminders(messages)
  const completionClaimed =
    COMPLETION_CLAIM_PATTERN.test(assistantText) ||
    FINAL_SUMMARY_PATTERN.test(assistantText)
  const baseInstruction = buildInstruction(verification, completionClaimed)

  if (reminderCount >= MAX_VERIFICATION_COMPLETION_REMINDERS) {
    return {
      shouldContinue: false,
      verification,
      exhaustedMessage:
        `${baseInstruction} ` +
        `OpenClaude stopped after repeated completion-gate reminders instead of silently accepting the unsupported completion claim.`,
    }
  }

  return {
    shouldContinue: true,
    verification,
    instruction: `${VERIFICATION_COMPLETION_REMINDER_PREFIX} ${baseInstruction}`,
  }
}

function getLatestVerificationStatus(
  messages: Message[],
): VerificationStatus | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as {
      toolUseResult?: { verification?: ParsedVerificationResult }
      message?: { content?: unknown[] }
    }

    const structuredVerification = message.toolUseResult?.verification
    if (isParsedVerificationResult(structuredVerification)) {
      return withState(structuredVerification)
    }

    const parsedVerification = parseVerificationResult(
      extractMessageText(message.message?.content),
    )
    if (parsedVerification) {
      return withState(parsedVerification)
    }
  }

  return null
}

function withState(
  verification: ParsedVerificationResult,
): VerificationStatus | null {
  if (verification.verdict === 'FAIL') {
    return { ...verification, state: 'fail' }
  }
  if (verification.verdict === 'PARTIAL') {
    return { ...verification, state: 'partial' }
  }
  if (!verification.hasEvidence) {
    return { ...verification, state: 'weak_pass' }
  }
  return verification.verdict === 'PASS'
    ? { ...verification, state: 'pass' }
    : null
}

function buildInstruction(
  verification: VerificationStatus,
  completionClaimed: boolean,
): string {
  const prefix = completionClaimed
    ? 'Do not finalize this task yet.'
    : 'Do not stop here yet.'

  if (verification.state === 'fail') {
    return `${prefix} The latest independent verification verdict was FAIL. Fix the reported problems, rerun verification, and only then report completion.`
  }

  if (verification.state === 'partial') {
    return `${prefix} The latest independent verification verdict was PARTIAL. Finish the missing verification work or clearly separate verified vs unverified scope before reporting back.`
  }

  if (verification.state === 'weak_pass') {
    return `${prefix} The latest independent verification verdict was PASS without enough command evidence. Treat verification as incomplete, gather command-backed evidence, and rerun verification before claiming success.`
  }

  return `${prefix} Verification is already complete.`
}

function countVerificationCompletionReminders(messages: Message[]): number {
  let count = 0

  for (const message of messages) {
    const record = message as { message?: { content?: unknown } }
    const content = record.message?.content
    if (typeof content === 'string') {
      if (content.includes(VERIFICATION_COMPLETION_REMINDER_PREFIX)) {
        count += 1
      }
      continue
    }

    if (!Array.isArray(content)) {
      continue
    }

    const text = extractMessageText(content)
    if (text.includes(VERIFICATION_COMPLETION_REMINDER_PREFIX)) {
      count += 1
    }
  }

  return count
}

function extractMessageText(content: unknown[] | undefined): string {
  if (!Array.isArray(content)) {
    return ''
  }

  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') {
      continue
    }

    const record = block as {
      type?: string
      text?: string
      content?: string | Array<{ type?: string; text?: string }>
    }

    if (record.type === 'text' && typeof record.text === 'string') {
      parts.push(record.text)
      continue
    }

    if (record.type === 'tool_result') {
      if (typeof record.content === 'string') {
        parts.push(record.content)
        continue
      }

      if (Array.isArray(record.content)) {
        for (const inner of record.content) {
          if (inner?.type === 'text' && typeof inner.text === 'string') {
            parts.push(inner.text)
          }
        }
      }
    }
  }

  return parts.join('\n')
}

function isParsedVerificationResult(
  value: ParsedVerificationResult | undefined,
): value is ParsedVerificationResult {
  return (
    value !== undefined &&
    (value.verdict === 'PASS' ||
      value.verdict === 'FAIL' ||
      value.verdict === 'PARTIAL') &&
    typeof value.checkCount === 'number' &&
    typeof value.commandBlockCount === 'number' &&
    typeof value.hasEvidence === 'boolean'
  )
}
